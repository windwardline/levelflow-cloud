/**
 * verify-rebuild-depth — does a rebuilt corpus still hold everything the one it
 * replaces held?
 *
 * WHY THIS EXISTS. `docs/HANDOFF.md` R0b ranks the backup work on the premise
 * that `.calibration-cache` is "expensive (~14 hours, metered bytes) but fully
 * reproducible". That premise is what makes it safe to delete a cache and
 * rebuild it, and it is FALSE IN DEPTH. FMP's intraday window ages out: a
 * refetch can return FEWER bars than were previously served. Measured
 * 2026-08-23 on DYDXUSD — 2026-08-10 came back 238 -> 212 rows and 2026-08-11
 * 250 -> 169 on a refetch ten days later.
 *
 * It has already happened to this repo. Comparing the v3 snapshot against the
 * v4 rebuild that replaced it:
 *   USDCAD-5min    1,223,984 -> 1,221,403   (-2,581 rows)
 *   USDJPY-15min     408,270 ->   402,716   (-5,554)
 *   USDJPY-5min    1,224,917 -> 1,222,920   (-1,997)
 * 10,132 rows the rebuild did not recover, surviving only because someone kept
 * the pre-rebuild snapshot. Nothing refused; nothing logged. The corpus was
 * simply shallower afterwards, and calibration then measures against it.
 *
 * A rebuild is reproducible in KIND and not in DEPTH. This makes that checkable
 * instead of remembered, because the record of it currently lives in a README
 * inside an archive that is itself periodically a deletion candidate.
 *
 * Usage:
 *   npx tsx scripts/verify-rebuild-depth.ts --reference <dir> [--cache-dir <dir>]
 *
 *   --reference   the pre-rebuild snapshot to measure against. Required: there
 *                 is no default, because guessing which snapshot someone meant
 *                 is exactly the kind of silent assumption this file exists to
 *                 remove.
 *   --cache-dir   the candidate corpus (default .calibration-cache)
 *
 * Exit 1 on any store the candidate holds less of. Exit 1 on a comparison that
 * examined nothing.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { flagReader } from "./flagReader.ts";

type Store = { clock?: string; items?: { time?: number }[] };

export type StoreVerdict =
  | { kind: "ok"; missing: 0; store: string }
  | { kind: "shallower"; missing: number; store: string }
  | { kind: "absent"; missing: number; store: string }
  /**
   * Bars that moved rather than vanished.
   *
   * DETECTED BY SIGNATURE, NOT BY LABEL. A clock bump displaces timestamps, so
   * a naive difference reports every row as missing. Differencing the v2 corpus
   * (`ny-wall-utc-v2`) against v3 reports 202,039 "missing" rows, 122,468 of
   * them the three foreign indices displaced by 6, 13 and 14 hours — 100% of
   * ^AXJO's and ^N225's rows "vanish".
   *
   * Comparing on the clock STRING instead was the first version of this file
   * and it was worse: v3 and v4 differ only in three DAILY index stores, yet
   * the label differs on all 290, so it skipped 289 and reported the rebuild
   * depth-complete on a sample of one.
   *
   * The signature is unambiguous because the two populations do not overlap.
   * Measured here: real losses run 0.2% of a store (2,581 of 1,223,984);
   * displacement runs 69-100%. Nothing observed between 1% and 69%.
   */
  | { kind: "displaced"; missing: number; share: number; store: string };

export type DepthReport = {
  compared: number;
  incomparable: number;
  lines: string[];
  losses: StoreVerdict[];
};

const STORE_SUFFIX = ".rolling.json";

/**
 * Above this share of a store's rows differing, the two are on different
 * clocks and the difference is displacement rather than loss. See the
 * `displaced` verdict for the measured gap this sits inside.
 */
const DISPLACEMENT_SHARE = 0.5;

/**
 * Below this share of the reference's stores actually compared, the run is
 * refused. `compared > 0` is not enough: the first version of this file skipped
 * 289 of 290 stores and reported the rebuild depth-complete on the one that
 * remained, exiting 0.
 */
const MIN_COMPARED_SHARE = 0.5;

/** Declared literally: tests/sweepManifest.test.ts requires every flagReader
 * consumer to name its value-taking flags where a reader can see them. */
const VALUE_FLAGS = new Set(["--reference", "--cache-dir"]);

function readStore(path: string): Store | null {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as Store;
  } catch {
    return null;
  }
}

function timesOf(store: Store): Set<number> {
  const times = new Set<number>();
  for (const item of store.items ?? []) {
    if (typeof item.time === "number") {
      times.add(item.time);
    }
  }
  return times;
}

/**
 * Compares by TIMESTAMP SET, not by row count.
 *
 * A count comparison misses the case that matters: a store can hold an
 * identical number of rows while containing different instants — the reference
 * keeps two old bars the rolling cap has since dropped, the candidate has
 * gained two newer ones, and the counts match. Measured on the v2 corpus, a
 * count comparison found 18 affected stores where the set difference found 60.
 */
export function compareDepth(
  referenceDir: string,
  candidateDir: string,
): DepthReport {
  const lines: string[] = [];
  const losses: StoreVerdict[] = [];
  let compared = 0;
  let incomparable = 0;

  const names = readdirSync(referenceDir)
    .filter((name) => name.endsWith(STORE_SUFFIX))
    .sort();

  for (const name of names) {
    const reference = readStore(join(referenceDir, name));
    if (!reference) {
      continue;
    }
    let candidate: Store | null = null;
    try {
      statSync(join(candidateDir, name));
      candidate = readStore(join(candidateDir, name));
    } catch {
      candidate = null;
    }

    if (!candidate) {
      const missing = timesOf(reference).size;
      losses.push({ kind: "absent", missing, store: name });
      lines.push(`ABSENT       ${name} — ${missing} rows present only in the reference`);
      continue;
    }

    const referenceTimes = timesOf(reference);
    const candidateTimes = timesOf(candidate);
    let missing = 0;
    for (const time of referenceTimes) {
      if (!candidateTimes.has(time)) {
        missing += 1;
      }
    }
    const share = referenceTimes.size > 0 ? missing / referenceTimes.size : 0;
    if (share >= DISPLACEMENT_SHARE) {
      incomparable += 1;
      lines.push(
        `DISPLACED    ${name} — ${(share * 100).toFixed(1)}% of rows at different ` +
          `instants (${reference.clock ?? "?"} vs ${candidate.clock ?? "?"}). ` +
          `Moved, not lost; depth not measurable across this bump.`,
      );
      continue;
    }
    compared += 1;
    if (missing > 0) {
      losses.push({ kind: "shallower", missing, store: name });
      lines.push(
        `SHALLOWER    ${name} — ${missing} rows in the reference are absent ` +
          `from the candidate (${referenceTimes.size} -> ${candidateTimes.size})`,
      );
    }
  }

  return { compared, incomparable, lines, losses };
}

function main(): void {
  const { str } = flagReader(process.argv, VALUE_FLAGS);
  const referenceDir = str("--reference");
  const candidateDir = str("--cache-dir") ?? ".calibration-cache";

  if (!referenceDir) {
    console.error(
      "verify-rebuild-depth: --reference is required.\n" +
        "  Point it at the pre-rebuild snapshot this corpus replaces, e.g.\n" +
        "  npx tsx scripts/verify-rebuild-depth.ts --reference ~/levelflow-cache-v3-preDateFix-20260824",
    );
    process.exit(1);
  }

  const report = compareDepth(referenceDir, candidateDir);
  for (const line of report.lines) {
    console.log(line);
  }

  // NON-VACUITY. A wrong --reference, an empty directory, or a corpus whose
  // every store is on another clock all yield "no losses found" while having
  // compared nothing. Reporting that as a pass is the failure this repo has
  // spent a day removing.
  const total = report.compared + report.incomparable;
  const comparedShare = total > 0 ? report.compared / total : 0;
  if (report.compared === 0 || comparedShare < MIN_COMPARED_SHARE) {
    console.error(
      `\nverify-rebuild-depth: compared ${report.compared} of ${total} store(s) ` +
        `(${(comparedShare * 100).toFixed(1)}%) — refusing to report a pass on a sample this thin.\n` +
        `  reference: ${referenceDir}\n  candidate: ${candidateDir}\n` +
        (report.incomparable > 0
          ? `  ${report.incomparable} store(s) read as DISPLACED — most of their rows sit at ` +
            `different instants, which means these two corpora are on different clocks.\n` +
            `  Depth is not measurable across a clock bump. Use a reference normalised the ` +
            `same way as the candidate.`
          : `  The reference may be empty or wrong.`),
    );
    process.exit(1);
  }

  console.log(
    `\ncompared ${report.compared} store(s); ${report.incomparable} skipped as incomparable`,
  );

  if (report.losses.length > 0) {
    const rows = report.losses.reduce((sum, loss) => sum + loss.missing, 0);
    console.error(
      `\n${report.losses.length} store(s) are SHALLOWER than the reference — ` +
        `${rows} row(s) the rebuild did not recover.\n` +
        `A rebuild is reproducible in KIND, not in DEPTH: FMP's intraday window ` +
        `ages out, so a refetch can return fewer bars than were once served.\n` +
        `KEEP THE REFERENCE SNAPSHOT. Do not delete it, and do not calibrate ` +
        `against the candidate until this is ruled on — the missing rows exist ` +
        `nowhere else once the reference is gone.`,
    );
    process.exit(1);
  }

  console.log("No store is shallower than the reference. The rebuild is depth-complete.");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
