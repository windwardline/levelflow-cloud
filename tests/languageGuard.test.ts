import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const ROOTS = [
  // The shell itself. App.tsx renders chrome that carries copy — the masthead's
  // section names, the account menu's rows, and since 2026-08-03 the reload notice
  // (§17f's one approved sentence for that wave) — and it sat outside every root
  // here, so the plain-language scan reached every surface the shell frames and
  // not the frame. Non-recursive, like the roots below, so it adds App.tsx and
  // main.tsx and nothing that already has a root of its own.
  "src",
  // Non-recursive per root, so the app-chrome files that sit directly in
  // src/components (AppFooter.tsx, spec §17c) need this entry of their own —
  // without it a new surface could land there unscanned.
  "src/components",
  "src/components/workspace",
  "src/components/charts",
  "src/components/donations",
  "src/components/auth",
];
// Q2-I10: directory-derived, like ROOTS above. This was a hand-maintained list of
// four, and it missed src/lib/authErrors.ts (three user-facing sentences) and
// src/lib/confidenceTiers.ts (the label + body prose the Insights bands render) —
// two copy-producing modules that were simply never added. Any new one would have
// been missed the same way, which is the failure mode a list has and a glob does
// not.
//
// The whole directory rather than a curated subset: a lib file with no user-facing
// strings has nothing for this scan to find, so including it costs nothing and
// forgetting one costs a guard.
//
// Recursive since §19: src/lib/broker/ is the first subdirectory under src/lib,
// and types.ts there holds the four rendered state words. A non-recursive
// readdirSync sees "broker" as a directory, drops it for not ending in .ts, and
// leaves an entire copy-producing package unscanned — the same failure mode
// Q2-I10 fixed one level up.
const LIB_FILES = readdirSync("src/lib", { recursive: true })
  .map(String)
  .filter((file) => file.endsWith(".ts"))
  .map((file) => join("src/lib", file));
const TP1 = /\bTP1\b/;
const RUNNER = /\brunner\b/i;
const BANNED = [
  TP1,
  RUNNER,
  /out-of-sample/i,
  /\bATR\b/,
  // Spec §8: trade-state language is TradeLocker-aligned — "pending",
  // never "resting" — for every order that's placed but not yet filled.
  /\bresting\b/i,
  // Spec §17b: one lifecycle vocabulary — Pending -> Open (· ±R) -> Unfilled /
  // Banked half / Target 2 / Stopped / Expired in profit / Expired at loss.
  // "Still tracking" was a seventh word for two states that already had names,
  // and its short form was the label "Tracking".
  /\bstill tracking\b/i,
  // Anchored to a whole literal on purpose: this bans the standalone LABEL
  // "Tracking", not the word inside prose, and above all not Tailwind's
  // tracking-* utilities, which appear in className literals on nearly every
  // surface in this app.
  /^\s*Tracking\s*$/,
  // Spec §17c: the Insights below-table blurb is deleted, and this phrase from
  // it "dies app-wide with it". A result is a market fact; no copy anywhere
  // frames the record as a claim about what the user did or did not take.
  /\btaken or not\b/i,
  // Spec §19e: nothing is rendered in a fifth voice. Where E8's sources run out
  // the surface renders one of four words, and none of these hedges is one of
  // them — a governor that says "approximately" has taken a position it cannot
  // defend.
  //
  // "TBD" and "unknown" are anchored to a whole literal, the same technique
  // Tracking above uses and for the same reason: what §19e forbids is a hedge in a
  // VALUE slot, and Insights' own "Unknown date" group heading is a label on a
  // surface that already has its sentences (§20j) — banning the word inside prose
  // would make this feature rewrite another surface's copy on its way past. The
  // §19e describe below bans all five outright inside src/lib/broker, which is
  // where a state word could actually be written.
  /\bN\/A\b/,
  /^\s*unknown\s*$/i,
  /\bapproximately\b/i,
  /\bestimated\b/i,
  /^\s*TBD\s*$/,
];

// Files whose plain-language rewrite lands in a later task. Each stayed
// listed, with the owning task noted, until that task's recomposition
// removed it. Task 6 emptied the list; Task 7 asserts it stays empty.
const SKIPPED_FILES: string[] = [];

// Task 9 shrank this to empty on purpose (binding decision: "the deck
// contains no banned jargon, so SHRINK the allowlist to whatever the deck
// actually needs — ideally empty"). GuidePanel used to carry a carve-out
// here licensing it — and only it — to name "TP1"/"the runner"
// parenthetically so a reader could map Levelflow's plain copy onto outside
// vocabulary. The rebuilt Guide renders
// docs/superpowers/specs/2026-07-30-levelflow-guide-content.md verbatim,
// and that deck's own front matter retires both asides ("the platforms
// don't use those words, so neither do we") — see
// tests/guideAnchors.test.ts's "keeps the deleted teaching asides gone"
// check for the content-side half of this. GuidePanel.tsx is now scanned
// with the exact same BANNED list as every other working surface; the map
// stays (rather than deleting the mechanism outright) in case a future
// surface ever needs a narrowly-scoped carve-out again.
const TAUGHT_IN_THE_GUIDE = new Map<string, RegExp[]>([]);

function bannedPatternsFor(file: string): RegExp[] {
  for (const [taughtIn, taught] of TAUGHT_IN_THE_GUIDE) {
    if (file.endsWith(taughtIn)) {
      return BANNED.filter((pattern) => !taught.includes(pattern));
    }
  }
  return BANNED;
}

// Extracts real string/template literal contents only. A naive "any quote
// to the next matching quote" scan misreads an English contraction or
// possessive apostrophe in prose — a comment ("each symbol's full
// history…") or copy ("the setup's risk") — as a string delimiter, then
// swallows everything up to the NEXT unrelated apostrophe (in another
// comment, another literal, anywhere later in the file) into one giant
// fake "literal". That produced a false BANNED match on replayReliability.ts
// spanning from a header-comment apostrophe to the weak-record sentence's
// apostrophe, dragging the (untouchable, non-rendered) comment's "TP1"
// mention along with it. Real `"…"`/`'…'` string literals can never contain
// a raw newline in valid JS/TS, so — matching the same fix already applied
// in tests/contrast.test.ts — those two delimiters are confined to a single
// line; only backtick template literals may span lines. Escaped delimiters
// are still honored so an escaped quote never ends the literal early.
function stringLiterals(source: string): string[] {
  const pattern =
    /"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|`(?:\\.|[^`\\])*`/g;
  return Array.from(source.matchAll(pattern), (m) => m[0].slice(1, -1));
}

describe("plain language on working surfaces", () => {
  it("scans every lib module, not a hand-kept subset (Q2-I10)", () => {
    // The two the old list had missed, named explicitly: this is the finding's
    // own evidence, and it fails if either module is renamed away without the
    // glob being re-checked.
    for (const file of ["src/lib/authErrors.ts", "src/lib/confidenceTiers.ts"]) {
      assert.ok(LIB_FILES.includes(file), `${file} must be scanned`);
    }
    assert.ok(LIB_FILES.length >= 14, `only ${LIB_FILES.length} lib files found`);
  });

  it("keeps the per-file skip list empty (Task 7 tightens the guard for good)", () => {
    assert.equal(
      SKIPPED_FILES.length,
      0,
      "every surface must be scanned directly — no more deferred rewrites",
    );
  });

  const files = ROOTS.flatMap((root) =>
    readdirSync(root)
      .filter((file) => file.endsWith(".tsx") || file.endsWith(".ts"))
      .map((file) => join(root, file))
  ).concat(LIB_FILES);

  for (const file of files) {
    const isSkipped = SKIPPED_FILES.some((skipped) => file.endsWith(skipped));
    const runner = isSkipped ? it.skip : it;
    runner(`${file} has no banned quant vocabulary in string literals`, () => {
      const patterns = bannedPatternsFor(file);
      for (const literal of stringLiterals(readFileSync(file, "utf8"))) {
        for (const banned of patterns) {
          assert.doesNotMatch(
            literal,
            banned,
            `${file}: "${literal.slice(0, 60)}"`,
          );
        }
      }
    });
  }
});

// Spec §17c kills one phrase app-wide rather than on one surface, and the
// scan above cannot enforce that on its own: it reads string literals only,
// while the sentence that carried this phrase was JSX text. So this scans the
// raw source of every file under src/ — literals, JSX text, and comments
// alike — which is exactly the reach "dies app-wide" asks for. The phrase is
// also in BANNED above, so a future *literal* fails on both guards.
describe("§17c — the record never frames a result as a claim about the user", () => {
  function sourceFilesUnder(root: string): string[] {
    return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
      const path = join(root, entry.name);
      if (entry.isDirectory()) {
        return sourceFilesUnder(path);
      }
      return entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")
        ? [path]
        : [];
    });
  }

  it('never says "taken or not" anywhere in src/, in any form', () => {
    for (const file of sourceFilesUnder("src")) {
      // Whitespace-collapsed: JSX wraps prose across lines freely, and the
      // sentence this kills was itself broken mid-phrase ("taken or\n not."),
      // which a raw scan would sail straight past.
      const collapsed = readFileSync(file, "utf8").replace(/\s+/g, " ");
      assert.doesNotMatch(
        collapsed,
        /\btaken or not\b/i,
        `${file} carries the phrase spec §17c deleted app-wide`,
      );
    }
  });
});

// Spec §7's two-target instruction is verbatim and load-bearing: the exact
// wording the design authority signed off on, not a paraphrase. Pin it
// against the rendered source the same way the plain-language scan above
// pins banned words, so a future copy edit that reworks the sentence (even
// with equivalent meaning) fails loudly instead of drifting silently.
const CANONICAL_LADDER_INSTRUCTION =
  "Set your take-profit at Target 2. When price reaches Target 1, close half and move your stop to your entry — profit locked either way.";

describe("canonical ladder instruction (spec §7)", () => {
  it("renders the exact two-target sentence in AdvisorRecommendationPanel, verbatim", () => {
    const source = readFileSync(
      "src/components/workspace/AdvisorRecommendationPanel.tsx",
      "utf8",
    );
    assert.ok(
      source.includes(CANONICAL_LADDER_INSTRUCTION),
      "AdvisorRecommendationPanel.tsx must render spec §7's canonical " +
        "take-profit/bank-half instruction verbatim",
    );
  });

  // Task 9: the Guide deck (docs/superpowers/specs/
  // 2026-07-30-levelflow-guide-content.md §3) features this same sentence
  // as its accent callout — the third of the three places this exact
  // string is now pinned, alongside tradeState.ts's open-pre-Target-1
  // state (tests/tradeState.test.ts).
  it("renders the exact two-target sentence in GuidePanel's §3 callout, verbatim", () => {
    const source = readFileSync(
      "src/components/workspace/GuidePanel.tsx",
      "utf8",
    );
    assert.ok(
      source.includes(CANONICAL_LADDER_INSTRUCTION),
      "GuidePanel.tsx must render spec §7/§3's canonical take-profit/" +
        "bank-half instruction verbatim",
    );
  });
});

// Spec §19a's ruling as CI: nothing renders `brokerSymbol` in wave 1. The
// in-platform order-entry ticker string is NOT PUBLISHED for every asset class —
// the slash format is the E8X dashboard's display convention — and the futures
// roots are [PRIMARY] but Levelflow carries no contract month, so a rendered root
// would be an incomplete order-entry symbol. The field exists for provenance and
// for the join.
describe("§19a — no surface renders an E8 symbol", () => {
  function componentFiles(): string[] {
    return ROOTS.flatMap((root) =>
      readdirSync(root)
        .filter((file) => file.endsWith(".tsx") || file.endsWith(".ts"))
        .map((file) => join(root, file))
    );
  }

  for (const field of ["brokerSymbol", "brokerSymbolAlt"]) {
    it(`never reads ${field} in a component`, () => {
      for (const file of componentFiles()) {
        assert.ok(
          !readFileSync(file, "utf8").includes(field),
          `${file} must not read ${field}`,
        );
      }
    });
  }

  it("keeps the field on the row, so the join and the provenance survive", () => {
    const types = readFileSync("src/lib/broker/types.ts", "utf8");
    assert.match(types, /brokerSymbol: string \| null;/);
    assert.match(types, /brokerSymbolAlt: string \| null;/);
  });
});

// Spec §19e: the four state words, and only the four, are what this feature says
// where E8's sources run out. §20j is the pinning surface, checked in both
// directions — every string the feature renders appears there, and it names nothing
// the feature does not render.
describe("§19e — the rendered vocabulary is exactly §20j's list", () => {
  const SPEC = "docs/superpowers/specs/2026-08-02-broker-sizing-governor-design.md";
  const spec = readFileSync(SPEC, "utf8");
  const panel = readFileSync(
    "src/components/workspace/AdvisorRecommendationPanel.tsx",
    "utf8",
  );
  const profilePanel = readFileSync(
    "src/components/workspace/ProfilePanel.tsx",
    "utf8",
  );
  const types = readFileSync("src/lib/broker/types.ts", "utf8");
  const programs = readFileSync("src/lib/broker/programs.ts", "utf8");

  const RENDERED = [
    // The ladder Size row.
    "Size · lots",
    "Size · contracts",
    "Not offered",
    "Not confirmed",
    "Not published",
    "Rate unavailable",
    // The Profile Broker controls.
    "Program",
    "Account size",
    "Stage",
    "Risk per trade",
    "Drawdown",
    "None",
    "E8 One",
    "E8 One Crypto",
    "E8 Pro Forex",
    "E8 Pro Crypto",
    "E8 Signature Forex",
    "E8 Signature Crypto",
    "E8 Signature Futures",
    "E8 Zero",
    "E8 Zero Futures Starter",
    "E8 Zero Futures Max",
    "Challenge",
    "Performance",
  ];

  it("names every string this feature renders in §20j", () => {
    for (const string of RENDERED) {
      assert.ok(
        spec.includes(`\`${string}\``),
        `§20j must name ${string} as a rendered string`,
      );
    }
  });

  it("renders every §19 string §20j names, somewhere in the shipped source", () => {
    const shipped = [types, programs, panel, profilePanel].join("\n");
    for (const string of RENDERED) {
      // `Size · lots` and `Size · contracts` are composed from the unit, so the
      // unit is what the source carries.
      const needle = string.startsWith("Size · ") ? string.slice(7) : string;
      assert.ok(
        shipped.includes(`"${needle}"`) || shipped.includes(`Size · $`),
        `nothing renders ${string}`,
      );
    }
  });

  it("writes none of §19e's five hedges anywhere in the broker package", () => {
    const brokerFiles = readdirSync("src/lib/broker")
      .filter((file) => file.endsWith(".ts"))
      .map((file) => join("src/lib/broker", file));
    assert.ok(brokerFiles.length >= 5);
    for (const file of brokerFiles) {
      for (const literal of stringLiterals(readFileSync(file, "utf8"))) {
        // Word-boundary, not substring: "en/articles" inside a source URL is not
        // the hedge "N/A", and a guard that says it is trains a reader to ignore it.
        for (
          const hedge of [
            /\bN\/A\b/,
            /\bunknown\b/i,
            /\bapproximately\b/i,
            /\bestimated\b/i,
            /\bTBD\b/i,
          ]
        ) {
          assert.doesNotMatch(literal, hedge, `${file}: "${literal}"`);
        }
      }
    }
  });

  it("renders no fifth state word — the four are a closed set", () => {
    const words = types.match(/SIZE_STATE_WORDS = \{[\s\S]*?\} as const;/)![0];
    const values = Array.from(words.matchAll(/: "([^"]+)"/g), (match) => match[1]);
    assert.deepEqual(values, [
      "Not offered",
      "Not confirmed",
      "Not published",
      "Rate unavailable",
    ]);
  });
});
