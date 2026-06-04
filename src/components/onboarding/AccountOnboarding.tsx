import { FormEvent, useEffect, useMemo, useState } from "react";
import { BadgeDollarSign, CheckCircle2, History, LockKeyhole, RadioTower, Save, SlidersHorizontal } from "lucide-react";
import { E8_PROGRAMS, PROGRAM_ORDER, formatCurrency, getSelection, type E8ProgramCode } from "../../lib/e8Matrix";
import type { SavedAccount } from "../../hooks/useUserAccounts";
import { supabase } from "../../lib/supabase";

type AccountOnboardingProps = {
  accounts?: SavedAccount[];
  accountsLoading?: boolean;
  onAccountsChanged?: () => void;
  onSelectAccount?: (accountId: string) => void;
  selectedAccountId?: string;
  userEmail: string;
};

export function AccountOnboarding({
  accounts = [],
  accountsLoading = false,
  onAccountsChanged,
  onSelectAccount,
  selectedAccountId,
  userEmail,
}: AccountOnboardingProps) {
  const [programCode, setProgramCode] = useState<E8ProgramCode>("e8_one");
  const [balance, setBalance] = useState(E8_PROGRAMS.e8_one.balances[0]);
  const [rulesetId, setRulesetId] = useState(E8_PROGRAMS.e8_one.rulesets[0].id);
  const [payoutPct, setPayoutPct] = useState(E8_PROGRAMS.e8_one.defaultPayout);
  const [accountName, setAccountName] = useState("Primary Evaluation");
  const [accountId, setAccountId] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "loaded">("idle");
  const [error, setError] = useState("");

  const program = E8_PROGRAMS[programCode];

  const selection = useMemo(() => getSelection(programCode, balance, rulesetId), [balance, programCode, rulesetId]);

  useEffect(() => {
    if (selectedAccountId === "") {
      return;
    }

    const selected = accounts.find((account) => account.id === selectedAccountId) ?? accounts[0];
    if (selected && selected.id !== accountId && status !== "saving") {
      applySavedAccount(selected);
      setStatus("loaded");
    }
  }, [accountId, accounts, selectedAccountId, status]);

  function changeProgram(nextProgramCode: E8ProgramCode) {
    const nextProgram = E8_PROGRAMS[nextProgramCode];
    setAccountId(null);
    setProgramCode(nextProgramCode);
    setBalance(nextProgram.balances[0]);
    setRulesetId(nextProgram.rulesets[0].id);
    setPayoutPct(nextProgram.defaultPayout);
    setStatus("idle");
  }

  function applySavedAccount(account: SavedAccount) {
    const programForAccount = E8_PROGRAMS[account.program_code] ?? E8_PROGRAMS.e8_one;
    const accountBalance = Number(account.initial_balance);
    const matchingRuleset =
      programForAccount.rulesets.find((ruleset) => getSelection(account.program_code, accountBalance, ruleset.id).id === account.account_size_id) ??
      programForAccount.rulesets[0];

    setAccountId(account.id);
    setAccountName(account.account_name);
    setProgramCode(account.program_code);
    setBalance(accountBalance);
    setRulesetId(matchingRuleset.id);
    setPayoutPct(Number(account.payout_pct));
    setError("");
  }

  function startNewAccount() {
    setAccountId(null);
    setAccountName("Primary Evaluation");
    onSelectAccount?.("");
    changeProgram("e8_one");
  }

  async function saveAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) {
      setError("Supabase is not configured for this deployment.");
      return;
    }

    setError("");
    setStatus("saving");

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      setStatus("idle");
      setError(userError?.message ?? "No authenticated user found.");
      return;
    }

    const payload = {
      user_id: user.id,
      account_size_id: selection.id,
      program_code: programCode,
      account_name: accountName.trim(),
      payout_pct: payoutPct,
      stage: selection.program.phaseTwoRequired ? "phase_1" : "evaluation",
      initial_balance: selection.balance,
      current_balance: selection.balance,
      current_equity: selection.balance,
      raw_spreads_enabled: true,
      no_commissions_enabled: false,
    };

    const request = accountId
      ? supabase.from("user_accounts").update(payload).eq("id", accountId).eq("user_id", user.id).select().single()
      : supabase.from("user_accounts").insert(payload).select().single();

    const { data: savedAccount, error: saveError } = await request;

    if (saveError) {
      setStatus("idle");
      setError(saveError.message);
      return;
    }

    const nextAccount = savedAccount as SavedAccount;
    setAccountId(nextAccount.id);
    onSelectAccount?.(nextAccount.id);
    onAccountsChanged?.();
    setStatus("saved");
  }

  return (
    <form className="grid gap-5 lg:grid-cols-[1.08fr_0.92fr]" onSubmit={saveAccount}>
      <section className="terminal-panel p-5 sm:p-6">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-normal text-slate">{userEmail}</p>
              <h2 className="mt-1 text-2xl font-semibold tracking-normal text-navy">Account configuration</h2>
            </div>
            <div className="flex items-center gap-2 rounded-lg bg-bullish/10 px-3 py-2 text-sm font-semibold text-bullish">
              <RadioTower className="h-4 w-4" aria-hidden="true" />
              Realtime-ready
            </div>
          </div>

          {accounts.length > 0 ? (
            <div className="mb-5 rounded-lg border border-slate/15 bg-canvas p-3">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-navy">
                  <History className="h-4 w-4" aria-hidden="true" />
                  Saved accounts
                </div>
                <button className="secondary-button min-h-9 px-3 py-1 text-sm" type="button" onClick={startNewAccount}>
                  New
                </button>
              </div>
              <select
                className="field"
                value={accountId ?? ""}
                onChange={(event) => {
                  const selected = accounts.find((account) => account.id === event.target.value);
                  if (selected) {
                    applySavedAccount(selected);
                    onSelectAccount?.(selected.id);
                    setStatus("loaded");
                  }
                }}
              >
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.account_name} - {formatCurrency(Number(account.initial_balance))}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

        <div className="space-y-5">
          <div>
            <label className="mb-2 block text-sm font-semibold text-navy" htmlFor="accountName">
              Account name
            </label>
            <input
              id="accountName"
              className="field"
              value={accountName}
              onChange={(event) => setAccountName(event.target.value)}
              required
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold text-navy" htmlFor="programCode">
              Program
            </label>
            <select id="programCode" className="field" value={programCode} onChange={(event) => changeProgram(event.target.value as E8ProgramCode)}>
              {PROGRAM_ORDER.map((code) => (
                <option key={code} value={code}>
                  {E8_PROGRAMS[code].name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold text-navy" htmlFor="balance">
              Balance
            </label>
            <select id="balance" className="field" value={balance} onChange={(event) => setBalance(Number(event.target.value))}>
              {program.balances.map((option) => (
                <option key={option} value={option}>
                  {formatCurrency(option)}
                </option>
              ))}
            </select>
          </div>

          {programCode === "e8_one" ? (
            <div>
              <label className="mb-2 block text-sm font-semibold text-navy" htmlFor="ruleset">
                Ruleset
              </label>
              <div className="relative">
                <SlidersHorizontal className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate" aria-hidden="true" />
                <select id="ruleset" className="field pl-10" value={rulesetId} onChange={(event) => setRulesetId(event.target.value)}>
                {program.rulesets.map((ruleset) => (
                  <option key={ruleset.id} value={ruleset.id}>
                    {ruleset.label}
                  </option>
                ))}
                </select>
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-slate/20 bg-white px-4 py-3 text-sm font-semibold text-navy">
              {selection.label}
            </div>
          )}

          <div>
            <label className="mb-2 block text-sm font-semibold text-navy" htmlFor="payoutPct">
              Payout
            </label>
            <select id="payoutPct" className="field" value={payoutPct} onChange={(event) => setPayoutPct(Number(event.target.value))}>
              {program.payoutOptions.map((option) => (
                <option key={option} value={option}>
                  {option}%
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      <aside className="space-y-5">
        <section className="terminal-panel p-5 sm:p-6">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-navy text-white">
              <BadgeDollarSign className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate">Selected matrix</p>
              <h3 className="text-xl font-semibold tracking-normal text-navy">{program.name}</h3>
            </div>
          </div>

          <dl className="grid gap-3 text-sm">
            <Metric label="Balance" value={formatCurrency(selection.balance)} />
            <Metric label="Leverage" value={selection.leverageRatio} />
            <Metric label="Daily DD" value={`${selection.dailyDrawdownPct}%`} />
            <Metric
              label={selection.drawdownMode === "static" ? "Static DD" : "Dynamic DD"}
              value={`${selection.staticDrawdownPct ?? selection.dynamicDrawdownPct}%`}
            />
            <Metric label="Profit target" value={`${selection.profitTargetPct}%`} />
            <Metric label="Payout" value={`${payoutPct}%`} />
            {selection.dailyProfitCapPct ? <Metric label="Daily profit cap" value={`${selection.dailyProfitCapPct}%`} /> : null}
            {selection.dailyLossAutoPausePct ? <Metric label="Auto-pause" value={`${selection.dailyLossAutoPausePct}% daily loss`} /> : null}
            <Metric label="Stage path" value={selection.program.phaseTwoRequired ? "Phase 1 -> Phase 2 -> Funded" : "Evaluation -> Funded"} />
          </dl>
        </section>

        <section className="terminal-panel p-5 sm:p-6">
          <div className="mb-4 flex items-center gap-3">
            <LockKeyhole className="h-5 w-5 text-navy" aria-hidden="true" />
            <h3 className="text-lg font-semibold tracking-normal text-navy">Execution constraints</h3>
          </div>
          <div className="space-y-3">
            <Constraint label="Raw Spreads" checked disabled={false} />
            <Constraint label="No Commissions" checked={false} disabled />
            <Constraint label="Limit orders only" checked disabled={false} />
            <Constraint label="High-impact news halt" checked={selection.program.newsBlackoutEnforced} disabled />
          </div>
          <button className="primary-button mt-5 w-full" type="submit" disabled={status === "saving" || accountsLoading}>
            {status === "saved" ? <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />}
            {status === "saving"
              ? "Saving..."
              : status === "saved"
                ? "Configuration saved"
                : status === "loaded"
                  ? "Update account"
                  : accountId
                    ? "Update account"
                    : "Save account"}
          </button>
          {error ? <p className="mt-3 rounded-lg bg-danger/10 px-3 py-2 text-sm font-medium text-danger">{error}</p> : null}
        </section>
      </aside>
    </form>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-3 rounded-lg bg-canvas px-3 py-2">
      <dt className="text-slate">{label}</dt>
      <dd className="text-right font-semibold text-navy">{value}</dd>
    </div>
  );
}

function Constraint({ label, checked, disabled }: { label: string; checked: boolean; disabled: boolean }) {
  return (
    <label className="flex min-h-11 items-center justify-between gap-3 rounded-lg border border-slate/15 bg-white px-3 py-2 text-sm font-medium text-navy">
      <span>{label}</span>
      <input className="h-4 w-4 accent-bullish" type="checkbox" checked={checked} disabled={disabled} readOnly />
    </label>
  );
}
