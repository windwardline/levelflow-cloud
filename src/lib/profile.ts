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

/**
 * Every US time zone a profile may hold, in the order Profile's retired picker
 * listed them (Eastern first, then west, then the standard-time-only zones).
 *
 * Q2-I3: this was a table of option objects — label, regions, daylightLabel,
 * standardLabel, group — plus US_TIME_ZONE_GROUPS, getUsTimeZoneOption and
 * getTimeZoneAbbreviation to read them, about 130 of this module's 219 lines. §16
 * deleted the timezone control, so nothing rendered any of it; only the VALUES
 * were still live, through isUsTimezone below and the profile coercion it backs.
 * The display half is gone rather than kept warm by its own tests, which is what
 * kept it alive. Restoring a picker means restoring its labels with it.
 */
export const US_TIME_ZONES: string[] = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Anchorage",
  "America/Adak",
  "America/Puerto_Rico",
  "America/Phoenix",
  "Pacific/Honolulu",
  "Pacific/Pago_Pago",
  "Pacific/Guam",
];

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
