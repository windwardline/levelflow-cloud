import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

// No jsdom in this repo's unit-test stack (see tests/currentTradesRail.test.tsx's
// header comment for the fuller explanation) — ProfilePanel.tsx's theme-save
// failure handling is pinned against its real source text instead, the same
// technique that file and tests/scopeMenu.test.tsx already use for markup
// this harness can't render or interact with.
const PANEL_SOURCE = readFileSync(
  "src/components/workspace/ProfilePanel.tsx",
  "utf8",
);

// Fix round 1, item 4 (a real silent-failure regression): the retired
// Preferences form surfaced a save failure inline, not just to the console.
// handleThemeChange's original console.error-only catch reintroduced exactly
// that silent failure for the one write path Profile has left.
describe("ProfilePanel theme-save failure notice (fix round 1, item 4)", () => {
  it("keeps the console.error (debuggable) alongside the new user-facing state, not instead of it", () => {
    assert.match(
      PANEL_SOURCE,
      /console\.error\("\[profile\] theme save failed", error\);\s*setThemeSaveFailed\(true\);/,
    );
  });

  it("clears the failure state at the start of every new attempt, so a later successful save can't leave a stale notice showing", () => {
    assert.match(
      PANEL_SOURCE,
      /onThemeChange\(mode\);\s*setThemeSaveFailed\(false\);\s*onSave\(/,
    );
  });

  it("renders the notice conditionally on themeSaveFailed, inside the Appearance card, right after ThemeToggle", () => {
    assert.match(
      PANEL_SOURCE,
      /<ThemeToggle mode=\{themeMode\} onChange=\{handleThemeChange\} \/>\s*\{themeSaveFailed/,
    );
  });

  it("reuses the retired Preferences form's exact error-notice styling — no new visual pattern", () => {
    assert.match(
      PANEL_SOURCE,
      /rounded-lg border border-sell\/25 bg-sell\/10 px-3 py-2 text-sm font-semibold text-sell/,
    );
  });

  it("states the failure in one plain sentence, matching the retired form's phrasing pattern", () => {
    const collapsedSource = PANEL_SOURCE.replace(/\s+/g, " ");
    assert.ok(
      collapsedSource.includes(
        "Appearance could not be saved. Try again after the connection refreshes.",
      ),
    );
  });

  it("the notice is the only sell-toned block in the file (no second, drifting copy of it)", () => {
    const matches = PANEL_SOURCE.match(/border-sell\/25 bg-sell\/10/g) ?? [];
    assert.equal(matches.length, 1);
  });
});

// Final review, Minor 5: three details on a surface the owner will open at
// re-present. Both directions, same discipline as the Desk guards.
describe("Profile composition (p-profile-v1.html:11-19, source-pinned)", () => {
  it("rules the h1 like Insights and Guide — the mock's 2px ink phead", () => {
    assert.match(
      PANEL_SOURCE,
      /<h1 className="border-b-2 border-ink pb-3\.5 text-2xl font-semibold tracking-normal text-ink">\s*Profile\s*<\/h1>/,
    );
  });

  it("draws detail rows as the mock's plain lines — no card inside a card", () => {
    assert.match(
      PANEL_SOURCE,
      /<div className="flex min-w-0 items-center justify-between gap-3 py-2 text-sm">/,
    );
    assert.doesNotMatch(PANEL_SOURCE, /rounded-lg border border-hairline bg-paper/);
  });

  it("gives every card heading the same element and class — no h3 among h2 siblings", () => {
    const headings = PANEL_SOURCE.match(/<h[23] className="[^"]*"/g) ?? [];
    assert.equal(headings.length, 4, "Account, Broker, Appearance, Support");
    for (const heading of headings) {
      assert.match(heading, /^<h2 className="(?:mb-4 )?text-lg font-semibold tracking-normal text-ink"$/);
    }
  });

  it("keeps the four cards the mock draws as cards", () => {
    assert.equal(
      (PANEL_SOURCE.match(/terminal-panel px-\[22px\] py-\[18px\]/g) ?? [])
        .length,
      4,
    );
  });
});
