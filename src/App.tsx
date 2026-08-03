import type { ReactNode } from "react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import {
  BookOpen,
  Gift,
  History,
  ListChecks,
  Loader2,
  LogOut,
  Mail,
  Radar,
  UserRound,
  X,
} from "lucide-react";
import { AppFooter } from "./components/AppFooter";
import { LevelflowMark } from "./components/LevelflowMark";
import {
  legalDocumentHref,
  openInFrame,
} from "./components/legal/LegalLinks";
import { LegalDocumentPanel } from "./components/legal/LegalDocumentPanel";
import {
  isLegalSlug,
  LEGAL_SLUGS,
  legalDocument as legalDocumentBySlug,
  type LegalSlug,
} from "./lib/legalDocuments";
import {
  pushSurface,
  readSurfaceState,
  sameSurface,
  type Surface,
} from "./lib/surfaceHistory";
import { AuthScreen } from "./components/auth/AuthScreen";
import { ParkingScreen } from "./components/auth/ParkingScreen";
import { clearDonateRequest, donateRequested } from "./lib/donateEntry";
import { PARKING_GATE, parkingBypassActive } from "./lib/parkingGate";
import { GuidePanel } from "./components/workspace/GuidePanel";
import { HistoryPanel } from "./components/workspace/HistoryPanel";
import {
  AdvisorWorkspace,
  type DeskMobileView,
} from "./components/workspace/AdvisorWorkspace";
import { BrokerChip } from "./components/workspace/BrokerChip";
import { currentTradeBadgeCount } from "./components/workspace/CurrentTradesRail";
import { ProfilePanel } from "./components/workspace/ProfilePanel";
import { ThemeToggle } from "./components/workspace/ThemeToggle";
import {
  WorkspaceNavContext,
  type GuideAnchor,
  type WorkspaceNav,
} from "./components/workspace/WorkspaceNav";
import { DonatePanel } from "./components/donations/DonatePanel";
import { useAuthSession } from "./hooks/useAuthSession";
import { useIsMobileViewport } from "./hooks/useMobileViewport";
import { useTradeSetups } from "./hooks/useTradeSetups";
import { useUserProfile } from "./hooks/useUserProfile";
import {
  buildDefaultProfile,
  type ThemeMode,
} from "./lib/profile";
import { supabase } from "./lib/supabase";
import { SUPPORT_MAILTO } from "./lib/support";
import type { TradeSetupRow } from "./lib/tradeAnalyzer";

// "legal" arrived with §17o tier 2: the three documents Levelflow publishes are
// its own writing, so reading one is a surface of the app rather than a new tab
// pointed at a file. Which document is a second piece of state (legalDocument
// below), because one tab holds all three.
type AppTab = "advisor" | "history" | "guide" | "profile" | "donate" | "legal";
// The three bottom-tab-bar destinations (spec §17e). Two of them ("scan" |
// "trades") are sub-views of the single "advisor" AppTab — see deskMobileView
// below — so the tab bar's own selection model is a distinct, slightly wider
// union from AppTab rather than a one-to-one mirror of it. Profile and Guide
// stay in the avatar menu, and the old "Review" tab is gone: its surface merged
// into "scan" (m-scan-v3.html).
type MobileTab = "scan" | "trades" | "insights";

// Text only: spec §16 killed icon-chip nav on desktop, and the masthead
// renders {tab.label} alone. The mobile tab bar keeps its own separate icon
// set (MOBILE_TAB_ITEMS) — these four were built on every load and discarded.
const TABS: Array<{ label: string; value: AppTab }> = [
  { label: "Desk", value: "advisor" },
  { label: "Insights", value: "history" },
  { label: "Guide", value: "guide" },
  { label: "Profile", value: "profile" },
];
// What the frame's scrolling region is called, per surface. §17i made that
// region a tab stop (see regionScrolls below), and a tab stop with no
// accessible name announces as an unnamed region — so each surface names it the
// way the surface names itself. Written out rather than derived from TABS
// because Donate has no masthead tab to derive from; tests/appFrame.test.ts
// pins the two lists against each other so they cannot drift apart.
const REGION_LABELS: Record<AppTab, string> = {
  advisor: "Desk",
  donate: "Donate",
  guide: "Guide",
  history: "Insights",
  // The name the link row and the account menu's group already announce
  // themselves with (LegalLinks' own nav landmark, and MobileAccountMenu's
  // role="group" below). The region says which set of documents it holds; the
  // surface's h1 says which one of them is open, the way every other surface here
  // names itself once (§17f: no second word invented for the same thing).
  legal: "Legal",
  profile: "Profile",
};
// Whether a string off a history state is one of this build's tabs. REGION_LABELS
// is the tab list itself — tests/appFrame.test.ts pins its keys against the AppTab
// union — so membership in it is the check, with no second list to keep in step.
function isAppTab(value: string): value is AppTab {
  return value in REGION_LABELS;
}

const PERSISTED_TABS = new Set<AppTab>([
  "advisor",
  "history",
  "guide",
  "profile",
]);
const LAST_TAB_STORAGE_KEY = "levelflow-last-tab";

function getInitialAppTab(): AppTab {
  if (typeof window === "undefined") {
    return "advisor";
  }

  // The satellite pages ask for this surface by URL — `<a href="/?donate">Donate</a>`
  // is in the footer of all five (the three legal documents, the parking page, and
  // 404) and in the React parking screen's own footer — and until now only the
  // sign-in screen answered, so a signed-in reader who tapped it landed on
  // whatever tab they had last used. It is read here, ahead of that memory,
  // because it is a request made now rather than a record of where they were; and
  // it never becomes the memory itself, since "donate" is absent from
  // PERSISTED_TABS above. The predicate is shared with AuthScreen's own reading of
  // the same ask (src/lib/donateEntry.ts), so the two surfaces cannot drift.
  if (donateRequested()) {
    return "donate";
  }

  const stored = window.localStorage.getItem(LAST_TAB_STORAGE_KEY);
  return stored && PERSISTED_TABS.has(stored as AppTab)
    ? stored as AppTab
    : "advisor";
}

export default function App() {
  const theme = useThemePreference();
  const { session, loading } = useAuthSession();
  // Read here with the rest of the hooks, used far below: the pre-auth returns
  // sit between the two, and a hook after an early return is a hook that runs
  // in a different order on different renders.
  const isMobileViewport = useIsMobileViewport();
  const [activeTab, setActiveTab] = useState<AppTab>(() => getInitialAppTab());
  const [guideAnchor, setGuideAnchor] = useState<GuideAnchor | null>(null);
  // A stored setup another surface asked the Desk to reopen (the Insights ledger's
  // rows, the Current trades rail's cards), plus a nonce so asking twice in a row
  // still re-applies. The whole row travels, not its symbol: the stage restores
  // the stored levels from it rather than reselecting a market and showing an
  // empty ladder (owner findings 2 and 3, 2026-08-02).
  const [advisorRequest, setAdvisorRequest] = useState<{ setup: TradeSetupRow; token: number } | null>(null);
  // The mobile tab bar's own sub-selection within the Desk (spec §17e: Scan /
  // Trades). Kept separate from activeTab rather than folded into it: both map
  // to the same "advisor" AppTab, so AdvisorWorkspace stays mounted (and its
  // symbol/scanResult/analysisState/clockNow state intact) while the bar flips
  // between them — remounting on every tap would be a much worse mobile
  // experience than desktop's "just look at another column".
  const [deskMobileView, setDeskMobileView] = useState<DeskMobileView>("scan");
  // Which of the three published documents the "legal" tab is showing (§17o tier
  // 2). Null on every other tab, which the one navigation funnel below guarantees.
  const [legalDocument, setLegalDocument] = useState<LegalSlug | null>(null);

  // §17o tier 1, and the reason these three setters have exactly one caller each:
  // "in-app destinations … are reached through the app's own navigation", and every
  // one of those arrivals owes a history entry. Fourteen call sites each setting
  // their own state is fourteen chances to forget one, so this is the only door.
  //
  // A surface is the three coordinates src/lib/surfaceHistory.ts names — tab, the
  // Desk's mobile sub-view, and the open document — so Back walks the path the
  // reader actually took, the mobile tab bar's Scan/Trades included.
  const currentSurface: Surface = {
    tab: activeTab,
    deskView: deskMobileView,
    document: legalDocument,
  };
  // The surface the entry load opened on. That load pushes nothing (§17o: "The
  // entry load pushes nothing"), so its history entry carries no surface of ours —
  // and this is what Back onto that entry restores. A ref, not state: it is read
  // inside an event handler and must never re-run a render or re-subscribe.
  const entrySurface = useRef(currentSurface);
  // What the frame's scrolling region is, so a history move can hand focus
  // somewhere deterministic (see applyPoppedSurface), and whether the commit now
  // landing is one of those moves.
  const contentRegion = useRef<HTMLDivElement>(null);
  const restoreFocus = useRef(false);

  // The one place a surface becomes state, so the three setters have one caller
  // each and a fourth coordinate added later cannot be applied on one path and
  // forgotten on the other. Every field is narrowed rather than asserted: a popped
  // state can be older than the build reading it, or belong to another writer on
  // the origin, and an unrecognised tab would otherwise render a frame with nothing
  // in it. REGION_LABELS is the tab list itself (tests/appFrame.test.ts pins its
  // keys against the union), so membership in it IS the check.
  function applySurface(surface: Surface) {
    setActiveTab(isAppTab(surface.tab) ? surface.tab : "advisor");
    setDeskMobileView(surface.deskView === "trades" ? "trades" : "scan");
    setLegalDocument(isLegalSlug(surface.document) ? surface.document : null);
  }

  function goToSurface(next: Surface) {
    // A control that names the surface already showing pushes nothing: ten taps on
    // Insights leave one entry, not ten.
    if (sameSurface(next, currentSurface)) {
      return;
    }

    pushSurface(next);
    applySurface(next);
  }

  // Back and Forward, applied. A state with no surface of ours IS the entry, whose
  // surface is the one the reader arrived on.
  //
  // Focus moves here and only here. Back can retire the element focus was on — a
  // link inside the document just left — and focus falling to document.body strands
  // a keyboard reader, the failure MobileAccountMenu's closeAndFocusTrigger exists
  // to prevent. A click keeps the app's existing behaviour: focus returns to the
  // control that was clicked.
  function applyPoppedSurface(event: PopStateEvent) {
    applySurface(readSurfaceState(event.state) ?? entrySurface.current);
    restoreFocus.current = true;
  }

  useEffect(() => {
    window.addEventListener("popstate", applyPoppedSurface);
    return () => {
      window.removeEventListener("popstate", applyPoppedSurface);
    };
  });

  // Focused after the commit, never inside the handler: the region is keyed on the
  // surface (regionKey below), so a surface change REPLACES that element — focusing
  // it from the handler would focus the node React is about to remove, and focus
  // would land on the body after all. Measured, not reasoned: the 375px leg of
  // "a history move leaves focus somewhere" caught exactly that.
  //
  // No dependency array, because the flag is the dependency: this runs after every
  // commit and does nothing but read a boolean unless a history move set it.
  useEffect(() => {
    if (!restoreFocus.current) {
      return;
    }

    restoreFocus.current = false;
    contentRegion.current?.focus();
  });

  // AdvisorWorkspace only exists in the tree while its tab is active, so
  // switching tabs away and back remounts it fresh. Without clearing the
  // request once it's been applied, that remount would see the same
  // (stale) openRequest again and re-select its symbol, silently
  // overriding whatever market the user had since chosen.
  const clearAdvisorRequest = useCallback(() => setAdvisorRequest(null), []);
  // Same shape, same reason: an unconsumed guideAnchor would scroll the
  // Guide back down to the last-linked section every time the user opened
  // the tab from the tab bar, instead of starting at the top.
  const clearGuideAnchor = useCallback(() => setGuideAnchor(null), []);

  // The tab bar's single selection model spans two pieces of state:
  // Insights is a whole AppTab, Scan/Trades are sub-views of the "advisor"
  // one. selectMobileTab is the one place that maps a tap onto both;
  // activeMobileTab is its read-side mirror, used only to decide which of the
  // three buttons (if any) renders as current.
  function selectMobileTab(tab: MobileTab) {
    if (tab === "insights") {
      goToSurface({ ...currentSurface, tab: "history", document: null });
      return;
    }
    goToSurface({ tab: "advisor", deskView: tab, document: null });
  }
  const activeMobileTab: MobileTab | null = activeTab === "history"
    ? "insights"
    : activeTab === "advisor"
    ? deskMobileView
    : null;

  // Not memoised on [] any more: it closes over goToSurface, which reads the
  // surface showing right now to decide whether a move is a move at all. A stale
  // closure here would compare against the surface of some earlier render and push
  // an entry for a tap that changed nothing — or skip one that did.
  const workspaceNav: WorkspaceNav = {
    openGuide: (anchor) => {
      setGuideAnchor(anchor);
      goToSurface({ ...currentSurface, tab: "guide", document: null });
    },
    // I3: also lands mobile on the merged Scan surface — without this, a jump
    // here (Insights' "Open X in Advisor" row button, or a Current trades card)
    // could leave a mobile user staring at the Trades tab instead of the market
    // they just asked to see. "scan" IS that market's surface now (spec §17e):
    // its head, chart and ladder all follow the requested setup. That also makes
    // one mechanism serve both of the owner's 2026-08-02 entry points — the rail
    // lives inside the Desk, but only App owns which mobile surface is showing.
    openAdvisor: (setup) => {
      setAdvisorRequest({ setup, token: Date.now() });
      goToSurface({ tab: "advisor", deskView: "scan", document: null });
    },
    openInsights: () =>
      goToSurface({ ...currentSurface, tab: "history", document: null }),
  };
  const setupState = useTradeSetups();
  // Q2-M7: one clock per setups change rather than a fresh Date on every render
  // of the app shell. deriveTradeState ignores `now` today (see its `_now`), so
  // the old per-render Date was only harmless by accident — the moment a real
  // per-setup clock lands there, a value rebuilt on every render is a badge that
  // can change for reasons unrelated to the trades it counts.
  const tradeBadgeCount = useMemo(
    () => currentTradeBadgeCount(setupState.setups, new Date()),
    [setupState.setups],
  );
  const profileState = useUserProfile(
    session?.user.id ?? null,
    session?.user.email ?? "",
    theme.setMode,
  );

  // Insights (spec §10) and the Desk's Current trades rail (spec §8) both
  // show live outcome state and must never open onto stale data: each
  // force-refreshes outcomes, bypassing the 60s throttle, the moment its
  // tab activates — including the very first render, since useEffect always
  // runs once after mount regardless of deps, and "advisor" is the default
  // tab (getInitialAppTab). AdvisorWorkspace also unmounts/remounts on every
  // later switch back to Desk, so this one effect covers "on every surface
  // show" without a duplicate refresh trigger inside the rail itself.
  const { refreshSetups } = setupState;
  useEffect(() => {
    if (session && (activeTab === "advisor" || activeTab === "history")) {
      refreshSetups({ forceOutcomeRefresh: true });
    }
  }, [activeTab, session, refreshSetups]);

  // I2: the mobile Trades sub-tab is a display-only toggle within the same
  // "advisor" AppTab (AdvisorWorkspace keeps both mobile surfaces mounted),
  // never an AdvisorWorkspace remount, so the effect above — keyed only on
  // activeTab — never re-fires when a mobile user simply switches which Desk
  // surface is showing. Without this, tapping into Trades on mobile could show
  // outcome state up to 60s stale despite spec §8's "every time the surface is
  // shown". Scoped to the "trades" transition specifically — a separate effect
  // rather than folding deskMobileView into the one above, so this doesn't also
  // re-fire on every flip back to Scan, which has no outcome state to go stale.
  // No loop risk: this only re-runs when deskMobileView's own value actually
  // changes, and calling refreshSetups never itself touches it.
  useEffect(() => {
    if (session && activeTab === "advisor" && deskMobileView === "trades") {
      refreshSetups({ forceOutcomeRefresh: true });
    }
  }, [activeTab, deskMobileView, session, refreshSetups]);

  useEffect(() => {
    if (typeof window === "undefined" || !PERSISTED_TABS.has(activeTab)) {
      return;
    }

    window.localStorage.setItem(LAST_TAB_STORAGE_KEY, activeTab);
  }, [activeTab]);

  // The ?donate arrival above is consumed once, and then taken back out of the
  // URL. Left in, it would outlive the arrival and win every LATER load of that
  // URL — including the reloads a phone performs on its own when it returns to a
  // backgrounded tab — putting a reader who had since moved to Insights back on
  // Donate having asked for nothing. That is the second form of the rule the
  // PERSISTED_TABS effect above enforces: this arrival must not become the
  // remembered tab, and it must not override it either.
  //
  // Signed in only. The sign-in screen reads the same ask for its own donation
  // disclosure and keeps it, deliberately: that screen is one surface with no
  // remembered position to displace, so a reload that reopens the block cannot
  // take a reader anywhere they did not choose.
  useEffect(() => {
    if (session) {
      clearDonateRequest();
    }
  }, [session]);

  if (loading) {
    // Fix wave 2B: no mock covers this pre-auth data-loading gate, but it
    // was the branch's one unjustified boxed-card survivor (final review's
    // own inventory) — flattened to a minimal centered wordmark and the
    // system's own spinner idiom (Loader2 + animate-spin), the same
    // pairing every other loading state in the app already uses.
    //
    // §17i's frame, in its simplest shape: exactly the viewport tall, nothing
    // scrolling. It was the last min-height column in the app — footer-less and
    // transient, so nothing was ever unreachable, but it was also the only reason
    // a viewport-minimum utility still existed in the built CSS while every real
    // surface had stopped being one.
    return (
      <main className="flex h-[100dvh] flex-col items-center justify-center gap-4 overflow-hidden bg-paper px-6 text-center text-ink">
        <p className="wordmark text-2xl">Levelflow</p>
        <p className="flex items-center gap-2 text-sm font-semibold text-ink-muted">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Opening Levelflow
        </p>
      </main>
    );
  }

  if (!session) {
    if (PARKING_GATE && !parkingBypassActive()) {
      return (
        <ParkingScreen
          themeControl={
            <ThemeToggle compact mode={theme.mode} onChange={theme.setMode} />
          }
        />
      );
    }
    return (
      <AuthScreen
        themeControl={
          <ThemeToggle compact mode={theme.mode} onChange={theme.setMode} />
        }
      />
    );
  }

  const profile =
    profileState.profile ??
    buildDefaultProfile(session.user.id, session.user.email ?? "");

  // Which of the Desk's two ≥lg neighbours the content region is: the Desk's own
  // three-column shell scrolls each column internally and so hands the region
  // nothing to scroll, while every other tab is a page that scrolls inside it.
  //
  // Spec §17g gave every surface below lg the fixed-frame discipline; §17i lifts
  // it to ≥lg with the footer inside the frame, so BOTH platforms are now a
  // 100dvh shell and neither scrolls as a document. isMobileViewport is a JS
  // width check rather than a max-lg: variant because the sm: padding utilities
  // the mobile shell has to drop would outrank a max-width variant in Tailwind's
  // own emission order — and because each surface swaps in a pinned/scroll
  // composition CSS cannot express as a restyling of the other
  // (src/components/mobileFrame.ts).
  const isDeskTab = activeTab === "advisor";
  // Whether the region below is itself the scroller — and so whether it needs a
  // tab stop. §17i took the document's scroll away (h-[100dvh] +
  // overflow-hidden) and handed it to this box, and a scroll box no element can
  // focus is a scroll box no keyboard can move: from the focus every page load
  // starts with, Space / PageDown / End moved nothing at all (WCAG 2.1.1). A
  // tabIndex here restores them — one Tab lands on the region, and the keys work
  // from there.
  //
  // Gated, not unconditional: below lg each surface scrolls its own inner region
  // (src/components/mobileFrame.ts) and on the Desk the three columns do, so on
  // those two this box cannot move and a tab stop on it would be a stop that
  // does nothing. The name and the role ride the same gate for the same reason —
  // they exist to announce the tab stop.
  const regionScrolls = !isMobileViewport && !isDeskTab;
  // What makes the region remount, and so what re-runs §8's 120ms fade and resets
  // the scroll it had. The tab alone was enough until §17o tier 2 put three
  // documents behind one tab: a reader partway down Privacy who taps Terms would
  // otherwise land partway down Terms, in a region that never remounted.
  const regionKey = legalDocument ?? activeTab;

  return (
    <WorkspaceNavContext.Provider value={workspaceNav}>
      {/* Spec §17i: the shell is the frame — masthead row, content row, footer
          row — and the footer is inside it on every surface, the Desk included.
          Each branch is a complete literal class string (C1) rather than a base
          list plus an override, because the two shells disagree about how many
          rows they have, and a stack of competing utilities on one element is
          how that disagreement turns into a cascade puzzle. */}
      <main className={mainShellClassName(isMobileViewport)}>
        <header className="sticky top-0 z-20 border-b border-hairline bg-paper/90 backdrop-blur">
          {/* §17n: 8px of block padding below lg, the mock's 12px at ≥lg. Measured
              against the built CSS at 375x812, this row was 69px of which 44px is
              the avatar trigger — the kit's tap floor, which sets the row's height
              and cannot yield — so the padding around it was the only slack there
              was, and 8px is still a real gutter above and below a 44px control.
              Every mobile surface's content row gains the 8px, since this header
              and the content row split one fixed viewport between them. */}
          <div className="mx-auto max-w-7xl px-4 py-3 max-lg:py-2 sm:px-8">
            {/* Mobile header (<lg, spec §3): wordmark, compact broker chip,
                account avatar — Guide/Profile/Donate/Sign out all live
                behind that one button instead of the single-row masthead
                below (wordmark + text nav + broker chip + Sign out; spec
                §16), gated to ≥lg via `hidden … lg:flex` so hiding it at
                <lg can't touch its own layout at ≥lg. */}
            <div
              className="flex min-w-0 items-center justify-between gap-3 lg:hidden"
              data-testid="mobile-header"
            >
              <p className="wordmark min-w-0 truncate text-lg text-ink">
                Levelflow
              </p>
              <div className="flex shrink-0 items-center gap-2">
                <BrokerChip compact />
                <MobileAccountMenu
                  currentDocument={legalDocument}
                  onOpenDocument={(slug) =>
                    goToSurface({ ...currentSurface, tab: "legal", document: slug })}
                  onOpenDonate={() =>
                    goToSurface({ ...currentSurface, tab: "donate", document: null })}
                  onOpenGuide={() =>
                    goToSurface({ ...currentSurface, tab: "guide", document: null })}
                  onOpenProfile={() =>
                    goToSurface({ ...currentSurface, tab: "profile", document: null })}
                  onSignOut={() => supabase?.auth.signOut()}
                  supportMailto={SUPPORT_MAILTO}
                />
              </div>
            </div>

            <div
              className="hidden items-center justify-between lg:flex"
              data-testid="desktop-header"
            >
              <div className="flex items-center gap-6">
                <p className="wordmark text-xl text-ink">Levelflow</p>
                <nav
                  aria-label="Levelflow sections"
                  className="flex items-center gap-6"
                >
                  {/* The kit's 44px floor (spec §9), reached the way
                      .tertiary-link and .cpv-copy already reach it: the button
                      grows to 44px and a matching negative block margin pulls
                      that extra height back out of the flow, so the row's own
                      geometry is untouched. The type moves to an inner span for
                      one reason — the active underline is a border on the
                      element that carries it, and on a 44px button that border
                      would sit 12px below the word instead of under it. Both
                      boxes centre on the same line, so every glyph and the
                      underline land exactly where they did at 16px tall. */}
                  {TABS.map((tab) => (
                    <button
                      key={tab.value}
                      type="button"
                      className="group -my-3.5 inline-flex min-h-11 items-center"
                      onClick={() =>
                        goToSurface({
                          ...currentSurface,
                          tab: tab.value,
                          document: null,
                        })}
                    >
                      {/* group-hover, not hover: :hover matches the element the
                          pointer is over and its ancestors, never its children,
                          so a plain hover: here would only light the word — the
                          rest of the 44px target would be dead to it. */}
                      <span
                        className={`text-xs font-semibold uppercase tracking-[0.12em] ${
                          activeTab === tab.value
                            ? "text-ink border-b-2 border-accent pb-1"
                            : "text-ink-muted group-hover:text-ink"
                        }`}
                      >
                        {tab.label}
                      </span>
                    </button>
                  ))}
                </nav>
              </div>

              <div className="flex items-center gap-3">
                <BrokerChip />
                <button
                  className="secondary-button min-h-10 px-3 py-2"
                  type="button"
                  onClick={() => supabase?.auth.signOut()}
                >
                  Sign out
                </button>
              </div>
            </div>
          </div>
        </header>

        {/* Spec §8: "tab content changes fade 120ms". The key is what makes the
            animation re-run — React reuses this element across tab changes
            otherwise, and a CSS animation only plays on mount — and it costs
            nothing extra, since every child here already mounts fresh when
            activeTab changes. Keyed on activeTab alone, never on
            deskMobileView: flipping the mobile Desk between Scan and Trades must
            leave AdvisorWorkspace mounted (see the two refresh effects above). */}
        <div
          key={regionKey}
          aria-label={regionScrolls ? REGION_LABELS[activeTab] : undefined}
          className={isMobileViewport
            // Every mobile surface owns its own gutters and its own bottom
            // clearance (spec §17g, m-scan-v3.html:29,32), so this wrapper
            // contributes nothing but the fixed column they live in.
            ? "motion-fade-in flex w-full min-h-0 flex-col overflow-hidden"
            // Both of these branches render at ≥lg ONLY, since §17g gave every
            // width below lg its own frame above. So the live tab-bar clearance is
            // not here — it is MOBILE_FRAME_SCROLL's, sized to the bar itself in
            // src/components/mobileFrame.ts — and at ≥lg it is lg:pb-5 that
            // computes the 20px these two actually draw. Each branch's pb-24 is
            // inert in normal operation and kept for two reasons, neither of them
            // decoration: it is the belt for a mis-gated render (isMobileViewport
            // reading stale would draw a desktop branch at a phone width, where
            // the bar IS still mounted), and it is the record of a real ordering
            // hazard.
            //
            // That hazard, and why the sm: pad is top-axis only: a padding-block
            // utility beats a padding-bottom one whenever Tailwind emits it later,
            // which it does for a variant. Measured in the built CSS, the block
            // form landed ~9kB after .pb-24 — so back when these branches still
            // rendered below lg, the reserve silently collapsed from 96px to 20px
            // across the whole 640-1023px band while the bar was there. Padding
            // only the top leaves the pb chain intact and changes nothing at ≥lg,
            // where lg:pb-5 already computed the same 20px the block form was
            // handing it. tests/mobileNav.test.ts pins that shape — not a live
            // reserve, which is what its own rationale now says.
            //
            // §17i makes the second of them the app's one ≥lg scroll region: the
            // Desk still scrolls its three columns internally (lg:overflow-hidden,
            // unchanged), and every other tab scrolls its page HERE rather than in
            // the document, which is what leaves the footer row pinned below it.
            // The thin scrollbar is the kit's own .scrolly, the same one the Desk's
            // columns and every mobile scroll region already take.
            : isDeskTab
            ? "motion-fade-in mx-auto w-full max-w-7xl px-4 py-4 pb-24 sm:px-8 sm:pt-5 lg:flex lg:h-full lg:min-h-0 lg:flex-col lg:overflow-hidden lg:pb-5"
            : "scrolly motion-fade-in mx-auto max-w-7xl space-y-5 px-4 py-4 pb-24 sm:px-8 sm:pt-5 lg:min-h-0 lg:overflow-y-auto lg:pb-5"}
          data-testid="content-region"
          ref={contentRegion}
          role={regionScrolls ? "region" : undefined}
          // A tab stop only where this box is the scroller, exactly as before — a
          // stop on a box that cannot scroll is a stop that does nothing. The -1 is
          // what §17o tier 1 added: not a stop, but a focus target, so a Back that
          // retires the element focus was on can hand focus somewhere deterministic
          // instead of letting it fall to document.body (applyPoppedSurface).
          tabIndex={regionScrolls ? 0 : -1}
        >
          {activeTab === "advisor" ? (
            <AdvisorWorkspace
              loadFailed={setupState.loadFailed}
              mobileView={deskMobileView}
              onForceOutcomeRefresh={() => refreshSetups({ forceOutcomeRefresh: true })}
              onOpenRequestHandled={clearAdvisorRequest}
              onSetupsChanged={() => setupState.refreshSetups({ silent: true })}
              openRequest={advisorRequest}
              profile={profile}
              setups={setupState.setups}
            />
          ) : null}
          {activeTab === "history" ? (
            <HistoryPanel
              loadFailed={setupState.loadFailed}
              loading={setupState.loading}
              setups={setupState.setups}
            />
          ) : null}
          {activeTab === "profile" ? (
            <ProfilePanel
              memberSince={session.user.created_at}
              onSave={profileState.saveProfile}
              onSignOut={() => supabase?.auth.signOut()}
              onThemeChange={theme.setMode}
              profile={profile}
              themeMode={theme.mode}
            />
          ) : null}
          {activeTab === "guide" ? (
            <GuidePanel
              anchor={guideAnchor}
              onAnchorHandled={clearGuideAnchor}
            />
          ) : null}
          {activeTab === "donate" ? <DonatePanel /> : null}
          {/* §17o tier 2. The slug is what decides which document, and the tab
              cannot be "legal" without one: the navigation funnel sets the two
              together, and applySurface drops a slug it does not recognise. */}
          {activeTab === "legal" && legalDocument ? (
            <LegalDocumentPanel slug={legalDocument} />
          ) : null}
        </div>

        {/* Spec §17i: ONE footer, in the frame's own bottom row, always visible
            on every ≥lg surface — the Guide no longer hides it below a full
            page-scroll and the Desk gains the footer it never had, so the
            component's Desk exception is gone with the ruling that carved it.
            Below lg it is still absent outright (§17g): every surface there is a
            fixed frame with no room for it, its link set lives in the account
            menu and its colophon in the Profile view (ProfilePanel's own <lg
            branch). */}
        {isMobileViewport ? null : (
          <AppFooter
            currentDocument={legalDocument}
            donate={{
              onSelect: () =>
                goToSurface({ ...currentSurface, tab: "donate", document: null }),
            }}
            onOpenDocument={(slug) =>
              goToSurface({ ...currentSurface, tab: "legal", document: slug })}
            supportMailto={SUPPORT_MAILTO}
          />
        )}

        <MobileTabBar
          active={activeMobileTab}
          onSelect={selectMobileTab}
          tradeBadgeCount={tradeBadgeCount}
        />
      </main>
    </WorkspaceNavContext.Provider>
  );
}

// The page shell, in its two shapes — one per platform, since §17i (desktop) and
// §17g (mobile) now ask for the same thing: a fixed frame, chrome pinned, one
// region scrolling between. Neither shape scrolls as a document, so neither is a
// min-height flex column any more, and the auto top margin AppFooter used to pin
// itself with has nothing left to push against — the footer is a row of the grid
// instead, which is what makes "always visible" structural rather than a
// consequence of content height. (The retired utility is named by shape rather
// than spelled out: Tailwind's scanner reads this file, and a dead class in a
// comment is a dead rule in the bundle.)
//
// They differ by exactly one row. Below lg the footer is absent (§17g), so the
// shell is masthead + content; at ≥lg it is masthead + content + footer.
// minmax(0,1fr) rather than a bare 1fr on the content row: 1fr floors at the
// row's min-content height, so a long Guide or a wide Insights ledger would push
// the footer off the bottom of the frame the moment its content outgrew it.
//
// 100dvh, not 100vh: a phone's 100vh is the toolbar-less height, which would put
// the bottom of a "fixed" surface below the visible viewport and hand the page a
// scrollbar it must not have. The same unit at ≥lg, where the two are equal, so
// the frame is one number rather than two.
function mainShellClassName(isMobileViewport: boolean): string {
  if (isMobileViewport) {
    return "grid h-[100dvh] grid-rows-[auto_1fr] overflow-hidden bg-paper text-ink";
  }
  return "grid h-[100dvh] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden bg-paper text-ink";
}

function useThemePreference() {
  const [mode, setMode] = useState<ThemeMode>(() => {
    if (typeof window === "undefined") {
      return "system";
    }
    const stored = window.localStorage.getItem("levelflow-theme");
    return stored === "light" || stored === "dark" || stored === "system"
      ? stored
      : "system";
  });
  const [systemDark, setSystemDark] = useState(() =>
    typeof window === "undefined"
      ? false
      : window.matchMedia("(prefers-color-scheme: dark)").matches,
  );

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setSystemDark(query.matches);
    onChange();
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  const resolvedMode = useMemo(
    () => (mode === "system" ? (systemDark ? "dark" : "light") : mode),
    [mode, systemDark],
  );

  useEffect(() => {
    const root = document.documentElement;
    // Spec §8, "nothing moves untouched": the swap re-values every token at
    // once, and the kit's 140ms color transitions would otherwise trail it —
    // the tearing the data-theme-swapping rule in index.css describes. Set
    // before the attribute that causes the repaint, cleared once the new
    // palette has actually been painted, which is why it takes two frames:
    // the first is the paint of the new values, the second is the earliest
    // moment nothing is left to interpolate.
    root.dataset.themeSwapping = "";
    root.dataset.theme = resolvedMode;
    root.dataset.themeMode = mode;
    window.localStorage.setItem("levelflow-theme", mode);

    let painted = 0;
    const pending = window.requestAnimationFrame(() => {
      painted = window.requestAnimationFrame(() => {
        delete root.dataset.themeSwapping;
      });
    });
    return () => {
      window.cancelAnimationFrame(pending);
      window.cancelAnimationFrame(painted);
    };
  }, [mode, resolvedMode]);

  // resolvedMode stays internal: it is what the effects above need, and nothing
  // outside this hook reads it (Q2-I9's sibling).
  return { mode, setMode };
}

const MOBILE_TAB_ITEMS: Array<
  { icon: ReactNode; label: string; value: MobileTab }
> = [
  {
    icon: <Radar className="h-5 w-5" aria-hidden="true" />,
    label: "Scan",
    value: "scan",
  },
  {
    icon: <ListChecks className="h-5 w-5" aria-hidden="true" />,
    label: "Trades",
    value: "trades",
  },
  {
    icon: <History className="h-5 w-5" aria-hidden="true" />,
    label: "Insights",
    value: "insights",
  },
];

// Spec §17e: the mobile-only primary navigation, three tabs, replacing the top
// nav pills below lg (the masthead's own text nav stays put at ≥lg — see the
// header's `lg:hidden` / `hidden lg:flex` pair above). Persistent across every
// tab, not just the Desk one, so Scan is always one tap away even from Guide or
// Profile — Guide and Profile themselves live in the avatar menu, deliberately
// absent from these three buttons rather than from the bar itself.
function MobileTabBar({
  active,
  onSelect,
  tradeBadgeCount,
}: {
  active: MobileTab | null;
  onSelect: (tab: MobileTab) => void;
  tradeBadgeCount: number;
}) {
  return (
    <nav
      aria-label="Levelflow"
      className="fixed inset-x-0 bottom-0 z-20 border-t border-hairline bg-paper/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
    >
      <div className="mx-auto grid max-w-7xl grid-cols-3">
        {MOBILE_TAB_ITEMS.map((item) => {
          const isActive = active === item.value;
          const badge = item.value === "trades" && tradeBadgeCount > 0
            ? tradeBadgeCount
            : null;
          return (
            <button
              key={item.value}
              aria-current={isActive ? "page" : undefined}
              aria-label={badge ? `${item.label}, ${badge} current` : item.label}
              // The mock's tab type (m-scan-v3.html:59): 10.5px bold uppercase
              // at .1em tracking. Un-prefixed on purpose — the whole nav is
              // lg:hidden, so these are mobile rules already.
              // Casing is CSS only; the accessible name comes from the
              // aria-label above, so the e2e nav-name contracts are untouched.
              //
              // §17n sized the box: measured against the built CSS at 375x812,
              // a tab's own content is 38px — the 20px icon, the 2px gap, and
              // the 10.5px label's 15.75px line box — so the 56px box this
              // carried held 18px of nothing. (Its retired utility is named by
              // shape rather than spelled out, the habit mainShellClassName
              // documents: Tailwind's scanner reads this file, and a dead class
              // in a comment is a dead rule in the bundle.)
              // min-h-12 is 48px: the kit's 44px tap floor plus 4px, a
              // step toward the mock's own tab (m-scan-v3.html:48 draws a
              // text-only 39px one), and 8px of visible content handed back to
              // every surface, since this bar overlays the bottom of each one's
              // scroll region. The icons stay — they carry no text, so no
              // legibility floor asks them to grow, and they are what makes the
              // 10.5px label a label rather than the whole affordance.
              className={`flex min-h-12 flex-col items-center justify-center gap-0.5 text-[10.5px] font-bold uppercase tracking-[0.1em] ${
                isActive ? "text-accent" : "text-ink-muted"
              }`}
              type="button"
              onClick={() => onSelect(item.value)}
            >
              <span className="relative">
                {item.icon}
                {badge
                  ? (
                    // The mock puts this chip on --caution
                    // (m-mobile-v3.html:36). The count behind it is unchanged:
                    // currentTradeBadgeCount, the same pending/open filter the
                    // Trades tab itself renders — the fill is a color, not a
                    // new "needs action" claim the data cannot support. The
                    // mock's own #fff would collapse on the dark theme's gold
                    // caution (~1.9:1), so the content stays on text-paper,
                    // which re-values with the fill (tests/contrast.test.ts).
                    <span
                      aria-hidden="true"
                      className="absolute -right-2 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-caution px-1 font-mono text-[10px] font-bold leading-none tracking-normal text-paper"
                    >
                      {badge}
                    </span>
                  )
                  : null}
              </span>
              {item.label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

// The mobile header's account avatar (spec §3: "account avatar button
// (opens Profile / Sign out)"), extended to also carry Guide — the other
// surface the binding decision moves off the tab bar — plus Donate for
// parity with what the desktop icon row still offers, so nothing mobile
// users could reach before becomes unreachable now that the header no
// longer shows those buttons directly.
function MobileAccountMenu({
  currentDocument,
  onOpenDocument,
  onOpenDonate,
  onOpenGuide,
  onOpenProfile,
  onSignOut,
  supportMailto,
}: {
  currentDocument: LegalSlug | null;
  onOpenDocument: (slug: LegalSlug) => void;
  onOpenDonate: () => void;
  onOpenGuide: () => void;
  onOpenProfile: () => void;
  onSignOut: () => void;
  supportMailto: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Mirrors ScopeMenu.tsx's close()/closeAndFocusTrigger() split exactly
  // (the established bar for this app's popovers): every path that
  // dismisses the menu — Escape, Tab, an outside click, or picking an
  // item — returns focus to the trigger, so a keyboard/screen-reader user
  // is never left with focus stranded on a removed menu item or lost to
  // the document body. useCallback (unlike ScopeMenu's plain function
  // declarations) because this one's body reaches a ref's imperative
  // .focus(), which this project's exhaustive-deps setup treats as a real
  // capture rather than the setState-only pattern it recognizes as stable
  // — a stable identity here keeps the effect below subscribing only on
  // real open/close transitions instead of every unrelated re-render.
  const closeAndFocusTrigger = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        // Confirmed by live interactive testing, not assumed: a bare
        // triggerRef.current?.focus() inside a mousedown handler does not
        // stick when the click lands on a non-focusable element (a
        // heading, plain text) — the browser's own default mousedown
        // action reassigns focus to document.body immediately afterward,
        // silently undoing it. preventDefault() suppresses exactly that
        // default focus reassignment (it does not block the outside
        // element's own subsequent click handler from firing) so the
        // explicit refocus below actually wins.
        event.preventDefault();
        closeAndFocusTrigger();
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, [closeAndFocusTrigger, open]);

  // Attached to the root (trigger + menu together) rather than the menu
  // alone, so it fires no matter which of the two currently has focus —
  // right after opening (focus is still on the trigger button; a native
  // click doesn't move it) as well as once focus has moved into a menu
  // item. Tab is treated exactly like Escape, the same choice
  // ScopeMenu.tsx's handleListKeyDown makes and documents: without it, a
  // keyboard Tab could carry focus out into the rest of the page while
  // the menu stayed visually open — the "no focus trap" gap this closes.
  function handleKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (!open) {
      return;
    }
    if (event.key === "Escape" || event.key === "Tab") {
      event.preventDefault();
      closeAndFocusTrigger();
    }
  }

  function select(action: () => void) {
    closeAndFocusTrigger();
    action();
  }

  return (
    <div ref={rootRef} className="relative" onKeyDown={handleKeyDown}>
      <button
        ref={triggerRef}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Account menu"
        // Spec §17i: "The mobile avatar trigger renders mark A (not the account
        // initial); 44px target and accessible name unchanged." The mock drew a
        // circle on sheet with a 1.5px hairline border carrying the signed-in
        // email's first letter (m-mobile-v3.html:44); mark A arrives with a
        // container of its own — a rounded-square tile on sheet with a hairline
        // edge — so keeping the circle too would be a perimeter inside a perimeter,
        // which is the box-on-box §17c sweeps. The mark IS the trigger's face; the
        // 44px tap target stays, and hover takes the accent tint every other
        // pressable row in this menu already uses instead of a second edge.
        //
        // The open state keeps its ✕ so the trigger still says what tapping it
        // does; neither mock draws this menu open.
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink transition hover:bg-accent/10"
        type="button"
        onClick={() => setOpen((value) => !value)}
      >
        {open
          ? <X className="h-5 w-5" aria-hidden="true" />
          : <LevelflowMark className="h-8 w-8" />}
      </button>

      {/* w-56 rather than the w-48 this menu carried before §17g: the legal trio
          at 12px measures ~186px with its gaps, so at 192px it wrapped to a
          second line — and a wrapped line of 44px targets overlaps the line above
          it. One step wider keeps the block one legible row. */}
      {open
        ? (
          <div
            className="motion-fade-in absolute right-0 top-full z-30 mt-2 w-56 overflow-hidden rounded-lg border border-hairline bg-sheet py-1 shadow-lg"
            role="menu"
          >
            <MobileMenuItem
              icon={<BookOpen className="h-4 w-4" aria-hidden="true" />}
              label="Guide"
              onSelect={() => select(onOpenGuide)}
            />
            <MobileMenuItem
              icon={<UserRound className="h-4 w-4" aria-hidden="true" />}
              label="Profile"
              onSelect={() => select(onOpenProfile)}
            />
            <MobileMenuItem
              icon={<Gift className="h-4 w-4" aria-hidden="true" />}
              label="Donate"
              onSelect={() => select(onOpenDonate)}
            />
            <a
              className="flex min-h-11 items-center gap-2 px-3 text-sm font-semibold text-ink transition hover:bg-accent/10"
              href={supportMailto}
              role="menuitem"
              onClick={() => closeAndFocusTrigger()}
            >
              <Mail className="h-4 w-4" aria-hidden="true" />
              Help
            </a>
            <div className="my-1 border-t border-hairline" />
            <MobileMenuItem
              icon={<LogOut className="h-4 w-4" aria-hidden="true" />}
              label="Sign out"
              onSelect={() => select(onSignOut)}
            />
            {/* Spec §17g: the footer's link set moves here below lg, and the
                legal trio is the half of it this menu did not already carry —
                Help and Donate are the two items above, so nothing is listed
                twice. The block is deliberately the quietest thing in the menu:
                the same 12px muted furniture LegalLinks gives them in the ≥lg
                footer, at the same labels and the same hrefs, read from that
                component's own array.

                Semantics: a role="group" of real menuitems, not a nav landmark.
                role="menu" admits only menuitem/menuitemcheckbox/
                menuitemradio/group/separator children, so a <nav> here would be
                an invalid child AND a second "Legal" landmark that only exists
                while the menu is open; a labelled group names the set without
                costing the menu its own contract. Each link keeps min-h-11 —
                §17g's "as small as possible" is about type and spacing, and the
                kit's tap floor is not negotiable — and no negative margin,
                because a .tertiary-link's -14px block margins would overlap the
                tap targets of the items either side of this row. */}
            <div
              aria-label="Legal"
              className="flex flex-wrap items-center gap-x-3 px-3 text-xs font-semibold text-ink-muted"
              role="group"
            >
              {LEGAL_SLUGS.map((slug) => (
                <a
                  key={slug}
                  aria-current={currentDocument === slug ? "page" : undefined}
                  className="inline-flex min-h-11 items-center transition hover:text-ink"
                  href={legalDocumentHref(slug)}
                  role="menuitem"
                  // §17o tier 2: no new tab. The document opens in the frame, and
                  // the menu closes the way it closes for every other item — the
                  // trigger keeps the focus. The href is still real, so a reader who
                  // means "somewhere else" (⌘, Ctrl, Shift, Alt, middle button) gets
                  // the published file; openInFrame is what tells the two apart.
                  onClick={(event) => {
                    closeAndFocusTrigger();
                    openInFrame(event, slug, onOpenDocument);
                  }}
                >
                  {legalDocumentBySlug(slug).title}
                </a>
              ))}
            </div>
          </div>
        )
        : null}
    </div>
  );
}

function MobileMenuItem({
  icon,
  label,
  onSelect,
}: {
  icon: ReactNode;
  label: string;
  onSelect: () => void;
}) {
  return (
    <button
      className="flex min-h-11 w-full items-center gap-2 px-3 text-left text-sm font-semibold text-ink transition hover:bg-accent/10"
      role="menuitem"
      type="button"
      onClick={onSelect}
    >
      {icon}
      {label}
    </button>
  );
}
