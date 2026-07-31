// Durable, incremental calibration cache (round-17 hardening).
//
// The old cache keyed every file to the UTC run date, so each new day
// refetched every symbol's full history — the 40-70 minute cold morning.
// This store keeps ONE rolling file per series and tops it up with only
// the bars/events newer than what it holds. Same-day A/B stays drift-free
// through anchor pins: the first run of a UTC day stamps how far the
// series reaches, and every later run that day reads exactly that slice,
// never the network.
//
// Legacy migration is free: on a store miss, the newest date-keyed file
// from the old scheme seeds the store, and when its anchor is today's the
// pin transfers with it — zero refetch.

import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";

export const DEFAULT_CACHE_DIR = ".calibration-cache";

// Overlap re-fetched on every top-up so a partially-formed final bar or a
// late-arriving revision in the previous pin never survives as truth.
export const TOP_UP_OVERLAP_MS = 3 * 86_400_000;

// Anchor pins kept per store; older days' pins are useless once past.
const PINS_KEPT = 5;

type RollingStore<T> = {
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

async function readJson<T>(path: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch {
    return null;
  }
}

async function seedFromLegacy<T>(
  cacheDir: string,
  legacyPrefix: string,
): Promise<{ items: T[]; anchor: string } | null> {
  let names: string[];
  try {
    names = await readdir(cacheDir);
  } catch {
    return null;
  }
  const candidates = names
    .filter((name) => name.startsWith(legacyPrefix) && name.endsWith(".json"))
    .sort();
  const newest = candidates.at(-1);
  if (!newest) {
    return null;
  }
  const items = await readJson<T[]>(`${cacheDir}/${newest}`);
  if (!Array.isArray(items) || items.length === 0) {
    return null;
  }
  const anchor = newest.slice(legacyPrefix.length, -".json".length);
  return { items, anchor };
}

// One rolling series: bars, calendar events — anything with a time order.
export async function loadRollingSeries<T>(input: {
  anchor: string;
  cacheDir: string;
  fetchFull: () => Promise<T[]>;
  fetchSince: (sinceMs: number) => Promise<T[]>;
  key: string;
  // Old date-keyed filename prefix (everything before the anchor date).
  legacyPrefix?: string;
  timeOf: (item: T) => number;
}): Promise<T[]> {
  const { anchor, cacheDir, fetchFull, fetchSince, key, legacyPrefix, timeOf } =
    input;
  await mkdir(cacheDir, { recursive: true });
  const path = `${cacheDir}/${key}.rolling.json`;

  let store = await readJson<RollingStore<T>>(path);
  if (!store || !Array.isArray(store.items)) {
    store = { items: [], pinned: {} };
    if (legacyPrefix) {
      const legacy = await seedFromLegacy<T>(cacheDir, legacyPrefix);
      if (legacy) {
        store.items = legacy.items;
        if (legacy.anchor === anchor) {
          // Same-day migration: the legacy file IS today's pinned view.
          store.pinned[anchor] = timeOf(legacy.items.at(-1)!);
        }
        await writeFile(path, JSON.stringify(store));
      }
    }
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

  await writeFile(path, JSON.stringify(store));
  const through = store.pinned[anchor];
  return store.items.filter((item) => timeOf(item) <= through);
}
