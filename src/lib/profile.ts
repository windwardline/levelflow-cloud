import type { ChartTimeframe } from "./marketData";

export type ThemeMode = "light" | "dark" | "system";
export type PreferredSession =
  | "any"
  | "asia"
  | "europe"
  | "north_america"
  | "australia";

export type UserProfile = {
  defaultTimeframe: ChartTimeframe;
  defaultTimezone: string;
  displayName: string;
  email: string;
  id: string;
  preferredSession: PreferredSession;
  themePreference: ThemeMode;
};

export type UsTimeZoneOption = {
  daylightLabel: string;
  group: "adjusts" | "standard";
  label: string;
  regions: string;
  standardLabel: string;
  value: string;
};

export const US_TIME_ZONE_OPTIONS = [
  {
    daylightLabel: "EDT",
    group: "adjusts",
    label: "Eastern Time",
    regions: "Eastern states and Washington, D.C.",
    standardLabel: "EST",
    value: "America/New_York",
  },
  {
    daylightLabel: "CDT",
    group: "adjusts",
    label: "Central Time",
    regions: "Central states",
    standardLabel: "CST",
    value: "America/Chicago",
  },
  {
    daylightLabel: "MDT",
    group: "adjusts",
    label: "Mountain Time",
    regions: "Mountain states and Navajo Nation",
    standardLabel: "MST",
    value: "America/Denver",
  },
  {
    daylightLabel: "PDT",
    group: "adjusts",
    label: "Pacific Time",
    regions: "Pacific states",
    standardLabel: "PST",
    value: "America/Los_Angeles",
  },
  {
    daylightLabel: "AKDT",
    group: "adjusts",
    label: "Alaska Time",
    regions: "Most of Alaska",
    standardLabel: "AKST",
    value: "America/Anchorage",
  },
  {
    daylightLabel: "HADT",
    group: "adjusts",
    label: "Aleutian Time",
    regions: "Western Aleutian Islands",
    standardLabel: "HAST",
    value: "America/Adak",
  },
  {
    daylightLabel: "AST",
    group: "standard",
    label: "Atlantic Time",
    regions: "Puerto Rico and U.S. Virgin Islands",
    standardLabel: "AST",
    value: "America/Puerto_Rico",
  },
  {
    daylightLabel: "MST",
    group: "standard",
    label: "Arizona Time",
    regions: "Most of Arizona",
    standardLabel: "MST",
    value: "America/Phoenix",
  },
  {
    daylightLabel: "HST",
    group: "standard",
    label: "Hawaii Time",
    regions: "Hawaii",
    standardLabel: "HST",
    value: "Pacific/Honolulu",
  },
  {
    daylightLabel: "SST",
    group: "standard",
    label: "Samoa Time",
    regions: "American Samoa",
    standardLabel: "SST",
    value: "Pacific/Pago_Pago",
  },
  {
    daylightLabel: "ChST",
    group: "standard",
    label: "Chamorro Time",
    regions: "Guam and Northern Mariana Islands",
    standardLabel: "ChST",
    value: "Pacific/Guam",
  },
] as const;

export const US_TIME_ZONE_GROUPS = [
  {
    label: "Observes Daylight Saving Time",
    options: US_TIME_ZONE_OPTIONS.filter((option) =>
      option.group === "adjusts"
    ),
  },
  {
    label: "Standard Time Year-Round",
    options: US_TIME_ZONE_OPTIONS.filter((option) =>
      option.group === "standard"
    ),
  },
] as const;

export const US_TIME_ZONES: string[] = US_TIME_ZONE_OPTIONS.map((option) =>
  option.value
);

const US_TIME_ZONE_ALIASES: Record<string, string> = {
  "America/Detroit": "America/New_York",
  "America/Indiana/Indianapolis": "America/New_York",
  "America/Indiana/Marengo": "America/New_York",
  "America/Indiana/Petersburg": "America/New_York",
  "America/Indiana/Vevay": "America/New_York",
  "America/Indiana/Vincennes": "America/New_York",
  "America/Indiana/Winamac": "America/New_York",
  "America/Kentucky/Louisville": "America/New_York",
  "America/Kentucky/Monticello": "America/New_York",
  "America/Indiana/Knox": "America/Chicago",
  "America/Indiana/Tell_City": "America/Chicago",
  "America/Menominee": "America/Chicago",
  "America/North_Dakota/Beulah": "America/Chicago",
  "America/North_Dakota/Center": "America/Chicago",
  "America/North_Dakota/New_Salem": "America/Chicago",
  "America/Boise": "America/Denver",
  "America/Juneau": "America/Anchorage",
  "America/Metlakatla": "America/Anchorage",
  "America/Nome": "America/Anchorage",
  "America/Sitka": "America/Anchorage",
  "America/Yakutat": "America/Anchorage",
  "America/St_Thomas": "America/Puerto_Rico",
  "Pacific/Saipan": "Pacific/Guam",
};

export const PREFERRED_SESSION_OPTIONS: Array<
  { label: string; value: PreferredSession }
> = [
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
    preferredSession: "any",
    themePreference: "system",
  };
}

export function isUsTimezone(
  value: string | null | undefined,
): value is string {
  return typeof value === "string" && US_TIME_ZONES.includes(value);
}

export function resolveDefaultUsTimeZone() {
  const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return coerceToSupportedUsTimeZone(detected);
}

export function coerceToSupportedUsTimeZone(value: string | null | undefined) {
  if (!value) {
    return "America/New_York";
  }
  if (isUsTimezone(value)) {
    return value;
  }
  return US_TIME_ZONE_ALIASES[value] ?? "America/New_York";
}

export function getUsTimeZoneOption(value: string | null | undefined) {
  const timezone = coerceToSupportedUsTimeZone(value);
  return US_TIME_ZONE_OPTIONS.find((option) => option.value === timezone) ??
    US_TIME_ZONE_OPTIONS[0];
}

export function formatUsTimeZoneOptionLabel(option: UsTimeZoneOption) {
  const suffix = option.group === "adjusts"
    ? `${option.daylightLabel}/${option.standardLabel}`
    : option.standardLabel;
  return `${option.label} - ${suffix}`;
}

export function getTimeZoneAbbreviation(timeZone: string, date = new Date()) {
  const option = getUsTimeZoneOption(timeZone);
  const abbreviation = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    timeZone: option.value,
    timeZoneName: "short",
  }).formatToParts(date).find((part) => part.type === "timeZoneName")?.value;

  if (!abbreviation || /^GMT[+-]/.test(abbreviation)) {
    return option.group === "standard"
      ? option.standardLabel
      : option.daylightLabel;
  }
  return abbreviation;
}

export function profileDisplayName(profile: UserProfile | null) {
  const name = profile?.displayName.trim();
  return name || "Trader";
}
