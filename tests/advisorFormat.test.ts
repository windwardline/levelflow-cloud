import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatCopyValue,
  formatNumber,
  formatRelativeTime,
  MAX_PRICE_DECIMALS,
} from "../src/components/workspace/advisorFormat.ts";

// A real tick-aligned futures price that only round-trips correctly at
// eight decimal places (fix round 2, both cases below): ZNUSD (10-year
// Treasury note futures) ticks in 1/64 = 0.015625, six decimals
// (supabase/functions/trade-analyzer/futures.ts, FUTURES_CONTRACT_SPECS /
// alignFuturesLevel). 109.515625 is exactly 7009 ticks — a legal price on
// that grid. The previous 5-decimal cap rounded it to 109.51563, which
// isn't a multiple of 0.015625 at all — an illegal price off the
// exchange's own grid.
const ZN_TICK_ALIGNED_PRICE = 109.515625;

// Clipboard payload for the per-value ladder copy (spec §7). formatNumber
// (display) defers to the runtime's locale via `toLocaleString(undefined,
// ...)` — under de-DE that both groups thousands AND swaps the decimal to
// a comma, so a copied price silently corrupts on paste into a broker's
// price field. formatCopyValue pins "en-US" with grouping off instead, so
// the payload is a deterministic plain number no matter the viewer's
// machine locale.
describe("formatCopyValue", () => {
  it("never groups thousands, unlike the display formatter", () => {
    assert.equal(formatCopyValue(117240), "117240");
    assert.equal(formatCopyValue(65432.1), "65432.1");
    assert.equal(formatCopyValue(1234567.89), "1234567.89");
  });

  it("keeps a plain decimal for values under 1000, including sub-1 forex quotes", () => {
    assert.equal(formatCopyValue(2384.2), "2384.2");
    // Forex quotes sub-1 with five decimals (e.g. EUR/GBP-style pairs) —
    // the decimal point must survive exactly, not just the grouping.
    assert.equal(formatCopyValue(0.75489), "0.75489");
  });

  it("never contains a grouping separator, for any value the ladder can show", () => {
    for (const value of [999, 1000, 0.75489, 2384.2, 65432.1, 117240, 1234567.89]) {
      assert.doesNotMatch(formatCopyValue(value), /,/);
    }
  });

  it("always uses a period decimal point, independent of machine locale", () => {
    // toLocaleString(undefined, ...) — formatNumber's approach — would
    // render a comma decimal under de-DE et al. Pinning "en-US" explicitly
    // is what guarantees a period here regardless of the runtime locale.
    for (const value of [0.75489, 117240.5, 65432.1]) {
      const payload = formatCopyValue(value);
      assert.match(payload, /^\d+\.\d+$/, `${value} -> "${payload}"`);
    }
  });

  it("round-trips through Number() back to the exact original value", () => {
    for (
      const value of [0.75489, 2384.2, 117240, 65432.1, 1.0884, 0.5, 999999.99999]
    ) {
      assert.equal(Number(formatCopyValue(value)), value);
    }
  });

  it("caps at 8 fraction digits (MAX_PRICE_DECIMALS), matching the display formatter's own precision", () => {
    assert.equal(MAX_PRICE_DECIMALS, 8);
    assert.equal(formatCopyValue(1.2345678901), "1.23456789");
  });

  it("keeps all six decimals of a ZN futures 1/64-tick price — the old 5-decimal cap made this an illegal price", () => {
    assert.equal(
      formatCopyValue(ZN_TICK_ALIGNED_PRICE),
      "109.515625",
    );
    assert.equal(
      Number(formatCopyValue(ZN_TICK_ALIGNED_PRICE)),
      ZN_TICK_ALIGNED_PRICE,
    );
    // Confirms 109.515625 really is on the 1/64 grid (7009 ticks exactly),
    // so this test is pinned against a legal price, not an arbitrary one.
    assert.equal(ZN_TICK_ALIGNED_PRICE / 0.015625, 7009);
  });
});

// formatNumber is the on-screen display path — locale-formatted grouping
// and decimal separator are expected to vary by machine locale, and that's
// fine. What must never happen again is losing digits: the old 5-decimal
// cap silently rounded a real tick-aligned futures price to one that was
// no longer a legal multiple of its tick size.
describe("formatNumber", () => {
  it("keeps every decimal digit of a ZN futures 1/64-tick price, regardless of machine locale", () => {
    // Mirrors formatNumber's own toLocaleString(undefined, ...) call, the
    // same way tests/scopeMenu.test.tsx's localClockTime helper mirrors a
    // locale-dependent Intl call rather than hardcoding one locale's
    // separator — so this test passes under any machine locale.
    const expected = ZN_TICK_ALIGNED_PRICE.toLocaleString(undefined, {
      maximumFractionDigits: MAX_PRICE_DECIMALS,
    });
    assert.equal(formatNumber(ZN_TICK_ALIGNED_PRICE), expected);
    // Locale-grouped is fine; a lost digit is not. "109", some single
    // non-digit decimal separator, then all six digits "515625" intact.
    assert.match(formatNumber(ZN_TICK_ALIGNED_PRICE), /^109\D515625$/);
  });
});

describe("formatRelativeTime", () => {
  const now = new Date("2026-07-30T12:00:00.000Z");

  it("reports very recent updates in plain language, not a raw duration", () => {
    assert.equal(
      formatRelativeTime(new Date("2026-07-30T11:59:40.000Z").toISOString(), now),
      "Just now",
    );
  });

  it("uses singular minute/hour/day near the boundary", () => {
    assert.equal(
      formatRelativeTime(new Date("2026-07-30T11:59:00.000Z").toISOString(), now),
      "1 minute ago",
    );
    assert.equal(
      formatRelativeTime(new Date("2026-07-30T11:00:00.000Z").toISOString(), now),
      "1 hour ago",
    );
    assert.equal(
      formatRelativeTime(new Date("2026-07-29T12:00:00.000Z").toISOString(), now),
      "1 day ago",
    );
  });

  it("pluralizes minutes, hours, and days", () => {
    assert.equal(
      formatRelativeTime(new Date("2026-07-30T11:55:00.000Z").toISOString(), now),
      "5 minutes ago",
    );
    assert.equal(
      formatRelativeTime(new Date("2026-07-30T09:00:00.000Z").toISOString(), now),
      "3 hours ago",
    );
    assert.equal(
      formatRelativeTime(new Date("2026-07-27T12:00:00.000Z").toISOString(), now),
      "3 days ago",
    );
  });

  it("falls back to an absolute date once the gap stops being legible as a relative phrase", () => {
    const value = new Date("2026-07-01T12:00:00.000Z").toISOString();
    const result = formatRelativeTime(value, now);
    assert.doesNotMatch(result, /ago$/);
  });

  it("treats an invalid or missing timestamp as awaiting refresh", () => {
    assert.equal(formatRelativeTime("not-a-date", now), "Awaiting refresh");
  });
});
