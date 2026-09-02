/**
 * 4b evidence extraction — the measured half of
 * docs/research/4b-geometry-model-review-2026-08-10.md.
 *
 * Reads ONE manifested, evidence-enriched corpus (legs, excursions, exit
 * clock, riskDistance on every record — PR #292/#293) and prints the five
 * questions' measurements per class. Baseline variant only; holdout
 * markets excluded (3e); capture-all rows kept where a question needs the
 * full score range (Q3) and split out where it needs the accepted stream.
 * The confirm fold is sealed at the door (R4 act 1): its rows are withheld
 * before this file sees them, and the headline states how many.
 *
 *   npx tsx scripts/geometry-evidence.ts <emit.jsonl>
 */
import { fileURLToPath } from "node:url";
import { getAssetType } from "../supabase/functions/trade-analyzer/calibration.ts";
import type { ResolutionLeg } from "../supabase/functions/trade-analyzer/replay.ts";
import {
  assertManifestedCorpusStreaming,
  emptyStats,
  addOutcome,
  clusteredStandardError,
  expectancy,
  type SweepEmitRow,
  type SweepStats,
  vocabularyRow,
} from "./sweepStats.ts";

// The evidence fields the five questions read, declared ONCE (#364
// round 28, finding 1 — round 6's defect class, closed by the
// VOCABULARY_ROW_KEYS mechanism applied to the evidence half): the
// streaming projection is DERIVED from this list, so a field declared
// on EvidenceRow cannot be silently dropped by the narrowing — the
// hand-enumerated projection had already dropped sessionLabel and
// tp1Hit, which a future question would have read as undefined on
// every row with the suite green. A test holds this list and the type
// in lockstep.
export const EVIDENCE_ROW_KEYS = [
  "accepted",
  "confidenceScore",
  "exitAtMs",
  "filledAtMs",
  "legs",
  "maxAdverseMove",
  "maxFavorableMove",
  "regime",
  "riskDistance",
  "sessionLabel",
  "side",
  "stopProvenance",
  "tp1Hit",
] as const;

export type EvidenceRow = SweepEmitRow & {
  accepted?: boolean;
  confidenceScore?: number;
  exitAtMs?: number;
  filledAtMs?: number | null;
  legs?: ResolutionLeg[];
  maxAdverseMove?: number | null;
  maxFavorableMove?: number | null;
  regime?: string;
  riskDistance?: number;
  sessionLabel?: string;
  side?: string;
  stopProvenance?: string;
  tp1Hit?: boolean;
};

/**
 * Gross R halves from the legs — the accountant's arithmetic, split so the
 * ladder's two halves and its cost are separately visible. Cost is derived
 * as gross − realized, so the decomposition always reconciles to the
 * record's own net figure.
 */
export function decomposeLegs(row: EvidenceRow): {
  bankedR: number;
  costR: number;
  exitR: number;
  singleTargetR: number;
} | null {
  const legs = row.legs ?? [];
  const entry = legs.find((leg) => leg.leg === "entry");
  const exit = legs.find((leg) => leg.leg === "exit");
  const risk = Number(row.riskDistance);
  if (!entry || !exit || !Number.isFinite(risk) || risk <= 0) {
    return null;
  }
  const sign = row.side === "sell" ? -1 : 1;
  const tp1 = legs.find((leg) => leg.leg === "tp1");
  const bankedR = tp1 ? (0.5 * sign * (tp1.price - entry.price)) / risk : 0;
  const exitFraction = tp1 ? 0.5 : 1;
  const exitR = (exitFraction * sign * (exit.price - entry.price)) / risk;
  const gross = bankedR + exitR;
  const realized = Number(row.realizedR) || 0;
  return {
    bankedR,
    costR: Number((gross - realized).toFixed(4)),
    exitR,
    // The no-TP1 counterfactual: the full position rides to the SAME exit
    // print the runner half actually took (target, breakeven, stop or
    // expiry close), with the same one round trip of cost.
    singleTargetR: Number(
      ((sign * (exit.price - entry.price)) / risk - (gross - realized))
        .toFixed(4),
    ),
  };
}

export function spearman(pairs: Array<[number, number]>): number | null {
  if (pairs.length < 3) {
    return null;
  }
  const rank = (values: number[]) => {
    const sorted = values.map((value, index) => ({ index, value }))
      .sort((a, b) => a.value - b.value);
    const ranks = new Array<number>(values.length);
    let position = 0;
    while (position < sorted.length) {
      let end = position;
      while (
        end + 1 < sorted.length &&
        sorted[end + 1].value === sorted[position].value
      ) {
        end += 1;
      }
      const shared = (position + end) / 2 + 1;
      for (let at = position; at <= end; at += 1) {
        ranks[sorted[at].index] = shared;
      }
      position = end + 1;
    }
    return ranks;
  };
  const xRanks = rank(pairs.map(([x]) => x));
  const yRanks = rank(pairs.map(([, y]) => y));
  const meanX = xRanks.reduce((sum, value) => sum + value, 0) / xRanks.length;
  const meanY = yRanks.reduce((sum, value) => sum + value, 0) / yRanks.length;
  let covariance = 0;
  let varianceX = 0;
  let varianceY = 0;
  for (let index = 0; index < xRanks.length; index += 1) {
    const dx = xRanks[index] - meanX;
    const dy = yRanks[index] - meanY;
    covariance += dx * dy;
    varianceX += dx * dx;
    varianceY += dy * dy;
  }
  if (varianceX === 0 || varianceY === 0) {
    return null;
  }
  return covariance / Math.sqrt(varianceX * varianceY);
}

export function quantile(sortedValues: number[], q: number): number | null {
  if (sortedValues.length === 0) {
    return null;
  }
  const position = (sortedValues.length - 1) * q;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  const weight = position - lower;
  return sortedValues[lower] * (1 - weight) + sortedValues[upper] * weight;
}

function fmt(value: number | null | undefined, digits = 3): string {
  return value === null || value === undefined || !Number.isFinite(value)
    ? "—"
    : value.toFixed(digits);
}

async function main(): Promise<void> {
  const paths = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
  if (paths.length !== 1) {
    console.error("usage: geometry-evidence.ts <emit.jsonl>");
    process.exit(1);
  }
  // Streamed through the manifest door with a projection (#364 round 27,
  // finding 3 — round 26's "one reader left" count missed this one): the
  // non-streaming read held BOTH the raw array and the filtered copy
  // live, with EvidenceRow carrying legs[] and the excursion fields —
  // heavier per row than sweep-analysis's projection, on the same
  // 505 MB-scale corpora, and R1b grows every emit by the no-bars rows
  // that previously emitted nothing. The projection spreads
  // vocabularyRow FIRST (round 6's law: a field the partition reads
  // cannot be dropped by a reader's narrowing), then exactly the
  // evidence fields the five questions read; the baseline/holdout
  // filter runs inside the callback so filtered rows are never held, and
  // the confirm fold never reaches it — the door seals that and counts it.
  const rows: EvidenceRow[] = [];
  let dataAbsentRows = 0;
  const manifest = await assertManifestedCorpusStreaming(paths[0], (raw) => {
    const row = raw as EvidenceRow;
    if ((row.variant ?? "baseline") !== "baseline" || row.holdout === true) {
      return;
    }
    if (raw.noBarsInReviewWindow === true) {
      dataAbsentRows += 1;
    }
    const projected = {
      ...vocabularyRow(raw),
    } as EvidenceRow;
    for (const key of EVIDENCE_ROW_KEYS) {
      if (key in row) {
        (projected as Record<string, unknown>)[key] = row[key];
      }
    }
    rows.push(projected);
  });
  // The headline states market evidence (#364 round 28, finding 3): the
  // five questions all filter to filled rows, so no TABLE moves with a
  // marked row — but the headline is the corpus-size figure an operator
  // quotes, and R1b inflates exactly it (no-bars decisions that
  // previously emitted nothing now emit baseline rows, in bulk for the
  // sparse floorless classes).
  // A corpus whose readable baseline rows number zero is a refusal, not
  // five empty tables at exit 0: with the confirm fold sealed at the door
  // (R4 act 1) a shard holding only that fold reaches here with nothing,
  // and a header-only report is what a wrong path prints too.
  if (rows.length - dataAbsentRows === 0) {
    throw new Error(
      `geometry-evidence: no readable baseline market-evidence row — ` +
        `${manifest.sealedRows} confirm row(s) sealed at the door, ` +
        `${dataAbsentRows} data-absent; the five questions would print ` +
        `empty tables under a success code. Pass shards holding fit or ` +
        `select rows.`,
    );
  }
  console.log(
    `corpus ${manifest.manifestHash.slice(0, 12)} · engine ${manifest.analyzerVersion} · ${
      rows.length - dataAbsentRows
    } baseline market-evidence rows (holdout excluded by the emit's stamped ` +
      `flag; confirm fold sealed at the door: ${manifest.sealedRows} rows ` +
      `withheld)`,
  );
  if (dataAbsentRows > 0) {
    console.log(
      `(data-absence rows held out of the headline: ${dataAbsentRows}` +
        ` — baseline variant, stamped holdout excluded; retained in the ` +
        `row stream, and every question filters to filled rows)`,
    );
  }
  console.log("");
  const reviewHoursBySymbol = new Map<string, number>(
    manifest.symbols.map((entry) => [
      entry.symbol,
      Number(entry.calibration.defaultReviewHours) || 0,
    ]),
  );

  const classes = [...new Set(rows.map((row) => getAssetType(row.symbol)))]
    .sort();
  const byClass = (cls: string) =>
    rows.filter((row) => getAssetType(row.symbol) === cls);

  console.log("## Q1 — ladder decomposition (accepted stream)\n");
  console.log(
    "| class | filled | banked R | runner-half R | cost R | net R | single-target R | be-exits | be MFE p50 (R) |",
  );
  console.log("| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |");
  for (const cls of classes) {
    const accepted = byClass(cls).filter((row) =>
      row.accepted !== false && row.outcome !== "unfilled"
    );
    let banked = 0;
    let exitHalf = 0;
    let cost = 0;
    let net = 0;
    let single = 0;
    const beMfe: number[] = [];
    let beCount = 0;
    for (const row of accepted) {
      const parts = decomposeLegs(row);
      if (!parts) continue;
      banked += parts.bankedR;
      exitHalf += parts.exitR;
      cost += parts.costR;
      net += Number(row.realizedR) || 0;
      single += parts.singleTargetR;
      const exitLeg = row.legs?.find((leg) => leg.leg === "exit");
      if (exitLeg?.kind === "breakeven_stop") {
        beCount += 1;
        const risk = Number(row.riskDistance);
        if (Number.isFinite(row.maxFavorableMove ?? Number.NaN) && risk > 0) {
          beMfe.push((row.maxFavorableMove as number) / risk);
        }
      }
    }
    beMfe.sort((a, b) => a - b);
    console.log(
      `| ${cls} | ${accepted.length} | ${fmt(banked, 1)} | ${fmt(exitHalf, 1)} | ${
        fmt(cost, 1)
      } | ${fmt(net, 1)} | ${fmt(single, 1)} | ${beCount} | ${
        fmt(quantile(beMfe, 0.5))
      } |`,
    );
  }

  console.log("\n## Q2 — stop model (accepted stream)\n");
  console.log(
    "| class | provenance | n | mean R | R < −1.1 | winner MAE/R p50 | p90 |",
  );
  console.log("| --- | --- | ---: | ---: | ---: | ---: | ---: |");
  for (const cls of classes) {
    const accepted = byClass(cls).filter((row) =>
      row.accepted !== false && row.outcome !== "unfilled"
    );
    const provenances = [...new Set(accepted.map((row) => row.stopProvenance))]
      .sort();
    for (const provenance of provenances) {
      const subset = accepted.filter((row) =>
        row.stopProvenance === provenance
      );
      const mean = subset.reduce((sum, row) => sum + (Number(row.realizedR) || 0), 0) /
        Math.max(subset.length, 1);
      const tail = subset.filter((row) => Number(row.realizedR) < -1.1).length;
      const winnerMae = subset
        .filter((row) =>
          row.outcome === "take_profit" &&
          Number.isFinite(row.maxAdverseMove ?? Number.NaN) &&
          Number(row.riskDistance) > 0
        )
        .map((row) => (row.maxAdverseMove as number) / Number(row.riskDistance))
        .sort((a, b) => a - b);
      console.log(
        `| ${cls} | ${provenance} | ${subset.length} | ${fmt(mean)} | ${tail} | ${
          fmt(quantile(winnerMae, 0.5))
        } | ${fmt(quantile(winnerMae, 0.9))} |`,
      );
    }
  }

  console.log("\n## Q3 — confidence rank power (full capture range)\n");
  console.log("| class | decile | n | mean R | | class ρ (score→R) |");
  console.log("| --- | ---: | ---: | ---: | --- | ---: |");
  for (const cls of classes) {
    const filled = byClass(cls).filter((row) =>
      row.outcome !== "unfilled" &&
      Number.isFinite(row.confidenceScore ?? Number.NaN)
    );
    const scores = filled.map((row) => row.confidenceScore as number)
      .sort((a, b) => a - b);
    const rho = spearman(
      filled.map((
        row,
      ) => [row.confidenceScore as number, Number(row.realizedR) || 0]),
    );
    for (let decile = 0; decile < 10; decile += 1) {
      const low = quantile(scores, decile / 10);
      const high = quantile(scores, (decile + 1) / 10);
      if (low === null || high === null) continue;
      const subset = filled.filter((row) => {
        const score = row.confidenceScore as number;
        return score >= low && (decile === 9 ? score <= high : score < high);
      });
      if (subset.length === 0) continue;
      const mean = subset.reduce(
        (sum, row) => sum + (Number(row.realizedR) || 0),
        0,
      ) / subset.length;
      console.log(
        `| ${cls} | ${decile + 1} | ${subset.length} | ${fmt(mean)} | | ${
          decile === 0 ? fmt(rho) : ""
        } |`,
      );
    }
  }

  console.log("\n## Q4 — the window (accepted stream)\n");
  console.log(
    "| class | resolved | expiry share | in-profit expiries | hrs-to-exit p50 | p90 | window hrs (mode) |",
  );
  console.log("| --- | ---: | ---: | ---: | ---: | ---: | ---: |");
  for (const cls of classes) {
    const accepted = byClass(cls).filter((row) =>
      row.accepted !== false && row.outcome !== "unfilled"
    );
    const expiries = accepted.filter((row) =>
      row.outcome === "expired_in_profit" || row.outcome === "expired_at_loss"
    );
    const inProfit = expiries.filter((row) =>
      row.outcome === "expired_in_profit"
    );
    const hours = accepted
      .filter((row) =>
        Number.isFinite(row.exitAtMs ?? Number.NaN) &&
        Number.isFinite(row.filledAtMs ?? Number.NaN)
      )
      .map((row) =>
        ((row.exitAtMs as number) - (row.filledAtMs as number)) / 3_600_000
      )
      .sort((a, b) => a - b);
    const windows = accepted.map((row) =>
      reviewHoursBySymbol.get(row.symbol) ?? 0
    );
    const windowMode = windows.sort((a, b) =>
      windows.filter((v) => v === a).length -
      windows.filter((v) => v === b).length
    ).at(-1);
    console.log(
      `| ${cls} | ${accepted.length} | ${
        fmt(expiries.length / Math.max(accepted.length, 1))
      } | ${inProfit.length} | ${fmt(quantile(hours, 0.5), 1)} | ${
        fmt(quantile(hours, 0.9), 1)
      } | ${windowMode ?? "—"} |`,
    );
  }

  console.log("\n## Q5 — regime × class (accepted stream, clustered SE)\n");
  console.log("| class | regime | n | mean R | ± clustered SE |");
  console.log("| --- | --- | ---: | ---: | ---: |");
  for (const cls of classes) {
    const accepted = byClass(cls).filter((row) =>
      row.accepted !== false && row.outcome !== "unfilled"
    );
    const regimes = [...new Set(accepted.map((row) => row.regime))].sort();
    for (const regime of regimes) {
      const subset = accepted.filter((row) => row.regime === regime);
      const bySymbol = new Map<string, SweepStats>();
      for (const row of subset) {
        if (!bySymbol.has(row.symbol)) {
          bySymbol.set(row.symbol, emptyStats());
        }
        addOutcome(bySymbol.get(row.symbol)!, row);
      }
      const pooled = emptyStats();
      for (const row of subset) addOutcome(pooled, row);
      console.log(
        `| ${cls} | ${regime} | ${subset.length} | ${
          fmt(expectancy(pooled))
        } | ${fmt(clusteredStandardError([...bySymbol.values()]))} |`,
      );
    }
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
