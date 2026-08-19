// R0 acceptance instrument: read every rolling store in the calibration
// cache and report, per store, whether its stamp and its DATA agree on the
// one clock — without touching the network. Run it after the rebuild
// (docs/cache-rebuild-r0.md) and any time the cache's clock is in doubt:
//
//   npx tsx scripts/verify-cache-clock.ts [--cache-dir path]
//
// Green requires: every store stamped with its expected clock and
// readable; no witness condemning a series; every 15min/5min pair
// registering at zero shift — with a LARGE-overlap pair that cannot
// register at all treated as a failure, because at the acceptance gate
// uncertainty resolves toward failing; no 1b sawtooth (5min rows ≈ 3x
// the 15min count over the shared span); the reference symbol's session
// anchored at its venue's known open (the absolute check that catches a
// provider convention flip, which shifts every series together and is
// invisible to every relative instrument — measured, #358); a daily
// store beside every intraday pair (the daily witness is the universal
// condemning one); and, when a roster is supplied (the CLI supplies the
// live scan roster), the COMPLETENESS gates (#358 round 6): every roster
// symbol's three stores present — all of 15min, 5min and daily, with an
// EMPTY store counting as absent — the reference symbol's session anchor
// actually run (not merely not-failed: without its intraday store the one
// absolute check goes dark, and dark is not green), and the calendar
// store present. A rebuild abandoned at 40 of 97 symbols, or one that
// left a symbol daily-only because FMP answered its intraday windows
// empty, is incomplete, not green.
//
// The poisoned pre-R0 store fails the very first check — every store
// unstamped — which is the point: this instrument proves the rebuild
// happened and took, rather than trusting that it did. The audit core is
// exported and exercised by tests/verifyCacheClock.test.ts against
// synthetic healthy and poisoned caches.

import { readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { BAR_CLOCK } from "../supabase/functions/trade-analyzer/bars.ts";
import {
  defaultScanSymbols,
  resolveProviderSymbols,
} from "../supabase/functions/trade-analyzer/symbols.ts";
import {
  CALENDAR_CLOCK,
  crossSeriesClock,
  REFERENCE_SESSION_ANCHORS,
  seriesClockWitness,
  sessionAnchorWitness,
  storeKindForKey,
} from "./clockWitness.ts";

type StoredBar = { high: number; low: number; time: number };
type SlimSeries = {
  count: number;
  firstTime: number;
  lastTime: number;
  slim: StoredBar[];
};

// The 1b sawtooth reads ~0.6-1.0 here; a whole series reads ~3. The floor
// deliberately sits far from both so neither noise nor a thin market can
// blur the verdict. The CEILING is the other direction's detector (#358
// round 4): a clipped 15-minute PRIMARY against a complete 5-minute
// series inflates the ratio above 3, so a floor alone reads a clipped
// primary as greener.
const DENSITY_RATIO_FLOOR = 2.5;
const DENSITY_RATIO_CEILING = 3.5;
const DENSITY_MIN_PRIMARY_ROWS = 1_000;
// A daily store this deep that witnesses NOTHING is unaccepted, matching
// the registration and anchor gates' posture — the daily witness is the
// universal condemning one, and green must mean it actually resolved.
// Below this depth an undecided store is legitimately young.
const DAILY_WITNESS_REQUIRED_ROWS = 100;
// A pair with this many shared days and no verdict is not "unknown", it
// is unaccepted: something about the data defeats the instrument, and the
// acceptance gate does not wave that through.
const REGISTRATION_REQUIRED_DAYS = 200;

export type CacheClockAudit = {
  failures: string[];
  lines: string[];
};

export function auditCacheClock(input: {
  cacheDir: string;
  rosterProviderSymbols?: string[];
}): CacheClockAudit {
  const { cacheDir, rosterProviderSymbols } = input;
  const lines: string[] = [];
  const failures: string[] = [];
  const fail = (line: string) => {
    failures.push(line);
    lines.push(`  RED  ${line}`);
  };
  const ok = (line: string) => lines.push(`  ok   ${line}`);

  let names: string[];
  try {
    names = readdirSync(cacheDir).sort();
  } catch {
    fail(`${cacheDir}: not readable — nothing to verify`);
    return { failures, lines };
  }
  const rollingNames = names.filter((name) => name.endsWith(".rolling.json"));
  const cotNames = names.filter((name) =>
    name.startsWith("cot-") && name.endsWith(".json")
  );
  if (rollingNames.length === 0) {
    fail(`${cacheDir}: no rolling stores — nothing to verify`);
    return { failures, lines };
  }

  // Intraday series held only until their 15min/5min mate arrives, then
  // released — holding all 97 symbols' full series at once is gigabytes.
  const pending = new Map<
    string,
    { fifteen?: SlimSeries; five?: SlimSeries }
  >();
  // Three presence tiers per provider symbol (#358 round 6 + 6b),
  // because "missing" and "condemned" and "empty" have different
  // remedies and the runbook sends the operator here to DIAGNOSE:
  // - present: a file exists under the key — a torn or mis-stamped
  //   store earns its own RED and must not ALSO read as missing;
  // - populated: readable, stamped, and holding rows — the only tier
  //   that satisfies completeness, because the pipeline never writes an
  //   empty store (loadRollingSeries returns before the write when a
  //   fetch yields nothing);
  // - condemned: present but unreadable or wrong-stamped — its own RED
  //   already carries the verdict, so the roster gate adds nothing.
  const presentKindsByProvider = new Map<string, Set<string>>();
  const kindsByProvider = new Map<string, Set<string>>();
  const condemnedKindsByProvider = new Map<string, Set<string>>();
  const registerKind = (
    map: Map<string, Set<string>>,
    provider: string,
    seriesKind: string,
  ) => {
    const kinds = map.get(provider) ?? new Set<string>();
    kinds.add(seriesKind);
    map.set(provider, kinds);
  };
  // Whether each reference symbol's session anchor actually RAN — the
  // per-store block below is conditioned on an intraday store existing,
  // so absence must be failed explicitly, not silently skipped (#358
  // round 6).
  const anchorWitnessed = new Set<string>();
  let calendarPresent = false;

  for (const name of rollingNames) {
    const key = name.slice(0, -".rolling.json".length);
    const kind = storeKindForKey(key);
    if (!kind) {
      fail(`${key}: unknown store kind — no expected clock for this key`);
      continue;
    }
    if (kind.kind === "calendar") {
      // Presence means the file exists under the calendar key; an
      // unreadable or mis-stamped calendar earns its own RED below
      // rather than additionally reading as missing.
      calendarPresent = true;
    }
    const keyMatch = key.match(/^(.*)-(15min|5min|daily)-(.+)$/);
    const provider = keyMatch?.[1];
    // Presence is a fact about the KEY, recorded before any read — the
    // same carve-out the calendar gets above (#358 round 6b): a torn or
    // mis-stamped store earns its own RED and must not additionally
    // read as "missing" in the roster gate.
    if (provider) {
      registerKind(presentKindsByProvider, provider, keyMatch![2]);
    }
    let store: { clock?: string; items?: StoredBar[] };
    try {
      store = JSON.parse(readFileSync(join(cacheDir, name), "utf8")) as {
        clock?: string;
        items?: StoredBar[];
      };
    } catch {
      // A torn or corrupt store is a RED line, not a crash — the "for the
      // record" pass over the condemned archive must list every store.
      fail(`${key}: unreadable store (truncated or corrupt JSON)`);
      if (provider) {
        registerKind(condemnedKindsByProvider, provider, keyMatch![2]);
      }
      continue;
    }
    const items = Array.isArray(store.items) ? store.items : [];
    const expected = kind.kind === "calendar" ? CALENDAR_CLOCK : BAR_CLOCK;
    if (store.clock !== expected) {
      fail(
        `${key}: stamped "${
          store.clock ?? "<unstamped — pre-R0 mixed-clock era>"
        }", expected "${expected}"`,
      );
      if (provider) {
        registerKind(condemnedKindsByProvider, provider, keyMatch![2]);
      }
      continue;
    }
    if (kind.kind === "calendar") {
      ok(`${key}: ${items.length} events, clock "${store.clock}"`);
      continue;
    }

    if (provider && items.length > 0) {
      registerKind(kindsByProvider, provider, keyMatch![2]);
    }

    const witness = seriesClockWitness(items, kind.role);
    if (witness.verdict === "naive" || witness.verdict === "mixed") {
      fail(
        `${key}: witnesses "${witness.verdict}" — ${JSON.stringify(witness)}`,
      );
    } else if (
      kind.role === "daily" && witness.verdict === "indeterminate" &&
      items.length >= DAILY_WITNESS_REQUIRED_ROWS
    ) {
      fail(
        `${key}: daily witness resolved NOTHING on ${items.length} rows — ` +
          `the universal condemning witness must decide at this depth; ` +
          `investigate before accepting`,
      );
    } else if (kind.role === "daily" && items.length > 0) {
      ok(
        `${key}: ${items.length} bars from ${
          new Date(items[0].time).toISOString().slice(0, 10)
        }, witness "${witness.verdict}"`,
      );
    } else {
      ok(`${key}: ${items.length} bars, witness "${witness.verdict}"`);
    }

    // The reference anchor: the one absolute sessioned-intraday check.
    const anchor = provider ? REFERENCE_SESSION_ANCHORS[provider] : undefined;
    if (anchor && kind.role === "intraday" && items.length > 0) {
      anchorWitnessed.add(provider!);
      const anchored = sessionAnchorWitness(items, anchor);
      if (anchored.verdict === "displaced") {
        fail(
          `${key}: reference session displaced from its venue open — ` +
            `${JSON.stringify(anchored)}`,
        );
      } else if (anchored.verdict === "anchored") {
        ok(
          `${key}: reference session anchored (${anchored.anchoredYears} years)`,
        );
      } else {
        fail(
          `${key}: reference session anchor INDETERMINATE — the one ` +
            `absolute check did not resolve; investigate before accepting`,
        );
      }
    }

    if (!keyMatch || keyMatch[2] === "daily" || items.length === 0) {
      continue;
    }
    const pairKey = `${keyMatch[1]}|${keyMatch[3]}`;
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
    if (keyMatch[2] === "15min") {
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
    } else if (
      registration.verdict === "indeterminate" &&
      registration.sampledDays >= REGISTRATION_REQUIRED_DAYS
    ) {
      fail(
        `${pairKey}: registration INDETERMINATE over ` +
          `${registration.sampledDays} shared days — the pair cannot prove ` +
          `alignment; investigate before accepting`,
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
      } else if (ratio > DENSITY_RATIO_CEILING) {
        fail(
          `${pairKey}: 5min/15min density ${ratio.toFixed(2)} over the ` +
            `shared span — ABOVE the complete ratio; a clipped 15-minute ` +
            `primary inflates this, it does not lower it`,
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
  for (const [provider, present] of presentKindsByProvider) {
    if (!present.has("15min") && !present.has("5min")) {
      continue;
    }
    if (!present.has("daily")) {
      // The daily witness is the universal condemning one; a symbol
      // without its daily store has lost the strongest check silently.
      // Presence-based on purpose (#358 round 6b): an empty or condemned
      // intraday store still counts as "intraday present" here, so this
      // check keeps its pre-round-6 reach; a daily store that EXISTS but
      // is condemned earns its own RED instead of this line, and a
      // present-but-empty daily on a roster symbol is the roster gate's
      // empty-store RED.
      fail(`${provider}: intraday stores present but no daily store`);
    }
  }
  if (rosterProviderSymbols) {
    // The completeness gates (#358 round 6). The presence checks above
    // fire only around stores that EXIST, so alone they compose into a
    // hole: a symbol left daily-only — reachable without an exception,
    // because empty intraday payloads make loadRollingSeries return
    // without writing while the daily sibling in the same Promise.all
    // lands, and the sweep then skips the symbol and exits 0 — passed
    // every one of them. The roster is the spec of what a finished
    // rebuild contains, so roster mode demands the whole shape.
    for (const provider of rosterProviderSymbols) {
      const present = presentKindsByProvider.get(provider);
      if (!present || present.size === 0) {
        fail(`${provider}: on the scan roster but has NO stores — rebuild incomplete`);
        continue;
      }
      const populated = kindsByProvider.get(provider);
      const condemned = condemnedKindsByProvider.get(provider);
      // "Missing" means NO FILE — a store that exists but is torn,
      // mis-stamped or empty is a different diagnosis with a different
      // remedy (#358 round 6b): condemned stores already earned their
      // own RED, and empty ones get the explicit line below.
      const missing = ["15min", "5min", "daily"].filter((k) =>
        !present.has(k)
      );
      if (missing.length > 0) {
        fail(
          `${provider}: on the scan roster but missing its ${
            missing.join(" and ")
          } store(s) — a partial symbol reads green on every witness it ` +
            `never ran; rebuild incomplete`,
        );
      }
      for (const seriesKind of ["15min", "5min", "daily"]) {
        if (
          present.has(seriesKind) && !populated?.has(seriesKind) &&
          !condemned?.has(seriesKind)
        ) {
          fail(
            `${provider}: ${seriesKind} store is EMPTY (zero rows) — an ` +
              `empty store counts as absent; rebuild incomplete`,
          );
        }
      }
      if (REFERENCE_SESSION_ANCHORS[provider] && !anchorWitnessed.has(provider)) {
        fail(
          `${provider}: the reference session anchor NEVER RAN — no ` +
            `${provider} intraday bars were witnessed, and nothing else ` +
            `can see a provider convention flip; dark is not green`,
        );
      }
    }
    if (!calendarPresent) {
      fail(
        `econ-calendar: no calendar store — the rebuild fetches it ` +
          `alongside every roster symbol; a cache without it is incomplete`,
      );
    }
  }
  if (cotNames.length > 0) {
    // Informational: cot files are bespoke (no clock stamp; parse
    // unchanged across repo history). The rebuild archives them with the
    // directory; their presence is listed so a partial cleanup is visible.
    lines.push(`  note ${cotNames.length} cot-*.json contract file(s) present`);
  }
  return { failures, lines };
}

// The ONE declaration of which flags own the token after them — the form
// rounds 33-38 installed across the corpus readers, extended to every
// script with a value-taking flag (#364 round 50, finding 2). The scan in
// tests/sweepManifest.test.ts now DERIVES its file list by globbing
// scripts/, so a new reader joins the law automatically instead of being
// found by a review round.
const VALUE_FLAGS = new Set(["--cache-dir"]);

function flagValue(argv: string[], arg: string): string | undefined {
  if (!VALUE_FLAGS.has(arg)) {
    throw new Error(
      `str("${arg}") reads a value outside VALUE_FLAGS — declare it there, ` +
        `or its value is read as something else`,
    );
  }
  const index = argv.indexOf(arg);
  if (index === -1) return undefined;
  const token = argv[index + 1];
  if (token === undefined || token.startsWith("--")) {
    throw new Error(
      `${arg} owns the token after it and got ${
        token === undefined ? "no value" : `"${token}"`
      } — a value, never a flag; pass ${arg} <value>`,
    );
  }
  return token;
}

function str(argv: string[], arg: string): string | undefined {
  return flagValue(argv, arg);
}

function main(): void {
  const cacheDir = str(process.argv, "--cache-dir") ?? ".calibration-cache";
  const roster = defaultScanSymbols
    .map((symbol) => resolveProviderSymbols(symbol)[0])
    .filter((provider): provider is string => Boolean(provider));
  const { failures, lines } = auditCacheClock({
    cacheDir,
    rosterProviderSymbols: roster,
  });
  for (const line of lines) {
    console.log(line);
  }
  if (failures.length > 0) {
    console.error(
      `\n${failures.length} check(s) failed the one-clock audit. ` +
        `Rebuild per docs/cache-rebuild-r0.md; do not sweep or top up ` +
        `against this cache.`,
    );
    process.exit(1);
  }
  console.log(`\nAll stores stamped and witnessed on one clock.`);
}

// Importable for tests; the CLI entry runs only when invoked directly.
if (basename(process.argv[1] ?? "").startsWith("verify-cache-clock")) {
  main();
}
