import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { auditCacheClock } from "../scripts/verify-cache-clock.ts";
import {
  BAR_CLOCK,
  newYorkClockParts,
  newYorkWallClockToUtcMs,
} from "../supabase/functions/trade-analyzer/bars.ts";
import {
  CALENDAR_CLOCK,
  ECON_CALENDAR_CLOCK,
} from "../scripts/clockWitness.ts";
import { TREASURY_FETCH_START_MS } from "../scripts/sweepManifest.ts";

// R0's acceptance instrument, exercised against synthetic caches in every
// poisoned shape the rebuild must refuse (#358 finding: the instrument
// that guards a one-shot ~30GB operation was itself untested). The
// generators build the same series two ways — through the current
// normalizer and through the defect era's transform — so each RED line is
// earned on realistic store shapes, not hand-written verdicts.

// P5: a fixture's series ends where the fixture ends, so the audit is anchored
// THERE rather than at a hidden wall clock. Anchoring at `Date.now()` would
// make every fixture fail the staleness gate for the accident of having been
// written in the past, and a single shared constant fails whichever fixture
// ends earliest. Derived per directory instead: the newest bar in the store
// set under test. The staleness gate is then exercised DELIBERATELY, by the
// test that truncates a store, and never incidentally.
const HOUR = 3_600_000;
const DAY = 86_400_000;

type B = { close: number; high: number; low: number; open: number; time: number; volume: number };

const price = (k: number) => 100 + 10 * Math.sin(k / 37) + (k % 13) * 0.01;
const barAt = (time: number, k: number): B => {
  const p = price(k);
  return {
    close: p,
    high: p + 0.3,
    low: p - 0.5 - (k % 7) * 0.01,
    open: p - 0.1,
    time,
    volume: 1,
  };
};

const toNaive = (time: number) => {
  const parts = newYorkClockParts(time);
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
};

// Forex-shaped weeks: Sunday 17:00 NY open through Friday, spanning the
// Nov-2025 and Mar-2026 DST moves.
function forexSessions(): Array<{ close: number; open: number }> {
  const sessions: Array<{ close: number; open: number }> = [];
  const firstSunday = Date.UTC(2025, 7, 3);
  for (let week = 0; week < 40; week += 1) {
    const s = new Date(firstSunday + week * 7 * DAY);
    const open = newYorkWallClockToUtcMs(
      s.getUTCFullYear(),
      s.getUTCMonth() + 1,
      s.getUTCDate(),
      17,
      0,
      0,
    );
    sessions.push({ close: open + 5 * 24 * HOUR - HOUR, open });
  }
  return sessions;
}

function intraday(stepMs: number, naive: boolean): B[] {
  const bars: B[] = [];
  for (const { close, open } of forexSessions()) {
    for (let t = open; t < close; t += stepMs) {
      // Prices keyed to the 15-minute bucket so aggregating three fives
      // equals the fifteen exactly.
      bars.push(barAt(t, Math.floor((t - open) / 900_000)));
    }
  }
  if (!naive) {
    return bars;
  }
  return bars.map((b) => ({ ...b, time: toNaive(b.time) }));
}

function daily(naive: boolean): B[] {
  const bars: B[] = [];
  for (let d = 0; d < 300; d += 1) {
    const date = new Date(Date.UTC(2025, 6, 1) + d * DAY);
    const y = date.getUTCFullYear();
    const m = date.getUTCMonth() + 1;
    const dd = date.getUTCDate();
    const time = naive
      ? Date.UTC(y, m - 1, dd)
      : newYorkWallClockToUtcMs(y, m, dd, 0, 0, 0);
    bars.push(barAt(time, d));
  }
  return bars;
}

// NYSE-shaped reference days for the ^GSPC anchor: 09:30-16:00 NY wall.
function referenceIntraday(stepMinutes: number, naive: boolean): B[] {
  const bars: B[] = [];
  for (let index = 0; index < 320; index += 1) {
    const base = Date.UTC(2025, 7, 4) + index * DAY;
    const at = new Date(base);
    if (at.getUTCDay() === 0 || at.getUTCDay() === 6) {
      continue;
    }
    const perDay = Math.floor((390 / stepMinutes));
    for (let barIndex = 0; barIndex < perDay; barIndex += 1) {
      const wallMinutes = 9 * 60 + 30 + barIndex * stepMinutes;
      const time = newYorkWallClockToUtcMs(
        at.getUTCFullYear(),
        at.getUTCMonth() + 1,
        at.getUTCDate(),
        Math.floor(wallMinutes / 60),
        wallMinutes % 60,
        0,
      );
      bars.push(barAt(naive ? toNaive(time) : time, Math.floor(barIndex * stepMinutes / 15)));
    }
  }
  return bars;
}

const dirs: string[] = [];
function cacheDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "verify-clock-"));
  dirs.push(dir);
  return dir;
}
afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { force: true, recursive: true });
  }
});

/** The newest bar across every store in a fixture directory. */
function newestBarIn(dir: string): number {
  let newest = 0;
  for (const name of readdirSync(dir)) {
    if (!name.endsWith(".rolling.json")) continue;
    try {
      const items = JSON.parse(readFileSync(join(dir, name), "utf8")).items;
      if (!Array.isArray(items)) continue;
      for (const bar of items) {
        const time = (bar as { time?: number }).time;
        if (typeof time === "number" && time > newest) newest = time;
      }
    } catch {
      // A torn store has its own RED line; it contributes no anchor.
    }
  }
  return newest;
}

function store(dir: string, key: string, clock: string | undefined, items: unknown[]) {
  const body: Record<string, unknown> = { items, pinned: {} };
  if (clock !== undefined) {
    body.clock = clock;
  }
  writeFileSync(join(dir, `${key}.rolling.json`), JSON.stringify(body));
}

// A curve the sweep would accept: reaches TREASURY_FETCH_START_MS, steps in
// business-day-sized hops so no gap exceeds a week, and runs to today. The
// one-row fixtures this replaced were 13 years stale and a 4,600-day hole —
// they passed only because the gate checked presence and never coverage.
function healthyCurve(): Array<{ dateMs: number }> {
  const rows: Array<{ dateMs: number }> = [];
  for (
    let at = TREASURY_FETCH_START_MS;
    at <= Date.now();
    at += 5 * 86_400_000
  ) {
    rows.push({ dateMs: at });
  }
  rows.push({ dateMs: Date.now() });
  return rows;
}

function healthyTrio(dir: string) {
  store(dir, "EURUSD-15min-7000", BAR_CLOCK, intraday(900_000, false));
  store(dir, "EURUSD-5min-7000", BAR_CLOCK, intraday(300_000, false));
  store(dir, "EURUSD-daily-7000", BAR_CLOCK, daily(false));
}

describe("auditCacheClock — the rebuild's acceptance instrument", () => {
  // R1b's Treasury store fell through storeKindForKey to null, and the audit
  // fails every store whose kind is null — so a HEALTHY rebuilt cache earned
  // `treasury-rates: unknown store kind`, in the gate whose runbook says any
  // red means "the rebuild did not take; do not sweep, do not delete the
  // archive". Verified against the live rebuild in flight before the fix.
  it("accepts the calendar-clocked Treasury store instead of calling it unknown", () => {
    const dir = cacheDir();
    healthyTrio(dir);
    store(dir, "econ-calendar", ECON_CALENDAR_CLOCK, []);
    store(dir, "treasury-rates", CALENDAR_CLOCK, healthyCurve());
    const report = auditCacheClock({ asOfMs: newestBarIn(dir), cacheDir: dir, rosterProviderSymbols: ["EURUSD"] });
    const lines = report.lines.join("\n");
    assert.doesNotMatch(
      lines,
      /treasury-rates: unknown store kind/,
      "the Treasury store must be recognised, not read as an unknown key",
    );
    // The ok line now carries the coverage facts the gate actually checked —
    // span and largest gap — not just a row count, because a row count is what
    // certified a 25.4%-covered curve.
    assert.match(lines, /treasury-rates: \d+ curve rows \d{4}-\d{2}-\d{2}\.\.\d{4}-\d{2}-\d{2}, largest gap \d+d/);
  });

  // "An empty store counts as absent" — this file's doctrine, which the first
  // version of the rates branch broke by printing ok on zero rows. A zero-row
  // curve passes the acceptance gate and dies at replay-sweep's own refusal one
  // step later, after the operator has been told the rebuild took.
  it("condemns an EMPTY Treasury store rather than calling it green", () => {
    const dir = cacheDir();
    healthyTrio(dir);
    store(dir, "econ-calendar", ECON_CALENDAR_CLOCK, []);
    store(dir, "treasury-rates", CALENDAR_CLOCK, []);
    const report = auditCacheClock({ asOfMs: newestBarIn(dir), cacheDir: dir, rosterProviderSymbols: ["EURUSD"] });
    assert.ok(
      report.failures.some((line) => /curve store is EMPTY/.test(line)),
      report.failures.join("\n") || "(no failures)",
    );
  });

  it("fails a roster cache with no Treasury store at all", () => {
    const dir = cacheDir();
    healthyTrio(dir);
    store(dir, "econ-calendar", ECON_CALENDAR_CLOCK, []);
    const report = auditCacheClock({ asOfMs: newestBarIn(dir), cacheDir: dir, rosterProviderSymbols: ["EURUSD"] });
    assert.ok(
      report.failures.some((line) => /no curve store/.test(line)),
      report.failures.join("\n") || "(no failures)",
    );
  });

  // The coverage gates, mirroring the three refusals the SWEEP makes on this
  // store. Before them, step 3 printed `ok treasury-rates: 853 curve rows` on
  // a curve measured at 25.4% coverage with a 278-day hole — and the operator
  // learned only at R3, after a ~14-hour rebuild was already spent.
  it("condemns a curve whose head never reaches the requested start", () => {
    const dir = cacheDir();
    healthyTrio(dir);
    calendarStore(dir);
    // The live store's exact shape: nine months short at the head.
    const late = healthyCurve().filter(
      (row) => row.dateMs >= TREASURY_FETCH_START_MS + 275 * 86_400_000,
    );
    store(dir, "treasury-rates", CALENDAR_CLOCK, late);
    const report = auditCacheClock({ asOfMs: newestBarIn(dir), cacheDir: dir, rosterProviderSymbols: ["EURUSD"] });
    assert.ok(
      report.failures.some((line) => /the head is \d+ days short/.test(line)),
      report.failures.join("\n") || "(no failures)",
    );
  });

  it("condemns a curve with a week-plus interior hole", () => {
    const dir = cacheDir();
    healthyTrio(dir);
    calendarStore(dir);
    // Drop a year out of the middle — the 278-day hole the live store carried.
    const cut = TREASURY_FETCH_START_MS + 900 * 86_400_000;
    const holed = healthyCurve().filter(
      (row) => row.dateMs < cut || row.dateMs > cut + 278 * 86_400_000,
    );
    store(dir, "treasury-rates", CALENDAR_CLOCK, holed);
    const report = auditCacheClock({ asOfMs: newestBarIn(dir), cacheDir: dir, rosterProviderSymbols: ["EURUSD"] });
    assert.ok(
      report.failures.some((line) => /largest interior gap is 2\d\d days/.test(line)),
      report.failures.join("\n") || "(no failures)",
    );
  });

  it("condemns a curve whose tail is stale", () => {
    const dir = cacheDir();
    healthyTrio(dir);
    calendarStore(dir);
    // Stale RELATIVE TO THE CORPUS, which is what the bound now measures.
    // This filtered on `Date.now() - 60d`, which was written for a wall-clock
    // bound and left the curve ending AFTER the bars — a curve ahead of its
    // own corpus, which is not stale by any reading. Truncating against the
    // newest bar is what the test always meant.
    const corpusEnd = newestBarIn(dir);
    const stale = healthyCurve().filter(
      (row) => row.dateMs < corpusEnd - 60 * DAY,
    );
    store(dir, "treasury-rates", CALENDAR_CLOCK, stale);
    const report = auditCacheClock({ asOfMs: newestBarIn(dir), cacheDir: dir, rosterProviderSymbols: ["EURUSD"] });
    assert.ok(
      report.failures.some((line) => /days behind the corpus/.test(line)),
      report.failures.join("\n") || "(no failures)",
    );
    // The refusal must name the cheap remedy. It used to say "Rebuild per
    // docs/cache-rebuild-r0.md; do not sweep or top up against this cache" —
    // forbidding the thirty-second `--warm-only` top-up that clears it and
    // routing the operator to a fourteen-hour rebuild that spends metered
    // bytes.
    assert.ok(
      report.failures.some((line) => /--warm-only top-up/.test(line)),
      "the curve refusal must name the top-up that clears it",
    );
  });

  it("does NOT condemn a curve that is current with its own corpus", () => {
    // THE REGRESSION THIS FIX EXISTS FOR. #420 made bar staleness
    // corpus-relative and left the curve on `Date.now()`, so the accepted
    // 7.65 GB v4 cache — Treasury tail 2026-08-24 — would have gone RED on
    // 2026-08-31 on bytes that had not changed.
    //
    // Here the curve ends with the bars and the whole corpus sits weeks in the
    // past, which is the ordinary state of a cache being read after it was
    // built. Under a wall-clock bound this fails; under a corpus-relative one
    // it passes, and a genuinely stopped feed still falls behind the corpus.
    const dir = cacheDir();
    healthyTrio(dir);
    calendarStore(dir);
    const newest = newestBarIn(dir);
    // The curve ends WITH the corpus, not with the wall clock. That is the
    // only fixture that separates the two bounds: `healthyCurve()` runs to
    // Date.now(), so it reads fresh under either and an earlier draft of this
    // test passed while the wall-clock bound was still in place.
    const curve = healthyCurve().filter((row) => row.dateMs <= newest);
    store(dir, "treasury-rates", CALENDAR_CLOCK, curve);
    assert.ok(
      Date.now() - newest > 8 * DAY,
      "the fixture caught up with the clock — pick an older instant",
    );
    assert.ok(
      newest - curve[curve.length - 1].dateMs < 7 * DAY,
      "the curve must end with the corpus for this test to mean anything",
    );
    const report = auditCacheClock({ cacheDir: dir, rosterProviderSymbols: ["EURUSD"] });
    assert.ok(
      !report.failures.some((line) => /behind the corpus/.test(line)),
      `a corpus-current curve must not read as stale: ${
        report.failures.join("\n")
      }`,
    );
  });

  it("still condemns a Treasury store stamped with the bar clock", () => {
    const dir = cacheDir();
    healthyTrio(dir);
    store(dir, "econ-calendar", ECON_CALENDAR_CLOCK, []);
    store(dir, "treasury-rates", BAR_CLOCK, [{ time: Date.UTC(2013, 0, 2) }]);
    const report = auditCacheClock({ asOfMs: newestBarIn(dir), cacheDir: dir, rosterProviderSymbols: ["EURUSD"] });
    assert.ok(
      report.failures.some((line) => /treasury-rates: stamped/.test(line)),
      report.failures.join("\n"),
    );
  });

  // The rates store must not stand in for a missing calendar — which is why it
  // is its own kind rather than folded into the calendar branch.
  it("does not let the Treasury store satisfy the calendar-presence gate", () => {
    const dir = cacheDir();
    healthyTrio(dir);
    store(dir, "treasury-rates", CALENDAR_CLOCK, healthyCurve());
    const report = auditCacheClock({ asOfMs: newestBarIn(dir), cacheDir: dir, rosterProviderSymbols: ["EURUSD"] });
    // The gate's OWN text. `/calendar/i` also matches every condemnation line,
    // because CALENDAR_CLOCK is "fmp-calendar-utc-v1" — the assertion would
    // have passed on the wrong failure.
    assert.ok(
      report.failures.some((line) => /no calendar store/.test(line)),
      `a cache with no econ-calendar must fail; got: ${
        report.failures.join("\n") || "(no failures)"
      }`,
    );
  });

  it("passes a healthy stamped cache clean", () => {
    const dir = cacheDir();
    healthyTrio(dir);
    store(dir, "econ-calendar", ECON_CALENDAR_CLOCK, [
      { currency: "USD", impact: "high", time: Date.UTC(2026, 0, 3, 13, 30) },
    ]);
    const audit = auditCacheClock({ asOfMs: newestBarIn(dir), cacheDir: dir });
    assert.deepEqual(audit.failures, []);
    assert.ok(audit.lines.some((line) => line.includes("density 3.00")));
  });

  it("fails every store of the condemned pre-R0 shape — unstamped", () => {
    const dir = cacheDir();
    store(dir, "EURUSD-15min-7000", undefined, intraday(900_000, true));
    store(dir, "EURUSD-5min-7000", undefined, intraday(300_000, false));
    store(dir, "EURUSD-daily-7000", undefined, daily(true));
    const audit = auditCacheClock({ asOfMs: newestBarIn(dir), cacheDir: dir });
    assert.equal(audit.failures.length, 3);
    for (const failure of audit.failures) {
      assert.match(failure, /unstamped — pre-R0/);
    }
  });

  it("condemns naive daily DATA behind a correct stamp — the witness half", () => {
    const dir = cacheDir();
    store(dir, "EURUSD-15min-7000", BAR_CLOCK, intraday(900_000, false));
    store(dir, "EURUSD-5min-7000", BAR_CLOCK, intraday(300_000, false));
    store(dir, "EURUSD-daily-7000", BAR_CLOCK, daily(true));
    const audit = auditCacheClock({ asOfMs: newestBarIn(dir), cacheDir: dir });
    assert.equal(audit.failures.length, 1);
    assert.match(audit.failures[0], /daily.*"naive"/s);
  });

  it("condemns the actual 2026-08-11 shape — naive primary, true 5-minute — via registration", () => {
    const dir = cacheDir();
    store(dir, "EURUSD-15min-7000", BAR_CLOCK, intraday(900_000, true));
    store(dir, "EURUSD-5min-7000", BAR_CLOCK, intraday(300_000, false));
    store(dir, "EURUSD-daily-7000", BAR_CLOCK, daily(false));
    const audit = auditCacheClock({ asOfMs: newestBarIn(dir), cacheDir: dir });
    assert.ok(
      audit.failures.some((line) => /registers at -4h/.test(line)),
      audit.failures.join("\n"),
    );
  });

  it("condemns the 1b sawtooth by density even with clean clocks", () => {
    const dir = cacheDir();
    store(dir, "EURUSD-15min-7000", BAR_CLOCK, intraday(900_000, false));
    store(
      dir,
      "EURUSD-5min-7000",
      BAR_CLOCK,
      intraday(300_000, false).filter((_, index) => index % 3 === 0),
    );
    store(dir, "EURUSD-daily-7000", BAR_CLOCK, daily(false));
    const audit = auditCacheClock({ asOfMs: newestBarIn(dir), cacheDir: dir });
    assert.ok(audit.failures.some((line) => /sawtooth/.test(line)));
  });

  // R0e as amended (2026-08-24). A market below the corpus door's slot-dense
  // floor cannot be judged by the ratio: its parent-child arithmetic
  // legitimately degenerates, since a 15-minute parent holding one print
  // yields exactly one 5-minute child, so an honest thin market reads ~1.0
  // against a band whose floor is 2.5. The door handles that by EXCLUDING
  // such markets — it has an absolute class floor to fall back on. This
  // auditor has none, so excluding them here would leave the nine thinnest
  // markets in the roster judged by nothing at all.
  //
  // So they are judged constructively instead, with no constant: every parent
  // must hold at least one child. This pair is the proof — the same sparse
  // market passes when its parents are populated and fails when they are not,
  // and the ratio never speaks for it either way.
  const sparsePair = (emptyEveryNth: number) => {
    const parents: B[] = [];
    const children: B[] = [];
    let index = 0;
    for (const { close, open } of forexSessions()) {
      for (let t = open; t < close; t += 900_000) {
        // Thin to ~34 15-minute rows/day, below the slot-dense floor of 60.
        if (index++ % 2 !== 0) continue;
        const k = Math.floor((t - open) / 900_000);
        parents.push(barAt(t, k));
        const empty = emptyEveryNth > 0 && parents.length % emptyEveryNth === 0;
        if (!empty) children.push(barAt(t, k));
      }
    }
    return { children, parents };
  };

  it("judges a market too sparse for the ratio constructively, instead of dropping it", () => {
    const dir = cacheDir();
    const { children, parents } = sparsePair(0);
    store(dir, "EURUSD-15min-7000", BAR_CLOCK, parents);
    store(dir, "EURUSD-5min-7000", BAR_CLOCK, children);
    store(dir, "EURUSD-daily-7000", BAR_CLOCK, daily(false));
    const audit = auditCacheClock({ asOfMs: newestBarIn(dir), cacheDir: dir });
    // One child per parent is a ratio of 1.0 — far under the band's 2.5 floor.
    // The band must not speak for this market at all.
    assert.ok(
      !audit.failures.some((line) => /sawtooth/.test(line)),
      `an honestly sparse market must not be condemned: ${audit.failures.join("\n")}`,
    );
    assert.ok(
      !audit.lines.some((line) => /EURUSD.*5min\/15min density/.test(line)),
      "the ratio must not judge a market below the slot-dense floor",
    );
    // And it must be JUDGED, not silently skipped — the whole point of the
    // amendment. Without this the test passes for a market nothing looked at.
    assert.ok(
      audit.lines.some((line) =>
        /EURUSD.*parents holds a 5min child.*judged constructively/.test(line)
      ),
      `the sparse market must be judged constructively: ${audit.lines.join("\n")}`,
    );
  });

  it("counts a child in ANY of the parent's three slots, not just the first", () => {
    // The fixtures above place every child at its parent's own timestamp, so
    // a coverage check looking at only the first two slots passes them. A real
    // thin market prints wherever the trade fell. Here the ONLY child sits in
    // the third slot, :10.
    const dir = cacheDir();
    const parents: B[] = [];
    const children: B[] = [];
    let index = 0;
    for (const { close, open } of forexSessions()) {
      for (let t = open; t < close; t += 900_000) {
        if (index++ % 2 !== 0) continue;
        const k = Math.floor((t - open) / 900_000);
        parents.push(barAt(t, k));
        children.push(barAt(t + 600_000, k));
      }
    }
    store(dir, "EURUSD-15min-7000", BAR_CLOCK, parents);
    store(dir, "EURUSD-5min-7000", BAR_CLOCK, children);
    store(dir, "EURUSD-daily-7000", BAR_CLOCK, daily(false));
    const audit = auditCacheClock({ asOfMs: newestBarIn(dir), cacheDir: dir });
    assert.ok(
      !audit.failures.some((line) => /hold NO 5min child/.test(line)),
      `a child in the :10 slot still covers its parent: ${audit.failures.join("\n")}`,
    );
  });

  it("judges the RECENT window, so a thin early era does not condemn a healthy feed", () => {
    // DYDXUSD's shape, which is why the window half of R0e is a real
    // correction rather than a loosened threshold: whole-span it reads 2.17
    // and is condemned; over the judged window it reads 2.83 and is clean.
    // Here the 15-minute primary is complete throughout while the 5-minute
    // series carries one child per parent in its early era and all three
    // recently.
    const dir = cacheDir();
    const parents = intraday(900_000, false);
    const lastTime = parents[parents.length - 1].time;
    const recentFrom = lastTime - 95 * DAY;
    const children = intraday(300_000, false).filter((bar, position) =>
      bar.time >= recentFrom ? true : position % 3 === 0
    );
    store(dir, "EURUSD-15min-7000", BAR_CLOCK, parents);
    store(dir, "EURUSD-5min-7000", BAR_CLOCK, children);
    store(dir, "EURUSD-daily-7000", BAR_CLOCK, daily(false));
    const audit = auditCacheClock({ asOfMs: newestBarIn(dir), cacheDir: dir });
    assert.ok(
      !audit.failures.some((line) => /sawtooth/.test(line)),
      `the thin early era must not condemn: ${audit.failures.join("\n")}`,
    );
    assert.ok(
      audit.lines.some((line) => /EURUSD.*5min\/15min density 3\.00/.test(line)),
      `the judged window must read ~3: ${audit.lines.join("\n")}`,
    );
  });

  it("condemns the sawtooth on a sparse market through the empty parents", () => {
    const dir = cacheDir();
    // One parent in five holds no child at all. That is the 1b sawtooth's
    // actual signature; honest sparseness thins a parent without emptying it.
    const { children, parents } = sparsePair(5);
    store(dir, "EURUSD-15min-7000", BAR_CLOCK, parents);
    store(dir, "EURUSD-5min-7000", BAR_CLOCK, children);
    store(dir, "EURUSD-daily-7000", BAR_CLOCK, daily(false));
    const audit = auditCacheClock({ asOfMs: newestBarIn(dir), cacheDir: dir });
    assert.ok(
      audit.failures.some((line) =>
        /parents hold NO 5min child.*sawtooth/.test(line)
      ),
      `empty parents must condemn: ${audit.failures.join("\n")}`,
    );
  });

  // P5. Nothing anywhere asked whether a bar feed had STOPPED. `staleMs` lived
  // at exactly one site — the Treasury branch — and `recentWindow` ends its
  // 90-day window at the SERIES' OWN last bar, so a store truncated 200 days
  // ago measures density over a window that ended 200 days ago and reports the
  // theoretical maximum. Proven on the real cache: BTCUSD truncated as though
  // dead 200 days reads 288.0 rows/day, recentSpanDays 90, verdict "utc" —
  // identical to live, and it clears the 260 floor.
  it("fails a store whose feed has stopped, as a SOURCE failure", () => {
    const dir = cacheDir();
    const fifteen = intraday(900_000, false);
    const five = intraday(300_000, false);
    // Truncate the 15-minute store 30 days back. Its own recent-window gaps
    // are weekends of ~2 days, so a 30-day silence is unprecedented for it.
    const cut = fifteen[fifteen.length - 1].time - 30 * DAY;
    store(dir, "EURUSD-15min-7000", BAR_CLOCK, fifteen.filter((b) => b.time <= cut));
    store(dir, "EURUSD-5min-7000", BAR_CLOCK, five);
    store(dir, "EURUSD-daily-7000", BAR_CLOCK, daily(false));
    const audit = auditCacheClock({ asOfMs: newestBarIn(dir), cacheDir: dir });
    assert.ok(
      audit.failures.some((line) => /SOURCE FAILURE.*silent for 3[0-9]\.\d\d days/.test(line)),
      `a stopped feed must be caught: ${audit.failures.join("\n")}`,
    );
    // Amendment 31 types it: a lapsed feed is a SOURCE failure that ejects
    // automatically, never a calibration verdict. The wording must say so, or
    // an operator reads it as the density gate's opinion about the market.
    assert.ok(
      audit.failures.some((line) =>
        /not a density or calibration verdict/.test(line)
      ),
    );
  });

  it("takes the bound from the RECENT window, not from an ancient outage", () => {
    // The statistic matters and this is the case that separates the
    // candidates. 25 of the roster's real stores carry a historical gap of 14
    // days or more, and NZDUSD carries 72 — so a bound taken over ALL history
    // lets a market sit silent for as long as its worst past outage. Here an
    // old 60-day hole sits early in the series and the store then stops for
    // 30 days. Under an all-history bound the 30-day silence is "normal for
    // this market" and passes; under the recent window it is unprecedented.
    const dir = cacheDir();
    const fifteen = intraday(900_000, false);
    const five = intraday(300_000, false);
    const start = fifteen[0].time;
    // Punch a 60-day hole out of the early history, well outside the recent
    // window, then truncate the tail 30 days back.
    const holeFrom = start + 20 * DAY;
    const holeTo = holeFrom + 60 * DAY;
    const cut = fifteen[fifteen.length - 1].time - 30 * DAY;
    const holed = fifteen.filter((b) =>
      (b.time < holeFrom || b.time > holeTo) && b.time <= cut
    );
    store(dir, "EURUSD-15min-7000", BAR_CLOCK, holed);
    store(dir, "EURUSD-5min-7000", BAR_CLOCK, five);
    store(dir, "EURUSD-daily-7000", BAR_CLOCK, daily(false));
    const audit = auditCacheClock({ asOfMs: newestBarIn(dir), cacheDir: dir });
    assert.ok(
      audit.failures.some((line) => /EURUSD.*15min: SOURCE FAILURE/.test(line)),
      `an old outage must not license a new silence: ${audit.failures.join("\n")}`,
    );
  });

  it("does NOT fail a market for a silence it has had before", () => {
    // The bound is the market's own longest RECENT gap, so a weekend cannot
    // trip it. A flat bound could not do this: 7 days is right for a daily
    // curve, far too loose for a 24/7 5-minute store and too tight for a grain
    // future's weekend-plus-holiday gap.
    const dir = cacheDir();
    healthyTrio(dir);
    const newest = newestBarIn(dir);
    const audit = auditCacheClock({
      // Two days on — inside a forex weekend, which this market has every week.
      asOfMs: newest + 2 * DAY,
      cacheDir: dir,
    });
    assert.ok(
      !audit.failures.some((line) => /SOURCE FAILURE/.test(line)),
      `a lawful weekend must not read as a lapsed feed: ${audit.failures.join("\n")}`,
    );
  });

  /**
   * A 24/7 series with NO lawful gaps — crypto-shaped.
   *
   * The forex trio cannot exercise the in-flight grace: its recent maximum
   * gap is a weekend, which dwarfs two bar intervals, so every silence under
   * three days is trivially lawful and the grace is never reached. The first
   * draft of these tests used it and survived every mutation — inert, and
   * guarding the one bound this change loosened.
   *
   * Here the recent maximum gap IS the interval, which is exactly the real
   * shape that failed: 17 crypto 5-minute stores at 10.0 minutes silent
   * against a 5.0-minute maximum.
   */
  const continuousPair = (dir: string, stepMs: number) => {
    const end = Date.UTC(2026, 7, 20);
    const build = (step: number) => {
      const out: B[] = [];
      for (let t = end - 200 * DAY; t <= end; t += step) {
        out.push(barAt(t, Math.floor(t / 900_000)));
      }
      return out;
    };
    store(dir, "BTCUSD-15min-7000", BAR_CLOCK, build(900_000));
    store(dir, "BTCUSD-5min-7000", BAR_CLOCK, build(stepMs));
    return end;
  };

  it("judges staleness against the CORPUS, not the wall clock, by default", () => {
    // The change this instrument turns on, and nothing pinned it: every other
    // test here passes asOfMs explicitly, so the DEFAULT was unexercised and
    // reverting it to Date.now() failed nothing.
    //
    // It defaulted to the wall clock, which made the verdict a property of
    // when you ran the command rather than of the data. The v4 cache proved
    // it twice in ten minutes — green at 11:30, red at 11:40, on bytes that
    // had not changed.
    //
    // These fixtures end at a FIXED past instant, so under a wall-clock
    // default they read as days of silence and eject; under the corpus's own
    // as-of they are current, which is what they are.
    const dir = cacheDir();
    const newest = continuousPair(dir, 300_000);
    assert.ok(
      Date.now() - newest > 2 * DAY,
      "the fixture caught up with the clock — pick an older instant",
    );
    const audit = auditCacheClock({ cacheDir: dir });
    assert.ok(
      !audit.failures.some((line) => /SOURCE FAILURE/.test(line)),
      `a corpus is not a lapsed feed for having been built earlier: ${
        audit.failures.join("\n")
      }`,
    );
  });

  it("runs the staleness gate on a cache with no COT files", () => {
    // The drain was first written INSIDE `if (cotNames.length > 0)`, so the
    // gate ran on the real cache (20 contract files) and on nothing else.
    // Five tests went red and reported empty failure lists — the shape this
    // whole instrument exists to refuse: a check that silently does not run
    // reads exactly like a check that passed.
    //
    // Every fixture here is COT-free, so this asserts the gate reaches them.
    const dir = cacheDir();
    const newest = continuousPair(dir, 300_000);
    assert.equal(
      readdirSync(dir).filter((name) => name.startsWith("cot-")).length,
      0,
      "fixture gained COT files — this test no longer proves anything",
    );
    const audit = auditCacheClock({
      asOfMs: newest + 30 * 60_000,
      cacheDir: dir,
    });
    assert.ok(
      audit.failures.some((line) => /SOURCE FAILURE/.test(line)),
      "the staleness gate did not run without COT files present",
    );
  });

  it("does NOT fail a dense 24/7 series for the bar still in flight", () => {
    // The real failing case. Recent maximum gap is one interval, so without
    // the grace ANY trailing silence beyond a single bar reads as a lapsed
    // feed — and trailing silence is [1, 2) intervals from a perfect feed.
    const dir = cacheDir();
    const newest = continuousPair(dir, 300_000);
    const audit = auditCacheClock({
      asOfMs: newest + 10 * 60_000, // two 5-minute intervals
      cacheDir: dir,
    });
    assert.ok(
      !audit.failures.some((line) => /5min: SOURCE FAILURE/.test(line)),
      `two intervals in flight must be lawful: ${audit.failures.join("\n")}`,
    );
  });

  it("DOES fail the same series once the silence passes the grace", () => {
    // The bound is maximum gap plus two intervals — 15 minutes here — so the
    // grace is bounded and a widened one is caught. Without this the previous
    // test alone would pass under any grace, however absurd.
    const dir = cacheDir();
    const newest = continuousPair(dir, 300_000);
    const audit = auditCacheClock({
      asOfMs: newest + 30 * 60_000, // six intervals: past 5 + 2x5
      cacheDir: dir,
    });
    assert.ok(
      audit.failures.some((line) => /5min: SOURCE FAILURE/.test(line)),
      `six intervals of silence must eject: ${audit.failures.join("\n")}`,
    );
  });

  it("does NOT fail a healthy dense series for the bar still in flight", () => {
    // Trailing silence and a gap between bars are different quantities. A gap
    // is a completed interval; the trailing silence includes the bar
    // currently forming, which cannot have been published yet — so structural
    // silence is [1, 2) intervals even from a perfect feed.
    //
    // Before this was allowed for, the gate refused 17 crypto 5-minute stores
    // on the real v4 cache at 10.0 minutes silent against a 5.0-minute recent
    // maximum, while their 15-minute siblings passed at 15.0 against 15.0 —
    // by one minute of luck. A gate that could not pass a healthy dense
    // series was measuring the clock it ran on, not the feed.
    const dir = cacheDir();
    healthyTrio(dir);
    const newest = newestBarIn(dir);
    for (const intervals of [1, 2]) {
      const audit = auditCacheClock({
        // One and two 15-minute intervals past the newest bar.
        asOfMs: newest + intervals * 15 * 60_000,
        cacheDir: dir,
      });
      assert.ok(
        !audit.failures.some((line) => /SOURCE FAILURE/.test(line)),
        `${intervals} interval(s) of in-flight silence must be lawful: ${
          audit.failures.join("\n")
        }`,
      );
    }
  });

  it("keeps the grace at the INTERVAL, not the market's worst gap", () => {
    // The grace is two BAR INTERVALS, taken as the median recent gap. Taking
    // it from the maximum instead would scale it to the market's worst lawful
    // silence: on a forex store that is a weekend, so the bound would become
    // roughly three days plus two weekends — about nine — and a genuine
    // multi-day outage would read as lawful.
    //
    // Five days is past a weekend-shaped maximum and inside that inflated
    // bound, which is the only place the two differ.
    const dir = cacheDir();
    healthyTrio(dir);
    const audit = auditCacheClock({
      asOfMs: newestBarIn(dir) + 5 * DAY,
      cacheDir: dir,
    });
    assert.ok(
      audit.failures.some((line) => /SOURCE FAILURE/.test(line)),
      `five days of silence must eject a weekend-gapped store: ${
        audit.failures.join("\n")
      }`,
    );
  });

  it("STILL fails a feed that actually stopped — the grace is minutes, not days", () => {
    // The bound gained two bar intervals, which is minutes. A lapsed feed is
    // silent for hours or days, so the detection this gate exists for is
    // untouched. Asserted directly, because a grace that swallowed the defect
    // would be worse than the false positives it removed.
    const dir = cacheDir();
    healthyTrio(dir);
    const newest = newestBarIn(dir);
    const audit = auditCacheClock({
      asOfMs: newest + 10 * DAY,
      cacheDir: dir,
    });
    assert.ok(
      audit.failures.some((line) => /SOURCE FAILURE/.test(line)),
      `ten days of silence must still eject: ${audit.failures.join("\n")}`,
    );
  });

  it("reports a corrupt store as a RED line instead of crashing the listing", () => {
    const dir = cacheDir();
    healthyTrio(dir);
    writeFileSync(join(dir, "BTCUSD-15min-7000.rolling.json"), '{"items":[{"ti');
    const audit = auditCacheClock({ asOfMs: newestBarIn(dir), cacheDir: dir });
    assert.ok(audit.failures.some((line) => /unreadable store/.test(line)));
  });

  it("fails a symbol whose daily store is missing — the universal witness must exist", () => {
    const dir = cacheDir();
    store(dir, "EURUSD-15min-7000", BAR_CLOCK, intraday(900_000, false));
    store(dir, "EURUSD-5min-7000", BAR_CLOCK, intraday(300_000, false));
    const audit = auditCacheClock({ asOfMs: newestBarIn(dir), cacheDir: dir });
    assert.ok(audit.failures.some((line) => /no daily store/.test(line)));
  });

  it("fails an intraday store with no mate — rebuild incomplete", () => {
    const dir = cacheDir();
    store(dir, "EURUSD-15min-7000", BAR_CLOCK, intraday(900_000, false));
    store(dir, "EURUSD-daily-7000", BAR_CLOCK, daily(false));
    const audit = auditCacheClock({ asOfMs: newestBarIn(dir), cacheDir: dir });
    assert.ok(audit.failures.some((line) => /no 5min mate/.test(line)));
  });

  it("reconciles against the supplied roster — an absent symbol is incomplete, not invisible", () => {
    const dir = cacheDir();
    healthyTrio(dir);
    const audit = auditCacheClock({
      asOfMs: newestBarIn(dir),
      cacheDir: dir,
      rosterProviderSymbols: ["EURUSD", "BTCUSD"],
    });
    assert.ok(
      audit.failures.some((line) => /BTCUSD: on the scan roster but has NO stores/.test(line)),
    );
  });

  it("fails a large-overlap pair that cannot prove alignment — uncertainty fails the acceptance", () => {
    const dir = cacheDir();
    // Same clocks, but the 5-minute prices disagree beyond tolerance on
    // every day: no shift explains it, and 200+ shared days of "cannot
    // tell" is not a pass at this gate.
    store(dir, "EURUSD-15min-7000", BAR_CLOCK, intraday(900_000, false));
    store(
      dir,
      "EURUSD-5min-7000",
      BAR_CLOCK,
      intraday(300_000, false).map((b) => ({ ...b, high: b.high + 0.01, low: b.low - 0.01 })),
    );
    store(dir, "EURUSD-daily-7000", BAR_CLOCK, daily(false));
    const audit = auditCacheClock({ asOfMs: newestBarIn(dir), cacheDir: dir });
    assert.ok(
      audit.failures.some((line) => /registration INDETERMINATE over \d+ shared days/.test(line)),
      audit.failures.join("\n"),
    );
  });

  it("pins the ceiling's boundary on both sides — the stated blind band reads green, past it reads red (#358 round 5)", () => {
    // A ~10% primary clip (ratio ~3.33) sits INSIDE the ceiling's stated
    // blind band and passes — that is the documented limit, pinned green
    // so nobody mistakes the band for coverage. A ~20% clip (ratio 3.75)
    // crosses the 3.5 ceiling and fails.
    const inBand = cacheDir();
    store(
      inBand,
      "EURUSD-15min-7000",
      BAR_CLOCK,
      intraday(900_000, false).filter((_, index) => index % 10 !== 9),
    );
    store(inBand, "EURUSD-5min-7000", BAR_CLOCK, intraday(300_000, false));
    store(inBand, "EURUSD-daily-7000", BAR_CLOCK, daily(false));
    const green = auditCacheClock({ asOfMs: newestBarIn(inBand), cacheDir: inBand });
    assert.ok(
      !green.failures.some((line) => /ABOVE the complete ratio/.test(line)),
      green.failures.join("\n"),
    );

    const pastBand = cacheDir();
    store(
      pastBand,
      "EURUSD-15min-7000",
      BAR_CLOCK,
      intraday(900_000, false).filter((_, index) => index % 5 !== 4),
    );
    store(pastBand, "EURUSD-5min-7000", BAR_CLOCK, intraday(300_000, false));
    store(pastBand, "EURUSD-daily-7000", BAR_CLOCK, daily(false));
    const red = auditCacheClock({ asOfMs: newestBarIn(pastBand), cacheDir: pastBand });
    assert.ok(
      red.failures.some((line) => /ABOVE the complete ratio/.test(line)),
      red.failures.join("\n"),
    );
  });

  it("condemns an INFLATED density — a clipped 15-minute primary reads above 3, not below (#358 round 4)", () => {
    const dir = cacheDir();
    // Thin the PRIMARY to half: the floor-only check read this pair as
    // greener (ratio 6); the ceiling catches it.
    store(
      dir,
      "EURUSD-15min-7000",
      BAR_CLOCK,
      intraday(900_000, false).filter((_, index) => index % 2 === 0),
    );
    store(dir, "EURUSD-5min-7000", BAR_CLOCK, intraday(300_000, false));
    store(dir, "EURUSD-daily-7000", BAR_CLOCK, daily(false));
    const audit = auditCacheClock({ asOfMs: newestBarIn(dir), cacheDir: dir });
    assert.ok(
      audit.failures.some((line) => /ABOVE the complete ratio/.test(line)),
      audit.failures.join("\n"),
    );
  });

  it("fails a deep daily store whose witness resolved nothing — green must mean decided (#358 round 4)", () => {
    const dir = cacheDir();
    store(dir, "EURUSD-15min-7000", BAR_CLOCK, intraday(900_000, false));
    store(dir, "EURUSD-5min-7000", BAR_CLOCK, intraday(300_000, false));
    // 300 rows stamped at neither midnight (hour 12 UTC): every year
    // undecided, verdict indeterminate at a depth where that is not
    // youth, it is a store the universal witness cannot read.
    store(
      dir,
      "EURUSD-daily-7000",
      BAR_CLOCK,
      daily(false).map((b, index) => ({
        ...b,
        time: Date.UTC(2025, 6, 1, 12) + index * DAY,
      })),
    );
    const audit = auditCacheClock({ asOfMs: newestBarIn(dir), cacheDir: dir });
    assert.ok(
      audit.failures.some((line) => /daily witness resolved NOTHING/.test(line)),
      audit.failures.join("\n"),
    );
  });

  it("anchors the reference symbol at its venue open, and condemns a displaced store", () => {
    const healthy = cacheDir();
    store(healthy, "^GSPC-15min-7000", BAR_CLOCK, referenceIntraday(15, false));
    store(healthy, "^GSPC-5min-7000", BAR_CLOCK, referenceIntraday(5, false));
    store(healthy, "^GSPC-daily-7000", BAR_CLOCK, daily(false));
    const green = auditCacheClock({ asOfMs: newestBarIn(healthy), cacheDir: healthy });
    assert.deepEqual(green.failures, [], green.failures.join("\n"));
    assert.ok(green.lines.some((line) => /reference session anchored/.test(line)));

    const poisoned = cacheDir();
    store(poisoned, "^GSPC-15min-7000", BAR_CLOCK, referenceIntraday(15, true));
    store(poisoned, "^GSPC-5min-7000", BAR_CLOCK, referenceIntraday(5, true));
    store(poisoned, "^GSPC-daily-7000", BAR_CLOCK, daily(false));
    const red = auditCacheClock({ asOfMs: newestBarIn(poisoned), cacheDir: poisoned });
    // BOTH naive intraday stores displace from the venue open — the case
    // every relative instrument reads as aligned (#358).
    assert.ok(
      red.failures.some((line) => /reference session displaced/.test(line)),
      red.failures.join("\n"),
    );
  });

  // Round 6 (#358): the presence checks fire only around stores that
  // EXIST, so they composed into a hole — a daily-only symbol passed all
  // three, the ^GSPC anchor silently never ran without its intraday
  // store, and nothing asserted the calendar. Roster mode is the
  // completeness spec, and these pin each gate in both directions.
  const calendarStore = (dir: string) =>
    store(dir, "econ-calendar", ECON_CALENDAR_CLOCK, [
      { currency: "USD", impact: "high", time: Date.UTC(2026, 0, 3, 13, 30) },
    ]);
  // The second singleton a complete cache carries. Its own presence gate is
  // separate from the calendar's, so the fixtures that model completeness must
  // write both — and the two single-gate tests below each write exactly one.
  const curveStore = (dir: string) =>
    store(dir, "treasury-rates", CALENDAR_CLOCK, healthyCurve());

  it("passes a complete roster cache — the completeness gates demand, they do not invent (round 6)", () => {
    const dir = cacheDir();
    healthyTrio(dir);
    calendarStore(dir);
    curveStore(dir);
    const audit = auditCacheClock({
      asOfMs: newestBarIn(dir),
      cacheDir: dir,
      rosterProviderSymbols: ["EURUSD"],
    });
    assert.deepEqual(audit.failures, [], audit.failures.join("\n"));
  });

  it("fails a roster symbol left daily-only — every witness read green while it carried no intraday data (round 6)", () => {
    const dir = cacheDir();
    store(dir, "EURUSD-daily-7000", BAR_CLOCK, daily(false));
    calendarStore(dir);
    curveStore(dir);
    const audit = auditCacheClock({
      asOfMs: newestBarIn(dir),
      cacheDir: dir,
      rosterProviderSymbols: ["EURUSD"],
    });
    assert.equal(audit.failures.length, 1, audit.failures.join("\n"));
    assert.match(
      audit.failures[0],
      /EURUSD: on the scan roster but missing its 15min and 5min store/,
    );
  });

  it("treats an EMPTY store as absent — zero rows satisfy no completeness gate (round 6)", () => {
    const dir = cacheDir();
    store(dir, "EURUSD-15min-7000", BAR_CLOCK, []);
    store(dir, "EURUSD-5min-7000", BAR_CLOCK, []);
    store(dir, "EURUSD-daily-7000", BAR_CLOCK, daily(false));
    calendarStore(dir);
    const audit = auditCacheClock({
      asOfMs: newestBarIn(dir),
      cacheDir: dir,
      rosterProviderSymbols: ["EURUSD"],
    });
    // Round 6b: the file EXISTS, so the line says empty, never missing —
    // "missing" and "empty" have different remedies at the runbook.
    assert.ok(
      audit.failures.some((line) =>
        /EURUSD: 15min store is EMPTY \(zero rows\)/.test(line)
      ),
      audit.failures.join("\n"),
    );
    assert.ok(
      audit.failures.some((line) =>
        /EURUSD: 5min store is EMPTY \(zero rows\)/.test(line)
      ),
      audit.failures.join("\n"),
    );
    assert.ok(
      !audit.failures.some((line) => /missing its/.test(line)),
      audit.failures.join("\n"),
    );
  });

  it("a torn store earns its own RED and never a false 'missing' line (round 6b)", () => {
    const dir = cacheDir();
    writeFileSync(join(dir, "EURUSD-15min-7000.rolling.json"), '{"items":[{"ti');
    store(dir, "EURUSD-5min-7000", BAR_CLOCK, intraday(300_000, false));
    store(dir, "EURUSD-daily-7000", BAR_CLOCK, daily(false));
    calendarStore(dir);
    const audit = auditCacheClock({
      asOfMs: newestBarIn(dir),
      cacheDir: dir,
      rosterProviderSymbols: ["EURUSD"],
    });
    assert.ok(
      audit.failures.some((line) => /unreadable store/.test(line)),
      audit.failures.join("\n"),
    );
    assert.ok(
      !audit.failures.some((line) => /missing its/.test(line)),
      audit.failures.join("\n"),
    );
    assert.ok(
      !audit.failures.some((line) => /store is EMPTY/.test(line)),
      audit.failures.join("\n"),
    );
  });

  it("a mis-stamped store earns its own RED and never a false 'missing' line (round 6b)", () => {
    const dir = cacheDir();
    store(dir, "EURUSD-15min-7000", "some-older-clock", intraday(900_000, false));
    store(dir, "EURUSD-5min-7000", BAR_CLOCK, intraday(300_000, false));
    store(dir, "EURUSD-daily-7000", BAR_CLOCK, daily(false));
    calendarStore(dir);
    const audit = auditCacheClock({
      asOfMs: newestBarIn(dir),
      cacheDir: dir,
      rosterProviderSymbols: ["EURUSD"],
    });
    assert.ok(
      audit.failures.some((line) =>
        /stamped "some-older-clock", expected/.test(line)
      ),
      audit.failures.join("\n"),
    );
    assert.ok(
      !audit.failures.some((line) => /missing its/.test(line)),
      audit.failures.join("\n"),
    );
  });

  it("keeps the daily-presence check's pre-round-6 reach: empty intraday beside NO daily still fails without a roster (round 6b)", () => {
    const dir = cacheDir();
    store(dir, "EURUSD-15min-7000", BAR_CLOCK, []);
    const audit = auditCacheClock({ asOfMs: newestBarIn(dir), cacheDir: dir });
    assert.ok(
      audit.failures.some((line) =>
        /intraday stores present but no daily store/.test(line)
      ),
      audit.failures.join("\n"),
    );
  });

  it("a present-but-condemned DAILY earns its own RED, never the missing-daily line — the direction 6b deliberately narrowed (round 6c)", () => {
    // Pre-round-6b this shape double-reported: the per-store RED plus
    // "intraday stores present but no daily store", which is false — the
    // store exists. The narrowing was deliberate; this pins it so a
    // refactor can neither restore the double-report nor drop the daily
    // line entirely (the empty-intraday case above holds the other side).
    const misStamped = cacheDir();
    store(misStamped, "EURUSD-15min-7000", BAR_CLOCK, intraday(900_000, false));
    store(misStamped, "EURUSD-5min-7000", BAR_CLOCK, intraday(300_000, false));
    store(misStamped, "EURUSD-daily-7000", "some-older-clock", daily(false));
    const stampAudit = auditCacheClock({ asOfMs: newestBarIn(misStamped), cacheDir: misStamped });
    assert.ok(
      stampAudit.failures.some((line) =>
        /daily-7000: stamped "some-older-clock", expected/.test(line)
      ),
      stampAudit.failures.join("\n"),
    );
    assert.ok(
      !stampAudit.failures.some((line) =>
        /intraday stores present but no daily store/.test(line)
      ),
      stampAudit.failures.join("\n"),
    );

    const torn = cacheDir();
    store(torn, "EURUSD-15min-7000", BAR_CLOCK, intraday(900_000, false));
    store(torn, "EURUSD-5min-7000", BAR_CLOCK, intraday(300_000, false));
    writeFileSync(join(torn, "EURUSD-daily-7000.rolling.json"), '{"items":[{"ti');
    const tornAudit = auditCacheClock({ asOfMs: newestBarIn(torn), cacheDir: torn });
    assert.ok(
      tornAudit.failures.some((line) =>
        /daily-7000: unreadable store/.test(line)
      ),
      tornAudit.failures.join("\n"),
    );
    assert.ok(
      !tornAudit.failures.some((line) =>
        /intraday stores present but no daily store/.test(line)
      ),
      tornAudit.failures.join("\n"),
    );
  });

  it("fails when the roster names the reference symbol and its anchor never ran — dark is not green (round 6)", () => {
    const dir = cacheDir();
    healthyTrio(dir);
    store(dir, "^GSPC-daily-7000", BAR_CLOCK, daily(false));
    calendarStore(dir);
    const audit = auditCacheClock({
      asOfMs: newestBarIn(dir),
      cacheDir: dir,
      rosterProviderSymbols: ["EURUSD", "^GSPC"],
    });
    assert.ok(
      audit.failures.some((line) =>
        /\^GSPC: the reference session anchor NEVER RAN/.test(line)
      ),
      audit.failures.join("\n"),
    );
  });

  it("fails a roster cache with no calendar store — the rebuild always fetches it (round 6)", () => {
    const dir = cacheDir();
    healthyTrio(dir);
    // The curve IS present, so this isolates the calendar gate rather than
    // passing on whichever singleton happens to be missing.
    curveStore(dir);
    const audit = auditCacheClock({
      asOfMs: newestBarIn(dir),
      cacheDir: dir,
      rosterProviderSymbols: ["EURUSD"],
    });
    assert.equal(audit.failures.length, 1, audit.failures.join("\n"));
    assert.match(audit.failures[0], /econ-calendar: no calendar store/);
  });
});
