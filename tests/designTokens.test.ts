import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const css = () => readFileSync("src/styles/index.css", "utf8");

describe("design tokens", () => {
  it("pins every breakpoint in px — rem breakpoints scale with the browser font setting and served Chrome-desktop users the mobile layout (PR #92)", () => {
    const s = css();
    assert.match(s, /--breakpoint-sm:\s*640px;/);
    assert.match(s, /--breakpoint-md:\s*768px;/);
    assert.match(s, /--breakpoint-lg:\s*1024px;/);
    assert.match(s, /--breakpoint-xl:\s*1280px;/);
    assert.match(s, /--breakpoint-2xl:\s*1536px;/);
    assert.doesNotMatch(s, /--breakpoint-[a-z0-9]+:\s*[\d.]+rem/);
  });

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
      ["--color-sell", "#B3261E"], ["--color-caution", "#8A5B00"],
    ]) {
      assert.match(s, new RegExp(`${pair[0]}:\\s*${pair[1]}`, "i"), pair.join(" "));
    }
    const dark = s.split('html[data-theme="dark"]')[1] ?? "";
    for (const hex of ["#161411", "#1E1B16", "#EDE7DA", "#969082", "#35322B", "#6B86FF", "#7D95FF", "#4CC38A", "#E5766E", "#D9A441"]) {
      assert.match(s, new RegExp(hex, "i"), `dark value ${hex} present`);
    }
    assert.ok(dark.length > 0, "dark override block exists");
    // Stage 3 (Task 7) deletes the legacy alias bridge entirely once every
    // usage is migrated — assert the six aliases are gone for good.
    assert.doesNotMatch(
      s,
      /--color-navy|--color-slate|--color-bullish|--color-canvas|--color-warning|--color-danger/,
    );
  });

  it("restyles the kit in editorial language", () => {
    const s = css();
    assert.match(s, /\.wordmark\s*\{[^}]*var\(--font-display\)/s);
    assert.match(s, /\.terminal-panel\s*\{[^}]*var\(--color-sheet\)/s);
    assert.doesNotMatch(s, /backdrop-filter/);
    assert.match(s, /\.primary-button\s*\{[^}]*var\(--color-accent\)/s);
    assert.match(s, /\.link-accent/);
    assert.match(s, /:focus-visible\s*\{[^}]*var\(--color-accent\)/s);
    assert.match(s, /prefers-reduced-motion/);
  });

  // This assertion used to pin `.nav-button-active`'s accent underline. Spec
  // §16 killed the icon-chip nav pills those two classes styled, replacing
  // them with the masthead's literal-utility text nav (App.tsx), and
  // hand-written @layer components rules ship whether or not anything uses
  // them — so the styles were dead weight in every bundle. Deleted here in the
  // same change as the CSS, since a stale assertion is what would otherwise
  // have kept them alive.
  it("ships no styles for the retired nav pills", () => {
    assert.doesNotMatch(css(), /nav-button/);
  });

  // Tailwind v4 detects content by scanning raw text, so a plan or spec that
  // merely names a utility generates it — 24 selectors in the bundle came from
  // docs/ alone (the mockups' own tokens.css and a plan sentence describing the
  // wrapper the masthead replaced). Excluding docs/ is the only fix that holds,
  // since accurate history has to go on naming what it replaced.
  it("scans only real source for classes — docs prose never generates CSS", () => {
    assert.match(css(), /@source not "\.\.\/\.\.\/docs";/);
  });

  it("carries the Levelflow name, not the legacy casing", () => {
    const html = readFileSync("index.html", "utf8");
    assert.match(html, /<title>Levelflow — Market review<\/title>/);
    assert.doesNotMatch(html, /LevelFlow/);
  });

  it("pins the static-page palette to the same spec hexes", () => {
    const legal = readFileSync("public/legal/legal.css", "utf8");
    for (const hex of ["#F4F1EA", "#FDFCF9", "#1B1B1B", "#6B675E", "#D8D2C4", "#2244FF", "#1A35CC", "#161411", "#1E1B16", "#EDE7DA", "#969082", "#35322B", "#6B86FF", "#7D95FF"]) {
      assert.match(legal, new RegExp(hex, "i"), `legal.css hex ${hex} present`);
    }
  });

  it("carries forward the Stage-2 explicit-theme override blocks on the static legal page", () => {
    // The app's stored theme choice beats the OS media query on every static
    // page (legal-theme.js mirrors it into html[data-theme]) — both the dark
    // and light override blocks must stay so an explicit choice always wins.
    const legal = readFileSync("public/legal/legal.css", "utf8");
    assert.match(legal, /html\[data-theme="dark"\]\s*\{/);
    assert.match(legal, /html\[data-theme="light"\]\s*\{/);
  });
});
