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
const THEME_TOGGLE_SOURCE = readFileSync(
  "src/components/workspace/ThemeToggle.tsx",
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

  it("renders the notice conditionally on themeSaveFailed, in the Appearance row, right after ThemeToggle", () => {
    assert.match(
      PANEL_SOURCE,
      /<ThemeToggle mode=\{themeMode\} onChange=\{handleThemeChange\} \/>\s*\{themeSaveFailed/,
    );
  });

  // Spec §17c + §17f: the notice keeps its behaviour and loses its box. A
  // notice is passive grouping, not an interactive affordance, so the bordered
  // sheet it used to sit in is exactly what the box-on-box sweep removes; the
  // sell tone and the weight carry the alarm on flat paper.
  it("states the failure flat — sell-toned text, no bordered notice box (§17c)", () => {
    assert.match(
      PANEL_SOURCE,
      /<p className="mt-2\.5 text-sm font-semibold text-sell">/,
    );
    assert.doesNotMatch(PANEL_SOURCE, /border-sell/);
    assert.doesNotMatch(PANEL_SOURCE, /bg-sell/);
  });

  it("states the failure in one plain sentence, matching the retired form's phrasing pattern", () => {
    const collapsedSource = PANEL_SOURCE.replace(/\s+/g, " ");
    assert.ok(
      collapsedSource.includes(
        "Appearance could not be saved. Try again after the connection refreshes.",
      ),
    );
  });

  it("the notice is the only sell-toned element in the file (no second, drifting copy of it)", () => {
    assert.equal((PANEL_SOURCE.match(/text-sell/g) ?? []).length, 1);
  });
});

// Spec §17c rejected the card stack on desktop ("stacked like a mobile view")
// and §17e approved p-profile-v2.html as the composition authority: a flat
// editorial settings sheet, hairline-separated rows, each a label column beside
// its content, no card chrome anywhere. Both directions, per §16's standing
// review discipline.
describe("Profile composition — the mock's elements are present (p-profile-v2.html)", () => {
  it("is one 880px editorial column, not a stack of cards in a 620px rail", () => {
    assert.match(
      PANEL_SOURCE,
      /className="mx-auto w-full max-w-\[880px\]"\n\s*data-testid="profile-panel"/,
    );
    assert.doesNotMatch(PANEL_SOURCE, /max-w-\[620px\]/);
  });

  it("rules the h1 like Insights, Guide and Donate — the mock's 2px ink phead", () => {
    assert.match(
      PANEL_SOURCE,
      /<h1 className="border-b-2 border-ink pb-3\.5 text-2xl font-semibold tracking-normal text-ink">\s*Profile\s*<\/h1>/,
    );
  });

  it("draws four hairline-separated rows: label column beside content at ≥lg, stacked below (.row, :18)", () => {
    // One shared row component, so the four cannot drift apart in padding,
    // separation or column measure.
    assert.match(
      PANEL_SOURCE,
      /<div className="grid gap-x-6 gap-y-3 border-b border-hairline py-\[26px\] last:border-b-0 lg:grid-cols-\[220px_1fr\]">/,
    );
    assert.equal((PANEL_SOURCE.match(/<ProfileRow\n/g) ?? []).length, 4);
    const titles = Array.from(
      PANEL_SOURCE.matchAll(/^\s*title="([^"]+)"$/gm),
      (match) => match[1],
    );
    assert.deepEqual(titles, ["Account", "Broker", "Appearance", "Support"]);
  });

  it("carries the approved row descriptions verbatim, and nothing else (§17e, §17f)", () => {
    // Owner-approved wording, exact. §17e's standing rule for this surface: "a
    // row description says only what the row cannot show."
    const descriptions = Array.from(
      PANEL_SOURCE.matchAll(/^\s*description="([^"]+)"$/gm),
      (match) => match[1],
    );
    assert.deepEqual(descriptions, [
      "Sign-in and membership.",
      "Markets, costs, and record follow the broker.",
      "Saved to your account.",
      "We read every note.",
    ]);
    // The old Broker paragraph said what the row's own description now says in
    // nine words; it must not survive alongside it.
    assert.doesNotMatch(PANEL_SOURCE, /Setups are tuned to this broker/);
  });

  it("labels each row with an h2 over its description, at the mock's own sizes (.lab, :20-21)", () => {
    const headings = PANEL_SOURCE.match(/<h[23] className="[^"]*"/g) ?? [];
    assert.equal(headings.length, 1, "one shared row heading, four call sites");
    assert.equal(
      headings[0],
      '<h2 className="text-[15px] font-bold tracking-normal text-ink"',
    );
    assert.match(
      PANEL_SOURCE,
      /<p className="mt-1 text-\[12\.5px\] leading-normal text-ink-muted">/,
    );
  });

  it("gives Account the mock's kv lines and a ghost Sign out (.kv, .signout)", () => {
    assert.match(PANEL_SOURCE, /<ProfileDetailRow label="Email" value=\{profile\.email\}/);
    assert.match(PANEL_SOURCE, /label="Member since"/);
    assert.match(
      PANEL_SOURCE,
      /<div className="flex min-w-0 max-w-\[520px\] items-baseline justify-between gap-3 py-1\.5 text-sm">/,
    );
    assert.match(
      PANEL_SOURCE,
      /<button\s+className="secondary-button mt-2\.5 px-3\.5 py-2 text-\[13px\]"/,
    );
  });

  it("gives Broker the shared chip and Support the mock's two inline tertiary links (.tlink, :90-91)", () => {
    assert.match(PANEL_SOURCE, /<BrokerChip \/>/);
    assert.match(
      PANEL_SOURCE,
      /className="flex flex-wrap items-center gap-x-\[22px\] gap-y-2"[\s\S]{0,400}Email support[\s\S]{0,300}Donate/,
    );
    assert.equal(
      (PANEL_SOURCE.match(/className="tertiary-link"/g) ?? []).length,
      2,
    );
  });
});

describe("Profile composition — the kill list is absent (§17c, p-profile-v2.html)", () => {
  it("carries no card chrome at all — the card stack is what the owner rejected", () => {
    assert.doesNotMatch(PANEL_SOURCE, /terminal-panel/);
    assert.doesNotMatch(PANEL_SOURCE, /bg-sheet/);
    assert.doesNotMatch(PANEL_SOURCE, /\brounded/);
    assert.doesNotMatch(PANEL_SOURCE, /shadow/);
  });

  it("drops the per-card icons — the mock draws none, and a settings row needs no picture of itself", () => {
    for (const icon of ["Landmark", "LogOut", "Palette", "UserRound"]) {
      assert.doesNotMatch(
        PANEL_SOURCE,
        new RegExp(`\\b${icon}\\b`),
        `${icon} must not survive the revamp`,
      );
    }
    assert.doesNotMatch(PANEL_SOURCE, /lucide-react/);
  });
});

// §17e: "the existing theme control restyled to the mock's segmented pill"
// (.seg/.o/.o.on, p-profile-v2.html:27-29). One component, so the Auth and
// Parking screens' compact toggles take the same geometry — it is the same
// control, and the mocks leave those screens' composition alone rather than
// prescribing a different pill for them.
describe("ThemeToggle — the mock's segmented pill (p-profile-v2.html:27-29)", () => {
  it("draws the pill as an outline on paper: hairline border, 8px radius, 3px inset, 2px gap", () => {
    assert.match(
      THEME_TOGGLE_SOURCE,
      /className="inline-flex gap-0\.5 rounded-lg border border-hairline p-\[3px\]"/,
    );
    // No fill: the pill reads as an outline control on the page's own paper.
    assert.doesNotMatch(THEME_TOGGLE_SOURCE, /bg-sheet/);
  });

  it("draws each option at the mock's type and padding, keeping the kit's 44px hit area", () => {
    assert.match(
      THEME_TOGGLE_SOURCE,
      /flex min-h-11 items-center gap-1\.5 rounded-md px-3\.5 text-\[13px\] font-semibold transition/,
    );
    assert.match(THEME_TOGGLE_SOURCE, /bg-accent\/10 text-accent/);
  });
});
