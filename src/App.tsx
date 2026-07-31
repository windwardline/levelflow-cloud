import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BookOpen,
  Gift,
  History,
  LayoutDashboard,
  LogOut,
  Mail,
  User,
} from "lucide-react";
import { AuthScreen } from "./components/auth/AuthScreen";
import { ParkingScreen } from "./components/auth/ParkingScreen";
import { PARKING_GATE, parkingBypassActive } from "./lib/parkingGate";
import { GuidePanel } from "./components/workspace/GuidePanel";
import { HistoryPanel } from "./components/workspace/HistoryPanel";
import { AdvisorWorkspace } from "./components/workspace/AdvisorWorkspace";
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
  profileDisplayName,
  type ThemeMode,
} from "./lib/profile";
import { supabase } from "./lib/supabase";

type AppTab = "advisor" | "history" | "guide" | "profile" | "donate";

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

  const workspaceNav = useMemo<WorkspaceNav>(() => ({
    openGuide: (anchor) => { setGuideAnchor(anchor); setActiveTab("guide"); },
    openAdvisor: (symbol) => { setAdvisorRequest({ symbol, token: Date.now() }); setActiveTab("advisor"); },
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
            <div className="flex min-w-0 items-center gap-3">
              <div className="min-w-0">
                <p className="wordmark text-lg text-ink">Levelflow</p>
                <p className="truncate text-xs text-ink-muted">
                  Welcome, {profileDisplayName(profile)}
                </p>
              </div>
              <div className="ml-auto sm:hidden">
                <ThemeToggle compact mode={theme.mode} onChange={theme.setMode} />
              </div>
              <div className="ml-auto hidden sm:block">
                <ThemeToggle mode={theme.mode} onChange={theme.setMode} />
              </div>
              <a
                aria-label="Help"
                className="secondary-button min-h-10 px-3 py-2"
                href={SUPPORT_MAILTO}
              >
                <Mail className="h-4 w-4" aria-hidden="true" />
                <span className="hidden sm:inline">Help</span>
              </a>
              <button
                aria-label="Donate"
                className="secondary-button min-h-10 px-3 py-2"
                type="button"
                onClick={() => setActiveTab("donate")}
              >
                <Gift className="h-4 w-4" aria-hidden="true" />
                <span className="hidden sm:inline">Donate</span>
              </button>
              <button
                aria-label="Sign out"
                className="secondary-button min-h-10 px-3 py-2"
                type="button"
                onClick={() => supabase?.auth.signOut()}
              >
                <LogOut className="h-4 w-4" aria-hidden="true" />
                <span className="hidden sm:inline">Sign out</span>
              </button>
            </div>

            <nav
              className="-mx-1 mt-3 flex gap-2 overflow-x-auto px-1 pb-1"
              aria-label="Levelflow sections"
            >
              {TABS.map((tab) => (
                <button
                  key={tab.value}
                  className={`nav-button shrink-0 ${activeTab === tab.value ? "nav-button-active" : ""}`}
                  type="button"
                  onClick={() => setActiveTab(tab.value)}
                >
                  {tab.icon}
                  {tab.label}
                </button>
              ))}
            </nav>
          </div>
        </header>

        <div
          className={isDeskTab
            ? "mx-auto w-full max-w-7xl px-4 py-4 sm:px-8 sm:py-5 lg:flex lg:h-full lg:min-h-0 lg:flex-col lg:overflow-hidden"
            : "mx-auto max-w-7xl space-y-5 px-4 py-4 sm:px-8 sm:py-5"}
        >
          {activeTab === "advisor" ? (
            <AdvisorWorkspace
              onForceOutcomeRefresh={() => refreshSetups({ forceOutcomeRefresh: true })}
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
              onSave={profileState.saveProfile}
              onThemeChange={theme.setMode}
              profile={profile}
              saveStatus={profileState.status}
              setups={setupState.setups}
              summary={setupState.outcomeSummary}
              themeMode={theme.mode}
            />
          ) : null}
          {activeTab === "guide" ? (
            <GuidePanel
              anchor={guideAnchor}
              onAnchorHandled={clearGuideAnchor}
              supportEmail={SUPPORT_EMAIL}
            />
          ) : null}
          {activeTab === "donate" ? (
            <DonatePanel supportEmail={SUPPORT_EMAIL} />
          ) : null}
        </div>

        <footer
          className={`mx-auto w-full max-w-7xl px-4 pb-8 pt-12 ${
            isDeskTab ? "lg:hidden" : ""
          }`}
        >
          <p className="colophon">A Windward Line production</p>
          <LegalLinks />
        </footer>
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
