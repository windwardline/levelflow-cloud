/**
 * The FMP state primitives, and the only module that touches `.fmp-state/`.
 *
 * WHY APPEND-ONLY. The minute bank and the cache top-up start within a second
 * of each other at every boot (09-16T03:39:42Z/43Z, 12:54:59Z, 21:36:34Z), and
 * the ledger they shared was read, added to and rewritten whole. Measured in
 * scratch with six processes of 500 writes each, that kept 93,000 and 109,000
 * of 3,000,000 bytes: every ceiling built on it was weaker by whatever it
 * lost. One framed line per record, appended, kept 3,000 of 3,000 in three of
 * three trials, and a torn fragment cost only itself.
 *
 * So nothing here reads a file in order to rewrite it. Writers append a line
 * that begins AND ends with a newline, so a fragment left by a writer that died
 * mid-line is closed off by the next writer's leading newline and reads as one
 * skipped line. Readers count only newline-terminated lines, because the final
 * unterminated segment may be a write still in flight.
 *
 * The one whole-file writer is `writeJsonAtomic`, for markers that are replaced
 * rather than accumulated, and it replaces by rename.
 */
import { randomUUID } from "node:crypto";
import {
  appendFileSync,
  closeSync,
  fstatSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  readSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { checkoutRoot } from "./checkoutState.ts";

/**
 * The repository root, resolved from THIS FILE rather than the process cwd:
 * where the CODE is, and what tracked files such as the plists are read from.
 * Under `wl-repo-script` that is the extracted tree of `origin/main`, which
 * carries no ignored state, so the state below is not resolved from it.
 */
export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

export type FmpStatePaths = {
  /** Consumer-keyed byte records, one YYYY-MM-DD.jsonl per UTC day. */
  usageDir: string;
  /** The breaker's event log, one YYYY-MM-DD.jsonl per UTC day. */
  breakerDir: string;
  /** Clean-run markers the run gate reads, one JSON file per job. */
  runsDir: string;
  /** The pre-2026-09-16 day-total ledger. Read as history, never written. */
  legacyUsagePath: string;
  /** The pre-2026-09-16 breaker marker. Read as history, never written. */
  legacyCircuitPath: string;
  /** The minute bank's one real store, which a clean-run marker must name. */
  canonicalBankDir: string;
};

/**
 * The machine's real state. Only binary entry points call this; every
 * governor function takes the paths as a required argument, so a test cannot
 * reach this machine's live ledger by forgetting to pass one.
 *
 * The root is the checkout's, through `checkoutRoot`: `LEVELFLOW_CHECKOUT`
 * when it is named, refused when it names nothing, and otherwise this module's
 * own tree, never the process cwd. The state is gitignored, so a scratch copy
 * or `wl-repo-script`'s extracted tree carries none of it. Resolved against
 * that tree, every run would read an empty ledger, a closed breaker and no
 * clean-run marker, and the run gate would re-run both jobs at every login; a
 * tree with no ledger at all is refused by the governor rather than read as
 * untouched.
 */
export function defaultStatePaths(root = checkoutRoot()): FmpStatePaths {
  return {
    breakerDir: join(root, ".fmp-state", "breaker"),
    canonicalBankDir: join(root, ".minute-bank"),
    legacyCircuitPath: join(root, ".fmp-circuit.json"),
    legacyUsagePath: join(root, ".fmp-usage.json"),
    runsDir: join(root, ".fmp-state", "runs"),
    usageDir: join(root, ".fmp-state", "usage"),
  };
}

/** FMP bills a trailing 30-day window; five more days keep it legible. */
export const RETAIN_DAYS = 35;

const DAY_MS = 86_400_000;
const DAY_FILE = /^(\d{4}-\d{2}-\d{2})\.jsonl$/;

export function utcDay(atMs: number): string {
  return new Date(atMs).toISOString().slice(0, 10);
}

/** A state file exists and could not be read. Never mapped to zero. */
export class StateReadError extends Error {
  constructor(readonly path: string, cause: unknown) {
    super(
      `FMP state at ${path} could not be read: ${
        cause instanceof Error ? cause.message : String(cause)
      }`,
    );
    this.name = "StateReadError";
  }
}

function errorCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error
    ? String((error as { code?: unknown }).code)
    : undefined;
}

/**
 * Append one record to the day file for `atMs`. Throws on failure: a record
 * that could not be written must never read as one that was.
 */
export function appendRecord(dir: string, atMs: number, record: object): void {
  mkdirSync(dir, { recursive: true });
  appendFileSync(join(dir, `${utcDay(atMs)}.jsonl`), "\n" + JSON.stringify(record) + "\n");
}

type ParsedLines = { records: unknown[]; skippedLines: number };

/** Parse the newline-terminated lines of `text`; the tail after the last newline is not consumed. */
function parseCompleteLines(text: string): ParsedLines & { consumed: number } {
  const end = text.lastIndexOf("\n");
  if (end === -1) return { consumed: 0, records: [], skippedLines: 0 };
  const records: unknown[] = [];
  let skippedLines = 0;
  // The sealed-fold census (tests/confirmFoldSealed.test.ts) finds this loop
  // and exempts this module by name, with its reason: these are the governor's
  // own state logs, never a corpus emit.
  for (const line of text.slice(0, end).split("\n")) {
    if (line.trim() === "") continue;
    try {
      const parsed = JSON.parse(line) as unknown;
      if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
        records.push(parsed);
      } else {
        skippedLines += 1;
      }
    } catch {
      skippedLines += 1;
    }
  }
  return { consumed: end + 1, records, skippedLines };
}

/**
 * Every complete record in one day file. An absent file is an empty day; any
 * other failure (a directory where the file belongs, a permission error, an
 * I/O error) throws, because a day that cannot be read is not a day on which
 * nothing was spent.
 */
export function readRecords(dir: string, day: string): ParsedLines {
  const path = join(dir, `${day}.jsonl`);
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (error) {
    if (errorCode(error) === "ENOENT") return { records: [], skippedLines: 0 };
    throw new StateReadError(path, error);
  }
  const { records, skippedLines } = parseCompleteLines(text);
  return { records, skippedLines };
}

/**
 * An incremental reader. Each `read(day)` returns only the complete records
 * appended since the previous read of that day, so a long run can refresh its
 * view of the ledger without re-reading a day it has already counted.
 */
export function createTail(dir: string) {
  const offsets = new Map<string, number>();
  return {
    read(day: string): ParsedLines {
      const path = join(dir, `${day}.jsonl`);
      const offset = offsets.get(day) ?? 0;
      let fd: number;
      try {
        fd = openSync(path, "r");
      } catch (error) {
        if (errorCode(error) === "ENOENT") return { records: [], skippedLines: 0 };
        throw new StateReadError(path, error);
      }
      try {
        const size = fstatSync(fd).size;
        if (size <= offset) return { records: [], skippedLines: 0 };
        const buffer = Buffer.alloc(size - offset);
        let filled = 0;
        while (filled < buffer.length) {
          const got = readSync(fd, buffer, filled, buffer.length - filled, offset + filled);
          if (got === 0) break;
          filled += got;
        }
        const chunk = buffer.subarray(0, filled);
        const lastNewline = chunk.lastIndexOf(0x0a);
        if (lastNewline === -1) return { records: [], skippedLines: 0 };
        const parsed = parseCompleteLines(chunk.subarray(0, lastNewline + 1).toString("utf8"));
        offsets.set(day, offset + lastNewline + 1);
        return { records: parsed.records, skippedLines: parsed.skippedLines };
      } catch (error) {
        throw new StateReadError(path, error);
      } finally {
        closeSync(fd);
      }
    },
  };
}

/**
 * Unlink day files older than today minus RETAIN_DAYS. Today, the window and
 * every file that is not a day file are never touched. A file another process
 * already removed is not an error.
 */
export function pruneDayFiles(
  dir: string,
  nowMs: number,
  unlink: (path: string) => void = unlinkSync,
): void {
  const oldestKept = utcDay(nowMs - RETAIN_DAYS * DAY_MS);
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch (error) {
    if (errorCode(error) === "ENOENT") return;
    throw error;
  }
  for (const name of names) {
    const day = DAY_FILE.exec(name)?.[1];
    if (day === undefined || day >= oldestKept) continue;
    try {
      unlink(join(dir, name));
    } catch (error) {
      if (errorCode(error) !== "ENOENT") throw error;
    }
  }
}

const prunedThisProcess = new Set<string>();

/**
 * Prune a directory at most once per process. A prune that fails is reported
 * and does not fail the write that triggered it: retention is housekeeping,
 * and the record it follows has already been written.
 */
export function pruneOnce(dir: string, nowMs: number): void {
  if (prunedThisProcess.has(dir)) return;
  prunedThisProcess.add(dir);
  try {
    pruneDayFiles(dir, nowMs);
  } catch (error) {
    console.error(
      `fmpStatePruneFailed: ${dir}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/** Replace a JSON file by rename, so a reader sees the old value or the new one. */
export function writeJsonAtomic(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
  writeFileSync(temporary, JSON.stringify(value, null, 2) + "\n");
  renameSync(temporary, path);
}

const reportedUnreadable = new Set<string>();

/**
 * The one place the unreadable-state token is created. A record a reader had
 * to skip, or a legacy file that exists and cannot be parsed, is read as zero
 * so a torn line costs only itself, and this says so by name, with the count.
 * It refuses nothing. The same line is printed once per process, so a long run
 * refreshing its view every minute names a torn history file once.
 */
export function reportUnreadableState(
  what: string,
  detail: string,
  emit: (line: string) => void = (line) => console.error(line),
): void {
  const line = `fmpStateUnreadable: ${what}: ${detail}`;
  if (reportedUnreadable.has(line)) return;
  reportedUnreadable.add(line);
  emit(line);
}

let bookkeepingFailures = 0;

/**
 * The one place the bookkeeping-failure token is created, and the one count of
 * it. Spend or breaker evidence that could not be recorded is something every
 * later ceiling is blind to, so it never ends a run green: some writers throw
 * on the spot, and a caller that warns and continues past one (the sweep's COT
 * and Treasury sites, the verifier's per-symbol probes) reads this count at the
 * end of its run through `bookkeepingRefusal` and exits 1. The nightly top-up
 * also treats the token as must-stay-red whatever the driver's exit code.
 */
export function reportBookkeepingFailure(
  what: string,
  error: unknown,
  emit: (line: string) => void = (line) => console.error(line),
): void {
  bookkeepingFailures += 1;
  emit(
    `fmpBookkeepingFailed: ${what}: ${error instanceof Error ? error.message : String(error)}`,
  );
}

/** How many bookkeeping failures this process has reported. */
export function bookkeepingFailureCount(): number {
  return bookkeepingFailures;
}
