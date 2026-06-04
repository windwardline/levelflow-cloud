import { useCallback, useEffect, useMemo, useState } from "react";
import type { E8ProgramCode } from "../lib/e8Matrix";
import { supabase } from "../lib/supabase";

export type SavedAccount = {
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

const ACCOUNT_SELECT =
  "id, account_name, account_size_id, program_code, payout_pct, stage, status, initial_balance, current_balance, current_equity, created_at, updated_at";

export function useUserAccounts() {
  const [accounts, setAccounts] = useState<SavedAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [error, setError] = useState("");

  const refreshAccounts = useCallback(async () => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      setError(userError?.message ?? "No authenticated user found.");
      setLoading(false);
      return;
    }

    const { data, error: accountError } = await supabase
      .from("user_accounts")
      .select(ACCOUNT_SELECT)
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false });

    if (accountError) {
      setError(accountError.message);
      setLoading(false);
      return;
    }

    const nextAccounts = (data ?? []) as SavedAccount[];
    setAccounts(nextAccounts);
    setSelectedAccountId((current) => (current && nextAccounts.some((account) => account.id === current) ? current : nextAccounts[0]?.id ?? ""));
    setLoading(false);
  }, []);

  useEffect(() => {
    refreshAccounts();
  }, [refreshAccounts]);

  useEffect(() => {
    if (!supabase) {
      return;
    }
    const client = supabase;

    let channel: ReturnType<typeof client.channel> | null = null;
    let cancelled = false;

    async function subscribe() {
      const {
        data: { user },
      } = await client.auth.getUser();

      if (!user || cancelled) {
        return;
      }

      channel = client
        .channel(`level-flow-accounts-${user.id}`)
        .on(
          "postgres_changes",
          { event: "*", filter: `user_id=eq.${user.id}`, schema: "public", table: "user_accounts" },
          () => {
            refreshAccounts();
          },
        )
        .subscribe();
    }

    subscribe();

    return () => {
      cancelled = true;
      if (channel) {
        client.removeChannel(channel);
      }
    };
  }, [refreshAccounts]);

  const selectedAccount = useMemo(
    () => accounts.find((account) => account.id === selectedAccountId) ?? accounts[0] ?? null,
    [accounts, selectedAccountId],
  );

  return {
    accounts,
    error,
    loading,
    refreshAccounts,
    selectedAccount,
    selectedAccountId,
    setSelectedAccountId,
  };
}
