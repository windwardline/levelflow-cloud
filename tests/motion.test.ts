import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

// Spec §8, in full: "One signature: the accent underline draws in (~140ms
// ease-out) on hover/active. Interactive transitions 120-160ms ease-out; tab
// content changes fade 120ms; nothing moves untouched. `prefers-reduced-motion`
// collapses all motion to instant."
//
// Four sentences, four things this file pins. Stage 1 shipped the underline and
// the hand-written kit transitions; what it did not do was reach the bare
// `transition` utility (Tailwind's own default is 150ms ease-IN-out, so every
// hover in the app eased in), the tab/menu/overlay fade, the theme swap, or the
// animation half of reduced motion. Both directions, per §16's review
// discipline: the prescribed motion present, and motion §8 does not ask for
// absent.
const CSS = readFileSync("src/styles/index.css", "utf8");
const APP = readFileSync("src/App.tsx", "utf8");

function sourceFiles(root: string): string[] {
  return readdirSync(root, { recursive: true })
    .map(String)
    .filter((file) => file.endsWith(".ts") || file.endsWith(".tsx"))
    .map((file) => join(root, file));
}

describe("§8 — one source for the interactive band", () => {
  it("re-values Tailwind's own transition defaults to 140ms ease-out", () => {
    // The utility every interactive element in src/ actually writes is the bare
    // `transition`, which resolves these two variables. Left at Tailwind's
    // defaults it is 150ms cubic-bezier(0.4, 0, 0.2, 1) — in the band, wrong
    // curve. cubic-bezier(0, 0, 0.2, 1) is ease-out's own definition.
    assert.match(CSS, /--default-transition-duration:\s*140ms;/);
    assert.match(
      CSS,
      /--default-transition-timing-function:\s*cubic-bezier\(0,\s*0,\s*0\.2,\s*1\);/,
    );
  });

  it("keeps every hand-written kit transition inside 120-160ms, ease-out", () => {
    const declarations = CSS.match(/transition:\s*[^;]+;/g) ?? [];
    assert.ok(declarations.length > 0, "expected kit transitions to exist");
    for (const declaration of declarations) {
      if (declaration.includes("none")) {
        // The theme-swap suppression below, which is the opposite of a duration.
        continue;
      }
      const durations = declaration.match(/(\d+)ms/g) ?? [];
      assert.ok(
        durations.length > 0,
        `${declaration} names no duration — it would inherit Tailwind's`,
      );
      for (const duration of durations) {
        const value = Number(duration.replace("ms", ""));
        assert.ok(
          value >= 120 && value <= 160,
          `${declaration}: ${duration} is outside §8's 120-160ms band`,
        );
      }
      assert.ok(
        !/ease-in|ease-in-out|linear|ease(?![-a-z])/.test(declaration) &&
          declaration.includes("ease-out"),
        `${declaration}: §8 asks for ease-out`,
      );
    }
  });

  it("leaves no per-site duration or easing utility to drift from that source", () => {
    for (const file of sourceFiles("src")) {
      const source = readFileSync(file, "utf8");
      assert.doesNotMatch(
        source,
        /\bduration-(?:\d+|\[)/,
        `${file}: a duration utility at the call site is a second source for ` +
          "§8's band — re-value --default-transition-duration instead",
      );
      assert.doesNotMatch(
        source,
        /\bease-(?:in|linear)\b/,
        `${file}: §8's interactive curve is ease-out`,
      );
    }
  });
});

describe("§8 — the 120ms fade, on the surfaces the spec names", () => {
  it("defines it once, at 120ms ease-out, opacity only", () => {
    assert.match(CSS, /@keyframes lf-fade-in\s*\{\s*from \{ opacity: 0; \}\s*to \{ opacity: 1; \}\s*\}/);
    assert.match(CSS, /\.motion-fade-in \{ animation: lf-fade-in 120ms ease-out; \}/);
  });

  it("fades the tab content region, and re-runs it on every tab change", () => {
    // A CSS animation plays on mount only, so without the key React would reuse
    // the element across tab changes and the fade would happen exactly once per
    // page load. Keyed on activeTab and nothing else — deskMobileView must not
    // remount AdvisorWorkspace.
    // Read as "the keyed element IS the content region", rather than as the two
    // attributes being adjacent: §17i's own scroll region carries a11y
    // attributes between them now (the tab stop that made it keyboard-scrollable),
    // and none of that is what this test is about.
    const region = APP.match(
      /<div\n\s*key=\{activeTab\}[\s\S]*?data-testid="content-region"/,
    )?.[0] ?? "";
    assert.ok(region.length > 0, "expected the keyed content region");
    assert.match(region, /className=\{isMobileViewport/);
    assert.equal((APP.match(/motion-fade-in/g) ?? []).length, 4);
    for (const shell of [
      /\? "motion-fade-in flex w-full min-h-0 flex-col overflow-hidden"/,
      /\? "motion-fade-in mx-auto w-full max-w-7xl px-4/,
      // §17i made this branch the app's one ≥lg scroll region, so the kit's thin
      // scrollbar class leads its list; the fade itself is unchanged.
      /: "scrolly motion-fade-in mx-auto max-w-7xl space-y-5 px-4/,
    ]) {
      assert.match(APP, shell, "every tab-content shell branch fades");
    }
  });

  it("fades both popup menus and the expanded-chart dialog (§8: menu open/close, the expand overlay)", () => {
    assert.match(
      APP,
      /className="motion-fade-in absolute right-0 top-full z-30 mt-2 w-56/,
      "the mobile account menu",
    );
    const scope = readFileSync("src/components/workspace/ScopeMenu.tsx", "utf8");
    assert.match(
      scope,
      /className="motion-fade-in fixed inset-0 z-30 flex flex-col bg-sheet"/,
      "the scope menu's full-screen sheet below lg",
    );
    assert.match(
      scope,
      /className="motion-fade-in scrolly fixed z-30 max-h-80/,
      "the scope menu's anchored popup at lg",
    );
    assert.match(
      readFileSync("src/components/charts/ExpandedChartOverlay.tsx", "utf8"),
      /className="motion-fade-in fixed inset-0 z-40 flex h-\[100dvh\]/,
      "the expand overlay",
    );
  });
});

describe("§8 — a theme swap is not an interaction", () => {
  it("suppresses transitions for the frames the swap takes", () => {
    // Outside every @layer: `transition` is a utility, and utilities outrank the
    // components layer whatever the selector's specificity there.
    const swap = CSS.match(
      /html\[data-theme-swapping\][\s\S]*?transition: none !important;\s*\}/,
    )?.[0];
    assert.ok(swap, "expected the data-theme-swapping suppression rule");
    assert.match(swap, /html\[data-theme-swapping\] \*/);
    assert.match(swap, /html\[data-theme-swapping\] ::before/);
    assert.match(swap, /html\[data-theme-swapping\] ::after/);
    const layered = CSS.split(swap)[0]
      .split("@layer")
      .length - 1;
    const closes = (CSS.split(swap)[0].match(/^\}$/gm) ?? []).length;
    assert.ok(
      closes >= layered,
      "the rule sits after every @layer block has closed",
    );
  });

  it("sets the attribute before the repaint and clears it after, in useThemePreference", () => {
    const effect = APP.match(
      /root\.dataset\.themeSwapping = "";[\s\S]*?\}, \[mode, resolvedMode\]\);/,
    )?.[0];
    assert.ok(effect, "expected the theme effect to flag the swap");
    // Order matters: the flag has to be on the element before the attribute that
    // re-values the tokens.
    assert.ok(
      effect.indexOf("root.dataset.themeSwapping") <
        effect.indexOf("root.dataset.theme = resolvedMode"),
      "the flag is set before data-theme changes",
    );
    assert.match(effect, /delete root\.dataset\.themeSwapping;/);
    // Two frames, and both cancelled on cleanup — a leaked frame would clear the
    // flag during someone else's swap.
    assert.equal((effect.match(/requestAnimationFrame/g) ?? []).length, 2);
    assert.equal((effect.match(/cancelAnimationFrame/g) ?? []).length, 2);
  });
});

describe("§8 — prefers-reduced-motion collapses all motion to instant", () => {
  const block = CSS.match(
    /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\n  \}/,
  )?.[0] ?? "";

  it("collapses animations as well as transitions, and both delays", () => {
    assert.ok(block.length > 0, "expected the reduced-motion block");
    for (const property of [
      /animation-delay: 0ms !important;/,
      /animation-duration: 0\.01ms !important;/,
      /animation-iteration-count: 1 !important;/,
      /transition-delay: 0ms !important;/,
      /transition-duration: 0\.01ms !important;/,
    ]) {
      assert.match(block, property);
    }
    assert.match(block, /\*, ::before, ::after \{/);
  });

  it("keeps the one functional animation alive — a frozen spinner asserts idle on a working button", () => {
    assert.match(block, /\.animate-spin \{[\s\S]*?animation-duration: 1s !important;/);
    assert.match(block, /animation-iteration-count: infinite !important;/);
  });
});

describe("§8 — no decorative motion beyond it", () => {
  it("ships exactly one keyframes animation in the kit", () => {
    assert.deepEqual(
      Array.from(
        CSS.matchAll(/@keyframes\s+([a-z0-9-]+)\s*\{/g),
        (match) => match[1],
      ),
      ["lf-fade-in"],
    );
  });

  it("uses no ambient or attention-seeking animation utility anywhere in src", () => {
    // animate-spin is the loading indicator and stays; these three are ambient
    // motion on elements nobody touched, which is what §8's "nothing moves
    // untouched" rules out.
    for (const file of sourceFiles("src")) {
      const source = readFileSync(file, "utf8");
      for (const banned of ["animate-pulse", "animate-bounce", "animate-ping"]) {
        assert.ok(
          !source.includes(banned),
          `${file}: ${banned} is decorative motion §8 does not ask for`,
        );
      }
    }
  });
});
