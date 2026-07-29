import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
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

// Utility name → palette values, legacy aliases included (index.css @theme).
const FILL_TOKENS: Record<string, { light: string; dark: string }> = {
  paper: { light: LIGHT.paper, dark: DARK.paper },
  canvas: { light: LIGHT.paper, dark: DARK.paper },
  sheet: { light: LIGHT.sheet, dark: DARK.sheet },
  ink: { light: LIGHT.ink, dark: DARK.ink },
  navy: { light: LIGHT.ink, dark: DARK.ink },
  "ink-muted": { light: LIGHT.muted, dark: DARK.muted },
  slate: { light: LIGHT.muted, dark: DARK.muted },
  accent: { light: LIGHT.accent, dark: DARK.accent },
  bullish: { light: LIGHT.accent, dark: DARK.accent },
  "accent-pressed": { light: LIGHT.pressed, dark: DARK.pressed },
  buy: { light: LIGHT.buy, dark: DARK.buy },
  sell: { light: LIGHT.sell, dark: DARK.sell },
  danger: { light: LIGHT.sell, dark: DARK.sell },
  caution: { light: LIGHT.caution, dark: DARK.caution },
  warning: { light: LIGHT.caution, dark: DARK.caution },
};
const FIXED_TEXT = { white: "#FFFFFF", black: "#000000" };

describe("theme-inverting fills never carry fixed-color content", () => {
  // Token fills re-value between themes; text-white/text-black do not, so a
  // pairing that reads fine in one theme can collapse in the other (white on
  // the dark-theme ink fill is ~1.25:1). Scan every string literal in src and
  // require such pairings to clear AA against the fill in BOTH themes.
  it("bg-<token> with text-white/black clears 4.5:1 in both themes", () => {
    const offenders: string[] = [];
    const files = readdirSync("src", { recursive: true })
      .map(String)
      .filter((f) => /\.tsx?$/.test(f));
    for (const rel of files) {
      const source = readFileSync(join("src", rel), "utf8");
      for (const literal of source.match(/"[^"\n]*"|'[^'\n]*'|`[^`]*`/g) ?? []) {
        const fixed = [...literal.matchAll(/\btext-(white|black)\b/g)].map((m) => m[1]);
        if (fixed.length === 0) continue;
        const fills = [...literal.matchAll(/\bbg-([a-z][a-z-]*)(?![\w/-])/g)]
          .map((m) => m[1])
          .filter((token) => token in FILL_TOKENS);
        for (const token of fills) {
          for (const name of fixed) {
            const hex = FIXED_TEXT[name as keyof typeof FIXED_TEXT];
            for (const theme of ["light", "dark"] as const) {
              const r = ratio(hex, FILL_TOKENS[token][theme]);
              if (r < 4.5) {
                offenders.push(`${rel}: text-${name} on bg-${token} — ${theme} ${r.toFixed(2)} < 4.5`);
              }
            }
          }
        }
      }
    }
    assert.deepEqual(offenders, [], `pair token fills with token content that re-values with them:\n${offenders.join("\n")}`);
  });
});

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
