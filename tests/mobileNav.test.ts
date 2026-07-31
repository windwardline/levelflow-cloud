import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  deskColumnClassName,
  type DeskMobileView,
} from "../src/components/workspace/AdvisorWorkspace";
import {
  buildTradeCards,
  currentTradeBadgeCount,
} from "../src/components/workspace/CurrentTradesRail";
import type { TradeSetupRow } from "../src/lib/tradeAnalyzer";

// App.tsx itself can never be `import`-ed directly in this harness: its
// module-level TABS array embeds JSX that evaluates eagerly on import
// (unlike a component function's JSX, which only runs once called), and
// several of its other imports reach Vite-only globals (import.meta.env)
// with no meaning under plain `tsx --test` — confirmed empirically, not
// theoretically (attempting it throws `Cannot read properties of undefined
// (reading 'BASE_URL')` from LegalLinks.tsx before a single test even
// runs). That's why currentTradeBadgeCount is defined in
// CurrentTradesRail.tsx (App.tsx only re-exports it via import) rather than
// in App.tsx itself, and why every App.tsx-specific check below reads its
// source as plain text instead — the same technique
// tests/overviewPanelRemoved.test.ts and tests/scopeMenu.test.tsx already
// use for markup this harness can't render.
const APP_SOURCE = readFileSync("src/App.tsx", "utf8");
const ADVISOR_WORKSPACE_SOURCE = readFileSync(
  "src/components/workspace/AdvisorWorkspace.tsx",
  "utf8",
);

const NOW = new Date("2026-07-30T12:00:00.000Z");

function buildSetup(overrides: Partial<TradeSetupRow> = {}): TradeSetupRow {
  return {
    analyzer_version: "unversioned",
    breakeven_trigger_price: 1.0865,
    confidence_score: 78,
    confluence: {},
    correlation_group: null,
    created_at: "2026-07-30T09:00:00.000Z",
    id: "setup-1",
    limit_entry: 1.0865,
    risk_model: {},
    side: "buy",
    status: "generated",
    stop_loss: 1.083,
    symbol: "EURUSD",
    take_profit: 1.095,
    take_profit_1: 1.09,
    trade_outcomes: undefined,
    ...overrides,
  };
}

describe("currentTradeBadgeCount (App.tsx, spec §3: Trades tab badge)", () => {
  it("is zero with no setups at all", () => {
    assert.equal(currentTradeBadgeCount([], NOW), 0);
  });

  it("counts a pending (unfilled) setup", () => {
    const setups = [buildSetup({ id: "a", status: "generated" })];
    assert.equal(currentTradeBadgeCount(setups, NOW), 1);
  });

  it("counts an open (filled, unresolved) setup", () => {
    const setups = [
      buildSetup({
        id: "b",
        status: "placed",
        trade_outcomes: [
          {
            exit_at: null,
            feedback: { tp1Hit: false },
            filled_at: null,
            outcome: "pending",
            realized_pnl: null,
            reviewed_at: null,
          },
        ],
      }),
    ];
    assert.equal(currentTradeBadgeCount(setups, NOW), 1);
  });

  it("excludes closed/resolved setups — Insights holds those, not the badge", () => {
    const setups = [
      buildSetup({ id: "closed-1", status: "filled" }),
      buildSetup({ id: "closed-2", status: "expired" }),
      buildSetup({ id: "closed-3", status: "invalidated" }),
      buildSetup({ id: "closed-4", status: "cancelled" }),
    ];
    assert.equal(currentTradeBadgeCount(setups, NOW), 0);
  });

  it("counts a mix exactly: two live, three closed, in a bigger fixture list", () => {
    const setups = [
      buildSetup({ id: "pending-1", status: "generated" }),
      buildSetup({ id: "closed-1", status: "filled" }),
      buildSetup({
        id: "open-1",
        status: "placed",
        trade_outcomes: [
          {
            exit_at: null,
            feedback: {},
            filled_at: null,
            outcome: "pending",
            realized_pnl: null,
            reviewed_at: null,
          },
        ],
      }),
      buildSetup({ id: "closed-2", status: "cancelled" }),
      buildSetup({ id: "closed-3", status: "invalidated" }),
    ];
    assert.equal(currentTradeBadgeCount(setups, NOW), 2);
  });

  it("never disagrees with buildTradeCards — same filter, same fixtures, both ways (drift guard)", () => {
    const setups = [
      buildSetup({ id: "a", status: "generated" }),
      buildSetup({ id: "b", status: "filled" }),
      buildSetup({
        id: "c",
        status: "placed",
        trade_outcomes: [
          {
            exit_at: null,
            feedback: { tp1Hit: true },
            filled_at: "2026-07-30T11:50:00.000Z",
            outcome: "pending",
            realized_pnl: null,
            reviewed_at: null,
          },
        ],
      }),
    ];
    assert.equal(
      currentTradeBadgeCount(setups, NOW),
      buildTradeCards(setups, NOW).length,
    );
  });
});

describe("deskColumnClassName (AdvisorWorkspace.tsx mobile gating)", () => {
  const VIEWS: DeskMobileView[] = ["review", "scan", "trades"];

  it("shows the base display utility, unhidden, when its own view is active on mobile", () => {
    for (const view of VIEWS) {
      const className = deskColumnClassName(true, "flex", "extra-classes");
      assert.match(className, /(?:^|\s)flex(?:\s|$)/);
      assert.doesNotMatch(className, /(?:^|\s)hidden(?:\s|$)/);
      void view; // display/base behavior doesn't vary by which view this is
    }
  });

  it("hides the column (base 'hidden') when a different view is active on mobile", () => {
    const className = deskColumnClassName(false, "flex", "extra-classes");
    assert.match(className, /(?:^|\s)hidden(?:\s|$)/);
  });

  it("always carries lg:<display>, regardless of the mobile active state — desktop is frozen", () => {
    assert.match(
      deskColumnClassName(true, "block", "x"),
      /(?:^|\s)lg:block(?:\s|$)/,
    );
    assert.match(
      deskColumnClassName(false, "block", "x"),
      /(?:^|\s)lg:block(?:\s|$)/,
    );
    assert.match(
      deskColumnClassName(true, "flex", "x"),
      /(?:^|\s)lg:flex(?:\s|$)/,
    );
    assert.match(
      deskColumnClassName(false, "flex", "x"),
      /(?:^|\s)lg:flex(?:\s|$)/,
    );
  });

  it("keeps the caller's own className intact verbatim, appended after the gating classes", () => {
    const className = deskColumnClassName(
      true,
      "block",
      "scrolly min-w-0 lg:h-full lg:min-h-0 lg:overflow-y-auto lg:pr-1",
    );
    assert.ok(
      className.endsWith(
        "scrolly min-w-0 lg:h-full lg:min-h-0 lg:overflow-y-auto lg:pr-1",
      ),
    );
  });

  it("the three real Desk columns each call it with their own view and base classes intact", () => {
    // The rails carry the mock's column hairlines (a-desk-v3.html:18,:56 —
    // railL border-right, railR border-left) at >=lg only; the borders and
    // their breathing padding are lg:-prefixed so the mobile single-column
    // views stay edge-to-edge. railR also carries the mock's tint and its
    // 16px inset (:56) — the column is the Current trades frame now, so the
    // tint has to live here rather than on a panel inside it.
    assert.match(
      ADVISOR_WORKSPACE_SOURCE,
      /deskColumnClassName\(\s*mobileView === "scan",\s*"block",\s*"scrolly min-w-0 lg:h-full lg:min-h-0 lg:overflow-y-auto lg:border-r lg:border-hairline lg:pr-4",\s*\)/,
    );
    assert.match(
      ADVISOR_WORKSPACE_SOURCE,
      /deskColumnClassName\(\s*mobileView === "review",\s*"flex",\s*"scrolly min-w-0 flex-col gap-5 lg:h-full lg:min-h-0 lg:overflow-y-auto lg:pr-1",\s*\)/,
    );
    assert.match(
      ADVISOR_WORKSPACE_SOURCE,
      /deskColumnClassName\(\s*mobileView === "trades",\s*"flex",\s*"scrolly min-w-0 flex-col gap-5 lg:h-full lg:min-h-0 lg:overflow-y-auto lg:border-l lg:border-hairline lg:bg-\[color-mix\(in_srgb,var\(--color-sheet\)_55%,var\(--color-paper\)\)\] lg:pl-4 lg:pr-4",\s*\)/,
    );
  });
});

describe("App.tsx mobile tab bar + header (source-pinned — see header comment)", () => {
  it("lists exactly Review, Scan, Trades, Insights, in that order", () => {
    const block = APP_SOURCE.match(/const MOBILE_TAB_ITEMS:[\s\S]*?\n\];/)?.[0];
    assert.ok(block, "expected to find MOBILE_TAB_ITEMS");
    const labels = Array.from(
      block.matchAll(/label:\s*"([^"]+)"/g),
      (match) => match[1],
    );
    assert.deepEqual(labels, ["Review", "Scan", "Trades", "Insights"]);
  });

  it("renders the tab bar only below lg and pins it to the viewport bottom", () => {
    assert.match(
      APP_SOURCE,
      /className="fixed inset-x-0 bottom-0 z-20 border-t border-hairline bg-paper\/95 pb-\[env\(safe-area-inset-bottom\)\] backdrop-blur lg:hidden"/,
    );
  });

  it("every tab bar button clears the 44px touch target (min-h-14 > 44px)", () => {
    assert.match(APP_SOURCE, /min-h-14 flex-col items-center justify-center/);
  });

  it("only the Trades button ever renders a badge", () => {
    assert.match(APP_SOURCE, /item\.value === "trades" && tradeBadgeCount > 0/);
  });

  it("badge and account menu never use a fixed white/black color on a theme-reactive fill (contrast.test.ts's own rule)", () => {
    assert.doesNotMatch(APP_SOURCE, /bg-accent[^"]*text-white/);
    assert.doesNotMatch(APP_SOURCE, /bg-ink[^"]*text-white/);
  });

  it("wires AdvisorWorkspace to the mobile view state", () => {
    assert.match(APP_SOURCE, /mobileView=\{deskMobileView\}/);
  });

  it("Guide no longer receives a supportEmail prop (deck has no contact section)", () => {
    const callSite = APP_SOURCE.match(/<GuidePanel[\s\S]*?\/>/)?.[0] ?? "";
    assert.doesNotMatch(callSite, /supportEmail/);
  });

  it("Profile receives memberSince + onSignOut, and no longer the retired setups/summary/saveStatus props", () => {
    const callSite = APP_SOURCE.match(/<ProfilePanel[\s\S]*?\/>/)?.[0] ?? "";
    assert.match(callSite, /memberSince=\{session\.user\.created_at\}/);
    assert.match(callSite, /onSignOut=\{/);
    assert.doesNotMatch(callSite, /\bsetups=/);
    assert.doesNotMatch(callSite, /\bsummary=/);
    assert.doesNotMatch(callSite, /\bsaveStatus=/);
  });

  it("gates the desktop masthead behind a literal hidden/lg:flex pair, not an interpolated variant (spec §16 single-row masthead)", () => {
    assert.match(
      APP_SOURCE,
      /className="hidden items-center justify-between lg:flex"/,
    );
  });

  it("mobile header carries the broker chip and an account menu, not the desktop icon row", () => {
    // Anchored on data-testid="mobile-header" (added for the e2e suite's
    // duplicate-header disambiguation - both headers render at every
    // width, only CSS decides which is visible) rather than the bare
    // className, since that's now the more stable, purpose-built handle.
    const mobileHeaderBlock = APP_SOURCE.match(
      /<div\s+className="flex min-w-0 items-center justify-between gap-3 lg:hidden"\s+data-testid="mobile-header"\s*>[\s\S]*?<\/div>\s*<\/div>/,
    )?.[0] ?? "";
    assert.match(mobileHeaderBlock, /<BrokerChip \/>/);
    assert.match(mobileHeaderBlock, /<MobileAccountMenu/);
  });

  it("the account menu offers Guide, Profile, Donate, and Sign out", () => {
    const menuBlock = APP_SOURCE.match(
      /function MobileAccountMenu[\s\S]*?\n}\n/,
    )?.[0] ?? "";
    for (const label of ["Guide", "Profile", "Donate", "Sign out"]) {
      assert.ok(
        menuBlock.includes(`label="${label}"`),
        `account menu is missing "${label}"`,
      );
    }
  });

});

// Spec §16 (2026-07-31, binding): the first ship kept the old two-row
// icon-chip header (a controls row + a separate nav row) inside the new
// grid, and the owner rejected it against a-desk-v3.html:75-84's single-row
// masthead — wordmark + inline text nav + broker chip + ghost Sign out, no
// icons, no greeting, no header theme toggle, no Help/Donate. This describe
// pins BOTH directions of that remediation against the live source (the
// review discipline spec §16 itself demands): the mock's required elements
// present, and every kill-list element named for this block absent. Same
// no-jsdom, source-pinned technique as the rest of this file (see the
// header comment at the top).
describe("desktop masthead composition (spec §16, source-pinned — see header comment)", () => {
  // Anchored on the exact hidden/lg:flex + data-testid opening tag (same
  // reasoning as the mobile-header block above), extending through the
  // Sign out button and its two closing wrapper divs — the last content
  // this block renders.
  const desktopHeaderBlock = APP_SOURCE.match(
    /<div\s+className="hidden items-center justify-between lg:flex"\s+data-testid="desktop-header"\s*>[\s\S]*?Sign out[\s\S]*?<\/div>\s*<\/div>/,
  )?.[0] ?? "";

  it("extracted a non-empty block — a future refactor that breaks this regex must fail loudly here, not silently pass every doesNotMatch check below against an empty string", () => {
    assert.ok(desktopHeaderBlock.length > 0, "expected to find the desktop masthead block");
  });

  it("carries the wordmark, the labelled text nav, the broker chip, and a text-only ghost Sign out button", () => {
    assert.match(
      desktopHeaderBlock,
      /<p className="wordmark text-xl text-ink">Levelflow<\/p>/,
    );
    assert.match(
      desktopHeaderBlock,
      /<nav\s+aria-label="Levelflow sections"\s+className="flex items-center gap-6"\s*>/,
    );
    assert.match(desktopHeaderBlock, /<BrokerChip \/>/);
    assert.match(
      desktopHeaderBlock,
      /<button\s+className="secondary-button min-h-10 px-3 py-2"\s+type="button"\s+onClick=\{\(\) => supabase\?\.auth\.signOut\(\)\}\s*>\s*Sign out\s*<\/button>/,
    );
  });

  it("renders TABS as plain text buttons — no tab.icon in the desktop nav (the mobile tab bar keeps its own separate icon set)", () => {
    assert.match(desktopHeaderBlock, /\{TABS\.map\(\(tab\) => \(/);
    assert.doesNotMatch(desktopHeaderBlock, /\{tab\.icon\}/);
    assert.match(desktopHeaderBlock, /\{tab\.label\}/);
  });

  it("carries no icon data for TABS to render — the nav renders labels, so the icons were built and thrown away on every load", () => {
    const tabsBlock = APP_SOURCE.match(/const TABS:[\s\S]*?\n\];/)?.[0] ?? "";
    assert.ok(tabsBlock.length > 0, "expected to find the TABS array");
    assert.doesNotMatch(tabsBlock, /icon/);
    // And with the data gone, so are the two lucide imports that existed only
    // to build it (MOBILE_TAB_ITEMS uses a different four).
    assert.doesNotMatch(APP_SOURCE, /LayoutDashboard/);
    assert.doesNotMatch(APP_SOURCE, /^\s*User,$/m);
  });

  it("styles the nav text per the mock: uppercase/letterspaced always, active = ink + accent underline, inactive = muted with hover", () => {
    assert.match(
      desktopHeaderBlock,
      /text-xs font-semibold uppercase tracking-\[0\.12em\]/,
    );
    assert.match(desktopHeaderBlock, /text-ink border-b-2 border-accent pb-1/);
    assert.match(desktopHeaderBlock, /text-ink-muted hover:text-ink/);
  });

  it("kill-list: no greeting, no header ThemeToggle, no Help/Donate buttons, no icon-chip nav-button pills", () => {
    assert.doesNotMatch(desktopHeaderBlock, /Welcome,/);
    assert.doesNotMatch(desktopHeaderBlock, /<ThemeToggle/);
    assert.doesNotMatch(desktopHeaderBlock, /<Mail /);
    assert.doesNotMatch(desktopHeaderBlock, /<Gift /);
    assert.doesNotMatch(desktopHeaderBlock, /aria-label="Help"/);
    assert.doesNotMatch(desktopHeaderBlock, /aria-label="Donate"/);
    assert.doesNotMatch(desktopHeaderBlock, /nav-button/);
  });

  it("kill-list, whole-file: the greeting helper is gone from App.tsx entirely, not merely unused in the header", () => {
    assert.doesNotMatch(APP_SOURCE, /Welcome,/);
    assert.doesNotMatch(APP_SOURCE, /profileDisplayName/);
  });
});

// Fix round 1, item 2 (IMPORTANT): MobileAccountMenu had no focus trap and
// no return-focus on Escape/outside-click/selection, unlike ScopeMenu's
// established closeAndFocusTrigger bar. No jsdom in this harness means none
// of this can be driven through actual key/click events (same limitation
// documented at the top of this file and in tests/scopeMenu.test.tsx) — the
// four dismissal paths are pinned against source text instead.
describe("MobileAccountMenu focus management (source-pinned — see header comment)", () => {
  const menuBlock = APP_SOURCE.match(
    /function MobileAccountMenu[\s\S]*?\n}\n/,
  )?.[0] ?? "";

  it("an outside click closes and returns focus to the trigger, not just closing", () => {
    // preventDefault() is load-bearing, confirmed by live interactive
    // testing in a real browser (not merely assumed): without it, the
    // browser's own default mousedown action reassigns focus to
    // document.body immediately after triggerRef.current?.focus() runs,
    // silently undoing the refocus whenever the outside click lands on a
    // non-focusable element (a heading, plain text — exactly the common
    // case for an outside click).
    assert.match(
      menuBlock,
      /!rootRef\.current\?\.contains\(event\.target as Node\)\)\s*\{[\s\S]*?event\.preventDefault\(\);\s*closeAndFocusTrigger\(\);/,
    );
  });

  it("Escape and Tab are both intercepted and both close-and-return-focus, mirroring ScopeMenu.tsx's own Tab handling", () => {
    assert.match(menuBlock, /event\.key === "Escape" \|\| event\.key === "Tab"/);
    assert.match(
      menuBlock,
      /event\.key === "Escape" \|\| event\.key === "Tab"\)\s*\{\s*event\.preventDefault\(\);\s*closeAndFocusTrigger\(\);/,
    );
  });

  it("the keydown handler is wired on the root (trigger + menu together), so it fires regardless of which currently has focus", () => {
    assert.match(
      menuBlock,
      /<div ref=\{rootRef\} className="relative" onKeyDown=\{handleKeyDown\}>/,
    );
  });

  it("every item selection — all four MobileMenuItems and the Help mailto link — closes and returns focus, never a bare setOpen", () => {
    const selectCalls = menuBlock.match(/onSelect=\{\(\) => select\([^)]*\)\}/g) ?? [];
    assert.equal(
      selectCalls.length,
      4,
      "expected Guide/Profile/Donate/Sign out to all route through select()",
    );
    assert.match(
      menuBlock,
      /href=\{supportMailto\}[\s\S]{0,150}onClick=\{\(\) => closeAndFocusTrigger\(\)\}/,
    );
    assert.doesNotMatch(menuBlock, /onClick=\{\(\) => setOpen\(false\)\}/);
  });

  it("select() itself always closes-and-refocuses before running the requested action", () => {
    assert.match(
      menuBlock,
      /function select\(action: \(\) => void\) \{\s*closeAndFocusTrigger\(\);\s*action\(\);\s*\}/,
    );
  });

  it("closeAndFocusTrigger has a stable identity (useCallback), so the outside-click effect only resubscribes on real open/close transitions", () => {
    assert.match(
      menuBlock,
      /const closeAndFocusTrigger = useCallback\(\(\) => \{\s*setOpen\(false\);\s*triggerRef\.current\?\.focus\(\);\s*\}, \[\]\);/,
    );
  });
});

// I2: the mobile Trades sub-tab is a CSS-only toggle within the "advisor"
// AppTab (deskColumnClassName above), never an AdvisorWorkspace remount, so
// the pre-existing activeTab-only force-refresh effect never re-fires for
// it on its own. Source-pinned for the same no-jsdom reason as the rest of
// this file: no harness here fires the tab-bar clicks that would otherwise
// exercise it live.
describe("App.tsx mobile Trades force-refresh (source-pinned, I2)", () => {
  it("re-fires refreshSetups when deskMobileView becomes \"trades\" while already on the Desk tab, without re-firing on every Review<->Scan swap", () => {
    assert.match(
      APP_SOURCE,
      /useEffect\(\(\) => \{\s*if \(session && activeTab === "advisor" && deskMobileView === "trades"\) \{\s*refreshSetups\(\{ forceOutcomeRefresh: true \}\);\s*\}\s*\}, \[activeTab, deskMobileView, session, refreshSetups\]\);/,
    );
  });

  it("leaves the original activeTab-only effect intact — Insights and the first Desk arrival still refresh regardless of deskMobileView", () => {
    assert.match(
      APP_SOURCE,
      /useEffect\(\(\) => \{\s*if \(session && \(activeTab === "advisor" \|\| activeTab === "history"\)\) \{\s*refreshSetups\(\{ forceOutcomeRefresh: true \}\);\s*\}\s*\}, \[activeTab, session, refreshSetups\]\);/,
    );
  });
});

// I3: a jump to the Desk from elsewhere in the app (Insights' "Open X in
// Advisor" row button, today's only nav.openAdvisor call site — see
// tests/historyPanel.test.tsx) has to land mobile on "review", the sub-view
// that actually shows the market it asked for — not whichever of Scan/
// Trades happened to be selected before.
describe("nav.openAdvisor also resets the mobile sub-view (source-pinned, I3)", () => {
  it('sets deskMobileView("review") alongside the existing advisorRequest/activeTab side effects', () => {
    assert.match(
      APP_SOURCE,
      /openAdvisor: \(symbol\) => \{\s*setAdvisorRequest\(\{ symbol, token: Date\.now\(\) \}\);\s*setActiveTab\("advisor"\);\s*setDeskMobileView\("review"\);\s*\},/,
    );
  });
});

// I3's second half: selecting a scan candidate is a decisive "go look at
// this" action, so it should carry the same mobile-view reset — threaded
// down as a callback prop rather than lifted into WorkspaceNav, since it's
// entirely internal to one AdvisorWorkspace instance's own columns.
describe("AdvisorWorkspace threads onMobileViewChange to the scan-row selection (source-pinned, I3)", () => {
  it("declares onMobileViewChange in its props and App.tsx wires it straight to setDeskMobileView", () => {
    assert.match(
      ADVISOR_WORKSPACE_SOURCE,
      /onMobileViewChange: \(view: DeskMobileView\) => void;/,
    );
    assert.match(APP_SOURCE, /onMobileViewChange=\{setDeskMobileView\}/);
  });

  it('onSelectCandidate calls onMobileViewChange("review") alongside selectSymbolForReview, so tapping a scan row on mobile switches to the review column', () => {
    const onSelectCandidateBlock = ADVISOR_WORKSPACE_SOURCE.match(
      /onSelectCandidate=\{\(candidate\) => \{[\s\S]*?\n {10}\}\}/,
    )?.[0] ?? "";
    assert.match(onSelectCandidateBlock, /selectSymbolForReview\(candidate\.symbol\);/);
    assert.match(onSelectCandidateBlock, /onMobileViewChange\("review"\);/);
  });

  it("CurrentTradesRail receives isActiveOnMobile so it can re-stamp its own freshness on the same transition (I2)", () => {
    assert.match(
      ADVISOR_WORKSPACE_SOURCE,
      /<CurrentTradesRail\s+isActiveOnMobile=\{mobileView === "trades"\}/,
    );
  });
});

// I4/spec §10b: reviewing a closed market shows a quiet reopen notice
// instead of the generic chart-data error. Platform parity (spec §2) means
// this isn't mobile-specific, but it lives alongside AdvisorWorkspace's
// other source-pinned facts in this file rather than a fourth file just for
// one check.
describe("AdvisorWorkspace stage notice for a closed market (source-pinned, I4/§10b)", () => {
  it("imports marketAvailability + formatReopen from the shared marketHours module", () => {
    assert.match(
      ADVISOR_WORKSPACE_SOURCE,
      /import \{ formatReopen, marketAvailability \} from "\.\.\/\.\.\/lib\/marketHours";/,
    );
  });

  it('replaces the generic chart-error notice with "Closed · opens {time}" when the selected market is currently closed, leaving the open case unchanged', () => {
    const catchBlock = ADVISOR_WORKSPACE_SOURCE.match(
      /\} catch \{[\s\S]*?\} finally \{/,
    )?.[0] ?? "";
    assert.match(
      catchBlock,
      /marketAvailability\(\s*getSecurityOption\(symbol\)\.assetType,\s*symbol,/,
    );
    assert.match(catchBlock, /availability\.open/);
    assert.match(catchBlock, /`Closed · opens \$\{/);
    assert.match(catchBlock, /formatReopen\(availability\.opensAt, new Date\(\)\)/);
    assert.match(
      catchBlock,
      /"Verified market data is not available for this market yet\."/,
    );
  });
});

// Completeness audit 2, deviation note 8: BrokerChip rendered as the app's
// .chip idiom (11px uppercase, 2px radius, a currentColor-derived border)
// where the mock that governs both mastheads draws tokens.css:22-24's
// .broker — a 13px bold pill on sheet with a 1.5px hairline border, a 6px
// radius, and an 8px buy-colored dot. One component still feeds all three call
// sites (both headers plus Profile's Broker card), so this is pinned once.
// Literal utility strings against the real token names, per the C1 guard.
describe("BrokerChip renders the mock's .broker treatment (tokens.css:22-24)", () => {
  const BROKER_CHIP_SOURCE = readFileSync(
    "src/components/workspace/BrokerChip.tsx",
    "utf8",
  );

  it("is a hairline-bordered pill on sheet at the mock's geometry, not the .chip idiom", () => {
    assert.match(
      BROKER_CHIP_SOURCE,
      /className="inline-flex items-center gap-2 rounded-md border-\[1\.5px\] border-hairline bg-sheet px-3 py-\[7px\] text-\[13px\] font-bold text-ink"/,
    );
    assert.doesNotMatch(BROKER_CHIP_SOURCE, /className="chip\b/);
  });

  it("carries the mock's 8px buy-colored dot", () => {
    assert.match(
      BROKER_CHIP_SOURCE,
      /className="h-2 w-2 rounded-full bg-buy" aria-hidden="true"/,
    );
  });

  it("still names the broker in text — the dot is decoration, not the label", () => {
    assert.match(BROKER_CHIP_SOURCE, />\s*E8 Markets\s*</);
  });
});
