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

  // §17n added the shared mobile page head to the same string — 19px on a 24px
  // line, 8px of rule pad below lg — so the four titled surfaces read as one
  // treatment on a phone while the mock's own 24px still draws at ≥lg.
  it("rules the h1 like Insights, Guide and Donate — the mock's 2px ink phead, 19px below lg", () => {
    assert.match(
      PANEL_SOURCE,
      /<h1 className="border-b-2 border-ink pb-3\.5 text-2xl font-semibold tracking-normal text-ink max-lg:pb-2 max-lg:text-\[19px\] max-lg:leading-6">\s*Profile\s*<\/h1>/,
    );
  });

  // Spec §17i deleted the mock's fourth row: "Each link lives in exactly one home
  // per platform. Desktop: the footer … so the Guide's Support section and
  // Profile's Support row are DELETED." The mock still draws four; the ruling
  // supersedes it on that one row, and the three that remain are unchanged.
  it("draws three hairline-separated rows: label column beside content at ≥lg, stacked below (.row, :18)", () => {
    // One shared row component, so the three cannot drift apart in padding,
    // separation or column measure.
    // §17n: the mock's 26px block padding at ≥lg, 16px below it — 60px of the
    // three rows' 156px of pad, which is what put the sheet back inside its own
    // frame once the broker program controls render.
    assert.match(
      PANEL_SOURCE,
      /<div className="grid gap-x-6 gap-y-3 border-b border-hairline py-\[26px\] last-of-type:border-b-0 max-lg:py-4 lg:grid-cols-\[220px_1fr\]">/,
    );
    assert.equal((PANEL_SOURCE.match(/<ProfileRow\n/g) ?? []).length, 3);
    const titles = Array.from(
      PANEL_SOURCE.matchAll(/^\s*title="([^"]+)"$/gm),
      (match) => match[1],
    );
    assert.deepEqual(titles, ["Account", "Broker", "Appearance"]);
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
    ]);
    // The Support row's own approved line goes with the row (§17i) — a description
    // for a row that no longer exists is copy waiting to be re-attached.
    assert.doesNotMatch(PANEL_SOURCE, /We read every note\./);
    // The old Broker paragraph said what the row's own description now says in
    // nine words; it must not survive alongside it.
    assert.doesNotMatch(PANEL_SOURCE, /Setups are tuned to this broker/);
  });

  it("labels each row with an h2 over its description, at the mock's own sizes (.lab, :20-21)", () => {
    const headings = PANEL_SOURCE.match(/<h[23] className="[^"]*"/g) ?? [];
    assert.equal(headings.length, 1, "one shared row heading, three call sites");
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

  it("gives Broker the shared chip, and carries no link row of its own any more (§17i)", () => {
    assert.match(PANEL_SOURCE, /<BrokerChip \/>/);
    // The mock's `.tlink` pair (:90-91) went with the Support row it lived in: the
    // footer is in the frame twenty pixels below this sheet on every ≥lg surface,
    // and the account menu carries the same two below lg.
    assert.equal(
      (PANEL_SOURCE.match(/className="tertiary-link"/g) ?? []).length,
      0,
    );
    assert.doesNotMatch(PANEL_SOURCE, /Email support/);
    assert.doesNotMatch(PANEL_SOURCE, /gap-x-\[22px\]/);
    // Plus the plumbing, which is what a deletion most easily leaves behind.
    assert.doesNotMatch(PANEL_SOURCE, /supportMailto/);
    assert.doesNotMatch(PANEL_SOURCE, /onOpenDonate/);
    // Donate survives nowhere on this surface as a control. Matched as rendered
    // element text rather than the bare word: this file's comments legitimately
    // name the Donate tab while explaining the sheet's own rhythm, and prose is
    // not an affordance.
    assert.doesNotMatch(PANEL_SOURCE, />\s*Donate\s*</);
    assert.doesNotMatch(PANEL_SOURCE, /onClick=\{onOpenDonate\}/);
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

  // Owner ruling (2026-08-02), the pre-auth toggle: "like everything else on the
  // mobile view, it should be smaller — as small as possible on the mobile view
  // while still being usable and legible." Smaller is the VISIBLE box; the hit
  // area is not negotiable (§16 trims padding and type, never the target), so this
  // is .tertiary-link's own trick on both axes — a 44px box pulled back by
  // negative margins, leaving 42x28 of visible control with a full,
  // non-overlapping 44x44 target centred on it (the pill's own 2px gap absorbs the
  // 1px of inline reach from each side, so no two options claim the same pixel).
  //
  // Compact is exactly the two pre-auth screens, and only below sm. Profile takes
  // the branch above, unchanged, at every width — the mock still governs it.
  it("shrinks only the compact pre-auth control, only below sm, and never the 44px target", () => {
    assert.match(
      THEME_TOGGLE_SOURCE,
      /flex min-h-11 min-w-11 -mx-px -my-2 items-center justify-center gap-1\.5 rounded-md text-\[13px\] font-semibold transition sm:mx-0 sm:my-0 sm:min-w-0 sm:px-3\.5/,
    );
    // Two option literals, one per branch, and the hit floor survives in both.
    const options = THEME_TOGGLE_SOURCE.match(/"flex min-h-11[^"]*"/g) ?? [];
    assert.equal(options.length, 2);
    for (const literal of options) {
      assert.match(literal, /\bmin-h-11\b/);
    }
    // The pill's own chrome is the mock's at every width: what shrinks is the
    // control, not the outline drawn around it.
    assert.equal(
      (THEME_TOGGLE_SOURCE.match(/border border-hairline p-\[3px\]/g) ?? []).length,
      1,
    );
    // Whole literals per branch, never a base list with a conflicting override
    // appended: two unprefixed utilities for one property resolve by stylesheet
    // order, which is not something a call site can see.
    assert.doesNotMatch(THEME_TOGGLE_SOURCE, /\$\{compact \?/);
  });

  // Q1-I5: the pill had no selected-state semantics and a name nothing could
  // read. `aria-label` on a bare <div> with no role is dropped by most assistive
  // technology, so the group was unnamed; and the active mode was carried only by
  // `bg-accent/10 text-accent`, which is a colour, not a state. This is Profile's
  // only interactive control and also the Auth and Parking screens' compact
  // toggle, so a screen-reader user had no way to hear which theme was on.
  it("is a named group of toggle buttons, each announcing whether it is the one that is on", () => {
    assert.match(
      THEME_TOGGLE_SOURCE,
      /<div\s*\n\s*aria-label="Theme"\s*\n\s*className="inline-flex[^"]*"\s*\n\s*role="group"/,
    );
    assert.match(
      THEME_TOGGLE_SOURCE,
      /aria-pressed=\{mode === option\.value\}/,
    );
  });
});

// Q1-I7: `last:border-b-0` is Tailwind for `:last-child`, and in the mobile branch
// the scroll region's last child is the colophon <p>, not the third row — so the
// Appearance row kept a hairline above the colophon on mobile only, and the guard
// above could not see it (it reads the class out of the source; the selector runs
// in a browser). The mock's own rule is `.row:last-of-type`
// (p-profile-v2.html:18), which is right in both branches: the rows are the only
// <div>s among their siblings either way.
describe("ProfileRow's last-row rule matches the row, not whatever ends the region (Q1-I7)", () => {
  it("uses the mock's own last-of-type, never last-child", () => {
    assert.match(PANEL_SOURCE, /\blast-of-type:border-b-0\b/);
    assert.doesNotMatch(PANEL_SOURCE, /\blast:border-b-0\b/);
  });

  it("keeps the structural reason in view: the rows are a fragment, and the colophon ends the mobile region", () => {
    // These two facts are why `:last-child` could never match. Pinned together
    // with the variant above so a change to either trips a test rather than
    // silently re-breaking the rule.
    assert.match(PANEL_SOURCE, /const rows = \(\s*\n\s*<>/);
    assert.match(
      PANEL_SOURCE,
      /data-testid="mobile-profile-scroll">\s*\n\s*\{rows\}[\s\S]{0,1200}<p className="colophon max-lg:pt-5">/,
    );
  });
});

// Spec §19b, both directions per §16. The controls live inside the existing Broker
// row, and with None the feature is dormant: no second Broker section, no card, no
// facts block, and no control at all beyond the one that opens the door.
describe("§19b — the broker program controls, inside the row that already exists", () => {
  it("puts the controls in the Broker row beneath the chip, in one component", () => {
    assert.match(
      PANEL_SOURCE,
      /<BrokerChip \/>\s*\n\s*<BrokerProgramControls onChange=\{saveSelection\} profile=\{profile\} \/>/,
    );
    // One Broker row, not two: the row count and its titles are pinned above, and
    // this is the second direction — no new ProfileRow was added for the program.
    assert.equal((PANEL_SOURCE.match(/title="Broker"/g) ?? []).length, 1);
  });

  it("renders five controls, in the spec's order, each a select with its label", () => {
    const labels = Array.from(
      PANEL_SOURCE.matchAll(/<BrokerControlRow label="([^"]+)">/g),
      (match) => match[1],
    );
    assert.deepEqual(labels, [
      "Program",
      "Account size",
      "Stage",
      "Risk per trade",
      "Drawdown",
    ]);
    // Each one is a real <select> with an accessible name of its own.
    for (const label of labels) {
      assert.ok(
        PANEL_SOURCE.includes(`aria-label="${label}"`),
        `${label} needs an accessible name`,
      );
    }
    assert.equal((PANEL_SOURCE.match(/<select\n/g) ?? []).length, 5);
  });

  it("defaults to None and renders only Program until a program is selected", () => {
    assert.match(PANEL_SOURCE, /<option value="none">None<\/option>/);
    assert.match(PANEL_SOURCE, /value=\{profile\.brokerProgramLine \?\? "none"\}/);
    // The other four sit behind the program check, so with None they do not exist.
    assert.match(
      PANEL_SOURCE,
      /<\/BrokerControlRow>\s*\{program\s*\n\s*\? \(\s*\n\s*<>/,
    );
  });

  it("draws the Drawdown control only where a tier exists to purchase", () => {
    assert.match(PANEL_SOURCE, /\{program\.drawdownTiers\s*\n\s*\? \(\s*\n\s*<BrokerControlRow label="Drawdown">/);
  });

  it("resets the size and the tier on a program change, and seeds risk once", () => {
    assert.match(PANEL_SOURCE, /brokerAccountSize: next\.accountSizes\[0\]/);
    assert.match(PANEL_SOURCE, /brokerDrawdownTier: next\.drawdownTiers\?\.\[0\] \?\? null/);
    assert.match(
      PANEL_SOURCE,
      /brokerRiskPercent: profile\.brokerRiskPercent \?\? RISK_PERCENT_DEFAULT/,
    );
  });

  it("renders the ladder and the tiers from the data module, never a local copy", () => {
    assert.match(PANEL_SOURCE, /program\.accountSizes\.map/);
    assert.match(PANEL_SOURCE, /program\.drawdownTiers\.map/);
    assert.match(PANEL_SOURCE, /RISK_PERCENT_OPTIONS\.map/);
    assert.match(PANEL_SOURCE, /PROGRAM_LINES\.map/);
    assert.match(PANEL_SOURCE, /STAGE_OPTIONS\.map/);
    // No literal ladder, tier or percentage anywhere in the component.
    assert.doesNotMatch(PANEL_SOURCE, /\$100,000|\$5,000|0\.50%|3% daily/);
  });

  it("adds no card, no chrome and no copy of its own (§17c, §20j)", () => {
    const controls = PANEL_SOURCE.slice(
      PANEL_SOURCE.indexOf("function BrokerProgramControls"),
    );
    for (const box of ["terminal-panel", "rounded-lg", "shadow", "bg-accent"]) {
      assert.ok(!controls.includes(box), `${box} must not reach the Broker row`);
    }
    // The only strings this block renders are the five labels, None, and the
    // options the data module formats — §20j's list, with nothing added.
    const jsxText = Array.from(controls.matchAll(/>([A-Za-z][^<>{}]*)</g), (m) =>
      m[1].trim());
    assert.deepEqual(jsxText.filter((text) => text.length > 0), ["None"]);
  });

  it("persists on change with every other saved field riding along", () => {
    assert.match(
      PANEL_SOURCE,
      /function saveSelection\(selection: BrokerSelection\) \{\s*onSave\(\{\s*\.\.\.selection,\s*defaultTimeframe:/,
    );
    assert.match(PANEL_SOURCE, /themePreference: profile\.themePreference,/);
    assert.match(
      PANEL_SOURCE,
      /console\.error\("\[profile\] broker program save failed", error\)/,
    );
  });
});
