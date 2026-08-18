// R0 acceptance instrument: read every rolling store in the calibration
// cache and report, per store, whether its stamp and its DATA agree on the
// one clock — without touching the network. Run it after the rebuild
// (docs/cache-rebuild-r0.md) and any time the cache's clock is in doubt:
//
//   npx tsx scripts/verify-cache-clock.ts [--cache-dir path]
//
// Exit 0 only when every store is stamped with its expected clock, no
// witness condemns a series, every 15min/5min pair registers at zero
// shift, and no pair shows the 1b sawtooth (5min rows ≈ 1x the 15min
// count instead of ≈3x over the shared span). The poisoned pre-R0 store
// fails the very first check — every store unstamped — which is the
// point: this script proves the rebuild happened and took, rather than
// trusting that it did.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { BAR_CLOCK } from "../supabase/functions/trade-analyzer/bars.ts";
import {
  CALENDAR_CLOCK,
  crossSeriesClock,
  seriesClockWitness,
  storeKindForKey,
} from "./clockWitness.ts";

type StoredBar = { high: number; low: number; time: number };
type SlimSeries = { count: number; firstTime: number; lastTime: number; slim: StoredBar[] };

const get = (flag: string) => {
  const index = process.argv.indexOf(`--${flag}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
};

// The 1b sawtooth reads ~0.6-1.0 here; a whole series reads ~3. The floor
// deliberately sits far from both so neither noise nor a thin market can
// blur the verdict.
const DENSITY_RATIO_FLOOR = 2.5;
const DENSITY_MIN_PRIMARY_ROWS = 1_000;

function main(): void {
  const cacheDir = get("cache-dir") ?? ".calibration-cache";
  let names: string[];
  try {
    names = readdirSync(cacheDir).filter((name) =>
      name.endsWith(".rolling.json")
    ).sort();
  } catch {
    console.error(`${cacheDir}: not readable — nothing to verify`);
    process.exit(1);
    return;
  }
  if (names.length === 0) {
    console.error(`${cacheDir}: no rolling stores — nothing to verify`);
    process.exit(1);
    return;
  }

  const failures: string[] = [];
  const fail = (line: string) => {
    failures.push(line);
    console.log(`  RED  ${line}`);
  };
  const ok = (line: string) => console.log(`  ok   ${line}`);

  // Intraday series held only until their 15min/5min mate arrives, then
  // released — holding all 97 symbols' full series at once is gigabytes.
  const pending = new Map<string, { fifteen?: SlimSeries; five?: SlimSeries }>();

  for (const name of names) {
    const key = name.slice(0, -".rolling.json".length);
    const kind = storeKindForKey(key);
    const store = JSON.parse(
      readFileSync(join(cacheDir, name), "utf8"),
    ) as { clock?: string; items?: StoredBar[] };
    const items = Array.isArray(store.items) ? store.items : [];
    if (!kind) {
      fail(`${key}: unknown store kind — no expected clock for this key`);
      continue;
    }
    const expected = kind.kind === "calendar" ? CALENDAR_CLOCK : BAR_CLOCK;
    if (store.clock !== expected) {
      fail(
        `${key}: stamped "${
          store.clock ?? "<unstamped — pre-R0 mixed-clock era>"
        }", expected "${expected}"`,
      );
      continue;
    }
    if (kind.kind === "calendar") {
      ok(`${key}: ${items.length} events, clock "${store.clock}"`);
      continue;
    }
    const witness = seriesClockWitness(items, kind.role);
    if (witness.verdict === "naive" || witness.verdict === "mixed") {
      fail(
        `${key}: witnesses "${witness.verdict}" — ${JSON.stringify(witness)}`,
      );
    } else {
      ok(`${key}: ${items.length} bars, witness "${witness.verdict}"`);
    }
    const match = key.match(/^(.*)-(15min|5min)-(.+)$/);
    if (!match || items.length === 0) {
      continue;
    }
    const pairKey = `${match[1]}|${match[3]}`;
    const slim: SlimSeries = {
      count: items.length,
      firstTime: items[0].time,
      lastTime: items[items.length - 1].time,
      slim: items.map((bar) => ({
        high: bar.high,
        low: bar.low,
        time: bar.time,
      })),
    };
    const entry = pending.get(pairKey) ?? {};
    if (match[2] === "15min") {
      entry.fifteen = slim;
    } else {
      entry.five = slim;
    }
    if (!entry.fifteen || !entry.five) {
      pending.set(pairKey, entry);
      continue;
    }
    pending.delete(pairKey);
    const { fifteen, five } = entry;
    const registration = crossSeriesClock(fifteen.slim, five.slim);
    if (registration.verdict === "shifted") {
      fail(
        `${pairKey}: 5min registers at ${registration.bestShiftHours}h ` +
          `against the 15min primary — ${JSON.stringify(registration)}`,
      );
    } else {
      ok(
        `${pairKey}: registration "${registration.verdict}" ` +
          `(zero-shift match ${registration.matchRateAtZero ?? "n/a"})`,
      );
    }
    // 1b: over the shared span a complete 5min series holds ~3x the 15min
    // rows; the sawtooth held ~0.6-1.0x. Counted on the overlap only, so a
    // 5min history that legitimately starts later is not condemned for
    // being younger.
    const overlapStart = Math.max(fifteen.firstTime, five.firstTime);
    const overlapEnd = Math.min(fifteen.lastTime, five.lastTime);
    const inOverlap = (series: SlimSeries) =>
      series.slim.reduce(
        (count, bar) =>
          bar.time >= overlapStart && bar.time <= overlapEnd
            ? count + 1
            : count,
        0,
      );
    const primaryRows = inOverlap(fifteen);
    if (primaryRows >= DENSITY_MIN_PRIMARY_ROWS) {
      const ratio = inOverlap(five) / primaryRows;
      if (ratio < DENSITY_RATIO_FLOOR) {
        fail(
          `${pairKey}: 5min/15min density ${ratio.toFixed(2)} over the ` +
            `shared span — the 1b sawtooth signature (complete is ~3)`,
        );
      } else {
        ok(`${pairKey}: 5min/15min density ${ratio.toFixed(2)}`);
      }
    }
  }

  for (const [pairKey, entry] of pending) {
    const present = entry.fifteen ? "15min" : "5min";
    const missing = entry.fifteen ? "5min" : "15min";
    fail(
      `${pairKey}: ${present} store present but no ${missing} mate — ` +
        `rebuild incomplete`,
    );
  }

  if (failures.length > 0) {
    console.error(
      `\n${failures.length} store(s) failed the one-clock check. ` +
        `Rebuild per docs/cache-rebuild-r0.md; do not sweep or top up ` +
        `against this cache.`,
    );
    process.exit(1);
  }
  console.log(
    `\nAll ${names.length} stores stamped and witnessed on one clock.`,
  );
}

main();
