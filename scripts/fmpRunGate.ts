/**
 * The run gate: skip a boot-time run that a clean run already covers.
 *
 * Both FMP launchd jobs set RunAtLoad, deliberately — the machine was off at
 * the 07:00 slot on three of five days, and a job that only fires on schedule
 * would miss them. But every boot fires both jobs, and six boots between 09-12
 * and 09-16 each did: a boot three hours after a clean run buys the same
 * overlap the next scheduled slot will buy again.
 *
 * ONE RULE, no scheduled-window special case. Skip only when a clean marker
 * exists, is not in the future, and finished at or after the most recent
 * scheduled slot: that run already covers every boot until the next slot,
 * which will run. A slot run is therefore skipped only as the duplicate of a
 * clean run that finished after that slot, on any day. The first version
 * measured a fixed 12h or 24h from the clean run to the next slot, which
 * assumed slots one horizon apart; on the spring-forward night they are 11h
 * and 23h apart, and it skipped the slot itself. On 09-16 the rule skips the
 * bank at 03:39Z and 21:36Z and runs 12:54Z and 23:20Z; it skips the top-up at
 * 03:39Z and 21:36Z and runs 12:54Z.
 *
 * It fails toward running. Anything it cannot read — the plist, the marker,
 * the flags, the store, the checkout — prints `reason=gateError` and exits 0,
 * so the wrapper runs the job. `--record-clean` fails the other way: a marker
 * it cannot place exits 1. Only a decided skip exits 75, and the wrapper also
 * requires the skip line, so no other failure that happens to exit 75 can skip
 * a run.
 *
 *   npx tsx scripts/fmpRunGate.ts --job minute-bank --dir /path/to/.minute-bank
 *   npx tsx scripts/fmpRunGate.ts --job cache-topup
 *   npx tsx scripts/fmpRunGate.ts --job cache-topup --record-clean
 */
import { readFileSync, realpathSync } from "node:fs";
import { join } from "node:path";

import { flagReader, soleFlagIndex } from "./flagReader.ts";
import {
  defaultStatePaths,
  type FmpStatePaths,
  REPO_ROOT,
  writeJsonAtomic,
} from "./fmpState.ts";
import { isEntryPoint } from "./isEntryPoint.ts";

/** EX_TEMPFAIL: outside Node's reserved 1-14 and wl-secret's 78. */
export const RUN_GATE_SKIP_EXIT = 75;

export type RunJob = "minute-bank" | "cache-topup";

/** The tracked plists, relative to the repository root. */
export const PLISTS: Record<RunJob, string> = {
  "cache-topup": "scripts/ops/com.windwardline.levelflow-cache-topup.plist",
  "minute-bank": "scripts/ops/com.windwardline.levelflow-minute-bank.plist",
};

export type Slot = { hour: number; minute: number };

/**
 * The StartCalendarInterval slots, from a single dict or an array of them.
 * Null unless every dict yields exactly one in-range Hour and Minute: a
 * schedule this cannot read must never read as an empty one.
 */
export function parseCalendarSlots(text: string): Slot[] | null {
  const segment = /<key>StartCalendarInterval<\/key>\s*(<array>[\s\S]*?<\/array>|<dict>[\s\S]*?<\/dict>)/
    .exec(text)?.[1];
  if (segment === undefined) return null;
  const dicts = (segment.match(/<dict>/g) ?? []).length;
  const slots = [
    ...segment.matchAll(
      /<key>Hour<\/key>\s*<integer>(\d+)<\/integer>\s*<key>Minute<\/key>\s*<integer>(\d+)<\/integer>/g,
    ),
  ].map((match) => ({ hour: Number(match[1]), minute: Number(match[2]) }));
  if (slots.length === 0 || slots.length !== dicts) return null;
  if (slots.some((slot) => slot.hour > 23 || slot.minute > 59)) return null;
  return slots;
}

/** Every slot instant from two local days before `nowMs` to two after, ascending. */
function slotInstants(nowMs: number, slots: readonly Slot[]): number[] {
  const now = new Date(nowMs);
  const candidates: number[] = [];
  for (let day = -2; day <= 2; day += 1) {
    for (const slot of slots) {
      candidates.push(
        new Date(now.getFullYear(), now.getMonth(), now.getDate() + day, slot.hour, slot.minute).getTime(),
      );
    }
  }
  return candidates.sort((a, b) => a - b);
}

/** The first slot strictly after `nowMs`, in this process's local time. */
export function nextSlotAfter(nowMs: number, slots: readonly Slot[]): number {
  const next = slotInstants(nowMs, slots).find((candidate) => candidate > nowMs);
  if (next === undefined) throw new Error("no slot within two days");
  return next;
}

/** The most recent slot at or before `nowMs`, in this process's local time. */
export function previousSlotAtOrBefore(nowMs: number, slots: readonly Slot[]): number {
  // `filter().at(-1)`, not `findLast`: the repo's lib target is ES2022.
  const previous = slotInstants(nowMs, slots).filter((candidate) => candidate <= nowMs).at(-1);
  if (previous === undefined) throw new Error("no slot within two days");
  return previous;
}

export type RunMarker = { atMs: number; dir?: string };

export type RunDecision = {
  action: "skip" | "run";
  reason: string;
  nextSlotMs: number | null;
};

/** First match wins; every branch but one runs. */
export function decideRun(input: {
  job: RunJob;
  nowMs: number;
  slots: Slot[] | null;
  marker: RunMarker | null;
  /** For the minute bank: the real path of the store this run would bank into. */
  dir?: string;
}): RunDecision {
  if (input.slots === null) return { action: "run", nextSlotMs: null, reason: "slotsUnreadable" };
  const nextSlotMs = nextSlotAfter(input.nowMs, input.slots);
  const { marker } = input;
  if (marker === null) return { action: "run", nextSlotMs, reason: "noCleanRun" };
  if (input.job === "minute-bank" && (input.dir === undefined || marker.dir !== input.dir)) {
    return { action: "run", nextSlotMs, reason: "markerForAnotherStore" };
  }
  if (marker.atMs > input.nowMs) return { action: "run", nextSlotMs, reason: "markerInFuture" };
  if (marker.atMs >= previousSlotAtOrBefore(input.nowMs, input.slots)) {
    return { action: "skip", nextSlotMs, reason: "cleanRunCoversNextSlot" };
  }
  return { action: "run", nextSlotMs, reason: "lastCleanRunStale" };
}

const pad = (value: number) => String(value).padStart(2, "0");

function localStamp(atMs: number): string {
  const at = new Date(atMs);
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())} ${pad(at.getHours())}:${pad(at.getMinutes())}`;
}

export function formatDecision(input: {
  job: RunJob;
  nowMs: number;
  marker: RunMarker | null;
  decision: RunDecision;
}): string {
  return (
    `runGate: ${input.decision.action} job=${input.job} ` +
    `now=${new Date(input.nowMs).toISOString()} local=${localStamp(input.nowMs)} ` +
    `lastClean=${input.marker ? new Date(input.marker.atMs).toISOString() : "none"} ` +
    `nextSlot=${input.decision.nextSlotMs === null ? "unknown" : new Date(input.decision.nextSlotMs).toISOString()} ` +
    `reason=${input.decision.reason}`
  );
}

/** The job's clean-run marker, or null when absent or unreadable. */
export function readRunMarker(runsDir: string, job: RunJob): RunMarker | null {
  try {
    const raw = JSON.parse(readFileSync(join(runsDir, `${job}.json`), "utf8")) as Record<string, unknown>;
    if (typeof raw.atMs !== "number" || !Number.isFinite(raw.atMs)) return null;
    return typeof raw.dir === "string" ? { atMs: raw.atMs, dir: raw.dir } : { atMs: raw.atMs };
  } catch {
    return null;
  }
}

export function writeRunMarker(runsDir: string, job: RunJob, marker: RunMarker): void {
  writeJsonAtomic(join(runsDir, `${job}.json`), {
    at: new Date(marker.atMs).toISOString(),
    job,
    ...marker,
  });
}

const VALUE_FLAGS = new Set(["--job", "--dir"]);

function asJob(value: string | undefined): RunJob {
  if (value === "minute-bank" || value === "cache-topup") return value;
  throw new Error(`--job must be minute-bank or cache-topup; got ${JSON.stringify(value)}`);
}

/**
 * The CLI. `state` is resolved inside the error handling, so a checkout that
 * names nothing reads as a gate error like anything else the gate cannot read.
 */
export function runGateCli(
  args: readonly string[],
  deps: { now: () => number; state: () => FmpStatePaths; repoRoot: string; print: (line: string) => void },
): number {
  const nowMs = deps.now();
  let recordClean = false;
  let job: string | undefined;
  try {
    recordClean = soleFlagIndex(args, "--record-clean") !== -1;
    const { str } = flagReader(args, VALUE_FLAGS);
    job = str("--job");
    const resolved = asJob(job);
    const state = deps.state();
    if (recordClean) {
      if (resolved !== "cache-topup") {
        throw new Error("--record-clean is for cache-topup; the minute bank writes its own marker");
      }
      writeRunMarker(state.runsDir, resolved, { atMs: nowMs });
      deps.print(`runGate: recorded clean job=${resolved} at=${new Date(nowMs).toISOString()}`);
      return 0;
    }
    const slots = parseCalendarSlots(readFileSync(join(deps.repoRoot, PLISTS[resolved]), "utf8"));
    const rawDir = str("--dir");
    if (resolved === "minute-bank" && rawDir === undefined) {
      throw new Error("--dir is required for minute-bank: a marker names the store it describes");
    }
    // A store that does not exist yet has no real path, and reads as gateError: run.
    const dir = resolved === "minute-bank" ? realpathSync(rawDir!) : undefined;
    const marker = readRunMarker(state.runsDir, resolved);
    const decision = decideRun({ dir, job: resolved, marker, nowMs, slots });
    deps.print(formatDecision({ decision, job: resolved, marker, nowMs }));
    return decision.action === "skip" ? RUN_GATE_SKIP_EXIT : 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (recordClean) {
      deps.print(`runGate: record-clean failed job=${job ?? "unknown"}: ${message}`);
      return 1;
    }
    deps.print(
      `runGate: run job=${job ?? "unknown"} now=${new Date(nowMs).toISOString()} reason=gateError: ${message}`,
    );
    return 0;
  }
}

if (isEntryPoint(import.meta.url)) {
  process.exitCode = runGateCli(process.argv.slice(2), {
    now: Date.now,
    print: (line) => console.log(line),
    repoRoot: REPO_ROOT,
    state: () => defaultStatePaths(),
  });
}
