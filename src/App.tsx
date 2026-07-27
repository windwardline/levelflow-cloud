import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import {
  BookOpen,
  Compass,
  Gift,
  History,
  LayoutDashboard,
  LogOut,
  Mail,
  User,
} from "lucide-react";
import { AuthScreen } from "./components/auth/AuthScreen";
import { GuidePanel } from "./components/workspace/GuidePanel";
import { HistoryPanel } from "./components/workspace/HistoryPanel";
import { OverviewPanel } from "./components/workspace/OverviewPanel";
import { AdvisorWorkspace } from "./components/workspace/AdvisorWorkspace";
import { ProfilePanel } from "./components/workspace/ProfilePanel";
import { ThemeToggle } from "./components/workspace/ThemeToggle";
import { DonatePanel } from "./components/donations/DonatePanel";
import { LegalLinks } from "./components/legal/LegalLinks";
import { useAuthSession } from "./hooks/useAuthSession";
import { useTradeSetups } from "./hooks/useTradeSetups";
import { useUserProfile } from "./hooks/useUserProfile";
import { brandAssets } from "./lib/assets";
import {
  buildDefaultProfile,
  profileDisplayName,
  type ThemeMode,
} from "./lib/profile";
import { supabase } from "./lib/supabase";

type AppTab = "advisor" | "history" | "guide" | "profile" | "about" | "donate";

const SUPPORT_EMAIL = "help@windwardline.com";
// Support is a shared inbox across apps, so every mailto names the app it
// came from — otherwise an inbound message arrives with no way to route it.
const SUPPORT_MAILTO = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("[LevelFlow] Help")}`;

const TABS: Array<{ icon: ReactNode; label: string; value: AppTab }> = [
  {
    icon: <LayoutDashboard className="h-4 w-4" aria-hidden="true" />,
    label: "Advisor",
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
    icon: <Compass className="h-4 w-4" aria-hidden="true" />,
    label: "About",
    value: "about",
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
  "about",
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
  const setupState = useTradeSetups();
  const profileState = useUserProfile(
    session?.user.id ?? null,
    session?.user.email ?? "",
    theme.setMode,
  );

  useEffect(() => {
    if (session && activeTab === "history") {
      setupState.refreshSetups({ forceOutcomeRefresh: true });
    }
  }, [activeTab, session, setupState.refreshSetups]);

  useEffect(() => {
    if (typeof window === "undefined" || !PERSISTED_TABS.has(activeTab)) {
      return;
    }

    window.localStorage.setItem(LAST_TAB_STORAGE_KEY, activeTab);
  }, [activeTab]);

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-canvas px-6 text-navy">
        <div className="terminal-panel w-full max-w-sm p-6 text-center">
          <div className="mx-auto mb-4 h-10 w-10 animate-pulse rounded-lg bg-navy/90" />
          <p className="font-semibold">Opening LevelFlow</p>
        </div>
      </main>
    );
  }

  if (!session) {
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

  return (
    <main className="min-h-screen bg-canvas text-ink">
      <header className="sticky top-0 z-20 border-b border-slate/15 bg-white/90 backdrop-blur">
        <div className="mx-auto max-w-7xl px-4 py-3 sm:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <img
              className="h-10 w-10 shrink-0 rounded-lg object-contain sm:h-11 sm:w-11"
              src={brandAssets.mark}
              alt="Windward Line mark"
            />
            <div className="min-w-0">
              <p className="text-[0.7rem] font-semibold uppercase tracking-normal text-slate sm:text-xs">
                Windward Line
              </p>
              <h1 className="truncate text-xl font-semibold tracking-normal text-navy sm:text-2xl">
                LevelFlow
              </h1>
              <p className="truncate text-xs font-medium text-slate">
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
              className="secondary-button hidden min-h-10 px-3 py-2 lg:inline-flex"
              href={SUPPORT_MAILTO}
            >
              <Mail className="h-4 w-4" aria-hidden="true" />
              Help
            </a>
            <button
              className="secondary-button min-h-10 px-3 py-2"
              type="button"
              onClick={() => setActiveTab("donate")}
            >
              <Gift className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">Donate</span>
            </button>
            <button
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
            aria-label="LevelFlow sections"
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

      <div className="mx-auto max-w-7xl space-y-5 px-4 py-4 sm:px-8 sm:py-5">
        {activeTab === "advisor" ? (
          <AdvisorWorkspace
            onSetupsChanged={() => setupState.refreshSetups({ silent: true })}
            profile={profile}
            setupStats={setupState.stats}
            setups={setupState.setups}
          />
        ) : null}
        {activeTab === "about" ? <OverviewPanel /> : null}
        {activeTab === "history" ? (
          <HistoryPanel
            categoryStats={setupState.categoryStats}
            loading={setupState.loading}
            setups={setupState.setups}
            stats={setupState.stats}
            summary={setupState.outcomeSummary}
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
          <GuidePanel supportEmail={SUPPORT_EMAIL} />
        ) : null}
        {activeTab === "donate" ? (
          <DonatePanel supportEmail={SUPPORT_EMAIL} />
        ) : null}

        <footer className="pb-4">
          <LegalLinks />
        </footer>
      </div>
    </main>
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
