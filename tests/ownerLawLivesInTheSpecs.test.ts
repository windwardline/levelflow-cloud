import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

/**
 * An owner ruling may not live only in a code comment.
 *
 * On 2026-09-01 three rulings given 2026-08-07 were found in the header of
 * `tests/e8RosterConformance.test.ts` and NOWHERE else in the repository. One
 * of them — "We will not trade softs and stocks." — existed in that comment
 * alone. It had also drifted against itself twelve lines lower, where the same
 * file called the absence it removes "itself a coverage gap". Both sentences
 * were live. A ruling nobody can find is a ruling that gets re-litigated, and
 * §6b-1 F was carrying work that ruling had already closed.
 *
 * WHY THE OBVIOUS GUARDS DO NOT WORK, measured rather than assumed:
 *
 *   - Requiring a citation on every `owner ruling` mention: 96 references
 *     exist, 31 carry an amendment or § number, and 21 carry no locator at
 *     all. A large retrofit — and it would have MISSED this case, because the
 *     block header read "OWNER RULINGS, 2026-08-07" and a date is a locator.
 *   - Searching comments for directive-shaped language: 48 hits, almost all
 *     UI copy and error strings. Noise, not signal.
 *
 * What separates law from prose is that law is QUOTED SPEECH, in a block that
 * says whose speech it is, and it must appear in the specs. That is the
 * predicate below, and it is tight enough to need no exemption list — the four
 * near-misses in the tree today are sentence FRAGMENTS, and requiring a
 * complete sentence excludes all four without naming any of them.
 *
 * THE INSTRUMENT VALIDATES BEFORE IT SPEAKS. `firesOnAKnownOrphan` runs the
 * detector against the shape of the case that produced it. Without that, a
 * renamed marker or a broken regex leaves every assertion below passing over an
 * empty set — a clean report of nothing examined.
 */

const CODE_ROOTS = ["src", "supabase", "tests", "scripts"];
const CODE_EXT = [".ts", ".tsx", ".sh", ".mjs", ".sql"];
const OWNER_BLOCK = /owner\s+(ruling|directive)/i;
const COMMENT_LINE = /^\s*(\/\/|\*|#|--)/;
/** A complete sentence: capital in, terminator out. Fragments are prose. */
const SENTENCE = /^[A-Z][^"]*[.!?]$/;

const normalise = (text: string) =>
  text.replace(/[\s—‘’“”-]+/g, " ").trim().toLowerCase();

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path, out);
    else out.push(path);
  }
  return out;
}

/** Every word the specs and research records contain, normalised once. */
function specsCorpus(): string {
  return normalise(
    walk("docs")
      .filter((path) => path.endsWith(".md"))
      .map((path) => readFileSync(path, "utf8"))
      .join("\n"),
  );
}

/** Quoted sentences inside owner-ruling comment blocks that the specs do not carry. */
function orphanedQuotes(source: string, corpus: string): Array<{ line: number; quote: string }> {
  const lines = source.split("\n");
  const orphans: Array<{ line: number; quote: string }> = [];
  let block: string[] = [];
  let start = 0;

  const flush = () => {
    if (block.length > 0 && OWNER_BLOCK.test(block.join("\n"))) {
      block.forEach((text, offset) => {
        for (const match of text.matchAll(/"([^"]{25,})"/g)) {
          const quote = match[1].trim();
          if (SENTENCE.test(quote) && !corpus.includes(normalise(quote))) {
            orphans.push({ line: start + offset + 1, quote });
          }
        }
      });
    }
    block = [];
  };

  lines.forEach((text, index) => {
    if (COMMENT_LINE.test(text)) {
      if (block.length === 0) start = index;
      block.push(text);
    } else flush();
  });
  flush();
  return orphans;
}

describe("owner law lives in the specs, not in a code comment", () => {
  const corpus = specsCorpus();

  it("read a specs corpus at all, so a silent empty read cannot pass", () => {
    assert.ok(corpus.length > 100_000, `specs corpus is only ${corpus.length} chars — docs/ did not read`);
  });

  it("fires on a known orphan, so the detector is not inert", () => {
    // The shape of the real case, verbatim in structure. If this stops firing,
    // every assertion below is reporting on an empty set.
    const fixture = [
      "// OWNER RULINGS, 2026-08-07, which decide what the register means:",
      "//",
      '//   1. "We will not trade a market that no source can identify at all."',
      "//      So the register means what it says.",
      "const x = 1;",
    ].join("\n");
    const found = orphanedQuotes(fixture, corpus);
    assert.equal(found.length, 1, "the detector no longer finds a quoted ruling absent from the specs");
    assert.match(found[0].quote, /no source can identify/);
  });

  it("ignores a quoted ruling that the specs DO carry", () => {
    // The other half of the control: it must not fire on law that is filed.
    const filed = [
      '// Owner ruling: "We will not trade softs and stocks." Recorded as',
      "// amendment 41, so this is a citation rather than the law itself.",
      "const y = 2;",
    ].join("\n");
    assert.deepEqual(orphanedQuotes(filed, corpus), []);
  });

  it("finds no owner ruling stranded in code today", () => {
    const stranded = CODE_ROOTS.flatMap((root) =>
      walk(root)
        .filter((path) => CODE_EXT.some((ext) => path.endsWith(ext)))
        .flatMap((path) =>
          orphanedQuotes(readFileSync(path, "utf8"), corpus).map(
            ({ line, quote }) => `${path}:${line} "${quote}"`,
          ),
        ),
    );
    assert.deepEqual(
      stranded,
      [],
      "these read as owner rulings and appear nowhere in docs/:\n  " +
        stranded.join("\n  ") +
        "\nFile the ruling in docs/superpowers/specs/2026-08-02-owner-rulings-amendments.md " +
        "as an amendment, then cite it here. A ruling that lives only in a comment " +
        "is invisible to anyone reading the specs and gets re-litigated.",
    );
  });
});
