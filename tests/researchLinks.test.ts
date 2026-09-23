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
 * Scope: every tracked markdown file under docs/ and every tracked source
 * file (.ts, .tsx, .mjs, .sh), whose comments cite the same records, and two
 * spellings of a citation — a repository path (`docs/research/…`) and the
 * research tree's short form (`r3/…`, `r4/…` in backticks). A path wrapped
 * across two lines at a hyphen is joined before it is read, so a re-wrap
 * cannot hide a citation. Only .md and .txt targets: the corpora beside them
 * are gitignored by design and cited freely.
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

function trackedSources(): string[] {
  return [...trackedFiles()].filter((path) => /\.(?:ts|tsx|mjs|sh)$/.test(path)).sort();
}

/**
 * Research paths a source names as DATA, not as a citation: each is a fixture
 * the code under test classifies. Keyed by file, and each must still appear,
 * so an entry cannot outlive its reason.
 */
const FIXTURE_PATHS = new Map([
  // Spelled in parts, or this file would cite it.
  ["scripts/vercel-ignore-build-test.sh", [["docs/research/", "note.md"].join("")]],
]);

/** A path wrapped at a hyphen, with the next line's comment or quote marker, reads as one. */
export function joinWrappedPaths(text: string): string {
  return text.replace(/([A-Za-z0-9_./])-\n[ \t]*(?:\/\/+|\*|#|>)?[ \t]*/g, "$1-");
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
    ]) {
      assert.deepEqual([...citedResearchFiles(text)], ["docs/research/evaluator-repair-map-2026-08-09.md"], text);
    }
  });

  it("finds no citation of a file that is not in the tree", () => {
    const tracked = trackedFiles();
    const docs = trackedDocs();
    const dangling: string[] = [];
    let citations = 0;
    for (const doc of docs) {
      const cited = citedResearchFiles(readFileSync(doc, "utf8"));
      citations += cited.size;
      for (const path of cited) {
        if (!tracked.has(path)) dangling.push(`${doc} cites ${path}`);
      }
    }
    assert.ok(citations > 0, "the docs cite research files; a scan that found none examined nothing");
    assert.deepEqual(dangling, [], `every cited research file must be tracked:\n  ${dangling.join("\n  ")}`);
  });

  it("finds no citation of a missing file in a source comment either", () => {
    const tracked = trackedFiles();
    const sources = trackedSources();
    const dangling: string[] = [];
    let citations = 0;
    for (const source of sources) {
      const cited = citedResearchFiles(readFileSync(source, "utf8"));
      const fixtures = FIXTURE_PATHS.get(source) ?? [];
      for (const fixture of fixtures) {
        assert.ok(cited.has(fixture), `${source} no longer names ${fixture}; drop it from FIXTURE_PATHS`);
      }
      for (const path of cited) {
        if (fixtures.includes(path)) continue;
        citations += 1;
        if (!tracked.has(path)) dangling.push(`${source} cites ${path}`);
      }
    }
    for (const source of FIXTURE_PATHS.keys()) assert.ok(sources.includes(source), `${source} is excepted but not tracked`);
    // 79 on 2026-09-23, in 49 files; a scan that finds none examined nothing.
    assert.ok(citations >= 40, `source comments cite ${citations} research files; the scan broke`);
    assert.deepEqual(dangling, [], `every cited research file must be tracked:\n  ${dangling.join("\n  ")}`);
  });
});
