import type { FormEvent, ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { BookOpen, Gift, HelpCircle, History, LayoutDashboard, LogOut, Mail, Monitor, Moon, Sun, User } from "lucide-react";
import { AuthScreen } from "./components/auth/AuthScreen";
import { AdvisorWorkspace } from "./components/workspace/AdvisorWorkspace";
import { DonationOptions } from "./components/donations/DonationOptions";
import { LegalLinks } from "./components/legal/LegalLinks";
import { useAuthSession } from "./hooks/useAuthSession";
import { useTradeSetups, type SecurityStat } from "./hooks/useTradeSetups";
import { brandAssets } from "./lib/assets";
import { supabase } from "./lib/supabase";
import type { ChartTimeframe } from "./lib/marketData";
import type { TradeSetupRow } from "./lib/tradeAnalyzer";

type AppTab = "advisor" | "history" | "profile" | "help" | "donate";
type ThemeMode = "light" | "dark" | "system";

const SUPPORT_EMAIL = "support@windwardline.com";

const TABS: Array<{ icon: ReactNode; label: string; value: AppTab }> = [
  { icon: <LayoutDashboard className="h-4 w-4" aria-hidden="true" />, label: "Advisor", value: "advisor" },
  { icon: <History className="h-4 w-4" aria-hidden="true" />, label: "History", value: "history" },
  { icon: <User className="h-4 w-4" aria-hidden="true" />, label: "Profile", value: "profile" },
  { icon: <HelpCircle className="h-4 w-4" aria-hidden="true" />, label: "Help", value: "help" },
  { icon: <Gift className="h-4 w-4" aria-hidden="true" />, label: "Donate", value: "donate" },
];

export default function App() {
  const theme = useThemePreference();
  const { session, loading } = useAuthSession();
  const [activeTab, setActiveTab] = useState<AppTab>("advisor");
  const setupState = useTradeSetups();

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

  return (
    <main className="min-h-screen bg-canvas text-ink">
      <header className="sticky top-0 z-20 border-b border-slate/15 bg-white/90 backdrop-blur">
        <div className="mx-auto max-w-7xl px-4 py-3 sm:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <img className="h-10 w-10 shrink-0 rounded-lg object-contain sm:h-11 sm:w-11" src={brandAssets.mark} alt="Windward Line mark" />
            <div className="min-w-0">
              <p className="text-[0.7rem] font-semibold uppercase tracking-normal text-slate sm:text-xs">Windward Line</p>
              <h1 className="truncate text-xl font-semibold tracking-normal text-navy sm:text-2xl">LevelFlow</h1>
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
        {activeTab === "advisor" ? <AdvisorWorkspace onSetupsChanged={setupState.refreshSetups} setupStats={setupState.stats} setups={setupState.setups} /> : null}
        {activeTab === "history" ? <HistoryPanel loading={setupState.loading} setups={setupState.setups} stats={setupState.stats} /> : null}
        {activeTab === "profile" ? (
          <ProfilePanel email={session.user.email ?? ""} themeMode={theme.mode} onThemeChange={theme.setMode} userId={session.user.id} />
        ) : null}
        {activeTab === "help" ? <HelpPanel /> : null}
        {activeTab === "donate" ? <DonatePanel /> : null}

        <footer className="pb-4">
          <LegalLinks />
        </footer>
      </div>
    </main>
  );
}

function HistoryPanel({ loading, setups, stats }: { loading: boolean; setups: TradeSetupRow[]; stats: SecurityStat[] }) {
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
                  <td className="py-3 pr-4 text-slate">{setup.trade_outcomes?.[0]?.outcome ?? setup.status}</td>
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
          {stats.map((stat) => (
            <div key={stat.symbol} className="rounded-lg border border-slate/15 bg-canvas p-3">
              <div className="flex items-center justify-between gap-3">
                <p className="font-semibold text-navy">{stat.symbol}</p>
                <p className="text-sm font-semibold text-slate">{stat.count} setups</p>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                <StatPill label="Confidence" value={`${stat.averageConfidence}%`} />
                <StatPill label="Wins" value={stat.wins.toString()} />
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
  email,
  onThemeChange,
  themeMode,
  userId,
}: {
  email: string;
  onThemeChange: (mode: ThemeMode) => void;
  themeMode: ThemeMode;
  userId: string;
}) {
  const [displayName, setDisplayName] = useState("");
  const [timezone, setTimezone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone);
  const [marketFocus, setMarketFocus] = useState("multi_asset");
  const [experienceLevel, setExperienceLevel] = useState("intermediate");
  const [defaultTimeframe, setDefaultTimeframe] = useState<ChartTimeframe>("1hour");
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");

  useEffect(() => {
    let cancelled = false;

    async function loadProfile() {
      if (!supabase) {
        return;
      }

      const { data } = await supabase
        .from("profiles")
        .select("display_name, default_timezone, market_focus, experience_level, default_timeframe, theme_preference")
        .eq("id", userId)
        .maybeSingle();

      if (!cancelled && data) {
        setDisplayName(data.display_name ?? "");
        setTimezone(data.default_timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone);
        setMarketFocus(data.market_focus ?? "multi_asset");
        setExperienceLevel(data.experience_level ?? "intermediate");
        setDefaultTimeframe((data.default_timeframe ?? "1hour") as ChartTimeframe);
        if (["light", "dark", "system"].includes(data.theme_preference ?? "")) {
          onThemeChange(data.theme_preference as ThemeMode);
        }
      }
    }

    loadProfile();

    return () => {
      cancelled = true;
    };
  }, [onThemeChange, userId]);

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) {
      return;
    }

    setStatus("saving");
    await supabase.from("profiles").upsert({
      default_timeframe: defaultTimeframe,
      default_timezone: timezone,
      display_name: displayName.trim(),
      email,
      experience_level: experienceLevel,
      id: userId,
      market_focus: marketFocus,
      theme_preference: themeMode,
    });
    setStatus("saved");
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,0.95fr)_minmax(300px,0.55fr)]">
      <form className="terminal-panel p-5 sm:p-6" onSubmit={saveProfile}>
        <div className="mb-5">
          <p className="text-xs font-semibold uppercase tracking-normal text-bullish">User profile</p>
          <h2 className="text-2xl font-semibold tracking-normal text-navy">Preferences</h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-2 text-sm font-semibold text-navy">
            Display name
            <input className="field" value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Trader name" />
          </label>
          <label className="grid gap-2 text-sm font-semibold text-navy">
            Timezone
            <select className="field" value={timezone} onChange={(event) => setTimezone(event.target.value)}>
              {Array.from(new Set([timezone, "America/New_York", "America/Chicago", "America/Los_Angeles", "Europe/London", "Europe/Berlin"].filter(Boolean))).map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-2 text-sm font-semibold text-navy">
            Market focus
            <select className="field" value={marketFocus} onChange={(event) => setMarketFocus(event.target.value)}>
              <option value="multi_asset">Multi-asset</option>
              <option value="forex">Forex</option>
              <option value="metals">Metals</option>
              <option value="crypto">Crypto</option>
              <option value="futures">Futures</option>
            </select>
          </label>
          <label className="grid gap-2 text-sm font-semibold text-navy">
            Experience level
            <select className="field" value={experienceLevel} onChange={(event) => setExperienceLevel(event.target.value)}>
              <option value="newer">Newer trader</option>
              <option value="intermediate">Intermediate</option>
              <option value="advanced">Advanced</option>
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
        <button className="primary-button mt-5" type="submit" disabled={status === "saving"}>
          {status === "saving" ? "Saving..." : status === "saved" ? "Profile saved" : "Save profile"}
        </button>
      </form>

      <section className="terminal-panel p-5 sm:p-6">
        <p className="text-xs font-semibold uppercase tracking-normal text-bullish">Session policy</p>
        <h2 className="mt-1 text-2xl font-semibold tracking-normal text-navy">Sign-in behavior</h2>
        <div className="mt-4 grid gap-3 text-sm leading-6 text-slate">
          <p>LevelFlow now stores authentication in browser session storage. Reloading the same tab keeps the workspace open, but closing the browser session requires a fresh magic-link sign-in.</p>
          <p>This keeps the product fast during active use while avoiding multi-day persistent login on a shared machine.</p>
        </div>
      </section>
    </div>
  );
}

function HelpPanel() {
  return (
    <section className="terminal-panel p-5 sm:p-6">
      <div className="mb-6 flex items-center gap-3">
        <BookOpen className="h-5 w-5 text-navy" aria-hidden="true" />
        <div>
          <p className="text-xs font-semibold uppercase tracking-normal text-bullish">Operating guide</p>
          <h2 className="text-2xl font-semibold tracking-normal text-navy">How to use LevelFlow</h2>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <GuideStep
          number="01"
          title="Start with one asset"
          body="Open Advisor, choose an asset from the grouped dropdown, and begin on the 1H chart. Use the chart before generating: drag left for history, scroll or pinch to zoom, and reset the view when you want the full context back."
        />
        <GuideStep
          number="02"
          title="Generate a limit-only setup"
          body="Click Generate setup when you want LevelFlow's current best pending limit-order idea. The analyzer reviews trend, market structure, liquidity behavior, momentum, volatility, value/volume behavior, multi-timeframe alignment, correlation, and calendar risk."
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
          body="You can generate again for the same asset to see whether the best setup changed. If the same active setup is still best, LevelFlow refreshes the view and avoids creating a duplicate history row."
        />
        <GuideStep
          number="06"
          title="Review your history"
          body="Open History to review prior recommendations, confidence scores, entry/stop/target, and status. Asset stats show where your review activity is concentrated and how tracked outcomes are accumulating."
        />
        <GuideStep
          number="07"
          title="Keep preferences current"
          body="Open Profile to set display, timezone, market focus, experience level, default chart timeframe, and theme preference. These settings make the workspace easier to scan and prepare for deeper personalization."
        />
        <GuideStep
          number="08"
          title="Remember what LevelFlow does"
          body="LevelFlow evaluates market conditions and produces advisory trade setups. It does not place, modify, close, or size trades for you."
        />
      </div>
    </section>
  );
}

function DonatePanel() {
  const donationFallbackHref = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("LevelFlow development support")}&body=${encodeURIComponent(
    "I would like the current donation link for LevelFlow development and maintenance.",
  )}`;

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <section className="terminal-panel p-5 sm:p-6">
        <div className="mb-5 flex items-center gap-3">
          <Mail className="h-5 w-5 text-navy" aria-hidden="true" />
          <div>
            <p className="text-xs font-semibold uppercase tracking-normal text-bullish">Contact</p>
            <h2 className="text-2xl font-semibold tracking-normal text-navy">Contact</h2>
          </div>
        </div>
        <p className="text-sm leading-6 text-slate">For access, data, or recommendation issues, contact Windward Line support.</p>
        <a className="secondary-button mt-5" href={`mailto:${SUPPORT_EMAIL}`}>
          <Mail className="h-4 w-4" aria-hidden="true" />
          {SUPPORT_EMAIL}
        </a>
      </section>

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
    <div className="grid gap-3 rounded-lg border border-slate/15 bg-canvas px-4 py-4 sm:grid-cols-[auto_1fr]">
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-navy text-sm font-semibold text-white">{number}</div>
      <div>
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
