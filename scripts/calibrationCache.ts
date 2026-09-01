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
import { CALENDAR_CLOCK, ECON_CALENDAR_CLOCK } from "./clockWitness.ts";

export const DEFAULT_CACHE_DIR = ".calibration-cache";

// Overlap re-fetched on every top-up so a partially-formed final bar or a
// late-arriving revision in the previous pin never survives as truth.
export const TOP_UP_OVERLAP_MS = 3 * 86_400_000;

// Anchor pins kept per store; older days' pins are useless once past.
const PINS_KEPT = 5;

/**
 * Anchor days pruning must NEVER evict, however old they get.
 *
 * A pinned anchor is what makes a sweep free: `loadRollingSeries` returns
 * straight from the store when `store.pinned[anchor]` exists, with zero
 * provider requests. Measured 2026-09-01 across all 290 stores in
 * `.calibration-cache`, every one of them pins 2026-08-26 and only 13 pin
 * 2026-08-27 — so R3, the ONE re-sweep the remediation program allows, costs
 * NOTHING at that anchor and makes 277 stores fetch at any later one.
 *
 * That free ride is perishable, and the ordinary prune is what spends it.
 * Pins are dropped oldest-first once a store holds more than `PINS_KEPT`;
 * stores currently hold two to four, so a few nightly top-ups take them past
 * five and 2026-08-26 goes after 2026-08-24 and 2026-08-25. The top-up is
 * standing down on the provider's 429 today, which means the eviction begins
 * the moment the allowance recovers — precisely when a sweep becomes possible
 * and precisely when nobody would think to check.
 *
 * A COMMENT IN THE HANDOFF CANNOT STOP A LAUNCHD TIMER. This list can, and it
 * is deliberately a repository constant rather than an environment variable:
 * the agent that would evict the pin runs from a plist with its own
 * environment, and a guard that depends on a shell being right is not a guard.
 *
 * REMOVE AN ENTRY ONCE ITS SWEEP HAS RUN. A protected anchor that outlives its
 * purpose is a store that never prunes, and `tests/calibrationCache.test.ts`
 * requires every entry to carry a reason so the list cannot quietly become
 * permanent.
 */
export const PROTECTED_ANCHORS: ReadonlyArray<{ day: string; why: string }> = [
  {
    day: "2026-08-26",
    why:
      "R3's zero-fetch anchor. All 290 stores pin it (measured 2026-09-01); " +
      "at any later anchor 277 of them fetch against an allowance the owner " +
      "is deliberately not topping up. Remove once R3 has run.",
  },
];

const PROTECTED_DAYS = new Set(PROTECTED_ANCHORS.map((entry) => entry.day));

type RollingStore<T> = {
  clock?: string;
  items: T[];
  pinned: Record<string, number>;
};

/**
 * Merge two runs of a series, one row per IDENTITY.
 *
 * The identity defaults to the timestamp, which is correct for every bar
 * store: two bars at one instant on one timeframe is a defect, not a pair,
 * and `intradayChunks.ts` relies on that dissolution to absorb chunk overlap.
 *
 * It is NOT correct for an economic calendar, and that cost 43% of one. A
 * calendar puts many releases on one instant — Core PPI and Initial Jobless
 * Claims are both USD/medium at 12:30, HICP and CPI both EUR/medium at 07:00
 * — so a Map keyed on the timestamp kept one survivor per instant. Measured
 * against the live store: three fetches returned 75,183 / 75,186 / 75,206
 * medium-high events; the store held 42,676 items with 42,676 distinct times.
 *
 * Last-writer-wins also chose the survivor's CURRENCY, which is the only gate
 * on which markets a scheduled event touches — so the loss was not merely an
 * undercount. And the count is load-bearing twice over in the sweep: it feeds
 * the news penalty, and any active high-impact event REJECTS the setup
 * outright, so a discarded one produces a corpus row the live engine would
 * have refused.
 *
 * `keyOf` is per-call rather than a new default, so the bar stores keep the
 * behaviour they need and only the calendar opts into a composite identity.
 */
export function mergeByTime<T>(
  existing: T[],
  incoming: T[],
  timeOf: (item: T) => number,
  keyOf: (item: T) => string | number = timeOf,
): T[] {
  const byKey = new Map<string | number, T>();
  for (const item of existing) {
    byKey.set(keyOf(item), item);
  }
  // Fresher fetch wins on collision: revisions supersede the stored copy.
  for (const item of incoming) {
    byKey.set(keyOf(item), item);
  }
  // Sorted by time first, then by identity, so a rebuilt store is byte-stable
  // and its provenance reproducible. Time alone is no longer a total order.
  return [...byKey.values()].sort((a, b) =>
    timeOf(a) - timeOf(b) || String(keyOf(a)).localeCompare(String(keyOf(b)))
  );
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
    // The parenthesized error string is safe in the nightly log only
    // because the top-up script greps cacheStoreUnreadable ahead of its
    // \(429\) quota stand-down (#364 rounds 23-24): the token outranks
    // any status-shaped fragment the wrapped error might carry.
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
  /**
   * Ignore this anchor's pin and top the series up anyway.
   *
   * The pin exists so a run is reproducible within its anchor day: once a
   * market is fetched, every later call that day returns the same tail. That
   * is right for a sweep, and wrong for the last pass of a REBUILD.
   *
   * A full rebuild spans hours — the v4 build took five attempts across a
   * night — so each market is pinned at the moment it happened to be
   * fetched, and the finished cache carries a ragged edge. Measured on the
   * v4 cache: 16.4 hours between the oldest and newest tail, clustering by
   * build attempt. That is not one snapshot, and the clock verifier said so
   * on 57 checks.
   *
   * Repinning is append-only and cannot lose history: the top-up refetches
   * from `lastTime - TOP_UP_OVERLAP_MS` and merges, so a provider whose
   * intraday depth has aged out shortens nothing already stored.
   */
  repin?: boolean;
  /**
   * The row identity for merging. Defaults to `timeOf`.
   *
   * Only the economic calendar passes one. It must be computable from a
   * STORED item, not just a freshly fetched one — a top-up recomputes keys
   * for everything already on disk, so a key that needs a field the store
   * does not carry would treat every stored row as new and duplicate the lot.
   */
  keyOf?: (item: T) => string | number;
  timeOf: (item: T) => number;
}): Promise<T[]> {
  const {
    anchor,
    cacheDir,
    clock,
    fetchFull,
    fetchSince,
    key,
    keyOf,
    repin,
    timeOf,
  } = input;
  await mkdir(cacheDir, { recursive: true });
  const path = `${cacheDir}/${key}.rolling.json`;

  let store = await readStore<T>(path);
  if (store && store.clock !== clock) {
    // #364 round 25, finding 3: the remedy follows the store's own
    // clock — the nightly stand-down defers to THIS line for it. A
    // calendar-clock store (treasury-rates, econ-calendar) clears by
    // deleting that one store; routing it to the 8-12h bar rebuild is
    // a remedy that cannot clear its stamp (round-14's shape).
    const remedy = clock === CALENDAR_CLOCK || clock === ECON_CALENDAR_CLOCK
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

  if (repin) {
    delete store.pinned[anchor];
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
  store.items = mergeByTime(store.items, fresh, timeOf, keyOf);
  if (store.items.length === 0) {
    // Never pin an empty series: one failed/empty provider response must
    // not cement an empty cache for the rest of the anchor day. Unpinned,
    // the next call retries the fetch.
    return [];
  }
  store.pinned[anchor] = timeOf(store.items.at(-1)!);

  // Protected anchors are held out of the prune ENTIRELY rather than counted
  // against `PINS_KEPT`: counting them would let a run of ordinary top-ups
  // push the protected day out of the keep-window and evict it anyway, which
  // is the failure this exists to prevent. Growth stays bounded because the
  // protected list is a handful of declared days, not an accumulation.
  const prunable = Object.keys(store.pinned)
    .filter((day) => !PROTECTED_DAYS.has(day))
    .sort();
  for (const stale of prunable.slice(0, Math.max(0, prunable.length - PINS_KEPT))) {
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
