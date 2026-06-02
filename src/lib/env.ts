export const appConfig = {
  appUrl: import.meta.env.VITE_APP_URL ?? window.location.origin,
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
  supabasePublishableKey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  massiveApiBaseUrl: import.meta.env.VITE_MASSIVE_API_BASE_URL ?? "https://api.massive.com",
};

export const isSupabaseConfigured = Boolean(appConfig.supabaseUrl && appConfig.supabasePublishableKey);
