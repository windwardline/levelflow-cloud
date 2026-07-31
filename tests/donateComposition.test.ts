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

  it("uses ProfilePanel's own card treatment (hairline border, sheet bg, tight padding) for the donation options container — the one card that's warranted", () => {
    assert.match(donatePanel, /terminal-panel px-\[22px\] py-\[18px\]/);
  });

  it("carries exactly one terminal-panel — the donation options card — not two boxed cards side by side", () => {
    assert.equal((donatePanel.match(/terminal-panel/g) ?? []).length, 1);
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

describe("DonatePanel — no copy changes (fix wave 2B explicitly forbids them)", () => {
  it("keeps every visible sentence verbatim", () => {
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
});

describe("DonationOptions composition — compact mode no longer renders the banned item-card shape (beyond-checklist #6)", () => {
  it("the compact wrapper is no longer rounded-lg/border-hairline/bg-paper — the shape tests/surfaceComposition.test.ts bans file-wide in the Guide", () => {
    assert.doesNotMatch(
      donationOptions,
      /rounded-lg border border-hairline bg-paper/,
    );
  });

  it("flattens to the system's quiet hairline-divider row instead (AuthScreen's own border-t border-ink-muted\\/15 pt-4 idiom), not just an empty string", () => {
    assert.match(
      donationOptions,
      /compact \? "border-t border-ink-muted\/15 pt-4" : ""/,
    );
  });

  it("keeps every option, amount, and link exactly as wired — no copy changes", () => {
    for (
      const phrase of [
        "Donations support market data, email, hosting, and development.",
        "Request donation link",
      ]
    ) {
      assert.ok(
        donationOptions.includes(phrase),
        `expected DonationOptions.tsx to still contain "${phrase}" verbatim`,
      );
    }
    // The link/amount rendering itself (label, url, description) is
    // data-driven from appConfig.donationLinks and untouched by this fix —
    // pinning the map/render call sites proves the wiring survived.
    assert.match(donationOptions, /links\.map\(\(link\) => \(/);
    assert.match(donationOptions, /href=\{link\.url\}/);
  });
});
