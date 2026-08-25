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
  ECON_CALENDAR_CLOCK,
  crossSeriesClock,
  gridRegistration,
  REFERENCE_SESSION_ANCHORS,
  seriesClockWitness,
  sessionAnchorWitness,
  storeKindForKey,
} from "./clockWitness.ts";
import { DENSITY_RECENT_WINDOW_DAYS } from "./sweepManifest.ts";
import { DENSITY_RATIO_PRIMARY_FLOOR } from "./sweepStats.ts";
import { flagReader } from "./flagReader.ts";
import {
  TREASURY_FETCH_START_MS,
  treasuryCurveFacts,
  type TreasuryCurveFacts,
} from "./sweepManifest.ts";

type StoredBar = { high: number; low: number; time: number };
type SlimSeries = {
  count: number;
  firstTime: number;
  /**
   * P5: the longest gap inside this series' recent window. REQUIRED, not
   * optional — an optional field here made the staleness gate typecheck while
   * reading `undefined` on every store, so it could never fire. A gate that
   * cannot fire is worse than no gate, because it reads as coverage.
   */
  recentMaxGapMs: number;
  recentMedianGapMs: number;
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
  /**
   * P5: the instant the audit judges staleness against. Defaults to now, which
   * is what an operator run means. Injectable because a fixture's series ends
   * where the fixture ends, and a gate anchored on a hidden `Date.now()` can
   * neither be pinned nor reproduced.
   */
  asOfMs?: number;
  cacheDir: string;
  rosterProviderSymbols?: string[];
}): CacheClockAudit {
  const { asOfMs, cacheDir, rosterProviderSymbols } = input;
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
  // Mirrors calendarPresent: the curve is a sweep INPUT scored into
  // confidenceScore, so a roster-mode audit that is silent about its absence
  // certifies a cache the sweep will refuse.
  let ratesPresent = false;

  // P5: HAS THIS FEED STOPPED? Nothing asked, anywhere, until 2026-08-24.
  //
  // `staleMs` existed at exactly one site — the Treasury branch above — and
  // no gate compared a BAR store's newest row to now. `recentWindow` ends
  // its 90-day window at the SERIES' OWN last bar, so a store truncated 200
  // days ago measures density over a window that ended 200 days ago and
  // reports the theoretical maximum. Proven on the real cache: BTCUSD
  // truncated as though the feed died 200 days back reads 288.0 rows/day,
  // recentSpanDays 90, verdict "utc" — identical to live, and it clears the
  // 260 floor. `corpusEndMs` cannot see it either, being a MAX across
  // symbols.
  //
  // Amendment 31 makes a lapsed feed a SOURCE FAILURE that ejects
  // automatically — "not a calibration verdict, and it remains automatic" —
  // so this refusal is typed as one, and it must never be confused with the
  // density verdict beside it.
  //
  // THE BOUND IS THE MARKET'S OWN: the longest gap inside its recent
  // window, which spans ~13 weekends and any holidays among them, so every
  // lawful silence is inside the bound by construction. A flat bound could
  // not serve the roster — 7 days is right for a daily curve, far too loose
  // for a 24/7 five-minute store and too tight for a grain future's
  // weekend-plus-holiday gap.
  //
  // PLUS TWO INTERVALS, because trailing silence and a gap between bars are
  // not the same quantity. A gap is a completed interval; the trailing
  // silence includes the bar currently forming, which cannot have been
  // published yet. At any instant the newest CLOSED bar is labelled
  // `floor((now - interval) / interval) * interval`, so structural trailing
  // silence lies in [1 interval, 2 intervals) even from a perfect feed with
  // zero provider lag. That is a derivation, not a tolerance.
  //
  // Without it the gate could not pass a healthy dense series at all. On
  // the v4 cache it refused 17 crypto 5-minute stores reading 10.0 minutes
  // silent against a 5.0-minute recent maximum — while their 15-minute
  // siblings passed on 15.0 against 15.0, which is to say by one minute of
  // luck. A gate whose verdict turns on the minute you run it is not
  // measuring the feed.
  //
  // Lapsed-feed detection is untouched: a feed that stopped goes silent for
  // hours or days, and two bar intervals is minutes.
  const staleness = (
    key: string,
    facts: { lastTime: number; recentMaxGapMs: number; recentMedianGapMs: number },
    asOf: number,
  ) => {
    if (facts.recentMaxGapMs <= 0) return;
    const silentMs = asOf - facts.lastTime;
    const lawfulMs = facts.recentMaxGapMs + 2 * facts.recentMedianGapMs;
    if (silentMs <= lawfulMs) return;
    fail(
      `${key}: SOURCE FAILURE — silent for ${
        (silentMs / 86_400_000).toFixed(2)
      } days, longer than the longest silence this market has had in its ` +
        `recent window (${
          (facts.recentMaxGapMs / 86_400_000).toFixed(2)
        } days) plus the two bar intervals that are always in flight (${
          (2 * facts.recentMedianGapMs / 86_400_000).toFixed(2)
        } days). A lapsed feed ejects automatically under amendment 31; this ` +
        `is not a density or calibration verdict`,
    );
  };

  /**
   * Drained after the loop: the bound needs the corpus's own as-of, which is
   * not known until every store has been read.
   *
   * Holds THREE NUMBERS per series, never the SlimSeries. The first draft
   * queued the facts object, which carries every bar — so deferring the check
   * held the whole 7.6 GB corpus resident at once and the verifier died on
   * SIGABRT, Node's out-of-memory abort. Nothing about the staleness bound
   * needs a bar; it needs the last timestamp and two gap statistics.
   */
  const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

  const stalenessQueue: Array<
    { key: string; lastTime: number; recentMaxGapMs: number; recentMedianGapMs: number }
  > = [];

  /**
   * Curve stores whose head and gap checks passed, awaiting the corpus as-of.
   *
   * #420 made the BAR staleness gate corpus-relative and left this one on
   * `Date.now()` — one of two sites, which is this repository's most-repeated
   * failure, and it had a date on it: the Treasury tail is 2026-08-24, so the
   * accepted v4 cache would have gone RED on 2026-08-31 on unchanged bytes.
   *
   * The loop is what made it serious. That refusal reads "Rebuild per
   * docs/cache-rebuild-r0.md; do not sweep or top up against this cache" while
   * a thirty-second `--warm-only` top-up would clear it — the instrument
   * forbidding its own cheap remedy and routing the operator to a fourteen-hour
   * rebuild that spends metered bytes.
   */
  const pendingCurves: Array<
    {
      clock: string;
      facts: TreasuryCurveFacts & { firstTime: number; lastTime: number };
      key: string;
    }
  > = [];

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
    // Three families now, not two. The econ-calendar store carries its own
    // stamp so a calendar-only invalidation cannot take the Treasury curve
    // with it — see ECON_CALENDAR_CLOCK.
    const expected = kind.kind === "calendar"
      ? ECON_CALENDAR_CLOCK
      : kind.kind === "rates"
      ? CALENDAR_CLOCK
      : BAR_CLOCK;
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
    // Rates carry no bar witness — they are dated curve rows, not a session
    // series — so the store proves its clock and stops there. Deliberately NOT
    // folded into the calendar branch: that branch also satisfies the
    // calendar-presence gate, and a treasury store must never stand in for a
    // missing econ-calendar.
    if (kind.kind === "rates") {
      // "An empty store counts as absent" and "dark is not green" — this
      // file's own doctrine, which the first version of this branch broke by
      // printing ok on zero rows. A stamped-but-empty curve would have passed
      // the acceptance gate and died one step later at replay-sweep's
      // "historical-treasury-curve over zero rows; refusing to sweep", after
      // the operator had been told the rebuild took.
      if (items.length === 0) {
        fail(
          `${key}: curve store is EMPTY (zero rows) — an empty store counts ` +
            `as absent; the sweep refuses a zero-row curve, so this must not ` +
            `read as green`,
        );
        continue;
      }
      ratesPresent = true;
      // COVERAGE, mirroring the three refusals the SWEEP already makes on
      // this store and this gate did not. They are why the gate matters: a
      // clock stamp and a row count certified a curve measured at 25.4%
      // coverage — 853 rows where ~3,361 business days exist, a nine-month
      // head shortfall and a 278-day interior hole — and step 3 called it
      // green while every one of the sweep's own predicates would have
      // refused it. The predicates live in sweepManifest.ts, a plain Node
      // module, so this imports them rather than restating them: one
      // definition, and the gate cannot drift from the sweep it certifies for.
      const curveRows = items as unknown as Array<{ dateMs: number }>;
      const facts = treasuryCurveFacts(
        curveRows.filter((row) => Number.isFinite(row?.dateMs)),
      );
      if (facts.count === 0 || facts.firstTime === null) {
        fail(
          `${key}: no parseable curve rows (items carry no dateMs) — the ` +
            `store is present and says nothing`,
        );
        continue;
      }
      let curveFailed = false;
      if (facts.firstTime > TREASURY_FETCH_START_MS + 7 * 86_400_000) {
        curveFailed = true;
        // BOTH causes and the action, the way the sweep's own head guard
        // states them. The gate's whole point is that the operator acts here
        // instead of at R3, so a red line naming one cause and no remedy
        // sends them at the wrong fix — and the two are genuinely different:
        // the fetch guard exempts its first chunk and tolerates 14 days of
        // reachback, so a provider floor sitting 8-60 days after the constant
        // passes the fetch cleanly and lands here.
        fail(
          `${key}: starts ${iso(facts.firstTime)} but the sweep requests ` +
            `${iso(TREASURY_FETCH_START_MS)} — the head is ${
              Math.round(
                (facts.firstTime - TREASURY_FETCH_START_MS) / 86_400_000,
              )
            } days short. An existing store never deepens on its own (top-ups ` +
            `touch only the tail), so: delete the treasury-rates rolling ` +
            `store and refetch full history. If a full refetch STILL cannot ` +
            `reach the requested start, the cause is the provider's coverage ` +
            `rather than a too-wide fetch chunk — re-probe its earliest ` +
            `served date and move TREASURY_FETCH_START_MS with the recorded ` +
            `evidence`,
        );
      }
      if (facts.largestGapMs > 7 * 86_400_000) {
        curveFailed = true;
        fail(
          `${key}: largest interior gap is ${
            Math.round(facts.largestGapMs / 86_400_000)
          } days — the visibility pointer stalls inside a hole and scores ` +
            `months-stale rows as fresh; the sweep refuses this curve`,
        );
      }
      // CORPUS-RELATIVE, like the bar staleness gate beside it.
      //
      // #420 made that gate judge against the corpus's own as-of and left this
      // one on `Date.now()` — one of two sites, which is this repository's
      // most-repeated failure. The consequence had a date on it: the Treasury
      // tail is 2026-08-24, so the accepted 7.65 GB v4 cache would have gone
      // RED on 2026-08-31 on bytes that had not changed.
      //
      // The loop is what makes it serious rather than untidy. This refusal
      // reads "Rebuild per docs/cache-rebuild-r0.md; do not sweep or top up
      // against this cache" — while a thirty-second `--warm-only` top-up would
      // clear it. The instrument's own message forbids its own cheap remedy
      // and routes the operator to a fourteen-hour rebuild that spends metered
      // bytes from an allowance this project has already exhausted once.
      //
      // The staleness half is DEFERRED, because its bound is the corpus's own
      // as-of and the loop has not read every store yet. The head and gap
      // checks above need no such reference and stay here.
      // `lastTime` is non-null here by construction: an empty curve fails the
      // head check above and never reaches this line. Narrowed rather than
      // asserted, so a future change that admits an empty store is a type
      // error instead of a runtime one.
      if (
        !curveFailed && facts.lastTime !== null && facts.firstTime !== null
      ) {
        pendingCurves.push({
          clock: store.clock ?? "",
          facts: {
            ...facts,
            firstTime: facts.firstTime,
            lastTime: facts.lastTime,
          },
          key,
        });
      }
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
    // The longest silence inside the recent window — see sweepManifest.ts for
    // why an all-history maximum is too loose and an all-history p99 too tight.
    const recentGapStart = items[items.length - 1].time -
      DENSITY_RECENT_WINDOW_DAYS * 86_400_000;
    let recentMaxGapMs = 0;
    const recentGaps: number[] = [];
    for (let index = 1; index < items.length; index += 1) {
      if (items[index].time < recentGapStart) continue;
      const gap = items[index].time - items[index - 1].time;
      recentGaps.push(gap);
      if (gap > recentMaxGapMs) recentMaxGapMs = gap;
    }
    // The series' own bar interval, taken as the MEDIAN recent gap. Derived
    // rather than read off the key, and median rather than mode or minimum
    // so a doubled bar or a holiday cannot move it. Measured on the v4 cache
    // it lands exactly: 5.0 minutes for every 5min store, 15.0 for every
    // 15min one.
    recentGaps.sort((a, b) => a - b);
    const recentMedianGapMs = recentGaps.length > 0
      ? recentGaps[Math.floor(recentGaps.length / 2)]
      : 0;
    const slim: SlimSeries = {
      count: items.length,
      firstTime: items[0].time,
      recentMaxGapMs,
      recentMedianGapMs,
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
    // DEFERRED, because the bound needs an instant this loop does not have
    // yet — see the corpus-as-of note where these are drained.
    for (const [suffix, facts] of [["15min", fifteen], ["5min", five]] as const) {
      stalenessQueue.push({
        key: `${pairKey} ${suffix}`,
        lastTime: facts.lastTime,
        recentMaxGapMs: facts.recentMaxGapMs,
        recentMedianGapMs: facts.recentMedianGapMs,
      });
    }
    // R0f/C3: the ABSOLUTE registration test, beside the relative one above.
    // crossSeriesClock buckets day extremes on the UTC calendar day, so a
    // one-sided shift is visible only when it moves a high or low across UTC
    // midnight — for a market whose session sits INSIDE the day it issues a
    // clean bill at matchRateAtZero 1.000 rather than abstaining. The grid
    // test asks a question with no calendar in it: a parent must bracket its
    // own children, because they are the same trades.
    const grid = gridRegistration(fifteen.slim, five.slim);
    if (grid.verdict === "misregistered") {
      fail(
        `${pairKey}: ${grid.violations} of ${grid.judged} 15min parents do ` +
          `not bracket their own 5min children — the two series are not on ` +
          `one grid, whatever their day extremes say`,
      );
    } else if (grid.verdict === "unjudgeable") {
      fail(
        `${pairKey}: the 15min and 5min series share no common bar grid ` +
          `(judged ${grid.judged}) — not one parent could be checked ` +
          `against its own children`,
      );
    } else {
      ok(
        `${pairKey}: grid registered (${grid.judged} parents bracket their ` +
          `children)`,
      );
    }
    // R0e, as amended by the converge that ranked it (2026-08-24). Two
    // changes, and the second exists because the obvious version of the first
    // would have removed coverage while reading as convergence.
    //
    // JUDGE THE RECENT WINDOW. This is the same correction #382 made at the
    // corpus door: a band calibrated on complete recent data, applied to a
    // whole span that includes a market's thin early era, condemns honest
    // history. It moves DYDXUSD from 2.17 to 2.83 — inside the band — and
    // moves the nine thinnest markets by less than 0.07, so it is a real
    // measurement correction rather than a threshold loosened to fit.
    //
    // DO NOT PORT THE DOOR'S SLOT-DENSE FILTER. At the door that filter has a
    // fallback: a market it excludes still meets an absolute class floor.
    // Here there is no fallback, so porting it deletes the only instrument
    // judging the markets that already carry the least — ZOUSX and ZRUSD go
    // RED to unjudged, and ZCUSX, ZSUSX, ZLUSX, ZMUSD, LEUSX, GFUSX and
    // HEUSX go passing to unjudged.
    //
    // So the population SPLITS instead. A slot-dense market is judged by the
    // band. A market below that floor is judged CONSTRUCTIVELY, with no
    // constant at all: every 15-minute parent in the window must hold at
    // least one 5-minute child in [t, t+15m). That is the 1b sawtooth's
    // actual signature — it ran 0.6-1.0 children per parent, so parents stood
    // EMPTY — while honest sparseness thins a parent without emptying it.
    // The band cannot judge these markets because their parent-child
    // arithmetic legitimately degenerates: a parent holding one print yields
    // one child, so a thin market's ratio approaches 1 with nothing wrong.
    //
    // Measured 2026-08-24 across all nine, recent-90 window: ZERO empty
    // parents of 25,157. ZMUSD 0/4672, ZCUSX 0/4516, ZSUSX 0/4477,
    // ZLUSX 0/4433, ZOUSX 0/1985, ZRUSD 0/1540, LEUSX/GFUSX/HEUSX 0/1178
    // each. That is the evidence their low ratios are honest.
    const overlapStart = Math.max(fifteen.firstTime, five.firstTime);
    const overlapEnd = Math.min(fifteen.lastTime, five.lastTime);
    const windowStart = Math.max(
      overlapStart,
      overlapEnd - DENSITY_RECENT_WINDOW_DAYS * 86_400_000,
    );
    const inWindow = (series: SlimSeries) =>
      series.slim.reduce(
        (count, bar) =>
          bar.time >= windowStart && bar.time <= overlapEnd ? count + 1 : count,
        0,
      );
    const primaryRows = inWindow(fifteen);
    if (primaryRows >= DENSITY_MIN_PRIMARY_ROWS) {
      const windowDays = Math.max(
        1,
        (overlapEnd - windowStart) / 86_400_000,
      );
      const fiveRows = inWindow(five);
      const slotDense =
        Math.max(primaryRows / windowDays, fiveRows / windowDays / 3) >=
          DENSITY_RATIO_PRIMARY_FLOOR;
      if (slotDense) {
        const ratio = fiveRows / primaryRows;
        if (ratio < DENSITY_RATIO_FLOOR) {
          fail(
            `${pairKey}: 5min/15min density ${ratio.toFixed(2)} over the ` +
              `judged window — the 1b sawtooth signature (complete is ~3)`,
          );
        } else if (ratio > DENSITY_RATIO_CEILING) {
          fail(
            `${pairKey}: 5min/15min density ${ratio.toFixed(2)} over the ` +
              `judged window — ABOVE the complete ratio; a clipped 15-minute ` +
              `primary inflates this, it does not lower it`,
          );
        } else {
          ok(`${pairKey}: 5min/15min density ${ratio.toFixed(2)}`);
        }
      } else {
        // Bounded by the CHILD series' end for the same reason gridRegistration
        // is: a parent's children extend past its own timestamp, so
        // min(ends) drops the last parent even when its children exist.
        const lastChildTime = five.slim.length > 0
          ? five.slim[five.slim.length - 1].time
          : overlapEnd;
        const children = new Set(
          five.slim
            .filter((bar) =>
              bar.time >= windowStart && bar.time <= lastChildTime
            )
            .map((bar) => bar.time),
        );
        let empty = 0;
        let parents = 0;
        for (const bar of fifteen.slim) {
          // A parent is judged only when its WHOLE 15-minute span lies inside
          // the window. The last parent's third child sits at +10 minutes,
          // past overlapEnd, so judging it would condemn every healthy store
          // for one bar it could never cover — found by the fixture that
          // places its only child in the :10 slot.
          if (bar.time < windowStart || bar.time + 600_000 > lastChildTime) {
            continue;
          }
          parents += 1;
          if (
            !children.has(bar.time) &&
            !children.has(bar.time + 300_000) &&
            !children.has(bar.time + 600_000)
          ) {
            empty += 1;
          }
        }
        if (empty > 0) {
          fail(
            `${pairKey}: ${empty} of ${parents} 15min parents hold NO 5min ` +
              `child in the judged window — the 1b sawtooth signature on a ` +
              `market too sparse for the ratio to judge`,
          );
        } else {
          ok(
            `${pairKey}: every one of ${parents} 15min parents holds a 5min ` +
              `child (too sparse for the ratio; judged constructively)`,
          );
        }
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
    if (!ratesPresent) {
      fail(
        `treasury-rates: no curve store — the rebuild fetches it alongside ` +
          `the calendar, and E6 scores the curve into confidenceScore; a ` +
          `cache without it is incomplete`,
      );
    }
  }
  // THE CORPUS'S OWN AS-OF, not the wall clock.
  //
  // This defaulted to `Date.now()`, which made the verdict a property of WHEN
  // YOU RAN THE COMMAND rather than of the data. The v4 cache proved it
  // twice in ten minutes: green at 11:30 and red at 11:40, on bytes that had
  // not changed. A calibration corpus is swept for hours and read for weeks;
  // one that is only valid for the fifteen minutes after it was built is not
  // an instrument.
  //
  // The corpus's own newest observation is the honest as-of, and the sibling
  // instrument already used it — `corpusEndMs` in sweepStats.ts, a MAX across
  // symbols. Against it, a market that lapsed while its neighbours kept
  // publishing still ejects, which is the whole point of amendment 31; what
  // stops ejecting is the corpus simply having been built yesterday.
  //
  // The corpus's age against the wall clock is not lost — it is reported
  // below as its own line, because "this corpus is three days old" is worth
  // knowing and is not a per-market source failure.
  const corpusEndMs = stalenessQueue.reduce(
    (newest, entry) => Math.max(newest, entry.lastTime),
    Number.NEGATIVE_INFINITY,
  );
  const stalenessAsOf = asOfMs ?? corpusEndMs;
  if (Number.isFinite(corpusEndMs)) {
    for (const entry of stalenessQueue) {
      staleness(entry.key, entry, stalenessAsOf);
    }
    // The curve must COVER the corpus it will be joined against, so the corpus
    // is the reference — not the wall clock. A curve that has genuinely
    // stopped still falls behind the corpus's newest observation and still
    // ejects; what stops ejecting is a good cache being read a week later.
    for (const curve of pendingCurves) {
      const behindMs = stalenessAsOf - curve.facts.lastTime;
      if (behindMs > 7 * 86_400_000) {
        fail(
          `${curve.key}: newest row is ${iso(curve.facts.lastTime)}, ${
            Math.round(behindMs / 86_400_000)
          } days behind the corpus — every decision past the curve's end ` +
            `scores against months-old rows as if they were fresh. A ` +
            `--warm-only top-up refreshes the curve; a full rebuild is not ` +
            `required for this line alone`,
        );
        continue;
      }
      ok(
        `${curve.key}: ${curve.facts.count} curve rows ${
          iso(curve.facts.firstTime)
        }..${iso(curve.facts.lastTime)}, largest gap ${
          Math.round(curve.facts.largestGapMs / 86_400_000)
        }d, clock "${curve.clock}"`,
      );
    }
    const ageMs = Date.now() - corpusEndMs;
    lines.push(
      `  note corpus as-of ${
        new Date(corpusEndMs).toISOString().slice(0, 16)
      }Z, ${(ageMs / 3_600_000).toFixed(1)}h before this run`,
    );
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

function main(): void {
  const { str } = flagReader(process.argv, VALUE_FLAGS);
  const cacheDir = str("--cache-dir") ?? ".calibration-cache";
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
