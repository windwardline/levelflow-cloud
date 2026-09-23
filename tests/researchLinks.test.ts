import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

/**
 * Every research file the records cite must be tracked.
 *
 * On 2026-09-14 the squash of #634 — an engine branch reset onto a main that
 * had moved — deleted `docs/research/open-scope-round-2026-09-13.md` (403
 * lines, the open-scope round's record) and
 * `docs/research/r3/lock-same-bar-2026-09-14.txt` (the instrument finding it
 * rests on). CI was green: nothing pinned prose, and HANDOFF, trade-model, a
 * reader's docblock and a test all kept citing files that no longer existed.
 * #635 restored HANDOFF's block and not the two files. A citation to a file
 * that is gone is a claim nobody can check, so this test refuses the tree.
 *
 * Scope: every tracked TEXT file — derived, not listed by extension: a file
 * is skipped only when its bytes hold a NUL — so markdown, source comments,
 * SQL comments and the .txt and .json records that cite one another are all
 * read. Two spellings of a citation: a repository path (`docs/research/…`) and
 * the research tree's short form (`r3/…`, `r4/…` in backticks). A path wrapped
 * across two lines at a hyphen or a slash is joined before it is read. Only
 * .md and .txt targets: the corpora beside them are gitignored by design and
 * cited freely.
 */

const RESEARCH_PATH = /docs\/research\/[A-Za-z0-9_./-]+?\.(?:md|txt)/g;
const SHORT_FORM = /`(r[34]\/[A-Za-z0-9_./-]+?\.(?:md|txt))`/g;

let trackedCache: Set<string> | undefined;

/** Asked of git inside each test, not at registration: without `.git` this is a counted, named failure. */
function trackedFiles(): Set<string> {
  trackedCache ??= new Set(
    execFileSync("git", ["ls-files", "-z"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })
      .split("\0")
      .filter((path) => path.length > 0),
  );
  return trackedCache;
}

function trackedDocs(): string[] {
  return [...trackedFiles()].filter((path) => path.startsWith("docs/") && path.endsWith(".md")).sort();
}

/** Every tracked file whose bytes are text; a NUL byte marks one that is not. */
function trackedText(): { path: string; text: string }[] {
  const found: { path: string; text: string }[] = [];
  for (const path of [...trackedFiles()].sort()) {
    let bytes: Buffer;
    try {
      bytes = readFileSync(path);
    } catch {
      continue; // tracked but deleted from the working tree
    }
    if (bytes.includes(0)) continue;
    found.push({ path, text: bytes.toString("utf8") });
  }
  return found;
}

/**
 * Research paths a file names as DATA, not as a citation: each is a
 * fabricated fixture the code under test classifies. Keyed by file, and each
 * must still appear, so an entry cannot outlive its reason. A REAL research
 * path used as test data (the examples in this file) is not listed: it is
 * checked like any citation, so retiring the record fails here too.
 */
const FIXTURE_PATHS = new Map([
  // Spelled in parts, or this file would cite it.
  ["scripts/vercel-ignore-build-test.sh", [["docs/research/", "note.md"].join("")]],
]);

/** A path wrapped at a hyphen or a slash, with the next line's comment or quote marker, reads as one. */
export function joinWrappedPaths(text: string): string {
  return text.replace(/([A-Za-z0-9_./])([-/])\n[ \t]*(?:\/\/+|--|\*|#|>)?[ \t]*/g, "$1$2");
}

export function citedResearchFiles(text: string): Set<string> {
  const cited = new Set<string>();
  text = joinWrappedPaths(text);
  for (const match of text.matchAll(RESEARCH_PATH)) cited.add(match[0]);
  for (const match of text.matchAll(SHORT_FORM)) cited.add(`docs/research/${match[1]}`);
  return cited;
}

describe("research citations resolve to tracked files", () => {
  it("scans the records of state and every research note", () => {
    const docs = trackedDocs();
    assert.ok(docs.includes("docs/HANDOFF.md"), "HANDOFF.md is tracked and scanned");
    assert.ok(docs.includes("docs/trade-model.md"), "trade-model.md is tracked and scanned");
    assert.ok(docs.length >= 3, `expected the docs tree, found ${docs.length} markdown files`);
  });

  it("reads both spellings of a citation", () => {
    const cited = citedResearchFiles(
      "see [x](/docs/research/alpha-review-2026-09-07.md), output `r3/entry-edge-2026-09-07.txt`, corpus `r3/capture-all.jsonl`",
    );
    assert.deepEqual(
      [...cited].sort(),
      ["docs/research/alpha-review-2026-09-07.md", "docs/research/r3/entry-edge-2026-09-07.txt"],
    );
  });

  it("reads a path wrapped across two comment or prose lines", () => {
    for (const text of [
      "// out of register (docs/research/evaluator-repair-map-\n// 2026-08-09.md, cluster A)",
      " * see docs/research/evaluator-repair-map-\n *   2026-08-09.md for the map",
      "the map (docs/research/evaluator-repair-map-\n2026-08-09.md) says",
      "> docs/research/evaluator-repair-map-\n> 2026-08-09.md",
      "// see docs/research/\n// evaluator-repair-map-2026-08-09.md",
      "-- docs/research/evaluator-repair-map-\n-- 2026-08-09.md",
    ]) {
      assert.deepEqual([...citedResearchFiles(text)], ["docs/research/evaluator-repair-map-2026-08-09.md"], text);
    }
  });

  it("finds no citation of a file that is not in the tree, in any tracked text file", () => {
    const tracked = trackedFiles();
    const files = trackedText();
    const dangling: string[] = [];
    let citations = 0;
    for (const { path: file, text } of files) {
      const cited = citedResearchFiles(text);
      const fixtures = FIXTURE_PATHS.get(file) ?? [];
      for (const fixture of fixtures) {
        assert.ok(cited.has(fixture), `${file} no longer names ${fixture}; drop it from FIXTURE_PATHS`);
      }
      for (const path of cited) {
        if (fixtures.includes(path)) continue;
        citations += 1;
        if (!tracked.has(path)) dangling.push(`${file} cites ${path}`);
      }
    }
    for (const file of FIXTURE_PATHS.keys()) {
      assert.ok(files.some((entry) => entry.path === file), `${file} is excepted but not a tracked text file`);
    }
    // 275 in 123 files on 2026-09-23; a scan that finds none examined nothing.
    assert.ok(citations >= 200, `tracked files cite ${citations} research files; the scan broke`);
    assert.deepEqual(dangling, [], `every cited research file must be tracked:\n  ${dangling.join("\n  ")}`);
  });
});
