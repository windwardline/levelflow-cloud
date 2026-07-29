import assert from "node:assert/strict";
import { describe, it } from "node:test";

function luminance(hex: string): number {
  const c = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => {
    const v = parseInt(c.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function ratio(a: string, b: string): number {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

const LIGHT = { paper: "#F4F1EA", sheet: "#FDFCF9", ink: "#1B1B1B", muted: "#6B675E", accent: "#2244FF", pressed: "#1A35CC", buy: "#177245", sell: "#B3261E", caution: "#8A5B00" };
const DARK = { paper: "#161411", sheet: "#1E1B16", ink: "#EDE7DA", muted: "#969082", accent: "#6B86FF", pressed: "#7D95FF", buy: "#4CC38A", sell: "#E5766E", caution: "#D9A441" };

describe("palette contrast (WCAG)", () => {
  for (const [name, t] of [["light", LIGHT], ["dark", DARK]] as const) {
    it(`${name}: body text is AAA, secondary and semantic text are AA`, () => {
      for (const bg of [t.paper, t.sheet]) {
        assert.ok(ratio(t.ink, bg) >= 7, `${name} ink on ${bg} ${ratio(t.ink, bg).toFixed(2)}`);
        assert.ok(ratio(t.muted, bg) >= 4.5, `${name} muted on ${bg} ${ratio(t.muted, bg).toFixed(2)}`);
        for (const sem of [t.accent, t.buy, t.sell, t.caution]) {
          assert.ok(ratio(sem, bg) >= 4.5, `${name} ${sem} on ${bg} ${ratio(sem, bg).toFixed(2)}`);
        }
      }
      if (name === "light") {
        assert.ok(ratio("#FFFFFF", t.accent) >= 4.5, `${name} white on accent ${ratio("#FFFFFF", t.accent).toFixed(2)}`);
        assert.ok(ratio("#FFFFFF", t.pressed) >= 4.5, `${name} white on pressed ${ratio("#FFFFFF", t.pressed).toFixed(2)}`);
      } else {
        assert.ok(ratio(t.paper, t.accent) >= 4.5, `${name} paper on accent ${ratio(t.paper, t.accent).toFixed(2)}`);
        assert.ok(ratio(t.paper, t.pressed) >= 4.5, `${name} paper on pressed ${ratio(t.paper, t.pressed).toFixed(2)}`);
      }
    });
  }
});
