import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

// Task 9 binding decision: "delete OverviewPanel.tsx and every remnant
// (imports, the 'about' tab value/type if still present, tests referencing
// it) — Task 3 removed it from TABS; you remove the file." The seven About
// facts it used to carry live in the Guide deck now (spec §11's absorption
// checklist; verified against
// docs/superpowers/specs/2026-07-30-levelflow-guide-content.md's own
// absorption-map table, which names §1/§2/§7/§8 as their destinations).
const OVERVIEW_PANEL_PATH = "src/components/workspace/OverviewPanel.tsx";

// Every source root that could plausibly import a workspace component,
// mirroring tests/guideAnchors.test.ts and tests/languageGuard.test.ts's own
// ROOTS lists rather than inventing a third, narrower one.
const SOURCE_ROOTS = [
  "src",
  "tests",
];

function allSourceFiles(root: string): string[] {
  return readdirSync(root, { recursive: true })
    .map(String)
    .filter((file) => file.endsWith(".ts") || file.endsWith(".tsx"))
    .map((file) => join(root, file));
}

describe("OverviewPanel is fully retired (Task 9)", () => {
  it("the file itself no longer exists", () => {
    assert.equal(
      existsSync(OVERVIEW_PANEL_PATH),
      false,
      `${OVERVIEW_PANEL_PATH} should have been deleted`,
    );
  });

  it("no source or test file imports or mentions OverviewPanel", () => {
    // Excludes this file itself, which necessarily names OverviewPanel
    // throughout in order to assert its absence everywhere else.
    const THIS_FILE = "tests/overviewPanelRemoved.test.ts";
    const offenders: string[] = [];
    for (const root of SOURCE_ROOTS) {
      for (const file of allSourceFiles(root)) {
        if (
          file !== THIS_FILE &&
          readFileSync(file, "utf8").includes("OverviewPanel")
        ) {
          offenders.push(file);
        }
      }
    }
    assert.deepEqual(offenders, []);
  });

  it('App.tsx carries no "about" AppTab value — the tab bar stayed Desk/Insights/Guide/Profile', () => {
    const appSource = readFileSync("src/App.tsx", "utf8");
    assert.doesNotMatch(appSource, /"about"/);
  });

  it("App.tsx's TABS array still lists exactly Desk, Insights, Guide, Profile, in that order", () => {
    const appSource = readFileSync("src/App.tsx", "utf8");
    const tabsBlock = appSource.match(/const TABS:[\s\S]*?\n\];/)?.[0];
    assert.ok(tabsBlock, "expected to find the TABS array declaration");
    const labels = Array.from(
      tabsBlock.matchAll(/label:\s*"([^"]+)"/g),
      (match) => match[1],
    );
    assert.deepEqual(labels, ["Desk", "Insights", "Guide", "Profile"]);
  });
});
