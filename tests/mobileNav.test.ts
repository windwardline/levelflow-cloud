import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { LEGAL_SLUGS, legalDocument } from "../src/lib/legalDocuments";
import {
  MOBILE_FRAME,
  MOBILE_FRAME_PINNED,
  MOBILE_FRAME_SCROLL,
} from "../src/components/mobileFrame";
import {
  buildTradeCards,
  currentTradeBadgeCount,
} from "../src/components/workspace/CurrentTradesRail";
import { labelAccounts } from "../src/components/workspace/AccountSwitcherMenu";
import type { TradeSetupRow } from "../src/lib/tradeAnalyzer";
import type { BrokerAccount } from "../src/lib/profile";

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
const MARKET_SCAN_PANEL_SOURCE = readFileSync(
  "src/components/workspace/MarketScanPanel.tsx",
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

describe("the Desk's two compositions (spec §17e — m-scan-v3 below lg, a-desk-v3 at ≥lg)", () => {
  it("chooses one of them in JavaScript, so only one is ever in the DOM", () => {
    // Not a CSS toggle: the merged surface pins a control row, a market head
    // and the chart above ONE scrolling region, which is a pair of wrapper
    // boxes no reordering of the desktop DOM produces. Rendering one keeps a
    // single "Scan scope" trigger, one chart canvas, and one accessible name
    // per control at every width.
    assert.match(
      ADVISOR_WORKSPACE_SOURCE,
      /const isMobile = useIsMobileViewport\(\);/,
    );
    assert.match(ADVISOR_WORKSPACE_SOURCE, /\n  if \(isMobile\) \{/);
    // The retired CSS gate is gone in both directions: no helper, and no
    // hidden/lg:<display> pair standing in for one.
    assert.doesNotMatch(ADVISOR_WORKSPACE_SOURCE, /deskColumnClassName/);
    assert.doesNotMatch(ADVISOR_WORKSPACE_SOURCE, /"hidden lg:/);
  });

  it("leaves the ≥lg three columns exactly as they render — the mobile gating removed and nothing else", () => {
    // Each column's class list is today's, minus the base display utility that
    // used to hide it below lg. Every lg: token is untouched, which is what
    // makes the built CSS's ≥lg media block identical.
    for (
      const columnClasses of [
        "scrolly min-w-0 lg:block lg:h-full lg:min-h-0 lg:overflow-y-auto lg:border-r lg:border-hairline lg:pr-4",
        "scrolly min-w-0 flex-col gap-5 lg:flex lg:h-full lg:min-h-0 lg:overflow-y-auto lg:pr-1",
        "scrolly min-w-0 flex-col gap-5 lg:flex lg:h-full lg:min-h-0 lg:overflow-y-auto lg:border-l lg:border-hairline lg:bg-[color-mix(in_srgb,var(--color-sheet)_55%,var(--color-paper))] lg:pl-4 lg:pr-4",
      ]
    ) {
      assert.ok(
        ADVISOR_WORKSPACE_SOURCE.includes(`className="${columnClasses}"`),
        `expected the Desk column: ${columnClasses}`,
      );
    }
    assert.match(
      ADVISOR_WORKSPACE_SOURCE,
      /className="grid min-w-0 gap-5 lg:min-h-0 lg:flex-1 lg:grid-cols-\[264px_minmax\(0,1fr\)_300px\] lg:grid-rows-\[minmax\(0,1fr\)\] lg:overflow-hidden"/,
    );
  });

  it("keeps both mobile surfaces mounted and toggles them by display, so flipping to Trades never tears the chart down", () => {
    // I2's premise, preserved through the merge: the state that matters
    // (symbol, scanResult, analysisState, the chart canvas) lives across a tab
    // flip because neither surface unmounts. Spec §17g makes both of them the
    // same fixed frame, so the shown branch is the shared MOBILE_FRAME string
    // rather than each surface's own guess at it.
    assert.match(
      ADVISOR_WORKSPACE_SOURCE,
      /className=\{mobileView === "scan" \? MOBILE_FRAME : "hidden"\}/,
    );
    assert.match(
      ADVISOR_WORKSPACE_SOURCE,
      /className=\{mobileView === "trades" \? MOBILE_FRAME : "hidden"\}/,
    );
  });

  it("has exactly two mobile views, and no trace of the retired third", () => {
    assert.match(
      ADVISOR_WORKSPACE_SOURCE,
      /export type DeskMobileView = "scan" \| "trades";/,
    );
    // Code, not prose: the comment that explains what "review" used to be is
    // documentation of a removal, which is exactly what a reader of this file
    // needs. What must not survive is a live reference, so the scan is of the
    // source with its comments stripped.
    for (const source of [ADVISOR_WORKSPACE_SOURCE, APP_SOURCE]) {
      assert.doesNotMatch(withoutComments(source), /"review"/);
    }
  });
});

describe("App.tsx mobile tab bar + header (source-pinned — see header comment)", () => {
  it("lists exactly Scan, Trades, Insights, in that order — three tabs (spec §17e)", () => {
    const block = APP_SOURCE.match(/const MOBILE_TAB_ITEMS:[\s\S]*?\n\];/)?.[0];
    assert.ok(block, "expected to find MOBILE_TAB_ITEMS");
    const labels = Array.from(
      block.matchAll(/label:\s*"([^"]+)"/g),
      (match) => match[1],
    );
    assert.deepEqual(labels, ["Scan", "Trades", "Insights"]);
    // The bar's own grid has to agree, or the fourth column stays as dead space
    // where the Review tab used to be.
    assert.match(APP_SOURCE, /className="mx-auto grid max-w-7xl grid-cols-3"/);
    assert.match(
      APP_SOURCE,
      /type MobileTab = "scan" \| "trades" \| "insights";/,
    );
    // Its icon left with it.
    assert.doesNotMatch(APP_SOURCE, /LineChart/);
  });

  it("renders the tab bar only below lg and pins it to the viewport bottom", () => {
    assert.match(
      APP_SOURCE,
      /className="fixed inset-x-0 bottom-0 z-20 border-t border-hairline bg-paper\/95 pb-\[env\(safe-area-inset-bottom\)\] backdrop-blur lg:hidden"/,
    );
  });

  // §17n resized the box from 56px to 48px: the bar is ancillary chrome, its own
  // content measures 38px against the built CSS at 375x812, and 48px is the kit's
  // 44px tap floor plus 4px. The floor itself is untouched — that is what this
  // pins, and tests/mobileMinimalism.test.ts pins the number with its measurement.
  it("every tab bar button clears the 44px touch target (min-h-12 = 48px)", () => {
    assert.match(APP_SOURCE, /min-h-12 flex-col items-center justify-center/);
    assert.doesNotMatch(
      APP_SOURCE,
      /min-h-(?:10|11) flex-col items-center justify-center/,
      "the bar never drops to the 44px floor or below it",
    );
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
    const chipCallSite = mobileHeaderBlock.match(/<BrokerChip[\s\S]*?\/>/)?.[0] ?? "";
    assert.match(chipCallSite, /accounts=\{profile\.brokerAccounts\}/);
    assert.match(chipCallSite, /activeId=\{profile\.activeBrokerAccountId\}/);
    assert.match(chipCallSite, /\bcompact\b/);
    assert.match(
      chipCallSite,
      /onManage=\{\(\) =>\s*\n\s*goToSurface\(\{ \.\.\.currentSurface, tab: "profile", document: null \}\)\}/,
    );
    assert.match(chipCallSite, /onSelect=\{handleActivateAccount\}/);
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
  // content wrapper reserves a bottom pad below lg specifically to clear the
  // fixed MobileTabBar (>= 56px with its safe-area inset). The footer trailed that
  // wrapper, so at full scroll it was the last thing on the page and needed the
  // identical reserve — with a small pad alone the bar overlaid its link row.
  //
  // Spec §17c moved the footer itself into src/components/AppFooter.tsx (one
  // footer for every surface; tests/appFooter.test.ts owns its composition), and
  // §17g/§17i then took the footer out of the bar's reach entirely: the footer is a
  // ≥lg element and the bar is lg:hidden, so the two can never share a viewport
  // and the footer's own reserve was padding for nothing.
  //
  // Where the LIVE clearance lives, stated plainly because this rationale had
  // drifted: not on these two branches. §17g gave every width below lg its own
  // frame, so both branches here render at ≥lg only, where lg:pb-5 lands last and
  // computes the 20px they actually draw — the reserve that clears the bar is
  // MOBILE_FRAME_SCROLL's, sized to the bar itself (see the §17n tests in this
  // file and tests/mobileMinimalism.test.ts). What these two still carry is a belt
  // for a mis-gated render — isMobileViewport reading stale would draw a desktop
  // branch at a phone width, where the bar IS mounted — and the shape that keeps
  // the ordering hazard below from returning. Both are worth pinning; neither is a
  // live 96px reserve, and this test no longer claims one.
  it("keeps the mis-gated-render belt on both desktop content branches (F4 fix wave 2B)", () => {
    const footerSource = readFileSync("src/components/AppFooter.tsx", "utf8");
    const wrapperClassNames = APP_SOURCE.match(
      /\? "motion-fade-in mx-auto w-full max-w-7xl [^"]*"\n\s*: "scrolly motion-fade-in mx-auto max-w-7xl [^"]*"/,
    )?.[0] ?? "";
    assert.ok(
      wrapperClassNames.length > 0,
      "expected to find the scrolling content wrapper's class branches",
    );
    for (const branch of wrapperClassNames.match(/"[^"]*"/g) ?? []) {
      assert.match(branch, /\bpb-24\b/, `content wrapper branch ${branch}`);
    }
    assert.doesNotMatch(footerSource, /\bpb-24\b/);
    // Real, statically-analyzable tokens for Tailwind's build-time scanner —
    // never a variant prefix reassembled at runtime (C1).
    assert.doesNotMatch(footerSource, /lg:\$\{/);
  });

  // Reserving the clearance is not the same as keeping it. Both wrapper branches
  // used to carry the sm: BLOCK-axis pad beside their `pb-24`, and a
  // padding-block utility beats a padding-bottom one whenever Tailwind emits it
  // later — which it does for a variant (measured in the built CSS: .pb-24 at
  // ~30kB, the sm: block form at ~39kB). Back when these branches still rendered
  // below lg, that made the reserve 20px rather than 96px from 640px to 1023px
  // while the fixed bar was mounted; only at lg — where the bar is gone and
  // lg:pb-5 lands last — did the numbers agree again. Since §17g the branches are
  // ≥lg-only, so the defect can no longer bite here; what this pins is the shape,
  // for the same two reasons the test above gives.
  //
  // (The utility is named by shape rather than spelled out here on purpose:
  // Tailwind's scanner reads this file too, and a dead class in a comment is a
  // dead rule in the bundle.)
  //
  // The rule this pins: nothing on these branches may touch the bottom axis
  // except the pb chain itself. An sm: pad may exist (it does, on the top axis),
  // but a block-axis one silently undoes the reserve, and the 640-1023px band is a
  // width no unit test looks at.
  it("keeps the pb chain intact on both branches — no sm: block pad undoes it", () => {
    const wrapperClassNames = APP_SOURCE.match(
      /\? "motion-fade-in mx-auto w-full max-w-7xl [^"]*"\n\s*: "scrolly motion-fade-in mx-auto max-w-7xl [^"]*"/,
    )?.[0] ?? "";
    assert.ok(
      wrapperClassNames.length > 0,
      "expected to find the scrolling content wrapper's class branches",
    );
    for (const branch of wrapperClassNames.match(/"[^"]*"/g) ?? []) {
      // No sm:-scoped utility on the bottom axis, in either form.
      assert.doesNotMatch(branch, /\bsm:py-/, `content wrapper branch ${branch}`);
      assert.doesNotMatch(branch, /\bsm:pb-/, `content wrapper branch ${branch}`);
      // The top pad the mock's rhythm needs is still there, on its own axis,
      // and the bottom chain still reopens at lg where the bar is gone.
      assert.match(branch, /\bsm:pt-5\b/, `content wrapper branch ${branch}`);
      assert.match(branch, /\blg:pb-5\b/, `content wrapper branch ${branch}`);
    }
  });

  it("wires every Donate affordance through the one existing tab switch (spec §17, §17i)", () => {
    // No new nav system (spec §17): setActiveTab("donate") is exactly what the
    // mobile account menu already fired. Counted, not merely matched, so a future
    // copy of the action cannot quietly grow its own mechanism — and the count is
    // TWO since §17i, not four: each link lives in exactly one home per platform,
    // so the two call sites are the two homes (the account menu below lg,
    // AppFooter's link row at ≥lg) and the Guide's and Profile's copies are gone.
    // §17o tier 1 then routed both through one navigation funnel, so what is counted
    // is two calls to it — in the arrow form specifically, so that a sentence naming
    // this mechanism in a comment does not count itself into the total.
    assert.equal(
      (APP_SOURCE.match(/tab: "donate", document: null \}\)/g) ?? []).length,
      2,
    );
    // Same two homes for the support address, each taking the one shared mailto
    // rather than rebuilding it.
    assert.equal(
      (APP_SOURCE.match(/supportMailto=\{SUPPORT_MAILTO\}/g) ?? []).length,
      2,
    );
    // And the two surfaces that used to receive them no longer take either prop.
    const guideCall = APP_SOURCE.match(/<GuidePanel[\s\S]*?\/>/)?.[0] ?? "";
    const profileCall = APP_SOURCE.match(/<ProfilePanel[\s\S]*?\/>/)?.[0] ?? "";
    assert.ok(guideCall.length > 0 && profileCall.length > 0);
    for (const call of [guideCall, profileCall]) {
      assert.doesNotMatch(call, /onOpenDonate/);
      assert.doesNotMatch(call, /supportMailto/);
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
    const chipCallSite = desktopHeaderBlock.match(/<BrokerChip[\s\S]*?\/>/)?.[0] ?? "";
    assert.match(chipCallSite, /accounts=\{profile\.brokerAccounts\}/);
    assert.match(chipCallSite, /activeId=\{profile\.activeBrokerAccountId\}/);
    assert.doesNotMatch(chipCallSite, /\bcompact\b/);
    assert.match(
      chipCallSite,
      /onManage=\{\(\) =>\s*\n\s*goToSurface\(\{ \.\.\.currentSurface, tab: "profile", document: null \}\)\}/,
    );
    assert.match(chipCallSite, /onSelect=\{handleActivateAccount\}/);
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
    // group-hover since the button became the kit's 44px target and the type
    // moved to an inner span: :hover never reaches a child, so a plain hover:
    // here would leave most of that target dead to it.
    assert.match(desktopHeaderBlock, /text-ink-muted group-hover:text-ink/);
  });

  it("holds the nav at the kit's 44px hit floor without moving a glyph (spec §9)", () => {
    // The idiom .tertiary-link and .cpv-copy already use: grow the box to 44px,
    // pull the extra height back out of the flow with a matching negative block
    // margin. Both boxes centre on the same line, so the row's geometry and the
    // underline's position are unchanged — the target is what grew.
    assert.match(
      desktopHeaderBlock,
      /className="group -my-3\.5 inline-flex min-h-11 items-center"/,
    );
    // The underline is a border on the element that carries the type. On a 44px
    // button it would sit 12px below the word, which is why the type is in a
    // span and the border is on the span.
    assert.match(
      desktopHeaderBlock,
      /<span\s+className=\{`text-xs font-semibold uppercase tracking-\[0\.12em\][\s\S]*?\}`\}\s*>\s*\{tab\.label\}\s*<\/span>/,
    );
    assert.doesNotMatch(
      desktopHeaderBlock,
      /<button[^>]*\n\s*className=\{`text-xs/,
      "the 44px box must not be the element the underline hangs on",
    );
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

// I2: the mobile Trades sub-tab is a display-only toggle within the "advisor"
// AppTab (both mobile surfaces stay mounted), never an AdvisorWorkspace
// remount, so
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

// I3, re-aimed by spec §17e: a jump to the Desk from elsewhere in the app
// (Insights' "Open X in Advisor" row button, today's only nav.openAdvisor call
// site — see tests/historyPanel.test.tsx) has to land mobile on the surface
// that actually shows the market it asked for. That surface is "scan" now: the
// merged surface's head, chart and ladder all follow the requested symbol.
describe("nav.openAdvisor lands mobile on the merged Scan surface (source-pinned, I3)", () => {
  it('sets deskMobileView("scan") alongside the existing advisorRequest/activeTab side effects', () => {
    assert.match(
      APP_SOURCE,
      /openAdvisor: \(setup\) => \{\s*setAdvisorRequest\(\{ setup, token: Date\.now\(\) \}\);\s*goToSurface\(\{ tab: "advisor", deskView: "scan", document: null \}\);\s*\},/,
    );
    // And the Desk opens there by default, rather than on a tab that no longer
    // exists.
    assert.match(
      APP_SOURCE,
      /useState<DeskMobileView>\("scan"\)/,
    );
  });
});

// I3's second half is retired by the merge: tapping a scan row used to have to
// switch tabs, because the chart it selected lived on a different one. On the
// merged surface the chart is directly above the list, so the row selection
// stays put and instead returns the reader to the top of the one scrolling
// region. The prop that carried the old jump is gone from both files.
describe("selecting a scan row no longer switches surfaces (source-pinned, §17e)", () => {
  it("carries no onMobileViewChange prop in either file", () => {
    for (const source of [ADVISOR_WORKSPACE_SOURCE, APP_SOURCE]) {
      assert.doesNotMatch(source, /onMobileViewChange/);
    }
  });

  it("shares one candidate handler across both platforms, which scrolls the merged region home", () => {
    const handler = ADVISOR_WORKSPACE_SOURCE.match(
      /const selectCandidate = useCallback\(\([\s\S]*?\n  \}, \[selectSymbolForReview\]\);/,
    )?.[0] ?? "";
    assert.ok(handler.length > 0, "expected to find selectCandidate");
    assert.match(handler, /selectSymbolForReview\(candidate\.symbol\);/);
    assert.match(handler, /mobileScrollRef\.current\?\.scrollTo\(\{ top: 0 \}\);/);
    // Both surfaces hand the same function to the same prop — the rail at ≥lg
    // and the merged results list below it.
    assert.equal(
      (ADVISOR_WORKSPACE_SOURCE.match(/onSelectCandidate=\{selectCandidate\}/g) ?? [])
        .length,
      2,
    );
  });

  it("CurrentTradesRail receives isActiveOnMobile so it can re-stamp its own freshness on the same transition (I2)", () => {
    // The MOBILE rail only — Q1-#31: the ≥lg call site passes false, since the
    // prop's whole job is the mobile Trades transition and a desktop rail has no
    // business re-stamping its freshness line for one.
    assert.match(
      ADVISOR_WORKSPACE_SOURCE,
      /<CurrentTradesRail\s+fixedFrame\s+isActiveOnMobile=\{mobileView === "trades"\}/,
    );
    assert.equal(
      (ADVISOR_WORKSPACE_SOURCE.match(/isActiveOnMobile=\{mobileView === "trades"\}/g) ??
        []).length,
      1,
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
//
// §19 retrofit, amendment 18: min-h-11 joins both pill geometries here
// (never present before Task 7) because the chip stops being purely
// informational the moment either state below is real — zero saved accounts
// still routes a tap to Profile, and one or more turns it into the switcher
// trigger. Spec §12's "no toggle" is what let the un-sized pill stand until
// now.
describe("BrokerChip renders the mock's .broker treatment (tokens.css:22-24)", () => {
  const BROKER_CHIP_SOURCE = readFileSync(
    "src/components/workspace/BrokerChip.tsx",
    "utf8",
  );

  it("is a hairline-bordered pill on sheet at the mock's geometry, not the .chip idiom", () => {
    assert.match(
      BROKER_CHIP_SOURCE,
      /className="inline-flex min-h-11 items-center gap-2 rounded-md border-\[1\.5px\] border-hairline bg-sheet px-3 py-\[7px\] text-\[13px\] font-bold text-ink"/,
    );
    assert.doesNotMatch(BROKER_CHIP_SOURCE, /className="chip\b/);
  });

  it("carries the mock's 8px buy-colored dot", () => {
    assert.match(
      BROKER_CHIP_SOURCE,
      /className="h-2 w-2 rounded-full bg-buy" aria-hidden="true"/,
    );
  });

  it("still names the broker in text with no saved account — the dot is decoration, not the label", () => {
    assert.match(BROKER_CHIP_SOURCE, />\s*E8 Markets\s*</);
  });

  // m-mobile-v3.html:43 compacts the same pill for the mobile masthead: "E8"
  // at 12px with 5px/9px padding. The accessible name stays "E8 Markets" in
  // both variants — the compaction is a space ruling, not a rename.
  it("offers the mobile masthead's compact variant at the mock's geometry", () => {
    assert.match(
      BROKER_CHIP_SOURCE,
      /className="inline-flex min-h-11 items-center gap-2 rounded-md border-\[1\.5px\] border-hairline bg-sheet px-\[9px\] py-\[5px\] text-xs font-bold text-ink"/,
    );
    assert.match(BROKER_CHIP_SOURCE, /aria-label="E8 Markets"/);
    assert.match(BROKER_CHIP_SOURCE, />\s*E8\s*</);
  });
});

describe("amendment 18 — the chip is the switcher, in the machinery the app already has", () => {
  const BROKER_CHIP_SOURCE = readFileSync(
    "src/components/workspace/BrokerChip.tsx",
    "utf8",
  );

  it("keeps today's informational form with no saved account", () => {
    assert.match(BROKER_CHIP_SOURCE, /accounts\.length === 0/);
    assert.match(BROKER_CHIP_SOURCE, />\s*E8 Markets\s*</);
    assert.match(BROKER_CHIP_SOURCE, /onOpenProfile/);
  });

  it("becomes a menu trigger once an account is saved", () => {
    assert.match(BROKER_CHIP_SOURCE, /aria-haspopup="menu"/);
    assert.match(BROKER_CHIP_SOURCE, /aria-expanded=\{open\}/);
  });

  it("uses the app's dual presentation: anchored at >=lg, the §17g sheet below", () => {
    const menu = readFileSync(
      "src/components/workspace/AccountSwitcherMenu.tsx",
      "utf8",
    );
    assert.match(menu, /useIsMobileViewport\(\)/);
    assert.match(menu, /createPortal\(/);
    assert.match(menu, /role="dialog"[\s\S]*aria-modal="true"/);
    assert.match(menu, /role="menu"/);
    assert.match(menu, /min-h-11/);
    assert.match(menu, />\s*Manage accounts\s*</);
  });

  it("renders only catalog vocabulary — no invented word reaches the label", () => {
    const menu = readFileSync(
      "src/components/workspace/AccountSwitcherMenu.tsx",
      "utf8",
    );
    for (const invented of ["Switch to", "Currently", "Selected", "Your account", "Live"]) {
      assert.ok(!menu.includes(invented), `${invented} is not catalog vocabulary`);
    }
  });

  // §17n: the chip stops being purely decorative once it is genuinely
  // tappable, so both states share MobileAccountMenu's own 44px-trigger
  // technique (App.tsx: className="flex h-11 w-11 ...", one element, sized
  // directly to the floor) rather than a wrapper div absorbing the height —
  // the simplest shape, and the one that keeps a single element per state,
  // matching the box-discipline table below.
  it("bakes the 44px floor into the trigger element itself, in both switcher pill geometries", () => {
    assert.match(
      BROKER_CHIP_SOURCE,
      /min-h-11 items-center gap-2 rounded-md border-\[1\.5px\] border-hairline bg-sheet px-3 py-\[7px\] text-\[13px\] font-bold uppercase/,
    );
    assert.match(
      BROKER_CHIP_SOURCE,
      /min-h-11 items-center gap-2 rounded-md border-\[1\.5px\] border-hairline bg-sheet px-\[9px\] py-\[5px\] text-xs font-bold uppercase/,
    );
  });

  // ALL CAPS is a render-time transform (App.tsx's ReloadNotice/.phosphor-pulse
  // technique — the §20j-pinned sentence renders mixed-case and .phosphor-pulse's
  // sibling `uppercase` class does the work) over byte-intact tokens, never a
  // JS string mutation — TASK 6 VERDICT.
  it("never calls .toUpperCase() on the label — the transform is CSS, not JS", () => {
    assert.doesNotMatch(BROKER_CHIP_SOURCE, /\.toUpperCase\(\)/);
    const menu = readFileSync(
      "src/components/workspace/AccountSwitcherMenu.tsx",
      "utf8",
    );
    assert.doesNotMatch(menu, /\.toUpperCase\(\)/);
    assert.match(menu, /uppercase/);
  });

  // Amendment 18: switching re-scopes the Desk live through the same
  // reactivity Task 5 already wired (activeAccountOf(profile), read plain in
  // SizeRow's own body — tests/deskComposition.test.ts pins that read). No
  // new subscription is needed because profile is the single source both
  // chip mounts already receive; this pins the one new thing Task 7 adds —
  // that both mounts route a real, non-swallowed activation rather than a
  // fire-and-forget call, the same guard Task 2b's ProfilePanel wiring
  // already applied to onActivateAccount.
  it("both chip mounts and Profile's own onActivateAccount share one guarded handler", () => {
    assert.match(
      APP_SOURCE,
      /const handleActivateAccount = \(id: string\) => \{\s*\n\s*profileState\.activateBrokerAccount\(id\)\.catch\(\(error\) => \{\s*\n\s*console\.error\("\[profile\] broker account save failed", error\);\s*\n\s*\}\);\s*\n\s*\};/,
    );
    assert.equal(
      (APP_SOURCE.match(/onSelect=\{handleActivateAccount\}/g) ?? []).length,
      2,
    );
    assert.match(APP_SOURCE, /onActivateAccount=\{handleActivateAccount\}/);
  });
});

// TASK 6 VERDICT (plan 2026-08-03, "docs: Task 6 VERDICT — piped everywhere,
// the (1) suffix, rename cap 14"): the label formula is ONE function so the
// trigger's own text and every row in the popup can never drift apart. These
// tests call it directly rather than re-deriving the string via regex,
// mirroring tests/scopeMenu.test.tsx's approach to ScopeMenu.tsx's own pure
// functions (no jsdom in this stack — see that file's header comment).
describe("labelAccounts — the owner's piped formula plus the space-(1) collision suffix (TASK 6 VERDICT)", () => {
  function buildAccount(overrides: Partial<BrokerAccount> = {}): BrokerAccount {
    return {
      accountSize: 100_000,
      brokerId: "e8",
      classification: "forex",
      drawdownTier: null,
      id: "acct-1",
      platform: "tradelocker",
      programLine: "pro_forex",
      riskPercent: 0.5,
      stage: "challenge",
      ...overrides,
    };
  }

  it("formula shape: broker token | classification label | K-form of size, piped", () => {
    const [entry] = labelAccounts([
      buildAccount({ id: "a", classification: "forex", accountSize: 100_000 }),
    ]);
    assert.equal(entry.label, "E8 | Forex | 100K");
  });

  it("keeps every classification's own byte-intact word, not the catalog's storage token", () => {
    assert.equal(
      labelAccounts([buildAccount({ id: "a", classification: "crypto", accountSize: 50_000 })])[0]
        .label,
      "E8 | Crypto | 50K",
    );
    assert.equal(
      labelAccounts([buildAccount({ id: "a", classification: "futures", accountSize: 25_000 })])[0]
        .label,
      "E8 | Futures | 25K",
    );
  });

  it("caps-at-render, tokens intact underneath: the function itself never produces ALL CAPS", () => {
    const [entry] = labelAccounts([buildAccount()]);
    assert.ok(entry.label.includes("Forex"), "expected the byte-intact classification word");
    assert.ok(!entry.label.includes("FOREX"), "the function must not pre-uppercase the label");
  });

  it("carries no suffix at all when no two accounts collide", () => {
    const accounts = [
      buildAccount({ id: "a", classification: "forex", accountSize: 100_000 }),
      buildAccount({ id: "b", classification: "futures", accountSize: 50_000 }),
      buildAccount({ id: "c", classification: "forex", accountSize: 25_000 }),
    ];
    assert.deepEqual(
      labelAccounts(accounts).map((entry) => entry.label),
      ["E8 | Forex | 100K", "E8 | Futures | 50K", "E8 | Forex | 25K"],
    );
  });

  it("suffixes only a colliding pair, with a single space then (1) — never the mockup's retired -1", () => {
    const accounts = [
      buildAccount({ id: "b-second", classification: "forex", accountSize: 100_000, programLine: "one" }),
      buildAccount({ id: "a-first", classification: "forex", accountSize: 100_000, programLine: "pro_forex" }),
    ];
    const byId = new Map(labelAccounts(accounts).map((entry) => [entry.account.id, entry.label]));
    assert.equal(byId.get("a-first"), "E8 | Forex | 100K");
    assert.equal(byId.get("b-second"), "E8 | Forex | 100K (1)");
  });

  it("extends a three-way collision as bare, (1), (2) — ordinals sorted by id", () => {
    const accounts = [
      buildAccount({ id: "3333", classification: "forex", accountSize: 100_000 }),
      buildAccount({ id: "1111", classification: "forex", accountSize: 100_000 }),
      buildAccount({ id: "2222", classification: "forex", accountSize: 100_000 }),
    ];
    const byId = new Map(labelAccounts(accounts).map((entry) => [entry.account.id, entry.label]));
    assert.equal(byId.get("1111"), "E8 | Forex | 100K");
    assert.equal(byId.get("2222"), "E8 | Forex | 100K (1)");
    assert.equal(byId.get("3333"), "E8 | Forex | 100K (2)");
  });

  it("assigns ordinals from the account SET, not from the caller's array order (deterministic, order-independent)", () => {
    const one = buildAccount({ id: "1111", classification: "forex", accountSize: 100_000 });
    const two = buildAccount({ id: "2222", classification: "forex", accountSize: 100_000 });
    const three = buildAccount({ id: "3333", classification: "forex", accountSize: 100_000 });

    const asLabeled = (list: BrokerAccount[]) =>
      labelAccounts(list)
        .map((entry) => [entry.account.id, entry.label] as const)
        .sort(([a], [b]) => a.localeCompare(b));

    assert.deepEqual(asLabeled([one, two, three]), asLabeled([three, one, two]));
    assert.deepEqual(asLabeled([one, two, three]), asLabeled([two, three, one]));
  });

  it("a rename is out of this task's scope — the formula never reads a name field", () => {
    // Task 7 implements the formula and the suffix machinery only (TASK 6
    // VERDICT: "the rename is a later task"). BrokerAccount carries no name/
    // nickname field yet, so there is nothing here for a future rename task
    // to override but the formula's own inputs.
    assert.deepEqual(Object.keys(buildAccount()).sort(), [
      "accountSize",
      "brokerId",
      "classification",
      "drawdownTier",
      "id",
      "platform",
      "programLine",
      "riskPercent",
      "stage",
    ]);
  });

  it("returns an empty list for an empty account set", () => {
    assert.deepEqual(labelAccounts([]), []);
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
// Comments are prose about the code, and several of these files deliberately
// name what they no longer render. Where a guard's subject is a live reference,
// it reads the source without them.
function withoutComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

function mobileOnlyClasses(source: string): string[] {
  return Array.from(source.matchAll(/\bmax-lg:[^\s"'`{}]+/g), (m) => m[0]);
}

// Wave 5 (spec §17e): the merged mobile Scan surface, m-scan-v3.html, is the
// mobile Desk. It supersedes both m-scan-v1's separate Scan tab and
// m-mobile-v3's separate Review tab, so this block pins its interior in both
// directions the way §16's review discipline demands: the mock's pinned/scroll
// split, its one verb, its head cluster — and the absence of the two-tab
// structure it replaced.
describe("the merged mobile Scan surface's interior (m-scan-v3.html, wave 5)", () => {
  const surface = ADVISOR_WORKSPACE_SOURCE.match(
    /data-testid="mobile-scan-surface"[\s\S]*?data-testid="mobile-scan-scroll"[\s\S]*?\n {8}<\/div>/,
  )?.[0] ?? "";

  it("extracted a non-empty block — a refactor that breaks this regex must fail loudly here, not silently pass every check below against an empty string", () => {
    assert.ok(surface.length > 0, "expected to find the merged Scan surface");
  });

  it("pins the controls, the head and the chart, and scrolls exactly one region under them", () => {
    // m-scan-v3.html:9,29,32: the surface is a fixed flex column; the pinned
    // block does not shrink, and the scroll region is the only thing in the app
    // below lg that scrolls on this surface. Since §17g the two class strings
    // are the shared ones every other mobile surface takes.
    assert.match(surface, /className=\{MOBILE_FRAME_PINNED\}/);
    assert.match(surface, /className=\{MOBILE_FRAME_SCROLL\}/);
    // The chart is pinned (inside the shrink-0 block), the ladder and the
    // results are not.
    const pinned = surface.slice(0, surface.indexOf("mobile-scan-scroll"));
    assert.match(pinned, /<MarketChart/);
    assert.match(pinned, /<ScopeMenu/);
    assert.doesNotMatch(pinned, /<RecommendationPanel/);
    assert.doesNotMatch(pinned, /<MarketScanResults/);
    // …and exactly one scroller: one region, and no overflow utility of its own
    // anywhere else on the surface.
    assert.equal(
      (surface.match(/className=\{MOBILE_FRAME_SCROLL\}/g) ?? []).length,
      1,
    );
    assert.doesNotMatch(surface, /overflow-y-auto|overflow-auto/);
  });

  it("carries the fixed tab bar's own clearance on the scrolling region, since this surface has no footer to carry it", () => {
    // §17n sized the clearance to the bar: 49px of bar (48px box + 1px border)
    // plus a 7px gap, plus the device's own safe-area inset, which the bar itself
    // also pads by. It was a flat pb-24 (96px) — 39px of dead scroll where the
    // inset is 0 and 5px of clearance where it is ~34px.
    assert.match(
      MOBILE_FRAME_SCROLL,
      /overflow-y-auto px-4 pb-\[calc\(3\.5rem_\+_env\(safe-area-inset-bottom\)\)\]/,
    );
    // App.tsx's fixed branch contributes no padding of its own — the surface
    // owns its gutters (m-scan-v3.html:29,32).
    assert.match(
      APP_SOURCE,
      /className=\{isMobileViewport[\s\S]{0,400}\? "motion-fade-in flex w-full min-h-0 flex-col overflow-hidden"/,
    );
    assert.match(
      APP_SOURCE,
      /return "grid h-\[100dvh\] grid-rows-\[auto_1fr\] overflow-hidden bg-paper text-ink";/,
    );
  });

  it("offers one verb and one door: mobile Scan is the same scanMarkets call the rail's button makes", () => {
    // §17m.1, "no other path, desktop or mobile": the scope decides WHAT this
    // Scan covers — one market or many — never which engine path runs it. The
    // mobile button sends the same scan_opportunities request the ≥lg rail
    // sends, so there is no second persistence path, no second origin value
    // and no second failure vocabulary for one user action.
    assert.match(surface, /onClick=\{\(\) => scanMarkets\(openScanSymbols\)\}/);
    assert.match(surface, /\n\s*Scan\n/);
    assert.equal((surface.match(/className="primary-button/g) ?? []).length, 1);
    // The single-market review path and everything that existed only to
    // service it are gone, not merely unused.
    assert.doesNotMatch(ADVISOR_WORKSPACE_SOURCE, /generateTradeSetup/);
    assert.doesNotMatch(ADVISOR_WORKSPACE_SOURCE, /scopeActionIsReview/);
    assert.doesNotMatch(ADVISOR_WORKSPACE_SOURCE, /runScopeAction/);
    assert.doesNotMatch(ADVISOR_WORKSPACE_SOURCE, /analyzerStatus/);
    assert.doesNotMatch(ADVISOR_WORKSPACE_SOURCE, /advisorNotice/);
    assert.doesNotMatch(ADVISOR_WORKSPACE_SOURCE, /function analyze\(/);
    // One rule for when Scan is available, and it is the rail's own rule.
    assert.match(
      ADVISOR_WORKSPACE_SOURCE,
      /const scanDisabled = scanStatus === "scanning" \|\| openScanSymbols\.length === 0;/,
    );
    assert.match(surface, /disabled=\{scanDisabled\}/);
    assert.match(
      MARKET_SCAN_PANEL_SOURCE,
      /disabled=\{status === "scanning" \|\| openScanSymbols\.length === 0\}/,
    );
  });

  it("draws the head as market · side tag · compact confidence, with §17's stamp on its own line", () => {
    // m-scan-v3.html:81-85. The market name is a label at the mock's 19px
    // display scale, not a second picker — the scope menu above is the picker.
    assert.match(
      surface,
      /<h2 className="min-w-0 truncate font-display text-\[19px\] font-bold tracking-\[-0\.02em\] text-ink">/,
    );
    // A heading element, because the scan rail's own eyebrow ("Markets" since
    // §17m.4) — this surface's only landmark before the merge, and clipped
    // rather than removed for that reason — is ≥lg-only now.
    assert.match(surface, /<\/h2>/);
    assert.match(surface, /\{setup\.side === "buy" \? "Buy" : "Sell"\} limit/);
    assert.match(surface, /<ConfidenceUnit\s+assetType=\{selectedAsset\.assetType\}\s+compact/);
    // The stamp comes from the same builder the ≥lg unit uses, so the two
    // grammars cannot drift (spec §17).
    assert.match(
      ADVISOR_WORKSPACE_SOURCE,
      /const confidenceMeta = setup\s*\? buildConfidenceMeta\(reviewedAt, setup\.expiresAt \?\? null\)/,
    );
    assert.match(surface, /\{confidenceMeta\}/);
  });

  it("keeps the Expand chart affordance on this surface, one overlay shared by both compositions", () => {
    assert.match(surface, /onExpand=\{\(\) => setChartExpanded\(true\)\}/);
    // Built once, rendered by both branches — never a second copy of the
    // overlay's JSX.
    assert.equal(
      (ADVISOR_WORKSPACE_SOURCE.match(/<ExpandedChartOverlay/g) ?? []).length,
      1,
    );
    assert.equal(
      (ADVISOR_WORKSPACE_SOURCE.match(/\{chartOverlay\}/g) ?? []).length,
      2,
    );
  });

  it("shares the chart-view control with the ≥lg stagehead rather than declaring a second select", () => {
    assert.equal(
      (ADVISOR_WORKSPACE_SOURCE.match(/aria-label="Chart view"/g) ?? []).length,
      1,
    );
    assert.equal(
      (ADVISOR_WORKSPACE_SOURCE.match(/<ChartViewSelect/g) ?? []).length,
      2,
    );
    assert.match(surface, /<ChartViewSelect/);
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

describe("the merged mobile Scan surface's ladder rows (m-scan-v3.html:34-37)", () => {
  it("renders each ladder value as one line — label, mono value, Copy — not the card m-mobile-v3 drew", () => {
    const row = LADDER_SOURCE.match(
      /className="flex min-h-11 min-w-0 items-baseline[^"]*"/,
    )?.[0] ?? "";
    assert.ok(row.length > 0, "expected to find the copy row's className");
    // The mock's `.copy`: a three-column grid at a 10px gap, hairline-separated,
    // at its own 2px inset inside the region's 16px gutter.
    assert.match(row, /max-lg:grid\b/);
    assert.match(row, /max-lg:grid-cols-\[1fr_auto_auto\]/);
    assert.match(row, /max-lg:gap-x-2\.5/);
    assert.match(row, /max-lg:px-0\.5/);
    assert.match(row, /max-lg:last:border-b\b/);
    // The card treatment is gone in both directions.
    assert.doesNotMatch(row, /max-lg:rounded-lg/);
    assert.doesNotMatch(row, /max-lg:bg-sheet/);
    assert.doesNotMatch(row, /max-lg:flex-wrap/);
    // The value/button wrapper still dissolves so both become cells of that
    // grid, which is how one DOM serves both platforms.
    assert.match(
      LADDER_SOURCE,
      /className="flex min-w-0 items-baseline gap-1 max-lg:contents"/,
    );
    // The mock's type: a 10px letterspaced label and a 15.5px mono value.
    assert.match(LADDER_SOURCE, /max-lg:text-\[10px\] max-lg:tracking-\[0\.07em\]/);
    assert.match(LADDER_SOURCE, /max-lg:text-\[15\.5px\]/);
    // Hairline-separated rows, so no gap between them below lg either.
    assert.match(LADDER_SOURCE, /className="grid">/);
  });

  it("labels the copy button below lg at the mock's quiet .cbtn treatment, keeping the icon-only ≥lg affordance", () => {
    const branches = LADDER_SOURCE.match(
      /className=\{copied\n\s*\? "([^"]*)"\n\s*: "([^"]*)"\}/,
    );
    assert.ok(branches, "expected the copy button's copied/idle classes");
    const [, copiedClasses, idleClasses] = branches;
    for (const classes of [copiedClasses, idleClasses]) {
      assert.match(classes, /^cpv-copy\b/);
      assert.match(classes, /max-lg:m-0/);
      assert.match(classes, /max-lg:rounded-md/);
      assert.match(classes, /max-lg:border max-lg:border-hairline/);
      assert.match(classes, /max-lg:bg-sheet/);
      assert.match(classes, /max-lg:text-\[11\.5px\]/);
      // m-scan-v3.html:37 draws a hairline button, not the accent-bordered one
      // m-mobile-v3 drew.
      assert.doesNotMatch(classes, /max-lg:border-\[1\.5px\]/);
      assert.doesNotMatch(classes, /max-lg:border-accent/);
    }
    // Only the copied state takes the buy tone; idle inherits .cpv-copy's muted.
    assert.match(copiedClasses, /max-lg:text-buy/);
    assert.doesNotMatch(idleClasses, /max-lg:text-buy/);
    // Wave-2C's clipboard behavior is untouched: the word is functional
    // labeling, mobile-only, and never displaces the aria-label every copy test
    // locates these buttons by.
    assert.match(
      LADDER_SOURCE,
      /<span className="lg:hidden">\s*\{copied \? "Copied" : "Copy"\}\s*<\/span>/,
    );
    assert.match(
      LADDER_SOURCE,
      /aria-label=\{copied \? `\$\{label\} copied` : `Copy \$\{label\}`\}/,
    );
  });

  it("flattens the sheet's own padding below lg — on the merged surface there is no sheet to pad inside of", () => {
    // Every state of the panel: the ladder column, the why column, and the two
    // single-column states (no-setup and nothing-passed). At ≥lg they keep the
    // mock's 20px inset. Four, not five, since §17m.1 deleted the fabricated
    // analysis-progress state.
    assert.equal((LADDER_SOURCE.match(/px-5 py-4/g) ?? []).length, 4);
    // The lookahead matters: the copy row's own 2px inset is `max-lg:px-0.5`,
    // which a \b-terminated pattern would count as another flattened container.
    assert.equal(
      (LADDER_SOURCE.match(/max-lg:px-0(?![.\d])/g) ?? []).length,
      4,
    );
  });

  it("condenses the why panel to one summary line plus a Why disclosure below lg (m-scan-v3.html:38)", () => {
    // Unchanged from wave 2C: the summary is the Market row's character and the
    // Record row's numbers — the same two sentences the rows carry, in the
    // mock's own order. No new copy is written for it.
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

  it("keeps the mock's five rows as the ≥lg rendering, hidden below lg only while the disclosure is closed", () => {
    assert.match(
      RECEIPT_SOURCE,
      /className=\{rowsShown\n\s*\? "grid min-w-0 gap-0\.5"\n\s*: "grid min-w-0 gap-0\.5 max-lg:hidden"\}/,
    );
    assert.match(
      RECEIPT_SOURCE,
      /const rowsShown = rowsOpen \|\| summary\.length === 0;/,
    );
    assert.match(RECEIPT_SOURCE, />\s*Why this setup\s*<\/h3>/);
  });

  it("keeps every mobile treatment inside a real max-lg: or lg: token on both files", () => {
    for (const source of [LADDER_SOURCE, RECEIPT_SOURCE]) {
      assert.doesNotMatch(source, /max-lg:\$\{/);
    }
    assert.ok(mobileOnlyClasses(LADDER_SOURCE).length > 0);
  });
});

describe("the merged surface's results list (m-scan-v3.html:40-45)", () => {
  it("shares one flat row treatment with the ≥lg rail — the mobile card is gone", () => {
    const branches = SCAN_RAIL_SOURCE.match(
      /className=\{selected\n\s*\? "([^"]*)"\n\s*: "([^"]*)"\}/,
    );
    assert.ok(branches, "expected to find the row's selected/unselected classes");
    const [, selectedClasses, unselectedClasses] = branches;
    for (const classes of [selectedClasses, unselectedClasses]) {
      assert.doesNotMatch(classes, /max-lg:rounded-lg/);
      assert.doesNotMatch(classes, /max-lg:border\b/);
      assert.doesNotMatch(classes, /max-lg:py-3/);
      // The mock's 2px inset inside the scroll region's own gutter.
      assert.match(classes, /max-lg:px-0\.5/);
    }
    // Selection is the accent inset edge, and below lg the mock gives its text
    // 10px back so it clears that edge (m-scan-v3.html:44).
    assert.match(
      selectedClasses,
      /shadow-\[inset_3px_0_0_var\(--color-accent\)\]/,
    );
    assert.match(selectedClasses, /max-lg:pl-2\.5/);
    assert.doesNotMatch(unselectedClasses, /max-lg:bg-sheet/);
    // The ticker keeps the desktop row's own size — the 15px override belonged
    // to the retired card.
    assert.match(
      SCAN_RAIL_SOURCE,
      /className="block truncate text-sm font-bold text-ink"/,
    );
  });

  it("lifts the rail's 404px scroller below lg, where the surface's own region is the only scroll", () => {
    assert.match(
      SCAN_RAIL_SOURCE,
      /className="scrolly mt-2 max-h-\[404px\] overflow-y-auto max-lg:max-h-none max-lg:overflow-visible"/,
    );
    // The card-stacking grid went with the cards.
    assert.doesNotMatch(SCAN_RAIL_SOURCE, /max-lg:gap-2\b/);
  });

  it("leaves the ≥lg rail's own control row free of mobile treatments — it renders at one width now", () => {
    const controlRow = SCAN_RAIL_SOURCE.match(
      /<div className="flex flex-wrap items-baseline justify-between gap-2">[\s\S]*?<\/div>\n\n/,
    )?.[0] ?? "";
    assert.ok(controlRow.length > 0, "expected to find the rail's control row");
    assert.doesNotMatch(controlRow, /max-lg:/);
  });

  it("keeps every mobile treatment inside a real max-lg: token, so the ≥lg cascade is untouched by construction", () => {
    assert.ok(
      mobileOnlyClasses(SCAN_RAIL_SOURCE).length > 0,
      "expected the shared result rows to carry mobile-only utilities",
    );
    assert.doesNotMatch(SCAN_RAIL_SOURCE, /max-lg:\$\{/);
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
      /<h3 className="eyebrow max-lg:font-display max-lg:text-\[19px\] max-lg:font-bold max-lg:normal-case max-lg:tracking-\[-0\.02em\] max-lg:text-ink">\s*Current trades\s*<\/h3>/,
    );
  });

  it("leaves the freshness stamp and the row that carries both exactly as the mobile mock draws them", () => {
    // `.phead` and `.rrhead` are the same shape in both mocks — heading
    // opposite the stamp on one baseline row — so the container and the stamp
    // are shared. Spec §17c's ≥lg alignment fix rides behind `lg:` prefixes
    // for exactly that reason: below lg the row keeps baseline alignment and
    // its natural height, where a 19px display head sits against a 12px stamp.
    const head = TRADES_RAIL_SOURCE.match(
      /<div className="(flex flex-wrap items-baseline[^"]*)">/,
    )?.[1] ?? "";
    assert.ok(head.length > 0, "expected to find the trades rail's head row");
    assert.equal(
      head.split(" ").filter((token) => !token.startsWith("lg:")).join(" "),
      "flex flex-wrap items-baseline justify-between gap-2",
    );
    assert.match(TRADES_RAIL_SOURCE, /as of \{formatClockTime\(lastRefreshedAt\)\} ·/);
  });
});

// ---------------------------------------------------------------------------
// Spec §17g (owner ruling, binding): "No mobile view scrolls as a whole screen.
// Every <lg surface is a fixed-viewport frame (the merged Scan screen's
// pattern): chrome pinned, and the necessary list/content region scrolls within
// itself — flat, no box chrome … The footer exists on mobile ONLY inside the
// Profile view, reduced to the colophon … Desktop's §17c footer standard is
// unchanged at ≥lg."
//
// Both directions, per §16's standing review discipline: the frames present on
// every surface, and the two things §17g kills — a footer below lg, and a
// document that scrolls as a page — absent. Source-pinned for the same
// no-jsdom reason as the rest of this file, except the three shared class
// strings, which are imported so their VALUES are the subject rather than a
// regex's idea of them.
const MOBILE_SURFACES: Array<{ file: string; mobileRoot: string }> = [
  // Insights, Guide, Donate and Profile each grew the same JS branch
  // AdvisorWorkspace has had since §17e: one composition below lg, the frozen
  // ≥lg one above it. A CSS toggle cannot express this — the pinned/scroll
  // split needs wrapper boxes no restyling of the desktop tree produces.
  {
    file: "src/components/workspace/HistoryPanel.tsx",
    mobileRoot: 'data-testid="mobile-insights-scroll"',
  },
  {
    file: "src/components/workspace/ProfilePanel.tsx",
    mobileRoot: 'data-testid="mobile-profile-scroll"',
  },
  {
    file: "src/components/workspace/GuidePanel.tsx",
    mobileRoot: 'data-testid="mobile-guide-scroll"',
  },
  {
    file: "src/components/donations/DonatePanel.tsx",
    mobileRoot: 'data-testid="mobile-donate-scroll"',
  },
  {
    file: "src/components/workspace/CurrentTradesRail.tsx",
    mobileRoot: 'data-testid="mobile-trades-scroll"',
  },
];

describe("§17g — every <lg surface is a fixed-viewport frame", () => {
  it("shares one frame idiom: a fixed flex column, a pinned block, one flat scroll region", () => {
    // The merged Scan surface's own three strings (m-scan-v3.html:9,29,32),
    // lifted into one module so five surfaces cannot drift into five frames.
    assert.equal(MOBILE_FRAME, "flex min-h-0 min-w-0 flex-1 flex-col");
    assert.equal(MOBILE_FRAME_PINNED, "shrink-0 px-4 pt-3");
    // The tab-bar reserve is §17n's, sized to the bar's real composition rather
    // than to a round number (tests/mobileMinimalism.test.ts carries the measured
    // before/after); the rest of the string is m-scan-v3.html:32's, unchanged.
    assert.equal(
      MOBILE_FRAME_SCROLL,
      "scrolly min-h-0 flex-1 overflow-y-auto px-4 pb-[calc(3.5rem_+_env(safe-area-inset-bottom))]",
    );
  });

  it("keeps the scroll region flat — §17c's box-on-box rule governs scroll regions too", () => {
    // The one string every mobile scroll region takes: no border, no ring, no
    // fill, no radius, no shadow. tests/boxDiscipline.test.ts owns the same rule
    // for every .tsx literal; this pins it for the shared string those literals
    // now defer to (a .ts module that file's own walk does not read).
    for (const idiom of [/\bborder/, /\bring/, /\boutline/, /\bbg-/, /rounded/, /shadow/]) {
      assert.doesNotMatch(MOBILE_FRAME_SCROLL, idiom);
      assert.doesNotMatch(MOBILE_FRAME_PINNED, idiom);
      assert.doesNotMatch(MOBILE_FRAME, idiom);
    }
    // Thin scrollbars come from the kit's own .scrolly, not a per-surface
    // invention (src/styles/index.css).
    assert.match(MOBILE_FRAME_SCROLL, /\bscrolly\b/);
    assert.match(
      readFileSync("src/styles/index.css", "utf8"),
      /\.scrolly \{\s*scrollbar-width: thin;/,
    );
  });

  it("puts every surface below lg inside that frame — the fixed shell is no longer the Desk's alone", () => {
    // §17e gated the fixed shell on the Desk's Scan sub-view; §17g generalizes
    // it to the viewport, so the retired condition must be gone in both
    // directions rather than merely widened.
    assert.doesNotMatch(APP_SOURCE, /isFixedMobileDesk/);
    // §17i put the footer inside the frame on every ≥lg surface too, so the shell's
    // shape no longer depends on which tab is showing — only on the viewport.
    assert.match(
      APP_SOURCE,
      /className=\{mainShellClassName\(isMobileViewport\)\}/,
    );
    const shell = APP_SOURCE.match(/function mainShellClassName\([\s\S]*?\n}\n/)
      ?.[0] ?? "";
    assert.ok(shell.length > 0, "expected to find mainShellClassName");
    assert.match(
      shell,
      /if \(isMobileViewport\) \{\s*return "grid h-\[100dvh\] grid-rows-\[auto_1fr\] overflow-hidden bg-paper text-ink";/,
    );
  });

  it("gives each surface a pinned block and exactly one scroll region, from the shared strings", () => {
    for (const { file, mobileRoot } of MOBILE_SURFACES) {
      const source = readFileSync(file, "utf8");
      // The import itself, by name: the point of the shared module is that no
      // surface writes these three strings out again, so a file that imports
      // only some of them has half a frame of its own.
      const importBlock =
        source.match(/import \{[^}]*\} from "[^"]*\/mobileFrame";/)?.[0] ?? "";
      assert.ok(
        importBlock.length > 0,
        `${file} must import the shared frame strings, not write its own`,
      );
      for (const name of ["MOBILE_FRAME", "MOBILE_FRAME_PINNED", "MOBILE_FRAME_SCROLL"]) {
        assert.ok(
          importBlock.includes(name),
          `${file} imports no ${name}`,
        );
        assert.ok(
          source.includes(`className={${name}}`),
          `${file} imports ${name} without using it as a className`,
        );
      }
      assert.ok(
        source.includes(mobileRoot),
        `${file} must name its scroll region ${mobileRoot} for the e2e suite`,
      );
      assert.equal(
        (source.match(/className=\{MOBILE_FRAME_SCROLL\}/g) ?? []).length,
        1,
        `${file} must scroll exactly one region`,
      );
      // And nothing else in the file scrolls: no second overflow container
      // smuggled in beside the frame's own. (Insights' horizontal table scroller
      // is an axis rather than a second region — asserted for that file below.)
      assert.doesNotMatch(
        source,
        /\boverflow-y-auto\b|\boverflow-auto\b/,
        `${file} declares a vertical scroller of its own`,
      );
    }
  });

  it("scrolls the Insights ledger both ways without a second region — the table is 720px wide", () => {
    const history = readFileSync(
      "src/components/workspace/HistoryPanel.tsx",
      "utf8",
    );
    // The x-scroller is the same one the ≥lg table frame already carried, shared
    // by both compositions rather than duplicated for mobile.
    assert.equal((history.match(/overflow-x-auto/g) ?? []).length, 1);
    assert.match(history, /min-w-\[720px\]/);
  });

  it("leaves the ≥lg composition of every reframed surface exactly as it renders today", () => {
    // The coordinator's hard constraint for this wave: at ≥lg nothing moves.
    // Each surface's desktop root is pinned here as a whole literal, so a mobile
    // frame that reached the shared tree fails on the spot instead of in a
    // built-CSS diff.
    for (
      const [file, desktopRoot] of [
        [
          "src/components/workspace/HistoryPanel.tsx",
          'className="mx-auto grid w-full max-w-[1180px] gap-5"',
        ],
        [
          "src/components/workspace/ProfilePanel.tsx",
          'className="mx-auto w-[880px] max-w-full"',
        ],
        [
          "src/components/workspace/GuidePanel.tsx",
          'className="mx-auto grid max-w-[1020px] gap-9 lg:grid-cols-[230px_1fr] lg:items-start"',
        ],
        [
          "src/components/donations/DonatePanel.tsx",
          'className="mx-auto grid w-full max-w-[620px] gap-4"',
        ],
        [
          "src/components/workspace/CurrentTradesRail.tsx",
          'className="min-w-0" data-testid="current-trades-rail"',
        ],
      ] as const
    ) {
      assert.ok(
        readFileSync(file, "utf8").includes(desktopRoot),
        `${file} must keep its ≥lg root: ${desktopRoot}`,
      );
    }
  });

  it("kills the footer below lg — it is a ≥lg component now (§17g)", () => {
    // Presence, not visibility: the element leaves the tree entirely below lg,
    // so nothing has to reserve room for it inside a fixed frame.
    assert.match(APP_SOURCE, /\{isMobileViewport \? null : \(\s*<AppFooter/);
    // And the ≥lg half of the same ruling: the component itself is untouched,
    // so every link and the colophon still render at ≥lg exactly as §17c set
    // them (tests/appFooter.test.ts owns that composition).
    const footer = readFileSync("src/components/AppFooter.tsx", "utf8");
    assert.match(footer, /A Windward Line production/);
    assert.match(footer, /<LegalLinks current=\{currentDocument\} onOpen=\{onOpenDocument\} \/>/);
    assert.match(footer, /aria-label="Support"/);
  });

  it("kills whole-page mobile scroll: no surface below lg is a min-height scrolling page", () => {
    const shell = APP_SOURCE.match(/function mainShellClassName\([\s\S]*?\n}\n/)
      ?.[0] ?? "";
    const mobileBranch = shell.match(/if \(isMobileViewport\) \{[\s\S]*?\n  \}/)
      ?.[0] ?? "";
    assert.ok(mobileBranch.length > 0, "expected the mobile shell branch");
    assert.doesNotMatch(mobileBranch, /min-h-screen/);
    assert.match(mobileBranch, /overflow-hidden/);
    // The two scrolling wrapper branches are reached at ≥lg only now, and both
    // keep every utility the frozen desktop cascade is built from.
    const wrapperBranches = APP_SOURCE.match(
      /\? "motion-fade-in mx-auto w-full max-w-7xl [^"]*"\n\s*: "scrolly motion-fade-in mx-auto max-w-7xl [^"]*"/,
    )?.[0] ?? "";
    assert.ok(wrapperBranches.length > 0, "expected the ≥lg wrapper branches");
    for (const branch of wrapperBranches.match(/"[^"]*"/g) ?? []) {
      assert.match(branch, /\bsm:pt-5\b/, `wrapper branch ${branch}`);
      assert.match(branch, /\blg:pb-5\b/, `wrapper branch ${branch}`);
    }
  });
});

describe("§17g — the account menu carries the legal trio", () => {
  const menuBlock = APP_SOURCE.match(
    /function MobileAccountMenu[\s\S]*?\n}\n/,
  )?.[0] ?? "";

  it("lists Risk disclaimer, Privacy and Terms from the one source the footer reads", () => {
    // Not restated here: the labels and hrefs come out of LegalLinks.tsx's own
    // array, so the menu block and the ≥lg footer can never list different
    // documents.
    // The one source is src/lib/legalDocuments.ts since §17o tier 2 — the module the
    // published files under public/legal/ are held to in both directions — and both
    // homes read it, so the menu and the ≥lg footer can never list different
    // documents. The href helper is shared too, so neither builds its own.
    assert.match(
      APP_SOURCE,
      /import \{\s*legalDocumentHref,\s*openInFrame,\s*\} from "\.\/components\/legal\/LegalLinks";/,
    );
    assert.match(menuBlock, /\{LEGAL_SLUGS\.map\(\(slug\) => \(/);
    assert.match(menuBlock, /href=\{legalDocumentHref\(slug\)\}/);
    assert.deepEqual(LEGAL_SLUGS.map((slug) => legalDocument(slug).title), [
      "Risk disclaimer",
      "Privacy",
      "Terms",
    ]);
  });

  it("keeps the menu's aria contract: menuitem per link, inside a named group", () => {
    // role="menu" only admits menuitem/group/separator children, so a <nav>
    // landmark here would be an invalid child (and a second "Legal" landmark
    // that exists only while the menu is open). A role="group" with its own
    // label is the one shape that groups the trio without breaking either.
    assert.match(
      menuBlock,
      /aria-label="Legal"[\s\S]{0,200}role="group"/,
    );
    // Scoped to the trio's own group rather than measured as a distance from the
    // first menuitem in the menu — that one is the Help mailto above it.
    const legalGroup = menuBlock.match(/aria-label="Legal"[\s\S]*?<\/div>/)?.[0] ?? "";
    assert.ok(legalGroup.length > 0, "expected the menu's legal group");
    assert.match(legalGroup, /role="menuitem"/);
    assert.match(legalGroup, /legalDocumentBySlug\(slug\)\.title/);
    // §17o tier 2 took the new tab off these three: the document opens in the frame,
    // so the rel that paired with it is gone too (tests/linkDoctrine.test.ts pins the
    // whole allowlist in both directions). The href stays real — openInFrame answers
    // only a plain click — and the document being read is marked rather than offered.
    assert.doesNotMatch(menuBlock, /target="_blank"/);
    assert.doesNotMatch(menuBlock, /rel="noopener noreferrer"/);
    assert.match(menuBlock, /openInFrame\(event, slug, onOpenDocument\)/);
    assert.match(menuBlock, /aria-current=\{currentDocument === slug \? "page" : undefined\}/);
    // Every dismissal path still returns focus to the trigger, links included.
    assert.match(
      menuBlock,
      /\{LEGAL_SLUGS\.map[\s\S]{0,900}closeAndFocusTrigger\(\);/,
    );
  });

  it("holds a 44px target for each link while staying the compact block §17g asks for", () => {
    const link = menuBlock.match(
      /className="(inline-flex min-h-11[^"]*)"\n\s*href=\{legalDocumentHref\(slug\)\}/,
    )?.[1] ?? "";
    assert.ok(link.length > 0, "expected the legal links' own className");
    assert.match(link, /\bmin-h-11\b/);
    // The footer's own furniture for these three (LegalLinks.tsx): 12px
    // semibold muted, hover to ink. Same treatment, no new look.
    assert.match(
      menuBlock,
      /aria-label="Legal"[\s\S]{0,200}text-xs font-semibold text-ink-muted/,
    );
    assert.match(link, /hover:text-ink/);
  });

  it("lists each action exactly once — Help and Donate stay menu items, and are not repeated in the block", () => {
    // §17g's link set is (Help · Donate · legal trio); the menu already carried
    // the first two before this wave, so only the trio joins it.
    assert.equal((menuBlock.match(/label="Donate"/g) ?? []).length, 1);
    assert.equal((menuBlock.match(/>\s*Help\s*</g) ?? []).length, 1);
    // One rendered mailto, counted where it is rendered rather than by proximity:
    // the prop is named three times legitimately (the parameter, its type, the
    // href), and a window over the source counted those.
    assert.equal((menuBlock.match(/href=\{supportMailto\}/g) ?? []).length, 1);
  });
});

describe("§17g — Profile ends with the colophon below lg, and only there", () => {
  const profile = readFileSync(
    "src/components/workspace/ProfilePanel.tsx",
    "utf8",
  );

  it("renders the colophon once, inside the <lg branch, in the footer's own treatment", () => {
    // The class, not the word: this file's own comments name .colophon while
    // explaining why the line is here, and prose is not a second colophon. The
    // §17n top-pad utility rides on the same attribute, so the count matches the
    // attribute rather than the bare class.
    assert.equal(
      (profile.match(/className="colophon(?: [^"]*)?"/g) ?? []).length,
      1,
    );
    assert.match(profile, /className="colophon max-lg:pt-5"/);
    // §17k made the line a link inside that <p> (tests/colophon.test.ts pins the
    // link itself); what this file owns is that the treatment is the footer's.
    assert.match(
      profile,
      /className="colophon max-lg:pt-5">\s*<a\n[\s\S]*?>\s*A Windward Line production/,
    );
    // Inside the mobile scroll region, after the rows: it ends the view.
    assert.match(
      profile,
      /data-testid="mobile-profile-scroll"[\s\S]*?className="colophon[^"]*"/,
    );
  });

  it("adds no link row with it — the trio lives in the account menu now", () => {
    assert.doesNotMatch(profile, /LegalLinks/);
    assert.doesNotMatch(profile, /Risk disclaimer/);
  });
});

describe("mobile chrome interiors (m-mobile-v3.html + menu mock, fix wave 2C)", () => {
  const menuBlock = APP_SOURCE.match(
    /function MobileAccountMenu[\s\S]*?\n}\n/,
  )?.[0] ?? "";

  // Spec §17i: "The mobile avatar trigger renders mark A (not the account
  // initial); 44px target and accessible name unchanged." The mock's
  // initial-in-circle (m-mobile-v3.html:44, menu mock :33) is superseded, and its
  // circle goes with it: mark A arrives with a container of its own — a
  // rounded-square tile on sheet with a hairline edge — so the circle would be a
  // perimeter inside a perimeter, which is §17c's box-on-box. Both directions, per
  // §16's review discipline.
  it("draws the account trigger as mark A, and keeps the 44px target it had (§17i)", () => {
    assert.match(
      menuBlock,
      /className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink transition hover:bg-accent\/10"/,
    );
    // The mark is the face; the ✕ still says what tapping the open trigger does.
    assert.match(
      menuBlock,
      /\{open\s*\n?\s*\? <X className="h-5 w-5" aria-hidden="true" \/>\s*\n?\s*: <LevelflowMark className="h-8 w-8" \/>\}/,
    );
    assert.match(
      APP_SOURCE,
      /import \{ LevelflowMark \} from "\.\/components\/LevelflowMark";/,
    );
    // The initial's whole plumbing is gone, not merely unrendered: the prop, its
    // type, the derivation off the session, and the icon that stood in when a
    // session carried no email.
    // Read without comments: this control's own comment quotes the ruling, which
    // names the thing it replaced, and documentation of a removal is not the thing.
    assert.doesNotMatch(withoutComments(menuBlock), /\binitial\b/);
    assert.doesNotMatch(APP_SOURCE, /accountInitial/);
    assert.doesNotMatch(APP_SOURCE, /CircleUser/);
    // And the mock's circle chrome with it — one perimeter on this control, drawn
    // by the mark (tests/boxDiscipline.test.ts owns the box inventory).
    assert.doesNotMatch(menuBlock, /border-\[1\.5px\] border-hairline bg-sheet/);
  });

  it("keeps the account menu's aria, role and focus contracts byte-intact through the avatar change", () => {
    assert.match(menuBlock, /aria-expanded=\{open\}/);
    assert.match(menuBlock, /aria-haspopup="menu"/);
    assert.match(menuBlock, /aria-label="Account menu"/);
    assert.match(menuBlock, /role="menu"/);
    assert.match(menuBlock, /ref=\{triggerRef\}/);
  });

  it("sets the bottom-tab labels in the mock's uppercase letterspaced type (m-mobile-v3.html:32)", () => {
    // 10.5px/700/uppercase at .1em tracking — what the assertion below actually
    // pins (M8: this comment used to say .06em, which is the mock's own value at
    // m-mobile-v3.html:32, not the app's). The shipped value has stood since §17
    // merged the mobile Desk, with no recorded ruling either way; the comment
    // states the pin rather than a number the pin contradicts, and the deviation
    // is the owner's to settle. No breakpoint guard needed or wanted: the whole
    // nav is `lg:hidden`, so these are mobile rules already.
    assert.match(
      APP_SOURCE,
      /className=\{`flex min-h-12 flex-col items-center justify-center gap-0\.5 text-\[10\.5px\] font-bold uppercase tracking-\[0\.1em\] \$\{/,
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
    // filter the Trades tab itself renders — over railSetups, the rail's own
    // population (the window plus hydrated beyond-window actives, spec §8),
    // so the badge and the tab count the same trades. No "needs action"
    // semantic is invented — the mock's caution fill is a color, not a new
    // claim.
    assert.match(
      APP_SOURCE,
      /const tradeBadgeCount = useMemo\(\s*\n?\s*\(\) => currentTradeBadgeCount\(setupState\.railSetups, new Date\(\)\),/,
    );
    assert.match(APP_SOURCE, /tradeBadgeCount=\{tradeBadgeCount\}/);
    assert.match(APP_SOURCE, /item\.value === "trades" && tradeBadgeCount > 0/);
    // The mock's own #fff would collapse on the dark theme's gold caution
    // (~1.9:1); text-paper re-values with the fill, per contrast.test.ts.
    assert.doesNotMatch(APP_SOURCE, /bg-caution[^"]*text-white/);
  });
});
