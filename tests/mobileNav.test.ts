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

  it("the three real Desk columns each call it with their own view and pre-Task-9 base classes intact", () => {
    assert.match(
      ADVISOR_WORKSPACE_SOURCE,
      /deskColumnClassName\(\s*mobileView === "scan",\s*"block",\s*"scrolly min-w-0 lg:h-full lg:min-h-0 lg:overflow-y-auto lg:pr-1",\s*\)/,
    );
    assert.match(
      ADVISOR_WORKSPACE_SOURCE,
      /deskColumnClassName\(\s*mobileView === "review",\s*"flex",\s*"scrolly min-w-0 flex-col gap-5 lg:h-full lg:min-h-0 lg:overflow-y-auto lg:pr-1",\s*\)/,
    );
    assert.match(
      ADVISOR_WORKSPACE_SOURCE,
      /deskColumnClassName\(\s*mobileView === "trades",\s*"flex",\s*"scrolly min-w-0 flex-col gap-5 lg:h-full lg:min-h-0 lg:overflow-y-auto lg:pr-1",\s*\)/,
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

  it("gates the pre-Task-9 header content behind lg:contents rather than deleting it", () => {
    assert.match(APP_SOURCE, /className="hidden lg:contents"/);
  });

  it("mobile header carries the broker chip and an account menu, not the desktop icon row", () => {
    const mobileHeaderBlock = APP_SOURCE.match(
      /<div className="flex min-w-0 items-center justify-between gap-3 lg:hidden">[\s\S]*?<\/div>\s*<\/div>/,
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

  // Fix round 1, item 1 (SPEC): spec §2/§12 put a broker chip on the ≥lg
  // header too, not just Profile's Broker card and the mobile compact one —
  // the desktop-freeze reading that originally omitted it didn't hold once
  // weighed against the same spec text driving the mobile decision.
  it("desktop header (the lg:contents block) also carries the broker chip, beside ThemeToggle", () => {
    const desktopHeaderBlock = APP_SOURCE.match(
      /<div className="hidden lg:contents">[\s\S]*?<\/nav>\s*<\/div>/,
    )?.[0] ?? "";
    assert.match(
      desktopHeaderBlock,
      /<ThemeToggle mode=\{theme\.mode\} onChange=\{theme\.setMode\} \/>[\s\S]{0,40}<BrokerChip \/>/,
    );
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
