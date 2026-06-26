import type { FormEvent, ReactNode } from "react";
import { useState } from "react";
import {
  Apple,
  ArrowRight,
  Chrome,
  Gift,
  KeyRound,
  Loader2,
  Mail,
} from "lucide-react";
import type { Provider } from "@supabase/supabase-js";
import { LegalLinks } from "../legal/LegalLinks";
import { DonationOptions } from "../donations/DonationOptions";
import { brandAssets } from "../../lib/assets";
import { appConfig, isSupabaseConfigured } from "../../lib/env";
import { supabase } from "../../lib/supabase";

type AuthStatus = "idle" | "sending" | "sent" | "oauth";

const SUPPORT_EMAIL = "support@windwardline.com";

type AuthScreenProps = {
  themeControl?: ReactNode;
};

export function AuthScreen({ themeControl }: AuthScreenProps) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<AuthStatus>("idle");
  const [message, setMessage] = useState(
    "Enter your email to receive a secure magic link. No password required.",
  );
  const [error, setError] = useState("");
  const [donationsOpen, setDonationsOpen] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.has("donate") || window.location.hash === "#donate";
  });

  async function sendMagicLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) {
      setError("Cloud access is not connected for this deployment.");
      return;
    }

    setError("");
    setStatus("sending");

    const normalizedEmail = email.trim().toLowerCase();
    const { error: magicLinkError } = await supabase.auth.signInWithOtp({
      email: normalizedEmail,
      options: {
        emailRedirectTo: appConfig.appUrl,
      },
    });

    if (magicLinkError) {
      setStatus("idle");
      setError("The sign-in link could not be sent. Try again shortly.");
      return;
    }

    setStatus("sent");
    setMessage(
      `Magic link sent to ${normalizedEmail}. Open that email to continue.`,
    );
  }

  async function signInWithOAuth(
    provider: Extract<Provider, "google" | "apple">,
  ) {
    if (!supabase) {
      setError("Cloud access is not connected for this deployment.");
      return;
    }

    setError("");
    setStatus("oauth");

    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: appConfig.appUrl,
      },
    });

    if (oauthError) {
      setStatus("idle");
      setError("That sign-in option is not available right now.");
    }
  }

  const isBusy = status === "sending" || status === "oauth";
  const googleAuthEnabled = import.meta.env.VITE_ENABLE_GOOGLE_AUTH === "true";
  const appleAuthEnabled = import.meta.env.VITE_ENABLE_APPLE_AUTH === "true";
  const oauthEnabled = googleAuthEnabled || appleAuthEnabled;
  const headline = isSupabaseConfigured ? "Sign in" : "Cloud access pending";
  const body = isSupabaseConfigured
    ? message
    : "Cloud access is not connected yet. Once configured, sign-in will open the live workspace.";
  const donationFallbackHref = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("LevelFlow development support")}&body=${encodeURIComponent(
    "I would like the current donation link for LevelFlow development and maintenance.",
  )}`;

  return (
    <main className="min-h-screen bg-canvas text-ink">
      {themeControl ? (
        <div className="fixed right-4 top-4 z-20">{themeControl}</div>
      ) : null}
      <section className="mx-auto grid min-h-screen w-full max-w-7xl items-center gap-8 px-5 pb-6 pt-24 sm:px-8 sm:py-6 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="space-y-8">
          <div className="max-w-2xl space-y-6">
            <div className="flex items-center gap-3">
              <img
                className="h-14 w-14 rounded-lg object-contain"
                src={brandAssets.mark}
                alt="Windward Line mark"
              />
              <div>
                <p className="text-sm font-semibold uppercase tracking-normal text-slate">
                  A Windward Line product
                </p>
                <p className="text-sm font-medium text-bullish">
                  Market review, refined
                </p>
              </div>
            </div>
            <h1 className="text-6xl font-semibold tracking-normal text-navy sm:text-7xl">
              LevelFlow
            </h1>
            <p className="max-w-xl text-base leading-7 text-slate">
              A premium workspace for charts, timing, and limit setups.
            </p>
          </div>
        </div>

        <div className="terminal-panel mx-auto w-full max-w-md p-6">
          <div className="mb-6 space-y-2">
            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-navy text-white">
              <KeyRound className="h-5 w-5" aria-hidden="true" />
            </div>
            <p className="text-sm font-semibold uppercase tracking-normal text-bullish">
              Private workspace
            </p>
            <h2 className="text-2xl font-semibold tracking-normal text-navy">
              {headline}
            </h2>
            <p className="text-sm leading-6 text-slate">{body}</p>
          </div>

          {!isSupabaseConfigured ? (
            <div className="mb-5 rounded-lg border border-warning/25 bg-warning/10 px-4 py-3 text-sm font-semibold text-navy">
              Waiting for cloud project details.
              <span className="mt-2 block font-medium text-slate">
                App URL: {appConfig.appUrl}
              </span>
            </div>
          ) : null}

          <form className="space-y-4" onSubmit={sendMagicLink}>
            <label
              className="block text-sm font-medium text-navy"
              htmlFor="email"
            >
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
            <button
              className="primary-button w-full"
              type="submit"
              disabled={isBusy || !isSupabaseConfigured}
            >
              {status === "sending" ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              )}
              Send magic link
            </button>
          </form>

          {status === "sent" ? (
            <div className="mt-4 rounded-lg border border-bullish/25 bg-bullish/10 px-3 py-2 text-sm font-semibold text-bullish">
              Check your inbox and open the magic link to continue.
            </div>
          ) : null}

          {oauthEnabled ? (
            <>
              <div className="my-6 flex items-center gap-3">
                <span className="h-px flex-1 bg-slate/20" />
                <span className="text-xs font-semibold uppercase tracking-normal text-slate">
                  Other sign-in options
                </span>
                <span className="h-px flex-1 bg-slate/20" />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {googleAuthEnabled ? (
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => signInWithOAuth("google")}
                    disabled={isBusy || !isSupabaseConfigured}
                  >
                    <Chrome className="h-4 w-4" aria-hidden="true" />
                    Google
                  </button>
                ) : null}
                {appleAuthEnabled ? (
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => signInWithOAuth("apple")}
                    disabled={isBusy || !isSupabaseConfigured}
                  >
                    <Apple className="h-4 w-4" aria-hidden="true" />
                    Apple
                  </button>
                ) : null}
              </div>
            </>
          ) : null}

          {error ? (
            <p className="mt-4 rounded-lg bg-danger/10 px-3 py-2 text-sm font-medium text-danger">
              {error}
            </p>
          ) : null}

          <div className="mt-6 grid gap-3 border-t border-slate/15 pt-4 sm:grid-cols-2">
            <a className="secondary-button" href={`mailto:${SUPPORT_EMAIL}`}>
              <Mail className="h-4 w-4" aria-hidden="true" />
              Contact
            </a>
            <button
              className="secondary-button"
              type="button"
              aria-expanded={donationsOpen}
              onClick={() => setDonationsOpen((value) => !value)}
            >
              <Gift className="h-4 w-4" aria-hidden="true" />
              Donate
            </button>
          </div>
          {donationsOpen ? (
            <div className="mt-4">
              <DonationOptions
                fallbackHref={donationFallbackHref}
                mode="compact"
              />
            </div>
          ) : null}
          <div className="mt-6 border-t border-slate/15 pt-4">
            <LegalLinks />
          </div>
        </div>
      </section>
    </main>
  );
}
