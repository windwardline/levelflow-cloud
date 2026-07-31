import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

// Spec §17c, standing: "Box-on-box, global and standing — sweep every remaining
// gratuitous box on every tab, view, and platform. A bordered sheet survives
// only where it is a true interactive affordance (result/position rows, form
// fields, buttons) or the mock-drawn Insights table frame — never as passive
// grouping. languageGuard-style CI enforcement where a guard can pin it."
//
// This is that enforcement. It finds every full-perimeter bordered sheet in
// src/ and requires each one to appear in the table below with the reason it
// survives. A new box fails the suite until someone writes down why it is an
// affordance — which is the §16 review discipline (both directions, always) in
// the one form that cannot be forgotten.
//
// Detection is deliberately narrow: a *box* is a class list carrying a
// border-WIDTH utility on all four sides (`border`, `border-2`,
// `border-[1.5px]`, with or without a variant prefix) or the .terminal-panel
// component class. Single-edge rules (`border-t`, `border-b`, `border-l-[3px]`)
// are separators, which this system uses everywhere and which the ruling is not
// about; colour-only utilities (`border-hairline`, `focus-within:border-accent`)
// draw nothing on their own.
const BOX_WIDTH = /(?:^|\s)(?:[a-z-]+:)*border(?:-\[[^\]]+\]|-\d+)?(?=\s|$)/;
const PANEL_CLASS = /\bterminal-panel\b/;

type Survivor = {
  // A distinctive fragment of the surviving class list.
  match: string;
  // Why this bordered sheet is not passive grouping.
  why: string;
};

const SURVIVORS: Record<string, Survivor[]> = {
  // ---- interactive affordances -------------------------------------------
  "src/App.tsx": [
    {
      match: "rounded-full border-[1.5px] border-hairline bg-sheet",
      why: "the mobile account menu's avatar trigger — a button",
    },
    {
      match: "rounded-lg border border-hairline bg-sheet py-1 shadow-lg",
      why:
        "that menu's popup: a detached plane over page content, which needs an opaque edge to be legible at all",
    },
  ],
  "src/components/workspace/BrokerChip.tsx": [
    {
      match: "rounded-md border-[1.5px] border-hairline bg-sheet px-[9px]",
      why:
        "the mock's own .broker pill, compact variant (tokens.css:22) — a labelled identity token, not a container",
    },
    {
      match: "rounded-md border-[1.5px] border-hairline bg-sheet px-3",
      why: "the same pill at full size, drawn by every approved mock that shows the broker",
    },
  ],
  "src/components/workspace/ThemeToggle.tsx": [
    {
      match: "inline-flex gap-0.5 rounded-lg border border-hairline p-[3px]",
      why:
        "the segmented theme control (p-profile-v2.html:27) — a form control, and outline-only since §17e",
    },
  ],
  "src/components/workspace/ScopeMenu.tsx": [
    {
      match: "rounded-lg border border-hairline bg-sheet py-1 shadow-lg",
      why: "the scope menu's anchored popup — same reason as the account menu's",
    },
  ],
  "src/components/workspace/AdvisorWorkspace.tsx": [
    {
      match: "min-h-11 rounded-lg border border-ink bg-transparent",
      why: "the chart-view select — a form field",
    },
    {
      match: "min-w-0 border border-hairline border-t-0 bg-sheet",
      why:
        "the mock's .setup sheet (a-desk-v3.html:53), attached hairline-flush under the chart sheet — the stage's own content plane, and the one frame between them",
    },
  ],
  "src/components/workspace/MarketScanPanel.tsx": [
    {
      match: "max-lg:rounded-lg max-lg:border",
      why:
        "the scan result row as the mobile mock's inset card (m-scan-v1.html:17) — the row is a button",
    },
  ],
  "src/components/workspace/AdvisorRecommendationPanel.tsx": [
    {
      match: "max-lg:border-[1.5px] max-lg:border-buy",
      why: "the ladder's per-value copy control below lg — a button, in its copied state",
    },
    {
      match: "max-lg:border-[1.5px] max-lg:border-accent",
      why: "the same control in its idle state",
    },
    {
      match: "max-lg:rounded-lg max-lg:border max-lg:bg-sheet",
      why:
        "the ladder row as the mobile mock's copy card (m-mobile-v3.html:25-29) — the row's whole content is a value and the button that copies it",
    },
  ],
  "src/components/workspace/CurrentTradesRail.tsx": [
    {
      match: "rounded-lg border border-hairline bg-sheet px-3.5 py-3",
      why:
        "the position card — the one box both mocks draw on this surface (a-desk-v3.html:60), and §17c names position rows as surviving",
    },
  ],
  // ---- the mock-drawn frames §17c names ----------------------------------
  "src/components/workspace/HistoryPanel.tsx": [
    {
      match: "terminal-panel p-3 sm:p-4",
      why: "the Insights table frame — named in §17c as surviving",
    },
  ],
  "src/components/charts/MarketChart.tsx": [
    {
      match: "relative min-w-0 overflow-hidden border border-hairline bg-sheet",
      why: "the mock's .chart sheet (a-desk-v3.html:43) — the chart's own frame",
    },
    {
      match: "rounded-lg border border-hairline bg-sheet px-3 py-2",
      why:
        "the OHLC readout floating over live canvas: without its own plane the numbers sit on candles and cannot be read",
    },
    {
      match: "rounded-lg border border-hairline bg-sheet p-1 shadow-xs",
      why: "the chart tool cluster — five buttons, over that same canvas",
    },
  ],
  // ---- pre-auth surfaces, outside the mockups' scope ---------------------
  // §16 puts the Auth and Parking screens out of the mockups' scope by name,
  // and the owner's §17c live-QA was conducted on the authed app. The login
  // panel's card is that surface's own approved composition, and its two
  // notices sit inside it. Flagged in the wave-4 report for a ruling rather
  // than restyled here on inference: a sign-in screen is not a tab.
  "src/components/auth/AuthScreen.tsx": [
    {
      match: "terminal-panel auth-login-panel",
      why: "the login panel — the pre-auth surface's own composition, no mock governs it",
    },
    {
      match: "rounded-lg border border-caution/25 bg-caution/10",
      why: "missing-configuration notice, inside that panel — FLAGGED for a ruling",
    },
    {
      match: "rounded-lg border border-accent/25 bg-accent/10",
      why: "magic-link-sent notice, inside that panel — FLAGGED for a ruling",
    },
  ],
};

function sourceFilesUnder(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      return sourceFilesUnder(path);
    }
    return entry.name.endsWith(".tsx") ? [path] : [];
  });
}

// A real scanner rather than tests/languageGuard.test.ts's regex, because this
// guard must NOT read comments. That file's copy scan wants them (a banned word
// must not be quotable even in an explanation); here the opposite holds — these
// files document the utilities they replaced, and a comment naming
// `max-lg:border` while explaining a specificity subtlety is prose, not a box.
// Walking the source once is the only way to tell a literal from a literal
// inside a comment.
function literals(source: string): string[] {
  const found: string[] = [];
  let index = 0;
  while (index < source.length) {
    const char = source[index];
    const next = source[index + 1];
    if (char === "/" && next === "/") {
      const end = source.indexOf("\n", index);
      index = end === -1 ? source.length : end + 1;
      continue;
    }
    if (char === "/" && next === "*") {
      const end = source.indexOf("*/", index + 2);
      index = end === -1 ? source.length : end + 2;
      continue;
    }
    if (char === '"' || char === "'" || char === "`") {
      let cursor = index + 1;
      while (cursor < source.length) {
        if (source[cursor] === "\\") {
          cursor += 2;
          continue;
        }
        if (source[cursor] === char) {
          break;
        }
        // Quote delimiters cannot span lines in valid JS/TS; a stray apostrophe
        // in prose would otherwise swallow the rest of the file.
        if (source[cursor] === "\n" && char !== "`") {
          break;
        }
        cursor += 1;
      }
      if (source[cursor] === char) {
        found.push(source.slice(index + 1, cursor));
      }
      index = cursor + 1;
      continue;
    }
    index += 1;
  }
  return found;
}

describe("§17c — a bordered sheet survives only as an affordance", () => {
  const matched = new Set<string>();

  for (const file of sourceFilesUnder("src")) {
    it(`${file} draws no unjustified box`, () => {
      const allowed = SURVIVORS[file] ?? [];
      for (const literal of literals(readFileSync(file, "utf8"))) {
        if (!BOX_WIDTH.test(literal) && !PANEL_CLASS.test(literal)) {
          continue;
        }
        const entry = allowed.find((survivor) =>
          literal.includes(survivor.match)
        );
        assert.ok(
          entry,
          `${file} draws a bordered sheet with no entry in this guard's table:\n` +
            `  "${literal}"\n` +
            "Either flatten it (§17c: never as passive grouping) or add it to " +
            "SURVIVORS with the reason it is a true interactive affordance.",
        );
        matched.add(`${file}::${entry.match}`);
      }
    });
  }

  // The table stays honest in both directions: an entry that stops matching is
  // a box that was flattened or moved, and a stale justification is how a
  // survivor list quietly turns into a licence.
  it("carries no stale justification — every listed survivor still exists", () => {
    for (const [file, survivors] of Object.entries(SURVIVORS)) {
      for (const survivor of survivors) {
        assert.ok(
          matched.has(`${file}::${survivor.match}`),
          `${file} no longer draws "${survivor.match}" — remove the entry`,
        );
      }
    }
  });

  it("names a reason for every survivor", () => {
    for (const survivors of Object.values(SURVIVORS)) {
      for (const survivor of survivors) {
        assert.ok(survivor.why.length > 20, survivor.match);
      }
    }
  });
});
