import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const css = () => readFileSync("src/styles/index.css", "utf8");

// Spec §3's table is the palette's source of truth, so it is read rather than
// restated: the row labels there are prose ("Muted ink", "Accent pressed"), so
// the one thing pinned here is which CSS custom property each row governs. A
// re-valuation in the spec fails these tests until the CSS follows, which is the
// direction the dependency should run.
const SPEC_ROW_TO_TOKEN: Record<string, string> = {
  "Base": "--color-paper",
  "Sheet (cards)": "--color-sheet",
  "Ink (text)": "--color-ink",
  "Muted ink": "--color-ink-muted",
  "Hairline": "--color-hairline",
  "Accent (brand)": "--color-accent",
  "Accent pressed": "--color-accent-pressed",
  "Buy / long": "--color-buy",
  "Sell / short": "--color-sell",
  "Caution": "--color-caution",
};

const SPEC_PALETTE: Record<string, { light: string; dark: string }> = (() => {
  const spec = readFileSync(
    "docs/superpowers/specs/2026-07-29-levelflow-visual-overhaul-design.md",
    "utf8",
  );
  const palette: Record<string, { light: string; dark: string }> = {};
  for (const line of spec.split("\n")) {
    const cells = line.split("|").map((cell) => cell.trim());
    if (cells.length < 5) {
      continue;
    }
    const token = SPEC_ROW_TO_TOKEN[cells[1]];
    // The cells carry a name beside the hex ("#F4F1EA paper", "#EDE7DA cream").
    const light = cells[2].match(/#[0-9A-Fa-f]{6}/)?.[0];
    const dark = cells[3].match(/#[0-9A-Fa-f]{6}/)?.[0];
    if (token && light && dark) {
      palette[token] = { light, dark };
    }
  }
  assert.equal(
    Object.keys(palette).length,
    Object.keys(SPEC_ROW_TO_TOKEN).length,
    "every row of spec §3's colour table must parse — a row label changed",
  );
  return palette;
})();

function declarations(block: string): Record<string, string> {
  return Object.fromEntries(
    Array.from(
      block.matchAll(/(--color-[a-z-]+):\s*(#[0-9A-Fa-f]{6});/g),
      (match) => [match[1], match[2].toUpperCase()],
    ),
  );
}

const darkBlock = (source: string) =>
  declarations(
    source.match(/html\[data-theme="dark"\] \{[\s\S]*?\n\}/)?.[0] ?? "",
  );

const channels = (hex: string) => [
  Number.parseInt(hex.slice(1, 3), 16),
  Number.parseInt(hex.slice(3, 5), 16),
  Number.parseInt(hex.slice(5, 7), 16),
];

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
    assert.match(s, /--font-sans:\s*"Inter Variable"/);
    assert.match(s, /--font-display:\s*"Space Grotesk Variable"/);
    assert.match(s, /--font-mono:\s*"IBM Plex Mono"/);
  });

  it("imports the mono role's latin subset only — @fontsource offers the entry point, and nothing renders past it", () => {
    // The mono role reads columns of money: tickers, prices, times, R multiples.
    // Its whole glyph set is ASCII plus · ± − (all inside the latin subset's
    // unicode-range), so the cyrillic/cyrillic-ext/latin-ext/vietnamese faces
    // the family entry point pulls in were eight @font-face rules and sixteen
    // files no reader could ever fetch. The two variable families have no
    // per-subset entry point in their packages, so they stay on the family
    // import — their extra subsets cost render-blocking CSS but never a
    // download, since unicode-range keeps them unfetched.
    const s = css();
    assert.match(s, /@import "@fontsource\/ibm-plex-mono\/latin-400.css";/);
    assert.match(s, /@import "@fontsource\/ibm-plex-mono\/latin-600.css";/);
    assert.doesNotMatch(s, /@import "@fontsource\/ibm-plex-mono\/[46]00.css";/);
  });

  it("defines the editorial palette with dark-theme overrides", () => {
    const s = css();
    for (const [token, light] of Object.entries(SPEC_PALETTE)) {
      assert.match(
        s,
        new RegExp(`${token}:\\s*${light.light}`, "i"),
        `${token} ${light.light}`,
      );
    }
    const dark = s.split('html[data-theme="dark"]')[1] ?? "";
    assert.ok(dark.length > 0, "dark override block exists");
    // Stage 3 (Task 7) deletes the legacy alias bridge entirely once every
    // usage is migrated — assert the six aliases are gone for good.
    assert.doesNotMatch(
      s,
      /--color-navy|--color-slate|--color-bullish|--color-canvas|--color-warning|--color-danger/,
    );
  });

  // Until this, the dark half of the palette was pinned by presence alone: ten
  // `assert.match(css, /#161411/i)` calls, which pass just as happily when a
  // value sits in a comment, or is bound to the wrong token, or when the whole
  // html[data-theme="dark"] block has been deleted and the hexes survive
  // somewhere else in the file. Light was pinned the same way. The bindings are
  // the thing the theme actually is, so these read them.
  it("binds every dark token to spec §3's own value, and only those ten", () => {
    const block = darkBlock(css());
    for (const [token, value] of Object.entries(SPEC_PALETTE)) {
      assert.equal(
        block[token],
        value.dark,
        `${token} must be ${value.dark} under html[data-theme="dark"]`,
      );
    }
    // Exactly the ten: a token declared light-only silently falls back to its
    // light value on the dark theme, and an eleventh here is a token the spec's
    // table never approved.
    assert.deepEqual(
      Object.keys(block).sort(),
      Object.keys(SPEC_PALETTE).sort(),
    );
  });

  it("binds every light token in @theme to the same table, so the two halves cannot drift apart", () => {
    const theme = css().match(/@theme \{[\s\S]*?\n\}/)?.[0] ?? "";
    assert.ok(theme.length > 0, "expected the @theme block");
    for (const [token, value] of Object.entries(SPEC_PALETTE)) {
      assert.match(
        theme,
        new RegExp(`${token}:\\s*${value.light};`, "i"),
        `${token} must be ${value.light} in @theme`,
      );
    }
  });

  it("gives the dark theme a genuinely warm base — spec §3: 'never graphite'", () => {
    // The one claim in §3 that is about the values rather than each value: the
    // dark base and sheet are paper-derived, so red > green > blue in both. A
    // neutral or cool grey would satisfy every assertion above by hex and still
    // lose the editorial character the inversion is supposed to survive.
    const block = darkBlock(css());
    for (const token of ["--color-paper", "--color-sheet", "--color-ink"]) {
      const [red, green, blue] = channels(block[token]);
      assert.ok(
        red > green && green > blue,
        `${token} (${block[token]}) is not warm: r${red} g${green} b${blue}`,
      );
    }
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

  it("binds the static sheet's own three theme blocks to spec §3 as well", () => {
    // The static pages carry the same palette under their own names (the app's
    // --color-paper is --color-base here) and in three blocks rather than two:
    // the OS media query, plus an explicit override each way so the app's stored
    // choice wins (legal-theme.js mirrors it into html[data-theme]). Presence of
    // the hexes was pinned above and says nothing about which token holds them,
    // or about the two override blocks agreeing with the media query.
    const legal = readFileSync("public/legal/legal.css", "utf8");
    const STATIC_NAME: Record<string, string> = {
      "--color-paper": "--color-base",
      "--color-sheet": "--color-sheet",
      "--color-ink": "--color-ink",
      "--color-ink-muted": "--color-ink-muted",
      "--color-hairline": "--color-hairline",
      "--color-accent": "--color-accent",
      "--color-accent-pressed": "--color-accent-pressed",
    };
    const blocks = {
      light: declarations(legal.match(/^:root \{[\s\S]*?\n\}/m)?.[0] ?? ""),
      mediaDark: declarations(
        // Non-greedy to the first closing brace in column 1 — the media block's
        // own, since the :root inside it is indented.
        legal.match(
          /@media \(prefers-color-scheme: dark\) \{[\s\S]*?\n\}/,
        )?.[0] ?? "",
      ),
      explicitDark: declarations(
        legal.match(/html\[data-theme="dark"\] \{[\s\S]*?\n\}/)?.[0] ?? "",
      ),
      explicitLight: declarations(
        legal.match(/html\[data-theme="light"\] \{[\s\S]*?\n\}/)?.[0] ?? "",
      ),
    };
    for (const [appToken, staticToken] of Object.entries(STATIC_NAME)) {
      const { light, dark } = SPEC_PALETTE[appToken];
      assert.equal(blocks.light[staticToken], light, `:root ${staticToken}`);
      assert.equal(
        blocks.explicitLight[staticToken],
        light,
        `html[data-theme="light"] ${staticToken}`,
      );
      assert.equal(
        blocks.mediaDark[staticToken],
        dark,
        `prefers-color-scheme: dark ${staticToken}`,
      );
      assert.equal(
        blocks.explicitDark[staticToken],
        dark,
        `html[data-theme="dark"] ${staticToken}`,
      );
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
