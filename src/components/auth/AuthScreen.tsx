import { FormEvent, useState } from "react";
import { Apple, ArrowRight, Chrome, KeyRound, Loader2, Mail, ShieldCheck } from "lucide-react";
import type { Provider } from "@supabase/supabase-js";
import { brandAssets } from "../../lib/assets";
import { appConfig, isSupabaseConfigured } from "../../lib/env";
import { supabase } from "../../lib/supabase";

type AuthStatus = "idle" | "sending" | "sent" | "verifying" | "oauth";

export function AuthScreen() {
  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");
  const [sentEmail, setSentEmail] = useState("");
  const [status, setStatus] = useState<AuthStatus>("idle");
  const [message, setMessage] = useState("Enter your email to receive a secure code or magic link.");
  const [error, setError] = useState("");

  async function sendOtp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) {
      setError("Supabase is not configured for this deployment.");
      return;
    }

    setError("");
    setStatus("sending");

    const normalizedEmail = email.trim().toLowerCase();
    const { error: otpError } = await supabase.auth.signInWithOtp({
      email: normalizedEmail,
      options: {
        emailRedirectTo: window.location.origin,
      },
    });

    if (otpError) {
      setStatus("idle");
      setError(otpError.message);
      return;
    }

    setSentEmail(normalizedEmail);
    setStatus("sent");
    setMessage(`Code sent to ${normalizedEmail}. The magic link in the same email will also complete sign-in.`);
  }

  async function verifyToken(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) {
      setError("Supabase is not configured for this deployment.");
      return;
    }

    setError("");
    setStatus("verifying");

    const { error: verifyError } = await supabase.auth.verifyOtp({
      email: sentEmail,
      token: token.trim(),
      type: "email",
    });

    if (verifyError) {
      setStatus("sent");
      setError(verifyError.message);
      return;
    }
  }

  async function signInWithOAuth(provider: Extract<Provider, "google" | "apple">) {
    if (!supabase) {
      setError("Supabase is not configured for this deployment.");
      return;
    }

    setError("");
    setStatus("oauth");

    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: window.location.origin,
      },
    });

    if (oauthError) {
      setStatus("idle");
      setError(oauthError.message);
    }
  }

  const isBusy = status === "sending" || status === "verifying" || status === "oauth";
  const showTokenForm = status === "sent" || status === "verifying";
  const headline = isSupabaseConfigured ? "Secure sign-in" : "Deployment setup required";
  const body = isSupabaseConfigured
    ? message
    : "Add the Supabase URL and publishable key to the hosted environment, then apply the SQL bootstrap to enable passwordless login and account saves.";

  return (
    <main className="min-h-screen bg-canvas text-ink">
      <section className="mx-auto grid min-h-screen w-full max-w-7xl items-center gap-8 px-5 py-6 sm:px-8 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="space-y-7">
          <div className="inline-flex items-center gap-2 rounded-full border border-navy/10 bg-white px-4 py-2 text-sm font-medium text-navy shadow-sm">
            <ShieldCheck className="h-4 w-4 text-bullish" aria-hidden="true" />
            Supabase Auth, RLS, and cross-device sessions
          </div>
          <div className="max-w-2xl space-y-5">
            <div className="flex items-center gap-3">
              <img className="h-14 w-14 rounded-lg object-contain" src={brandAssets.mark} alt="Windward Capital mark" />
              <p className="text-sm font-semibold uppercase tracking-normal text-slate">Windward Capital</p>
            </div>
            <h1 className="text-4xl font-semibold tracking-normal text-navy sm:text-5xl">
              Institutional E8 trade operations, synchronized across every trading session.
            </h1>
            <p className="max-w-xl text-base leading-7 text-slate">
              Configure E8 One, Signature, and Pro accounts with strict challenge constraints before generating limit-only setups.
            </p>
          </div>
          <div className="grid max-w-2xl gap-3 sm:grid-cols-3">
            {["Limit orders only", "CE(S)T guardrails", "Realtime RLS"].map((item) => (
              <div key={item} className="rounded-lg border border-white bg-white/80 px-4 py-3 text-sm font-medium text-navy shadow-sm">
                {item}
              </div>
            ))}
          </div>
        </div>

        <div className="terminal-panel mx-auto w-full max-w-md p-6">
          <div className="mb-6 space-y-2">
            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-navy text-white">
              <KeyRound className="h-5 w-5" aria-hidden="true" />
            </div>
            <img className="mx-auto mb-4 h-auto w-full max-w-[260px]" src={brandAssets.logo} alt="Windward Capital" />
            <h2 className="text-2xl font-semibold tracking-normal text-navy">{headline}</h2>
            <p className="text-sm leading-6 text-slate">{body}</p>
          </div>

          {!isSupabaseConfigured ? (
            <div className="mb-5 rounded-lg border border-warning/25 bg-warning/10 px-4 py-3 text-sm font-semibold text-navy">
              Required hosted env vars: `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`.
              <span className="mt-2 block font-medium text-slate">Current app URL: {appConfig.appUrl}</span>
            </div>
          ) : null}

          {!showTokenForm ? (
            <form className="space-y-4" onSubmit={sendOtp}>
              <label className="block text-sm font-medium text-navy" htmlFor="email">
                Email
              </label>
              <div className="flex items-center rounded-lg border border-slate/25 bg-white px-3 focus-within:border-bullish">
                <Mail className="h-4 w-4 text-slate" aria-hidden="true" />
                <input
                  id="email"
                  className="h-12 min-w-0 flex-1 bg-transparent px-3 text-base text-navy outline-none"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="trader@example.com"
                  required
                />
              </div>
              <button className="primary-button w-full" type="submit" disabled={isBusy || !isSupabaseConfigured}>
                {status === "sending" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <ArrowRight className="h-4 w-4" aria-hidden="true" />}
                Send secure code
              </button>
            </form>
          ) : (
            <form className="space-y-4" onSubmit={verifyToken}>
              <label className="block text-sm font-medium text-navy" htmlFor="token">
                6-digit code
              </label>
              <input
                id="token"
                className="h-12 w-full rounded-lg border border-slate/25 bg-white px-4 text-center text-xl font-semibold tracking-normal text-navy outline-none focus:border-bullish"
                inputMode="numeric"
                maxLength={6}
                value={token}
                onChange={(event) => setToken(event.target.value)}
                placeholder="000000"
                required
              />
              <button className="primary-button w-full" type="submit" disabled={isBusy || !isSupabaseConfigured}>
                {status === "verifying" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <ShieldCheck className="h-4 w-4" aria-hidden="true" />}
                Verify and continue
              </button>
            </form>
          )}

          <div className="my-6 flex items-center gap-3">
            <span className="h-px flex-1 bg-slate/20" />
            <span className="text-xs font-semibold uppercase tracking-normal text-slate">OAuth</span>
            <span className="h-px flex-1 bg-slate/20" />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <button className="secondary-button" type="button" onClick={() => signInWithOAuth("google")} disabled={isBusy || !isSupabaseConfigured}>
              <Chrome className="h-4 w-4" aria-hidden="true" />
              Google
            </button>
            <button className="secondary-button" type="button" onClick={() => signInWithOAuth("apple")} disabled={isBusy || !isSupabaseConfigured}>
              <Apple className="h-4 w-4" aria-hidden="true" />
              Apple
            </button>
          </div>

          {error ? <p className="mt-4 rounded-lg bg-danger/10 px-3 py-2 text-sm font-medium text-danger">{error}</p> : null}
        </div>
      </section>
    </main>
  );
}
