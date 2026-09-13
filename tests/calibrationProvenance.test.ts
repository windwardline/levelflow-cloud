// Clause (b) of the reopen gate (docs/HANDOFF.md), marked there as "cheap now,
// impossible after the one re-sweep": make "is this figure from the condemned
// corpus?" answerable by code rather than by reconciling three documents that
// disagree.
//
// The population is DERIVED from the calibration itself, never listed. A market
// that gains or loses the derived cell moves this count, and that is the point:
// the stamp must track the code, not a literal someone forgot to edit.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getSymbolCalibrationOverride,
} from "../supabase/functions/trade-analyzer/calibration.ts";
import { defaultScanSymbols } from "../supabase/functions/trade-analyzer/symbols.ts";
import {
  DERIVATIONS,
  DERIVED_CELL_FIELDS,
  provenanceOf,
  restsOnInvalidCorpus,
} from "../supabase/functions/trade-analyzer/calibrationProvenance.ts";

const roster = defaultScanSymbols as unknown as string[];
const carriesWholeCell = (symbol: string) => {
  const override = getSymbolCalibrationOverride(symbol);
  return DERIVED_CELL_FIELDS.every((f) => override[f] !== undefined);
};

describe("calibration provenance — the condemned corpus is answerable by code", () => {
  it("stamps exactly the markets carrying the whole derived cell, and counts 72", () => {
    const stamped = roster.filter(carriesWholeCell);
    // 72 is the count docs/HANDOFF.md:249 states for the derived per-market
    // cells, and it is re-derived here rather than trusted. If this moves, the
    // handoff's sentence moved with it and one of the two is now wrong.
    assert.equal(
      stamped.length,
      72,
      `the derived-cell population is ${stamped.length}, not the 72 the record ` +
        `states. Re-derive docs/HANDOFF.md:249 before editing this number.`,
    );
    for (const symbol of stamped) {
      const override = getSymbolCalibrationOverride(symbol);
      for (const field of DERIVED_CELL_FIELDS) {
        assert.equal(
          provenanceOf(override, field)?.corpus,
          "4c/4d",
          `${symbol}.${field} carries the derived cell and must stamp to 4c/4d`,
        );
        assert.equal(restsOnInvalidCorpus(override, field), true);
      }
    }
  });

  it("refuses to stamp a field the derivation did not set", () => {
    // Three markets override runnerWindowShare, two tp1RiskShare, one
    // defaultReviewHours. None of those is in the 4d cell, so none may borrow
    // its stamp — an over-broad stamp would condemn figures the derivation
    // never touched, which is the mirror of the defect this closes.
    const other = roster.find((s) => {
      const o = getSymbolCalibrationOverride(s) as Record<string, unknown>;
      return o.runnerWindowShare !== undefined || o.tp1RiskShare !== undefined;
    });
    assert.ok(other, "no market overrides a non-cell field — the fixture is stale");
    const override = getSymbolCalibrationOverride(other!);
    assert.equal(provenanceOf(override, "runnerWindowShare"), null);
    assert.equal(provenanceOf(override, "minRewardRisk"), null);
    assert.equal(
      restsOnInvalidCorpus(override, "runnerWindowShare"),
      false,
      "false here means NOT ESTABLISHED, never cleared",
    );
  });

  it("refuses a partial cell rather than borrowing the stamp", () => {
    // The cell is all four or it is not the cell. A market carrying three was
    // not produced by this derivation.
    const partial = { confidenceThreshold: 0, maxStopAtrMultiplier: 4, runnerProtection: "hold" as const };
    assert.equal(
      provenanceOf(partial, "confidenceThreshold"),
      null,
      "three of four fields is not the 4d cell and must not stamp to it",
    );
  });

  it("declares the 4c/4d corpus condemned, with the record that says so", () => {
    const d = DERIVATIONS["4d-2026-08-11"];
    assert.equal(d.corpusValid, false);
    assert.match(d.record, /4d-derivation-2026-08-11\.md$/);
    assert.match(d.note, /clock defect/);
    // The note must route a reader to the remediation programme, because
    // AGENTS.md requires reading it before trusting any derived cell.
    assert.match(d.note, /remediation-program-2026-08-11\.md/);
  });

  it("keeps the cell definition matching the record that names it", () => {
    // docs/trade-model.md:325-327 names the cell as exactly these four.
    assert.deepEqual(
      [...DERIVED_CELL_FIELDS].sort(),
      ["confidenceThreshold", "maxStopAtrMultiplier", "runnerProtection", "sizingHoursFactor"],
    );
  });
});
