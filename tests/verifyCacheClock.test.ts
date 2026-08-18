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

function healthyTrio(dir: string) {
  store(dir, "EURUSD-15min-7000", BAR_CLOCK, intraday(900_000, false));
  store(dir, "EURUSD-5min-7000", BAR_CLOCK, intraday(300_000, false));
  store(dir, "EURUSD-daily-7000", BAR_CLOCK, daily(false));
}

describe("auditCacheClock — the rebuild's acceptance instrument", () => {
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
});
