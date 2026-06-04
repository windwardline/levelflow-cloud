import { useEffect, useState } from "react";
import { Brain, Loader2, ShieldCheck, Sparkles } from "lucide-react";
import { generateTradeSetup, type AnalyzerResponse } from "../../lib/tradeAnalyzer";
import { SECURITY_GROUPS, type SupportedSymbol } from "../../lib/symbolMap";
import { supabase } from "../../lib/supabase";
import { ConfidenceGauge } from "./ConfidenceGauge";

type AccountOption = {
  account_name: string;
  id: string;
  program_code: string;
};

export function TradeAnalyzerPanel() {
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [accountId, setAccountId] = useState("");
  const [symbol, setSymbol] = useState<SupportedSymbol>("EURUSD");
  const [status, setStatus] = useState<"loading" | "idle" | "analyzing">("loading");
  const [result, setResult] = useState<AnalyzerResponse | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadAccounts() {
      if (!supabase) {
        setStatus("idle");
        return;
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setStatus("idle");
        return;
      }

      const { data, error: accountError } = await supabase
        .from("user_accounts")
        .select("id, account_name, program_code")
        .eq("user_id", user.id)
        .in("status", ["evaluation", "funded", "paused"])
        .order("updated_at", { ascending: false });

      if (cancelled) {
        return;
      }

      if (accountError) {
        setError(accountError.message);
        setStatus("idle");
        return;
      }

      const nextAccounts = (data ?? []) as AccountOption[];
      setAccounts(nextAccounts);
      setAccountId(nextAccounts[0]?.id ?? "");
      setStatus("idle");
    }

    loadAccounts();

    return () => {
      cancelled = true;
    };
  }, []);

  async function analyze() {
    if (!accountId) {
      setError("Save an E8 account before generating a setup.");
      return;
    }

    setStatus("analyzing");
    setError("");
    setResult(null);

    try {
      setResult(await generateTradeSetup(accountId, symbol));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Analyzer request failed.");
    } finally {
      setStatus("idle");
    }
  }

  const setup = result?.setup;

  return (
    <div className="terminal-panel p-5">
      <div className="mb-4">
        <p className="text-sm font-semibold text-slate">Advisory engine</p>
        <h2 className="text-xl font-semibold tracking-normal text-navy">Confluence setup</h2>
      </div>

      <div className="grid gap-3">
        <label className="grid gap-2 text-sm font-semibold text-navy">
          Account
          <select className="field" value={accountId} disabled={status === "loading"} onChange={(event) => setAccountId(event.target.value)}>
            {accounts.length === 0 ? <option value="">No saved account</option> : null}
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.account_name} - {formatProgram(account.program_code)}
              </option>
            ))}
          </select>
        </label>

        <label className="grid gap-2 text-sm font-semibold text-navy">
          Security
          <select className="field" value={symbol} onChange={(event) => setSymbol(event.target.value as SupportedSymbol)}>
            {SECURITY_GROUPS.map((group) => (
              <optgroup key={group.label} label={group.label}>
                {group.options.map((option) => (
                  <option key={option.symbol} value={option.symbol}>
                    {option.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>

        <button className="primary-button w-full" type="button" disabled={status === "analyzing" || !accountId} onClick={analyze}>
          {status === "analyzing" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Brain className="h-4 w-4" aria-hidden="true" />}
          Generate limit setup
        </button>
      </div>

      <div className="mt-5">
        {setup ? (
          <div className="grid gap-4">
            <ConfidenceGauge score={setup.confidenceScore} />
            <div className="grid gap-2 text-sm">
              <AnalyzerRow label="Side" value={`${setup.side.toUpperCase()} LIMIT`} />
              <AnalyzerRow label="Entry" value={formatNumber(setup.entryPrice)} />
              <AnalyzerRow label="Stop loss" value={formatNumber(setup.stopLoss)} />
              <AnalyzerRow label="Take profit" value={formatNumber(setup.takeProfit)} />
              <AnalyzerRow label="Breakeven" value={formatNumber(setup.breakevenTriggerPrice)} />
              <AnalyzerRow label="Lot size" value={setup.lotSize.toString()} />
            </div>
            <div className="flex items-start gap-2 rounded-lg bg-bullish/10 px-3 py-2 text-sm font-semibold text-bullish">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              Advisory only. LevelFlow generated and saved a pending limit setup but did not execute a trade.
            </div>
          </div>
        ) : result?.blocked ? (
          <div className="flex items-start gap-2 rounded-lg bg-warning/10 px-3 py-2 text-sm font-semibold text-navy">
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
            {result.reason}
          </div>
        ) : (
          <div className="text-sm text-slate">Save an account, choose a symbol, and generate an advisory limit setup.</div>
        )}
      </div>

      {error ? <p className="mt-3 rounded-lg bg-danger/10 px-3 py-2 text-sm font-medium text-danger">{error}</p> : null}
    </div>
  );
}

function AnalyzerRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-h-10 items-center justify-between gap-3 rounded-lg bg-canvas px-3 py-2">
      <span className="text-slate">{label}</span>
      <span className="text-right font-semibold text-navy">{value}</span>
    </div>
  );
}

function formatNumber(value: number) {
  return value.toLocaleString(undefined, {
    maximumFractionDigits: 5,
  });
}

function formatProgram(value: string) {
  return value.replace("e8_", "E8 ").replace("_", " ");
}
