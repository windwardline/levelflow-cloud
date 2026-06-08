import type { FormEvent, ReactNode } from "react";
import { useEffect, useState } from "react";
import { BookOpen, Gift, HelpCircle, History, LayoutDashboard, LogOut, Mail, ShieldAlert, Timer, User, Wallet, Wifi } from "lucide-react";
import { AuthScreen } from "./components/auth/AuthScreen";
import { AdvisorWorkspace } from "./components/workspace/AdvisorWorkspace";
import { DonationOptions } from "./components/donations/DonationOptions";
import { LegalLinks } from "./components/legal/LegalLinks";
import { AccountOnboarding } from "./components/onboarding/AccountOnboarding";
import { useAuthSession } from "./hooks/useAuthSession";
import { useE8Time } from "./hooks/useE8Time";
import { useTradeSetups, type SecurityStat } from "./hooks/useTradeSetups";
import { useUserAccounts } from "./hooks/useUserAccounts";
import { brandAssets } from "./lib/assets";
import { supabase } from "./lib/supabase";
import type { TradeSetupRow } from "./lib/tradeAnalyzer";

type AppTab = "advisor" | "accounts" | "history" | "profile" | "help" | "donate";

const SUPPORT_EMAIL = "support@windwardline.com";

const TABS: Array<{ icon: ReactNode; label: string; value: AppTab }> = [
  { icon: <LayoutDashboard className="h-4 w-4" aria-hidden="true" />, label: "Advisor", value: "advisor" },
  { icon: <Wallet className="h-4 w-4" aria-hidden="true" />, label: "Accounts", value: "accounts" },
  { icon: <History className="h-4 w-4" aria-hidden="true" />, label: "History", value: "history" },
  { icon: <User className="h-4 w-4" aria-hidden="true" />, label: "Profile", value: "profile" },
  { icon: <HelpCircle className="h-4 w-4" aria-hidden="true" />, label: "Help", value: "help" },
  { icon: <Gift className="h-4 w-4" aria-hidden="true" />, label: "Donate", value: "donate" },
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
        {activeTab === "donate" ? <DonatePanel /> : null}

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

      <div className="mb-5 grid gap-3 text-sm leading-6 text-slate md:grid-cols-3">
        <div className="rounded-lg border border-slate/15 bg-canvas px-4 py-3">
          <p className="font-semibold text-navy">1. Account</p>
          <p className="mt-1">Save each E8 account with its current balance, equity, payout, drawdown rules, and pricing type.</p>
        </div>
        <div className="rounded-lg border border-slate/15 bg-canvas px-4 py-3">
          <p className="font-semibold text-navy">2. Asset</p>
          <p className="mt-1">Pick one active LevelFlow asset from Forex, Metals, or Crypto, then review the 1H chart before generating.</p>
        </div>
        <div className="rounded-lg border border-slate/15 bg-canvas px-4 py-3">
          <p className="font-semibold text-navy">3. Decision</p>
          <p className="mt-1">Generate the advisory setup, review the plotted levels, and track the recommendation in History.</p>
        </div>
      </div>

      <div className="grid gap-3 text-sm leading-6 text-slate">
        <GuideStep
          number="01"
          title="1. Set up each E8 account first"
          body="Open Accounts and create a separate record for every E8 account you want LevelFlow to advise against. Use the account's starting balance, current balance, current equity, drawdown settings, payout, and pricing type. These values drive the account guardrails."
        />
        <GuideStep
          number="02"
          title="2. Work from the Advisor screen"
          body="Choose the E8 account first, then choose one active asset from the grouped dropdown. LevelFlow currently shows the E8-aligned Forex, Metals, and Crypto assets with verified provider coverage. The chart defaults to 1H because that is the primary planning view; switch to 15 minutes, 4 hours, or daily only when the setup needs extra context."
        />
        <GuideStep
          number="03"
          title="3. Read the chart before generating"
          body="Use the chart before pressing Generate: drag left to inspect history, zoom around recent structure, and refresh the chart if you have been sitting on the screen for a while."
        />
        <GuideStep
          number="04"
          title="4. Generate one current advisory setup"
          body="Click Generate setup when you want the current best advisory recommendation for that account and asset. LevelFlow reviews market structure, momentum, volatility, value/volume behavior, multi-timeframe alignment, account rules, and calendar context."
        />
        <GuideStep
          number="05"
          title="5. Use the plotted levels"
          body="When a setup qualifies, the chart plots the limit entry, stop loss, and take profit. Use those levels as the planning reference for your own trading platform; LevelFlow does not place, modify, or close trades."
        />
        <GuideStep
          number="06"
          title="6. Re-check without polluting history"
          body="You can generate again for the same account and asset to see whether the recommendation changed. If the same active setup is still best, LevelFlow refreshes the view and avoids creating a duplicate history row."
        />
        <GuideStep
          number="07"
          title="7. Review recommendation history"
          body="Open History to review prior recommendations, confidence scores, account association, entry/stop/target, status, and recorded outcomes. Asset stats show what you have asked LevelFlow to analyze and where results are accumulating."
        />
        <GuideStep
          number="08"
          title="8. Keep account and profile data current"
          body="Update Accounts whenever balance, equity, program, drawdown, payout, pricing type, or funded status changes. Use Profile for user preferences. Cleaner account data gives the advisor cleaner guardrail context and more useful historical records."
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
            <h2 className="text-2xl font-semibold tracking-normal text-navy">Donate</h2>
          </div>
        </div>
        <DonationOptions fallbackHref={donationFallbackHref} />
      </section>
    </div>
  );
}

function GuideStep({ body, number, title }: { body: string; number: string; title: string }) {
  return (
    <div className="grid gap-3 rounded-lg border border-slate/15 bg-canvas px-4 py-4 sm:grid-cols-[auto_1fr]">
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-navy text-sm font-semibold text-white">{number}</div>
      <div>
        <h3 className="font-semibold text-navy">{title}</h3>
        <p className="mt-1">{body}</p>
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
