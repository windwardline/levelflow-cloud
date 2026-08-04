import { classificationOf, platformsFor, programLinesFor } from "./broker/catalog";
import {
  RISK_PERCENT_MAX,
  RISK_PERCENT_MIN,
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
  // §19 retrofit, amendment 14: saved accounts layered above the single
  // selection above. `brokerAccounts` holds only rows that already cleared
  // brokerAccountProblem — useUserProfile drops an invalid row before it ever
  // reaches a UserProfile — and `activeBrokerAccountId` is the pointer
  // activeAccountOf resolves, returning null rather than a stale account when
  // it dangles.
  brokerAccounts: BrokerAccount[];
  activeBrokerAccountId: string | null;
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
  // Counted by BrokerSelection's own six keys, not by every own-enumerable
  // property of whatever was actually passed: saveProfile calls this with the
  // full nextProfile (a UserProfile), and since the §19 retrofit that object
  // carries a seventh nullable field (activeBrokerAccountId) a plain
  // Object.values(selection) would count right along with these six —
  // wrongly failing the shortcut below for the ordinary case of no selection
  // and no active account.
  const nulls = (Object.keys(NO_BROKER_SELECTION) as (keyof BrokerSelection)[])
    .filter((key) => selection[key] === null).length;
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

// §19 retrofit (amendment 14): the multi-account model. A profile now SAVES
// several confirmed accounts rather than a single selection, with one marked
// active; the six columns above become that first saved account (task 1's
// migration seeds it) and stay live for anyone who has not saved a second one.
export type BrokerClassification = "forex" | "crypto" | "futures";
export type BrokerPlatform = "tradelocker" | "matchtrader" | "tradovate";

/** What the checkout would ask for, before broker_accounts has assigned it a row. */
export type BrokerAccountDraft = {
  accountSize: number;
  brokerId: "e8";
  classification: BrokerClassification;
  drawdownTier: string | null;
  platform: BrokerPlatform;
  programLine: ProgramLine;
  riskPercent: number;
  stage: Stage;
};

/**
 * A draft once it has a saved row — plus the one field that is account
 * metadata rather than purchase shape: the owner's rename (2026-08-04
 * ruling; TASK 6 VERDICT's "later task", arrived). Null means the piped
 * formula labels the account; a value overrides it everywhere labels
 * render. The walk's draft never carries a name — a rename happens on a
 * saved row, so it lives here and not on BrokerAccountDraft, and
 * brokerAccountProblem (catalog validity) never sees it.
 */
export type BrokerAccount = BrokerAccountDraft & {
  displayName: string | null;
  id: string;
};

/**
 * The rename cap is the TASK 6 VERDICT's measured 14: a 16-character
 * worst-glyph rename rendered the chip's full 211px budget with zero
 * clearance, so 14 puts the worst rename at parity with the longest
 * suffixed formula label. The DB check constraint enforces the same
 * bound; this is the client's own refusal, worded for the console.
 */
export const BROKER_ACCOUNT_NAME_MAX = 14;

/** Null when the (trimmed) rename is storable; the refusal otherwise. An
 * empty trim is not a problem — it means "clear the rename". */
export function brokerAccountNameProblem(name: string): string | null {
  const trimmed = name.trim();
  if (trimmed.length > BROKER_ACCOUNT_NAME_MAX) {
    return `rename "${trimmed}" is ${trimmed.length} characters — the measured cap is ${BROKER_ACCOUNT_NAME_MAX}`;
  }
  return null;
}

/**
 * Why this draft is not an account the checkout would sell, or null when it
 * is — the multi-account sibling of brokerSelectionProblem above, checked
 * against the same program-line catalog plus the classification/platform
 * pairing the checkout walk fixes per line. The write path rejects on a
 * non-null return; it never accepts and silently ignores an off-catalog
 * account.
 */
export function brokerAccountProblem(draft: BrokerAccountDraft): string | null {
  if (draft.brokerId !== "e8") {
    return `broker ${draft.brokerId} is not E8`;
  }
  const program = getProgramLine(draft.programLine);
  if (!program) {
    return `program line ${draft.programLine} is not one E8 sells`;
  }
  // Amendment 19: a program line can be a real, documented E8 product (it
  // passes the check above) and still be unsold — `zero` is on no checkout
  // walk at all. programLinesFor is the catalog's own exclusion and the only
  // source of truth for what a walk offers, so this checks membership rather
  // than naming `zero` (or any other line) directly. A draft's other fields
  // can be perfectly self-consistent — as `zero`'s are — and still describe a
  // purchase the checkout does not sell.
  if (
    !programLinesFor(classificationOf(draft.programLine)).some(
      (candidate) => candidate.line === draft.programLine,
    )
  ) {
    return `${draft.programLine} is not sold on any checkout walk`;
  }
  if (classificationOf(draft.programLine) !== draft.classification) {
    return `${draft.programLine} is not sold on the ${draft.classification} market`;
  }
  if (!platformsFor(draft.programLine).includes(draft.platform)) {
    return `${draft.programLine} does not offer ${draft.platform}`;
  }
  if (!program.accountSizes.includes(draft.accountSize)) {
    return `account size ${draft.accountSize} is not on ${program.line}'s ladder`;
  }
  if (!isStage(draft.stage)) {
    return `stage ${draft.stage} is neither challenge nor performance`;
  }
  if (
    !Number.isFinite(draft.riskPercent) ||
    draft.riskPercent < RISK_PERCENT_MIN ||
    draft.riskPercent > RISK_PERCENT_MAX
  ) {
    return `risk per trade ${draft.riskPercent} is off the published band`;
  }
  const tiers = program.drawdownTiers;
  if (!tiers) {
    return draft.drawdownTier === null
      ? null
      : `${program.line} has no drawdown tier to select`;
  }
  if (draft.drawdownTier === null) {
    return `${program.line} requires a drawdown tier`;
  }
  return tiers.includes(draft.drawdownTier)
    ? null
    : `drawdown tier ${draft.drawdownTier} is not one of ${program.line}'s`;
}

/**
 * The active account, resolved by the pointer rather than by position — a
 * profile's accounts carry no other notion of order. Null both when nothing is
 * active and when the pointer names an id `brokerAccounts` does not carry
 * (useUserProfile already dropped that row, or the FK's on-delete-set-null
 * cleared the pointer and the next read has not landed yet).
 */
export function activeAccountOf(profile: UserProfile): BrokerAccount | null {
  if (profile.activeBrokerAccountId === null) {
    return null;
  }
  return profile.brokerAccounts.find(
    (account) => account.id === profile.activeBrokerAccountId,
  ) ?? null;
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
    brokerAccounts: [],
    activeBrokerAccountId: null,
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
