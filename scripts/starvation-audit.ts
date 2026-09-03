/**
 * Which markets are STARVED by our parameters rather than short of edge?
 *
 * One failure mode repeated four times in a single night: a parameter constrains
 * setup generation, the market produces a thin sample, and the thin sample is
 * read as "no edge". Oil (an energies TP1 share twice the healthy value),
 * indices (an ATR cap clipping structural stops), copper and gas (an absolute
 * cost floor), then oats and rough rice (a runner ceiling too tight to reach —
 * rice produced SEVEN setups and was called a -0.200 market).
 *
 * Four discoveries by accident is not a method. This is the method: the sweep
 * records where every decision dies, so starvation is directly measurable rather
 * than stumbled upon. For each market it reports what share of decisions each
 * gate consumes, and flags the ones whose survival rate is low enough that any
 * expectancy verdict about them is really a verdict about our own gates.
 *
 * The two gates that matter most here are the geometry gates:
 *   planRejected — the ladder refused to build at all: the required target is
 *     unreachable inside the review window, or the runner landed inside TP1.
 *     Rice at runnerWindowShare 0.6 died here 263 times out of 424 decisions.
 *   belowPayoff  — reward:risk under the class floor. Copper died here on 100%
 *     of 2304 setups because an absolute cost floor exceeded its risk distance.
 *
 * Session and news blocks are deliberate and not starvation; they are reported
 * for completeness so the arithmetic is legible.
 *
 * Columns are resolved BY NAME from the table's own header (#364 round 1,
 * finding 1): the positional map that stood here had already drifted once
 * (never re-indexed when notWarm joined the driver's table — geometryKill
 * silently summed noConsensus + belowConf) and R1b's unresolv column would
 * have drifted it again. A required name missing from the header is a
 * refusal, never a zero; notWarm and unresolv are optional-with-zero so
 * pre-notWarm logs stay readable. tests/sweepManifest.test.ts pins the
 * driver's header against the names required here AND against the data
 * row's own order.
 *
 * R1b narrowed planRejected's meaning (#364 round 7, smaller): decisions
 * whose review window held no bars used to land here; they now resolve
 * and emit as setups rows carrying the data-absence marker (dataAbsent
 * in the driver's table). So planRejected — and geometryKill/survival
 * built on it — is the ladder's own refusals only, and figures recorded
 * before R1b (the rice 263-of-424 above) sit on the wider meaning;
 * compare across that boundary with the marker in hand.
 *
 * This gate REFUSES a --capture-all table (#364 round 19 turned the
 * standing advice into a guard): capture-all deliberately emits
 * below-threshold decisions as outcome rows instead of tallying the
 * acceptance gates, so belowConf and belowPayoff read 0 there and
 * survival is overstated — the opposite lie from the drift this file
 * just closed. The driver stamps "# capture-all" above such a table
 * and parse() refuses the marker like a missing required column.
 * Tables printed BEFORE the marker existed cannot be told apart — for
 * archives, the advice stands: run this gate on normal tables only. (regimeBlk is safe either
 * way: the driver's regimeGated addend is structurally zero — blocked
 * regimes exit at the pre-plan gate in normal mode and skip the
 * acceptance tally in capture-all — so the column is the pre-geometry
 * block exactly.)
 *
 * A FILE this gate parses ZERO rows from is refused the same way —
 * per file, not per invocation (#364 round 20, finding 2; round 21,
 * finding 2), so a shard log from a run that died before any symbol
 * completed cannot hide beside a healthy table and silently drop its
 * markets from the roster. The shapes: a survey log (--warm-only and
 * --discover print the full header and no data rows — the nightly
 * launchd log has exactly this shape), a --grid table with no
 * baseline variant, and a truncated log — all used to print "0 of 0
 * markets flagged" and exit 0, a clean pass with nothing measured.
 * --report cannot suppress this refusal: it acknowledges a measured
 * verdict, never an absent one.
 *
 * Optional-with-zero is sound only within ONE table generation (#364
 * round 21, smaller): an absent optional column reads 0, which means
 * "unknown", not "none" — summing a pre-R1b table's unknown with a
 * post-R1b table's real tally subtracts less than the runs produced
 * and biases survival UP, the round-18 direction. A path set whose
 * headers disagree on an optional name refuses rather than blends.
 * That comparison is also, today, the only thing keeping the
 * planRejected GENERATIONS apart (#364 round 22, smaller):
 * planRejected is a required column whose meaning R1b narrowed, and
 * the refusal separates the two meanings only because the same change
 * added unresolv and dataAbsent to the header. A future semantics
 * change to a required column ships its own discriminator — this
 * check cannot see one.
 *
 * unresolv (R1b's defect bucket — the plan built and the resolver still
 * returned non-finite numbers) is excluded from BOTH sides of the
 * survival arithmetic (#364 round 14): counting those decisions as
 * survivors biased survival up and this gate under-flagged, while
 * counting them as geometry kills would blame parameters for a sweep
 * bug. A nonzero unresolv is a debugging signal, not a starvation one.
 *
 * A ZERO geometry denominator is NO VERDICT, never the worst one
 * (#364 round 31, finding 1): by the driver's row identity,
 * reachedGeometry = planRejected + belowConf + belowPayoff +
 * (setups − dataAbsent), so it reaches zero exactly when the geometry
 * killed nothing — every decision died at the pre-geometry gates, or
 * every emitted setup carried the data-absence marker, the expected
 * shape for the sparse floorless classes this gate protects. Such a
 * market prints "survive —" with the cause named, sorts last, and
 * never counts toward the STARVED/thin tally or the exit-1: the
 * round-18 both-sides rule stands, and its zero case is a data
 * condition, not a geometry one (the rule account-type-report applies
 * to filled 0, round 25).
 *
 * A LOW geometry denominator prints its ratio but withholds the
 * verdict (#364 round 32, finding 3): survival 0-of-2 is the same
 * printed figure as 0-of-2,000 and carries none of its evidence, and
 * a STARVED flag from a handful of decisions is this file's own
 * failure mode pointed at itself — a verdict drawn from a sample too
 * small to support one. Below --min-reached (default 30 — the
 * binomial basis is recorded at the constant, #364 round 33, finding
 * 2) the row prints its ratio with "thin sample — flag withheld" and
 * joins neither the starved tally nor the flagged denominator; the
 * floor in effect prints above the table on EVERY run, so a clean
 * run and a --min-reached 0 run are distinguishable (#364 round 33,
 * smaller). The summary partitions the roster by cause —
 * flagged-eligible, thin-sample, and the two no-verdict shapes,
 * all-marked vs nothing-reached (#364 round 36, finding 3: round 35
 * split the refusal's remedies on that discriminator and this line,
 * the one a passing run is quoted from, still absorbed both into one
 * bucket) — so an excluded market
 * is named, never absorbed (#364 round 32, finding 2: the old "N of
 * M flagged" counted no-verdict markets in M, understating the
 * flagged share of what was actually judged).
 *
 * When those two exclusions swallow the WHOLE roster, the gate
 * REFUSES rather than passes (#364 round 33, finding 1): rounds
 * 31–32 had reopened the zero-row clause's false green by a second
 * route — a table that parses perfectly but leaves the judged
 * denominator at zero printed "0 of 0 markets flagged" and exited 0,
 * a verdict for nothing. That is exactly the shape of a bounded
 * pilot sweep over the sparse floorless classes this gate protects —
 * the run whose green matters most. The per-market table still
 * prints (the causes are the evidence), then the gate throws with
 * both exclusion counts named and the remedy ROUTED BY CAUSE (#364
 * round 34, finding 1): the floor dial is offered only for the
 * thin-sample share, because the null-survival branch fires before
 * the floor is consulted and no --min-reached value recovers a zero
 * geometry denominator. The no-verdict share routes one level
 * further (#364 round 35, finding 3): the all-marked shape names the
 * window or the feed's gradeable-bar coverage, while the
 * nothing-reached shape names the pre-geometry gates or the window
 * placement — review windows that were never consulted say nothing
 * about the feed. Like every refusal above, --report
 * cannot suppress it.
 *
 * dataAbsent leaves both sides by the same rule (#364 round 18): those
 * decisions built a plan and their review window held no gradeable
 * bars — a DATA fact, not a parameter verdict. Pre-R1b they landed in
 * planRejected (counted as geometry kills, over-flagging sparse
 * markets); counting them as survivors instead would under-flag. The
 * column comes from SweepSummary's accepted-only tally, which is sound
 * here because this gate refuses --capture-all tables via the driver's
 * mode marker (above).
 */
import { readFileSync } from "node:fs";
import {
  describeNumericToken,
  assertInDomain,
  soleFlagIndex,
  tokenFault,
  type NumericDomain,
} from "./flagReader.ts";

type Row = {
  symbol: string; split: string; decisions: number; sessionBlk: number;
  newsBlk: number; notWarm: number; regimeBlk: number; noConsensus: number;
  planRejected: number; unresolv: number; belowConf: number;
  belowPayoff: number; aboveCostShare: number; dataAbsent: number; setups: number;
};

// The names this audit's arithmetic consumes. `need` entries refuse a table
// that lacks them; `optional` entries read 0 from an older table.
const NEED_COLUMNS = [
  "symbol", "variant", "split", "decisions", "sessionBlk", "newsBlk",
  "regimeBlk", "noConsensus", "planRejected", "belowConf", "belowPayoff",
  "setups",
] as const;
// aboveCostShare (R4 act 3): the cost-share admission cap's tally, absent from
// every table swept before the column existed and 0 in every table since
// until a calibration row sets the cap.
const OPTIONAL_COLUMNS = ["notWarm", "unresolv", "dataAbsent", "aboveCostShare"] as const;
for (const name of OPTIONAL_COLUMNS) {
  if ((NEED_COLUMNS as readonly string[]).includes(name)) {
    throw new Error(`column "${name}" is listed both required and optional`);
  }
}

function parse(paths: string[]): Row[] {
  const rows: Row[] = [];
  // The first file's optional-column set; every later file must agree
  // (#364 round 21, smaller — see the header's one-generation law).
  let optionalSeen: { path: string; present: string } | null = null;
  for (const path of paths) {
    const lines = readFileSync(path, "utf8").split("\n");
    if (lines.some((line) => line.trim().startsWith("# capture-all"))) {
      throw new Error(
        `${path}: this is a --capture-all table — its acceptance gates ` +
          `are untallied by design (belowConf/belowPayoff read 0), so ` +
          `survival computed from it is a false green; run this gate on ` +
          `a normal sweep's table`,
      );
    }
    const headerLine = lines.find((line) =>
      line.trim().startsWith("symbol")
    );
    if (!headerLine) {
      throw new Error(
        `${path}: no sweep header row (a line starting with "symbol") — ` +
          `this audit refuses to guess column positions`,
      );
    }
    const header = headerLine.trim().split(/\s+/);
    const index = new Map(header.map((name, i) => [name, i] as const));
    for (const name of NEED_COLUMNS) {
      if (!index.has(name)) {
        throw new Error(
          `${path}: sweep header carries no "${name}" column — the driver's ` +
            `table and this audit have diverged; fix the mapping, never guess`,
        );
      }
    }
    const present = OPTIONAL_COLUMNS.filter((name) => index.has(name))
      .join(", ");
    if (optionalSeen === null) {
      optionalSeen = { path, present };
    } else if (optionalSeen.present !== present) {
      throw new Error(
        `${path}: header carries optional columns [${present}] but ` +
          `${optionalSeen.path} carries [${optionalSeen.present}] — an ` +
          `absent optional column reads 0, which means "unknown", not ` +
          `"none"; summing it with a real tally biases survival up, so ` +
          `tables from different generations are audited separately, ` +
          `never blended`,
      );
    }
    const rowsBefore = rows.length;
    for (const line of lines) {
      const f = line.trim().split(/\s+/);
      if (f.length < header.length || f[0] === "symbol" || !/^[A-Z^]/.test(f[0])) continue;
      const text = (name: string) => f[index.get(name)!] ?? "";
      if (text("variant") !== "baseline") continue;
      const n = (name: typeof NEED_COLUMNS[number]) =>
        Number(text(name)) || 0;
      const opt = (name: typeof OPTIONAL_COLUMNS[number]) =>
        index.has(name) ? Number(text(name)) || 0 : 0;
      rows.push({
        symbol: text("symbol"), split: text("split"),
        decisions: n("decisions"), sessionBlk: n("sessionBlk"),
        newsBlk: n("newsBlk"), notWarm: opt("notWarm"),
        regimeBlk: n("regimeBlk"), noConsensus: n("noConsensus"),
        planRejected: n("planRejected"), unresolv: opt("unresolv"),
        belowConf: n("belowConf"), belowPayoff: n("belowPayoff"),
        aboveCostShare: opt("aboveCostShare"),
        dataAbsent: opt("dataAbsent"), setups: n("setups"),
      });
    }
    // Per FILE, not per invocation (#364 round 21, finding 2): checked
    // on the flattened result, a dead shard's log contributed nothing
    // and said nothing whenever a healthy table rode beside it, and
    // the gate returned a verdict over a partial roster.
    if (rows.length === rowsBefore) {
      throw new Error(
        `${path}: parsed zero baseline rows — either the table carries ` +
          `no baseline variant (a --grid sweep without one; parse keeps ` +
          `baseline rows only) or it carries no data rows at all (a ` +
          `--warm-only or --discover survey log, or a run truncated ` +
          `before any symbol completed); a gate that measured nothing ` +
          `cannot pass — run it against a normal sweep's table`,
      );
    }
  }
  return rows;
}

// Flags filtered out, or readFileSync tries to open "--report" as a log and the
// gate fails for the wrong reason — which it did on first test. A value-taking
// flag OWNS the token after it (#364 round 33, smaller): the bare-number
// pattern-match that stood here for one round was positional-blind both ways —
// "--min-reached 1e2" parsed as floor 100 while handing "1e2" to readFileSync
// as a log path, failing for exactly the wrong reason this comment names.
// (Round 34 rode the same form into account-type-report.)
//
// This Set is the ONE declaration of which flags take values (#364 round
// 34, finding 2): the walker below consumes it to keep values out of the
// path list, and num() REFUSES a flag outside it — so a future dial added
// through num() but forgotten here fails EVERY run at module load instead
// of shipping green and handing its value to readFileSync on the first
// real invocation. tests/sweepManifest.test.ts also scans this file's
// num() call sites against the Set, holding the two shapes together at
// source the way the round-28 vocabulary scans do.
const VALUE_FLAGS = new Set(["--min-reached"]);
const argv = process.argv.slice(2);
const paths: string[] = [];
for (let i = 0; i < argv.length; i += 1) {
  if (argv[i].startsWith("--")) {
    if (VALUE_FLAGS.has(argv[i])) i += 1;
    continue;
  }
  paths.push(argv[i]);
}
// Below this many geometry-stage decisions a survival ratio prints but is
// never flagged (#364 round 32, finding 3) — the accessor is
// account-type-report's num() shape, value riding argv after the flag.
//
// THE FLOOR'S BASIS (#364 round 33, finding 2 — recorded, not assumed;
// neither sibling's figure transfers: sweep-analysis's --min-n 30 counts
// filled outcomes and only MARKS thin cells, account-type-report's
// --min-filled 300 counts filled outcomes feeding an expectancy mean,
// while this floor bounds a binomial SHARE of decisions). The misread it
// protects against is the false STARVED: a market whose true survival
// sits at the healthy-band boundary (1/3) drawing an observed share
// below 15%. That tail, P(X ≤ ceil(0.15·n)−1 | n, p=1/3), runs ≈13% at
// n=5, ≈10% at n=10, ≈1.2% at n=30; the false-thin misread from a
// comfortably healthy 0.5 (observed below 1/3) runs ≈17% at n=10, still
// ≈5.8% at n=20, and reaches ≈2.1% only at n=30 — so 30 is the smallest
// denominator holding BOTH boundary misreads at ≈2% or below. The floor
// is deliberately one legible dial, not a per-observation test, and is
// therefore conservative in the withhold direction: 0-of-29 killed is
// withheld although at the healthy boundary that observation has
// probability (2/3)^29 ≈ 8e-6 — an operator holding such a row lowers
// --min-reached with the printed evidence in hand. Real deep-sweep
// denominators run far above the floor (the rice figure above: 424
// decisions, 263 planRejected), so it binds mostly on bounded pilots,
// where withholding is the intent; the first deep sweep's
// reached-geometry distribution may justify raising it, never lowering
// it below the arithmetic here.
function num(
  arg: string,
  fallback: number,
  domain?: NumericDomain,
): number {
  if (!VALUE_FLAGS.has(arg)) {
    throw new Error(
      `num("${arg}") reads a value the path walker does not know owns ` +
        `the next token — add it to VALUE_FLAGS, or its value becomes a ` +
        `log path`,
    );
  }
  const index = soleFlagIndex(process.argv, arg);
  if (index === -1) {
    // The DEFAULT is checked too — a default outside its own
    // dial's domain is a defect no operator would ever see.
    if (domain !== undefined) assertInDomain(arg, fallback, domain);
    return fallback;
  }
  const token = process.argv[index + 1];
  const parsed = Number(token);
  const fault = tokenFault(token);
  // A flag that OWNS a token must refuse one it cannot parse (#364
  // round 35, finding 1): the walker above has already kept that token
  // out of the path list, so falling back here would silently use the
  // default floor AND silently drop a log file — "--min-reached
  // shard-a.log shard-b.log" judged shard-b alone at floor 30, with
  // none of the per-file refusals (rounds 20–21) able to fire on the
  // eaten shard. A missing value is a refusal, never a zero — the
  // pattern-match this walker replaced could not eat a filename, so
  // the silent fallback was the walker's own new hole.
  if (fault !== null || !Number.isFinite(parsed)) {
    throw new Error(
      `${arg} owns the token after it and cannot read ${
        describeNumericToken(token)
      } as a number — the walker already kept that token out of the ` +
        `log paths, so falling back would judge a partial roster; ` +
        `pass ${arg} <number>`,
    );
  }
  if (domain !== undefined) assertInDomain(arg, parsed, domain);
  return parsed;
}
const minReached = num("--min-reached", 30, {
    basis:
      "the withhold fires on reached < minReached, and a floor of zero is not 'no floor' — it silently readmits " +
      "the thin cells the floor exists to withhold",
    integer: true,
    min: 1,
  });
// Zero paths is the one invocation-level refusal; zero ROWS refuses per
// file inside parse() (#364 rounds 20–21, finding 2 each), and both are
// refusals rather than verdicts — --report cannot suppress either.
if (paths.length === 0) {
  throw new Error("no log paths given — nothing to audit");
}
const rows = parse(paths);
const byS = new Map<string, Row>();
for (const r of rows) {
  const prev = byS.get(r.symbol);
  if (!prev) { byS.set(r.symbol, { ...r }); continue; }
  // Summed over the parsed row's OWN keys (#364 round 20, finding 3):
  // the literal key list that stood here was a third parallel
  // enumeration beside Row and NEED_/OPTIONAL_COLUMNS — and the one
  // nothing pinned or executed (the fixtures were single-row, so the
  // rollup never even ran in the suite). A column added to Row but
  // forgotten here would keep the FIRST split's value while every
  // other column accumulated, mixing a per-split number into
  // per-symbol totals. Iterating the row's keys makes that
  // impossible, and the string-identity skip is compiler-enforced: a
  // future non-numeric field fails the += below until it joins the
  // skip.
  for (const k of Object.keys(r) as Array<keyof Row>) {
    if (k === "symbol" || k === "split") continue;
    prev[k] += r[k];
  }
}

const out = [...byS.values()].map((r) => {
  // Decisions that reached the geometry stage at all. notWarm decisions never
  // did (the regime could not form) — subtracting it is part of the same
  // repair as the named columns: the drifted map had silently excluded it
  // from BOTH sides of this arithmetic. unresolv leaves both sides too
  // (#364 round 14, finding 3): those decisions built a plan and the
  // resolver still could not grade it — a DEFECT bucket, not a parameter
  // verdict — so counting them as survivors biased survival up and the
  // amendment-25 gate under-flagged, while folding them into geometryKill
  // would blame parameters for a sweep bug.
  const reachedGeometry = r.decisions - r.sessionBlk - r.newsBlk - r.notWarm -
    r.regimeBlk - r.noConsensus - r.unresolv - r.dataAbsent;
  // The cost-share cap kills at the same gate as the payoff floor: a setup
  // whose round trip is too large a share of its risk unit (R4 act 3).
  const geometryKill = r.planRejected + r.belowPayoff + r.aboveCostShare;
  // #364 round 31, finding 1: a ZERO denominator is NO VERDICT, never
  // the worst one. By the driver's row identity, reachedGeometry =
  // planRejected + belowConf + belowPayoff + (setups − dataAbsent), so
  // it reaches zero exactly when the geometry killed NOTHING — every
  // decision died at the pre-geometry gates, or every emitted setup
  // carried the data-absence marker (the expected shape for the sparse
  // floorless classes this gate protects). The old ": 0" fallback read
  // that market as survival 0% → STARVED → exit 1 — a maximal adverse
  // verdict from an absent denominator, the shape round 25 fixed in
  // account-type-report (filled 0 → E "—", no verdict).
  const survival = reachedGeometry > 0
    ? 1 - geometryKill / reachedGeometry
    : null;
  return { ...r, reachedGeometry, geometryKill, survival };
}).sort((a, b) => (a.survival ?? 2) - (b.survival ?? 2));

// The floor in effect prints on EVERY run (#364 round 33, smaller —
// sweep-analysis's unconditional min-n line is the pattern): with the
// echo only inside thin-row flags, a clean run and a --min-reached 0 run
// were indistinguishable from a default one.
console.log(
  `flag floor: survival flags withheld below ${minReached} reached ` +
    `geometry (--min-reached)`,
);
console.log(`${"market".padEnd(9)}${"decisions".padStart(10)}${"reached".padStart(9)}` +
  `${"planRej".padStart(9)}${"belowPay".padStart(9)}${"survive".padStart(9)}  flag`);
let starved = 0;
let thinSample = 0;
let noVerdict = 0;
// The no-verdict bucket is itself two shapes with opposite remedies
// (#364 round 35, finding 3), and the per-row flag below already tells
// them apart: all-marked (the feed's gradeable-bar coverage is the
// lever) vs nothing-reached (every decision died at the pre-geometry
// gates — the review windows were never consulted, so the feed says
// nothing; the gates or the window placement are the lever).
let noVerdictMarked = 0;
let noVerdictPreGeometry = 0;
for (const r of out) {
  const pct = (v: number) => `${(v * 100).toFixed(0)}%`;
  // Under a third surviving the geometry gates means the geometry, not the
  // market, is deciding how much evidence we ever collect about it. A null
  // survival means no decision reached the geometry at all — no
  // denominator, no claim, and the cause prints so the operator sees a
  // data condition rather than a parameter one (#364 round 31). A
  // denominator below --min-reached prints its ratio but withholds the
  // flag (#364 round 32) — 0-of-2 is not evidence of starvation.
  let flag = "";
  if (r.survival === null) {
    if (r.dataAbsent > 0) {
      flag = `no verdict — geometry killed 0; all ${r.dataAbsent} emitted ` +
        `setups carry the data-absence marker`;
      noVerdictMarked += 1;
    } else {
      flag = "no verdict — nothing reached the geometry stage";
      noVerdictPreGeometry += 1;
    }
    noVerdict += 1;
  } else if (r.reachedGeometry < minReached) {
    flag = `thin sample — ${r.reachedGeometry} reached geometry ` +
      `(< ${minReached}); flag withheld`;
    thinSample += 1;
  } else if (r.survival < 0.15) {
    flag = "STARVED — geometry kills 85%+";
    starved += 1;
  } else if (r.survival < 0.33) {
    flag = "thin — geometry kills 2 of 3";
    starved += 1;
  }
  console.log(
    `${r.symbol.padEnd(9)}${String(r.decisions).padStart(10)}${String(r.reachedGeometry).padStart(9)}` +
    `${String(r.planRejected).padStart(9)}${String(r.belowPayoff).padStart(9)}` +
    `${(r.survival === null ? "—" : pct(r.survival)).padStart(9)}  ${flag}`,
  );
}
// The flagged denominator holds only markets that received a verdict;
// excluded markets are named by cause, never absorbed (#364 round 32,
// finding 2) — and the two no-verdict shapes are causes with opposite
// diagnoses, so the PASSING summary names them apart too (#364 round
// 36, finding 3: round 35 split the refusal's remedies but left this
// line, which is the path that runs whenever any market yields a
// verdict — the line the amendment-25 decision is quoted from).
const judged = out.length - thinSample - noVerdict;
const excluded = [
  ...(thinSample > 0
    ? [`${thinSample} thin sample below ${minReached} reached`]
    : []),
  ...(noVerdictMarked > 0
    ? [`${noVerdictMarked} no verdict — all emitted setups data-absent`]
    : []),
  ...(noVerdictPreGeometry > 0
    ? [
      `${noVerdictPreGeometry} no verdict — nothing reached the ` +
      `geometry stage`,
    ]
    : []),
];
// A roster judged NOWHERE is a refusal, never a pass (#364 round 33,
// finding 1): rounds 31–32's exclusions had reopened the zero-row
// clause's "0 of 0 markets flagged" false green by a route that parses
// cleanly — the shape of a bounded pilot sweep over the sparse
// floorless classes. The table above already printed the causes; the
// throw makes the exit code agree with them, and --report cannot
// suppress a refusal (it acknowledges a measured verdict, never an
// absent one). Remedies route by CAUSE (#364 round 34, finding 1): the
// floor dial is INERT for a no-verdict market — the null-survival
// branch fires before the floor is consulted, so no --min-reached
// value recovers a zero geometry denominator — and on the gate's own
// population the no-verdict share dominates (an all-marked bounded
// pilot), so the fixed remedy pair that stood here for one round sent
// that operator to a dial that changes nothing (the
// remedy-that-cannot-clear class rounds 14, 19, 20 and 25 closed at
// other sites). The no-verdict share routes one level further (#364
// round 35, finding 3), on the discriminator the per-row flag already
// computes: the feed's gradeable-bar coverage is a lever only for the
// all-marked shape — a market whose decisions all died pre-geometry
// never consulted a review window, so its levers are the gates or the
// window placement.
if (judged === 0) {
  const remedies = [
    ...(thinSample > 0
      ? [
        `for the thin-sample share: deepen the sweep window, or lower ` +
        `--min-reached with the per-row evidence in hand`,
      ]
      : []),
    ...(noVerdictMarked > 0
      ? [
        `for the ${noVerdictMarked} no-verdict market(s) whose emitted ` +
        `setups all carry the data-absence marker: deepen the sweep ` +
        `window or restore the feed's gradeable-bar coverage — no ` +
        `--min-reached value recovers a zero geometry denominator`,
      ]
      : []),
    ...(noVerdictPreGeometry > 0
      ? [
        `for the ${noVerdictPreGeometry} no-verdict market(s) where ` +
        `nothing reached the geometry stage: the review windows were ` +
        `never consulted, so the feed is not the lever — the ` +
        `pre-geometry gates (session, news, warm-up, regime, ` +
        `consensus) or the window placement are, and no --min-reached ` +
        `value recovers a zero geometry denominator either`,
      ]
      : []),
  ];
  throw new Error(
    `every market fell outside the judged denominator ` +
      `(${excluded.join("; ")}) — a gate that judged nothing cannot ` +
      `pass (the zero-row rule by a second route); ${remedies.join("; ")}`,
  );
}
console.log(
  `\n${starved} of ${judged} markets flagged` +
    `${excluded.length > 0 ? ` (${excluded.join("; ")})` : ""}` +
    `. Ranked worst first.`,
);

// A gate, not a report (amendment 25). Run this against any broker's first sweep
// BEFORE any market's expectancy is read as a verdict about that market. Exit 1
// when anything is flagged, so a starved market cannot pass silently into an
// exclusion decision — which is how five markets were misjudged in one night.
//
// --report suppresses the failure for the case where flagged markets are already
// known and being actively fixed, as they are while the starved-cohort grids run.
if (starved > 0 && !process.argv.includes("--report")) {
  console.error(
    `\nFAIL: ${starved} market(s) are starved by geometry, not short of edge. ` +
      `Fix their geometry and re-sweep before drawing any expectancy verdict ` +
      `about them (amendment 25). Re-run with --report to acknowledge and continue.`,
  );
  process.exit(1);
}
