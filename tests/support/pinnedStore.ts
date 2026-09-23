import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { BAR_CLOCK } from "../../supabase/functions/trade-analyzer/bars.ts";
import type { Bar } from "../../supabase/functions/trade-analyzer/types.ts";

/**
 * Write a rolling bar store the way `calibrationCache.ts` writes one, pinned
 * at `anchor` through its last bar.
 *
 * A hand-built store for readers whose fetchers refuse: the pin is what makes
 * `loadRollingSeries` return from disk, so a store written here is read and
 * never topped up. Bars must be in time order, as the cache keeps them.
 */
export function writePinnedStore(
  dir: string,
  key: string,
  anchor: string,
  bars: readonly Bar[],
): void {
  if (bars.length === 0) throw new Error(`writePinnedStore: ${key} has no bars — an empty store is never pinned`);
  for (let index = 1; index < bars.length; index += 1) {
    if (bars[index].time <= bars[index - 1].time) {
      throw new Error(`writePinnedStore: ${key} is out of time order at ${index}`);
    }
  }
  writeFileSync(
    join(dir, `${key}.rolling.json`),
    JSON.stringify({ clock: BAR_CLOCK, items: bars, pinned: { [anchor]: bars.at(-1)!.time } }),
  );
}
