import {
  RISK_PERCENT_OPTIONS,
  getProgramLine,
  isProgramLine,
  isStage,
} from "./broker/programs";
import type { ProgramLine, Stage } from "./broker/types";
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
  // Spec §19g: the broker program selection, six columns on profiles. Default is
  // None — every field null — and the feature is fully dormant until a program is
  // chosen.
  brokerId: "e8" | null;
  brokerProgramLine: ProgramLine | null;
  brokerAccountSize: number | null;
  brokerStage: Stage | null;
  brokerRiskPercent: number | null;
  brokerDrawdownTier: string | null;
};

export type BrokerSelection = Pick<
  UserProfile,
  | "brokerAccountSize"
  | "brokerDrawdownTier"
  | "brokerId"
  | "brokerProgramLine"
  | "brokerRiskPercent"
  | "brokerStage"
>;

/** None is the absence of a selection, not a stored value (§19g). */
export const NO_BROKER_SELECTION: BrokerSelection = {
  brokerAccountSize: null,
  brokerDrawdownTier: null,
  brokerId: null,
  brokerProgramLine: null,
  brokerRiskPercent: null,
  brokerStage: null,
};

/**
 * Why this selection is not a program the user could have bought, or null when it
 * is. The account size's membership in the selected program's ladder and the
 * tier's membership in its domain are enforced here rather than in SQL —
 * duplicating the ladders in check constraints would let them drift from the data
 * module CI pins (§19g).
 *
 * The write path rejects on a non-null return; it never accepts and silently
 * ignores an off-ladder size or an off-domain tier.
 */
export function brokerSelectionProblem(selection: BrokerSelection): string | null {
  const nulls = Object.values(selection).filter((value) => value === null).length;
  if (nulls === 6) {
    return null;
  }
  if (selection.brokerId !== "e8") {
    return `broker ${String(selection.brokerId)} is not E8`;
  }
  if (!isProgramLine(selection.brokerProgramLine)) {
    return `program line ${String(selection.brokerProgramLine)} is not one E8 sells`;
  }
  const program = getProgramLine(selection.brokerProgramLine)!;
  if (
    typeof selection.brokerAccountSize !== "number" ||
    !program.accountSizes.includes(selection.brokerAccountSize)
  ) {
    return `account size ${String(selection.brokerAccountSize)} is not on ${program.line}'s ladder`;
  }
  if (!isStage(selection.brokerStage)) {
    return `stage ${String(selection.brokerStage)} is neither challenge nor performance`;
  }
  if (
    typeof selection.brokerRiskPercent !== "number" ||
    !RISK_PERCENT_OPTIONS.includes(selection.brokerRiskPercent)
  ) {
    return `risk per trade ${String(selection.brokerRiskPercent)} is off the published band`;
  }
  const tiers = program.drawdownTiers;
  if (tiers === null) {
    return selection.brokerDrawdownTier === null
      ? null
      : `${program.line} has no drawdown tier to select`;
  }
  return selection.brokerDrawdownTier !== null &&
      tiers.includes(selection.brokerDrawdownTier)
    ? null
    : `drawdown tier ${String(selection.brokerDrawdownTier)} is not one of ${program.line}'s`;
}

/**
 * The load path's half: a stored row that does not validate falls back to None
 * rather than rendering a selection the data modules cannot size. The caller logs
 * the reason — the constraints and the write path both prevent this, so reaching
 * it is an anomaly worth seeing in the console.
 */
export function coerceBrokerSelection(
  selection: BrokerSelection,
): { problem: string | null; selection: BrokerSelection } {
  const problem = brokerSelectionProblem(selection);
  return { problem, selection: problem ? NO_BROKER_SELECTION : selection };
}

export function selectedProgram(profile: BrokerSelection) {
  return profile.brokerProgramLine === null
    ? null
    : getProgramLine(profile.brokerProgramLine);
}

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
    ...NO_BROKER_SELECTION,
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
