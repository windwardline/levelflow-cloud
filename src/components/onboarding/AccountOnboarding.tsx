import { FormEvent, useEffect, useMemo, useState } from "react";
import { BadgeDollarSign, CheckCircle2, History, LockKeyhole, RadioTower, Save, SlidersHorizontal } from "lucide-react";
import { E8_PROGRAMS, PROGRAM_ORDER, formatCurrency, getSelection, type E8ProgramCode } from "../../lib/e8Matrix";
import { supabase } from "../../lib/supabase";

type AccountOnboardingProps = {
  userEmail: string;
};

type SavedAccount = {
  account_name: string;
  account_size_id: string;
  created_at: string;
  current_balance: number | string;
  current_equity: number | string;
  id: string;
  initial_balance: number | string;
  payout_pct: number;
  program_code: E8ProgramCode;
  stage: string;
  status: string;
  updated_at: string;
};

export function AccountOnboarding({ userEmail }: AccountOnboardingProps) {
  const [programCode, setProgramCode] = useState<E8ProgramCode>("e8_one");
  const [balance, setBalance] = useState(E8_PROGRAMS.e8_one.balances[0]);
  const [rulesetId, setRulesetId] = useState(E8_PROGRAMS.e8_one.rulesets[0].id);
  const [payoutPct, setPayoutPct] = useState(E8_PROGRAMS.e8_one.defaultPayout);
  const [accountName, setAccountName] = useState("Primary Evaluation");
  const [accountId, setAccountId] = useState<string | null>(null);
  const [savedAccounts, setSavedAccounts] = useState<SavedAccount[]>([]);
  const [accountsLoading, setAccountsLoading] = useState(true);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "loaded">("idle");
  const [error, setError] = useState("");

  const program = E8_PROGRAMS[programCode];

  const selection = useMemo(() => getSelection(programCode, balance, rulesetId), [balance, programCode, rulesetId]);

  useEffect(() => {
    let cancelled = false;

    async function loadAccounts() {
      if (!supabase) {
        setAccountsLoading(false);
        return;
      }

      setAccountsLoading(true);

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (cancelled) {
        return;
      }

      if (userError || !user) {
        setAccountsLoading(false);
        setError(userError?.message ?? "No authenticated user found.");
        return;
      }

      const { data, error: accountError } = await supabase
        .from("user_accounts")
        .select("id, account_name, account_size_id, program_code, payout_pct, stage, status, initial_balance, current_balance, current_equity, created_at, updated_at")
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false });

      if (cancelled) {
        return;
      }

      if (accountError) {
        setError(accountError.message);
        setAccountsLoading(false);
        return;
      }

      const accounts = (data ?? []) as SavedAccount[];
      setSavedAccounts(accounts);
      if (accounts[0]) {
        applySavedAccount(accounts[0]);
        setStatus("loaded");
      }
      setAccountsLoading(false);
    }

    loadAccounts();

    return () => {
      cancelled = true;
    };
  }, []);

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
    setSavedAccounts((accounts) => [nextAccount, ...accounts.filter((account) => account.id !== nextAccount.id)]);
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

          {savedAccounts.length > 0 ? (
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
              <div className="grid gap-2 sm:grid-cols-2">
                {savedAccounts.map((account) => (
                  <button
                    className={`ruleset-row min-h-14 ${accountId === account.id ? "ruleset-row-active" : ""}`}
                    key={account.id}
                    type="button"
                    onClick={() => {
                      applySavedAccount(account);
                      setStatus("loaded");
                    }}
                  >
                    <span className="min-w-0">
                      <span className="block truncate">{account.account_name}</span>
                      <span className="block text-xs font-medium text-slate">{formatCurrency(Number(account.initial_balance))}</span>
                    </span>
                  </button>
                ))}
              </div>
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
            <p className="mb-2 text-sm font-semibold text-navy">Program</p>
            <div className="segmented-grid">
              {PROGRAM_ORDER.map((code) => (
                <button
                  key={code}
                  className={`segmented-button ${programCode === code ? "segmented-button-active" : ""}`}
                  type="button"
                  onClick={() => changeProgram(code)}
                >
                  {E8_PROGRAMS[code].name}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2 text-sm font-semibold text-navy">Balance</p>
            <div className="balance-grid">
              {program.balances.map((option) => (
                <button
                  key={option}
                  className={`choice-tile ${balance === option ? "choice-tile-active" : ""}`}
                  type="button"
                  onClick={() => setBalance(option)}
                >
                  {formatCurrency(option)}
                </button>
              ))}
            </div>
          </div>

          {programCode === "e8_one" ? (
            <div>
              <p className="mb-2 text-sm font-semibold text-navy">Ruleset</p>
              <div className="grid gap-2">
                {program.rulesets.map((ruleset) => (
                  <button
                    key={ruleset.id}
                    className={`ruleset-row ${rulesetId === ruleset.id ? "ruleset-row-active" : ""}`}
                    type="button"
                    onClick={() => setRulesetId(ruleset.id)}
                  >
                    <SlidersHorizontal className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>{ruleset.label}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-slate/20 bg-white px-4 py-3 text-sm font-semibold text-navy">
              {selection.label}
            </div>
          )}

          <div>
            <p className="mb-2 text-sm font-semibold text-navy">Payout</p>
            <div className="segmented-grid">
              {program.payoutOptions.map((option) => (
                <button
                  key={option}
                  className={`segmented-button ${payoutPct === option ? "segmented-button-active" : ""}`}
                  type="button"
                  onClick={() => setPayoutPct(option)}
                >
                  {option}%
                </button>
              ))}
            </div>
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
