/**
 * The one writer for a tracked research artifact (#364 round 55, finding 1).
 *
 * Sixteen artifacts under `docs/research/` carry an `INVALID` banner — the
 * same clock-defect string, ending "Do not use these numbers to withdraw,
 * defend, or ship a market." Every one of them is produced by a script
 * whose `--out` DEFAULTS to the tracked path the banner sits on, and every
 * one of those scripts built a fresh object with no `INVALID` key and
 * wrote it. So running any of them again silently retired the notice.
 *
 * Round 54 found this and fixed it at ONE site, by hand — the picks writer
 * in `confirm-4d`. That was the same mistake round 54's other finding had
 * just corrected: a hand-picked population where a derivable one exists.
 * It showed immediately, and in the worst possible place: a single
 * invocation of `confirm-4d` preserved the banner on `-final-picks.json`
 * and stripped it from `-confirm-read.json` twelve lines below, and the
 * confirm-read artifact is what `market-dossier` and
 * `roster-expectancy-audit` read to decide which markets carry a confirmed
 * derived cell.
 *
 * The population is derivable: it is the scripts that write a JSON object
 * to a `docs/research` default. `tests/researchArtifacts.test.ts` globs for
 * exactly that and requires each one to write through here.
 *
 * The rule, stated once: a banner is retired by whoever REVALIDATES the
 * corpus behind it, by hand, with the reason recorded. It is never retired
 * as a side effect of running the script again.
 */
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";

/**
 * Any invalidation banner already standing at `outPath`.
 *
 * A missing or unreadable file has no banner to preserve — the artifact is
 * being created, or it is not JSON, and neither is a case where something
 * is being silently dropped. Only a STRING counts: the banner is prose an
 * operator reads, and carrying a non-string forward under that name would
 * be inventing a claim rather than preserving one.
 */
export function standingBanner(outPath: string): string | undefined {
  try {
    const prior = JSON.parse(readFileSync(outPath, "utf8")) as {
      INVALID?: unknown;
    };
    return typeof prior.INVALID === "string" ? prior.INVALID : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Write a research artifact, carrying forward any standing banner.
 *
 * The banner leads the object so a reader meets it first, and the
 * carry-forward is ECHOED — silently preserving it would leave an operator
 * who believes they have revalidated the corpus with an artifact that
 * still says otherwise and no line telling them why.
 */
export function writeResearchArtifact(
  outPath: string,
  body: Record<string, unknown>,
): void {
  const banner = standingBanner(outPath);
  writeFileSync(
    outPath,
    JSON.stringify(
      { ...(banner === undefined ? {} : { INVALID: banner }), ...body },
      null,
      2,
    ) + "\n",
  );
  if (banner !== undefined) {
    console.log(
      `  INVALID banner carried forward into ${outPath} — remove it by hand ` +
        `once the corpus behind it has been revalidated, with the reason ` +
        `recorded; running this script again is not a revalidation`,
    );
  }
}

/**
 * The bytes a research artifact holds now, or null when it does not exist:
 * what `restoreResearchArtifact` puts back.
 */
export function researchArtifactBytes(outPath: string): Buffer | null {
  return existsSync(outPath) ? readFileSync(outPath) : null;
}

/**
 * Put a research artifact back exactly as it stood, or remove it when it did
 * not exist (2026-09-22). For a write that must land before work that can
 * still fail: confirm-4d freezes its picks before the confirm fold is opened,
 * and withdraws the freeze when the read then records nothing. The prior
 * bytes carry whatever INVALID banner stood on them, so a restore neither
 * adds a banner nor retires one.
 */
export function restoreResearchArtifact(outPath: string, prior: Buffer | null): void {
  if (prior === null) rmSync(outPath, { force: true });
  else writeFileSync(outPath, prior);
}
