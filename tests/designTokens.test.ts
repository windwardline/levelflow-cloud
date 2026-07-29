import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const css = () => readFileSync("src/styles/index.css", "utf8");

describe("design tokens", () => {
  it("self-hosts the three font roles (CSP forbids font CDNs)", () => {
    const s = css();
    assert.match(s, /@import "@fontsource-variable\/inter";/);
    assert.match(s, /@import "@fontsource-variable\/space-grotesk";/);
    assert.match(s, /@import "@fontsource\/ibm-plex-mono\/400.css";/);
    assert.match(s, /@import "@fontsource\/ibm-plex-mono\/600.css";/);
    assert.match(s, /--font-sans:\s*"Inter Variable"/);
    assert.match(s, /--font-display:\s*"Space Grotesk Variable"/);
    assert.match(s, /--font-mono:\s*"IBM Plex Mono"/);
  });

  it("defines the editorial palette with dark-theme overrides", () => {
    const s = css();
    for (const pair of [
      ["--color-paper", "#F4F1EA"], ["--color-sheet", "#FDFCF9"],
      ["--color-ink", "#1B1B1B"], ["--color-ink-muted", "#6B675E"],
      ["--color-hairline", "#D8D2C4"], ["--color-accent", "#2244FF"],
      ["--color-accent-pressed", "#1A35CC"], ["--color-buy", "#177245"],
      ["--color-sell", "#B3261E"], ["--color-caution", "#9A6B00"],
    ]) {
      assert.match(s, new RegExp(`${pair[0]}:\\s*${pair[1]}`, "i"), pair.join(" "));
    }
    const dark = s.split('html[data-theme="dark"]')[1] ?? "";
    for (const hex of ["#161411", "#1E1B16", "#EDE7DA", "#969082", "#35322B", "#5A78FF", "#4763E0", "#4CC38A", "#E5766E", "#D9A441"]) {
      assert.match(s, new RegExp(hex, "i"), `dark value ${hex} present`);
    }
    assert.ok(dark.length > 0, "dark override block exists");
    // Legacy aliases bridge old utility names until Stages 2-3 migrate them.
    assert.match(s, /--color-navy:\s*var\(--color-ink\)/);
    assert.match(s, /--color-bullish:\s*var\(--color-accent\)/);
    assert.match(s, /--color-canvas:\s*var\(--color-paper\)/);
  });
});
