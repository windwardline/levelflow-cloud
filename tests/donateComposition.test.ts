import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

// Directory-derived rather than a list of the two files that say it today: a copy
// constant is only canonical if nothing else in the tree can quietly say the same
// thing in its own words, and a hand-kept list cannot see the surface added next
// week (the failure mode tests/languageGuard.test.ts's Q2-I10 fixed for src/lib).
function allSourceFiles(root: string): string[] {
  return readdirSync(root, { recursive: true })
    .map(String)
    .filter((file) => file.endsWith(".ts") || file.endsWith(".tsx"))
    .map((file) => join(root, file));
}

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
const AUTH_SCREEN = "src/components/auth/AuthScreen.tsx";
const DONATION_COPY = "src/lib/donationCopy.ts";

const donatePanel = readFileSync(DONATE_PANEL, "utf8");
const donationOptions = readFileSync(DONATION_OPTIONS, "utf8");

describe("DonatePanel composition — ruled page head, matching Insights/Guide/Profile", () => {
  it("opens with the mock's 2px ink rule, exactly like HistoryPanel/GuidePanel/ProfilePanel — no icon, no eyebrow flanking it", () => {
    // §17n put the shared mobile page head on the same string — 19px on a 24px
    // line with an 8px rule pad below lg; the mock's 24px is unchanged at ≥lg.
    assert.match(
      donatePanel,
      /<h1 className="border-b-2 border-ink pb-3\.5 text-2xl font-semibold tracking-normal text-ink max-lg:pb-2 max-lg:text-\[19px\] max-lg:leading-6">\s*Donate\s*<\/h1>/,
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

  it("the supporting section is flat editorial body, not a second boxed card", () => {
    const secondSection = donatePanel.match(
      /What donations support[\s\S]*?\{DONATION_SUPPORT_COPY\}/,
    )?.[0] ?? "";
    assert.ok(
      secondSection.length > 0,
      "expected the section that says what donations support",
    );
    assert.doesNotMatch(secondSection, /terminal-panel/);
  });

  // Owner ruling (2026-08-02): "The donate page has too small a space between the
  // 'development fund' text and the bar immediately above it… the spacing still
  // needs to be right." The bar is the h1's own 2px rule, and below lg the h1 is
  // the pinned row of the shared frame — which contributes no bottom padding
  // (MOBILE_FRAME_PINNED is "shrink-0 px-4 pt-3", the same string on six
  // surfaces), and the scroll region contributes no top padding either. The
  // eyebrow therefore started 0px under a 2px rule on mobile, while the ≥lg page
  // gave the same pair the 16px its grid gap gives every block.
  //
  // The air goes on the scrolling content, which is the app's own idiom for this
  // exact gap (ProfilePanel's first row carries its py-[26px] the same way) and
  // leaves the shared frame strings untouched at all six call sites.
  it("puts the h1's rule and the first eyebrow on the page's 16px rhythm below lg too", () => {
    assert.match(
      donatePanel,
      /<div className=\{MOBILE_FRAME_SCROLL\} data-testid="mobile-donate-scroll">\s*<div className="grid gap-4 pt-4">\{body\}<\/div>/,
    );
    // ≥lg is where the 16px comes from: one gap for the title-to-body pair and
    // every pair after it. Unchanged, and pinned here so the two platforms are one
    // rhythm rather than two numbers that happen to match today.
    assert.match(donatePanel, /className="mx-auto grid w-full max-w-\[620px\] gap-4"/);
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

describe("Donate — the page's own head words survive the copy merge", () => {
  it("keeps them verbatim", () => {
    for (
      const phrase of [
        "Donate",
        "Development fund",
        "What donations support",
      ]
    ) {
      assert.ok(
        donatePanel.includes(phrase),
        `expected DonatePanel.tsx to still contain "${phrase}" verbatim`,
      );
    }
  });

  // Owner ruling (2026-08-02): the sentence has to be "succinct,
  // all-encompassing, and consistent across all screens where it appears", and
  // "App costs" was a heading that only re-titled the sentence beneath it — with
  // the costs AND the development now named in that sentence, the heading said
  // less than its own body (§17f). The eyebrow is what introduces the block.
  it("drops the 'App costs' heading the merged sentence made redundant", () => {
    assert.doesNotMatch(donatePanel, /App costs/);
    assert.ok(donatePanel.includes("What donations support"));
  });
});

// Owner ruling (2026-08-02), the copy law's own case (§17f): "Donations go toward
// all of those things, so find a way to make the message succinct,
// all-encompassing, and consistent across all screens where it appears. Neither
// one of the examples you gave were wrong, so maybe combine them?" One constant,
// two surfaces, and neither of the two retired sentences left anywhere in src/.
describe("§17f — one donation sentence, one constant, every screen (owner ruling 2026-08-02)", () => {
  const CANONICAL =
    "Levelflow runs on paid market-data, email, and hosting plans. Donations support those costs and continued development.";
  const donationCopy = readFileSync(DONATION_COPY, "utf8");
  const authScreen = readFileSync(AUTH_SCREEN, "utf8");
  // The two surfaces that say what a donation pays for: the Donate page's own
  // section, and the sign-in screen's disclosure, which has no such section.
  const SURFACES: Array<[string, string]> = [
    [DONATE_PANEL, donatePanel],
    [AUTH_SCREEN, authScreen],
  ];

  it("exports the combined sentence pair verbatim, once", () => {
    assert.match(
      donationCopy,
      /export const DONATION_SUPPORT_COPY =\s*\n\s*"Levelflow runs on paid market-data, email, and hosting plans\. Donations support those costs and continued development\.";/,
    );
    assert.equal(
      (donationCopy.match(/Donations support those costs/g) ?? []).length,
      1,
    );
    // Two sentences, both short and declarative — §17f, and the shape the ruling
    // asked for. Nothing hedged, nothing explained twice.
    assert.equal(CANONICAL.split(". ").length, 2);
  });

  it("renders it from that constant on both surfaces, and types it out on neither", () => {
    for (const [file, source] of SURFACES) {
      assert.match(
        source,
        /import \{ DONATION_SUPPORT_COPY \} from "\.\.\/\.\.\/lib\/donationCopy";/,
        `${file} must take the sentence from the one module`,
      );
      assert.match(source, /\{DONATION_SUPPORT_COPY\}/, file);
      // The words themselves live in exactly one file. A call site that spelled
      // them out again is the drift this constant exists to prevent.
      assert.ok(
        !source.includes("Donations support those costs"),
        `${file} spells the sentence out instead of rendering the constant`,
      );
    }
  });

  it("retires both of the sentences it combines, everywhere in src/", () => {
    const RETIRED = [
      "Donations support market data, email, hosting, and development.",
      // The Donate page's own half, which the constant now opens with — banned as
      // a standalone sentence, which is the only shape it ever appeared in.
      "Levelflow runs on paid market-data, email, and hosting plans.\n",
    ];
    for (const file of allSourceFiles("src")) {
      const source = readFileSync(file, "utf8");
      for (const retired of RETIRED) {
        assert.ok(
          !source.includes(retired),
          `${file} still carries the retired sentence: ${retired.trim()}`,
        );
      }
    }
    // And the shared options component still says nothing about costs at all —
    // it draws the affordances, and the sentence belongs to its two callers.
    assert.doesNotMatch(donationOptions, /Donations support/);
    assert.doesNotMatch(donationOptions, /email, (?:and )?hosting/);
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
    // The sign-in panel's disclosure draws the rule itself. It is the only one of
    // these dividers left on that screen: §17i deleted the two blocks that carried
    // the others (the card's Help/Donate row and its copy of the legal trio), since
    // the framed footer is the one home either link has there now.
    assert.equal((auth.match(/border-t border-ink-muted\/15 pt-4/g) ?? []).length, 1);
    assert.match(auth, /className="mt-6 border-t border-ink-muted\/15 pt-4"/);
  });

  it("keeps exactly the two shapes its callers need, and the wiring behind them", () => {
    assert.match(donationOptions, /compact \? "" : "sm:grid-cols-2"/);
    assert.match(donationOptions, /links\.length > 0 && !compact \?/);
    assert.ok(donationOptions.includes("Request donation link"));
    assert.match(donationOptions, /links\.map\(\(link\) => \(/);
    assert.match(donationOptions, /href=\{link\.url\}/);
  });
});
