import type { FormEvent, ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { BookOpen, Gift, History, LayoutDashboard, LogOut, Mail, Monitor, Moon, Sun, User } from "lucide-react";
import { AuthScreen } from "./components/auth/AuthScreen";
import { AdvisorWorkspace } from "./components/workspace/AdvisorWorkspace";
import { DonationOptions } from "./components/donations/DonationOptions";
import { LegalLinks } from "./components/legal/LegalLinks";
import { useAuthSession } from "./hooks/useAuthSession";
import { useTradeSetups, type CategoryStat, type OutcomeSummary, type SecurityStat } from "./hooks/useTradeSetups";
import { useUserProfile } from "./hooks/useUserProfile";
import { brandAssets } from "./lib/assets";
import { buildDefaultProfile, profileDisplayName, PREFERRED_SESSION_OPTIONS, US_STATE_TIME_ZONES, type ThemeMode, type UserProfile } from "./lib/profile";
import { supabase } from "./lib/supabase";
import type { ChartTimeframe } from "./lib/marketData";
import type { TradeSetupRow } from "./lib/tradeAnalyzer";

type AppTab = "advisor" | "history" | "profile" | "guide" | "donate";

const SUPPORT_EMAIL = "support@windwardline.com";

const TABS: Array<{ icon: ReactNode; label: string; value: AppTab }> = [
  { icon: <LayoutDashboard className="h-4 w-4" aria-hidden="true" />, label: "Advisor", value: "advisor" },
  { icon: <History className="h-4 w-4" aria-hidden="true" />, label: "History", value: "history" },
  { icon: <User className="h-4 w-4" aria-hidden="true" />, label: "Profile", value: "profile" },
  { icon: <BookOpen className="h-4 w-4" aria-hidden="true" />, label: "Guide", value: "guide" },
  { icon: <Gift className="h-4 w-4" aria-hidden="true" />, label: "Donate", value: "donate" },
];

export default function App() {
  const theme = useThemePreference();
  const { session, loading } = useAuthSession();
  const [activeTab, setActiveTab] = useState<AppTab>("advisor");
  const setupState = useTradeSetups();
  const profileState = useUserProfile(session?.user.id ?? null, session?.user.email ?? "", theme.setMode);

  useEffect(() => {
    if (session && activeTab === "history") {
      setupState.refreshSetups({ forceOutcomeRefresh: true });
    }
  }, [activeTab, session, setupState.refreshSetups]);

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-canvas px-6 text-navy">
        <div className="terminal-panel w-full max-w-sm p-6 text-center">
          <div className="mx-auto mb-4 h-10 w-10 animate-pulse rounded-lg bg-navy/90" />
          <p className="font-semibold">Opening LevelFlow Cloud</p>
        </div>
      </main>
    );
  }

  if (!session) {
    return <AuthScreen themeControl={<ThemeToggle compact mode={theme.mode} onChange={theme.setMode} />} />;
  }

  const profile = profileState.profile ?? buildDefaultProfile(session.user.id, session.user.email ?? "");

  return (
    <main className="min-h-screen bg-canvas text-ink">
      <header className="sticky top-0 z-20 border-b border-slate/15 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-3 sm:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <img className="h-10 w-10 shrink-0 rounded-lg object-contain sm:h-11 sm:w-11" src={brandAssets.mark} alt="Windward Line mark" />
            <div className="min-w-0">
              <p className="text-[0.7rem] font-semibold uppercase tracking-normal text-slate sm:text-xs">Windward Line</p>
              <h1 className="truncate text-xl font-semibold tracking-normal text-navy sm:text-2xl">LevelFlow</h1>
              <p className="truncate text-xs font-medium text-slate">Welcome, {profileDisplayName(profile)}</p>
            </div>
            <div className="ml-auto sm:hidden">
              <ThemeToggle compact mode={theme.mode} onChange={theme.setMode} />
            </div>
            <div className="ml-auto hidden sm:block">
              <ThemeToggle mode={theme.mode} onChange={theme.setMode} />
            </div>
            <button className="secondary-button min-h-10 px-3 py-2" type="button" onClick={() => supabase?.auth.signOut()}>
              <LogOut className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </div>

          <nav className="-mx-1 mt-3 flex gap-2 overflow-x-auto px-1 pb-1" aria-label="LevelFlow sections">
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
        {activeTab === "advisor" ? <AdvisorWorkspace onSetupsChanged={() => setupState.refreshSetups({ silent: true })} profile={profile} setupStats={setupState.stats} setups={setupState.setups} /> : null}
        {activeTab === "history" ? (
          <HistoryPanel categoryStats={setupState.categoryStats} loading={setupState.loading} setups={setupState.setups} stats={setupState.stats} summary={setupState.outcomeSummary} />
        ) : null}
        {activeTab === "profile" ? (
          <ProfilePanel onSave={profileState.saveProfile} onThemeChange={theme.setMode} profile={profile} saveStatus={profileState.status} themeMode={theme.mode} />
        ) : null}
        {activeTab === "guide" ? <GuidePanel /> : null}
        {activeTab === "donate" ? <DonatePanel /> : null}

        <footer className="pb-4">
          <LegalLinks />
        </footer>
      </div>
    </main>
  );
}

function HistoryPanel({
  categoryStats,
  loading,
  setups,
  stats,
  summary,
}: {
  categoryStats: CategoryStat[];
  loading: boolean;
  setups: TradeSetupRow[];
  stats: SecurityStat[];
  summary: OutcomeSummary;
}) {
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(280px,0.6fr)]">
      <section className="terminal-panel p-5 sm:p-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-normal text-bullish">Trade journal</p>
            <h2 className="text-2xl font-semibold tracking-normal text-navy">Recommendations</h2>
          </div>
          <p className="text-sm font-semibold text-slate">{loading ? "Loading" : `${setups.length} saved setups`}</p>
        </div>

        <div className="mb-5 grid gap-3 sm:grid-cols-4">
          <StatPill label="Overall win rate" value={summary.winRate === null ? "Pending" : `${summary.winRate}%`} />
          <StatPill label="Resolved" value={summary.resolved.toString()} />
          <StatPill label="Take profit" value={summary.wins.toString()} />
          <StatPill label="Stop loss" value={summary.losses.toString()} />
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-slate/15 text-xs uppercase tracking-normal text-slate">
              <tr>
                <th className="py-3 pr-4 font-semibold">Date</th>
                <th className="py-3 pr-4 font-semibold">Asset</th>
                <th className="py-3 pr-4 font-semibold">Side</th>
                <th className="py-3 pr-4 font-semibold">Entry</th>
                <th className="py-3 pr-4 font-semibold">Stop</th>
                <th className="py-3 pr-4 font-semibold">Target</th>
                <th className="py-3 pr-4 font-semibold">Confidence</th>
                <th className="py-3 pr-4 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {setups.map((setup) => (
                <tr key={setup.id} className="border-b border-slate/10">
                  <td className="py-3 pr-4 text-slate">{formatDate(setup.created_at)}</td>
                  <td className="py-3 pr-4 font-semibold text-navy">{setup.symbol}</td>
                  <td className={`py-3 pr-4 font-bold uppercase ${setup.side === "buy" ? "text-bullish" : "text-danger"}`}>{setup.side} limit</td>
                  <td className="py-3 pr-4 text-navy">{formatNumber(Number(setup.limit_entry))}</td>
                  <td className="py-3 pr-4 text-navy">{formatNumber(Number(setup.stop_loss))}</td>
                  <td className="py-3 pr-4 text-navy">{formatNumber(Number(setup.take_profit))}</td>
                  <td className="py-3 pr-4 font-semibold text-navy">{Number(setup.confidence_score)}%</td>
                  <td className="py-3 pr-4 text-slate">{formatOutcome(setup)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!loading && setups.length === 0 ? <p className="mt-4 text-sm leading-6 text-slate">No recommendations have been logged yet.</p> : null}
      </section>

      <section className="terminal-panel p-5 sm:p-6">
        <div className="mb-5">
          <p className="text-xs font-semibold uppercase tracking-normal text-bullish">Asset trends</p>
          <h2 className="text-2xl font-semibold tracking-normal text-navy">Stats</h2>
        </div>
        <div className="grid gap-3">
          {categoryStats.map((stat) => (
            <div key={stat.category} className="rounded-lg border border-bullish/20 bg-bullish/10 p-3">
              <div className="flex items-center justify-between gap-3">
                <p className="font-semibold text-navy">{stat.category}</p>
                <p className="text-sm font-semibold text-slate">{stat.count} setups</p>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                <StatPill label="Win rate" value={stat.winRate === null ? "Pending" : `${stat.winRate}%`} />
                <StatPill label="TP / SL" value={`${stat.wins}/${stat.losses}`} />
                <StatPill label="Pending" value={stat.pending.toString()} />
              </div>
            </div>
          ))}
          {stats.map((stat) => (
            <div key={stat.symbol} className="rounded-lg border border-slate/15 bg-canvas p-3">
              <div className="flex items-center justify-between gap-3">
                <p className="font-semibold text-navy">{stat.symbol}</p>
                <p className="text-sm font-semibold text-slate">{stat.count} setups</p>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                <StatPill label="Win rate" value={stat.winRate === null ? "Pending" : `${stat.winRate}%`} />
                <StatPill label="TP / SL" value={`${stat.wins}/${stat.losses}`} />
                <StatPill label="Pending" value={stat.pending.toString()} />
              </div>
            </div>
          ))}
        </div>
        {stats.length === 0 ? <p className="text-sm leading-6 text-slate">Stats will populate as recommendations are reviewed and outcomes are recorded.</p> : null}
      </section>
    </div>
  );
}

function ProfilePanel({
  onSave,
  onThemeChange,
  profile,
  saveStatus,
  themeMode,
}: {
  onSave: (input: Pick<UserProfile, "defaultTimeframe" | "defaultTimezone" | "displayName" | "marketFocus" | "preferredSession" | "themePreference">) => Promise<void>;
  onThemeChange: (mode: ThemeMode) => void;
  profile: UserProfile;
  saveStatus: "idle" | "saving" | "saved";
  themeMode: ThemeMode;
}) {
  const [displayName, setDisplayName] = useState(profile.displayName);
  const [timezone, setTimezone] = useState(profile.defaultTimezone);
  const [marketFocus, setMarketFocus] = useState(profile.marketFocus);
  const [defaultTimeframe, setDefaultTimeframe] = useState<ChartTimeframe>(profile.defaultTimeframe);
  const [preferredSession, setPreferredSession] = useState(profile.preferredSession);
  const [saveError, setSaveError] = useState("");

  useEffect(() => {
    setDisplayName(profile.displayName);
    setTimezone(profile.defaultTimezone);
    setMarketFocus(profile.marketFocus);
    setDefaultTimeframe(profile.defaultTimeframe);
    setPreferredSession(profile.preferredSession);
  }, [profile]);

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaveError("");

    try {
      await onSave({
        defaultTimeframe,
        defaultTimezone: timezone,
        displayName,
        marketFocus,
        preferredSession,
        themePreference: themeMode,
      });
    } catch {
      setSaveError("Profile could not be saved. Try again after the connection refreshes.");
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,0.95fr)_minmax(300px,0.55fr)]">
      <form className="terminal-panel p-5 sm:p-6" onSubmit={saveProfile}>
        <div className="mb-5">
          <p className="text-xs font-semibold uppercase tracking-normal text-bullish">User profile</p>
          <h2 className="text-2xl font-semibold tracking-normal text-navy">Workspace preferences</h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-2 text-sm font-semibold text-navy">
            Display name
            <input className="field" value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Trader name" />
          </label>
          <label className="grid gap-2 text-sm font-semibold text-navy">
            U.S. timezone
            <select className="field" value={timezone} onChange={(event) => setTimezone(event.target.value)}>
              {US_STATE_TIME_ZONES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-2 text-sm font-semibold text-navy">
            Market focus
            <select className="field" value={marketFocus} onChange={(event) => setMarketFocus(event.target.value as UserProfile["marketFocus"])}>
              <option value="multi_asset">Multi-asset</option>
              <option value="forex">Forex</option>
              <option value="metals">Metals</option>
              <option value="crypto">Crypto</option>
              <option value="futures">Futures</option>
            </select>
          </label>
          <label className="grid gap-2 text-sm font-semibold text-navy">
            Preferred session
            <select className="field" value={preferredSession} onChange={(event) => setPreferredSession(event.target.value as UserProfile["preferredSession"])}>
              {PREFERRED_SESSION_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-2 text-sm font-semibold text-navy">
            Default chart timeframe
            <select className="field" value={defaultTimeframe} onChange={(event) => setDefaultTimeframe(event.target.value as ChartTimeframe)}>
              <option value="15min">15 minutes</option>
              <option value="1hour">1 hour</option>
              <option value="4hour">4 hours</option>
              <option value="1day">Daily</option>
            </select>
          </label>
          <div className="grid gap-2 text-sm font-semibold text-navy">
            Theme
            <ThemeToggle mode={themeMode} onChange={onThemeChange} />
          </div>
        </div>
        {saveError ? <p className="mt-4 rounded-lg bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">{saveError}</p> : null}
        <button className="primary-button mt-5" type="submit" disabled={saveStatus === "saving"}>
          {saveStatus === "saving" ? "Saving..." : saveStatus === "saved" ? "Profile saved" : "Save profile"}
        </button>
      </form>

      <section className="terminal-panel p-5 sm:p-6">
        <p className="text-xs font-semibold uppercase tracking-normal text-bullish">Profile impact</p>
        <h2 className="mt-1 text-2xl font-semibold tracking-normal text-navy">How LevelFlow uses it</h2>
        <div className="mt-4 grid gap-3 text-sm leading-6 text-slate">
          <p>Your name appears in the workspace header so shared machines are easier to verify at a glance.</p>
          <p>Your U.S. timezone drives the market open and close countdowns. Daylight saving time is handled automatically by the selected timezone.</p>
          <p>Market focus selects the first advisor asset for a new session. Preferred session highlights the global session you care about most.</p>
          <p>Default timeframe opens new chart work on your preferred view, and theme preference keeps the workspace readable in your environment.</p>
        </div>
      </section>
    </div>
  );
}

function GuidePanel() {
  return (
    <section className="terminal-panel p-5 sm:p-6">
      <div className="mb-6 flex items-center gap-3">
        <BookOpen className="h-5 w-5 text-navy" aria-hidden="true" />
        <div>
          <p className="text-xs font-semibold uppercase tracking-normal text-bullish">Operating guide</p>
          <h2 className="text-2xl font-semibold tracking-normal text-navy">How to use LevelFlow</h2>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <GuideStep
          number="01"
          title="Start with one asset"
          body="Open Advisor, choose one asset from the grouped dropdown, and begin on your saved default timeframe. Review the chart first: drag left for more history, scroll or pinch to zoom, and reset the view when you want the full context back."
        />
        <GuideStep
          number="02"
          title="Generate a limit-only setup"
          body="Click Generate setup when you want LevelFlow's current best pending limit-order idea. The analyzer reviews trend, market structure, liquidity behavior, momentum, volatility, value/volume behavior, multi-timeframe alignment, correlation, session quality, and calendar risk."
        />
        <GuideStep
          number="03"
          title="Read buy versus sell first"
          body="The recommendation badge is green for BUY LIMIT and red for SELL LIMIT. Check that side before copying any level into another platform."
        />
        <GuideStep
          number="04"
          title="Use the plotted levels"
          body="When a setup qualifies, the chart plots entry, stop loss, and take profit. The entry is always a pending limit level: buy entries are below current market and sell entries are above current market."
        />
        <GuideStep
          number="05"
          title="Re-check without duplicate clutter"
          body="You can generate again for the same asset to see whether the best setup changed. LevelFlow refreshes the current recommendation, updates still-viable active setups, and avoids creating duplicate history rows."
        />
        <GuideStep
          number="06"
          title="Review your history"
          body="Open History to review prior recommendations, confidence scores, entry/stop/target, and status. Outcome stats show take-profit hits, stop-loss hits, unfilled ideas, and win rate by asset and category."
        />
        <GuideStep
          number="07"
          title="Keep preferences current"
          body="Open Profile to set display name, timezone, market focus, preferred session, default chart timeframe, and theme preference. These settings shape the workspace without changing the analyzer's quality threshold."
        />
        <GuideStep
          number="08"
          title="Remember what LevelFlow does"
          body="LevelFlow evaluates market conditions and produces advisory trade setups. It does not place, modify, close, or size trades for you."
        />
      </div>

      <div className="mt-5 rounded-lg border border-slate/15 bg-canvas p-4">
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-normal text-bullish">Support contact</p>
            <h3 className="mt-1 text-lg font-semibold text-navy">Questions, access, or data issues</h3>
            <p className="mt-1 text-sm leading-6 text-slate">Send the asset, timeframe, and a short description of what you saw so the issue can be reproduced quickly.</p>
          </div>
          <a className="secondary-button shrink-0" href={`mailto:${SUPPORT_EMAIL}`}>
            <Mail className="h-4 w-4" aria-hidden="true" />
            {SUPPORT_EMAIL}
          </a>
        </div>
      </div>
    </section>
  );
}

function DonatePanel() {
  const donationFallbackHref = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("LevelFlow development support")}&body=${encodeURIComponent(
    "I would like the current donation link for LevelFlow development and maintenance.",
  )}`;

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,0.8fr)_minmax(280px,0.4fr)]">
      <section className="terminal-panel p-5 sm:p-6">
        <div className="mb-5 flex items-center gap-3">
          <Gift className="h-5 w-5 text-navy" aria-hidden="true" />
          <div>
            <p className="text-xs font-semibold uppercase tracking-normal text-bullish">Development fund</p>
            <h2 className="text-2xl font-semibold tracking-normal text-navy">Donate</h2>
          </div>
        </div>
        <DonationOptions fallbackHref={donationFallbackHref} />
      </section>
      <section className="terminal-panel p-5 sm:p-6">
        <p className="text-xs font-semibold uppercase tracking-normal text-bullish">What donations support</p>
        <h2 className="mt-1 text-2xl font-semibold tracking-normal text-navy">App costs</h2>
        <p className="mt-4 text-sm leading-6 text-slate">
          Donations go toward market-data access, authentication email delivery, hosting, database capacity, testing, and continued LevelFlow development.
        </p>
      </section>
    </div>
  );
}

function ThemeToggle({ compact = false, mode, onChange }: { compact?: boolean; mode: ThemeMode; onChange: (mode: ThemeMode) => void }) {
  const options: Array<{ icon: ReactNode; label: string; value: ThemeMode }> = [
    { icon: <Sun className="h-4 w-4" aria-hidden="true" />, label: "Light", value: "light" },
    { icon: <Moon className="h-4 w-4" aria-hidden="true" />, label: "Dark", value: "dark" },
    { icon: <Monitor className="h-4 w-4" aria-hidden="true" />, label: "System", value: "system" },
  ];

  return (
    <div className="inline-flex rounded-lg border border-slate/20 bg-white p-1" aria-label="Theme">
      {options.map((option) => (
        <button
          key={option.value}
          className={`flex min-h-8 items-center gap-1.5 rounded-md px-2 text-xs font-bold transition ${mode === option.value ? "bg-bullish/15 text-bullish" : "text-slate hover:text-navy"}`}
          type="button"
          onClick={() => onChange(option.value)}
        >
          {option.icon}
          {compact ? <span className="sr-only">{option.label}</span> : option.label}
        </button>
      ))}
    </div>
  );
}

function GuideStep({ body, number, title }: { body: string; number: string; title: string }) {
  return (
    <div className="grid min-w-0 gap-3 rounded-lg border border-slate/15 bg-canvas px-4 py-4 sm:grid-cols-[auto_minmax(0,1fr)]">
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-navy text-sm font-semibold text-white">{number}</div>
      <div className="min-w-0">
        <h3 className="font-semibold text-navy">{title}</h3>
        <p className="mt-1 text-sm leading-6 text-slate">{body}</p>
      </div>
    </div>
  );
}

function StatPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-white px-2 py-2">
      <p className="font-semibold text-navy">{value}</p>
      <p className="text-slate">{label}</p>
    </div>
  );
}

function useThemePreference() {
  const [mode, setMode] = useState<ThemeMode>(() => {
    if (typeof window === "undefined") {
      return "system";
    }
    const stored = window.localStorage.getItem("levelflow-theme");
    return stored === "light" || stored === "dark" || stored === "system" ? stored : "system";
  });
  const [systemDark, setSystemDark] = useState(() => (typeof window === "undefined" ? false : window.matchMedia("(prefers-color-scheme: dark)").matches));

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

  const resolvedMode = useMemo(() => (mode === "system" ? (systemDark ? "dark" : "light") : mode), [mode, systemDark]);

  useEffect(() => {
    document.documentElement.dataset.theme = resolvedMode;
    document.documentElement.dataset.themeMode = mode;
    window.localStorage.setItem("levelflow-theme", mode);
  }, [mode, resolvedMode]);

  return { mode, resolvedMode, setMode };
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatNumber(value: number) {
  return value.toLocaleString(undefined, {
    maximumFractionDigits: 5,
  });
}

function formatOutcome(setup: TradeSetupRow) {
  const outcome = setup.trade_outcomes?.[0]?.outcome;
  if (outcome === "take_profit") {
    return "Take profit";
  }
  if (outcome === "stop_loss") {
    return "Stop loss";
  }
  if (outcome === "unfilled" || outcome === "expired" || setup.status === "expired") {
    return "Unfilled";
  }
  if (setup.status === "invalidated") {
    return "Invalidated";
  }
  if (setup.status === "placed") {
    return "Live / filled";
  }
  return "Pending";
}
