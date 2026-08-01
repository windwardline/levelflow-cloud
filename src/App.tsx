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
  ListChecks,
  Loader2,
  LogOut,
  Mail,
  Radar,
  UserRound,
  X,
} from "lucide-react";
import { AppFooter } from "./components/AppFooter";
import { LEGAL_LINKS } from "./components/legal/LegalLinks";
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
import { useAuthSession } from "./hooks/useAuthSession";
import { useIsMobileViewport } from "./hooks/useMobileViewport";
import { useTradeSetups } from "./hooks/useTradeSetups";
import { useUserProfile } from "./hooks/useUserProfile";
import {
  buildDefaultProfile,
  type ThemeMode,
} from "./lib/profile";
import { supabase } from "./lib/supabase";

type AppTab = "advisor" | "history" | "guide" | "profile" | "donate";
// The three bottom-tab-bar destinations (spec §17e). Two of them ("scan" |
// "trades") are sub-views of the single "advisor" AppTab — see deskMobileView
// below — so the tab bar's own selection model is a distinct, slightly wider
// union from AppTab rather than a one-to-one mirror of it. Profile and Guide
// stay in the avatar menu, and the old "Review" tab is gone: its surface merged
// into "scan" (m-scan-v3.html).
type MobileTab = "scan" | "trades" | "insights";

const SUPPORT_EMAIL = "help@windwardline.com";
// Support is a shared inbox across apps, so every mailto names the app it
// came from — otherwise an inbound message arrives with no way to route it.
const SUPPORT_MAILTO = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("[Levelflow] Help")}`;

// Text only: spec §16 killed icon-chip nav on desktop, and the masthead
// renders {tab.label} alone. The mobile tab bar keeps its own separate icon
// set (MOBILE_TAB_ITEMS) — these four were built on every load and discarded.
const TABS: Array<{ label: string; value: AppTab }> = [
  { label: "Desk", value: "advisor" },
  { label: "Insights", value: "history" },
  { label: "Guide", value: "guide" },
  { label: "Profile", value: "profile" },
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
  // Read here with the rest of the hooks, used far below: the pre-auth returns
  // sit between the two, and a hook after an early return is a hook that runs
  // in a different order on different renders.
  const isMobileViewport = useIsMobileViewport();
  const [activeTab, setActiveTab] = useState<AppTab>(() => getInitialAppTab());
  const [guideAnchor, setGuideAnchor] = useState<GuideAnchor | null>(null);
  const [advisorRequest, setAdvisorRequest] = useState<{ symbol: string; token: number } | null>(null);
  const [insightsSymbol, setInsightsSymbol] = useState<string | null>(null);
  // The mobile tab bar's own sub-selection within the Desk (spec §17e: Scan /
  // Trades). Kept separate from activeTab rather than folded into it: both map
  // to the same "advisor" AppTab, so AdvisorWorkspace stays mounted (and its
  // symbol/scanResult/analysisState/clockNow state intact) while the bar flips
  // between them — remounting on every tap would be a much worse mobile
  // experience than desktop's "just look at another column".
  const [deskMobileView, setDeskMobileView] = useState<DeskMobileView>("scan");

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
  // Insights is a whole AppTab, Scan/Trades are sub-views of the "advisor"
  // one. selectMobileTab is the one place that maps a tap onto both;
  // activeMobileTab is its read-side mirror, used only to decide which of the
  // three buttons (if any) renders as current.
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
    // I3: also lands mobile on the merged Scan surface — without this, a jump
    // here (e.g. Insights' "Open X in Advisor" row button) could leave a mobile
    // user staring at the Trades tab instead of the market they just asked to
    // see. "scan" IS that market's surface now (spec §17e): its head, chart and
    // ladder all follow the requested symbol.
    openAdvisor: (symbol) => {
      setAdvisorRequest({ symbol, token: Date.now() });
      setActiveTab("advisor");
      setDeskMobileView("scan");
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

  if (loading) {
    // Fix wave 2B: no mock covers this pre-auth data-loading gate, but it
    // was the branch's one unjustified boxed-card survivor (final review's
    // own inventory) — flattened to a minimal centered wordmark and the
    // system's own spinner idiom (Loader2 + animate-spin), the same
    // pairing every other loading state in the app already uses.
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-paper px-6 text-center text-ink">
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

  // The mobile account trigger is an initial-in-circle (m-mobile-v3.html:44).
  // The letter comes from the signed-in email rather than a profile display
  // name: the email is the identity every session has, it is what the avatar
  // is standing in for, and it never changes shape while a profile save is in
  // flight. Empty when a session somehow carries no email — the trigger falls
  // back to its icon rather than rendering a blank circle.
  const accountInitial = (session.user.email ?? "").trim().charAt(0)
    .toUpperCase();

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
                <BrokerChip compact />
                <MobileAccountMenu
                  initial={accountInitial}
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
                      onClick={() => setActiveTab(tab.value)}
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
          key={activeTab}
          className={isMobileViewport
            // Every mobile surface owns its own gutters and its own bottom
            // clearance (spec §17g, m-scan-v3.html:29,32), so this wrapper
            // contributes nothing but the fixed column they live in.
            ? "motion-fade-in flex w-full min-h-0 flex-col overflow-hidden"
            // The sm: pad is top-axis only, deliberately. Both scrolling
            // branches reserve pb-24 for the fixed MobileTabBar, which is
            // mounted at every width below lg — and a padding-block utility
            // beats a padding-bottom one whenever Tailwind emits it later, which
            // it does for a variant. Measured in the built CSS, the block form
            // of this utility landed ~9kB after .pb-24, so the reserve silently
            // collapsed from 96px to 20px across the whole 640-1023px band while
            // the bar was still there. Padding only the top leaves the pb chain
            // intact (pb-24 below lg, lg:pb-5 above it) and changes nothing at
            // >=lg, where lg:pb-5 already computed the same 20px the block form
            // was handing it.
            // Both ≥lg branches are reached at ≥lg only since §17g, and both keep
            // every utility they had: they are what the frozen desktop cascade is
            // built from, and the tab-bar reserve below stays as the guard that
            // pins the hazard the comment describes.
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
        >
          {activeTab === "advisor" ? (
            <AdvisorWorkspace
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
            <GuidePanel
              anchor={guideAnchor}
              onAnchorHandled={clearGuideAnchor}
              onOpenDonate={() => setActiveTab("donate")}
              supportMailto={SUPPORT_MAILTO}
            />
          ) : null}
          {activeTab === "donate" ? (
            <DonatePanel supportEmail={SUPPORT_EMAIL} />
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
            onOpenDonate={() => setActiveTab("donate")}
            supportMailto={SUPPORT_MAILTO}
          />
        )}

        <MobileTabBar
          active={activeMobileTab}
          onSelect={selectMobileTab}
          tradeBadgeCount={currentTradeBadgeCount(setupState.setups, new Date())}
        />
      </main>
    </WorkspaceNavContext.Provider>
  );
}

// The page shell, in its two shapes — one per platform, since §17i (desktop) and
// §17g (mobile) now ask for the same thing: a fixed frame, chrome pinned, one
// region scrolling between. Neither shape scrolls as a document, so neither is a
// min-height flex column any more and nothing is left for AppFooter's own
// mt-auto to push against — the footer is a row of the grid instead, which is
// what makes "always visible" structural rather than a consequence of content
// height.
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

  return { mode, resolvedMode, setMode };
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
              className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-[10.5px] font-bold uppercase tracking-[0.1em] ${
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
  initial,
  onOpenDonate,
  onOpenGuide,
  onOpenProfile,
  onSignOut,
  supportMailto,
}: {
  // The signed-in email's first letter, uppercased — see App's accountInitial.
  // Empty when the session carries no email, which the trigger handles.
  initial: string;
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
        // The mock's avatar (m-mobile-v3.html:44, and unchanged behind the
        // open sheet at m-mobile-v3-menu.html:33): a circle on sheet with a
        // 1.5px hairline border carrying the account's initial in 13px bold.
        // Held at the kit's 44px tap target rather than the mock's 34px —
        // spec §16 trims padding and type size, never the hit area. The open
        // state keeps its ✕ so the trigger still says what tapping it does;
        // neither mock draws this menu open.
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-[1.5px] border-hairline bg-sheet text-[13px] font-bold text-ink transition hover:border-accent/40"
        type="button"
        onClick={() => setOpen((value) => !value)}
      >
        {open
          ? <X className="h-5 w-5" aria-hidden="true" />
          : initial || <CircleUser className="h-5 w-5" aria-hidden="true" />}
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
              {LEGAL_LINKS.map((link) => (
                <a
                  key={link.href}
                  className="inline-flex min-h-11 items-center transition hover:text-ink"
                  href={link.href}
                  rel="noopener noreferrer"
                  role="menuitem"
                  target="_blank"
                  onClick={closeAndFocusTrigger}
                >
                  {link.label}
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
