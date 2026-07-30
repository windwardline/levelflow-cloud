import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const ROOTS = [
  "src/components/workspace",
  "src/components/charts",
  "src/components/trade",
  "src/components/donations",
];
const LIB_FILES = [
  "src/lib/outcomes.ts",
  "src/lib/replayReliability.ts",
  "src/lib/advisorReview.ts",
];
const BANNED = [/\bTP1\b/, /\brunner\b/i, /out-of-sample/i, /\bATR\b/];

// Files whose plain-language rewrite lands in a later task. Each stays
// listed, with the owning task noted, until that task's recomposition
// removes it. Task 7 asserts this list is empty.
const SKIPPED_FILES = [
  "MarketScanPanel.tsx", // Task 4 — advisor context recomposition
  "OverviewPanel.tsx", // Task 6 — guide/about/profile/donate recomposition
  "GuidePanel.tsx", // Task 6 — guide/about/profile/donate recomposition
  "AdvisorWorkspace.tsx", // Task 4 — advisor context recomposition
  "outcomes.ts", // Task 5 — insights recomposition
];

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
  const files = ROOTS.flatMap((root) =>
    readdirSync(root)
      .filter((file) => file.endsWith(".tsx") || file.endsWith(".ts"))
      .map((file) => join(root, file))
  ).concat(LIB_FILES);

  for (const file of files) {
    const isSkipped = SKIPPED_FILES.some((skipped) => file.endsWith(skipped));
    const runner = isSkipped ? it.skip : it;
    runner(`${file} has no banned quant vocabulary in string literals`, () => {
      for (const literal of stringLiterals(readFileSync(file, "utf8"))) {
        for (const banned of BANNED) {
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
