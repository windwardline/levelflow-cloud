import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  getAssetType,
  getClassCalibration,
  getSymbolCalibrationOverride,
} from "../supabase/functions/trade-analyzer/calibration.ts";
import { expandGridCell, GRID_TOKEN_KEYS, parseGridSpec } from "../scripts/sweepGrid.ts";

/**
 * The class-default token (R4 act 3): `symbolOverride=none` runs each market
 * on its class row with its per-symbol layer removed — the only way to grade
 * the invalidated 2026-08-11 derived cells against their absence. The token
 * is a grid cell like any other for the manifest and the row's variant, and
 * it never reaches the engine: the driver resolves it per market.
 */

const layered = Object.entries(GRID_TOKEN_KEYS).length && (() => {
  // A market that carries a per-symbol layer today, found rather than named.
  const candidates = ["EURUSD", "GBPUSD", "AUDUSD", "USDJPY", "BTCUSD", "ETHUSD", "XAUUSD"];
  return candidates.find((symbol) => Object.keys(getSymbolCalibrationOverride(symbol)).length > 0);
})();

describe("the grid parser accepts the class-default token and crosses it like an axis", () => {
  it("parses symbolOverride=none into a cell carrying only the token", () => {
    assert.deepEqual(parseGridSpec("symbolOverride=none"), [{ symbolOverride: "none" }]);
  });

  it("refuses any other value for the token by name", () => {
    assert.throws(() => parseGridSpec("symbolOverride=class"), /--grid symbolOverride value "class" is not one of: none/);
  });

  it("crosses the token with numeric and string axes", () => {
    const cells = parseGridSpec("symbolOverride=none;tp1RiskShare=0.5,0.6");
    assert.deepEqual(cells, [
      { symbolOverride: "none", tp1RiskShare: 0.5 },
      { symbolOverride: "none", tp1RiskShare: 0.6 },
    ]);
  });

  it("names the token among the valid keys when refusing an unknown one", () => {
    assert.throws(() => parseGridSpec("nonesuch=1"), /symbolOverride/);
  });
});

describe("expandGridCell resolves the token per market and never passes it to the engine", () => {
  it("restores exactly the fields a layered market's layer overrides, to the class row's values", () => {
    assert.ok(layered, "the roster carries no layered market to test with");
    const symbol = layered as string;
    const layer = getSymbolCalibrationOverride(symbol);
    const classRow = getClassCalibration(getAssetType(symbol));
    const expanded = expandGridCell(symbol, { symbolOverride: "none" });
    assert.deepEqual(Object.keys(expanded).sort(), Object.keys(layer).sort());
    for (const key of Object.keys(layer) as Array<keyof typeof classRow>) {
      assert.deepEqual(expanded[key], classRow[key], `${symbol}.${key} restored to the class row`);
    }
    assert.ok(!("symbolOverride" in expanded), "the token itself never reaches the engine");
  });

  it("leaves a market without a layer untouched", () => {
    const bare = ["ASX", "ALGOUSD", "DOTUSD", "HOUSD", "ZSUSX", "TRXUSD"]
      .find((symbol) => Object.keys(getSymbolCalibrationOverride(symbol)).length === 0);
    assert.ok(bare, "the roster carries no layer-less market to test with");
    assert.deepEqual(expandGridCell(bare as string, { symbolOverride: "none" }), {});
  });

  it("lets an explicit key in the same cell win over the restoration", () => {
    const symbol = layered as string;
    const expanded = expandGridCell(symbol, { symbolOverride: "none", tp1RiskShare: 0.42 });
    assert.equal(expanded.tp1RiskShare, 0.42);
  });

  it("passes a cell without the token through unchanged", () => {
    assert.deepEqual(expandGridCell(layered as string, { tp1RiskShare: 0.6 }), { tp1RiskShare: 0.6 });
  });
});

describe("the driver expands the cell at the sweep loop, and the embargo sees the class rows", () => {
  it("calls expandGridCell where the engine's override is handed over", () => {
    const source = readFileSync("scripts/replay-sweep.ts", "utf8");
    assert.match(source, /calibrationOverride: expandGridCell\(symbol, override\),/);
    assert.match(source, /override\.symbolOverride === "none"/);
  });
});
