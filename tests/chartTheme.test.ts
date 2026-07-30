import assert from "node:assert/strict";
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
