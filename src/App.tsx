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
  CircleUser,
  Gift,
  History,
  LayoutDashboard,
  LineChart,
  ListChecks,
  LogOut,
  Mail,
  Radar,
  User,
  UserRound,
  X,
} from "lucide-react";
import { AuthScreen } from "./components/auth/AuthScreen";
import { ParkingScreen } from "./components/auth/ParkingScreen";
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
import { LegalLinks } from "./components/legal/LegalLinks";
import { useAuthSession } from "./hooks/useAuthSession";
import { useTradeSetups } from "./hooks/useTradeSetups";
import { useUserProfile } from "./hooks/useUserProfile";
import {
  buildDefaultProfile,
  type ThemeMode,
} from "./lib/profile";
import { supabase } from "./lib/supabase";

type AppTab = "advisor" | "history" | "guide" | "profile" | "donate";
// The four bottom-tab-bar destinations (spec §3). Three of them ("review" |
// "scan" | "trades") are sub-views of the single "advisor" AppTab — see
// deskMobileView below — so the tab bar's own selection model is a distinct,
// slightly wider union from AppTab rather than a one-to-one mirror of it.
type MobileTab = "review" | "scan" | "trades" | "insights";

const SUPPORT_EMAIL = "help@windwardline.com";
// Support is a shared inbox across apps, so every mailto names the app it
// came from — otherwise an inbound message arrives with no way to route it.
const SUPPORT_MAILTO = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("[Levelflow] Help")}`;

const TABS: Array<{ icon: ReactNode; label: string; value: AppTab }> = [
  {
    icon: <LayoutDashboard className="h-4 w-4" aria-hidden="true" />,
    label: "Desk",
    value: "advisor",
  },
  {
    icon: <History className="h-4 w-4" aria-hidden="true" />,
    label: "Insights",
    value: "history",
  },
  {
    icon: <BookOpen className="h-4 w-4" aria-hidden="true" />,
    label: "Guide",
    value: "guide",
  },
  {
    icon: <User className="h-4 w-4" aria-hidden="true" />,
    label: "Profile",
    value: "profile",
  },
];
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

  const stored = window.localStorage.getItem(LAST_TAB_STORAGE_KEY);
  return stored && PERSISTED_TABS.has(stored as AppTab)
    ? stored as AppTab
    : "advisor";
}

export default function App() {
  const theme = useThemePreference();
  const { session, loading } = useAuthSession();
  const [activeTab, setActiveTab] = useState<AppTab>(() => getInitialAppTab());
  const [guideAnchor, setGuideAnchor] = useState<GuideAnchor | null>(null);
  const [advisorRequest, setAdvisorRequest] = useState<{ symbol: string; token: number } | null>(null);
  const [insightsSymbol, setInsightsSymbol] = useState<string | null>(null);
  // The mobile tab bar's own sub-selection within the Desk (spec §3: Review
  // / Scan / Trades). Kept separate from activeTab rather than folded into
  // it: all three map to the same "advisor" AppTab, so AdvisorWorkspace
  // stays mounted (and its symbol/scanResult/clockNow state intact) while
  // the bar flips between them — remounting on every tap would be a much
  // worse mobile experience than desktop's "just look at another column".
  const [deskMobileView, setDeskMobileView] = useState<DeskMobileView>(
    "review",
  );

  // AdvisorWorkspace only exists in the tree while its tab is active, so
  // switching tabs away and back remounts it fresh. Without clearing the
  // request once it's been applied, that remount would see the same
  // (stale) openRequest again and re-select its symbol, silently
  // overriding whatever market the user had since chosen.
  const clearAdvisorRequest = useCallback(() => setAdvisorRequest(null), []);
  // Same shape, same reason: HistoryPanel unmounts whenever the Insights
  // tab isn't active, so insightsSymbol has to be cleared once adopted or
  // a later plain tab revisit would silently reapply a stale market filter.
  const clearInsightsSymbol = useCallback(() => setInsightsSymbol(null), []);
  // Third of the same shape: an unconsumed guideAnchor would scroll the
  // Guide back down to the last-linked section every time the user opened
  // the tab from the tab bar, instead of starting at the top.
  const clearGuideAnchor = useCallback(() => setGuideAnchor(null), []);

  // The tab bar's single selection model spans two pieces of state:
  // Insights is a whole AppTab, Review/Scan/Trades are sub-views of the
  // "advisor" one. selectMobileTab is the one place that maps a tap onto
  // both; activeMobileTab is its read-side mirror, used only to decide
  // which of the four buttons (if any) renders as current.
  function selectMobileTab(tab: MobileTab) {
    if (tab === "insights") {
      setActiveTab("history");
      return;
    }
    setActiveTab("advisor");
    setDeskMobileView(tab);
  }
  const activeMobileTab: MobileTab | null = activeTab === "history"
    ? "insights"
    : activeTab === "advisor"
    ? deskMobileView
    : null;

  const workspaceNav = useMemo<WorkspaceNav>(() => ({
    openGuide: (anchor) => { setGuideAnchor(anchor); setActiveTab("guide"); },
    // I3: also lands mobile on the "review" sub-view — without this, a jump
    // here (e.g. Insights' "Open X in Advisor" row button) could leave a
    // mobile user staring at whichever Desk sub-tab (Scan/Trades) happened
    // to be selected before, instead of the market they just asked to see.
    openAdvisor: (symbol) => {
      setAdvisorRequest({ symbol, token: Date.now() });
      setActiveTab("advisor");
      setDeskMobileView("review");
    },
    openInsights: (symbol) => { setInsightsSymbol(symbol ?? null); setActiveTab("history"); },
  }), []);
  const setupState = useTradeSetups();
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

  // I2: the mobile Trades sub-tab is a CSS-only toggle within the same
  // "advisor" AppTab (AdvisorWorkspace's deskColumnClassName), never an
  // AdvisorWorkspace remount, so the effect above — keyed only on
  // activeTab — never re-fires when a mobile user simply switches which
  // Desk column is showing. Without this, tapping into Trades on mobile
  // could show outcome state up to 60s stale despite spec §8's "every time
  // the surface is shown". Scoped to the "trades" transition specifically,
  // not every Review<->Scan swap (neither has outcome state to go stale) —
  // a separate effect rather than folding deskMobileView into the one
  // above, so this doesn't also start re-firing on every sub-tab switch.
  // No loop risk: this only re-runs when deskMobileView's own value
  // actually changes, and calling refreshSetups never itself touches it.
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

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-paper px-6 text-ink">
        <div className="terminal-panel w-full max-w-sm p-6 text-center">
          <div className="mx-auto mb-4 h-10 w-10 animate-pulse rounded-lg bg-ink/90" />
          <p className="font-semibold">Opening Levelflow</p>
        </div>
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

  // The Desk (≥lg) is a fixed-height, three-column shell that never scrolls
  // as a page — each column scrolls itself (spec §2). Every other tab keeps
  // the ordinary scrolling page. main's grid-rows-[auto_1fr] hands the
  // content row exactly "viewport minus header" without hardcoding the
  // header's pixel height, and the footer steps out of the layout via
  // lg:hidden so it can't add height the fixed shell has no room for; <lg
  // never applies any of this, so the stacked flow (footer included) is
  // untouched there.
  const isDeskTab = activeTab === "advisor";

  return (
    <WorkspaceNavContext.Provider value={workspaceNav}>
      <main
        className={`bg-paper text-ink ${
          isDeskTab
            ? "min-h-screen lg:grid lg:h-screen lg:grid-rows-[auto_1fr] lg:overflow-hidden"
            : "min-h-screen"
        }`}
      >
        <header className="sticky top-0 z-20 border-b border-hairline bg-paper/90 backdrop-blur">
          <div className="mx-auto max-w-7xl px-4 py-3 sm:px-8">
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
                <BrokerChip />
                <MobileAccountMenu
                  onOpenDonate={() => setActiveTab("donate")}
                  onOpenGuide={() => setActiveTab("guide")}
                  onOpenProfile={() => setActiveTab("profile")}
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
                  {TABS.map((tab) => (
                    <button
                      key={tab.value}
                      type="button"
                      className={`text-xs font-semibold uppercase tracking-[0.12em] ${
                        activeTab === tab.value
                          ? "text-ink border-b-2 border-accent pb-1"
                          : "text-ink-muted hover:text-ink"
                      }`}
                      onClick={() => setActiveTab(tab.value)}
                    >
                      {tab.label}
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

        <div
          className={isDeskTab
            ? "mx-auto w-full max-w-7xl px-4 py-4 pb-24 sm:px-8 sm:py-5 lg:flex lg:h-full lg:min-h-0 lg:flex-col lg:overflow-hidden lg:pb-5"
            : "mx-auto max-w-7xl space-y-5 px-4 py-4 pb-24 sm:px-8 sm:py-5 lg:pb-5"}
        >
          {activeTab === "advisor" ? (
            <AdvisorWorkspace
              mobileView={deskMobileView}
              onForceOutcomeRefresh={() => refreshSetups({ forceOutcomeRefresh: true })}
              onMobileViewChange={setDeskMobileView}
              onOpenRequestHandled={clearAdvisorRequest}
              onSetupsChanged={() => setupState.refreshSetups({ silent: true })}
              openRequest={advisorRequest}
              profile={profile}
              setupStats={setupState.stats}
              setups={setupState.setups}
            />
          ) : null}
          {activeTab === "history" ? (
            <HistoryPanel
              initialSymbol={insightsSymbol}
              loading={setupState.loading}
              onInitialSymbolHandled={clearInsightsSymbol}
              setups={setupState.setups}
            />
          ) : null}
          {activeTab === "profile" ? (
            <ProfilePanel
              memberSince={session.user.created_at}
              onOpenDonate={() => setActiveTab("donate")}
              onSave={profileState.saveProfile}
              onSignOut={() => supabase?.auth.signOut()}
              onThemeChange={theme.setMode}
              profile={profile}
              supportMailto={SUPPORT_MAILTO}
              themeMode={theme.mode}
            />
          ) : null}
          {activeTab === "guide" ? (
            <GuidePanel anchor={guideAnchor} onAnchorHandled={clearGuideAnchor} />
          ) : null}
          {activeTab === "donate" ? (
            <DonatePanel supportEmail={SUPPORT_EMAIL} />
          ) : null}
        </div>

        {/* Profile now carries its own legal links + colophon (spec §11),
            so the page-wide footer would just duplicate them there — the
            one tab where it's skipped outright rather than merely lg:hidden
            like the Desk tab above it. */}
        {activeTab !== "profile"
          ? (
            <footer
              className={`mx-auto w-full max-w-7xl px-4 pb-8 pt-12 ${
                isDeskTab ? "lg:hidden" : ""
              }`}
            >
              <p className="colophon">A Windward Line production</p>
              <LegalLinks />
            </footer>
          )
          : null}

        <MobileTabBar
          active={activeMobileTab}
          onSelect={selectMobileTab}
          tradeBadgeCount={currentTradeBadgeCount(setupState.setups, new Date())}
        />
      </main>
    </WorkspaceNavContext.Provider>
  );
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
    document.documentElement.dataset.theme = resolvedMode;
    document.documentElement.dataset.themeMode = mode;
    window.localStorage.setItem("levelflow-theme", mode);
  }, [mode, resolvedMode]);

  return { mode, resolvedMode, setMode };
}

const MOBILE_TAB_ITEMS: Array<
  { icon: ReactNode; label: string; value: MobileTab }
> = [
  {
    icon: <LineChart className="h-5 w-5" aria-hidden="true" />,
    label: "Review",
    value: "review",
  },
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

// Spec §3: the mobile-only primary navigation, replacing the top nav pills
// below lg (those stay put at ≥lg — see the header's lg:contents split
// above). Persistent across every tab, not just the Desk one, so Review is
// always one tap away even from Guide or Profile — matching "Guide and
// Profile reachable via the avatar/menu, not the tab bar" (they're
// deliberately absent from these four buttons, not from the bar itself).
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
      <div className="mx-auto grid max-w-7xl grid-cols-4">
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
              className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs font-semibold ${
                isActive ? "text-accent" : "text-ink-muted"
              }`}
              type="button"
              onClick={() => onSelect(item.value)}
            >
              <span className="relative">
                {item.icon}
                {badge
                  ? (
                    <span
                      aria-hidden="true"
                      className="absolute -right-2 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-ink px-1 font-mono text-[10px] font-bold leading-none text-paper"
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
  onOpenDonate,
  onOpenGuide,
  onOpenProfile,
  onSignOut,
  supportMailto,
}: {
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
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-hairline bg-sheet text-ink transition hover:border-accent/40"
        type="button"
        onClick={() => setOpen((value) => !value)}
      >
        {open
          ? <X className="h-5 w-5" aria-hidden="true" />
          : <CircleUser className="h-5 w-5" aria-hidden="true" />}
      </button>

      {open
        ? (
          <div
            className="absolute right-0 top-full z-30 mt-2 w-48 overflow-hidden rounded-lg border border-hairline bg-sheet py-1 shadow-lg"
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
