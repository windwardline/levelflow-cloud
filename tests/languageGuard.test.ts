import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const ROOTS = [
  "src/components/workspace",
  "src/components/charts",
  "src/components/trade",
  "src/components/donations",
  "src/components/auth",
];
const LIB_FILES = [
  "src/lib/outcomes.ts",
  "src/lib/replayReliability.ts",
  "src/lib/advisorReview.ts",
];
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
];

// Files whose plain-language rewrite lands in a later task. Each stayed
// listed, with the owning task noted, until that task's recomposition
// removed it. Task 6 emptied the list; Task 7 asserts it stays empty.
const SKIPPED_FILES: string[] = [];

// The Guide is the teaching surface. Spec §7 licenses it — and only it — to
// name the precise vocabulary parenthetically ("first target (TP1)", "second
// target (the runner)") so a reader can map Levelflow's plain copy onto the
// terms they will meet in every other tool. That license covers exactly those
// two words: the Guide is still forbidden the terms nobody may show, so the
// carve-out narrows the pattern list for one file instead of dropping the
// file out of the scan.
const TAUGHT_IN_THE_GUIDE = new Map<string, RegExp[]>([
  ["GuidePanel.tsx", [TP1, RUNNER]],
]);

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
});
