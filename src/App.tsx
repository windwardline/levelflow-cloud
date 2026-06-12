import type { FormEvent, ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowRight,
  BookOpen,
  Crosshair,
  Gift,
  History,
  LayoutDashboard,
  Layers3,
  LineChart,
  LogOut,
  Mail,
  Monitor,
  Moon,
  Radar,
  ShieldCheck,
  Sun,
  Target,
  TrendingUp,
  User,
} from "lucide-react";
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
import { getSecurityOption } from "./lib/symbolMap";
import type { ChartTimeframe } from "./lib/marketData";
import type { TradeSetupRow } from "./lib/tradeAnalyzer";

type AppTab = "advisor" | "history" | "profile" | "guide" | "donate";
type HistoryGroupBy = "date" | "category" | "asset" | "status";
type HistoryOutcome = "pending" | "take_profit" | "stop_loss" | "unfilled";
type HistorySort = "newest" | "oldest" | "confidence" | "asset";
type HistoryStatusFilter = "all" | "pending" | "take_profit" | "stop_loss" | "unfilled";
type HistorySetupGroup = {
  items: TradeSetupRow[];
  key: string;
  label: string;
};

const SUPPORT_EMAIL = "support@windwardline.com";
const ALL_HISTORY_FILTER = "all";
const HISTORY_STATUS_ORDER: HistoryOutcome[] = ["pending", "take_profit", "stop_loss", "unfilled"];

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
  const [statusFilter, setStatusFilter] = useState<HistoryStatusFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState(ALL_HISTORY_FILTER);
  const [assetFilter, setAssetFilter] = useState(ALL_HISTORY_FILTER);
  const [groupBy, setGroupBy] = useState<HistoryGroupBy>("date");
  const [sortBy, setSortBy] = useState<HistorySort>("newest");

  const categories = useMemo(() => {
    return Array.from(new Set(setups.map((setup) => getSecurityOption(setup.symbol).assetType))).sort();
  }, [setups]);

  const assets = useMemo(() => {
    return Array.from(
      new Set(
        setups
          .filter((setup) => categoryFilter === ALL_HISTORY_FILTER || getSecurityOption(setup.symbol).assetType === categoryFilter)
          .map((setup) => setup.symbol),
      ),
    ).sort();
  }, [categoryFilter, setups]);

  useEffect(() => {
    if (assetFilter !== ALL_HISTORY_FILTER && !assets.includes(assetFilter)) {
      setAssetFilter(ALL_HISTORY_FILTER);
    }
  }, [assetFilter, assets]);

  const filteredSetups = useMemo(() => {
    return sortHistorySetups(
      setups.filter((setup) => {
        const outcome = getSetupOutcome(setup);
        const category = getSecurityOption(setup.symbol).assetType;
        const statusMatches = statusFilter === "all" || outcome === statusFilter;
        const categoryMatches = categoryFilter === ALL_HISTORY_FILTER || category === categoryFilter;
        const assetMatches = assetFilter === ALL_HISTORY_FILTER || setup.symbol === assetFilter;
        return statusMatches && categoryMatches && assetMatches;
      }),
      sortBy,
    );
  }, [assetFilter, categoryFilter, setups, sortBy, statusFilter]);

  const groupedSetups = useMemo(() => groupHistorySetups(filteredSetups, groupBy), [filteredSetups, groupBy]);
  const activeFilterCount = [statusFilter !== "all", categoryFilter !== ALL_HISTORY_FILTER, assetFilter !== ALL_HISTORY_FILTER].filter(Boolean).length;

  function clearFilters() {
    setStatusFilter("all");
    setCategoryFilter(ALL_HISTORY_FILTER);
    setAssetFilter(ALL_HISTORY_FILTER);
    setGroupBy("date");
    setSortBy("newest");
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
      <section className="terminal-panel p-5 sm:p-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-normal text-bullish">Trade journal</p>
            <h2 className="text-2xl font-semibold tracking-normal text-navy">History review</h2>
            <p className="mt-1 text-sm leading-6 text-slate">Filter, group, and review every recommendation LevelFlow has logged.</p>
          </div>
          <div className="text-left sm:text-right">
            <p className="text-sm font-semibold text-slate">{loading ? "Loading" : `${filteredSetups.length} of ${setups.length} shown`}</p>
            {activeFilterCount > 0 ? (
              <button className="mt-1 text-sm font-bold text-bullish" type="button" onClick={clearFilters}>
                Clear filters
              </button>
            ) : null}
          </div>
        </div>

        <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <StatPill label="Total setups" value={summary.total.toString()} />
          <StatPill label="Overall win rate" value={summary.winRate === null ? "Pending" : `${summary.winRate}%`} />
          <StatPill label="Take profit" value={summary.wins.toString()} />
          <StatPill label="Stop loss" value={summary.losses.toString()} />
          <StatPill label="Active / pending" value={summary.pending.toString()} />
        </div>

        <div className="mb-5 grid gap-3 rounded-lg border border-slate/15 bg-canvas p-3 md:grid-cols-2 xl:grid-cols-5">
          <label className="grid gap-2 text-sm font-semibold text-navy">
            Status
            <select className="field min-h-11" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as HistoryStatusFilter)}>
              <option value="all">All statuses</option>
              <option value="pending">Active / pending</option>
              <option value="take_profit">Take profit</option>
              <option value="stop_loss">Stop loss</option>
              <option value="unfilled">Unfilled / expired</option>
            </select>
          </label>
          <label className="grid gap-2 text-sm font-semibold text-navy">
            Category
            <select className="field min-h-11" value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
              <option value={ALL_HISTORY_FILTER}>All categories</option>
              {categories.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-2 text-sm font-semibold text-navy">
            Asset
            <select className="field min-h-11" value={assetFilter} onChange={(event) => setAssetFilter(event.target.value)}>
              <option value={ALL_HISTORY_FILTER}>All assets</option>
              {assets.map((asset) => (
                <option key={asset} value={asset}>
                  {asset}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-2 text-sm font-semibold text-navy">
            Group by
            <select className="field min-h-11" value={groupBy} onChange={(event) => setGroupBy(event.target.value as HistoryGroupBy)}>
              <option value="date">Date</option>
              <option value="status">Status</option>
              <option value="category">Category</option>
              <option value="asset">Asset</option>
            </select>
          </label>
          <label className="grid gap-2 text-sm font-semibold text-navy">
            Sort
            <select className="field min-h-11" value={sortBy} onChange={(event) => setSortBy(event.target.value as HistorySort)}>
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="confidence">Highest confidence</option>
              <option value="asset">Asset A-Z</option>
            </select>
          </label>
        </div>

        <div className="grid gap-4">
          {groupedSetups.map((group) => (
            <section key={group.key} className="min-w-0">
              <div className="mb-2 flex min-w-0 items-center justify-between gap-3 border-b border-slate/15 pb-2">
                <h3 className="min-w-0 text-lg font-semibold text-navy">{group.label}</h3>
                <span className="shrink-0 text-sm font-semibold text-slate">
                  {group.items.length} {group.items.length === 1 ? "setup" : "setups"}
                </span>
              </div>
              <div className="grid gap-3">
                {group.items.map((setup) => (
                  <HistorySetupCard key={setup.id} setup={setup} />
                ))}
              </div>
            </section>
          ))}
        </div>
        {!loading && setups.length === 0 ? <p className="mt-4 text-sm leading-6 text-slate">No recommendations have been logged yet.</p> : null}
        {!loading && setups.length > 0 && filteredSetups.length === 0 ? (
          <p className="mt-4 rounded-lg border border-slate/15 bg-canvas px-4 py-3 text-sm leading-6 text-slate">No recommendations match the current filters.</p>
        ) : null}
      </section>

      <aside className="grid content-start gap-5">
        <section className="terminal-panel p-5 sm:p-6">
          <div className="mb-4">
            <p className="text-xs font-semibold uppercase tracking-normal text-bullish">Performance</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-normal text-navy">Overview</h2>
          </div>
          <div className="grid gap-3">
            <HistoryPerformanceRow label="Resolved setups" value={summary.resolved.toString()} detail={`${summary.wins} TP / ${summary.losses} SL`} tone="neutral" />
            <HistoryPerformanceRow label="Unfilled / expired" value={summary.unfilled.toString()} detail="Ideas that did not fill in the setup window" tone="neutral" />
            <HistoryPerformanceRow
              label="Open review"
              value={summary.pending.toString()}
              detail="Active or still pending outcome review"
              tone={summary.pending > 0 ? "bullish" : "neutral"}
            />
          </div>
        </section>

        <section className="terminal-panel p-5 sm:p-6">
          <div className="mb-4">
            <p className="text-xs font-semibold uppercase tracking-normal text-bullish">Category trends</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-normal text-navy">By market</h2>
          </div>
          <div className="grid gap-3">
            {categoryStats.map((stat) => (
              <HistoryStatRow key={stat.category} label={stat.category} stat={stat} />
            ))}
          </div>
          {categoryStats.length === 0 ? <p className="text-sm leading-6 text-slate">Category stats will populate after recommendations are logged.</p> : null}
        </section>

        <section className="terminal-panel p-5 sm:p-6">
          <div className="mb-4">
            <p className="text-xs font-semibold uppercase tracking-normal text-bullish">Asset trends</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-normal text-navy">Most reviewed</h2>
          </div>
          <div className="grid gap-3">
            {stats.slice(0, 8).map((stat) => (
              <HistoryStatRow key={stat.symbol} label={stat.symbol} stat={stat} />
            ))}
          </div>
          {stats.length === 0 ? <p className="text-sm leading-6 text-slate">Asset stats will populate as recommendations are reviewed and outcomes are recorded.</p> : null}
        </section>
      </aside>
    </div>
  );
}

function HistorySetupCard({ setup }: { setup: TradeSetupRow }) {
  const outcome = getSetupOutcome(setup);
  const outcomeLabel = getOutcomeLabel(outcome);
  const isBuy = setup.side === "buy";
  const category = getSecurityOption(setup.symbol).assetType;

  return (
    <article className="min-w-0 rounded-lg border border-slate/15 bg-canvas p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-lg font-semibold text-navy">{setup.symbol}</h4>
            <span className="rounded-full bg-white px-2 py-1 text-xs font-bold uppercase text-slate">{category}</span>
          </div>
          <p className="mt-1 text-sm text-slate">{formatDate(setup.created_at)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-3 py-1 text-xs font-bold uppercase ${isBuy ? "bg-bullish/10 text-bullish" : "bg-danger/10 text-danger"}`}>{setup.side} limit</span>
          <span className={`rounded-full px-3 py-1 text-xs font-bold uppercase ${getOutcomeClassName(outcome)}`}>{outcomeLabel}</span>
        </div>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
        <HistoryMetric label="Entry" value={formatPriceValue(setup.limit_entry)} valueClassName={isBuy ? "text-bullish" : "text-danger"} />
        <HistoryMetric label="Stop" value={formatPriceValue(setup.stop_loss)} />
        <HistoryMetric label="Target" value={formatPriceValue(setup.take_profit)} />
        <HistoryMetric label="Breakeven" value={formatPriceValue(setup.breakeven_trigger_price)} />
        <HistoryMetric label="Confidence" value={`${Number(setup.confidence_score)}%`} />
      </div>
    </article>
  );
}

function HistoryMetric({ label, value, valueClassName = "text-navy" }: { label: string; value: string; valueClassName?: string }) {
  return (
    <div className="min-w-0 rounded-lg bg-white px-3 py-2">
      <p className="text-xs font-semibold uppercase tracking-normal text-slate">{label}</p>
      <p className={`mt-1 truncate font-semibold ${valueClassName}`}>{value}</p>
    </div>
  );
}

function HistoryPerformanceRow({ detail, label, tone, value }: { detail: string; label: string; tone: "bullish" | "neutral"; value: string }) {
  return (
    <div className={`rounded-lg border px-3 py-3 ${tone === "bullish" ? "border-bullish/25 bg-bullish/10" : "border-slate/15 bg-canvas"}`}>
      <div className="flex items-center justify-between gap-3">
        <p className="font-semibold text-navy">{label}</p>
        <p className="text-lg font-semibold text-navy">{value}</p>
      </div>
      <p className="mt-1 text-sm leading-5 text-slate">{detail}</p>
    </div>
  );
}

function HistoryStatRow({ label, stat }: { label: string; stat: CategoryStat | SecurityStat }) {
  const resolvedLabel = stat.winRate === null ? "Pending" : `${stat.winRate}% win rate`;
  const barWidth = stat.winRate === null ? 0 : stat.winRate;

  return (
    <div className="rounded-lg border border-slate/15 bg-canvas p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-semibold text-navy">{label}</p>
          <p className="mt-1 text-xs font-semibold uppercase tracking-normal text-slate">{stat.count} setups</p>
        </div>
        <p className="shrink-0 text-sm font-semibold text-navy">{resolvedLabel}</p>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-white">
        <div className="h-full rounded-full bg-bullish" style={{ width: `${barWidth}%` }} />
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
        <div>
          <p className="font-semibold text-navy">{stat.wins}</p>
          <p className="text-slate">TP</p>
        </div>
        <div>
          <p className="font-semibold text-navy">{stat.losses}</p>
          <p className="text-slate">SL</p>
        </div>
        <div>
          <p className="font-semibold text-navy">{stat.pending}</p>
          <p className="text-slate">Pending</p>
        </div>
      </div>
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
  onSave: (input: Pick<UserProfile, "defaultTimeframe" | "defaultTimezone" | "displayName" | "preferredSession" | "themePreference">) => Promise<void>;
  onThemeChange: (mode: ThemeMode) => void;
  profile: UserProfile;
  saveStatus: "idle" | "saving" | "saved";
  themeMode: ThemeMode;
}) {
  const [displayName, setDisplayName] = useState(profile.displayName);
  const [timezone, setTimezone] = useState(profile.defaultTimezone);
  const [defaultTimeframe, setDefaultTimeframe] = useState<ChartTimeframe>(profile.defaultTimeframe);
  const [preferredSession, setPreferredSession] = useState(profile.preferredSession);
  const [saveError, setSaveError] = useState("");

  useEffect(() => {
    setDisplayName(profile.displayName);
    setTimezone(profile.defaultTimezone);
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
          <p>Your name personalizes the workspace.</p>
          <p>Your U.S. timezone drives market clocks and daylight saving time adjustments.</p>
          <p>Preferred session highlights the trading session you watch most.</p>
          <p>Default timeframe and theme set your starting workspace view.</p>
        </div>
      </section>
    </div>
  );
}

function GuidePanel() {
  const workflow = [
    {
      body: "Select the asset and timeframe you are reviewing.",
      icon: <Crosshair className="h-5 w-5" aria-hidden="true" />,
      number: "01",
      title: "Set the market",
    },
    {
      body: "Check trend, structure, range, and recent price behavior first.",
      icon: <LineChart className="h-5 w-5" aria-hidden="true" />,
      number: "02",
      title: "Read the chart",
    },
    {
      body: "Run the advisor after the chart context is clear.",
      icon: <Radar className="h-5 w-5" aria-hidden="true" />,
      number: "03",
      title: "Generate",
    },
    {
      body: "Confirm side, entry, stop, target, breakeven, and confidence.",
      icon: <ShieldCheck className="h-5 w-5" aria-hidden="true" />,
      number: "04",
      title: "Review levels",
    },
    {
      body: "History keeps unique active setups and outcome results.",
      icon: <History className="h-5 w-5" aria-hidden="true" />,
      number: "05",
      title: "Track",
    },
  ];

  const decisionLenses = [
    {
      body: "Trend, momentum, and market structure decide whether buyers or sellers have control.",
      icon: <TrendingUp className="h-5 w-5" aria-hidden="true" />,
      title: "Direction",
    },
    {
      body: "Liquidity, value areas, volatility, and recent range help determine whether a limit entry is worth waiting for.",
      icon: <Layers3 className="h-5 w-5" aria-hidden="true" />,
      title: "Location",
    },
    {
      body: "Session quality, upcoming events, and correlation filters can reduce confidence or block marginal ideas.",
      icon: <Activity className="h-5 w-5" aria-hidden="true" />,
      title: "Timing",
    },
    {
      body: "Stops, targets, breakeven, and reward-to-risk are checked before a setup can appear.",
      icon: <Target className="h-5 w-5" aria-hidden="true" />,
      title: "Risk",
    },
  ];

  const outputItems = [
    {
      body: "Pending order direction. Buy limits wait below market; sell limits wait above market.",
      label: "Order",
      value: "Buy / sell limit",
    },
    {
      body: "The price where the idea becomes active.",
      label: "Entry",
      value: "Limit price",
    },
    {
      body: "The price area that invalidates the setup.",
      label: "Stop",
      value: "Invalidation",
    },
    {
      body: "The primary objective selected from liquidity, volatility, and reward-to-risk checks.",
      label: "Target",
      value: "Take profit",
    },
    {
      body: "A management reference level. It is not an automatic action.",
      label: "Reference",
      value: "Breakeven",
    },
  ];

  const confidenceBands = [
    {
      body: "Enough confluence and reward-to-risk for LevelFlow to show a setup.",
      range: "66+",
      title: "Qualified",
    },
    {
      body: "Stronger agreement across structure, momentum, location, and timing.",
      range: "80+",
      title: "High confluence",
    },
    {
      body: "No current limit setup meets the model threshold. Standing down is the output.",
      range: "Blocked",
      title: "Stand down",
    },
  ];

  return (
    <div className="grid gap-5">
      <section className="terminal-panel overflow-hidden">
        <div className="grid gap-5 p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.42fr)] lg:items-stretch">
          <div className="min-w-0">
            <div className="mb-6 flex items-center gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-navy text-white">
                <BookOpen className="h-5 w-5" aria-hidden="true" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-normal text-bullish">Field guide</p>
                <h2 className="mt-1 text-3xl font-semibold tracking-normal text-navy">Use LevelFlow as a pre-trade review desk.</h2>
              </div>
            </div>
            <p className="max-w-3xl text-base leading-7 text-slate">
              Start with the chart. Let LevelFlow evaluate whether the next pending limit setup is strong enough to consider. A stand-down is a valid outcome.
            </p>
          </div>

          <div className="grid content-between gap-3 rounded-lg border border-slate/15 bg-canvas p-4">
            <GuideRule label="Order type" value="Limit orders only" />
            <GuideRule label="Output" value="Advisory, not execution" />
            <GuideRule label="Review window" value="Refresh on change" />
          </div>
        </div>
      </section>

      <section className="terminal-panel p-5 sm:p-6">
        <div className="mb-5 flex min-w-0 flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-normal text-bullish">Workflow</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-normal text-navy">Five-step operating sequence</h2>
          </div>
          <p className="max-w-md text-sm leading-6 text-slate">A clean pass produces either a qualified setup or a clear stand-down.</p>
        </div>
        <div className="grid gap-3 lg:grid-cols-5">
          {workflow.map((step, index) => (
            <GuideProcessStep key={step.number} {...step} isLast={index === workflow.length - 1} />
          ))}
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,0.9fr)_minmax(320px,0.5fr)]">
        <section className="terminal-panel p-5 sm:p-6">
          <div className="mb-5">
            <p className="text-xs font-semibold uppercase tracking-normal text-bullish">Decision model</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-normal text-navy">What the analyzer weighs</h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {decisionLenses.map((item) => (
              <GuideLensCard key={item.title} {...item} />
            ))}
          </div>
        </section>

        <section className="terminal-panel p-5 sm:p-6">
          <div className="mb-5">
            <p className="text-xs font-semibold uppercase tracking-normal text-bullish">Output</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-normal text-navy">Recommendation anatomy</h2>
          </div>
          <div className="grid gap-3">
            {outputItems.map((item) => (
              <GuideOutputRow key={item.label} {...item} />
            ))}
          </div>
        </section>
      </div>

      <section className="terminal-panel p-5 sm:p-6">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,0.72fr)_minmax(280px,0.4fr)] lg:items-start">
          <div>
            <p className="text-xs font-semibold uppercase tracking-normal text-bullish">Confidence</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-normal text-navy">How to read the score</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate">
              Confidence is a 0-100 confluence score. It reflects strategy agreement, reward-to-risk, session quality, event risk, data coverage, and recent outcome learning.
            </p>
          </div>
          <div className="grid gap-3">
            {confidenceBands.map((band) => (
              <GuideConfidenceBand key={band.range} {...band} />
            ))}
          </div>
        </div>
      </section>

      <section className="terminal-panel p-5 sm:p-6">
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-normal text-bullish">Support</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-normal text-navy">Questions or data issues</h2>
            <p className="mt-1 text-sm leading-6 text-slate">Send the asset, timeframe, and a short description of what looked off.</p>
          </div>
          <a className="secondary-button shrink-0" href={`mailto:${SUPPORT_EMAIL}`}>
            <Mail className="h-4 w-4" aria-hidden="true" />
            {SUPPORT_EMAIL}
          </a>
        </div>
      </section>
    </div>
  );
}

function GuideRule({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-3 border-b border-slate/10 pb-3 last:border-b-0 last:pb-0">
      <span className="text-xs font-semibold uppercase tracking-normal text-slate">{label}</span>
      <span className="text-right text-sm font-semibold text-navy">{value}</span>
    </div>
  );
}

function GuideProcessStep({
  body,
  icon,
  isLast,
  number,
  title,
}: {
  body: string;
  icon: ReactNode;
  isLast: boolean;
  number: string;
  title: string;
}) {
  return (
    <div className="relative min-w-0 rounded-lg border border-slate/15 bg-canvas p-4">
      {!isLast ? (
        <div className="pointer-events-none absolute -right-4 top-8 hidden h-px w-5 bg-slate/25 lg:block">
          <ArrowRight className="absolute -right-2 -top-2 h-4 w-4 text-slate" aria-hidden="true" />
        </div>
      ) : null}
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-navy text-white">{icon}</div>
        <span className="text-xs font-bold uppercase tracking-normal text-bullish">{number}</span>
      </div>
      <h3 className="font-semibold text-navy">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-slate">{body}</p>
    </div>
  );
}

function GuideLensCard({ body, icon, title }: { body: string; icon: ReactNode; title: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-slate/15 bg-canvas p-4">
      <div className="mb-3 flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-bullish/10 text-bullish">{icon}</div>
        <h3 className="font-semibold text-navy">{title}</h3>
      </div>
      <p className="text-sm leading-6 text-slate">{body}</p>
    </div>
  );
}

function GuideOutputRow({ body, label, value }: { body: string; label: string; value: string }) {
  return (
    <div className="grid min-w-0 gap-2 rounded-lg border border-slate/15 bg-canvas p-3">
      <div className="flex min-w-0 items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-normal text-slate">{label}</p>
        <p className="text-sm font-semibold text-navy">{value}</p>
      </div>
      <p className="text-sm leading-6 text-slate">{body}</p>
    </div>
  );
}

function GuideConfidenceBand({ body, range, title }: { body: string; range: string; title: string }) {
  return (
    <div className="grid min-w-0 gap-3 rounded-lg border border-slate/15 bg-canvas p-4 sm:grid-cols-[88px_minmax(0,1fr)]">
      <div className="flex h-14 w-full items-center justify-center rounded-lg bg-white text-lg font-semibold text-navy">{range}</div>
      <div className="min-w-0">
        <h3 className="font-semibold text-navy">{title}</h3>
        <p className="mt-1 text-sm leading-6 text-slate">{body}</p>
      </div>
    </div>
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

function sortHistorySetups(setups: TradeSetupRow[], sortBy: HistorySort) {
  return [...setups].sort((first, second) => {
    const firstDate = new Date(first.created_at).getTime();
    const secondDate = new Date(second.created_at).getTime();

    if (sortBy === "oldest") {
      return firstDate - secondDate;
    }
    if (sortBy === "confidence") {
      return Number(second.confidence_score) - Number(first.confidence_score) || secondDate - firstDate;
    }
    if (sortBy === "asset") {
      return first.symbol.localeCompare(second.symbol) || secondDate - firstDate;
    }
    return secondDate - firstDate;
  });
}

function groupHistorySetups(setups: TradeSetupRow[], groupBy: HistoryGroupBy): HistorySetupGroup[] {
  const groups = new Map<string, HistorySetupGroup>();

  setups.forEach((setup) => {
    const group = getHistoryGroup(setup, groupBy);
    const existingGroup = groups.get(group.key);
    if (existingGroup) {
      existingGroup.items.push(setup);
      return;
    }
    groups.set(group.key, { ...group, items: [setup] });
  });

  const orderedGroups = Array.from(groups.values());
  if (groupBy === "asset" || groupBy === "category") {
    return orderedGroups.sort((first, second) => first.label.localeCompare(second.label));
  }
  if (groupBy === "status") {
    return orderedGroups.sort((first, second) => HISTORY_STATUS_ORDER.indexOf(first.key as HistoryOutcome) - HISTORY_STATUS_ORDER.indexOf(second.key as HistoryOutcome));
  }
  return orderedGroups;
}

function getHistoryGroup(setup: TradeSetupRow, groupBy: HistoryGroupBy): Omit<HistorySetupGroup, "items"> {
  if (groupBy === "asset") {
    return { key: setup.symbol, label: setup.symbol };
  }
  if (groupBy === "category") {
    const category = getSecurityOption(setup.symbol).assetType;
    return { key: category, label: category };
  }
  if (groupBy === "status") {
    const outcome = getSetupOutcome(setup);
    return { key: outcome, label: getOutcomeLabel(outcome) };
  }

  const date = new Date(setup.created_at);
  const key = Number.isNaN(date.getTime()) ? "unknown-date" : date.toISOString().slice(0, 10);
  return { key, label: formatHistoryDateGroup(date) };
}

function formatHistoryDateGroup(date: Date) {
  if (Number.isNaN(date.getTime())) {
    return "Unknown date";
  }

  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const dateStart = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

  if (dateStart === todayStart) {
    return "Today";
  }
  if (dateStart === todayStart - 86_400_000) {
    return "Yesterday";
  }

  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date);
}

function getSetupOutcome(setup: TradeSetupRow): HistoryOutcome {
  const outcome = setup.trade_outcomes?.[0]?.outcome;
  if (outcome === "take_profit" || outcome === "stop_loss") {
    return outcome;
  }
  if (outcome === "unfilled" || outcome === "expired" || setup.status === "expired" || setup.status === "invalidated") {
    return "unfilled";
  }
  return "pending";
}

function getOutcomeLabel(outcome: HistoryOutcome) {
  if (outcome === "take_profit") {
    return "Take profit";
  }
  if (outcome === "stop_loss") {
    return "Stop loss";
  }
  if (outcome === "unfilled") {
    return "Unfilled / expired";
  }
  return "Active / pending";
}

function getOutcomeClassName(outcome: HistoryOutcome) {
  if (outcome === "take_profit") {
    return "bg-bullish/10 text-bullish";
  }
  if (outcome === "stop_loss") {
    return "bg-danger/10 text-danger";
  }
  if (outcome === "unfilled") {
    return "bg-warning/15 text-warning";
  }
  return "bg-navy/10 text-navy";
}

function formatPriceValue(value: number | string | null | undefined) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? formatNumber(numericValue) : "Pending";
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
