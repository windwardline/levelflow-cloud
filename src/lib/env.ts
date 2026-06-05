export type DonationLink = {
  description: string;
  label: string;
  url: string;
};

function cleanEnvUrl(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

const legacyDonationUrl = cleanEnvUrl(import.meta.env.VITE_DONATION_URL);
const stripeDonationUrl = cleanEnvUrl(import.meta.env.VITE_DONATION_STRIPE_URL);

export const appConfig = {
  appUrl: import.meta.env.VITE_APP_URL ?? window.location.origin,
  donationLinks: [
    {
      description: stripeDonationUrl ? "Card, Link, Apple Pay, Cash App Pay, and other Stripe-supported methods." : "External contribution link.",
      label: stripeDonationUrl ? "Stripe" : "Primary",
      url: stripeDonationUrl || legacyDonationUrl,
    },
    {
      description: "Venmo handle @windwardline.",
      label: "Venmo",
      url: cleanEnvUrl(import.meta.env.VITE_DONATION_VENMO_URL),
    },
    {
      description: "Cash App cashtag $windwardline.",
      label: "Cash App",
      url: cleanEnvUrl(import.meta.env.VITE_DONATION_CASHAPP_URL),
    },
    {
      description: "PayPal.Me contribution link.",
      label: "PayPal",
      url: cleanEnvUrl(import.meta.env.VITE_DONATION_PAYPAL_URL),
    },
  ].filter((link): link is DonationLink => Boolean(link.url)),
  donationUrl: legacyDonationUrl,
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
  supabasePublishableKey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
};

export const isSupabaseConfigured = Boolean(appConfig.supabaseUrl && appConfig.supabasePublishableKey);
