// Clause (b) of the reopen gate: make "is this figure from the condemned
// corpus?" answerable by code.
//
// THE SOURCE OF TRUTH IS THE TRACKED ARTIFACT, not this module. The first
// version inferred the stamp from the SHAPE of an override — whether four keys
// were present — which made it a second, independent derivation of something
// `scripts/shipped-cell-provenance.ts` already derives from the 4d confirm-read
// records. Two mechanisms that agree by coincidence are the failure the module
// exists to end, not one to add. So the map is a snapshot and this asserts it
// equals the artifact exactly.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { getSymbolCalibrationOverride } from "../supabase/functions/trade-analyzer/calibration.ts";
import { defaultScanSymbols } from "../supabase/functions/trade-analyzer/symbols.ts";
import {
  DERIVATIONS,
  DERIVED_CELL_FIELDS,
  provenanceOf,
  restsOnInvalidCorpus,
  trancheOf,
  TRANCHE_BY_SYMBOL,
} from "../supabase/functions/trade-analyzer/calibrationProvenance.ts";

const ARTIFACT = "docs/research/r4/shipped-cell-provenance.json";
type Row = { symbol: string; tranche: string | null };
const artifact = () =>
  (JSON.parse(readFileSync(ARTIFACT, "utf8")) as { markets: Row[] }).markets;

describe("calibration provenance agrees with the record it snapshots", () => {
  it("matches the tracked artifact market for market, tranche for tranche", () => {
    const fromRecord = new Map(
      artifact().filter((r) => r.tranche).map((r) => [r.symbol, r.tranche]),
    );
    assert.deepEqual(
      Object.fromEntries([...fromRecord].sort()),
      Object.fromEntries(Object.entries(TRANCHE_BY_SYMBOL).sort()),
      `${ARTIFACT} and TRANCHE_BY_SYMBOL disagree. The artifact derives ` +
        `tranche membership from the 4d confirm-read records and is the ` +
        `source of truth; regenerate the map from it rather than editing it ` +
        `by hand. A market that moved tranche, joined or left must fail HERE ` +
        `— a count alone would not notice a one-for-one substitution.`,
    );
  });

  it("states the three tranches and the 39 + 11 + 22 = 72 arithmetic", () => {
    // docs/trade-model.md:345. Its :322 says "Thirty-nine markets carry a
    // derived cell", which is the derived-4d tranche ALONE — a reader who
    // stops there concludes this module over-stamps by 33.
    const counts = { "derived-4d": 0, "holdout-cycle": 0, totality: 0 } as Record<string, number>;
    for (const tranche of Object.values(TRANCHE_BY_SYMBOL)) counts[tranche] += 1;
    assert.equal(counts["derived-4d"], 39);
    assert.equal(counts["holdout-cycle"], 11);
    assert.equal(counts.totality, 22);
    assert.equal(Object.keys(TRANCHE_BY_SYMBOL).length, 72);
  });

  it("declares all three tranches condemned, each naming its selection", () => {
    for (const id of ["derived-4d", "holdout-cycle", "totality"] as const) {
      const d = DERIVATIONS[id];
      assert.equal(d.corpusValid, false, `${id} must be condemned`);
      assert.match(d.note, /clock defect/);
      assert.match(d.note, /remediation-program-2026-08-11\.md/);
    }
    // The selections differ and that is why the tranches are kept apart.
    assert.equal(DERIVATIONS["derived-4d"].selection, "class-folds");
    assert.equal(DERIVATIONS["holdout-cycle"].selection, "class-folds");
    assert.equal(DERIVATIONS.totality.selection, "per-market-recut");
  });

  it("stamps every stamped market's cell fields, and nothing else", () => {
    for (const symbol of Object.keys(TRANCHE_BY_SYMBOL)) {
      for (const field of DERIVED_CELL_FIELDS) {
        assert.equal(provenanceOf(symbol, field)?.corpus, "4c/4d");
        assert.equal(restsOnInvalidCorpus(symbol, field), true);
      }
      // A field the derivation never set must not borrow the stamp.
      assert.equal(provenanceOf(symbol, "minRewardRisk"), null);
    }
  });

  it("refuses an unstamped market, and false means NOT ESTABLISHED", () => {
    const unstamped = (defaultScanSymbols as unknown as string[]).find(
      (s) => !TRANCHE_BY_SYMBOL[s],
    );
    assert.ok(unstamped, "every roster market is stamped — the fixture is stale");
    assert.equal(trancheOf(unstamped!), null);
    assert.equal(provenanceOf(unstamped!, "confidenceThreshold"), null);
    assert.equal(
      restsOnInvalidCorpus(unstamped!, "confidenceThreshold"),
      false,
      "false here means the record cannot speak, never that the figure is cleared",
    );
  });

  it("stamps only markets that actually carry a per-symbol layer", () => {
    // The artifact's 25 nulls all read "no per-symbol layer: the shipped cell
    // is the class row". So every stamped market must in fact carry one.
    for (const symbol of Object.keys(TRANCHE_BY_SYMBOL)) {
      const override = getSymbolCalibrationOverride(symbol);
      assert.ok(
        Object.keys(override).length > 0,
        `${symbol} is stamped but carries no per-symbol override at all`,
      );
    }
  });
});
