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
 * THE POPULATION IS DERIVED. `tests/fmpGovernor.test.ts` discovers every
 * script that names the provider's host and fails if one skips this module.
 *
 * THREE CLASSES SHARE ONE DAY (2026-09-16). The ledger used to be one number
 * per UTC day that every consumer compared against its own limit, so the
 * minute bank — §21c's protected consumer, whose loss alone is permanent —
 * could be refused by whatever the sweeps had spent. Now every byte is
 * recorded with its consumer:
 *
 *   - bank: never refused at a door. A 333,333,333 B/day reserve (§21c's
 *     10 GB per 30 days) is subtracted from the pool whether it is used or
 *     not, and the bank bounds each run at 512 MiB.
 *   - topup: the nightly cache top-up, 256 MiB per day.
 *   - adhoc: every sweep, probe and verifier together, 256 MiB per day unless
 *     the owner approves a raise for a run with `--daily-ceiling`.
 *
 * What this does NOT do: it does not make the desk's own live traffic cheaper.
 * That is the Edge ledger's job (`supabase/functions/trade-analyzer/fmpBudget.ts`).
 */
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { redactProviderSecrets } from "../supabase/functions/trade-analyzer/redact.ts";
import {
  type ByteBudget,
  DailyCeilingExceededError,
  LedgerUnreadableError,
  LedgerWriteError,
  type RecordMeta,
  SpendRefusedError,
  type StandDownSource,
} from "./fmpByteBudget.ts";
import {
  classifyRefusal,
  closeCircuit,
  isCircuitRefusal,
  mayCall,
  openCircuit,
  type RefusalKind,
} from "./fmpCircuit.ts";
import {
  appendRecord,
  bookkeepingFailureCount,
  createTail,
  type FmpStatePaths,
  pruneOnce,
  readRecords,
  reportBookkeepingFailure,
  reportUnreadableState,
  StateReadError,
  utcDay,
  writeJsonAtomic,
} from "./fmpState.ts";

export { REPO_ROOT } from "./fmpState.ts";

export type Consumer = "bank" | "topup" | "adhoc";
const CONSUMERS: readonly Consumer[] = ["bank", "topup", "adhoc"];

const MIB = 1024 * 1024;

/** §21c's 10 GB per 30 days, per day. Reserved whether the bank runs or not. */
export const BANK_RESERVE_BYTES_PER_DAY = 333_333_333;
/** The bank's runaway bound per run. Not a daily refusal: §21c says it cannot be refused. */
export const BANK_RUN_BOUND_BYTES = 512 * MIB;
/** Each refusable class's share of one UTC day. */
export const CLASS_DAILY_CEILING_BYTES = { adhoc: 256 * MIB, topup: 256 * MIB } as const;
/** Bank reserve plus both default class ceilings: what scripts may spend in a day. */
export const POOL =
  BANK_RESERVE_BYTES_PER_DAY + CLASS_DAILY_CEILING_BYTES.topup + CLASS_DAILY_CEILING_BYTES.adhoc;

/**
 * The base plan, in bytes. Boosts are ad-hoc and deliberately NOT modelled:
 * a ceiling that moves when someone buys more is a ceiling that teaches
 * nothing about the steady state the owner is trying to protect.
 */
export const BASE_PLAN_BYTES = 150 * 1024 * 1024 * 1024;

const DAY_MS = 86_400_000;
const encoder = new TextEncoder();

/** One line, at most `max` characters, for a log line or a breaker reason. */
export function oneLine(text: string, max = 500): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}

/**
 * Append one usage record. A pathname only, never a query string, because the
 * query carries the key. Throws when the append fails, so a caller decides
 * whether that is fatal; this never creates the ledger sentinel.
 */
export function recordUsage(
  input: { bytes: number; atMs: number; consumer: Consumer; label: string; endpointPath?: string },
  state: FmpStatePaths,
): void {
  if (!CONSUMERS.includes(input.consumer)) {
    throw new Error(`recordUsage: unknown consumer ${JSON.stringify(input.consumer)}`);
  }
  if (!Number.isFinite(input.bytes) || input.bytes <= 0) return;
  appendRecord(state.usageDir, input.atMs, {
    at: new Date(input.atMs).toISOString(),
    atMs: input.atMs,
    bytes: input.bytes,
    consumer: input.consumer,
    label: input.label,
    ...(input.endpointPath === undefined ? {} : { path: input.endpointPath }),
    pid: process.pid,
    v: 1,
  });
  pruneOnce(state.usageDir, input.atMs);
}

export type LedgerProblem = { ok: false; kind: "ledgerMissing" | "ledgerUnreadable"; detail: string };

/**
 * Does this tree have the machine's ledger?
 *
 * A scratch copy, a worktree or an extracted archive has no `.fmp-state/`, and
 * a governor reading an empty ledger there believes the allowance untouched —
 * the belief that is most expensive exactly when a sweep runs from a copy. So
 * a missing ledger refuses. The sentinel is created only from evidence that
 * this IS the machine's tree: the legacy ledger beside it.
 */
export function ensureLedger(state: FmpStatePaths): { ok: true } | LedgerProblem {
  const sentinel = join(state.usageDir, "ledger.json");
  try {
    if (existsSync(sentinel)) return { ok: true };
    if (existsSync(state.legacyUsagePath)) {
      mkdirSync(state.usageDir, { recursive: true });
      writeJsonAtomic(sentinel, { adoptedFrom: state.legacyUsagePath, at: new Date().toISOString() });
      return { ok: true };
    }
  } catch (error) {
    return {
      detail: `the FMP ledger at ${state.usageDir} could not be checked: ${
        error instanceof Error ? error.message : String(error)
      }`,
      kind: "ledgerUnreadable",
      ok: false,
    };
  }
  return {
    detail:
      `no FMP ledger at ${sentinel}: this tree has no FMP ledger (a scratch copy, ` +
      `worktree or extracted tree reads an empty one); run FMP spenders from the ` +
      `main checkout. For a deliberate start on a new machine: ` +
      `mkdir -p ${state.usageDir} && printf '{}\\n' > ${sentinel}`,
    kind: "ledgerMissing",
    ok: false,
  };
}

export type DayTotals = {
  bank: number;
  topup: number;
  adhoc: number;
  unattributed: number;
  skippedLines: number;
  legacyUnreadable: boolean;
};

const emptyDay = (): DayTotals => ({
  adhoc: 0,
  bank: 0,
  legacyUnreadable: false,
  skippedLines: 0,
  topup: 0,
  unattributed: 0,
});

/** Add records to a day's totals. An unknown consumer counts as unattributed. */
function foldRecords(totals: DayTotals, records: readonly unknown[]): void {
  for (const record of records) {
    const value = record as { bytes?: unknown; consumer?: unknown };
    if (typeof value.bytes !== "number" || !Number.isFinite(value.bytes) || value.bytes < 0) {
      totals.skippedLines += 1;
      continue;
    }
    const consumer = CONSUMERS.find((name) => name === value.consumer);
    if (consumer) totals[consumer] += value.bytes;
    else totals.unattributed += value.bytes;
  }
}

/** The legacy day total, which cannot be attributed to any consumer. */
function legacyBytes(state: FmpStatePaths, day: string): { bytes: number; unreadable: boolean } {
  let text: string;
  try {
    text = readFileSync(state.legacyUsagePath, "utf8");
  } catch (error) {
    return { bytes: 0, unreadable: (error as { code?: string }).code !== "ENOENT" };
  }
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    const value = parsed?.[day];
    return {
      bytes: typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0,
      unreadable: false,
    };
  } catch {
    return { bytes: 0, unreadable: true };
  }
}

export function readDay(
  atMs: number,
  state: FmpStatePaths,
): { ok: true; day: DayTotals } | LedgerProblem {
  const day = utcDay(atMs);
  const totals = emptyDay();
  try {
    const read = readRecords(state.usageDir, day);
    totals.skippedLines += read.skippedLines;
    foldRecords(totals, read.records);
  } catch (error) {
    if (!(error instanceof StateReadError)) throw error;
    return { detail: error.message, kind: "ledgerUnreadable", ok: false };
  }
  const legacy = legacyBytes(state, day);
  totals.unattributed += legacy.bytes;
  totals.legacyUnreadable = legacy.unreadable;
  return { day: totals, ok: true };
}

/**
 * Name what a day reading had to read as zero: skipped ledger lines, with
 * their count, and a legacy ledger that exists and could not be read.
 */
export function reportDayProblems(
  day: DayTotals,
  input: { atMs: number; state: FmpStatePaths; emit?: (line: string) => void },
): void {
  if (day.skippedLines > 0) {
    reportUnreadableState(
      `usage ledger ${join(input.state.usageDir, `${utcDay(input.atMs)}.jsonl`)}`,
      `${day.skippedLines} unreadable line(s) skipped; the bytes they carried are not counted`,
      input.emit,
    );
  }
  if (day.legacyUnreadable) {
    reportUnreadableState(
      `legacy ledger ${input.state.legacyUsagePath}`,
      "exists and could not be read; its day total counts as 0",
      input.emit,
    );
  }
}

const dayTotal = (day: DayTotals) => day.bank + day.topup + day.adhoc + day.unattributed;

/** Bytes across the trailing 30 UTC days — the window FMP bills — or null when a day is unreadable. */
export function spentTrailing30(atMs: number, state: FmpStatePaths): number | null {
  let total = 0;
  for (let back = 0; back < 30; back += 1) {
    const read = readDay(atMs - back * DAY_MS, state);
    if (!read.ok) return null;
    total += dayTotal(read.day);
  }
  return total;
}

/**
 * What a refusable class may still spend today.
 *
 * Both terms bind. The first is the class's own share. The second is the
 * pool: the bank's reserve is charged whether the bank ran or not, and bank
 * spend above its reserve is charged too, so an unusual bank day squeezes the
 * classes rather than the bank. For the top-up, ad-hoc spend counts only up
 * to its default ceiling: an owner-approved ad-hoc raise does not starve the
 * nightly top-up.
 */
export function headroomFor(
  consumer: "topup" | "adhoc",
  day: DayTotals,
  dailyCeilingBytes?: number,
): number {
  const bank = Math.max(day.bank, BANK_RESERVE_BYTES_PER_DAY);
  if (consumer === "adhoc") {
    const ceiling = dailyCeilingBytes ?? CLASS_DAILY_CEILING_BYTES.adhoc;
    return Math.min(
      ceiling - day.adhoc,
      BANK_RESERVE_BYTES_PER_DAY + CLASS_DAILY_CEILING_BYTES.topup + ceiling -
        (day.topup + day.adhoc + day.unattributed + bank),
    );
  }
  return Math.min(
    CLASS_DAILY_CEILING_BYTES.topup - day.topup,
    POOL - (day.topup + Math.min(day.adhoc, CLASS_DAILY_CEILING_BYTES.adhoc) + day.unattributed + bank),
  );
}

function assertRefusable(consumer: string, dailyCeilingBytes: number | undefined): void {
  if (consumer !== "topup" && consumer !== "adhoc") {
    throw new Error(`the governor refuses only topup and adhoc spend; got ${JSON.stringify(consumer)}`);
  }
  if (dailyCeilingBytes !== undefined) {
    if (consumer !== "adhoc") {
      throw new Error("a daily-ceiling raise is for the ad-hoc class alone; the top-up's ceiling is fixed");
    }
    if (!Number.isFinite(dailyCeilingBytes) || dailyCeilingBytes <= 0) {
      throw new Error(`a daily-ceiling raise must be a positive size; got ${String(dailyCeilingBytes)}`);
    }
  }
}

const mb = (bytes: number) => `${(bytes / 1e6).toFixed(1)} MB`;

export type SpendDecision =
  | { allowed: true; probe: boolean; keys?: string[]; day: DayTotals }
  | { allowed: false; kind: string; source: StandDownSource; reason: string };

/**
 * May a top-up or ad-hoc spender start? It never writes, except to adopt the
 * legacy ledger by writing the sentinel.
 *
 * In the order that costs least to fail: the ledger exists, the ledger reads,
 * the breaker is closed for what this run requests, and the class has room.
 */
export function maySpend(input: {
  atMs: number;
  consumer: "topup" | "adhoc";
  label: string;
  requiredPaths: readonly string[];
  dailyCeilingBytes?: number;
  state: FmpStatePaths;
  /** Where unreadable-state lines go; stderr by default. */
  emit?: (line: string) => void;
}): SpendDecision {
  assertRefusable(input.consumer, input.dailyCeilingBytes);
  const ensured = ensureLedger(input.state);
  if (!ensured.ok) {
    return { allowed: false, kind: ensured.kind, reason: `${input.label}: ${ensured.detail}`, source: "governor" };
  }
  const read = readDay(input.atMs, input.state);
  if (!read.ok) {
    return { allowed: false, kind: read.kind, reason: `${input.label}: ${read.detail}`, source: "governor" };
  }
  reportDayProblems(read.day, { atMs: input.atMs, emit: input.emit, state: input.state });
  const gate = mayCall(input.atMs, { emit: input.emit, requiredPaths: input.requiredPaths }, input.state);
  if (!gate.allowed) {
    return { allowed: false, kind: gate.kind, reason: gate.reason, source: "breaker" };
  }
  const headroom = headroomFor(input.consumer, read.day, input.dailyCeilingBytes);
  if (headroom <= 0) {
    const trailing = spentTrailing30(input.atMs, input.state);
    const { bank, topup, adhoc, unattributed } = read.day;
    return {
      allowed: false,
      kind: "dailyCeiling",
      reason:
        `${input.label}: the ${input.consumer} class has no FMP headroom left today ` +
        `(UTC ${utcDay(input.atMs)}). Spent today: bank ${mb(bank)}, topup ${mb(topup)}, ` +
        `adhoc ${mb(adhoc)}, unattributed ${mb(unattributed)}; the pool is ${mb(POOL)} ` +
        `with ${mb(BANK_RESERVE_BYTES_PER_DAY)} reserved for the minute bank. This is a ` +
        `ceiling per UTC day, not per process, so re-running does not reset it. ` +
        `Trailing 30 days: ${trailing === null ? "unreadable" : `${(trailing / 1e9).toFixed(2)} GB`}.`,
      source: "governor",
    };
  }
  return gate.probe
    ? { allowed: true, day: read.day, keys: gate.keys, probe: true }
    : { allowed: true, day: read.day, probe: false };
}

const SNAPSHOT_MAX_AGE_MS = 60_000;
const SNAPSHOT_MAX_OWN_BYTES = 16 * MIB;

/**
 * A `ByteBudget` that writes every byte to the shared ledger FIRST, closes the
 * breaker on the first answer from each endpoint, then applies the run's own
 * ceiling and the class's share of the day.
 *
 * The day check reads a snapshot of the ledger, refreshed through an
 * incremental tail every minute, every 16 MiB of this run's own spend, and at
 * the UTC day boundary — so another process's spend reaches a long run within
 * a minute without every record re-reading the day.
 */
export function governedBudget(
  inner: ByteBudget,
  options: {
    consumer: "topup" | "adhoc";
    label: string;
    dailyCeilingBytes?: number;
    state: FmpStatePaths;
    now: () => number;
    /** Where unreadable-state lines go; stderr by default. */
    emit?: (line: string) => void;
  },
): ByteBudget {
  assertRefusable(options.consumer, options.dailyCeilingBytes);
  const { state } = options;
  const answeredPaths = new Set<string>();
  const tail = createTail(state.usageDir);
  let snapshot: { day: string; takenAt: number; totals: DayTotals; legacy: number } | null = null;
  let ownSinceSnapshot = 0;

  const refresh = (atMs: number) => {
    const day = utcDay(atMs);
    try {
      const totals = snapshot && snapshot.day === day ? snapshot.totals : emptyDay();
      const read = tail.read(day);
      totals.skippedLines += read.skippedLines;
      foldRecords(totals, read.records);
      const legacy = legacyBytes(state, day);
      reportDayProblems(
        { ...totals, legacyUnreadable: legacy.unreadable },
        { atMs, emit: options.emit, state },
      );
      snapshot = { day, legacy: legacy.bytes, takenAt: atMs, totals };
      ownSinceSnapshot = 0;
    } catch (error) {
      throw new LedgerUnreadableError(
        `${options.label}: the FMP ledger could not be re-read mid-run: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  };

  return {
    record(bytes: number, meta?: RecordMeta) {
      const atMs = options.now();
      try {
        recordUsage(
          { atMs, bytes, consumer: options.consumer, endpointPath: meta?.endpointPath, label: options.label },
          state,
        );
      } catch (error) {
        reportBookkeepingFailure(`${options.label} usage record`, error);
        throw new LedgerWriteError(
          `${options.label}: ${bytes} bytes FMP already served could not be recorded: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
      if (meta && !answeredPaths.has(meta.endpointPath)) {
        try {
          closeCircuit(
            { consumer: options.consumer, endpointPath: meta.endpointPath, evidenceAtMs: meta.answeredAtMs },
            state,
          );
        } catch (error) {
          reportBookkeepingFailure(`${options.label} breaker answer`, error);
          throw new LedgerWriteError(
            `${options.label}: the provider's answer could not be recorded on the breaker: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
        answeredPaths.add(meta.endpointPath);
      }
      inner.record(bytes);
      const current = snapshot as { day: string; takenAt: number } | null;
      if (
        current === null ||
        current.day !== utcDay(atMs) ||
        atMs - current.takenAt >= SNAPSHOT_MAX_AGE_MS ||
        ownSinceSnapshot + bytes >= SNAPSHOT_MAX_OWN_BYTES
      ) {
        refresh(atMs);
      } else if (bytes > 0) {
        ownSinceSnapshot += bytes;
      }
      const taken = snapshot!;
      const totals = { ...taken.totals, unattributed: taken.totals.unattributed + taken.legacy };
      const headroom = headroomFor(options.consumer, totals, options.dailyCeilingBytes) - ownSinceSnapshot;
      if (headroom < 0) {
        throw new DailyCeilingExceededError(
          `${options.label}: the ${options.consumer} class crossed its share of the UTC day ` +
            `mid-run (${mb(-headroom)} over, counting every process). Halting before the ` +
            `next fetch; the bytes already served are in the ledger.`,
        );
      }
    },
    remaining: inner.remaining,
    spent: inner.spent,
  };
}

/** A non-ok provider answer, with its body billed, classified and redacted. */
export class ProviderRefusalError extends Error {
  readonly status: number;
  readonly kind: RefusalKind | null;
  readonly endpointPath: string;
  readonly body: string;
  readonly bytes: number;
  readonly bookkeepingFailed: boolean;

  constructor(input: {
    status: number;
    kind: RefusalKind | null;
    endpointPath: string;
    body: string;
    bytes: number;
    bookkeepingFailed: boolean;
    context?: string;
  }) {
    super(
      `FMP request failed (${input.status}) for ${input.endpointPath}${input.context ?? ""}: ${
        oneLine(input.body)
      }`,
    );
    this.name = "ProviderRefusalError";
    this.status = input.status;
    this.kind = input.kind;
    this.endpointPath = input.endpointPath;
    this.body = input.body;
    this.bytes = input.bytes;
    this.bookkeepingFailed = input.bookkeepingFailed;
  }
}

/**
 * Read, bill, classify and redact a non-ok answer, and — when `note` is set and
 * it is a wall no retry clears — record it on the shared breaker. Returns the
 * error rather than throwing it, so each site keeps its own law: the calendar
 * and bars throw it, the COT site warns.
 *
 * Classified on the RAW body, redacted before anything is stored or printed:
 * a provider echoing the request URL echoes the key.
 */
export async function providerRefusal(
  response: { status: number; text: () => Promise<string> },
  input: {
    consumer: Consumer;
    label: string;
    endpointPath: string;
    note: boolean;
    context?: string;
    atMs: number;
    state: FmpStatePaths;
  },
): Promise<ProviderRefusalError> {
  const raw = await response.text().catch(() => "");
  const bytes = encoder.encode(raw).length;
  let bookkeepingFailed = false;
  try {
    recordUsage(
      { atMs: input.atMs, bytes, consumer: input.consumer, endpointPath: input.endpointPath, label: input.label },
      input.state,
    );
  } catch (error) {
    reportBookkeepingFailure(`${input.label} refusal usage`, error);
    bookkeepingFailed = true;
  }
  const kind = classifyRefusal(raw);
  const body = redactProviderSecrets(raw.trim());
  if (input.note && kind !== null && isCircuitRefusal(raw)) {
    try {
      openCircuit(
        {
          atMs: input.atMs,
          consumer: input.consumer,
          endpointPath: input.endpointPath,
          kind,
          reason: oneLine(`HTTP ${response.status} ${body}`),
        },
        input.state,
      );
    } catch (error) {
      reportBookkeepingFailure(`${input.label} breaker refusal`, error);
      bookkeepingFailed = true;
    }
  }
  return new ProviderRefusalError({
    body,
    bookkeepingFailed,
    bytes,
    context: input.context,
    endpointPath: input.endpointPath,
    kind,
    status: response.status,
  });
}

/**
 * The minute bank's scout report: record a wall no retry clears on the shared
 * breaker. Returns the kind, or null for a refusal no wall explains.
 */
export function noteRefusal(
  detail: string,
  input: { atMs: number; endpointPath: string; consumer: Consumer },
  state: FmpStatePaths,
): RefusalKind | null {
  const kind = classifyRefusal(detail);
  if (kind !== null && isCircuitRefusal(detail)) {
    openCircuit(
      {
        atMs: input.atMs,
        consumer: input.consumer,
        endpointPath: input.endpointPath,
        kind,
        reason: oneLine(redactProviderSecrets(detail)),
      },
      state,
    );
  }
  return kind;
}

/**
 * Rethrow what no later request in this run can clear. A governor or breaker
 * refusal, a bandwidth wall, a suspension and a rejected key are final for the
 * whole account; an entitlement gap is per endpoint, so a caller probing other
 * endpoints may continue past it.
 */
export function rethrowIfFinal(error: unknown): void {
  if (error instanceof SpendRefusedError) throw error;
  if (
    error instanceof ProviderRefusalError &&
    (error.kind === "bandwidth" || error.kind === "suspended" || error.kind === "invalidKey")
  ) {
    throw error;
  }
}

/**
 * The end-of-run refusal for bookkeeping that failed on a path that kept going.
 *
 * Returns the error to throw, or null when this process reported none. The
 * count defaults to this process's own; it is a parameter so the rule can be
 * checked without reporting a failure into the test process.
 */
export function bookkeepingRefusal(
  label: string,
  failures: number = bookkeepingFailureCount(),
): LedgerWriteError | null {
  if (failures <= 0) return null;
  return new LedgerWriteError(
    `${label}: ${failures} FMP bookkeeping write(s) failed this run (each ` +
      `fmpBookkeepingFailed line above names one). The run's work is done, but ` +
      `the ledger or breaker is short by what those writes carried, so every ` +
      `later ceiling is blind to it; exiting red.`,
  );
}

/**
 * The one place the stand-down token is created. `source` is always present,
 * so `kind=bandwidth ` is always followed by a space and a shell reader can
 * match the kind exactly.
 */
export function formatStandDown(kind: string, source: StandDownSource): string {
  return `fmpStandDown: kind=${kind} source=${source}`;
}

/** The stand-down token for an error, or null when it is not a spend refusal. */
export function standDownFor(error: unknown): string | null {
  if (error instanceof SpendRefusedError) return formatStandDown(error.standDownKind, error.source);
  if (error instanceof ProviderRefusalError) return formatStandDown(error.kind ?? "unclassified", "provider");
  return null;
}
