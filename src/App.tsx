import type { ReactNode } from "react";
import { LogOut, ShieldAlert, Timer, Wifi } from "lucide-react";
import { AuthScreen } from "./components/auth/AuthScreen";
import { MarketFeed } from "./components/charts/MarketFeed";
import { AccountOnboarding } from "./components/onboarding/AccountOnboarding";
import { ConfidenceGauge } from "./components/trade/ConfidenceGauge";
import { useAuthSession } from "./hooks/useAuthSession";
import { useE8Time } from "./hooks/useE8Time";
import { brandAssets } from "./lib/assets";
import { supabase } from "./lib/supabase";

export default function App() {
  const { session, loading } = useAuthSession();
  const e8Time = useE8Time();

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
      <header className="border-b border-slate/15 bg-white/85 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <div>
            <div className="flex items-center gap-3">
              <img className="h-11 w-11 rounded-lg object-contain" src={brandAssets.mark} alt="Windward Line mark" />
              <div>
                <p className="text-xs font-semibold uppercase tracking-normal text-slate">A Windward Line product</p>
                <h1 className="text-2xl font-semibold tracking-normal text-navy">LevelFlow</h1>
              </div>
            </div>
          </div>
          <button className="secondary-button" type="button" onClick={() => supabase?.auth.signOut()}>
            <LogOut className="h-4 w-4" aria-hidden="true" />
            Sign out
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-7xl space-y-6 px-5 py-6 sm:px-8">
        <section className="grid gap-4 md:grid-cols-3">
          <StatusTile icon={<Timer className="h-5 w-5" aria-hidden="true" />} label="E8 server time" value={e8Time.serverNowLabel} />
          <StatusTile icon={<Wifi className="h-5 w-5" aria-hidden="true" />} label={e8Time.dailyReset.label} value={e8Time.dailyReset.remainingLabel} />
          <StatusTile icon={<ShieldAlert className="h-5 w-5" aria-hidden="true" />} label={e8Time.signatureClosure.label} value={e8Time.signatureClosure.remainingLabel} />
        </section>

        {(e8Time.inSpreadProtection || e8Time.isWeekendProtectionWindow) && (
          <section className="rounded-lg border border-warning/25 bg-warning/10 px-4 py-3 text-sm font-semibold text-navy">
            {e8Time.inSpreadProtection ? e8Time.spreadProtectionLabel : "Friday 22:00 CE(S)T weekend protection window active"}
          </section>
        )}

        <section className="grid gap-5 lg:grid-cols-[0.68fr_1.32fr]">
          <div className="terminal-panel p-5">
            <div className="mb-4">
              <p className="text-sm font-semibold text-slate">Analyzer readiness</p>
              <h2 className="text-xl font-semibold tracking-normal text-navy">Confluence engine</h2>
            </div>
            <ConfidenceGauge score={82} />
            <div className="mt-5 grid gap-2 text-sm">
              <EngineRow label="Order mode" value="Limit only" />
              <EngineRow label="News filter" value="E8 One / Pro enforced" />
              <EngineRow label="Risk model" value="Daily DD aware" />
            </div>
          </div>

          <div className="terminal-panel overflow-hidden p-5">
            <MarketFeed />
          </div>
        </section>

        <AccountOnboarding userEmail={session.user.email ?? "Authenticated trader"} />
      </div>
    </main>
  );
}

function StatusTile({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="terminal-panel flex min-h-24 items-center gap-4 p-4">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-navy text-white">{icon}</div>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-slate">{label}</p>
        <p className="truncate text-lg font-semibold tracking-normal text-navy">{value}</p>
      </div>
    </div>
  );
}

function EngineRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-h-10 items-center justify-between gap-3 rounded-lg bg-canvas px-3 py-2">
      <span className="text-slate">{label}</span>
      <span className="text-right font-semibold text-navy">{value}</span>
    </div>
  );
}
