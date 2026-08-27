import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

/**
 * The database's asset-type CHECK constraints, held to the engine's own union.
 *
 * WHAT HAPPENED. Migration 20260702012017 pinned market_data_health and
 * analyzer_events to the six asset types the engine had on 2026-07-02.
 * calibration.ts gained `agriculture` and `livestock` on 2026-08-06, nothing
 * connected the two lists, and every telemetry write for those classes failed
 * its CHECK from that day until 2026-08-27:
 *
 *   new row for relation "market_data_health" violates check constraint
 *     "market_data_health_asset_type_valid"  (LEUSX, livestock, ...)
 *
 * SILENTLY, because recordMarketDataHealth and recordAnalyzerEvent catch and
 * log rather than fail the scan. That is the right call — telemetry must never
 * take a review down — and it is precisely why three weeks passed with two of
 * eight classes missing from analyzer_events, which index.ts calls the one
 * measurable read on the through-market rate.
 *
 * The list is DERIVED from calibration.ts's AssetType union here, never
 * restated. A restated list is the same defect one layer up: correct the day it
 * is written, with nothing to notice the population growing underneath it.
 */

const MIGRATIONS = join(new URL("..", import.meta.url).pathname, "supabase/migrations");
const CALIBRATION = join(
  new URL("..", import.meta.url).pathname,
  "supabase/functions/trade-analyzer/calibration.ts",
);

/** Every member of calibration.ts's AssetType union, read out of the type. */
function engineAssetTypes(): string[] {
  const source = readFileSync(CALIBRATION, "utf8");
  const start = source.indexOf("export type AssetType =");
  assert.ok(start >= 0, "AssetType is no longer declared in calibration.ts");
  const body = source.slice(start, source.indexOf(";", start));
  const members = (body.match(/"([a-z_]+)"/g) ?? []).map((raw) => raw.slice(1, -1));
  // NON-VACUITY: a regex that stopped matching would make every assertion below
  // pass over an empty set, which is the shape this whole file exists to catch.
  assert.ok(
    members.length >= 6,
    `only ${members.length} asset types parsed out of the union — the reader broke`,
  );
  return members.sort();
}

/**
 * The values a named CHECK constraint permits, from the LAST migration that
 * defines it. Later migrations supersede earlier ones, so reading the newest is
 * what tells you the live rule — reading the first would have passed happily
 * against 20260702012017 while production was rejecting rows.
 */
function constraintValues(constraint: string): string[] {
  const files = readdirSync(MIGRATIONS).filter((name) => name.endsWith(".sql")).sort();
  let latest: string | null = null;
  for (const file of files) {
    const sql = readFileSync(join(MIGRATIONS, file), "utf8");
    const index = sql.indexOf(`add constraint ${constraint}`);
    if (index >= 0) latest = sql.slice(index, sql.indexOf(";", index));
  }
  assert.ok(latest, `no migration defines ${constraint}`);
  return Array.from(new Set((latest.match(/'([a-z_]+)'/g) ?? []).map((raw) => raw.slice(1, -1))))
    .sort();
}

describe("the database accepts every class the engine analyses", () => {
  it("market_data_health permits the whole AssetType union", () => {
    const permitted = constraintValues("market_data_health_asset_type_valid");
    for (const assetType of engineAssetTypes()) {
      assert.ok(
        permitted.includes(assetType),
        `market_data_health rejects "${assetType}". Every scan of that class ` +
          `loses its coverage record, and the failure is caught and logged so ` +
          `nothing surfaces. Widen the constraint in a new migration.`,
      );
    }
  });

  it("analyzer_events permits the whole AssetType union", () => {
    const permitted = constraintValues("analyzer_events_asset_type_valid");
    for (const assetType of engineAssetTypes()) {
      assert.ok(
        permitted.includes(assetType),
        `analyzer_events rejects "${assetType}". That table is the diagnostic ` +
          `record the review program reads, so a rejected class is absent from ` +
          `every analysis built on it rather than visibly short.`,
      );
    }
  });

  it("profiles.market_focus permits every class plus multi_asset", () => {
    const permitted = constraintValues("profiles_market_focus_valid");
    for (const assetType of engineAssetTypes()) {
      assert.ok(permitted.includes(assetType), `market_focus rejects "${assetType}"`);
    }
    assert.ok(
      permitted.includes("multi_asset"),
      "market_focus lost its own multi_asset value while being widened",
    );
  });

  it("reads the LATEST definition of a constraint, not the first", () => {
    // The reader above deliberately keeps the last match. Asserting it directly
    // because a first-match reader would pass against 20260702012017's
    // six-value list — green, while production rejected two classes.
    const permitted = constraintValues("market_data_health_asset_type_valid");
    assert.ok(
      permitted.includes("livestock"),
      "the constraint reader is returning a superseded definition",
    );
  });
});
