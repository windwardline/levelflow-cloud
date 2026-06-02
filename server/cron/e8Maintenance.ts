import cron from "node-cron";
import { supabaseAdmin } from "../lib/supabaseAdmin";

const E8_TIME_ZONE = process.env.E8_SERVER_TIMEZONE ?? "Europe/Prague";

function getCron(name: string, fallback: string) {
  return process.env[name] ?? fallback;
}

function getServerDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: E8_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const lookup = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${lookup.year}-${lookup.month}-${lookup.day}`;
}

function getServerHourMinute(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: E8_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hourCycle: "h23",
  }).formatToParts(date);
  const lookup = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return {
    weekday: lookup.weekday,
    minutes: Number(lookup.hour) * 60 + Number(lookup.minute),
  };
}

async function resetDailyDrawdown() {
  const tradingDay = getServerDate();

  const { error } = await supabaseAdmin
    .from("account_day_metrics")
    .update({
      open_pnl: 0,
      daily_drawdown_used: 0,
      daily_profit_pct: 0,
      auto_pause_triggered: false,
      rollover_protection_active: false,
    })
    .eq("trading_day", tradingDay);

  if (error) {
    throw error;
  }
}

async function invalidateSignaturePendingOrders() {
  const { data: accounts, error: accountError } = await supabaseAdmin
    .from("user_accounts")
    .select("id")
    .eq("program_code", "e8_signature")
    .in("status", ["evaluation", "funded", "paused"]);

  if (accountError) {
    throw accountError;
  }

  const accountIds = accounts?.map((account) => account.id) ?? [];

  if (accountIds.length === 0) {
    return;
  }

  const { error } = await supabaseAdmin
    .from("pending_orders")
    .update({
      status: "invalidated",
      invalidation_reason: "E8 Signature pending orders are invalidated at 22:45 CE(S)T.",
    })
    .in("account_id", accountIds)
    .in("status", ["generated", "placed"]);

  if (error) {
    throw error;
  }

  await createAccountNotices(
    accountIds,
    "signature_auto_closure",
    "critical",
    "Signature closure window",
    "Pending limit orders were invalidated. Close manual positions before the 23:00 CE(S)T forced liquidation window.",
  );
}

async function invalidateWeekendPendingOrders() {
  const { data: orders, error: selectError } = await supabaseAdmin
    .from("pending_orders")
    .select("account_id")
    .in("status", ["generated", "placed"]);

  if (selectError) {
    throw selectError;
  }

  const accountIds = Array.from(new Set((orders ?? []).map((order) => order.account_id)));

  const { error } = await supabaseAdmin
    .from("pending_orders")
    .update({
      status: "invalidated",
      invalidation_reason: "Weekend protection invalidated pending limit orders at Friday 22:00 CE(S)T.",
    })
    .in("status", ["generated", "placed"]);

  if (error) {
    throw error;
  }

  await createAccountNotices(
    accountIds,
    "weekend_protection",
    "critical",
    "Weekend protection",
    "All pending limit orders were invalidated at the Friday 22:00 CE(S)T protection window.",
  );
}

async function scanSpreadProtection() {
  const { minutes } = getServerHourMinute();
  const active = minutes >= 23 * 60 + 55 || minutes <= 15;

  if (!active) {
    return;
  }

  const { data: accounts, error } = await supabaseAdmin
    .from("user_accounts")
    .select("id")
    .in("status", ["evaluation", "funded", "paused"]);

  if (error) {
    throw error;
  }

  await createAccountNotices(
    accounts?.map((account) => account.id) ?? [],
    "spread_protection",
    "warning",
    "Rollover spread protection",
    "New setup generation is halted between 23:55 and 00:15 CE(S)T. Cancel pending orders exposed to rollover spread widening.",
  );
}

async function createAccountNotices(
  accountIds: string[],
  noticeType: string,
  severity: "info" | "warning" | "critical",
  title: string,
  body: string,
) {
  if (accountIds.length === 0) {
    return;
  }

  const { data: accounts, error: accountError } = await supabaseAdmin
    .from("user_accounts")
    .select("id,user_id")
    .in("id", accountIds);

  if (accountError) {
    throw accountError;
  }

  const notices = (accounts ?? []).map((account) => ({
    user_id: account.user_id,
    account_id: account.id,
    notice_type: noticeType,
    severity,
    title,
    body,
    active_from: new Date().toISOString(),
  }));

  if (notices.length === 0) {
    return;
  }

  const { error } = await supabaseAdmin.from("system_notices").insert(notices);

  if (error) {
    throw error;
  }
}

async function reviewTradeOutcomes() {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data: setups, error } = await supabaseAdmin
    .from("trade_setups")
    .select("id,user_id,account_id,confluence,created_at")
    .lt("created_at", cutoff)
    .eq("status", "generated");

  if (error) {
    throw error;
  }

  const outcomeRows =
    setups?.map((setup) => ({
      user_id: setup.user_id,
      account_id: setup.account_id,
      setup_id: setup.id,
      reviewed_at: new Date().toISOString(),
      outcome: "pending",
      feedback: {
        source: "scheduled_24h_review",
        confluence: setup.confluence,
      },
    })) ?? [];

  if (outcomeRows.length === 0) {
    return;
  }

  const { error: insertError } = await supabaseAdmin.from("trade_outcomes").upsert(outcomeRows, {
    onConflict: "setup_id",
  });

  if (insertError) {
    throw insertError;
  }
}

function scheduleTask(name: string, expression: string, task: () => Promise<void>) {
  cron.schedule(
    expression,
    () => {
      task().catch((error) => {
        console.error(`[${name}]`, error);
      });
    },
    {
      timezone: E8_TIME_ZONE,
    },
  );
}

export function startE8MaintenanceJobs() {
  scheduleTask("daily-drawdown-reset", getCron("DAILY_DRAWDOWN_RESET_CRON", "0 0 * * *"), resetDailyDrawdown);
  scheduleTask(
    "signature-auto-closure",
    getCron("SIGNATURE_AUTO_CLOSURE_CRON", "45 22 * * *"),
    invalidateSignaturePendingOrders,
  );
  scheduleTask(
    "weekend-pending-clear",
    getCron("WEEKEND_PENDING_CLEAR_CRON", "0 22 * * 5"),
    invalidateWeekendPendingOrders,
  );
  scheduleTask("spread-protection-scan", getCron("SPREAD_PROTECTION_SCAN_CRON", "*/5 * * * *"), scanSpreadProtection);
  scheduleTask("outcome-review", getCron("OUTCOME_REVIEW_CRON", "0 * * * *"), reviewTradeOutcomes);
}
