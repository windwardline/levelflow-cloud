import { cleanExternalUrl } from "./urlSafety";

export type DonationLink = {
  description: string;
  label: string;
  url: string;
};

const viteEnv = import.meta.env ?? {};
const browserOrigin = typeof window === "undefined"
  ? "http://localhost:5173"
  : window.location.origin;
const legacyDonationUrl = cleanExternalUrl(viteEnv.VITE_DONATION_URL);
const stripeDonationUrl = cleanExternalUrl(viteEnv.VITE_DONATION_STRIPE_URL);

export const appConfig = {
  appUrl: viteEnv.VITE_APP_URL ?? browserOrigin,
  donationLinks: [
    {
      description: stripeDonationUrl ? "Card, Link, Apple Pay, Cash App Pay, and other Stripe-supported methods." : "External contribution link.",
      label: stripeDonationUrl ? "Stripe" : "Primary",
      url: stripeDonationUrl || legacyDonationUrl,
    },
    {
      description: "Venmo handle @windwardline.",
      label: "Venmo",
      url: cleanExternalUrl(viteEnv.VITE_DONATION_VENMO_URL),
    },
    {
      description: "Cash App cashtag $windwardline.",
      label: "Cash App",
      url: cleanExternalUrl(viteEnv.VITE_DONATION_CASHAPP_URL),
    },
    {
      description: "PayPal.Me contribution link.",
      label: "PayPal",
      url: cleanExternalUrl(viteEnv.VITE_DONATION_PAYPAL_URL),
    },
  ].filter((link): link is DonationLink => Boolean(link.url)),
  donationUrl: legacyDonationUrl,
  supabaseUrl: viteEnv.VITE_SUPABASE_URL,
  supabasePublishableKey: viteEnv.VITE_SUPABASE_PUBLISHABLE_KEY,
};

export const isSupabaseConfigured = Boolean(appConfig.supabaseUrl && appConfig.supabasePublishableKey);
