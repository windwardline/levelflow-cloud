import { useCallback, useEffect, useState } from "react";
import { isChartTimeframe } from "../lib/marketData";
import { isProgramLine, isStage } from "../lib/broker/programs";
import {
  NO_BROKER_SELECTION,
  brokerAccountNameProblem,
  brokerAccountProblem,
  buildDefaultProfile,
  brokerSelectionProblem,
  coerceBrokerSelection,
  coerceToSupportedUsTimeZone,
  type BrokerAccount,
  type BrokerAccountDraft,
  type BrokerSelection,
  type PreferredSession,
  type ThemeMode,
  type UserProfile,
} from "../lib/profile";
import { supabase } from "../lib/supabase";

type ProfileRow = {
  active_broker_account_id: string | null;
  broker_account_size: number | string | null;
  broker_drawdown_tier: string | null;
  broker_id: string | null;
  broker_program_line: string | null;
  broker_risk_percent: number | string | null;
  broker_stage: string | null;
  default_timeframe: string | null;
  default_timezone: string | null;
  display_name: string | null;
  email: string | null;
  id: string;
  preferred_session: string | null;
  theme_preference: string | null;
};

// §19 retrofit (amendment 14). One row from broker_accounts, before
// brokerAccountProblem has had a chance to accept or drop it — the
// multi-account sibling of ProfileRow above. Every column here is `not null`
// in the schema except drawdown_tier, so the type stays honest to that rather
// than widening everything to match ProfileRow's legacy nullable columns.
type BrokerAccountRow = {
  account_size: number | string;
  broker_id: string;
  classification: string;
  display_name: string | null;
  drawdown_tier: string | null;
  id: string;
  platform: string;
  program_line: string;
  risk_percent: number | string;
  stage: string;
};

// Spec §19g: onSave widens to carry the broker selection, and the existing save
// path still writes every field on every save, so a theme-only save cannot reset a
// program selection.
type SaveProfileInput = Pick<
  UserProfile,
  | "defaultTimeframe"
  | "defaultTimezone"
  | "displayName"
  | "preferredSession"
  | "themePreference"
> & BrokerSelection;

export function useUserProfile(
  userId: string | null,
  email: string,
  onThemeChange: (mode: ThemeMode) => void,
) {
  const [profile, setProfile] = useState<UserProfile | null>(
    () => (userId ? buildDefaultProfile(userId, email) : null),
  );

  // Q2-M5: a profile and its theme are one fact, so they are applied together.
  // onThemeChange used to fire on the success path alone, while the two fallback
  // paths below set a profile without it — so a reader whose load failed, or who
  // ran without a configured client, kept whatever theme the previous render had
  // while the surface showed a profile that said otherwise.
  const applyProfile = useCallback(
    (next: UserProfile) => {
      setProfile(next);
      onThemeChange(next.themePreference);
    },
    [onThemeChange],
  );

  const refreshProfile = useCallback(async () => {
    if (!userId) {
      setProfile(null);
      return;
    }

    const fallback = buildDefaultProfile(userId, email);

    try {
      if (!supabase) {
        applyProfile(fallback);
        return;
      }

      // Both reads or neither (§19 retrofit): a profile applied beside an
      // accounts list whose own read failed would show a Broker row that came
      // from nowhere, so either query throwing lands in the one catch below.
      const [{ data, error }, { data: accountRows, error: accountsError }] =
        await Promise.all([
          supabase
            .from("profiles")
            .select(
              "id, email, display_name, default_timezone, default_timeframe, theme_preference, preferred_session, broker_id, broker_program_line, broker_account_size, broker_stage, broker_risk_percent, broker_drawdown_tier, active_broker_account_id",
            )
            .eq("id", userId)
            .maybeSingle(),
          supabase.from("broker_accounts").select("*").eq("user_id", userId),
        ]);

      if (error) {
        throw error;
      }
      if (accountsError) {
        throw accountsError;
      }

      const brokerAccounts = rowsToBrokerAccounts(
        (accountRows ?? []) as BrokerAccountRow[],
      );

      applyProfile(
        data
          ? rowToProfile(data as ProfileRow, fallback, brokerAccounts)
          : fallback,
      );
    } catch (error) {
      console.error("[profile] load failed; showing defaults", error);
      applyProfile(fallback);
    }
  }, [applyProfile, email, userId]);

  useEffect(() => {
    refreshProfile();
  }, [refreshProfile]);

  const saveProfile = useCallback(
    async (input: SaveProfileInput) => {
      if (!userId || !supabase) {
        return;
      }

      const nextProfile: UserProfile = {
        ...buildDefaultProfile(userId, email),
        ...input,
        // §19 retrofit: input (SaveProfileInput) carries the six legacy broker
        // columns but not the saved-accounts pair, because this path never
        // writes either one. Without this, spreading buildDefaultProfile's
        // empty defaults above would wipe a loaded profile's accounts and
        // active pointer from client state on every theme- or timezone-only
        // save, even though the upsert below never touches broker_accounts.
        activeBrokerAccountId: profile?.activeBrokerAccountId ?? null,
        brokerAccounts: profile?.brokerAccounts ?? [],
        defaultTimezone: coerceToSupportedUsTimeZone(input.defaultTimezone),
        displayName: input.displayName.trim(),
      };

      // §19g: the write path rejects an off-ladder size and an off-domain tier
      // rather than accepting them and silently ignoring the parts it cannot use.
      const problem = brokerSelectionProblem(nextProfile);
      if (problem) {
        throw new Error(`Broker program selection rejected: ${problem}`);
      }

      const { error } = await supabase.from("profiles").upsert({
        broker_account_size: nextProfile.brokerAccountSize,
        broker_drawdown_tier: nextProfile.brokerDrawdownTier,
        broker_id: nextProfile.brokerId,
        broker_program_line: nextProfile.brokerProgramLine,
        broker_risk_percent: nextProfile.brokerRiskPercent,
        broker_stage: nextProfile.brokerStage,
        default_timeframe: nextProfile.defaultTimeframe,
        default_timezone: nextProfile.defaultTimezone,
        display_name: nextProfile.displayName,
        email,
        id: userId,
        preferred_session: nextProfile.preferredSession,
        theme_preference: nextProfile.themePreference,
      });

      if (error) {
        throw error;
      }

      applyProfile(nextProfile);
    },
    [applyProfile, email, profile, userId],
  );

  const saveBrokerAccount = useCallback(
    async (draft: BrokerAccountDraft, id?: string): Promise<BrokerAccount> => {
      if (!userId) {
        throw new Error("Cannot save a broker account without a signed-in user.");
      }
      if (!supabase) {
        throw new Error("Supabase is not configured.");
      }

      // §19 retrofit: the multi-account sibling of saveProfile's own guard
      // above — reject a draft the catalog does not sell rather than write
      // part of it.
      const problem = brokerAccountProblem(draft);
      if (problem) {
        throw new Error(`Broker account rejected: ${problem}`);
      }

      const { data, error } = await supabase
        .from("broker_accounts")
        .upsert({
          ...(id ? { id } : {}),
          account_size: draft.accountSize,
          broker_id: draft.brokerId,
          classification: draft.classification,
          drawdown_tier: draft.drawdownTier,
          platform: draft.platform,
          program_line: draft.programLine,
          risk_percent: draft.riskPercent,
          stage: draft.stage,
          user_id: userId,
        })
        .select()
        .single();

      if (error) {
        throw error;
      }

      const result = rowToBrokerAccount(data as BrokerAccountRow);
      if (result.problem !== null) {
        // The check above already passed this exact draft, so reaching this
        // is the row surviving a round trip with a value the catalog no
        // longer accepts — worth seeing rather than trusting silently.
        throw new Error(`Broker account rejected: ${result.problem}`);
      }

      await refreshProfile();
      return result.account;
    },
    [refreshProfile, userId],
  );

  const activateBrokerAccount = useCallback(
    async (id: string) => {
      if (!userId || !supabase) {
        return;
      }

      // §19 retrofit (Task 2b, controller-authored insertion from Task 2's
      // review): the FK on active_broker_account_id proves the target row
      // EXISTS, not that it belongs to this caller — Postgres FK checks are
      // not RLS-filtered. RLS already makes a foreign row unresolvable
      // through every read path, so today's exposure was only a
      // self-inflicted dangling pointer; this closes the write side too, by
      // refusing an id this profile never saved rather than writing it and
      // finding out later. The DB-trigger owner-match is deliberately
      // deferred to the §20 governor build (schema guardrails belong there).
      if (!profile?.brokerAccounts.some((account) => account.id === id)) {
        throw new Error(
          `activateBrokerAccount: ${id} is not one of the caller's saved accounts`,
        );
      }

      const { error } = await supabase
        .from("profiles")
        .update({ active_broker_account_id: id })
        .eq("id", userId);

      if (error) {
        throw error;
      }

      await refreshProfile();
    },
    [profile, refreshProfile, userId],
  );

  const renameBrokerAccount = useCallback(
    async (id: string, name: string) => {
      if (!userId || !supabase) {
        return;
      }

      // Same ownership refusal as activateBrokerAccount above (Task 2b's
      // idiom): RLS already scopes the update, so a foreign id would be a
      // silent zero-row write — refusing it here surfaces the anomaly
      // instead of letting a rename vanish without a trace.
      if (!profile?.brokerAccounts.some((account) => account.id === id)) {
        throw new Error(
          `renameBrokerAccount: ${id} is not one of the caller's saved accounts`,
        );
      }

      const problem = brokerAccountNameProblem(name);
      if (problem) {
        throw new Error(`Broker account rename rejected: ${problem}`);
      }

      // A cleared rename (empty trim) stores null: the formula labels the
      // account again, and the DB cap constraint never sees an empty string.
      const trimmed = name.trim();
      const { error } = await supabase
        .from("broker_accounts")
        .update({ display_name: trimmed === "" ? null : trimmed })
        .eq("id", id)
        .eq("user_id", userId);

      if (error) {
        throw error;
      }

      await refreshProfile();
    },
    [profile, refreshProfile, userId],
  );

  const removeBrokerAccount = useCallback(
    async (id: string) => {
      if (!userId || !supabase) {
        return;
      }

      const { error } = await supabase
        .from("broker_accounts")
        .delete()
        .eq("id", id)
        .eq("user_id", userId);

      if (error) {
        throw error;
      }

      // The FK's on-delete-set-null clears profiles.active_broker_account_id
      // server-side when the removed row was the active one; re-reading is
      // what learns that, rather than assuming it locally.
      await refreshProfile();
    },
    [refreshProfile, userId],
  );

  // Q2-I9: two facts, both read. What used to ride along here was a
  // "idle"|"saving"|"saved" machine that re-rendered the whole App tree three
  // times per save for a value App.tsx never destructured — ProfilePanel's own
  // saveStatus prop was deleted long before (tests/mobileNav.test.ts pins its
  // absence) — plus a `loading` flag and a refreshProfile handle with no callers
  // either.
  return {
    activateBrokerAccount,
    profile,
    removeBrokerAccount,
    renameBrokerAccount,
    saveBrokerAccount,
    saveProfile,
  };
}

/**
 * A numeric column arrives as a string from PostgREST when it is wide enough to
 * lose precision as a JS number; both shapes are read here, and anything else is
 * a null rather than a NaN that would render as a number. Shared by
 * rowToProfile's six legacy columns and rowToBrokerAccount's saved-account rows.
 */
function asNumber(value: number | string | null): number | null {
  const parsed = typeof value === "string" ? Number(value) : value;
  return typeof parsed === "number" && Number.isFinite(parsed) ? parsed : null;
}

function rowToProfile(
  row: ProfileRow,
  fallback: UserProfile,
  brokerAccounts: BrokerAccount[],
): UserProfile {
  const { problem, selection } = coerceBrokerSelection({
    brokerAccountSize: asNumber(row.broker_account_size),
    brokerDrawdownTier: row.broker_drawdown_tier,
    brokerId: row.broker_id === "e8" ? "e8" : null,
    brokerProgramLine: isProgramLine(row.broker_program_line)
      ? row.broker_program_line
      : null,
    brokerRiskPercent: asNumber(row.broker_risk_percent),
    brokerStage: isStage(row.broker_stage) ? row.broker_stage : null,
  });
  if (problem) {
    // The column constraints and the write path both prevent this, so reaching it
    // is an anomaly worth seeing rather than a state worth rendering.
    console.error("[profile] broker selection ignored", problem);
  }
  return {
    ...fallback,
    ...NO_BROKER_SELECTION,
    ...selection,
    activeBrokerAccountId: row.active_broker_account_id,
    brokerAccounts,
    defaultTimeframe: isChartTimeframe(row.default_timeframe)
      ? row.default_timeframe
      : fallback.defaultTimeframe,
    defaultTimezone: coerceToSupportedUsTimeZone(
      row.default_timezone ?? fallback.defaultTimezone,
    ),
    displayName: row.display_name ?? fallback.displayName,
    email: row.email ?? fallback.email,
    preferredSession: isPreferredSession(row.preferred_session)
      ? row.preferred_session
      : fallback.preferredSession,
    themePreference: isThemeMode(row.theme_preference)
      ? row.theme_preference
      : fallback.themePreference,
  };
}

function isThemeMode(value: string | null): value is ThemeMode {
  return value === "light" || value === "dark" || value === "system";
}

function isPreferredSession(value: string | null): value is PreferredSession {
  return value === "any" || value === "asia" || value === "europe" ||
    value === "north_america" || value === "australia";
}

type BrokerAccountReadResult =
  | { account: BrokerAccount; problem: null }
  | { account: null; problem: string };

/**
 * §19 retrofit: the accounts-table sibling of rowToProfile. A raw column value
 * is cast straight into the shape brokerAccountProblem expects — never coerced
 * toward a valid-looking default — so a genuinely corrupt value fails the
 * catalog check it would otherwise dodge. NaN stands in for an unparseable
 * numeric column: it is still a `number` at the type level, and
 * brokerAccountProblem's own Number.isFinite check and ladder-membership
 * check both already reject it.
 */
function rowToBrokerAccount(row: BrokerAccountRow): BrokerAccountReadResult {
  const draft: BrokerAccountDraft = {
    accountSize: asNumber(row.account_size) ?? Number.NaN,
    brokerId: row.broker_id as BrokerAccountDraft["brokerId"],
    classification: row.classification as BrokerAccountDraft["classification"],
    drawdownTier: row.drawdown_tier,
    platform: row.platform as BrokerAccountDraft["platform"],
    programLine: row.program_line as BrokerAccountDraft["programLine"],
    riskPercent: asNumber(row.risk_percent) ?? Number.NaN,
    stage: row.stage as BrokerAccountDraft["stage"],
  };
  const problem = brokerAccountProblem(draft);
  return problem
    ? { account: null, problem }
    : {
      account: { ...draft, displayName: row.display_name, id: row.id },
      problem: null,
    };
}

/**
 * Every row this profile owns, minus whatever brokerAccountProblem rejects. A
 * rejected row is dropped rather than coerced — the column constraints and the
 * write path both prevent this already, so reaching it is an anomaly worth
 * seeing — and it can never become the active pointer, because activeAccountOf
 * only resolves ids present in the list this returns.
 */
function rowsToBrokerAccounts(rows: BrokerAccountRow[]): BrokerAccount[] {
  const accounts: BrokerAccount[] = [];
  for (const row of rows) {
    const { account, problem } = rowToBrokerAccount(row);
    if (problem) {
      console.error("[profile] broker account ignored", problem);
      continue;
    }
    accounts.push(account as BrokerAccount);
  }
  return accounts;
}
