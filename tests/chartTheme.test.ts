import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { readChartTheme } from "../src/components/charts/MarketChart";

// No jsdom in this repo's unit-test stack (see tests/workspaceNav.test.tsx):
// readChartTheme accepts an optional getPropertyValue source so this test can
// supply a fake one instead of touching a real `document`. The zero-arg call
// used by the mounted component defaults to `getComputedStyle(document.documentElement)`,
// which this test never triggers.
function fakeComputedStyle(values: Record<string, string>): Pick<CSSStyleDeclaration, "getPropertyValue"> {
  return {
    getPropertyValue: (name: string) => values[name] ?? "",
  };
}

describe("readChartTheme", () => {
  it("reads each token from the given CSS custom-property source, trimmed", () => {
    const source = fakeComputedStyle({
      "--color-sheet": "  #FDFCF9  ",
      "--color-ink": "#1B1B1B",
      "--color-ink-muted": "#6B675E",
      "--color-hairline": "#D8D2C4",
      "--color-accent": "#2244FF",
      "--color-buy": "#177245",
      "--color-sell": "#B3261E",
    });

    assert.deepEqual(readChartTheme(source), {
      sheet: "#FDFCF9",
      ink: "#1B1B1B",
      inkMuted: "#6B675E",
      hairline: "#D8D2C4",
      accent: "#2244FF",
      buy: "#177245",
      sell: "#B3261E",
    });
  });

  it("re-reads live: a source that re-values (theme flip) produces new colors on the next call", () => {
    const values: Record<string, string> = {
      "--color-sheet": "#FDFCF9",
      "--color-ink": "#1B1B1B",
      "--color-ink-muted": "#6B675E",
      "--color-hairline": "#D8D2C4",
      "--color-accent": "#2244FF",
      "--color-buy": "#177245",
      "--color-sell": "#B3261E",
    };
    const source = fakeComputedStyle(values);

    assert.equal(readChartTheme(source).sheet, "#FDFCF9");

    // Simulate html[data-theme="dark"] re-valuing the custom properties.
    values["--color-sheet"] = "#1E1B16";
    values["--color-buy"] = "#4CC38A";
    values["--color-sell"] = "#E5766E";

    const dark = readChartTheme(source);
    assert.equal(dark.sheet, "#1E1B16");
    assert.equal(dark.buy, "#4CC38A");
    assert.equal(dark.sell, "#E5766E");
  });
});

// Q1-I12: the chart had two price formatters. The level lines were deliberately
// moved to formatNumber because formatChartPrice "caps at two decimals over 100
// and would print a futures level that never appears in the ladder" — and the
// OHLC hover readout above the chart kept calling formatChartPrice, so the named
// defect simply carried on living in the hover box. One formatter now, the
// ladder's, so every price this chart prints reads the same as the row it
// belongs to.
describe("the chart prints prices through one formatter (Q1-I12)", () => {
  const CHART = readFileSync("src/components/charts/MarketChart.tsx", "utf8");

  it("has no second price formatter of its own", () => {
    assert.doesNotMatch(CHART, /formatChartPrice/);
  });

  it("renders the OHLC readout and the level lines through the ladder's formatter", () => {
    // The readout passes ohlcDigits — the fixed-width form of the SAME
    // formatter (review fold: a per-bar readout without a minimum width
    // shivers). Still one formatter: the second argument is the width, not
    // a second implementation.
    assert.match(
      CHART,
      /O \{formatNumber\(hoverBar\.open, ohlcDigits\)\} H \{formatNumber\(hoverBar\.high, ohlcDigits\)\} L \{formatNumber\(hoverBar\.low, ohlcDigits\)\} C \{formatNumber\(hoverBar\.close, ohlcDigits\)\}/,
    );
    assert.match(CHART, /title: `\$\{level\.label\} · \$\{formatNumber\(level\.price\)\}`/);
  });
});
