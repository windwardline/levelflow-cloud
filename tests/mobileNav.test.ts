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
    // The mobile masthead takes the compact variant (m-mobile-v3.html:43:
    // the pill reads "E8" at 12px there; content surfaces keep the full name).
    assert.match(mobileHeaderBlock, /<BrokerChip compact \/>/);
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

  // Fix wave 2B, FIX 4 (completeness-audit-2 Finding 6). The scrolling
  // content wrapper reserves pb-24 below lg specifically to clear the fixed
  // MobileTabBar (>= 56px with its safe-area inset). The page-wide footer
  // is a sibling that renders *after* that wrapper, so it needs the same
  // clearance on its own — before this fix it carried only pb-8, and at
  // full scroll on Insights/Guide/Donate the tab bar overlaid the trailing
  // padding and the LegalLinks row immediately above it. lg:pb-8 keeps the
  // >=lg value exactly what pb-8 rendered before (no fixed tab bar exists
  // there to clear), so this is mobile-only clearance, not a desktop
  // visual change.
  it("gives the page footer pb-24 clearance below lg to escape the fixed tab bar, collapsing back to pb-8 at lg (F4 fix wave 2B)", () => {
    const footerClassName = APP_SOURCE.match(
      /<footer\s+className=\{`([^`]*)`\}/,
    )?.[1] ?? "";
    assert.ok(
      footerClassName.length > 0,
      "expected to find the page footer's template-literal className",
    );
    assert.match(footerClassName, /\bpb-24\b/);
    assert.match(footerClassName, /\blg:pb-8\b/);
    // The literal string carries both; the ${isDeskTab ? "lg:hidden" : ""}
    // interpolation must still be the only dynamic piece — this must stay
    // a real, statically-analyzable "lg:pb-8" token for Tailwind's
    // build-time scanner (tailwindVariantGuard.test.ts's C1 concern), not
    // reassembled at runtime.
    assert.doesNotMatch(footerClassName, /lg:\$\{/);
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

// Fix wave 2B, FIX 6 (completeness-audit-2 beyond-checklist #8). No mock
// covers this state (it's a pre-auth data-loading gate, not a Desk/Insights/
// Guide/Profile surface), but the final review's own terminal-panel
// inventory named it a survivor with no justification beyond "no mock
// covers this" — the same reasoning already used to flatten every other
// unjustified box in this branch. Flattened to a minimal centered wordmark
// plus the system's own spinner idiom (Loader2 + animate-spin, the same
// pairing AuthScreen/AdvisorWorkspace/MarketScanPanel/
// AdvisorRecommendationPanel all already use) instead of a bespoke
// animate-pulse placeholder square inside a card.
describe("App.tsx pre-auth loading splash (fix wave 2B, beyond-checklist #8)", () => {
  const splashBlock = APP_SOURCE.match(/if \(loading\) \{[\s\S]*?\n {2}\}\n/)?.[0] ?? "";

  it("extracted a non-empty block — a future refactor that breaks this regex must fail loudly here, not silently pass every check below against an empty string", () => {
    assert.ok(splashBlock.length > 0, "expected to find the loading-splash if-block");
  });

  it("carries no terminal-panel — no boxed card", () => {
    assert.doesNotMatch(splashBlock, /terminal-panel/);
  });

  it("renders the wordmark and the system's own spinner idiom, not a bespoke animate-pulse placeholder", () => {
    assert.match(splashBlock, /className="wordmark/);
    assert.match(
      splashBlock,
      /<Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" \/>/,
    );
    assert.doesNotMatch(splashBlock, /animate-pulse/);
  });

  it("keeps the exact copy — no copy changes", () => {
    assert.match(splashBlock, />\s*Opening Levelflow\s*</);
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

  // m-mobile-v3.html:43 compacts the same pill for the mobile masthead: "E8"
  // at 12px with 5px/9px padding. The accessible name stays "E8 Markets" in
  // both variants — the compaction is a space ruling, not a rename.
  it("offers the mobile masthead's compact variant at the mock's geometry", () => {
    assert.match(
      BROKER_CHIP_SOURCE,
      /className="inline-flex items-center gap-2 rounded-md border-\[1\.5px\] border-hairline bg-sheet px-\[9px\] py-\[5px\] text-xs font-bold text-ink"/,
    );
    assert.match(BROKER_CHIP_SOURCE, /aria-label="E8 Markets"/);
    assert.match(BROKER_CHIP_SOURCE, />\s*E8\s*</);
  });
});

// ---------------------------------------------------------------------------
// Fix wave 2C — completeness audit 2, Finding 3 (D9). The three chrome
// requirements D9 enumerates (top bar, bottom tab bar, one column per tab)
// all passed while the mobile mocks' own INTERIORS were never built: below
// lg the app served the desktop composition shrunk. These blocks pin each
// interior the mocks actually draw, and — the half that matters just as
// much — pin that every one of them is scoped so the approved, frozen >=lg
// composition cannot move.
//
// Why `max-lg:` rather than the base + `lg:`-reset pairing the rest of this
// branch uses: Tailwind emits breakpoint variants AFTER pseudo-class ones,
// so an `lg:`-prefixed reset of a `hover:`/`last:` utility wins at >=lg and
// silently kills the desktop hover fill or the row's last-child border. The
// mobile treatments below therefore ride `max-lg:` (a `width < 1024px`
// media query, the exact complement of `lg:`), which means the >=lg
// cascade is untouched by construction — not merely by inspection. Same
// literal-token discipline as everywhere else (C1,
// tests/tailwindVariantGuard.test.ts): no variant prefix is ever assembled
// at runtime.
const SCAN_RAIL_SOURCE = readFileSync(
  "src/components/workspace/MarketScanPanel.tsx",
  "utf8",
);

// Every mobile-only utility in these files must be a real `max-lg:` token
// (or sit on an element the mocks introduce for mobile alone), so the
// desktop rules Tailwind generates are byte-identical to before this wave.
function mobileOnlyClasses(source: string): string[] {
  return Array.from(source.matchAll(/\bmax-lg:[^\s"'`{}]+/g), (m) => m[0]);
}

describe("mobile scan tab interiors (m-scan-v1.html, fix wave 2C)", () => {
  it("puts the scope pill and Scan now side by side on one row below lg, with the eyebrow undrawn there (m-scan-v1.html:39-42)", () => {
    // One container holds all three now. At >=lg it reproduces the old
    // header row exactly — flex-wrap + the scope wrapper taking the second
    // line, its 8px row gap standing in for the header row's old mb-2 — so
    // a-desk-v3.html:88's eyebrow-opposite-Scan-now geometry is unchanged.
    assert.match(
      SCAN_RAIL_SOURCE,
      /className="flex flex-wrap items-baseline justify-between gap-2 max-lg:flex-nowrap max-lg:items-center max-lg:gap-2\.5"/,
    );
    // The mock draws no "Scan" eyebrow on the mobile tab — the bottom tab bar
    // already names the surface. Clipped rather than display:none, the same
    // reasoning ScopeMenu.tsx documents for its own suppressed caption: the
    // heading stays in the accessibility tree, so mobile keeps a landmark for
    // a surface that draws none.
    assert.match(
      SCAN_RAIL_SOURCE,
      /className="text-xs font-semibold uppercase tracking-normal text-ink-muted max-lg:sr-only"/,
    );
    // Scope first, Scan now second — the mock's own reading order below lg,
    // and `order-last` is what floats the wrapper onto row two at >=lg.
    assert.match(
      SCAN_RAIL_SOURCE,
      /className="order-last w-full min-w-0 max-lg:order-none max-lg:w-auto max-lg:flex-1"[\s\S]{0,200}<ScopeMenu/,
    );
    // Nowrap below lg means the button has to hold its width against the
    // flex-1 scope pill; at >=lg the row has slack and never shrank it, so
    // the floor is mobile-only rather than a new unconditional utility.
    assert.match(SCAN_RAIL_SOURCE, /max-lg:shrink-0[\s\S]{0,400}Scan now/);
  });

  it("renders each result as the mock's inset card below lg, flat hairline rows at >=lg (m-scan-v1.html:17-20)", () => {
    const branches = SCAN_RAIL_SOURCE.match(
      /className=\{selected\n\s*\? "([^"]*)"\n\s*: "([^"]*)"\}/,
    );
    assert.ok(branches, "expected to find the row's selected/unselected classes");
    const [, selectedClasses, unselectedClasses] = branches;
    for (const classes of [selectedClasses, unselectedClasses]) {
      // `.mkt`: 8px radius, a full hairline border and the sheet fill, at
      // the mock's 13/14 padding. The base `border-b` is what keeps >=lg's
      // flush rows, so the card's other three sides are added, never
      // swapped.
      assert.match(classes, /max-lg:rounded-lg/);
      assert.match(classes, /max-lg:border\b/);
      assert.match(classes, /max-lg:px-3\.5/);
      assert.match(classes, /max-lg:py-3/);
    }
    // `.mkt.sel` adds only the accent edge — the sheet fill is on every
    // card below lg, but at >=lg it stays the selected row's own signal.
    assert.match(selectedClasses, /(?:^|\s)bg-sheet(?:\s|$)/);
    assert.match(unselectedClasses, /max-lg:bg-sheet/);
    assert.doesNotMatch(unselectedClasses, /(?:^|\s)bg-sheet(?:\s|$)/);
    assert.match(
      selectedClasses,
      /shadow-\[inset_3px_0_0_var\(--color-accent\)\]/,
    );
    assert.doesNotMatch(unselectedClasses, /shadow-\[inset/);
  });

  it("stacks the cards down the page below lg instead of inside the rail's 404px scroller (m-scan-v1.html:45-49)", () => {
    // The 404px cap and its own scroll area are the >=lg rail's geometry
    // (a-desk-v3.html:21) — kept exactly, and lifted below lg where the
    // page itself scrolls and the footnote follows the last card.
    assert.match(
      SCAN_RAIL_SOURCE,
      /className="scrolly mt-2 max-h-\[404px\] overflow-y-auto max-lg:grid max-lg:max-h-none max-lg:gap-2 max-lg:overflow-visible"/,
    );
  });

  it("takes the mock's 15px symbol below lg without disturbing the e2e row selector", () => {
    // tests/e2e/authenticated-workspace.spec.ts locates scanned symbols by
    // `span.truncate.font-bold.text-ink` — those three survive verbatim.
    assert.match(
      SCAN_RAIL_SOURCE,
      /className="block truncate text-sm font-bold text-ink max-lg:text-\[15px\]"/,
    );
  });

  it("keeps every mobile treatment inside a real max-lg: token, so the >=lg cascade is untouched by construction", () => {
    assert.ok(
      mobileOnlyClasses(SCAN_RAIL_SOURCE).length > 0,
      "expected the scan rail to carry mobile-only utilities",
    );
    assert.doesNotMatch(SCAN_RAIL_SOURCE, /max-lg:\$\{/);
  });
});

const LADDER_SOURCE = readFileSync(
  "src/components/workspace/AdvisorRecommendationPanel.tsx",
  "utf8",
);
const RECEIPT_SOURCE = readFileSync(
  "src/components/workspace/SetupQualityReceipt.tsx",
  "utf8",
);

describe("mobile review tab interiors (m-mobile-v3.html, fix wave 2C)", () => {
  it("renders each ladder value as the mock's .copy card below lg (m-mobile-v3.html:25,70-73)", () => {
    const row = LADDER_SOURCE.match(
      /className="flex min-h-11 min-w-0 items-baseline[^"]*"/,
    )?.[0] ?? "";
    assert.ok(row.length > 0, "expected to find the copy row's className");
    // 8px radius, hairline border on sheet at 13/14 padding. The card's
    // other three sides are added to the base `border-b`, and `last:border-b`
    // is re-asserted below lg because the un-prefixed `last:border-b-0` that
    // keeps >=lg's final row flush outranks a plain border utility on
    // specificity.
    assert.match(row, /max-lg:rounded-lg/);
    assert.match(row, /max-lg:border\b/);
    assert.match(row, /max-lg:bg-sheet/);
    assert.match(row, /max-lg:px-3\.5/);
    assert.match(row, /max-lg:py-3/);
    assert.match(row, /max-lg:last:border-b\b/);
    // The mock stacks the label over its value with the button opposite; at
    // >=lg the label sits opposite value+button on one baseline. Same DOM,
    // reached by letting the value/button wrapper dissolve below lg.
    assert.match(row, /max-lg:flex-wrap/);
    assert.match(
      LADDER_SOURCE,
      /className="flex min-w-0 items-baseline gap-1 max-lg:contents"/,
    );
    assert.match(
      LADDER_SOURCE,
      /uppercase tracking-normal text-ink-muted max-lg:w-full"/,
    );
    assert.match(LADDER_SOURCE, /className="grid max-lg:gap-2"/);
  });

  it("labels the copy button below lg and keeps the icon-only >=lg affordance (m-mobile-v3.html:28-29)", () => {
    // `.cp`: a 1.5px accent-bordered button reading "⧉ Copy", flipping to the
    // buy tone and "✓ Copied". Both branches keep .cpv-copy as their base, so
    // the >=lg icon button — including its 44px target and negative margin —
    // is the same control it always was.
    const branches = LADDER_SOURCE.match(
      /className=\{copied\n\s*\? "([^"]*)"\n\s*: "([^"]*)"\}/,
    );
    assert.ok(branches, "expected the copy button's copied/idle classes");
    const [, copiedClasses, idleClasses] = branches;
    for (const classes of [copiedClasses, idleClasses]) {
      assert.match(classes, /^cpv-copy\b/);
      assert.match(classes, /max-lg:m-0/);
      assert.match(classes, /max-lg:rounded-md/);
      assert.match(classes, /max-lg:border-\[1\.5px\]/);
      assert.match(classes, /max-lg:px-3/);
    }
    assert.match(copiedClasses, /max-lg:border-buy/);
    assert.match(copiedClasses, /max-lg:text-buy/);
    assert.match(idleClasses, /max-lg:border-accent/);
    assert.match(idleClasses, /max-lg:text-accent/);
    // The word is functional labeling, mobile-only, and never displaces the
    // aria-label every copy test locates these buttons by.
    assert.match(
      LADDER_SOURCE,
      /<span className="lg:hidden">\s*\{copied \? "Copied" : "Copy"\}\s*<\/span>/,
    );
    assert.match(
      LADDER_SOURCE,
      /aria-label=\{copied \? `\$\{label\} copied` : `Copy \$\{label\}`\}/,
    );
  });

  it("condenses the why panel to one summary line plus a Why disclosure below lg (m-mobile-v3.html:75)", () => {
    // The summary is the Market row's character and the Record row's
    // numbers — the same two sentences the rows carry, in the mock's own
    // order. No new copy is written for it, and a category with no honest
    // datum contributes nothing rather than an em dash mid-sentence.
    assert.match(RECEIPT_SOURCE, /const WHY_SUMMARY_LABELS = \["Market", "Record"\];/);
    assert.match(
      RECEIPT_SOURCE,
      /\.filter\(\(sentence\) => sentence !== ABSENT\)\s*\.join\(" "\)/,
    );
    assert.match(RECEIPT_SOURCE, /<p className="text-\[13px\] leading-5 lg:hidden">/);
    assert.match(RECEIPT_SOURCE, />\s*Why\s*<\/button>/);
    assert.match(RECEIPT_SOURCE, /aria-expanded=\{rowsOpen\}/);
    assert.match(RECEIPT_SOURCE, /aria-controls=\{rowsId\}/);
  });

  it("keeps the mock's five rows as the >=lg rendering, hidden below lg only while the disclosure is closed", () => {
    // a-desk-v3.html:205-212 draws all five rows on the Desk, so the >=lg
    // branch is `grid` either way — the disclosure state can only ever
    // subtract below lg.
    assert.match(
      RECEIPT_SOURCE,
      /className=\{rowsShown\n\s*\? "grid min-w-0 gap-0\.5"\n\s*: "grid min-w-0 gap-0\.5 max-lg:hidden"\}/,
    );
    // With nothing to condense there is nothing to disclose, so the rows
    // carry themselves at every width rather than hiding behind a toggle
    // whose summary would be blank.
    assert.match(
      RECEIPT_SOURCE,
      /const rowsShown = rowsOpen \|\| summary\.length === 0;/,
    );
    // The section's only landmark and the accessible name two e2e specs
    // locate the receipt by both survive at every width.
    assert.match(RECEIPT_SOURCE, />\s*Why this setup\s*<\/h3>/);
  });

  it("keeps every mobile treatment inside a real max-lg: or lg: token on both review files", () => {
    for (const source of [LADDER_SOURCE, RECEIPT_SOURCE]) {
      assert.doesNotMatch(source, /max-lg:\$\{/);
    }
    assert.ok(mobileOnlyClasses(LADDER_SOURCE).length > 0);
  });
});

describe("mobile trades tab interior (m-trades-v1.html, fix wave 2C)", () => {
  const TRADES_RAIL_SOURCE = readFileSync(
    "src/components/workspace/CurrentTradesRail.tsx",
    "utf8",
  );

  it("titles the surface at the mock's 19px display scale below lg, keeping the >=lg eyebrow (m-trades-v1.html:11-12,40)", () => {
    // `.phead .t`: 19px display type in ink, sentence case — a page head,
    // because below lg this tab IS the page. At >=lg it stays the 12px muted
    // eyebrow the scan rail beside it uses (a-desk-v3.html:218).
    assert.match(
      TRADES_RAIL_SOURCE,
      /<h3 className="text-xs font-semibold uppercase tracking-normal text-ink-muted max-lg:font-display max-lg:text-\[19px\] max-lg:font-bold max-lg:normal-case max-lg:tracking-\[-0\.02em\] max-lg:text-ink">\s*Current trades\s*<\/h3>/,
    );
  });

  it("leaves the freshness stamp and the row that carries both exactly as >=lg draws them", () => {
    // `.phead` and `.rrhead` are the same shape in both mocks — heading
    // opposite the stamp on one baseline row — so nothing about the container
    // or the stamp is platform-specific.
    assert.match(
      TRADES_RAIL_SOURCE,
      /className="flex flex-wrap items-baseline justify-between gap-2"/,
    );
    assert.match(TRADES_RAIL_SOURCE, /as of \{formatAsOf\(lastRefreshedAt\)\} ·/);
  });
});

describe("mobile chrome interiors (m-mobile-v3.html + menu mock, fix wave 2C)", () => {
  const menuBlock = APP_SOURCE.match(
    /function MobileAccountMenu[\s\S]*?\n}\n/,
  )?.[0] ?? "";

  it("draws the account trigger as the mock's initial-in-circle (m-mobile-v3.html:44, menu mock :33)", () => {
    // A circle on sheet with a 1.5px hairline border carrying the signed-in
    // email's first letter in 13px bold. The circle is the kit's 44px tap
    // target rather than the mock's 34px — spec §16 trims padding and type,
    // never the hit area — and every aria/focus contract is untouched.
    assert.match(
      menuBlock,
      /className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-\[1\.5px\] border-hairline bg-sheet text-\[13px\] font-bold text-ink transition hover:border-accent\/40"/,
    );
    assert.match(menuBlock, /initial: string;/);
    // No email on the session is a real possibility the types allow, so the
    // circle falls back to the icon rather than rendering blank.
    assert.match(
      menuBlock,
      /: initial \|\| <CircleUser className="h-5 w-5" aria-hidden="true" \/>/,
    );
    // Sourced from the session, uppercased, never from a profile display name.
    assert.match(
      APP_SOURCE,
      /const accountInitial = \(session\.user\.email \?\? ""\)\.trim\(\)\.charAt\(0\)\s*\.toUpperCase\(\);/,
    );
    assert.match(APP_SOURCE, /initial=\{accountInitial\}/);
  });

  it("keeps the account menu's aria, role and focus contracts byte-intact through the avatar change", () => {
    assert.match(menuBlock, /aria-expanded=\{open\}/);
    assert.match(menuBlock, /aria-haspopup="menu"/);
    assert.match(menuBlock, /aria-label="Account menu"/);
    assert.match(menuBlock, /role="menu"/);
    assert.match(menuBlock, /ref=\{triggerRef\}/);
  });

  it("sets the bottom-tab labels in the mock's uppercase letterspaced type (m-mobile-v3.html:32)", () => {
    // 10.5px/700/uppercase at .06em tracking. No breakpoint guard needed or
    // wanted: the whole nav is `lg:hidden`, so these are mobile rules already.
    assert.match(
      APP_SOURCE,
      /className=\{`flex min-h-14 flex-col items-center justify-center gap-0\.5 text-\[10\.5px\] font-bold uppercase tracking-\[0\.06em\] \$\{/,
    );
    // The accessible name comes from the explicit aria-label, so CSS casing
    // never reaches the e2e nav-name contracts (/^Trades(,|$)/ and friends).
    assert.match(
      APP_SOURCE,
      /aria-label=\{badge \? `\$\{item\.label\}, \$\{badge\} current` : item\.label\}/,
    );
  });

  it("puts the Trades badge on the caution token, still driven by the same live count (m-mobile-v3.html:36)", () => {
    assert.match(
      APP_SOURCE,
      /className="absolute -right-2 -top-1\.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-caution px-1 font-mono text-\[10px\] font-bold leading-none tracking-normal text-paper"/,
    );
    // The count is unchanged: currentTradeBadgeCount, the same pending/open
    // filter the Trades tab itself renders. No "needs action" semantic is
    // invented — the mock's caution fill is a color, not a new claim.
    assert.match(
      APP_SOURCE,
      /tradeBadgeCount=\{currentTradeBadgeCount\(setupState\.setups, new Date\(\)\)\}/,
    );
    assert.match(APP_SOURCE, /item\.value === "trades" && tradeBadgeCount > 0/);
    // The mock's own #fff would collapse on the dark theme's gold caution
    // (~1.9:1); text-paper re-values with the fill, per contrast.test.ts.
    assert.doesNotMatch(APP_SOURCE, /bg-caution[^"]*text-white/);
  });
});
