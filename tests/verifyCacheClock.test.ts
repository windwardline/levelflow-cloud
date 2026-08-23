import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { auditCacheClock } from "../scripts/verify-cache-clock.ts";
import {
  BAR_CLOCK,
  newYorkClockParts,
  newYorkWallClockToUtcMs,
} from "../supabase/functions/trade-analyzer/bars.ts";
import { CALENDAR_CLOCK } from "../scripts/clockWitness.ts";
import { TREASURY_FETCH_START_MS } from "../scripts/sweepManifest.ts";

// R0's acceptance instrument, exercised against synthetic caches in every
// poisoned shape the rebuild must refuse (#358 finding: the instrument
// that guards a one-shot ~30GB operation was itself untested). The
// generators build the same series two ways — through the current
// normalizer and through the defect era's transform — so each RED line is
// earned on realistic store shapes, not hand-written verdicts.

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
    store(dir, "econ-calendar", CALENDAR_CLOCK, []);
    store(dir, "treasury-rates", CALENDAR_CLOCK, healthyCurve());
    const report = auditCacheClock({ cacheDir: dir, rosterProviderSymbols: ["EURUSD"] });
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
    store(dir, "econ-calendar", CALENDAR_CLOCK, []);
    store(dir, "treasury-rates", CALENDAR_CLOCK, []);
    const report = auditCacheClock({ cacheDir: dir, rosterProviderSymbols: ["EURUSD"] });
    assert.ok(
      report.failures.some((line) => /curve store is EMPTY/.test(line)),
      report.failures.join("\n") || "(no failures)",
    );
  });

  it("fails a roster cache with no Treasury store at all", () => {
    const dir = cacheDir();
    healthyTrio(dir);
    store(dir, "econ-calendar", CALENDAR_CLOCK, []);
    const report = auditCacheClock({ cacheDir: dir, rosterProviderSymbols: ["EURUSD"] });
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
    const report = auditCacheClock({ cacheDir: dir, rosterProviderSymbols: ["EURUSD"] });
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
    const report = auditCacheClock({ cacheDir: dir, rosterProviderSymbols: ["EURUSD"] });
    assert.ok(
      report.failures.some((line) => /largest interior gap is 2\d\d days/.test(line)),
      report.failures.join("\n") || "(no failures)",
    );
  });

  it("condemns a curve whose tail is stale", () => {
    const dir = cacheDir();
    healthyTrio(dir);
    calendarStore(dir);
    const stale = healthyCurve().filter(
      (row) => row.dateMs < Date.now() - 60 * 86_400_000,
    );
    store(dir, "treasury-rates", CALENDAR_CLOCK, stale);
    const report = auditCacheClock({ cacheDir: dir, rosterProviderSymbols: ["EURUSD"] });
    assert.ok(
      report.failures.some((line) => /days stale/.test(line)),
      report.failures.join("\n") || "(no failures)",
    );
  });

  it("still condemns a Treasury store stamped with the bar clock", () => {
    const dir = cacheDir();
    healthyTrio(dir);
    store(dir, "econ-calendar", CALENDAR_CLOCK, []);
    store(dir, "treasury-rates", BAR_CLOCK, [{ time: Date.UTC(2013, 0, 2) }]);
    const report = auditCacheClock({ cacheDir: dir, rosterProviderSymbols: ["EURUSD"] });
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
    const report = auditCacheClock({ cacheDir: dir, rosterProviderSymbols: ["EURUSD"] });
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
    store(dir, "econ-calendar", CALENDAR_CLOCK, [
      { currency: "USD", impact: "high", time: Date.UTC(2026, 0, 3, 13, 30) },
    ]);
    const audit = auditCacheClock({ cacheDir: dir });
    assert.deepEqual(audit.failures, []);
    assert.ok(audit.lines.some((line) => line.includes("density 3.00")));
  });

  it("fails every store of the condemned pre-R0 shape — unstamped", () => {
    const dir = cacheDir();
    store(dir, "EURUSD-15min-7000", undefined, intraday(900_000, true));
    store(dir, "EURUSD-5min-7000", undefined, intraday(300_000, false));
    store(dir, "EURUSD-daily-7000", undefined, daily(true));
    const audit = auditCacheClock({ cacheDir: dir });
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
    const audit = auditCacheClock({ cacheDir: dir });
    assert.equal(audit.failures.length, 1);
    assert.match(audit.failures[0], /daily.*"naive"/s);
  });

  it("condemns the actual 2026-08-11 shape — naive primary, true 5-minute — via registration", () => {
    const dir = cacheDir();
    store(dir, "EURUSD-15min-7000", BAR_CLOCK, intraday(900_000, true));
    store(dir, "EURUSD-5min-7000", BAR_CLOCK, intraday(300_000, false));
    store(dir, "EURUSD-daily-7000", BAR_CLOCK, daily(false));
    const audit = auditCacheClock({ cacheDir: dir });
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
    const audit = auditCacheClock({ cacheDir: dir });
    assert.ok(audit.failures.some((line) => /sawtooth/.test(line)));
  });

  it("reports a corrupt store as a RED line instead of crashing the listing", () => {
    const dir = cacheDir();
    healthyTrio(dir);
    writeFileSync(join(dir, "BTCUSD-15min-7000.rolling.json"), '{"items":[{"ti');
    const audit = auditCacheClock({ cacheDir: dir });
    assert.ok(audit.failures.some((line) => /unreadable store/.test(line)));
  });

  it("fails a symbol whose daily store is missing — the universal witness must exist", () => {
    const dir = cacheDir();
    store(dir, "EURUSD-15min-7000", BAR_CLOCK, intraday(900_000, false));
    store(dir, "EURUSD-5min-7000", BAR_CLOCK, intraday(300_000, false));
    const audit = auditCacheClock({ cacheDir: dir });
    assert.ok(audit.failures.some((line) => /no daily store/.test(line)));
  });

  it("fails an intraday store with no mate — rebuild incomplete", () => {
    const dir = cacheDir();
    store(dir, "EURUSD-15min-7000", BAR_CLOCK, intraday(900_000, false));
    store(dir, "EURUSD-daily-7000", BAR_CLOCK, daily(false));
    const audit = auditCacheClock({ cacheDir: dir });
    assert.ok(audit.failures.some((line) => /no 5min mate/.test(line)));
  });

  it("reconciles against the supplied roster — an absent symbol is incomplete, not invisible", () => {
    const dir = cacheDir();
    healthyTrio(dir);
    const audit = auditCacheClock({
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
    const audit = auditCacheClock({ cacheDir: dir });
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
    const green = auditCacheClock({ cacheDir: inBand });
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
    const red = auditCacheClock({ cacheDir: pastBand });
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
    const audit = auditCacheClock({ cacheDir: dir });
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
    const audit = auditCacheClock({ cacheDir: dir });
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
    const green = auditCacheClock({ cacheDir: healthy });
    assert.deepEqual(green.failures, [], green.failures.join("\n"));
    assert.ok(green.lines.some((line) => /reference session anchored/.test(line)));

    const poisoned = cacheDir();
    store(poisoned, "^GSPC-15min-7000", BAR_CLOCK, referenceIntraday(15, true));
    store(poisoned, "^GSPC-5min-7000", BAR_CLOCK, referenceIntraday(5, true));
    store(poisoned, "^GSPC-daily-7000", BAR_CLOCK, daily(false));
    const red = auditCacheClock({ cacheDir: poisoned });
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
    store(dir, "econ-calendar", CALENDAR_CLOCK, [
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
    const audit = auditCacheClock({ cacheDir: dir });
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
    const stampAudit = auditCacheClock({ cacheDir: misStamped });
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
    const tornAudit = auditCacheClock({ cacheDir: torn });
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
      cacheDir: dir,
      rosterProviderSymbols: ["EURUSD"],
    });
    assert.equal(audit.failures.length, 1, audit.failures.join("\n"));
    assert.match(audit.failures[0], /econ-calendar: no calendar store/);
  });
});
