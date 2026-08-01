import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

// Fix wave 2B, FIX 3 (completeness-audit-2 Finding 8 / beyond-checklist #2,
// #6). DonatePanel was the one authed surface still rendering the
// pre-overhaul idiom the rest of the branch's guards ban by name elsewhere:
// two terminal-panel cards, an icon + accent-eyebrow + boxed-<h1> cluster
// (the page's own title nested inside a card, beside a Gift icon, under
// text-accent — exactly what surfaceComposition.test.ts:117-123 already
// forbids in GuidePanel). Source-pinned, no jsdom — same technique as
// surfaceComposition.test.ts and profilePanel.test.tsx.
const DONATE_PANEL = "src/components/donations/DonatePanel.tsx";
const DONATION_OPTIONS = "src/components/donations/DonationOptions.tsx";

const donatePanel = readFileSync(DONATE_PANEL, "utf8");
const donationOptions = readFileSync(DONATION_OPTIONS, "utf8");

describe("DonatePanel composition — ruled page head, matching Insights/Guide/Profile", () => {
  it("opens with the mock's 2px ink rule, exactly like HistoryPanel/GuidePanel/ProfilePanel — no icon, no eyebrow flanking it", () => {
    assert.match(
      donatePanel,
      /<h1 className="border-b-2 border-ink pb-3\.5 text-2xl font-semibold tracking-normal text-ink">\s*Donate\s*<\/h1>/,
    );
  });

  // Spec §17c's box-on-box sweep, standing: "a bordered sheet survives only
  // where it is a true interactive affordance (result/position rows, form
  // fields, buttons) or the mock-drawn Insights table frame — never as passive
  // grouping." The donation options are affordances and keep their own borders;
  // the sheet that wrapped them was a box drawn around buttons. This inverts
  // the earlier guard, which pinned that wrapper as warranted.
  it("wraps the donation options in no box at all — the options are the affordance (§17c)", () => {
    assert.match(donatePanel, /<section className="mt-3">\s*<DonationOptions/);
    assert.equal((donatePanel.match(/terminal-panel/g) ?? []).length, 0);
  });

  it("keeps the options' own button borders — flattening the wrapper is not flattening the links", () => {
    assert.match(
      donationOptions,
      /className="secondary-button justify-between"/,
    );
  });

  it("the supporting 'App costs' section is flat editorial body, not a second boxed card", () => {
    const secondSection = donatePanel.match(
      /What donations support[\s\S]*?Levelflow runs on paid market-data, email, and hosting plans\./,
    )?.[0] ?? "";
    assert.ok(secondSection.length > 0, "expected to find the App costs section");
    assert.doesNotMatch(secondSection, /terminal-panel/);
  });
});

describe("DonatePanel composition — the kill list is absent (matches the rest of the branch's guards)", () => {
  it("deleted the Gift icon from the page head — the title no longer sits beside an icon inside a card", () => {
    assert.doesNotMatch(donatePanel, /Gift/);
  });

  it("no text-accent anywhere — both eyebrows are muted like every other eyebrow in the flattened system (MarketScanPanel's 'Scan', GuidePanel's numbered eyebrows)", () => {
    assert.doesNotMatch(donatePanel, /text-accent/);
  });

  it("no longer splits into a two-column lg:grid-cols layout carrying the second card", () => {
    assert.doesNotMatch(donatePanel, /lg:grid-cols-/);
  });
});

describe("Donate — the support sentence is said once (spec §17f)", () => {
  it("keeps the page's own sentences verbatim", () => {
    for (
      const phrase of [
        "Donate",
        "Development fund",
        "What donations support",
        "App costs",
        "Levelflow runs on paid market-data, email, and hosting plans.",
      ]
    ) {
      assert.ok(
        donatePanel.includes(phrase),
        `expected DonatePanel.tsx to still contain "${phrase}" verbatim`,
      );
    }
  });

  // §17f, the copy law: two sentences twelve words apart said the same thing —
  // "Donations support market data, email, hosting, and development." above the
  // options, and "Levelflow runs on paid market-data, email, and hosting plans."
  // under the section headed "What donations support". The second stays: it is
  // the body of a section that would otherwise be a heading with nothing under
  // it, and it is the one the page's own structure introduces.
  it("says it once on this page — the duplicate above the options is gone, and survives only where it earns its place", () => {
    // The Donate page states it exactly once, and the shared options component
    // states nothing at all.
    assert.equal(
      (donatePanel.match(/email, (?:and )?hosting/g) ?? []).length,
      1,
    );
    assert.doesNotMatch(donationOptions, /Donations support market data/);
    // It is not deleted from the app: the sign-in screen has no App-costs
    // section, so there the sentence is the only thing that says what a donation
    // pays for and it renders at that call site.
    assert.match(
      readFileSync("src/components/auth/AuthScreen.tsx", "utf8"),
      /Donations support market data, email, hosting, and development\./,
    );
  });
});

// Owner-instructed (wave 5), premise corrected: the rider asked for `mode` and
// its compact branch to be deleted as dead code with an off-palette colour. The
// branch is NOT dead — AuthScreen renders it behind the sign-in screen's Donate
// disclosure, which is a second live call site the rider did not have — so the
// prop stays and this describe pins why, in both directions: two callers, two
// real shapes, and none of the caller-specific chrome the component used to draw
// for one of them.
describe("DonationOptions — two live callers, and no caller-specific chrome (wave 5)", () => {
  const auth = readFileSync("src/components/auth/AuthScreen.tsx", "utf8");

  it("has two call sites, one per mode, so neither branch is dead code", () => {
    assert.match(
      donatePanel,
      /<DonationOptions fallbackHref=\{donationFallbackHref\} \/>/,
    );
    assert.match(
      auth,
      /<DonationOptions\s+fallbackHref=\{donationFallbackHref\}\s+mode="compact"\s*\/>/,
    );
  });

  it("draws no wrapper of its own — the divider and the off-palette colour went to the caller that wanted them", () => {
    assert.doesNotMatch(donationOptions, /border-ink-muted\/15/);
    assert.doesNotMatch(donationOptions, /border-t/);
    // The sign-in panel's disclosure now draws the rule itself, matching the two
    // identical dividers already on that screen.
    assert.equal((auth.match(/border-t border-ink-muted\/15 pt-4/g) ?? []).length, 3);
  });

  it("keeps exactly the two shapes its callers need, and the wiring behind them", () => {
    assert.match(donationOptions, /compact \? "" : "sm:grid-cols-2"/);
    assert.match(donationOptions, /links\.length > 0 && !compact \?/);
    assert.ok(donationOptions.includes("Request donation link"));
    assert.match(donationOptions, /links\.map\(\(link\) => \(/);
    assert.match(donationOptions, /href=\{link\.url\}/);
  });
});
