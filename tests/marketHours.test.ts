import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  formatClockTime,
  formatCompactDateTime,
  formatReopen,
  marketAvailability,
} from "../src/lib/marketHours";
import { getUpcomingWeeklyCloseTime } from "../supabase/functions/trade-analyzer/replay.ts";

// A known week in America/New_York, comfortably inside EDT (UTC-4) so every
// instant below can be hand-verified against the spec's per-class table
// (2026-07-30-levelflow-desk-design.md #10b): Sun Jun 7 - Sat Jun 13, then
// the following Sun Jun 14, 2026. Jun 12, 2026 is a Friday (also anchors
// tests/replayHarness.test.ts's Friday-close case).
const SATURDAY_NOON_ET = new Date("2026-06-13T16:00:00.000Z");
const WEDNESDAY_2PM_ET = new Date("2026-06-10T18:00:00.000Z");
const TUESDAY_530PM_ET = new Date("2026-06-09T21:30:00.000Z");
const TUESDAY_6PM_ET = new Date("2026-06-09T22:00:00.000Z");
const FRIDAY_BEFORE_CLOSE_ET = new Date("2026-06-12T20:59:00.000Z");
const FRIDAY_AT_CLOSE_ET = new Date("2026-06-12T21:00:00.000Z");
const SUNDAY_BEFORE_FOREX_OPEN_ET = new Date("2026-06-14T20:59:00.000Z");
const SUNDAY_AT_FOREX_OPEN_ET = new Date("2026-06-14T21:05:00.000Z");
const SUNDAY_530PM_ET = new Date("2026-06-14T21:30:00.000Z");
const SUNDAY_BEFORE_CME_OPEN_ET = new Date("2026-06-14T21:59:00.000Z");
const SUNDAY_AT_CME_OPEN_ET = new Date("2026-06-14T22:00:00.000Z");

const CME_COMPLEX_MEMBERS = [
  { assetType: "Futures", symbol: "ESUSD" },
  { assetType: "Energies", symbol: "WTI" },
  { assetType: "Indices", symbol: "SP" },
] as const;

describe("market availability calendar", () => {
  it("treats crypto as always open", () => {
    assert.deepEqual(marketAvailability("Crypto", "BTCUSD", SATURDAY_NOON_ET), {
      open: true,
    });
    assert.deepEqual(
      marketAvailability("Crypto", "BTCUSD", SUNDAY_BEFORE_FOREX_OPEN_ET),
      { open: true },
    );
  });

  it("closes forex over the weekend, reopening Sunday 17:05 ET", () => {
    assert.deepEqual(marketAvailability("Forex", "EURUSD", SATURDAY_NOON_ET), {
      open: false,
      opensAt: SUNDAY_AT_FOREX_OPEN_ET,
    });
  });

  it("keeps forex open mid-week", () => {
    assert.deepEqual(marketAvailability("Forex", "EURUSD", WEDNESDAY_2PM_ET), {
      open: true,
    });
  });

  it("keeps forex open right up to the Friday close and shut right after", () => {
    assert.deepEqual(
      marketAvailability("Forex", "EURUSD", FRIDAY_BEFORE_CLOSE_ET),
      { open: true },
    );
    assert.deepEqual(marketAvailability("Forex", "EURUSD", FRIDAY_AT_CLOSE_ET), {
      open: false,
      opensAt: SUNDAY_AT_FOREX_OPEN_ET,
    });
  });

  it("reopens forex exactly at Sunday 17:05 ET, the rollover minute, not before", () => {
    assert.deepEqual(
      marketAvailability("Forex", "EURUSD", SUNDAY_BEFORE_FOREX_OPEN_ET),
      { open: false, opensAt: SUNDAY_AT_FOREX_OPEN_ET },
    );
    assert.deepEqual(
      marketAvailability("Forex", "EURUSD", SUNDAY_AT_FOREX_OPEN_ET),
      { open: true },
    );
  });

  it("applies the CME daily maintenance break to spot metals (1e, inverted 2026-08-09)", () => {
    // This pin used to assert the ABSENCE of the break, citing #10b's
    // "Metals spot follows forex 17:00". The analyzer has always routed
    // metals through the complex branch and blocked this hour
    // (trade-analyzer/sessions.ts), and spot metals liquidity does halt
    // with the futures complex — so the old pin was holding the client to
    // a claim the engine refused every weekday night. Parity across the
    // boundary is the law now (tests/sessionCalendarParity.test.ts).
    assert.deepEqual(
      marketAvailability("Metals", "XAUUSD", TUESDAY_530PM_ET),
      { open: false, opensAt: new Date("2026-06-09T22:00:00.000Z") },
    );
  });

  it("closes the CME complex for its daily maintenance break", () => {
    for (const { assetType, symbol } of CME_COMPLEX_MEMBERS) {
      assert.deepEqual(
        marketAvailability(assetType, symbol, TUESDAY_530PM_ET),
        { open: false, opensAt: TUESDAY_6PM_ET },
        assetType,
      );
    }
  });

  it("closes the CME complex over the weekend, reopening Sunday 18:00 ET", () => {
    for (const { assetType, symbol } of CME_COMPLEX_MEMBERS) {
      assert.deepEqual(
        marketAvailability(assetType, symbol, SATURDAY_NOON_ET),
        { open: false, opensAt: SUNDAY_AT_CME_OPEN_ET },
        assetType,
      );
    }
  });

  it("reopens the CME complex exactly at Sunday 18:00 ET, not a minute before", () => {
    for (const { assetType, symbol } of CME_COMPLEX_MEMBERS) {
      assert.deepEqual(
        marketAvailability(assetType, symbol, SUNDAY_BEFORE_CME_OPEN_ET),
        { open: false, opensAt: SUNDAY_AT_CME_OPEN_ET },
        assetType,
      );
      assert.deepEqual(
        marketAvailability(assetType, symbol, SUNDAY_AT_CME_OPEN_ET),
        { open: true },
        assetType,
      );
    }
  });

  it("keeps the CME complex closed between the forex Sunday open and its own later Sunday open", () => {
    // 5:30pm ET Sunday: forex opened at 17:00, the CME complex does not
    // open until 18:00 - the weekend is the case the spec calls out as
    // mattering most (crypto and forex trade while the rest wait).
    assert.deepEqual(marketAvailability("Futures", "ESUSD", SUNDAY_530PM_ET), {
      open: false,
      opensAt: SUNDAY_AT_CME_OPEN_ET,
    });
    assert.deepEqual(marketAvailability("Forex", "EURUSD", SUNDAY_530PM_ET), {
      open: true,
    });
  });

  it("treats indices as futures for calendar purposes", () => {
    assert.deepEqual(
      marketAvailability("Indices", "SP", TUESDAY_530PM_ET),
      marketAvailability("Futures", "ESUSD", TUESDAY_530PM_ET),
    );
  });

  it("ignores the symbol argument beyond pass-through, for a given asset type", () => {
    assert.deepEqual(
      marketAvailability("Forex", "EURUSD", SATURDAY_NOON_ET),
      marketAvailability("Forex", "GBPUSD", SATURDAY_NOON_ET),
    );
    assert.deepEqual(
      marketAvailability("Forex", "EURUSD", WEDNESDAY_2PM_ET),
      marketAvailability("Forex", "GBPUSD", WEDNESDAY_2PM_ET),
    );
  });
});

describe("reopen time formatting", () => {
  it("always includes the day, even for a reopen later the same day", () => {
    // Noon UTC keeps `now` and `opensAt` (2h later) on the same local
    // calendar day for every real-world machine timezone (UTC-12..+14).
    const now = new Date("2026-06-10T12:00:00.000Z");
    const opensAt = new Date(now.getTime() + 2 * 60 * 60 * 1000);
    assert.equal(localWeekday(now), localWeekday(opensAt));

    assert.equal(
      formatReopen(opensAt, now),
      `${localCompactTime(opensAt)} ${localWeekday(opensAt)}`,
    );
  });

  it("renders a weekday for a reopen later in the same week", () => {
    assert.equal(
      formatReopen(SATURDAY_NOON_ET, WEDNESDAY_2PM_ET),
      `${localCompactTime(SATURDAY_NOON_ET)} ${localWeekday(SATURDAY_NOON_ET)}`,
    );
  });

  it("still renders a weekday exactly at the 7-day mark", () => {
    const now = new Date("2026-06-10T12:00:00.000Z");
    const opensAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    assert.equal(
      formatReopen(opensAt, now),
      `${localCompactTime(opensAt)} ${localWeekday(opensAt)}`,
    );
  });

  it("renders a month and day once the reopen is more than 7 days out", () => {
    const now = new Date("2026-06-10T12:00:00.000Z");
    const opensAt = new Date(now.getTime() + 8 * 24 * 60 * 60 * 1000);

    assert.equal(
      formatReopen(opensAt, now),
      `${localCompactTime(opensAt)} ${localMonthDay(opensAt)}`,
    );
  });

  it("renders a compact, lowercase-meridiem, day-qualified shape", () => {
    const shape = formatReopen(FRIDAY_AT_CLOSE_ET, FRIDAY_BEFORE_CLOSE_ET);
    assert.match(shape, /^\d{1,2}:\d{2}[ap] [A-Za-z]{3}$/);
  });
});

// Spec §17: the Desk's confidence meta stamp ("Reviewed JUL 31 2:05P · valid
// until JUL 31 10:05P") matches the scope menu's availability grammar,
// extended with the date — and shares its time formatting with the menu's
// OPENS lines "so the two can never drift". That sharing is the reason this
// formatter lives in marketHours beside formatReopen rather than beside its
// caller, so the tests for both sit together too.
describe("compact date-time stamp (spec §17)", () => {
  const MOMENT = new Date("2026-07-31T18:05:00.000Z");

  it("assembles the month-day and the menu's own time piece, in caps", () => {
    assert.equal(
      formatCompactDateTime(MOMENT),
      `${localMonthDay(MOMENT)} ${localCompactTime(MOMENT)}`.toUpperCase(),
    );
  });

  it("renders the exact §17 grammar: {MMM} {D} {h}:{mm}{A|P}", () => {
    assert.match(formatCompactDateTime(MOMENT), /^[A-Z]{3} \d{1,2} \d{1,2}:\d{2}[AP]$/);
  });

  it("keeps the time piece byte-identical to the one formatReopen prints", () => {
    // The anti-drift assertion, made against the real output of both: whatever
    // formatReopen puts before its day label is exactly what this stamp puts
    // after its date, casing aside.
    const reopenTime = formatReopen(MOMENT, MOMENT).split(" ")[0];
    const stampTime = formatCompactDateTime(MOMENT).split(" ")[2];
    assert.equal(stampTime, reopenTime.toUpperCase());
  });

  it("pads minutes but never the day or the hour", () => {
    // 9:05am local on the 3rd of a month, built from local parts so the
    // assertion holds in any machine timezone.
    const early = new Date(2026, 7, 3, 9, 5);
    assert.match(formatCompactDateTime(early), /^[A-Z]{3} 3 9:05A$/);
  });

  it("prints the bare clock time the trades rail and the count line both show", () => {
    // Q1-I12: one source for the h:mm datum. Three formatters read the same
    // clock — the stamp's compact piece above, the rail's "as of" and the scan
    // count line — and the latter two used to build their own.
    const MORNING = new Date(2026, 7, 3, 9, 5);
    assert.equal(formatClockTime(MORNING), "9:05 AM");
    assert.equal(formatClockTime(new Date(2026, 7, 3, 17, 12)), "5:12 PM");
    // Same reading as the stamp's time piece, differing only in shape.
    assert.equal(
      formatClockTime(MORNING).slice(0, 4).toUpperCase(),
      formatCompactDateTime(MORNING).split(" ")[2].slice(0, 4),
    );
  });
});

// Q2-C1: the grammar §17 fixes is a LANGUAGE decision, and every date/time
// formatter that renders it has to say so. Three in this module passed
// `undefined` and inherited the runtime's locale, so "JUL 31 2:05P" was
// "31 JUIL. 2:05P" on a French browser and "7月31日 2:05午" on a Japanese one —
// and the CI that would have caught it runs under an English locale. This
// scan is src-wide rather than module-local because the two other h:mm
// formatters that had the same bug lived in components, not here.
describe("every date/time formatter in src pins its locale (§17 grammar)", () => {
  const sources = readdirSync("src", { recursive: true })
    .map(String)
    .filter((file) => file.endsWith(".ts") || file.endsWith(".tsx"))
    .map((file) => ({ file, text: readFileSync(join("src", file), "utf8") }));

  it("scans a non-trivial set of files, so a broken glob cannot pass this vacuously", () => {
    assert.ok(sources.length >= 20, `only found ${sources.length} source files`);
  });

  it("never constructs an Intl.DateTimeFormat without an explicit locale", () => {
    const offenders = sources
      .filter(({ text }) => /Intl\.DateTimeFormat\(\s*undefined/.test(text))
      .map(({ file }) => file);
    assert.deepEqual(offenders, []);
  });

  it("never renders a date through toLocaleDateString / toLocaleTimeString / toLocaleString", () => {
    // Numbers are a separate, deliberate case: formatNumber keeps rendering
    // prices in the reader's own locale and says so at length, while
    // formatCopyValue pins en-US for the clipboard. Dates have no such
    // latitude — §17 fixes their grammar — so the Date-side helpers are barred
    // outright rather than reviewed case by case.
    const offenders = sources
      .filter(({ text }) =>
        /\.toLocale(Date|Time)String\(/.test(text) ||
        /\bnew Date\([^)]*\)\.toLocaleString\(/.test(text)
      )
      .map(({ file }) => file);
    assert.deepEqual(offenders, []);
  });
});

describe("weekly-close parity with the replay engine", () => {
  // Fri 2:00pm ET - comfortably before both the forex and CME-complex
  // Friday closes.
  const fridayAfternoon = Date.parse("2026-06-12T18:00:00.000Z");

  it("agrees with getUpcomingWeeklyCloseTime for EURUSD within replay's own conservative margin", () => {
    const replayClose = getUpcomingWeeklyCloseTime("EURUSD", fridayAfternoon);
    assert.ok(replayClose);

    // replay.ts's setup-review cutoff treats forex as closing at 16:59 ET,
    // 60s ahead of the display calendar's clean Friday 17:00 ET close
    // (replay.ts's closeMinute is 59 for forex, 0 for the CME-style
    // classes) - a deliberate conservative margin in the review-window
    // math, not drift. Pin the gap exactly rather than papering over it.
    const FOREX_REPLAY_MARGIN_MS = 60_000;

    assert.equal(
      marketAvailability("Forex", "EURUSD", new Date(replayClose - 1_000)).open,
      true,
    );
    assert.equal(
      marketAvailability(
        "Forex",
        "EURUSD",
        new Date(replayClose + FOREX_REPLAY_MARGIN_MS - 1_000),
      ).open,
      true,
    );
    assert.equal(
      marketAvailability(
        "Forex",
        "EURUSD",
        new Date(replayClose + FOREX_REPLAY_MARGIN_MS),
      ).open,
      false,
    );
  });

  it("agrees with getUpcomingWeeklyCloseTime for ESUSD exactly", () => {
    const replayClose = getUpcomingWeeklyCloseTime("ESUSD", fridayAfternoon);
    assert.ok(replayClose);

    // ESUSD is futures-style in replay.ts (closeMinute 0), matching the
    // display calendar's Friday 17:00 ET close exactly - zero margin.
    assert.equal(
      marketAvailability("Futures", "ESUSD", new Date(replayClose - 1_000)).open,
      true,
    );
    assert.equal(
      marketAvailability("Futures", "ESUSD", new Date(replayClose)).open,
      false,
    );
  });
});

// Test-side reconstruction of the display format, built from the same
// `Intl.DateTimeFormat` primitives `formatReopen` uses internally (no explicit
// timeZone option, so both sides read the machine's local zone) - this pins the
// assembly logic without hardcoding one machine's offset.
//
// Q2-C1: these mirrors used to pass `undefined` as well, which is why the defect
// stayed invisible — the reconstruction drifted in lockstep with the code, and
// only the two regex assertions above ever noticed (they failed outright on a
// fr-FR, de-DE or ja-JP machine). "en-US" is pinned on both sides now, so the
// mirrors state what the grammar IS rather than whatever the runtime happened to
// produce.
function localCompactTime(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    hour12: true,
    minute: "2-digit",
  }).formatToParts(date);
  const lookup = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${lookup.hour}:${lookup.minute}${(lookup.dayPeriod ?? "").charAt(0).toLowerCase()}`;
}

function localWeekday(date: Date): string {
  return new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(date);
}

function localMonthDay(date: Date): string {
  return new Intl.DateTimeFormat("en-US", { day: "numeric", month: "short" }).format(
    date,
  );
}
