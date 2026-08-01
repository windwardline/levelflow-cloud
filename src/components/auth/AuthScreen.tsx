import type { FormEvent, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { Apple, ArrowRight, Globe, Loader2, Mail } from "lucide-react";
import type { Provider } from "@supabase/supabase-js";
import { AppFooter } from "../AppFooter";
import { LevelflowMark } from "../LevelflowMark";
import {
  SATELLITE_FRAME,
  SATELLITE_FRAME_SCROLL,
} from "../satelliteFrame";
import { DonationOptions } from "../donations/DonationOptions";
import { describeAuthEmailError } from "../../lib/authErrors";
import { appConfig, isSupabaseConfigured } from "../../lib/env";
import { supabase } from "../../lib/supabase";

type AuthStatus = "idle" | "sending" | "sent" | "oauth";

const SUPPORT_EMAIL = "help@windwardline.com";
// Shared inbox across apps — name the app so inbound mail can be routed.
const SUPPORT_MAILTO = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("[Levelflow] Help")}`;

type AuthScreenProps = {
  themeControl?: ReactNode;
};

export function AuthScreen({ themeControl }: AuthScreenProps) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<AuthStatus>("idle");
  const [message, setMessage] = useState(
    "Enter your email. We'll send one secure link to open your workspace.",
  );
  const [error, setError] = useState("");
  const [donationsOpen, setDonationsOpen] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.has("donate") || window.location.hash === "#donate";
  });
  const donationsRef = useRef<HTMLDivElement>(null);

  // Spec §17i moved the control that reveals this block into the footer, which is
  // now the one home either support link has on a desktop surface — and the footer
  // is the frame's bottom row, so the block it opens can be most of a scroll region
  // away from it. Bringing it into view is what makes the footer's Donate a route
  // to "the screen's own donate options" rather than a click with no visible
  // result. An effect rather than a scroll inside the handler because the block
  // mounts on this state change: there is nothing to scroll to until React has
  // committed it. Also covers the ?donate / #donate entry, which opens it on load.
  useEffect(() => {
    if (donationsOpen) {
      donationsRef.current?.scrollIntoView({ block: "center" });
    }
  }, [donationsOpen]);

  async function sendMagicLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) {
      setError("Cloud connection is not configured.");
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
      console.error(
        "[auth] magic link send failed:",
        magicLinkError.status ?? "",
        magicLinkError.code ?? magicLinkError.message,
      );
      setStatus("idle");
      setError(describeAuthEmailError(magicLinkError));
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
      setError("Cloud connection is not configured.");
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
      console.error(
        "[auth] oauth sign-in failed:",
        oauthError.status ?? "",
        oauthError.code ?? oauthError.message,
      );
      setStatus("idle");
      setError("That sign-in option is not available right now.");
    }
  }

  const isBusy = status === "sending" || status === "oauth";
  const googleAuthEnabled = import.meta.env.VITE_ENABLE_GOOGLE_AUTH === "true";
  const appleAuthEnabled = import.meta.env.VITE_ENABLE_APPLE_AUTH === "true";
  const oauthEnabled = googleAuthEnabled || appleAuthEnabled;
  const headline = isSupabaseConfigured
    ? "Open your workspace"
    : "Cloud connection pending";
  const body = isSupabaseConfigured
    ? message
    : "Levelflow isn't connected to the cloud yet.";
  const donationFallbackHref = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("[Levelflow] Development support")}&body=${encodeURIComponent(
    "I would like the current donation link for Levelflow development and maintenance.",
  )}`;

  return (
    // Spec §17i: the frame reaches the login screen too — the hero and the card
    // scroll in the content region, the shared footer is the row beneath, always
    // visible. `auth-shell` keeps its own positioned grid wash, which is why the
    // frame's classes ride beside it rather than replacing them.
    <main className={`auth-shell ${SATELLITE_FRAME}`}>
      {themeControl ? (
        <div className="fixed right-4 top-4 z-20">{themeControl}</div>
      ) : null}
      {/* Named for what the page is for — the card's own eyebrow word, not the
          hero's product line: the region is a tab stop now
          (satelliteFrame.ts), and an unnamed stop announces as nothing. */}
      <div
        aria-label="Sign in"
        className={SATELLITE_FRAME_SCROLL}
        role="region"
        tabIndex={0}
      >
        {/* The minimum height is the REGION's, not the viewport's: the two columns
            centre against the box that holds them, and a viewport-height minimum
            inside a shorter region is a scrollbar with nothing under it. (Named by
            shape rather than spelled out — Tailwind's scanner reads this file, and
            a dead class in a comment is a dead rule in the bundle.) */}
        <section className="mx-auto grid min-h-full w-full max-w-7xl items-center gap-10 px-5 pb-8 pt-24 sm:px-8 sm:py-8 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-8">
            <div>
              {/* §17i's satellite mark, in the parking screen's treatment exactly
                  (44px, 16px of air under it) and in its place: above the eyebrow,
                  which keeps its own place above the wordmark. The hero's wordmark
                  is the largest type on the page and stays uncrowded. */}
              <LevelflowMark className="mb-4 h-11 w-11" />
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ink-muted">
                Market review — <span className="text-accent">daily edition</span>
              </p>
            </div>
            <h1 className="wordmark front-hero-word">Levelflow</h1>
            <div className="front-rule" aria-hidden="true" />
            <p className="max-w-md text-lg leading-8 text-ink">
              One page that reads the market for you: live charts, timing, and
              only the trade setups that survive review.
            </p>
            <svg className="front-chartline" viewBox="0 0 480 96" aria-hidden="true">
              <polyline points="0,72 60,64 120,68 180,44 240,52 300,28 360,34 480,12"
                fill="none" stroke="var(--color-accent)" strokeWidth="3" />
              <circle cx="480" cy="12" r="4" fill="var(--color-accent)" />
            </svg>
            <dl className="grid max-w-md gap-4 sm:grid-cols-3">
              <div><dt className="text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-ink-muted">Live charts</dt>
              <dd className="mt-1 text-sm text-ink">prices you can verify</dd></div>
              <div><dt className="text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-ink-muted">Timing</dt>
              <dd className="mt-1 text-sm text-ink">sessions, news, and rates</dd></div>
              <div><dt className="text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-ink-muted">Selective</dt>
              <dd className="mt-1 text-sm text-ink">only setups that pass review</dd></div>
            </dl>
          </div>

          <div className="terminal-panel auth-login-panel w-full p-6 sm:p-8">
            <div className="mb-6 space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ink-muted">
                Sign in
              </p>
              <h2 className="text-2xl font-semibold tracking-normal text-ink">
                {headline}
              </h2>
              <p className="text-sm leading-6 text-ink-muted">{body}</p>
            </div>

            {/* Spec §17c's box-on-box sweep, extended to the pre-auth screen by
                owner ruling (wave 4 flagged both of these notices for one): a
                passive notice is not an affordance, so it takes the Guide's
                callout idiom instead of a card — a 3px accent-side rule and the
                faintest tint (GuidePanel.tsx's blockquote), which is a separator,
                not a box. The words, the tone and the states are unchanged. */}
            {!isSupabaseConfigured ? (
              <div className="mb-5 border-l-[3px] border-caution bg-caution/5 py-3 pl-4 pr-4 text-sm font-semibold text-ink">
                Waiting for connection details.
                <span className="mt-2 block font-medium text-ink-muted">
                  App URL: {appConfig.appUrl}
                </span>
              </div>
            ) : null}

            <form className="space-y-4" onSubmit={sendMagicLink}>
              <label
                className="block text-sm font-medium text-ink"
                htmlFor="email"
              >
                Email
              </label>
              <div className="field auth-input-shell flex items-center focus-within:border-accent">
                <Mail className="h-4 w-4 text-ink-muted" aria-hidden="true" />
                <input
                  id="email"
                  className="h-12 min-w-0 flex-1 bg-transparent px-3 text-base text-ink outline-hidden"
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
              <p className="text-xs font-medium leading-5 text-ink-muted">
                No password is required.
              </p>
            </form>

            {status === "sent" ? (
              <div className="mt-4 border-l-[3px] border-accent bg-accent/5 py-3 pl-4 pr-4 text-sm font-semibold text-accent">
                Check your inbox and open the magic link to continue.
              </div>
            ) : null}

            {oauthEnabled ? (
              <>
                <div className="my-6 flex items-center gap-3">
                  <span className="h-px flex-1 bg-ink-muted/20" />
                  <span className="eyebrow">
                    Other sign-in options
                  </span>
                  <span className="h-px flex-1 bg-ink-muted/20" />
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  {googleAuthEnabled ? (
                    <button
                      className="secondary-button"
                      type="button"
                      onClick={() => signInWithOAuth("google")}
                      disabled={isBusy || !isSupabaseConfigured}
                    >
                      <Globe className="h-4 w-4" aria-hidden="true" />
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
              <p className="mt-4 rounded-lg bg-sell/10 px-3 py-2 text-sm font-medium text-sell">
                {error}
              </p>
            ) : null}

            {/* Spec §17i, single home per platform: the Help mailto and the legal
                trio this card used to repeat below the form are the footer's now —
                §16 put them here when the desktop header's own buttons were killed,
                and the footer in the frame is permanently on screen twenty pixels
                below the card. The donation options stay, because they are a block
                this screen owns rather than a link: the footer's Donate is the
                disclosure that reveals them. */}
            {donationsOpen ? (
              // The divider and the sentence both used to come from inside
              // DonationOptions: the rule was this panel's own idiom drawn by a
              // shared component, and the sentence duplicated the Donate page's
              // App-costs line (spec §17f). Here the sentence is the only thing
              // that says what a donation pays for — this screen has no such
              // section — so both live at the call site, verbatim, in the same
              // place and with the same spacing they always had.
              <div
                ref={donationsRef}
                className="mt-6 border-t border-ink-muted/15 pt-4"
              >
                <p className="mb-4 text-sm leading-6 text-ink-muted">
                  Donations support market data, email, hosting, and development.
                </p>
                <DonationOptions
                  fallbackHref={donationFallbackHref}
                  mode="compact"
                />
              </div>
            ) : null}
          </div>
        </section>
      </div>
      <AppFooter
        donate={{
          expanded: donationsOpen,
          onSelect: () => setDonationsOpen((value) => !value),
        }}
        supportMailto={SUPPORT_MAILTO}
      />
    </main>
  );
}
