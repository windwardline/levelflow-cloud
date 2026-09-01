/**
 * ONE CHOKEPOINT. Every script that spends FMP bandwidth goes through here.
 *
 * The owner's standing rule (2026-08-31): background work must not touch the
 * allowance unless the app genuinely needs it, the bulk of each 30-day window
 * must stay UNUSED so the desk can scale into it, and of what is spent, the
 * bulk should be live users generating real trades. That is a budget with a
 * PRIORITY ORDER, and an order cannot be enforced from four independent call
 * sites that each decide for themselves.
 *
 * WHY A CHOKEPOINT RATHER THAN FOUR CAREFUL SCRIPTS. Four is what we had.
 * Measured 2026-08-31 by searching `scripts/` for the provider's own host:
 * four spenders, of which exactly one consulted the shared breaker and exactly
 * one carried a byte budget — and the one budget was per PROCESS, so a 2 GiB ceiling meant
 * 2 GiB per launchd firing rather than per day. A careful convention that
 * covers one of four is not a control.
 *
 * AND THE UNFORESEEN ONES ARE THE POINT. A fifth spender written next month
 * cannot be caught by a list, so `tests/fmpGovernor.test.ts` DERIVES the
 * spender population from the source tree and fails if any member skips this
 * module. The population is discovered, never curated.
 *
 * What this does NOT do: it does not make the desk's own live traffic cheaper.
 * That is the bar store's job, and the two are complementary — the store
 * removes bytes nobody needed to buy, and this refuses bytes nobody budgeted.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  isBandwidthRefusal,
  mayCall,
  openCircuit,
} from "./fmpCircuit.ts";
import { type ByteBudget } from "./fmpByteBudget.ts";

/**
 * The repository root, resolved from THIS FILE rather than the process cwd.
 *
 * `.fmp-circuit.json` and the usage ledger are gitignored, so
 * `scripts/scratch-clone.sh` excludes them — and a scratch copy resolving them
 * against its own cwd reads a CLOSED breaker and an EMPTY ledger. That matters
 * before R3: a sweep run from a scratch clone would believe the allowance is
 * untouched. Anchoring to the module means every copy of the tree reads the
 * one real ledger on this machine.
 */
export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Where the daily ledger lives. Beside the breaker's marker, deliberately. */
export const FMP_USAGE_PATH = join(REPO_ROOT, ".fmp-usage.json");

/** FMP bills a trailing 30-day window; the ledger keeps enough to show it. */
export const LEDGER_DAYS = 35;

/**
 * The base plan, in bytes. Boosts are ad-hoc and deliberately NOT modelled:
 * a ceiling that moves when someone buys more is a ceiling that teaches
 * nothing about the steady state the owner is trying to protect.
 */
export const BASE_PLAN_BYTES = 150 * 1024 * 1024 * 1024;

type Ledger = Record<string, number>;

function utcDay(atMs: number): string {
  return new Date(atMs).toISOString().slice(0, 10);
}

/**
 * Read the ledger, or an empty one.
 *
 * FAILS OPEN, unlike the breaker, and the asymmetry is deliberate. An
 * unreadable breaker marker must not refuse work (a false refusal costs the
 * minute bank a day it can never recover); an unreadable ledger must not
 * INVENT spend, because a fabricated total would refuse just as wrongly. Both
 * choose the reading that does not manufacture a fact.
 */
export function readLedger(path = FMP_USAGE_PATH): Ledger {
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
    if (typeof parsed !== "object" || parsed === null) return {};
    const out: Ledger = {};
    for (const [day, bytes] of Object.entries(parsed as Ledger)) {
      if (typeof bytes === "number" && Number.isFinite(bytes) && bytes >= 0) {
        out[day] = bytes;
      }
    }
    return out;
  } catch {
    return {};
  }
}

/** Add `bytes` to today's total and prune beyond the trailing window. */
export function recordUsage(
  bytes: number,
  atMs: number,
  path = FMP_USAGE_PATH,
): Ledger {
  if (!Number.isFinite(bytes) || bytes <= 0) return readLedger(path);
  const ledger = readLedger(path);
  const day = utcDay(atMs);
  ledger[day] = (ledger[day] ?? 0) + bytes;
  for (const key of Object.keys(ledger).sort().slice(0, -LEDGER_DAYS)) {
    delete ledger[key];
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(ledger, null, 2)}\n`);
  return ledger;
}

/** Bytes spent today (UTC). */
export function spentToday(atMs: number, path = FMP_USAGE_PATH): number {
  return readLedger(path)[utcDay(atMs)] ?? 0;
}

/** Bytes spent across the trailing 30 days — the window FMP actually bills. */
export function spentTrailing30(atMs: number, path = FMP_USAGE_PATH): number {
  const ledger = readLedger(path);
  let total = 0;
  for (let back = 0; back < 30; back += 1) {
    total += ledger[utcDay(atMs - back * 86_400_000)] ?? 0;
  }
  return total;
}

export type GovernorDecision =
  | { allowed: true; probe: boolean }
  | { allowed: false; reason: string };

/**
 * May this spender proceed?
 *
 * Two gates, in the order that costs least to fail. The breaker first, because
 * answering "are we still refused?" is free and a refused window makes every
 * other question moot. Then the DAILY ceiling, which is the control the
 * per-process budget could never be.
 *
 * `dailyLimitBytes` is required and must be positive — a ceiling that reads as
 * nothing must stop the run rather than quietly meaning unlimited, the law
 * `createByteBudget` already carries.
 */
export function maySpend(input: {
  atMs: number;
  /** Overridable so a test does not read this machine's live breaker state. */
  circuitPath?: string;
  dailyLimitBytes: number;
  label: string;
  usagePath?: string;
}): GovernorDecision {
  if (!Number.isFinite(input.dailyLimitBytes) || input.dailyLimitBytes <= 0) {
    return {
      allowed: false,
      reason:
        `${input.label}: refusing a daily ceiling that reads as nothing ` +
        `(${String(input.dailyLimitBytes)}). Declare a positive limit.`,
    };
  }
  const gate = mayCall(input.atMs, input.circuitPath);
  if (!gate.allowed) return { allowed: false, reason: gate.reason };

  const today = spentToday(input.atMs, input.usagePath);
  if (today >= input.dailyLimitBytes) {
    return {
      allowed: false,
      reason:
        `${input.label}: the DAILY FMP ceiling is spent — ` +
        `${(today / 1e6).toFixed(1)} MB of ` +
        `${(input.dailyLimitBytes / 1e6).toFixed(1)} MB used today. This is a ` +
        `ceiling per UTC day, not per process, so re-running does not reset ` +
        `it. Trailing 30 days: ${(spentTrailing30(input.atMs, input.usagePath) / 1e9).toFixed(2)} GB.`,
    };
  }
  return { allowed: true, probe: gate.probe };
}

/**
 * A `ByteBudget` that also writes through to the shared daily ledger.
 *
 * The in-process ceiling stays — a single run still refuses to exceed what it
 * declared — and every byte it counts is also durable, so the next process
 * starts from the truth rather than from zero.
 */
export function governedBudget(
  inner: ByteBudget,
  atMs: () => number,
  usagePath = FMP_USAGE_PATH,
): ByteBudget {
  return {
    record(bytes: number) {
      recordUsage(bytes, atMs(), usagePath);
      inner.record(bytes);
    },
    remaining: inner.remaining,
    spent: inner.spent,
  };
}

/**
 * Record a provider refusal, opening the shared breaker when it is the wall.
 *
 * Every spender must call this on failure. The breaker is what turns one
 * consumer's discovery into every consumer's knowledge, and #493 built it for
 * exactly that — but it reached one of four spenders until this module existed.
 */
export function noteRefusal(detail: string, atMs: number): boolean {
  if (!isBandwidthRefusal(detail)) return false;
  openCircuit(detail, atMs);
  return true;
}
