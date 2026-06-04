export const appConfig = {
  appUrl: import.meta.env.VITE_APP_URL ?? window.location.origin,
  donationUrl: import.meta.env.VITE_DONATION_URL ?? "",
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
  supabasePublishableKey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
};

export const isSupabaseConfigured = Boolean(appConfig.supabaseUrl && appConfig.supabasePublishableKey);
