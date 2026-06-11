import type { ChartTimeframe } from "./marketData";

export type ThemeMode = "light" | "dark" | "system";
export type MarketFocus = "multi_asset" | "forex" | "metals" | "crypto" | "futures";
export type PreferredSession = "any" | "asia" | "europe" | "north_america" | "australia";

export type UserProfile = {
  defaultTimeframe: ChartTimeframe;
  defaultTimezone: string;
  displayName: string;
  email: string;
  id: string;
  marketFocus: MarketFocus;
  preferredSession: PreferredSession;
  themePreference: ThemeMode;
};

export const US_STATE_TIME_ZONES = [
  { label: "Eastern Time", value: "America/New_York" },
  { label: "Central Time", value: "America/Chicago" },
  { label: "Mountain Time", value: "America/Denver" },
  { label: "Pacific Time", value: "America/Los_Angeles" },
  { label: "Alaska Time", value: "America/Anchorage" },
  { label: "Hawaii-Aleutian Time", value: "Pacific/Honolulu" },
] as const;

export const US_TIME_ZONES: string[] = US_STATE_TIME_ZONES.map((option) => option.value);

export const PREFERRED_SESSION_OPTIONS: Array<{ label: string; value: PreferredSession }> = [
  { label: "No preference", value: "any" },
  { label: "Asia", value: "asia" },
  { label: "Europe", value: "europe" },
  { label: "North America", value: "north_america" },
  { label: "Australia", value: "australia" },
];

export function buildDefaultProfile(id: string, email: string): UserProfile {
  return {
    defaultTimeframe: "1hour",
    defaultTimezone: resolveDefaultUsTimeZone(),
    displayName: "",
    email,
    id,
    marketFocus: "multi_asset",
    preferredSession: "any",
    themePreference: "system",
  };
}

export function isUsTimezone(value: string | null | undefined): value is string {
  return typeof value === "string" && US_TIME_ZONES.includes(value);
}

export function resolveDefaultUsTimeZone() {
  const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return isUsTimezone(detected) ? detected : "America/New_York";
}

export function profileDisplayName(profile: UserProfile | null) {
  const name = profile?.displayName.trim();
  return name || "Trader";
}
