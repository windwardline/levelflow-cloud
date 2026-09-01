import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { getAssetType } from "../supabase/functions/trade-analyzer/calibration.ts";
import { defaultScanSymbols } from "../supabase/functions/trade-analyzer/symbols.ts";

/**
 * The completeness guard §6b-1 C says is written. It was not — this is it.
 *
 * `getStrategyProfileWeight` ends in `?? DEFAULT_PROFILE_WEIGHT`, so a strategy
 * whose name no class lists scores at 1 in all eight classes with no error and
 * no failing test. A rename would do exactly that, silently, on a live scoring
 * path.
 *
 * THE POPULATION IS DERIVED FROM THE COMMITTEE, and getting that right is most
 * of the work. A naive `name: "` grep over `strategies.ts` returns nine
 * literals of which FOUR are regime names — `compression`, `volatile_chop`,
 * `trend`, `range`, emitted by `classifyRegime`, not by a voter — and misses
 * six more, because three voters choose between two names with a ternary. A
 * curated eleven-name array would be wrong in both directions while reading as
 * a derivation.
 *
 * So this walks the committee's own call list to find the eight voter
 * functions, then reads the `name:` literals inside each one's body. Both
 * branches of every ternary are read by construction, because the source
 * carries both.
 *
 * IT REFUSES IN CI, NOT IN PRODUCTION. Making the runtime fallback throw would
 * turn any gap in this derivation into a live analyzer crash; failing here
 * makes a rename loud at exactly the moment it is introduced, at no runtime
 * risk. That is the whole trade.
 */

const STRATEGIES = readFileSync(
  "supabase/functions/trade-analyzer/strategies.ts",
  "utf8",
);
const PROFILES = readFileSync(
  "supabase/functions/trade-analyzer/strategyProfiles.ts",
  "utf8",
);

/** The voter functions the committee actually calls, from the call site. */
function committeeVoters(): string[] {
  const block = /const votes: StrategyVote\[\] = \[([\s\S]*?)\];/.exec(
    STRATEGIES,
  );
  assert.ok(block, "the committee's vote array is gone — re-point this guard");
  return [...block[1].matchAll(/^\s*(vote\w+)\(/gm)].map((match) => match[1]);
}

/** Every strategy name a given voter can emit, both ternary branches. */
function namesEmittedBy(voter: string): string[] {
  const start = STRATEGIES.indexOf(`function ${voter}(`);
  assert.ok(start >= 0, `${voter} is called by the committee and not defined`);
  // The function body ends at the next top-level close brace.
  const end = STRATEGIES.indexOf("\n}", start);
  const body = STRATEGIES.slice(start, end);
  return [...body.matchAll(/name:\s*(?:[^,\n]*?\?\s*)?"([a-z_]+)"(?:\s*:\s*"([a-z_]+)")?/g)]
    .flatMap((match) => [match[1], match[2]])
    .filter((name): name is string => typeof name === "string");
}

const voters = committeeVoters();
const strategyNames = [...new Set(voters.flatMap(namesEmittedBy))].sort();

/**
 * The two cells that are absent, and the ONLY thing that may change this list.
 *
 * Recorded rather than filled. Writing an explicit `1` here would be a
 * provenance claim, not a restatement: the commit that created the table gave
 * forex four explicit `1`s while omitting this one, in the same commit that
 * gave futures `1.08`, so silence has never meant 1. §6b-1 decision C is the
 * owner ruling that settles it.
 *
 * A second reason once stood here and is STRUCK, 2026-09-01: that every stated
 * value sits at 1.04-1.08, so a written `1.00` would be the only sub-band cell
 * and would read as measured de-emphasis. It is false. Derived from the live
 * table: 48 of the 86 cells sit below 1.04, all eight classes hold at least
 * one, and an explicit `1` already appears eight times across five classes
 * (energies, forex x4, futures, agriculture, livestock). A `1` here would be
 * unremarkable. The reason above needs no help and does not depend on it; this
 * one is kept visible as struck so it is not re-derived and believed.
 */
const KNOWN_ABSENCES: ReadonlyArray<{ assetType: string; strategy: string }> = [
  { assetType: "crypto", strategy: "trend_pullback_to_value" },
  { assetType: "forex", strategy: "trend_pullback_to_value" },
];

function weightsFor(assetType: string): Set<string> {
  const start = PROFILES.indexOf(`  ${assetType}: {`);
  assert.ok(start >= 0, `${assetType} has no weight block`);
  const end = PROFILES.indexOf("\n  },", start);
  return new Set(
    [...PROFILES.slice(start, end).matchAll(/^\s{4}(\w+):/gm)].map((m) => m[1]),
  );
}

describe("the strategy-name population comes from the committee", () => {
  it("finds every voter the committee calls", () => {
    assert.equal(
      voters.length,
      8,
      `the committee calls ${voters.length} voters: ${voters.join(", ")} — if ` +
        "that is a real change, the weight table needs the new one too",
    );
  });

  it("reads both branches of the ternary voters", () => {
    // The half a runtime derivation would miss: a branch that never fires in
    // a fixture still ships a name the table must carry.
    for (
      const [voter, expected] of [
        ["voteBreakoutFailure", ["breakout_continuation", "failed_breakout_reversal"]],
        ["voteMomentumDivergence", ["momentum_confirmation", "momentum_divergence"]],
        ["voteVolumeProfile", ["volume_value_extension", "volume_value_retest"]],
      ] as const
    ) {
      assert.deepEqual(namesEmittedBy(voter).sort(), [...expected].sort());
    }
  });

  it("picks up no REGIME name", () => {
    // classifyRegime emits `name:` too. A grep that swept the file would take
    // all four and demand weights for them.
    for (const regime of ["compression", "volatile_chop", "trend", "range"]) {
      assert.ok(
        !strategyNames.includes(regime),
        `"${regime}" is a regime, not a strategy — the derivation is sweeping ` +
          "the whole file instead of the voter bodies",
      );
    }
  });

  it("derives eleven strategies", () => {
    assert.equal(
      strategyNames.length,
      11,
      `derived ${strategyNames.length}: ${strategyNames.join(", ")}`,
    );
  });
});

describe("every class carries every strategy, or records the absence", () => {
  const assetTypes = [...new Set(defaultScanSymbols.map(getAssetType))].sort();

  it("judges every class the roster actually ships", () => {
    assert.equal(assetTypes.length, 8, assetTypes.join(", "));
  });

  for (const assetType of assetTypes) {
    it(`${assetType} lists every strategy the committee can emit`, () => {
      const listed = weightsFor(assetType);
      const missing = strategyNames.filter((name) => !listed.has(name));
      const allowed = KNOWN_ABSENCES
        .filter((entry) => entry.assetType === assetType)
        .map((entry) => entry.strategy);
      assert.deepEqual(
        missing.sort(),
        [...allowed].sort(),
        `${assetType} is missing ${missing.join(", ")}. Each of those scores ` +
          "at DEFAULT_PROFILE_WEIGHT in silence. If a strategy was RENAMED, " +
          "fix the table. If this is the crypto/forex omission, it is §6b-1 " +
          "decision C and only an owner ruling may fill it — do not write a " +
          "1, which asserts a provenance the table's own notation denies.",
      );
    });
  }

  it("lists no weight for a strategy the committee cannot emit", () => {
    // The other direction: a weight for a name nothing votes is dead config
    // that reads as a live dial.
    for (const assetType of assetTypes) {
      for (const listed of weightsFor(assetType)) {
        assert.ok(
          strategyNames.includes(listed),
          `${assetType} weights "${listed}" and no voter emits it`,
        );
      }
    }
  });

  it("keeps the recorded absences honest", () => {
    // An absence list that outlives its absence is how a stale exemption
    // becomes a permanent hole.
    for (const entry of KNOWN_ABSENCES) {
      assert.ok(
        !weightsFor(entry.assetType).has(entry.strategy),
        `${entry.assetType} now lists ${entry.strategy} — remove it from ` +
          "KNOWN_ABSENCES, and if an owner ruling filled it, say so in §6b-1",
      );
    }
  });
});
