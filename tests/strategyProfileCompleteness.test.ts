import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { getAssetType } from "../supabase/functions/trade-analyzer/calibration.ts";
import { defaultScanSymbols } from "../supabase/functions/trade-analyzer/symbols.ts";
import { STRATEGY_PROFILE_WEIGHTS } from "../supabase/functions/trade-analyzer/strategyProfiles.ts";

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

/**
 * The value guard. The completeness suite above asks whether a CELL EXISTS;
 * this asks what is IN it, which nothing checked until 2026-09-01.
 *
 * Measured that day: editing `forex momentum_confirmation` from 1 to 1.06 — a
 * plausible tuning change, on the path that decides which setups publish —
 * passes all 3281 tests green. The table that multiplies every strategy vote's
 * score and confidence had no guard on its values at all.
 *
 * The harm is not the edit. It is the edit made QUIETLY. `index.ts:1279` and
 * `:1517` scope the global learning cohort by `analyzer_version`, and that
 * cohort feeds `confidence_adjustment` back into scoring for every operator.
 * A weight changed without bumping `ANALYZER_VERSION` pools two different
 * scoring regimes into one corpus and tells everyone the blend.
 *
 * So this is a BASIS ledger, not a value opinion. Changing a weight is
 * legitimate. Changing one without moving the record with it is not, and this
 * is where that gets caught.
 *
 * The bases are the three the record actually supports, and they are not
 * equal in standing:
 *
 *   "inception"        crypto, forex, futures, metals. The table's original
 *                      four (715fc98, 2026-06-27). `docs/trade-model.md:983`
 *                      calls them "hand-set per-class weights — untouched
 *                      since inception", and round-16 (2026-07-30) A/B'd
 *                      exactly these four and reverted every candidate. That
 *                      A/B is void under the clock defect; the provenance
 *                      sentence is not, because the invalidation banner is
 *                      scoped to calibration RESULTS.
 *   "added-2026-07-01" energies, indices. Added at 958f680, four days after
 *                      inception, so "untouched since inception" does not
 *                      describe them — and round-16's A/B body never names
 *                      them. THESE TWO HAVE NEVER BEEN VALIDATED, not even by
 *                      a measurement later invalidated. Indices could not have
 *                      been at the time (a no-trade class then) and is live
 *                      now, `noTradeSymbols` being empty since 2026-08-07.
 *   carried            agriculture, livestock. Pinned by RELATION below rather
 *                      than by literal, because their own notes claim they are
 *                      carried verbatim from futures. A claim worth asserting
 *                      is worth failing.
 *
 * No weight value has ever been edited: three commits have ever touched this
 * file — 715fc98 +99/-0, 958f680 +26/-0, 0fd8280 +37/-0 — and zero weight
 * lines have been removed across all history. Every value is as first written.
 */
const WEIGHT_BASIS_LEDGER: Record<
  string,
  { basis: string; weights: Record<string, number> }
> = {
  crypto: {
    basis: "inception",
    weights: {
      breakout_continuation: 1.06,
      failed_breakout_reversal: 1.02,
      momentum_confirmation: 1.1,
      momentum_divergence: 1.04,
      multi_timeframe_bias: 1.02,
      range_mean_reversion: 0.94,
      smart_money_liquidity: 0.98,
      volatility_expansion: 1.12,
      volume_value_extension: 0.96,
      volume_value_retest: 0.96,
    },
  },
  forex: {
    basis: "inception",
    weights: {
      breakout_continuation: 1,
      failed_breakout_reversal: 1.04,
      momentum_confirmation: 1,
      momentum_divergence: 1.02,
      multi_timeframe_bias: 1.08,
      range_mean_reversion: 1.06,
      smart_money_liquidity: 1.03,
      volatility_expansion: 0.98,
      volume_value_extension: 1,
      volume_value_retest: 1,
    },
  },
  futures: {
    basis: "inception",
    weights: {
      breakout_continuation: 1.08,
      failed_breakout_reversal: 1.05,
      momentum_confirmation: 1.03,
      momentum_divergence: 1,
      multi_timeframe_bias: 1.06,
      range_mean_reversion: 0.94,
      smart_money_liquidity: 1.02,
      trend_pullback_to_value: 1.08,
      volatility_expansion: 1.04,
      volume_value_extension: 1.03,
      volume_value_retest: 1.03,
    },
  },
  metals: {
    basis: "inception",
    weights: {
      breakout_continuation: 1.02,
      failed_breakout_reversal: 1.08,
      momentum_confirmation: 1.02,
      momentum_divergence: 1.04,
      multi_timeframe_bias: 1.03,
      range_mean_reversion: 0.96,
      smart_money_liquidity: 1.08,
      trend_pullback_to_value: 1.04,
      volatility_expansion: 1.05,
      volume_value_extension: 1.02,
      volume_value_retest: 1.02,
    },
  },
  energies: {
    basis: "added-2026-07-01",
    weights: {
      breakout_continuation: 1.06,
      failed_breakout_reversal: 1.05,
      momentum_confirmation: 1.04,
      momentum_divergence: 1,
      multi_timeframe_bias: 1.05,
      range_mean_reversion: 0.94,
      smart_money_liquidity: 1.04,
      trend_pullback_to_value: 1.05,
      volatility_expansion: 1.08,
      volume_value_extension: 1.02,
      volume_value_retest: 1.02,
    },
  },
  indices: {
    basis: "added-2026-07-01",
    weights: {
      breakout_continuation: 1.04,
      failed_breakout_reversal: 1.03,
      momentum_confirmation: 1.04,
      momentum_divergence: 0.98,
      multi_timeframe_bias: 1.08,
      range_mean_reversion: 0.98,
      smart_money_liquidity: 1.02,
      trend_pullback_to_value: 1.06,
      volatility_expansion: 1.03,
      volume_value_extension: 1.01,
      volume_value_retest: 1.01,
    },
  },
};

describe("no weight moves without the record moving with it", () => {
  it("pins every originally-authored cell to its recorded basis", () => {
    for (const [assetType, entry] of Object.entries(WEIGHT_BASIS_LEDGER)) {
      assert.deepEqual(
        STRATEGY_PROFILE_WEIGHTS[assetType as keyof typeof STRATEGY_PROFILE_WEIGHTS],
        entry.weights,
        `${assetType} weights moved. This is §6b-1 C territory: state the new ` +
          `basis here, and bump ANALYZER_VERSION — global learning is scoped ` +
          `by it (index.ts:1279, :1517) and an unversioned change pools two ` +
          `scoring regimes into the corpus that adjusts everyone's confidence.`,
      );
    }
  });

  it("holds the two carried classes to the claim their notes make", () => {
    // Their comments say "carried over verbatim from futures — NOT derived".
    // Asserted as a relation, so editing futures alone breaks the claim loudly
    // instead of leaving a false provenance note attached to a realized-R
    // figure.
    for (const carried of ["agriculture", "livestock"]) {
      assert.deepEqual(
        STRATEGY_PROFILE_WEIGHTS[carried as keyof typeof STRATEGY_PROFILE_WEIGHTS],
        STRATEGY_PROFILE_WEIGHTS.futures,
        `${carried} no longer equals futures, so its "carried over verbatim ` +
          `from futures" note is now false. Either restore it or rewrite the ` +
          `note and give the class its own basis in the ledger above.`,
      );
    }
  });

  it("covers every class, so a ninth cannot arrive unrecorded", () => {
    assert.deepEqual(
      Object.keys(STRATEGY_PROFILE_WEIGHTS).sort(),
      [...Object.keys(WEIGHT_BASIS_LEDGER), "agriculture", "livestock"].sort(),
    );
  });
});
