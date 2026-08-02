import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  formatCopyValue,
  formatNumber,
  MAX_PRICE_DECIMALS,
} from "../src/components/workspace/advisorFormat.ts";
import { formatPriceValue } from "../src/components/workspace/historyUtils.ts";

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

// Fix round 3: historyUtils.ts, MarketScanPanel.tsx, and
// SetupQualityReceipt.tsx each carried their own byte-identical local copy
// of formatNumber's pre-fix body — same literal `maximumFractionDigits: 5`
// object, same ZN-grid truncation, just duplicated three times instead of
// shared. All three now import the formatNumber tested above instead of
// defining their own (verified first: all three were byte-identical to
// each other and to formatNumber's own pre-fix body, so unifying changes
// nothing about their rendering except the cap; confirmed no import cycle
// — advisorFormat.ts's only dependency chain is lib/marketData.ts ->
// lib/symbolMap.ts + lib/supabase.ts, and nothing under src/lib imports
// back from src/components).
describe("price precision cap stays centralized (fix round 3)", () => {
  it('never lets the literal "maximumFractionDigits: 5" reappear anywhere in src — a fifth duplicate must fail the build, not quietly ship', () => {
    const files = readdirSync("src", { recursive: true })
      .map(String)
      .filter((f) => /\.tsx?$/.test(f));
    const offenders: string[] = [];
    for (const rel of files) {
      const source = readFileSync(join("src", rel), "utf8");
      if (/maximumFractionDigits:\s*5\b/.test(source)) {
        offenders.push(rel);
      }
    }
    assert.deepEqual(
      offenders,
      [],
      "the 5-decimal cap must only ever exist as advisorFormat's own " +
        "(now-retired) history, never a fresh literal",
    );
  });

  // historyUtils.ts's formatPriceValue is exported and pure — cheaply
  // reachable without rendering, per the coordinator's "at minimum"
  // instruction. MarketScanPanel.tsx's formatNumber call lives inline
  // inside the unexported MarketScanRow component, building a template
  // literal from component-local values; SetupQualityReceipt.tsx's lives
  // inside the unexported buildExecutionDetail. Neither is a separately
  // importable pure function, and this repo's test stack has no jsdom to
  // render either component through (confidenceUnit.test.tsx's header
  // comment documents the same limitation). Exporting or refactoring
  // either purely to make it testable is outside this round's "nothing
  // else" instruction, so both are skipped here, per that instruction's
  // own allowance — their correctness rests on now sharing the exact
  // formatNumber implementation tested above, not on a duplicate that
  // could silently drift.
  it("renders a ZN futures 1/64-tick price unmangled through historyUtils.formatPriceValue", () => {
    assert.equal(
      formatPriceValue(ZN_TICK_ALIGNED_PRICE),
      formatNumber(ZN_TICK_ALIGNED_PRICE),
    );
    assert.match(formatPriceValue(ZN_TICK_ALIGNED_PRICE), /^109\D515625$/);
  });
});

