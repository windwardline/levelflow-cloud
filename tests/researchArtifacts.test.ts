import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  standingBanner,
  writeResearchArtifact,
} from "../scripts/researchArtifact.ts";

// #364 round 55, finding 1. Sixteen tracked artifacts under docs/research/
// carry an INVALID banner — the 2026-08-11 clock defect, ending "Do not use
// these numbers to withdraw, defend, or ship a market." Every one is written
// by a script whose --out DEFAULTS to the path the banner sits on, and every
// one of those scripts built a fresh object with no INVALID key. So a re-run
// silently retired the notice.
//
// Round 54 found that and fixed it at ONE site by hand, which is the mistake
// round 54's OTHER finding had just corrected — a hand-picked population
// where a derivable one exists. It showed at once: a single invocation of
// confirm-4d preserved the banner on -final-picks.json and stripped it from
// -confirm-read.json, the artifact market-dossier and roster-expectancy-audit
// read to decide which markets carry a confirmed derived cell.
describe("a research artifact's invalidation banner survives a rewrite", () => {
  it("carries a standing banner forward, and leads with it", () => {
    const dir = mkdtempSync(join(tmpdir(), "banner-"));
    const artifact = join(dir, "picks.json");
    const banner =
      "INVALID — computed from the clock-defect corpus. Do not use these " +
      "numbers to withdraw, defend, or ship a market.";
    writeFileSync(
      artifact,
      JSON.stringify({ INVALID: banner, finalPicks: { OLD: 1 } }) + "\n",
    );

    writeResearchArtifact(artifact, { finalPicks: { NEW: 2 } });
    const after = JSON.parse(readFileSync(artifact, "utf8")) as
      Record<string, unknown>;
    assert.equal(after.INVALID, banner, "the banner must survive the rewrite");
    assert.deepEqual(after.finalPicks, { NEW: 2 }, "the body must be replaced");
    // The banner leads, so a reader meets it before the numbers.
    assert.equal(Object.keys(after)[0], "INVALID");
  });

  it("invents no banner where none stood, and refuses a non-string one", () => {
    const dir = mkdtempSync(join(tmpdir(), "banner-none-"));
    const fresh = join(dir, "fresh.json");
    writeResearchArtifact(fresh, { report: {} });
    assert.equal(
      "INVALID" in (JSON.parse(readFileSync(fresh, "utf8")) as object),
      false,
      "a new artifact must not acquire a banner nobody wrote",
    );
    assert.equal(standingBanner(join(dir, "absent.json")), undefined);

    // The banner is prose an operator reads. Carrying a non-string forward
    // under that name would be inventing a claim rather than preserving one.
    const odd = join(dir, "odd.json");
    writeFileSync(odd, JSON.stringify({ INVALID: { why: "nested" } }) + "\n");
    assert.equal(standingBanner(odd), undefined);

    // An unreadable prior file has no banner to preserve — and must not
    // take the writer down with it.
    const broken = join(dir, "broken.json");
    writeFileSync(broken, "{ not json\n");
    assert.equal(standingBanner(broken), undefined);
    writeResearchArtifact(broken, { ok: true });
    assert.deepEqual(
      JSON.parse(readFileSync(broken, "utf8")) as object,
      { ok: true },
    );
  });

  // The population is DERIVED, not listed. Round 54's banner fix was
  // hand-placed at one of eight write sites; this is what makes the ninth
  // fail here rather than in a review round.
  it("every research-artifact writer writes through the shared writer", () => {
    // The predicate must be STABLE UNDER THE FIX. A first version tested
    // `writeFileSync( && docs/research`, which meant converting a writer
    // removed it from its own law's population — seven files dropped out
    // and the floor caught it. That is round 55's own smaller finding
    // (a derived population whose glob can be emptied by the natural next
    // refactor) reproduced inside the fix for round 55's finding 1. So the
    // predicate is "names a docs/research path AND writes", where writing
    // is EITHER call: a converted writer still matches, and a new one that
    // reaches for writeFileSync matches too.
    const WRITES_A_RESEARCH_ARTIFACT = (source: string) =>
      /docs\/research/.test(source) &&
      (/writeFileSync\(/.test(source) || /writeResearchArtifact\(/.test(source));

    // Two exemptions, each verifying its own premise below.
    //
    // The first IS the shared writer — it holds the only writeFileSync a
    // research artifact may be written through, and matching its own law
    // against itself is the shape flagReader's exemption already carries.
    const THE_WRITER = "scripts/researchArtifact.ts";
    // The second writes only to a path the operator names with --json, has
    // no docs/research default, and emits an ARRAY rather than an object
    // with a banner key. Its docs/research mention is prose in a header.
    const EXEMPT = "scripts/verify-fmp-matches.ts";

    const writers = readdirSync("scripts")
      .filter((name) => name.endsWith(".ts"))
      .map((name) => `scripts/${name}`)
      .filter((file) => WRITES_A_RESEARCH_ARTIFACT(readFileSync(file, "utf8")))
      .sort();

    assert.ok(
      writers.includes(THE_WRITER),
      `${THE_WRITER} is exempted as the shared writer but no longer matches ` +
        `the glob — drop the exemption rather than leaving it to cover a ` +
        `future file`,
    );
    assert.match(
      readFileSync(THE_WRITER, "utf8"),
      /export function writeResearchArtifact\(/,
      `${THE_WRITER} is exempted because it DEFINES the shared writer — if ` +
        `it stops exporting one, it is a writer like any other`,
    );
    assert.ok(
      writers.includes(EXEMPT),
      `${EXEMPT} is exempted but no longer matches the glob — drop the ` +
        `exemption rather than leaving it to cover a future file`,
    );
    const exemptSource = readFileSync(EXEMPT, "utf8");
    assert.doesNotMatch(
      exemptSource,
      /writeFileSync\([^)]*docs\/research/,
      `${EXEMPT} is exempted as writing only to an operator-named path — ` +
        `it now writes to a docs/research path, so it is a research ` +
        `artifact writer like any other`,
    );
    assert.match(
      exemptSource,
      /jsonPath !== undefined/,
      `${EXEMPT}'s exemption rests on its write being conditional on an ` +
        `explicitly named --json path`,
    );

    for (
      const writer of writers.filter(
        (file) => file !== EXEMPT && file !== THE_WRITER,
      )
    ) {
      const source = readFileSync(writer, "utf8");
      assert.match(
        source,
        /from "\.\/researchArtifact\.ts"/,
        `${writer} writes a research artifact without the shared writer — ` +
          `a rewrite would silently retire any INVALID banner standing on ` +
          `its output`,
      );
      assert.doesNotMatch(
        source,
        /writeFileSync\(/,
        `${writer} still calls writeFileSync directly — every write to a ` +
          `research artifact goes through writeResearchArtifact, or a ` +
          `second write site drifts out of the law the way confirm-4d's did`,
      );
    }

    // Tight against the real count, so a refactor that moves writes behind
    // a helper cannot silently empty the population (#364 round 55,
    // smaller — the flag law's floor of 7 against 25 is the shape this
    // avoids).
    assert.ok(
      writers.length >= 9,
      `the glob must find the research-artifact writers, got ${writers.length}`,
    );
  });

  // The banner's own population, stated as a fact rather than assumed: if a
  // tracked artifact carries one, some writer's default output path is it.
  it("the banner is on artifacts these writers default to", () => {
    const carrying = readdirSync("docs/research", {
      recursive: true,
      withFileTypes: true,
    })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map((entry) => join(entry.parentPath, entry.name))
      .filter((file) => standingBanner(file) !== undefined);
    assert.ok(
      carrying.length >= 16,
      `the clock-defect banner stands on ${carrying.length} artifacts — if ` +
        `it has been retired, retire it deliberately with the revalidation ` +
        `recorded, and lower this floor in the same commit`,
    );
  });
});
