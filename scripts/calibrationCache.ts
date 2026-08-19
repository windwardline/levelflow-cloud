// Durable, incremental calibration cache (round-17 hardening; R0 one-clock
// guard 2026-08-18).
//
// The old cache keyed every file to the UTC run date, so each new day
// refetched every symbol's full history — the 40-70 minute cold morning.
// This store keeps ONE rolling file per series and tops it up with only
// the bars/events newer than what it holds. Same-day A/B stays drift-free
// through anchor pins: the first run of a UTC day stamps how far the
// series reaches, and every later run that day reads exactly that slice,
// never the network.
//
// R0: every store records the CLOCK that wrote it — the normalizer's
// identity (bars.ts BAR_CLOCK for bar stores, clockWitness.ts
// CALENDAR_CLOCK for the calendar). The cache persists NORMALIZED items,
// so "top up only" means a normalizer change strands old items on the old
// clock forever; that is the exact mechanism of the 2026-08-11 mixed-clock
// corpus (naive-era 15min/daily under a true-UTC 5min). A store whose
// stamp is absent or different is REFUSED loudly, never read, never
// topped up, never silently refetched — a 3.9GB rebuild against a
// possibly-exhausted provider allowance is a decision, not a side effect.
// The rebuild procedure is docs/cache-rebuild-r0.md.
//
// The legacy date-keyed migration from r17 is gone for the same reason:
// every date-keyed file predates the clock stamp by definition, so seeding
// from one imports the defect this guard exists to stop.

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { CALENDAR_CLOCK } from "./clockWitness.ts";

export const DEFAULT_CACHE_DIR = ".calibration-cache";

// Overlap re-fetched on every top-up so a partially-formed final bar or a
// late-arriving revision in the previous pin never survives as truth.
export const TOP_UP_OVERLAP_MS = 3 * 86_400_000;

// Anchor pins kept per store; older days' pins are useless once past.
const PINS_KEPT = 5;

type RollingStore<T> = {
  clock?: string;
  items: T[];
  pinned: Record<string, number>;
};

export function mergeByTime<T>(
  existing: T[],
  incoming: T[],
  timeOf: (item: T) => number,
): T[] {
  const byTime = new Map<number, T>();
  for (const item of existing) {
    byTime.set(timeOf(item), item);
  }
  // Fresher fetch wins on collision: revisions supersede the stored copy.
  for (const item of incoming) {
    byTime.set(timeOf(item), item);
  }
  return [...byTime.values()].sort((a, b) => timeOf(a) - timeOf(b));
}

// Absent is a cold start; present-but-unreadable is a STOP. A truncated
// or corrupt store must never quietly become a full refetch — that is a
// gigabyte-scale decision per this file's header, not a side effect. The
// refusal deliberately does NOT carry the cacheClockMismatch token: the
// nightly top-up stands down only for the one named clock condition, and
// a corrupt store is a real failure that must go red (#358 minor).
async function readStore<T>(path: string): Promise<RollingStore<T> | null> {
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw new Error(
      `cacheStoreUnreadable: ${path} exists but cannot be read ` +
        `(${String(error)}) — inspect or delete it deliberately`,
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(
      `cacheStoreUnreadable: ${path} is not valid JSON — a truncated or ` +
        `corrupt store is inspected or deleted deliberately, never ` +
        `silently refetched`,
    );
  }
  const store = parsed as RollingStore<T>;
  if (
    !store || !Array.isArray(store.items) ||
    typeof store.pinned !== "object" || store.pinned === null
  ) {
    throw new Error(
      `cacheStoreUnreadable: ${path} does not have the rolling-store ` +
        `shape — inspect or delete it deliberately, never silently refetch`,
    );
  }
  return store;
}

// One rolling series: bars, calendar events — anything with a time order.
export async function loadRollingSeries<T>(input: {
  anchor: string;
  cacheDir: string;
  // The normalization identity this build writes and requires. A store
  // stamped otherwise (or never stamped — the pre-R0 mixed-clock era)
  // throws rather than loads.
  clock: string;
  fetchFull: () => Promise<T[]>;
  fetchSince: (sinceMs: number) => Promise<T[]>;
  key: string;
  timeOf: (item: T) => number;
}): Promise<T[]> {
  const { anchor, cacheDir, clock, fetchFull, fetchSince, key, timeOf } =
    input;
  await mkdir(cacheDir, { recursive: true });
  const path = `${cacheDir}/${key}.rolling.json`;

  let store = await readStore<T>(path);
  if (store && store.clock !== clock) {
    // #364 round 25, finding 3: the remedy follows the store's own
    // clock — the nightly stand-down defers to THIS line for it. A
    // calendar-clock store (treasury-rates, econ-calendar) clears by
    // deleting that one store; routing it to the 8-12h bar rebuild is
    // a remedy that cannot clear its stamp (round-14's shape).
    const remedy = clock === CALENDAR_CLOCK
      ? `delete this one rolling store and re-run — it refetches under ` +
        `the current clock; the bar-store rebuild cannot clear it`
      : `rebuild it per docs/cache-rebuild-r0.md`;
    throw new Error(
      `cacheClockMismatch: ${path} carries clock "${
        store.clock ?? "<unstamped — pre-R0 mixed-clock era>"
      }" but this build reads and writes "${clock}". The store cannot be ` +
        `read or topped up under a different normalization — ${remedy}.`,
    );
  }
  if (!store) {
    store = { clock, items: [], pinned: {} };
  }

  const pinnedThrough = store.pinned[anchor];
  if (pinnedThrough !== undefined) {
    return store.items.filter((item) => timeOf(item) <= pinnedThrough);
  }

  const lastTime = store.items.length > 0
    ? timeOf(store.items.at(-1)!)
    : null;
  const fresh = lastTime === null
    ? await fetchFull()
    : await fetchSince(lastTime - TOP_UP_OVERLAP_MS);
  store.items = mergeByTime(store.items, fresh, timeOf);
  if (store.items.length === 0) {
    // Never pin an empty series: one failed/empty provider response must
    // not cement an empty cache for the rest of the anchor day. Unpinned,
    // the next call retries the fetch.
    return [];
  }
  store.pinned[anchor] = timeOf(store.items.at(-1)!);

  const pins = Object.keys(store.pinned).sort();
  for (const stale of pins.slice(0, Math.max(0, pins.length - PINS_KEPT))) {
    delete store.pinned[stale];
  }

  // Atomic replace: a crash (or a process.exit racing a sibling write)
  // mid-writeFile would leave a torn multi-MB store — the exact corrupt
  // shape readStore refuses. Rename either completes or leaves the old
  // store intact; stray .tmp debris matches no store scan and is inert.
  const tmpPath = `${path}.tmp-${process.pid}`;
  await writeFile(tmpPath, JSON.stringify(store));
  await rename(tmpPath, path);
  const through = store.pinned[anchor];
  return store.items.filter((item) => timeOf(item) <= through);
}
