import type { ChartTimeframe } from "./marketData";

export type ThemeMode = "light" | "dark" | "system";
export type MarketFocus = "multi_asset" | "forex" | "metals" | "crypto" | "futures";
export type ExperienceLevel = "newer" | "intermediate" | "advanced";
export type PreferredSession = "any" | "asia" | "europe" | "north_america" | "australia";

export type UserProfile = {
  defaultTimeframe: ChartTimeframe;
  defaultTimezone: string;
  displayName: string;
  email: string;
  experienceLevel: ExperienceLevel;
  id: string;
  marketFocus: MarketFocus;
  preferredSession: PreferredSession;
  themePreference: ThemeMode;
};

export const US_TIME_ZONE_GROUPS = [
  {
    label: "Eastern",
    options: [
      ["America/New_York", "Eastern Time"],
      ["America/Detroit", "Eastern - Michigan"],
      ["America/Kentucky/Louisville", "Eastern - Kentucky, Louisville"],
      ["America/Kentucky/Monticello", "Eastern - Kentucky, Monticello"],
      ["America/Indiana/Indianapolis", "Eastern - Indiana, Indianapolis"],
      ["America/Indiana/Vincennes", "Eastern - Indiana, Vincennes"],
      ["America/Indiana/Winamac", "Eastern - Indiana, Winamac"],
      ["America/Indiana/Marengo", "Eastern - Indiana, Marengo"],
      ["America/Indiana/Petersburg", "Eastern - Indiana, Petersburg"],
      ["America/Indiana/Vevay", "Eastern - Indiana, Vevay"],
    ],
  },
  {
    label: "Central",
    options: [
      ["America/Chicago", "Central Time"],
      ["America/Indiana/Tell_City", "Central - Indiana, Tell City"],
      ["America/Indiana/Knox", "Central - Indiana, Knox"],
      ["America/Menominee", "Central - Michigan, Menominee"],
      ["America/North_Dakota/Center", "Central - North Dakota, Center"],
      ["America/North_Dakota/New_Salem", "Central - North Dakota, New Salem"],
      ["America/North_Dakota/Beulah", "Central - North Dakota, Beulah"],
    ],
  },
  {
    label: "Mountain",
    options: [
      ["America/Denver", "Mountain Time"],
      ["America/Boise", "Mountain - Idaho, Boise"],
      ["America/Phoenix", "Mountain - Arizona"],
    ],
  },
  {
    label: "Pacific, Alaska, Hawaii",
    options: [
      ["America/Los_Angeles", "Pacific Time"],
      ["America/Anchorage", "Alaska Time"],
      ["America/Juneau", "Alaska - Juneau"],
      ["America/Sitka", "Alaska - Sitka"],
      ["America/Metlakatla", "Alaska - Metlakatla"],
      ["America/Yakutat", "Alaska - Yakutat"],
      ["America/Nome", "Alaska - Nome"],
      ["America/Adak", "Hawaii-Aleutian - Adak"],
      ["Pacific/Honolulu", "Hawaii Time"],
    ],
  },
  {
    label: "U.S. Territories",
    options: [
      ["America/Puerto_Rico", "Atlantic - Puerto Rico"],
      ["Pacific/Guam", "Chamorro - Guam"],
      ["Pacific/Saipan", "Chamorro - Northern Mariana Islands"],
      ["Pacific/Pago_Pago", "Samoa - American Samoa"],
    ],
  },
] satisfies Array<{ label: string; options: Array<[string, string]> }>;

export const US_TIME_ZONES = US_TIME_ZONE_GROUPS.flatMap((group) => group.options.map(([value]) => value));

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
    experienceLevel: "intermediate",
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
