import type { FormEvent, ReactNode } from "react";
import { useEffect, useState } from "react";
import { BookOpen, Gift, HelpCircle, History, LayoutDashboard, LogOut, Mail, ShieldAlert, Timer, User, Wallet, Wifi } from "lucide-react";
import { AuthScreen } from "./components/auth/AuthScreen";
import { AdvisorWorkspace } from "./components/workspace/AdvisorWorkspace";
import { LegalLinks } from "./components/legal/LegalLinks";
import { AccountOnboarding } from "./components/onboarding/AccountOnboarding";
import { useAuthSession } from "./hooks/useAuthSession";
import { useE8Time } from "./hooks/useE8Time";
import { useTradeSetups, type SecurityStat } from "./hooks/useTradeSetups";
import { useUserAccounts } from "./hooks/useUserAccounts";
import { appConfig } from "./lib/env";
import { brandAssets } from "./lib/assets";
import { supabase } from "./lib/supabase";
import type { TradeSetupRow } from "./lib/tradeAnalyzer";

type AppTab = "advisor" | "accounts" | "history" | "profile" | "help" | "support";

const SUPPORT_EMAIL = "support@windwardline.com";

const TABS: Array<{ icon: ReactNode; label: string; value: AppTab }> = [
  { icon: <LayoutDashboard className="h-4 w-4" aria-hidden="true" />, label: "Advisor", value: "advisor" },
  { icon: <Wallet className="h-4 w-4" aria-hidden="true" />, label: "Accounts", value: "accounts" },
  { icon: <History className="h-4 w-4" aria-hidden="true" />, label: "History", value: "history" },
  { icon: <User className="h-4 w-4" aria-hidden="true" />, label: "Profile", value: "profile" },
  { icon: <HelpCircle className="h-4 w-4" aria-hidden="true" />, label: "Help", value: "help" },
  { icon: <Gift className="h-4 w-4" aria-hidden="true" />, label: "Support", value: "support" },
];

export default function App() {
  const { session, loading } = useAuthSession();
  const e8Time = useE8Time();
  const [activeTab, setActiveTab] = useState<AppTab>("advisor");
  const accountsState = useUserAccounts();
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
    return <AuthScreen />;
  }

  return (
    <main className="min-h-screen bg-canvas text-ink">
      <header className="sticky top-0 z-20 border-b border-slate/15 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <img className="h-11 w-11 rounded-lg object-contain" src={brandAssets.mark} alt="Windward Line mark" />
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-normal text-slate">Windward Line</p>
              <h1 className="truncate text-2xl font-semibold tracking-normal text-navy">LevelFlow</h1>
            </div>
          </div>

          <nav className="flex min-w-0 flex-1 flex-wrap justify-start gap-2 lg:justify-center" aria-label="LevelFlow sections">
            {TABS.map((tab) => (
              <button
                key={tab.value}
                className={`nav-button ${activeTab === tab.value ? "nav-button-active" : ""}`}
                type="button"
                onClick={() => setActiveTab(tab.value)}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </nav>

          <button className="secondary-button" type="button" onClick={() => supabase?.auth.signOut()}>
            <LogOut className="h-4 w-4" aria-hidden="true" />
            Sign out
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-7xl space-y-5 px-5 py-5 sm:px-8">
        <section className="grid gap-3 md:grid-cols-3">
          <StatusTile icon={<Timer className="h-5 w-5" aria-hidden="true" />} label="E8 server time" value={e8Time.serverNowLabel} />
          <StatusTile icon={<Wifi className="h-5 w-5" aria-hidden="true" />} label={e8Time.dailyReset.label} value={e8Time.dailyReset.remainingLabel} />
          <StatusTile icon={<ShieldAlert className="h-5 w-5" aria-hidden="true" />} label={e8Time.signatureClosure.label} value={e8Time.signatureClosure.remainingLabel} />
        </section>

        {(e8Time.inSpreadProtection || e8Time.isWeekendProtectionWindow) && (
          <section className="rounded-lg border border-warning/25 bg-warning/10 px-4 py-3 text-sm font-semibold text-navy">
            {e8Time.inSpreadProtection ? e8Time.spreadProtectionLabel : "Friday 22:00 CE(S)T weekend protection window active"}
          </section>
        )}

        {activeTab === "advisor" ? (
          <AdvisorWorkspace
            accounts={accountsState.accounts}
            accountsLoading={accountsState.loading}
            onOpenAccounts={() => setActiveTab("accounts")}
            onSelectAccount={accountsState.setSelectedAccountId}
            onSetupsChanged={setupState.refreshSetups}
            selectedAccountId={accountsState.selectedAccountId}
            setupStats={setupState.stats}
            setups={setupState.setups}
          />
        ) : null}

        {activeTab === "accounts" ? (
          <AccountOnboarding
            accounts={accountsState.accounts}
            accountsLoading={accountsState.loading}
            onAccountsChanged={accountsState.refreshAccounts}
            onSelectAccount={accountsState.setSelectedAccountId}
            selectedAccountId={accountsState.selectedAccountId}
            userEmail={session.user.email ?? "Authenticated trader"}
          />
        ) : null}

        {activeTab === "history" ? <HistoryPanel loading={setupState.loading} setups={setupState.setups} stats={setupState.stats} /> : null}
        {activeTab === "profile" ? <ProfilePanel email={session.user.email ?? ""} userId={session.user.id} /> : null}
        {activeTab === "help" ? <HelpPanel /> : null}
        {activeTab === "support" ? <SupportPanel /> : null}

        <footer className="pb-4">
          <LegalLinks />
        </footer>
      </div>
    </main>
  );
}

function StatusTile({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="terminal-panel flex min-h-20 items-center gap-4 p-4">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-navy text-white">{icon}</div>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-slate">{label}</p>
        <p className="truncate text-lg font-semibold tracking-normal text-navy">{value}</p>
      </div>
    </div>
  );
}

function HistoryPanel({ loading, setups, stats }: { loading: boolean; setups: TradeSetupRow[]; stats: SecurityStat[] }) {
  return (
    <div className="grid gap-5 xl:grid-cols-[1.35fr_0.65fr]">
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
                <th className="py-3 pr-4 font-semibold">Account</th>
                <th className="py-3 pr-4 font-semibold">Security</th>
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
                  <td className="py-3 pr-4 font-medium text-navy">{setup.user_accounts?.account_name ?? "Account"}</td>
                  <td className="py-3 pr-4 font-semibold text-navy">{setup.symbol}</td>
                  <td className={`py-3 pr-4 font-bold uppercase ${setup.side === "buy" ? "text-bullish" : "text-danger"}`}>{setup.side}</td>
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
          <p className="text-xs font-semibold uppercase tracking-normal text-bullish">Security trends</p>
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

function ProfilePanel({ email, userId }: { email: string; userId: string }) {
  const [displayName, setDisplayName] = useState("");
  const [timezone, setTimezone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone);
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");

  useEffect(() => {
    let cancelled = false;

    async function loadProfile() {
      if (!supabase) {
        return;
      }

      const { data } = await supabase.from("profiles").select("display_name, default_timezone").eq("id", userId).maybeSingle();
      if (!cancelled && data) {
        setDisplayName(data.display_name ?? "");
        setTimezone(data.default_timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone);
      }
    }

    loadProfile();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) {
      return;
    }

    setStatus("saving");
    await supabase.from("profiles").upsert({
      default_timezone: timezone,
      display_name: displayName.trim(),
      email,
      id: userId,
    });
    setStatus("saved");
  }

  return (
    <form className="terminal-panel max-w-3xl p-5 sm:p-6" onSubmit={saveProfile}>
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
      </div>
      <button className="primary-button mt-5" type="submit" disabled={status === "saving"}>
        {status === "saving" ? "Saving..." : status === "saved" ? "Profile saved" : "Save profile"}
      </button>
    </form>
  );
}

function HelpPanel() {
  return (
    <section className="terminal-panel max-w-4xl p-5 sm:p-6">
      <div className="mb-5 flex items-center gap-3">
        <BookOpen className="h-5 w-5 text-navy" aria-hidden="true" />
        <div>
          <p className="text-xs font-semibold uppercase tracking-normal text-bullish">Operating guide</p>
          <h2 className="text-2xl font-semibold tracking-normal text-navy">How to use LevelFlow</h2>
        </div>
      </div>
      <ol className="grid gap-3 text-sm leading-6 text-slate">
        <li className="rounded-lg bg-canvas px-4 py-3"><strong className="text-navy">1.</strong> Configure each E8 account in Accounts so LevelFlow can size risk against the correct program rules.</li>
        <li className="rounded-lg bg-canvas px-4 py-3"><strong className="text-navy">2.</strong> In Advisor, select the account, security, and chart timeframe. The default chart is 1H.</li>
        <li className="rounded-lg bg-canvas px-4 py-3"><strong className="text-navy">3.</strong> Generate a setup. LevelFlow evaluates market context, strategy confluence, risk constraints, and calendar context before logging a unique advisory recommendation.</li>
        <li className="rounded-lg bg-canvas px-4 py-3"><strong className="text-navy">4.</strong> Review History to compare recommendations, tracked outcomes, and security-level focus statistics.</li>
      </ol>
    </section>
  );
}

function SupportPanel() {
  const donationHref =
    appConfig.donationUrl ||
    `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("LevelFlow development support")}&body=${encodeURIComponent("I would like the current donation link for LevelFlow development and maintenance.")}`;

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <section className="terminal-panel p-5 sm:p-6">
        <div className="mb-5 flex items-center gap-3">
          <Mail className="h-5 w-5 text-navy" aria-hidden="true" />
          <div>
            <p className="text-xs font-semibold uppercase tracking-normal text-bullish">Contact</p>
            <h2 className="text-2xl font-semibold tracking-normal text-navy">Support</h2>
          </div>
        </div>
        <p className="text-sm leading-6 text-slate">For access, account, data, or recommendation issues, contact Windward Line support.</p>
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
            <h2 className="text-2xl font-semibold tracking-normal text-navy">Support LevelFlow</h2>
          </div>
        </div>
        <p className="text-sm leading-6 text-slate">Contributions go toward provider data, hosting, development, testing, and maintenance costs.</p>
        <a className="primary-button mt-5" href={donationHref} target={appConfig.donationUrl ? "_blank" : undefined} rel={appConfig.donationUrl ? "noreferrer" : undefined}>
          <Gift className="h-4 w-4" aria-hidden="true" />
          {appConfig.donationUrl ? "Donate" : "Request donation link"}
        </a>
      </section>
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
