import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
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
// Detection covers every idiom that draws a full perimeter, not just the one this
// codebase happens to use today (M4 — the earlier version saw border widths and
// the literal terminal-panel only, so a passive one-pixel Tailwind ring-style
// box would have passed the whole suite). The families are named in prose
// rather than as classes because Tailwind's own scanner reads this file, and a
// class written in a comment is a dead rule in the shipped bundle:
//
//   border, bare or numbered or bracketed    the four-sided border-WIDTH family
//   the same three shapes of rings            Tailwind's second perimeter
//   the same three shapes of outline          and its third
//   zero-offset zero-radius spread shadows    a hairline by another name
//   an arbitrary border or box-shadow value   which bypasses every name above
//   terminal-panel                            the kit's own bordered sheet
//
// All three width families share one shape, which is what keeps the colour-only
// forms out: a colour on any of the three draws nothing on its own, and neither do
// the outline keywords (hidden, none). Single-edge rules and inset markers are
// separators, which this system uses everywhere and which the ruling is not about.
// Ring offsets and the depth shadows draw no perimeter either.
const WIDTH_UTILITY = (property: string) =>
  new RegExp(`(?:^|\\s)(?:[a-z-]+:)*${property}(?:-\\[[^\\]]+\\]|-\\d+)?(?=\\s|$)`);
const BOX_IDIOMS = [
  WIDTH_UTILITY("border"),
  WIDTH_UTILITY("ring"),
  WIDTH_UTILITY("outline"),
  // Spread shadows with zero offset and zero radius are borders by another name.
  /(?:^|\s)(?:[a-z-]+:)*shadow-\[[^\]]*0_0_0_[^\]]*\](?=\s|$)/,
  // Arbitrary properties, which bypass every utility name above.
  /\[(?:border|outline|box-shadow)(?:-[a-z]+)?:[^\]]+\]/,
];
const PANEL_CLASS = /\bterminal-panel\b/;

function drawsABox(literal: string): boolean {
  return BOX_IDIOMS.some((idiom) => idiom.test(literal)) ||
    PANEL_CLASS.test(literal);
}

type Survivor = {
  // A distinctive fragment of the surviving class list.
  match: string;
  // Why this bordered sheet is not passive grouping.
  why: string;
};

const SURVIVORS: Record<string, Survivor[]> = {
  // ---- interactive affordances -------------------------------------------
  "src/App.tsx": [
    // The avatar trigger's own circle left this table with §17i: the trigger
    // renders mark A now, and the mark brings a rounded-square tile with a
    // hairline edge of its own, so the circle would have been a perimeter inside a
    // perimeter. One box fewer on the surface, which is the direction §17c's sweep
    // runs — and the mark itself draws no literal class string, so it adds none.
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
        "the mock's own .broker pill at the mobile masthead's compact geometry (m-mobile-v3.html:43) — a labelled identity token, not a container",
    },
    {
      match: "rounded-md border-[1.5px] border-hairline bg-sheet px-3",
      why:
        "the same .broker pill at the full size the kit defines (tokens.css:22), drawn by every approved mock that shows the broker",
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
      match: "min-h-11 shrink-0 rounded-lg border border-hairline bg-sheet",
      why:
        "the same chart-view select on the merged mobile surface (m-scan-v3.html:18 `.tf`) — a form field, at that mock's compact geometry",
    },
    {
      match: "min-w-0 border border-hairline border-t-0 bg-sheet",
      why:
        "the mock's .setup sheet (a-desk-v3.html:47), attached hairline-flush under the chart sheet — the stage's own content plane, and the one frame between them",
    },
  ],
  "src/components/workspace/AdvisorRecommendationPanel.tsx": [
    {
      match: "max-lg:rounded-md max-lg:border max-lg:border-hairline",
      why:
        "the ladder's per-value copy control below lg (m-scan-v3.html:37 `.cbtn`) — a button, in both its idle and copied states",
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
      why: "the chart tool cluster — six buttons, over that same canvas",
    },
  ],
  // ---- pre-auth surfaces, outside the mockups' scope ---------------------
  // §16 puts the Auth and Parking screens out of the mockups' scope by name, so
  // the login panel's own card stands. Its two notices do not: wave 4 flagged
  // both for a ruling and the owner gave one — they are passive, so they take
  // the Guide's callout idiom and leave this table (see the callout describe
  // below, which pins what they became).
  "src/components/auth/AuthScreen.tsx": [
    {
      match: "terminal-panel auth-login-panel",
      why: "the login panel — the pre-auth surface's own composition, no mock governs it",
    },
  ],
};

// .tsx AND the .ts files that hold class strings. src/components/mobileFrame.ts
// is the pattern: §17g's six fixed-viewport surfaces share one frame, so its
// three class strings live in a plain module rather than being repeated in six
// components — and a box added there would have been a box on six surfaces that
// this guard, walking .tsx only, could not see. Plain .ts modules that hold no
// class strings (every lib/ file, the hooks) contribute nothing either way: they
// have no literal a box idiom can match.
function sourceFilesUnder(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      return sourceFilesUnder(path);
    }
    if (entry.name.endsWith(".tsx")) {
      return [path];
    }
    // A .ts file is in scope when it actually carries class strings, which is
    // what makes it a styling module rather than logic. Read once here rather
    // than filtered by name, so the next mobileFrame.ts is covered on the day it
    // is written and nobody has to remember to add it.
    return entry.name.endsWith(".ts") && carriesClassNames(path) ? [path] : [];
  });
}

// The two shapes a class string takes outside JSX: an exported constant a
// component spreads into className, or a function returning one. Recognised by
// the utilities themselves — a Tailwind layout/spacing/display utility in a
// string literal — rather than by a `className` mention, since a shared frame
// module never writes the attribute at all.
const CLASS_STRING = /(?:^|\s)(?:flex|grid|block|hidden|absolute|fixed|relative|overflow-[a-z]|p[xytblr]?-|m[xytblr]?-|min-[hw]-|max-[hw]-|w-|h-|gap-|rounded|border|shadow|bg-|text-)[a-z0-9[\]./-]*(?=\s|$)/;

function carriesClassNames(path: string): boolean {
  return literals(readFileSync(path, "utf8")).some((literal) =>
    // Two or more utilities: one word like "flex" can be prose or an enum value,
    // a pair is a class list.
    (literal.match(new RegExp(CLASS_STRING, "g")) ?? []).length >= 2
  );
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
        if (!drawsABox(literal)) {
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

  // M5: this used to read `why.length > 20`, which measured test-local prose and
  // was the only thing standing between the survivor table and a rubber stamp —
  // and M6 found four justifications already citing the wrong mock line while it
  // passed. It now checks the three things a justification can actually be wrong
  // about: that it exists, that it is a reason rather than the class list read
  // back, and that any mock line it cites is the line that draws the thing.
  it("names a reason for every survivor — not the class list, and not a citation that has drifted", () => {
    for (const [file, survivors] of Object.entries(SURVIVORS)) {
      for (const survivor of survivors) {
        const where = `${file} :: ${survivor.match}`;
        assert.notEqual(survivor.why.trim(), "", `${where} has no reason`);
        // A justification that repeats the class list says nothing: the guard
        // already knows the class list — what it cannot know is why the box is
        // an affordance.
        assert.ok(
          !survivor.why.includes(survivor.match) &&
            survivor.why.trim() !== survivor.match,
          `${where}: the reason is the class list, not a reason`,
        );

        // Any "mock.html:NN" (or ":NN-MM") the reason cites has to resolve, and
        // if the reason also names a mock selector, the cited line has to be
        // about that selector. Both of the citation drifts M6 found — .tf cited
        // against `.pinned`, .setup cited against `.why` — fail here.
        const citations = Array.from(
          survivor.why.matchAll(
            /\b([a-z0-9-]+\.(?:html|css)):(\d+)(?:-(\d+))?\b/g,
          ),
        );
        const selectors = Array.from(
          survivor.why.matchAll(/(?:^|[\s`(])\.([a-z][a-z0-9-]+)\b/g),
          (match) => match[1],
        );
        if (selectors.length > 0) {
          assert.ok(
            citations.length > 0,
            `${where}: names .${selectors[0]} but cites no mock line for it`,
          );
        }
        const citedLines: string[] = [];
        for (const [, mock, from, to] of citations) {
          const path = join("docs/design/mockups", mock);
          assert.ok(existsSync(path), `${where}: ${mock} does not exist`);
          const lines = readFileSync(path, "utf8").split("\n");
          const first = Number(from);
          const last = Number(to ?? from);
          assert.ok(
            last >= first && last <= lines.length,
            `${where}: ${mock}:${from}${to ? `-${to}` : ""} is out of range`,
          );
          const cited = lines.slice(first - 1, last).join("\n");
          assert.notEqual(
            cited.trim(),
            "",
            `${where}: ${mock}:${from} is a blank line`,
          );
          citedLines.push(cited);
        }
        for (const selector of selectors) {
          assert.ok(
            citedLines.some((cited) => cited.includes(selector)),
            `${where}: cites no mock line that draws .${selector} — ` +
              `the mock the reason names has moved, or the citation was never right`,
          );
        }
      }
    }
  });
});

// Owner ruling (wave 5): the two AuthScreen notices wave 4 flagged are passive
// grouping, and §17c's sweep reaches them. They flatten to the accent-left
// callout the Guide already uses — a single-edge rule, which this file's own
// detection correctly does not count as a box. Pinned in both directions: the
// idiom present, the card gone, and the copy untouched.
describe("§17c reaches the pre-auth notices — callouts, not cards (owner ruling)", () => {
  const auth = readFileSync("src/components/auth/AuthScreen.tsx", "utf8");
  const guide = readFileSync(
    "src/components/workspace/GuidePanel.tsx",
    "utf8",
  );

  it("takes the Guide's own callout treatment: a 3px side rule and the faintest tint", () => {
    // Read from the Guide rather than restated, so the two cannot drift into
    // two different callouts.
    assert.match(guide, /border-l-\[3px\] border-accent bg-accent\/5/);
    assert.match(auth, /border-l-\[3px\] border-caution bg-caution\/5 py-3 pl-4 pr-4/);
    assert.match(auth, /border-l-\[3px\] border-accent bg-accent\/5 py-3 pl-4 pr-4/);
  });

  it("draws no card around either notice any more", () => {
    assert.doesNotMatch(auth, /rounded-lg border border-caution/);
    assert.doesNotMatch(auth, /rounded-lg border border-accent/);
    assert.doesNotMatch(auth, /bg-caution\/10/);
    assert.doesNotMatch(auth, /bg-accent\/10/);
  });

  it("keeps both notices' copy and their conditions exactly", () => {
    assert.match(auth, /\{!isSupabaseConfigured \? \(/);
    assert.match(auth, />\s*Waiting for connection details\./);
    assert.match(auth, /\{status === "sent" \? \(/);
    assert.match(
      auth,
      />\s*Check your inbox and open the magic link to continue\./,
    );
  });
});
