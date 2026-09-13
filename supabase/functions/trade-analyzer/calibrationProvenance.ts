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

/**
 * The three tranches of 2026-08-11, not one.
 *
 * `docs/trade-model.md:345` states the arithmetic: **39 + 11 + 22 = 72**.
 * `:322` says "Thirty-nine markets carry a derived cell" — that is the
 * derived-4d tranche ALONE, and a reader who stops there concludes this module
 * over-stamps by 33. All three ran on the same 4c/4d corpus and share its
 * defect; they are kept apart because they were selected differently
 * (`scripts/shipped-cell-provenance.ts:101-125`: class-folds for the first two,
 * a per-market recut for totality).
 */
export type DerivationId = "derived-4d" | "holdout-cycle" | "totality";

const CLOCK_DEFECT_NOTE =
  "The 4c/4d corpus resolved every setup 4-5 hours out of register with its " +
  "own decision bar (the clock defect, 2026-08-11), so its expectancies, fill " +
  "rates and verdicts are artifacts. The derivation record carries that " +
  "banner itself, and docs/HANDOFF.md:249 states the 72 derived per-market " +
  "cells rest on it. Read docs/research/remediation-program-2026-08-11.md " +
  "before citing any of them.";

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
  /** How this tranche's markets were selected. */
  readonly selection: "class-folds" | "per-market-recut";
};

export const DERIVATIONS: Record<DerivationId, Derivation> = {
  "derived-4d": {
    record: "docs/research/baseline-2026-08-10/4d-derivation-2026-08-11.md",
    corpus: "4c/4d",
    corpusValid: false,
    note: CLOCK_DEFECT_NOTE,
    selection: "class-folds",
  },
  "holdout-cycle": {
    record: "docs/research/baseline-2026-08-10/4d-derivation-2026-08-11.md",
    corpus: "4c/4d",
    corpusValid: false,
    note: CLOCK_DEFECT_NOTE,
    selection: "class-folds",
  },
  totality: {
    record: "docs/research/baseline-2026-08-10/4d-derivation-2026-08-11.md",
    corpus: "4c/4d",
    corpusValid: false,
    note: CLOCK_DEFECT_NOTE,
    selection: "per-market-recut",
  },
};

/**
 * WHICH MARKET CAME FROM WHICH TRANCHE — a snapshot of the tracked artifact
 * `docs/research/r4/shipped-cell-provenance.json`, which is the source of
 * truth and derives tranche membership from the 4d confirm-read artifacts
 * themselves (`scripts/shipped-cell-provenance.ts`).
 *
 * This is data, not a second derivation. The first version of this module
 * inferred the stamp from the SHAPE of an override — whether four keys were
 * present — which made it a second, independent mechanism that agreed with the
 * artifact only by coincidence, and which could not notice a one-for-one
 * substitution: when R3 replaces some cells and leaves others the count stays
 * 72, and every replaced market would still have been stamped condemned.
 *
 * `tests/calibrationProvenance.test.ts` asserts this map equals the artifact
 * exactly, so a market that moves tranche, joins or leaves fails there rather
 * than drifting.
 */
// SYMBOLS: record the 2026-08-11 4d derivation, three tranches | 72
export const TRANCHE_BY_SYMBOL: Readonly<Record<string, DerivationId>> = {
  AAVEUSD: "totality",
  ADAUSD: "derived-4d",
  AUDCAD: "derived-4d",
  AUDCHF: "holdout-cycle",
  AUDJPY: "derived-4d",
  AUDNZD: "holdout-cycle",
  AUDUSD: "derived-4d",
  BCHUSD: "derived-4d",
  BNBUSD: "totality",
  BTCUSD: "derived-4d",
  BZUSD: "totality",
  CADCHF: "derived-4d",
  CADJPY: "derived-4d",
  CAKEUSD: "totality",
  CHFJPY: "derived-4d",
  CLUSD: "derived-4d",
  DASHUSD: "totality",
  DAX: "totality",
  DOGEUSD: "totality",
  EGLDUSD: "totality",
  ESUSD: "derived-4d",
  ETCUSD: "totality",
  ETHUSD: "derived-4d",
  EURAUD: "derived-4d",
  EURCAD: "derived-4d",
  EURCHF: "derived-4d",
  EURGBP: "derived-4d",
  EURJPY: "derived-4d",
  EURNZD: "derived-4d",
  EURUSD: "holdout-cycle",
  GBPAUD: "derived-4d",
  GBPCAD: "holdout-cycle",
  GBPCHF: "derived-4d",
  GBPJPY: "derived-4d",
  GBPNZD: "derived-4d",
  GBPUSD: "derived-4d",
  GCUSD: "derived-4d",
  GRTUSD: "totality",
  HBARUSD: "totality",
  HGUSD: "derived-4d",
  IMXUSD: "totality",
  LINKUSD: "totality",
  LTCUSD: "derived-4d",
  NGUSD: "holdout-cycle",
  NQUSD: "derived-4d",
  NSDQ: "holdout-cycle",
  NZDCAD: "derived-4d",
  NZDCHF: "holdout-cycle",
  NZDJPY: "holdout-cycle",
  NZDUSD: "derived-4d",
  PAUSD: "totality",
  RTYUSD: "holdout-cycle",
  SIUSD: "derived-4d",
  SOLUSD: "totality",
  SP: "derived-4d",
  UNIUSD: "totality",
  USDCAD: "derived-4d",
  USDCHF: "derived-4d",
  USDJPY: "derived-4d",
  WTI: "derived-4d",
  XAGUSD: "totality",
  XAUUSD: "derived-4d",
  XLMUSD: "totality",
  XMRUSD: "totality",
  XRPUSD: "derived-4d",
  YMUSD: "holdout-cycle",
  ZBUSD: "totality",
  ZCUSX: "derived-4d",
  ZLUSX: "derived-4d",
  ZMUSD: "holdout-cycle",
  ZNUSD: "totality",
  ZOUSX: "totality",
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
  symbol: string,
  field: string,
): Derivation | null {
  if (!isDerivedCellField(field)) return null;
  const tranche = TRANCHE_BY_SYMBOL[symbol.toUpperCase().replace(/[^A-Z0-9]/g, "")];
  return tranche ? DERIVATIONS[tranche] : null;
}

/** The tranche a market's cell came from, or null where the record cannot say. */
export function trancheOf(symbol: string): DerivationId | null {
  return TRANCHE_BY_SYMBOL[symbol.toUpperCase().replace(/[^A-Z0-9]/g, "")] ?? null;
}

/**
 * True only when the field is stamped AND its corpus is condemned.
 *
 * False means "not established", not "cleared". A caller that needs to
 * distinguish the two must read `provenanceOf` and handle null itself.
 */
export function restsOnInvalidCorpus(symbol: string, field: string): boolean {
  return provenanceOf(symbol, field)?.corpusValid === false;
}
