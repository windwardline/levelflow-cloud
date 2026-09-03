/**
 * The one holdout population, pinned by name (R4 act 2, deliverable 4).
 *
 * Reads the manifest of every shard named — the emit path or its
 * `.manifest.json`, either form — verifies each through the corpus door,
 * draws the stratified held-out set over the union of their
 * `requestedSymbols` (`heldOutSet`, scripts/sweepFolds.ts) and writes it as a
 * tracked artifact: `{ anchor, rule, markets, requestedSymbols, rosterHash,
 * manifestHashes }`. Every reader that excludes anything verifies its own
 * computation against this file (`verifyHeldOutSet`) and refuses by name when
 * the two differ over the same requested roster (`rosterHash`), so a rule or
 * pin change cannot move membership in silence; a different roster at the
 * same anchor is unpinned for its roster, not drifted. Only a set drawn over a
 * REQUESTED roster is pinned: a manifest carrying no `requestedSymbols` yields
 * a set over the symbols read, which every reader states as unpinnable and
 * this refuses to write. The stamped `holdoutSymbols` is not read here: it is
 * provenance, not a population.
 *
 * One pin per anchor. Manifests of two anchors are refused; re-pinning an
 * anchor after a deliberate roster change is an operator act with the reason
 * recorded beside it, never a side effect of a re-run.
 *
 *   npx tsx scripts/holdout-set.ts <emit.jsonl | emit.jsonl.manifest.json …> \
 *     --out docs/research/r4/holdout-<anchor>.json
 */
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { flagReader, OperatorInputError } from "./flagReader.ts";
import { writeResearchArtifact } from "./researchArtifact.ts";
import { type HeldOutSet, heldOutSet } from "./sweepFolds.ts";
import { assertManifest } from "./sweepStats.ts";

const VALUE_FLAGS = new Set(["--out"]);
const MANIFEST_SUFFIX = ".manifest.json";

/** The emit path a manifest path stands beside; an emit path is returned as is. */
export function emitPathOf(path: string): string {
  return path.endsWith(MANIFEST_SUFFIX)
    ? path.slice(0, -MANIFEST_SUFFIX.length)
    : path;
}

export type HoldoutSetArtifact = Omit<HeldOutSet, "basis"> & {
  anchor: string;
  manifestHashes: string[];
  /** The size of the requested roster the set was drawn over — the union. */
  requestedSymbols: number;
};

export function holdoutSetArtifact(paths: readonly string[]): HoldoutSetArtifact {
  if (paths.length === 0) {
    throw new OperatorInputError(
      "holdout-set: no manifest paths given — pass one or more emit.jsonl " +
        "paths (or their .manifest.json) of one anchor, and --out <path>",
    );
  }
  const manifests = paths.map((path) => assertManifest(emitPathOf(path)));
  const anchors = [...new Set(manifests.map((manifest) => manifest.anchor))];
  if (anchors.length !== 1) {
    throw new OperatorInputError(
      `holdout-set: the manifests disagree on anchor (${anchors.join(", ")}) ` +
        `— one pin per anchor; pass one anchor's manifests`,
    );
  }
  const set = heldOutSet(manifests);
  if (set.basis !== "requestedSymbols") {
    throw new OperatorInputError(
      `holdout-set: a manifest carries no requestedSymbols, so the set was ` +
        `drawn over the symbols read — unpinnable; a pin names the roster ` +
        `REQUESTED at sweep time. Re-sweep on a driver that records it`,
    );
  }
  const requested = new Set(
    manifests.flatMap((manifest) => manifest.requestedSymbols ?? []),
  );
  return {
    anchor: anchors[0],
    rule: set.rule,
    markets: set.markets,
    requestedSymbols: requested.size,
    rosterHash: set.rosterHash,
    manifestHashes: manifests.map((manifest) => manifest.manifestHash),
  };
}

function main(): void {
  const args = process.argv.slice(2);
  const { str } = flagReader(args, VALUE_FLAGS);
  const paths: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index].startsWith("--")) {
      if (VALUE_FLAGS.has(args[index])) index += 1;
      continue;
    }
    paths.push(args[index]);
  }
  const out = str("--out");
  const artifact = holdoutSetArtifact(paths);
  if (out === undefined) {
    throw new OperatorInputError(
      "holdout-set: no --out path given — the set is pinned to a tracked " +
        "file, docs/research/r4/holdout-<anchor>.json",
    );
  }
  // Validated above; only now does anything touch the tree.
  mkdirSync(dirname(out), { recursive: true });
  writeResearchArtifact(out, artifact);
  console.log(
    `anchor ${artifact.anchor} · rule ${artifact.rule} · ${artifact.markets.length} ` +
      `of ${artifact.requestedSymbols} requested markets held out · roster ${
        artifact.rosterHash.slice(0, 12)
      } · manifests ${
        artifact.manifestHashes.map((hash) => hash.slice(0, 12)).join(", ")
      } -> ${out}`,
  );
  for (const market of artifact.markets) console.log(`  ${market}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    main();
  } catch (error) {
    if (error instanceof OperatorInputError) {
      console.error(error.message);
      process.exit(1);
    }
    console.error(error);
    process.exit(1);
  }
}
