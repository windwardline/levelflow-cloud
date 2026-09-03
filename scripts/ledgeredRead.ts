/**
 * The ledgered-read artifact — the ONE place a confirm-fold figure may be
 * read from by anything that is not the gate.
 *
 * R4 act 2 (2026-09-02). `grid-totalr --confirm-final` (and `confirm-4d`
 * through it) is the only reader of the held-back fold, and it records the
 * read in the LA-6 ledger. This module names what that read writes and how
 * a consumer opens it: the shape is a contract, the reader is a door. A
 * consumer that wants a confirm figure calls `readLedgeredArtifact` with the
 * manifest hash of the corpus it graded on select; the door refuses a
 * condemned artifact (its INVALID banner), an artifact written from a
 * different corpus (the manifest hash is not among the read's shards), and
 * a tampered one (the artifact's own hash). It never reads the fold.
 *
 * What a figure carries and why: the shipped cell's absolute NET and GROSS
 * expectancy with a 95% interval and n (amendment 36's cost clause needs the
 * gross figure beside the net one); `heldBack`, because 21 of 27 totality
 * cells were selected on rows inside R3's confirm window and their confirm
 * figure is not held back at all; and M3's three outcomes against a rule
 * frozen BEFORE the read, so nothing decides on the fold after seeing it.
 */
import { createHash } from "node:crypto";
import { createReadStream, readFileSync } from "node:fs";

/** Streaming sha256 of a file — the bytes, which no manifest hash binds. Shared by the gate and its consumers. */
export function sha256File(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    createReadStream(path)
      .on("data", (chunk) => hash.update(chunk))
      .on("error", reject)
      .on("end", () => resolve(hash.digest("hex")));
  });
}

/** A 95% interval around an expectancy, with the sample it rests on. */
export type Figure = {
  n: number;
  expectancy: number;
  lower: number;
  upper: number;
};

/** M3's three outcomes, plus the two ways a read can say nothing. */
export type M3Outcome =
  | "confirmed-profitable"
  | "confirmed-negative"
  | "contradicted"
  | "indistinguishable"
  | "not-held-back"
  | "not-read"
  | "unreadable";

export type ShippedCellRead = {
  variant: string;
  provenance: {
    /** False when no provenance artifact named this market — then nothing here is a claim. */
    known: boolean;
    derived: boolean;
    tranche: string | null;
    /** The selection window the shipped cell was picked on, if derived. */
    selectionWindow: { fitStartMs: number; selectStartMs: number; selectEndMs: number } | null;
    /**
     * Zero overlap between this corpus's confirm window and BOTH the window
     * the cell was selected on and the window it was confirmed on. Every
     * shipped derived cell was confirmed positive on its tranche's confirm
     * fold, and those folds cover 94–99% of R3's; a cell conditioned on a
     * positive read of these dates is survivor-selected here.
     */
    heldBack: boolean;
    overlapWithConfirmDays: number;
    /** The tranche's confirmation window, when the instrument could reconstruct it. */
    confirmationWindow?: { startMs: number; endMs: number } | null;
  };
  select: { net: Figure | null; gross: Figure | null };
  confirm: { net: Figure | null; gross: Figure | null };
  /** The pre-registered decline rule, applied mechanically on select. */
  declineCandidate: boolean;
  /** M3 against the pre-registered rule, on the confirm fold. */
  m3: M3Outcome;
};

export type AcceptedVariantRead = {
  variant: string;
  confirmFilled: number | null;
  confirmBaseFilled: number | null;
  confirmTotalDelta: number | null;
  confirmExpectancy: number | null;
  confirmExpectancyLower: number | null;
  confirmExpectancyUpper: number | null;
  confirmExpectancyDelta: number | null;
  confirmExpectancyDeltaLower: number | null;
  gateDisposition: string;
  gateReason: string;
  m3: M3Outcome;
};

export type LedgeredReadArtifact = {
  /** Present only when the corpus is condemned; a consumer refuses it. */
  INVALID?: string;
  analyzerVersion: string;
  anchor: string;
  /** sha256 of this artifact with `artifactHash` absent — a consumer recomputes it. */
  artifactHash: string;
  baselineVariant: string;
  /** sha256 of the held-back CALENDAR in dates only: per requested symbol, the confirm window. */
  calendarHash: string;
  corpusId: string;
  /** Emit-file sha256 keyed by the shard's manifestHash: binds the bytes, which no manifest hash does. */
  emitSha256: Record<string, string>;
  foldSource: "emitted";
  holdout: { rule: string; markets: string[]; basis?: string; pinState?: string; rosterHash?: string };
  includeHoldout: boolean;
  ledgerPath: string;
  readAt: string;
  readId: string;
  /** manifestHash of every shard the read covered. */
  shardHashes: string[];
  symbolFilter: string[] | null;
  symbolsRead: string[];
  verdictUnit: "class" | "market";
  rules: { decline: string; declineHash: string; accept: string; admissibility: string };
  /** Present when the read was driven by a frozen-candidates file (R4 act 3): the file, its hash, and the arms it bound. */
  frozen?: { arms: Array<{ arm: string; shardHashes: string[] }>; frozenHash: string; path: string; ruleHash: string };
  markets: Record<string, {
    heldOut: boolean;
    /** The frozen candidate this read opened for the market (frozen reads only); null when the freeze named none. */
    candidate?: { arm: string; disposition: "accepted" | "rejected"; reason: string; variant: string } | null;
    shipped: ShippedCellRead;
    accepted: AcceptedVariantRead[];
  }>;
};

/** Stable JSON: sorted keys at every depth, so a hash is a hash of the content. */
export function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableJson(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

/** The artifact's own hash — computed with `artifactHash` absent. */
export function artifactHashOf(artifact: Omit<LedgeredReadArtifact, "artifactHash"> & { artifactHash?: string }): string {
  const { artifactHash: _absent, ...rest } = artifact;
  return createHash("sha256").update(stableJson(rest)).digest("hex");
}

/**
 * The pre-registered decline rule, as text and as the hash the artifact
 * carries. Frozen in the act-2 design before any read; a change here is a
 * change of rule and must be re-registered, not edited in place.
 */
export const DECLINE_RULE =
  "decline candidate iff on the select fold of the per-class corpus the shipped cell's " +
  "NET expectancy 95% upper bound < 0 AND its GROSS expectancy 95% upper bound < 0 " +
  "with at least 30 filled; the confirm read reports M3 for candidates and non-candidates alike";
export const ACCEPT_RULE =
  "accepted iff beatsBaseline && earnsMoney per market on the emitted folds (gate v2, D4); " +
  "M3 reported for accepted variants only";
/**
 * Admissibility of a shipped cell's confirm figure. A cell that is NOT held
 * back was selected or confirmed positive on dates inside this fold: a
 * positive or indistinguishable figure for it is the winner's curse and is
 * WITHHELD; only a confirmed-negative figure — the fold contradicting the
 * prior positive read — is admissible, and the gate keeps the figure only in
 * that case.
 */
export const ADMISSIBILITY_RULE =
  "for a shipped cell not held back — selected or confirmed positive on dates inside this fold — " +
  "only a confirmed-negative confirm figure (95% upper bound < 0, at least 30 filled) is admissible; " +
  "a positive or indistinguishable figure is withheld from the artifact";
export const DECLINE_RULE_HASH = createHash("sha256").update(DECLINE_RULE).digest("hex");

/** Apply the pre-registered decline rule to a market's select figures. */
export function declineCandidateOf(select: { net: Figure | null; gross: Figure | null }): boolean {
  return select.net !== null && select.gross !== null &&
    select.net.n >= 30 && select.gross.n >= 30 &&
    select.net.upper < 0 && select.gross.upper < 0;
}

/**
 * M3 against the pre-registered rules, for the shipped cell's confirm figure.
 * For a cell that is not held back only a confirmed-negative outcome is
 * admissible (ADMISSIBILITY_RULE); anything else reads `not-held-back` and
 * the gate withholds the figure itself.
 */
export function m3Of(confirm: Figure | null, heldBack: boolean): M3Outcome {
  if (confirm === null || confirm.n < 30) return heldBack ? "unreadable" : "not-held-back";
  if (confirm.upper < 0) return "confirmed-negative";
  if (!heldBack) return "not-held-back";
  if (confirm.lower > 0) return "confirmed-profitable";
  return "indistinguishable";
}

export type OpenOptions = {
  /** The manifest hash of the corpus the consumer graded on select — must be among the read's shards. */
  manifestHash: string;
  /** Optional: the consumer's own sha256 of the emit it read (the shard `manifestHash` names), checked against the artifact's. */
  emitSha256?: string;
};

/**
 * The door. Refuses by name: a condemned artifact, a different corpus, a
 * tampered artifact, a malformed one. Returns the typed artifact.
 */
export function readLedgeredArtifact(path: string, options: OpenOptions): LedgeredReadArtifact {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new Error(`${path}: not a readable ledgered-read artifact (${(error as Error).message})`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${path}: a ledgered-read artifact is an object, not ${Array.isArray(parsed) ? "an array" : typeof parsed}`);
  }
  const artifact = parsed as Partial<LedgeredReadArtifact>;
  if (typeof artifact.INVALID === "string") {
    throw new Error(
      `${path}: this ledgered read is condemned — "${artifact.INVALID.slice(0, 160)}" — and no ` +
        `consumer may print a figure from it`,
    );
  }
  for (const field of ["artifactHash", "calendarHash", "corpusId", "readId", "readAt", "shardHashes", "markets", "rules", "holdout", "foldSource", "verdictUnit"] as const) {
    if (artifact[field] === undefined) {
      throw new Error(`${path}: ledgered-read artifact carries no ${field} — an unlabelled read is not evidence`);
    }
  }
  const shards = artifact.shardHashes as string[];
  if (!shards.includes(options.manifestHash)) {
    throw new Error(
      `${path}: written from a different corpus — manifest ${options.manifestHash.slice(0, 12)} is not among ` +
        `the read's shards (${shards.map((h) => h.slice(0, 12)).join(", ")}); a confirm figure travels only ` +
        `with the corpus it was read from`,
    );
  }
  const recomputed = artifactHashOf(artifact as LedgeredReadArtifact);
  if (recomputed !== artifact.artifactHash) {
    throw new Error(`${path}: artifactHash ${String(artifact.artifactHash).slice(0, 12)} does not match its content (${recomputed.slice(0, 12)}) — edited after the read`);
  }
  if (artifact.rules!.declineHash !== DECLINE_RULE_HASH) {
    throw new Error(
      `${path}: the read applied decline rule ${artifact.rules!.declineHash.slice(0, 12)} but this code registers ` +
        `${DECLINE_RULE_HASH.slice(0, 12)} — a figure read under another rule is not this program's figure`,
    );
  }
  if (options.emitSha256 !== undefined) {
    const recorded = (artifact.emitSha256 ?? {})[options.manifestHash];
    if (recorded !== options.emitSha256) {
      throw new Error(
        `${path}: the emit under manifest ${options.manifestHash.slice(0, 12)} hashes ` +
          `${options.emitSha256.slice(0, 12)} here but the read recorded ${String(recorded).slice(0, 12)} — ` +
          `not the same bytes`,
      );
    }
  }
  return artifact as LedgeredReadArtifact;
}
