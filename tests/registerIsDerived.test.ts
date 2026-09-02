import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

/**
 * The §6b-1 register derives its own population.
 *
 * The register opens by confessing its defect: "THIS LIST WAS CURATED, NOT
 * DERIVED … the next pass should build the derivation rather than append to
 * the list again." A sweep on 2026-09-01 found four more items it had missed,
 * and the reason none of them was there is that nothing derived it.
 *
 * This is that derivation, and it runs in the direction that can actually be
 * mechanised: every provenance MARKER in engine source must name the register
 * item it belongs to. A marker nobody can trace is how an open question
 * becomes invisible — which is the failure, not the marker.
 *
 * The other direction is deliberately not asserted. A register item need not
 * have a marker: items B, F, G and H were about data, captures, a disk and a
 * sweep mode, none of which annotate a line of code. Requiring a marker per
 * item would force fake ones, and a fake marker is worse than none.
 */

const MARKERS = ["UNDERIVED", "NOT derived", "STRUCK"] as const;
const SEARCH_ROOTS = ["supabase/functions/trade-analyzer", "src/lib"];

/** Every marked line in engine source, derived by grep rather than listed. */
function markedLines(): Array<{ file: string; line: number; text: string }> {
  const out: Array<{ file: string; line: number; text: string }> = [];
  for (const root of SEARCH_ROOTS) {
    let raw = "";
    try {
      raw = execFileSync(
        "grep",
        ["-rn", "--include=*.ts", "-E", MARKERS.join("|"), root],
        { encoding: "utf8" },
      );
    } catch {
      continue; // grep exits 1 when a root has no matches, which is not an error
    }
    for (const entry of raw.split("\n").filter(Boolean)) {
      const match = entry.match(/^([^:]+):(\d+):(.*)$/);
      if (!match) continue;
      out.push({ file: match[1], line: Number(match[2]), text: match[3] });
    }
  }
  return out;
}

describe("the 6b-1 register derives its population rather than curating it", () => {
  it("finds markers at all, so a silent grep cannot pass as cleanliness", () => {
    // The guard that matters most. If the marker vocabulary is renamed and this
    // file is not, every assertion below passes over an empty set and reports a
    // clean derivation of nothing.
    assert.ok(
      markedLines().length >= 5,
      "fewer marked lines than expected — the marker vocabulary probably moved",
    );
  });

  it("makes every marker traceable to a register item", () => {
    const untraceable = markedLines()
      .filter((entry) => !/§?6b-1\s*[A-H]/.test(entry.text))
      .map((entry) => `${entry.file}:${entry.line} ${entry.text.trim().slice(0, 60)}`);
    assert.deepEqual(
      untraceable,
      [],
      "these markers name no register item, so nothing ties them to a decision:\n  " +
        untraceable.join("\n  ") +
        "\nAdd a (§6b-1 <letter>) reference, or if the marker genuinely belongs to " +
        "no register item, say which ruling or amendment it belongs to instead.",
    );
  });

  it("names only items the register actually has", () => {
    const register = readFileSync("docs/HANDOFF.md", "utf8");
    const present = new Set(
      [...register.matchAll(/^\*\*([A-H])\. /gm)].map((match) => match[1]),
    );
    assert.ok(present.size >= 6, "the register's item headings did not parse");
    const dangling = markedLines()
      // [A-Z], not [A-H]. Extracting only valid letters made this guard
      // unfirable: a marker citing "6b-1 Z" failed the traceability test above
      // and reached here with nothing to inspect, so the dangling check passed
      // over an empty set every time. Verified by mutation on 2026-09-01 —
      // one failure where there should have been two.
      .flatMap((entry) => [...entry.text.matchAll(/§?6b-1\s*([A-Z])/g)].map((m) => ({ entry, item: m[1] })))
      .filter(({ item }) => !present.has(item))
      .map(({ entry, item }) => `${entry.file}:${entry.line} cites 6b-1 ${item}`);
    assert.deepEqual(dangling, [], `markers cite register items that do not exist:\n  ${dangling.join("\n  ")}`);
  });
});
