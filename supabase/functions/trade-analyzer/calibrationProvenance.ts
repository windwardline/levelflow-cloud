/**
 * calibrationProvenance — "is this figure from the condemned corpus?", in code.
 *
 * Asked for at `docs/HANDOFF.md` clause (b) of the reopen gate, and marked
 * there as **cheap now, impossible after the one re-sweep**: once R3's corpus
 * replaces the cells, the question of where TODAY's cells came from stops
 * being answerable at all.
 *
 * Today it is answerable only by reading three documents that partly disagree.
 * `HANDOFF.md:249` says the 72 derived per-market cells "rest on the
 * invalidated corpus". `docs/research/baseline-2026-08-10/4d-derivation-2026-08-11.md`
 * opens with its own INVALID banner. And `docs/trade-model.md:318` calls the
 * same layer "the first per-market calibration derived entirely behind the
 * repaired instrument" — under that file's own global INVALID banner. A reader
 * who lands on the third and not the first gets the opposite answer.
 *
 * So this states it once, in the one place a program can consult.
 *
 * WHAT THIS IS NOT. It is not a claim that anything is valid. It stamps what
 * is EVIDENCED and returns `null` for everything else, and an unstamped
 * constant is an unknown one, never a cleared one — `restsOnInvalidCorpus`
 * answers false for it because the honest answer is "not established", which
 * is why the caller must consult `provenanceOf` rather than the boolean alone.
 */
import type { CategoryCalibration } from "./calibration.ts";

export type DerivationId = "4d-2026-08-11";

export type Derivation = {
  /** The record that documents the derivation. */
  readonly record: string;
  /** The corpus it was derived from. */
  readonly corpus: string;
  /**
   * False when the project has condemned that corpus. This is a statement
   * about the CORPUS, not about whether the shipped number is wrong — a cell
   * derived from a bad corpus may still be the right number by luck, and the
   * point is that nothing here has shown that it is.
   */
  readonly corpusValid: boolean;
  /** Why, in one sentence a reader can act on. */
  readonly note: string;
};

export const DERIVATIONS: Record<DerivationId, Derivation> = {
  "4d-2026-08-11": {
    record: "docs/research/baseline-2026-08-10/4d-derivation-2026-08-11.md",
    corpus: "4c/4d",
    corpusValid: false,
    note:
      "The 4c/4d corpus resolved every setup 4-5 hours out of register with " +
      "its own decision bar (the clock defect, 2026-08-11), so its " +
      "expectancies, fill rates and verdicts are artifacts. The derivation " +
      "record carries that banner itself, and docs/HANDOFF.md:249 states the " +
      "72 derived per-market cells rest on it. Read " +
      "docs/research/remediation-program-2026-08-11.md before citing any of " +
      "them.",
  },
};

/**
 * The four fields the 4d derivation set together, as one cell.
 *
 * `docs/trade-model.md:325-327` names the cell exactly: "(confidenceThreshold
 * 0 · runnerProtection · maxStopAtrMultiplier · sizingHoursFactor)". A market
 * carrying all four carries that derivation; a market carrying some other
 * field carries something else, and this module does not guess what.
 */
export const DERIVED_CELL_FIELDS = [
  "confidenceThreshold",
  "maxStopAtrMultiplier",
  "runnerProtection",
  "sizingHoursFactor",
] as const satisfies ReadonlyArray<keyof CategoryCalibration>;

export type DerivedCellField = (typeof DERIVED_CELL_FIELDS)[number];

function isDerivedCellField(field: string): field is DerivedCellField {
  return (DERIVED_CELL_FIELDS as ReadonlyArray<string>).includes(field);
}

/**
 * The derivation behind one market's value for one field, or null when this
 * module has no evidence for it.
 *
 * `override` is the market's own `getSymbolCalibrationOverride(symbol)`. It is
 * passed in rather than imported so this module states a mapping and reads no
 * table of its own — two tables that can disagree is the failure this exists
 * to end, not one to add.
 */
export function provenanceOf(
  override: Partial<CategoryCalibration>,
  field: string,
): Derivation | null {
  if (!isDerivedCellField(field)) return null;
  // The cell is all four or it is not the cell. A market carrying three of
  // them was not produced by this derivation and must not borrow its stamp.
  const carriesWholeCell = DERIVED_CELL_FIELDS.every(
    (name) => override[name] !== undefined,
  );
  if (!carriesWholeCell) return null;
  return DERIVATIONS["4d-2026-08-11"];
}

/**
 * True only when the field is stamped AND its corpus is condemned.
 *
 * False means "not established", not "cleared". A caller that needs to
 * distinguish the two must read `provenanceOf` and handle null itself.
 */
export function restsOnInvalidCorpus(
  override: Partial<CategoryCalibration>,
  field: string,
): boolean {
  return provenanceOf(override, field)?.corpusValid === false;
}
