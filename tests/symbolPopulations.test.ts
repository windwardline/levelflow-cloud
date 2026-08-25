import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CENSUS_MIN_SYMBOLS,
  censusSymbolDeclarations,
  parseSymbolMarker,
} from "../scripts/symbolCensus.ts";
import { getAssetType } from "../supabase/functions/trade-analyzer/calibration.ts";
import {
  defaultScanSymbols,
  knownSymbols,
} from "../supabase/functions/trade-analyzer/symbols.ts";

// WHY THIS EXISTS.
//
// Four hand-typed Sets in macroRates.ts were exactly exhaustive over the
// 59-symbol roster the day they were written. Nineteen futures were onboarded
// on 2026-08-06 and nothing anywhere could tell, because a Set states what it
// contains and never what it omits. Five weeks later ZFUSD and ZTUSD were
// found receiving no Treasury-rate treatment while ZBUSD and ZNUSD did.
//
// The same shape had frozen CRYPTO_NEWS_SYMBOLS at 8 while crypto grew to 33,
// so 25 markets could never receive a headline penalty.
//
// This is a CENSUS, not a registry. It walks the source and finds every
// declaration that hard-codes roster symbols, so it catches the next one too.
// A hand-kept list of known offenders would be the very defect it polices.

/**
 * The four files that ARE populations. Exempt from carrying markers because
 * "this file is the population" is not a property the source states, so it
 * cannot be derived — the one hand-maintained thing here, said plainly.
 *
 * It fails CLOSED: a fifth table nobody adds simply has to carry markers like
 * everything else. And each exemption is required below to be covered by an
 * exhaustiveness assertion elsewhere in tests/, so an exemption with no test
 * is a failure rather than a free pass.
 */
const TABLES_OF_RECORD = new Set([
  "supabase/functions/trade-analyzer/symbols.ts",
  "supabase/functions/trade-analyzer/calibration.ts",
  "supabase/functions/trade-analyzer/macroRates.ts",
  "src/lib/symbolMap.ts",
]);

const classMembers = (assetType: string) =>
  defaultScanSymbols.filter((symbol) => getAssetType(symbol) === assetType);

/** Populations a marker may name. Every one is DERIVED, never listed. */
const POPULATIONS: Record<string, () => string[]> = {
  agriculture: () => classMembers("agriculture"),
  crypto: () => classMembers("crypto"),
  energies: () => classMembers("energies"),
  forex: () => classMembers("forex"),
  futures: () => classMembers("futures"),
  indices: () => classMembers("indices"),
  known: () => [...knownSymbols],
  livestock: () => classMembers("livestock"),
  metals: () => classMembers("metals"),
  roster: () => [...defaultScanSymbols],
};

const census = censusSymbolDeclarations(new Set(knownSymbols));
const outside = census.filter((entry) => !TABLES_OF_RECORD.has(entry.file));

describe("hand-listed symbol populations declare themselves", () => {
  it("censuses at a threshold of two, not three", () => {
    // The macroRates Set that started this held exactly TWO members, ZBUSD
    // and ZNUSD, and so do several broker lists. A threshold of three exempts
    // the precise shape being policed.
    assert.equal(CENSUS_MIN_SYMBOLS, 2);
    assert.ok(census.length > 0, "the census found nothing — check the walker");
  });

  it("every declaration outside a table of record carries a marker", () => {
    const unmarked = outside
      .filter((entry) => !parseSymbolMarker(entry.leadingComments))
      .map((entry) => `${entry.file}:${entry.line} ${entry.name}`);
    assert.deepEqual(
      unmarked,
      [],
      `add a // SYMBOLS: marker to each:\n  ${unmarked.join("\n  ")}`,
    );
  });

  it("an `external` marker states a coverage that is still true", () => {
    // THE MECHANISM. The marker pins the RELATIONSHIP, not the membership: it
    // says "8 of 33 vs crypto", and the test recomputes the 33. When the
    // roster grows the total grows and the marker fails on the GROWTH commit
    // — the moment a human is looking at exactly this — rather than five
    // weeks later when someone notices a market scoring oddly.
    //
    // On 2026-08-06 this would have failed for all four macroRates Sets and
    // for CRYPTO_NEWS_SYMBOLS, and the author would have had to state, per
    // list, "the broker genuinely does not offer these" or "this is
    // roster-derived — fix it."
    for (const entry of outside) {
      const marker = parseSymbolMarker(entry.leadingComments);
      if (marker?.kind !== "external") continue;
      const population = POPULATIONS[marker.versus];
      assert.ok(
        population,
        `${entry.name}: unknown population "${marker.versus}"`,
      );
      const members = new Set(population());
      const covered = entry.symbols.filter((symbol) => members.has(symbol));
      assert.equal(
        members.size,
        marker.total,
        `${entry.file}:${entry.line} ${entry.name}: ${marker.versus} now has ${members.size}, marker says ${marker.total} — re-affirm this list or derive it`,
      );
      assert.equal(
        covered.length,
        marker.covered,
        `${entry.file}:${entry.line} ${entry.name}: covers ${covered.length}, marker says ${marker.covered}`,
      );
      assert.equal(
        covered.length,
        entry.symbols.length,
        `${entry.file}:${entry.line} ${entry.name}: names symbols outside ${marker.versus}`,
      );
    }
  });

  it("a `record` marker pins its size, so nobody widens a measurement", () => {
    // A record of what happened must NOT track the roster. Widening it
    // asserts a measurement nobody took — and the 4c/4d corpus behind
    // several of these is invalid anyway. Pinning the size is what protects
    // it from a later agent helpfully aligning it to the present.
    for (const entry of outside) {
      const marker = parseSymbolMarker(entry.leadingComments);
      if (marker?.kind !== "record") continue;
      assert.equal(
        entry.symbols.length,
        marker.size,
        `${entry.file}:${entry.line} ${entry.name} is a record of ${marker.what}; it grew from ${marker.size} to ${entry.symbols.length}`,
      );
    }
  });

  it("a `derived` marker equals its derivation exactly", () => {
    for (const entry of outside) {
      const marker = parseSymbolMarker(entry.leadingComments);
      if (marker?.kind !== "derived") continue;
      const population = POPULATIONS[marker.expression];
      assert.ok(
        population,
        `${entry.name}: unknown derivation "${marker.expression}"`,
      );
      assert.deepEqual(entry.symbols, population().sort());
    }
  });

  it("rejects a marker whose grammar it does not recognise", () => {
    // A typo'd marker must fail loudly. Silently treating it as absent would
    // be the same failure mode one level up: a guard that looks satisfied.
    assert.throws(
      () => parseSymbolMarker("// SYMBOLS: probably fine"),
      /unrecognised SYMBOLS marker/,
    );
    assert.equal(parseSymbolMarker("// just a comment"), null);
  });
});
