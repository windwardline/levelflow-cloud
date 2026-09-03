// 3c/3d/3e (2026-08-10): the corpus partition, as calendar facts.
//
// The five-line split this replaces cut each symbol at a FRACTION of its
// own bar count — folds landed in different calendar years per symbol and
// the gate summed "test R" across disjoint history; one fixed cut made
// selection and confirmation the same fold; and boundary setups either
// truncated unresolved or quietly consumed the next fold's price action.
//
// Folds are common-origin CALENDAR windows shared by every symbol: fit
// (50% of the span), select (25%), confirm (25%) — selection and
// confirmation are different data, which is the whole point of a third
// fold. Each fold's decisions END an embargo before the fold closes, so
// every setup a fold decides RESOLVES inside that fold; the embargo is
// sized by the caller at warm-up plus the longest review window. The
// market holdout (3e) is a deterministic hash of the symbol itself — a
// property of the corpus that travels in the emit and manifest, not an
// invocation flag someone forgets.

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { getAssetType } from "../supabase/functions/trade-analyzer/calibration.ts";
import type { SweepManifest } from "./sweepManifest.ts";

export type FoldName = "confirm" | "fit" | "select";

export type CalendarFold = {
  decisionEndMs: number;
  endMs: number;
  name: FoldName;
  startMs: number;
};

const FOLD_SHARES: Array<{ name: FoldName; share: number }> = [
  { name: "fit", share: 0.5 },
  { name: "select", share: 0.25 },
  { name: "confirm", share: 0.25 },
];

export function calendarFolds(input: {
  corpusEndMs: number;
  corpusStartMs: number;
  embargoMs: number;
}): CalendarFold[] {
  const span = input.corpusEndMs - input.corpusStartMs;
  const smallestFoldMs = span * Math.min(
    ...FOLD_SHARES.map((fold) => fold.share),
  );
  if (input.embargoMs >= smallestFoldMs) {
    throw new Error(
      `calendarFolds: the ${input.embargoMs}ms embargo consumes the smallest ` +
        `${smallestFoldMs}ms fold — the span cannot support this partition`,
    );
  }
  const folds: CalendarFold[] = [];
  let cursor = input.corpusStartMs;
  for (const { name, share } of FOLD_SHARES) {
    const endMs = name === "confirm"
      ? input.corpusEndMs
      : cursor + Math.round(span * share);
    folds.push({
      decisionEndMs: endMs - input.embargoMs,
      endMs,
      name,
      startMs: cursor,
    });
    cursor = endMs;
  }
  return folds;
}

/**
 * Deterministic ~20% market holdout: the first byte of the symbol's
 * SHA-256 modulo five. No seed, no flag, no drift — the same symbol is
 * held out in every corpus ever built, so nothing tuned on the other
 * eighty percent has ever seen it.
 */
export function isHoldoutSymbol(symbol: string): boolean {
  const digest = createHash("sha256").update(symbol).digest();
  return digest[0] % 5 === 0;
}

export type FoldSplit = {
  bars: Array<{ time: number }>;
  decisionEndMs: number;
  name: FoldName;
  warmupBars: number;
};

/**
 * Slice one symbol's primary bars into per-fold simulation inputs. Each
 * fold's bars run from WARMUP_BARS before the fold boundary (known history
 * at decision time — never leakage) to the fold close; decisions begin
 * after the warm-up AND never before `warmupBars` bars of whatever data
 * the slice actually has — a symbol whose history starts mid-fold warms
 * up inside the fold instead of deciding on a one-bar market (the
 * committee reads bars.at(-2); warmup 0 crashed the first baseline
 * relaunch on exactly this). Folds too thin to hold a single decision
 * past their warm-up are dropped.
 */
export function foldSplits<T extends { time: number }>(
  primaryBars: T[],
  folds: CalendarFold[],
  warmupBars: number,
): Array<{ bars: T[]; decisionEndMs: number; name: FoldName; warmupBars: number }> {
  const firstIndexAtOrAfter = (targetMs: number) => {
    let low = 0;
    let high = primaryBars.length;
    while (low < high) {
      const mid = (low + high) >> 1;
      if (primaryBars[mid].time < targetMs) low = mid + 1;
      else high = mid;
    }
    return low;
  };
  return folds.map((fold) => {
    const startIndex = firstIndexAtOrAfter(fold.startMs);
    const endIndex = firstIndexAtOrAfter(fold.endMs);
    const sliceStart = Math.max(0, startIndex - warmupBars);
    return {
      bars: primaryBars.slice(sliceStart, endIndex),
      decisionEndMs: fold.decisionEndMs,
      name: fold.name,
      warmupBars: Math.max(startIndex - sliceStart, warmupBars),
    };
  }).filter((split) => split.bars.length > split.warmupBars + 1);
}

export type ClassFoldSpec = Record<string, { endMs: number; startMs: number }>;

/**
 * Folds serve CLASS aggregation — the gate's verdicts, the thresholds, the
 * reports all cut per class — so each class folds on its own union span.
 * One 17-year global calendar starved every 2023-era market (the futures,
 * agriculture and livestock complexes) of fit and select entirely: their
 * whole history sat inside the confirm fold and the grid measured zeros.
 * Per-class spans keep the common origin exactly where aggregation needs
 * it and give every class its maximal honest walk-forward. 3c's ban on
 * per-symbol fractions stands untouched.
 */
export function foldsByClass(
  spec: ClassFoldSpec,
  embargoMs: number,
): Record<string, CalendarFold[]> {
  // A fold spec is a research artifact and may carry the INVALID banner the
  // shared writer preserves. Read naively, that banner is a ninth "class"
  // with no span — so it is refused by name before anything folds on it.
  if ("INVALID" in spec) {
    throw new Error(
      `foldSpecInvalid: the fold spec carries an INVALID banner — ${
        String((spec as Record<string, unknown>).INVALID)
      }. Re-derive it from a validated cache before folding on it`,
    );
  }
  const result: Record<string, CalendarFold[]> = {};
  for (const [className, span] of Object.entries(spec)) {
    result[className] = calendarFolds({
      corpusEndMs: span.endMs,
      corpusStartMs: span.startMs,
      embargoMs,
    });
  }
  return result;
}

/**
 * Read-time stratified holdout (round-8 batch 1, CV-4/CV-5): the sha256
 * ranking runs WITHIN each class, taking ~20% with a floor of one for
 * classes of three or more markets; a one-or-two-market class holds
 * nothing out — by stated policy it keeps its markets for tuning and has
 * no unseen-market confirmation read. Deterministic in the symbol set,
 * independent of order and of which corpus stamped what: the gate
 * recomputes this at read time, so holdout policy changes never require
 * a resweep.
 */
export function stratifiedHoldout(
  symbols: string[],
  classOf: (symbol: string) => string,
): Set<string> {
  const byClass = new Map<string, string[]>();
  for (const symbol of new Set(symbols)) {
    const className = classOf(symbol);
    if (!byClass.has(className)) byClass.set(className, []);
    byClass.get(className)!.push(symbol);
  }
  const held = new Set<string>();
  for (const classSymbols of byClass.values()) {
    if (classSymbols.length < 3) continue;
    const ranked = classSymbols
      .map((symbol) => ({
        rank: createHash("sha256").update(symbol).digest("hex"),
        symbol,
      }))
      .sort((a, b) => (a.rank < b.rank ? -1 : 1));
    const take = Math.max(1, Math.round(classSymbols.length * 0.2));
    for (const entry of ranked.slice(0, take)) held.add(entry.symbol);
  }
  return held;
}

/**
 * ONE holdout population (R4 act 2, deliverable 4).
 *
 * Two holdouts had grown side by side: the driver's STAMP (`isHoldoutSymbol`,
 * sha256 mod 5, written onto every row as `holdout` and into the manifest as
 * `holdoutSymbols` — 19 of R3's 97) and the gate's read-time STRATIFIED set
 * (`stratifiedHoldout`, sha256 rank within class — 20 of the 97). They share
 * five markets and disagree in every class, and since 2026-08-11 the gate has
 * tuned on 14 of the 19 stamped markets, so the stamp no longer names
 * untainted markets. The stratified set is what the gate held out and what the
 * shipped holdout-cycle cells were confirmed on. From here on it is the only
 * set anything excludes on; the stamp is provenance a reader may print and
 * never act on.
 *
 * Drawn over the union of the manifests' `requestedSymbols` — the roster ASKED
 * for at sweep time — never over the symbols that survived: a subset read, or
 * a market that dropped out at a door, would otherwise move another market's
 * membership (66 of 97 single removals do). A manifest written before that
 * field existed — every legacy corpus and fixture — is read over the symbols
 * it carries, and the set SAYS so (`basis: "symbols-read"`): such a set is
 * unpinnable, never mistaken for drift from a pin drawn over a request.
 * Mirrors the rule the gate's three inline copies apply (grid-totalr,
 * confirm-4d, derive-4d) so they can be switched to this helper without a
 * change of set.
 */
export const HOLDOUT_RULE = "stratified-per-class-20pct" as const;

/** Where an anchor's held-out set is pinned, relative to the repository root. */
export const HOLDOUT_PIN_DIR = "docs/research/r4";

/**
 * What the set was drawn over. `requestedSymbols` is the roster asked for;
 * `symbols-read` is the fallback for a manifest carrying no request — the
 * weakest basis among the shards names the whole computation.
 */
export type HoldoutBasis = "requestedSymbols" | "symbols-read";

export type HeldOutSet = {
  basis: HoldoutBasis;
  markets: string[];
  /** sha256 of the sorted roster the set was drawn over — what a pin is specific to. */
  rosterHash: string;
  rule: typeof HOLDOUT_RULE;
};

/** The roster's identity: order- and duplicate-insensitive, so a re-sweep of the same request hashes alike. */
export function rosterHashOf(roster: Iterable<string>): string {
  return createHash("sha256")
    .update([...new Set(roster)].sort().join("\n"))
    .digest("hex");
}

/** The manifest terms the holdout reads — a whole manifest satisfies it. */
export type HoldoutManifest = Pick<
  SweepManifest,
  "anchor" | "holdoutSymbols" | "manifestHash" | "requestedSymbols"
> & { symbols?: ReadonlyArray<{ symbol: string }> };

export function holdoutPinPath(anchor: string, dir = HOLDOUT_PIN_DIR): string {
  return `${dir}/holdout-${anchor}.json`;
}

export function heldOutSet(manifests: readonly HoldoutManifest[]): HeldOutSet {
  if (manifests.length === 0) {
    throw new Error(
      "heldOutSet: no manifests given — the held-out set is drawn from a " +
        "corpus's requested roster, and there is none to draw from",
    );
  }
  const roster = new Set<string>();
  let basis: HoldoutBasis = "requestedSymbols";
  for (const manifest of manifests) {
    if (Array.isArray(manifest.requestedSymbols)) {
      for (const symbol of manifest.requestedSymbols) roster.add(symbol);
      continue;
    }
    if (!Array.isArray(manifest.symbols) || manifest.symbols.length === 0) {
      throw new Error(
        `heldOutSet: manifest ${manifest.manifestHash.slice(0, 12)} (anchor ${
          manifest.anchor
        }) carries neither requestedSymbols nor symbols — there is no roster ` +
          `to draw a held-out set from`,
      );
    }
    basis = "symbols-read";
    for (const entry of manifest.symbols) roster.add(entry.symbol);
  }
  if (roster.size === 0) {
    throw new Error(
      "heldOutSet: the requested roster is EMPTY — a held-out set over nothing " +
        "is not a set, and a manifest that requested no market is not a corpus " +
        "to draw one from",
    );
  }
  const markets = [
    ...stratifiedHoldout([...roster], (symbol) => getAssetType(symbol)),
  ].sort();
  return { basis, markets, rosterHash: rosterHashOf(roster), rule: HOLDOUT_RULE };
}

/**
 * How a computed set stands to a pin: `verified` — same roster, same set;
 * `other-roster` — the pin names another requested roster, so it says
 * nothing about this one; `symbols-read` — the set was drawn over survivors
 * and cannot be compared to a pin drawn over a request; `absent` — no pin
 * stands for the anchor. Drift is the one refusal: same roster, different
 * set.
 */
export type PinState = "absent" | "other-roster" | "symbols-read" | "verified";

/**
 * Recompute the set and refuse by name if the tracked pin, drawn over THIS
 * roster, names another set: a roster change moves membership, and a reader
 * must never drift from the pinned set in silence. A pin is roster-specific
 * (`rosterHash`): a manifest requesting a different roster at the same
 * anchor is unpinned for its roster, never drifted, and a set drawn over the
 * symbols read is unpinnable. The pin file itself is refused if malformed.
 */
export function verifyHeldOutSet(
  manifests: readonly HoldoutManifest[],
  pinnedPath: string,
): HeldOutSet & { pinState: Exclude<PinState, "absent"> } {
  let pinned: {
    INVALID?: unknown;
    manifestHashes?: unknown;
    markets?: unknown;
    rosterHash?: unknown;
    rule?: unknown;
  };
  try {
    pinned = JSON.parse(readFileSync(pinnedPath, "utf8")) as typeof pinned;
  } catch (error) {
    throw new Error(
      `verifyHeldOutSet: ${pinnedPath} could not be read as JSON (${
        String(error)
      }) — the pinned held-out set is a tracked file, and a reader does not ` +
        `proceed past one it cannot read`,
    );
  }
  if (typeof pinned.INVALID === "string") {
    throw new Error(
      `verifyHeldOutSet: ${pinnedPath} carries an INVALID banner — ${
        pinned.INVALID
      }. Re-pin from validated manifests before reading against it`,
    );
  }
  if (pinned.rule !== HOLDOUT_RULE) {
    throw new Error(
      `verifyHeldOutSet: ${pinnedPath} pins rule ${
        JSON.stringify(pinned.rule)
      }, not ${HOLDOUT_RULE} — a set drawn under another rule is not this ` +
        `set; re-pin with scripts/holdout-set.ts`,
    );
  }
  if (
    !Array.isArray(pinned.markets) ||
    !pinned.markets.every((market) => typeof market === "string")
  ) {
    throw new Error(
      `verifyHeldOutSet: ${pinnedPath} pins no list of markets — re-pin with ` +
        `scripts/holdout-set.ts`,
    );
  }
  if (typeof pinned.rosterHash !== "string") {
    throw new Error(
      `verifyHeldOutSet: ${pinnedPath} pins no rosterHash, so it cannot say ` +
        `which requested roster it was drawn over — re-pin with ` +
        `scripts/holdout-set.ts`,
    );
  }
  if (!Array.isArray(pinned.manifestHashes) || pinned.manifestHashes.length === 0) {
    throw new Error(
      `verifyHeldOutSet: ${pinnedPath} names no manifestHashes, so it cannot say which ` +
        `manifests it was drawn from — deleting the claim is how an edited pin would dodge ` +
        `the claimed-manifest check; re-pin with scripts/holdout-set.ts`,
    );
  }
  const pinnedList = pinned.markets as string[];
  if (new Set(pinnedList).size !== pinnedList.length) {
    throw new Error(
      `verifyHeldOutSet: ${pinnedPath} names a market twice — a pin is a set; ` +
        `re-pin with scripts/holdout-set.ts`,
    );
  }
  const computed = heldOutSet(manifests);
  if (computed.basis === "symbols-read") {
    return { ...computed, pinState: "symbols-read" };
  }
  if (computed.rosterHash !== pinned.rosterHash) {
    // A pin that names one of THESE manifests but another roster is not
    // another roster's pin — it is this pin, edited: refuse rather than
    // let the reader proceed on its own set past a corrupted file.
    const claims = Array.isArray(pinned.manifestHashes)
      ? manifests.filter((manifest) => (pinned.manifestHashes as unknown[]).includes(manifest.manifestHash))
      : [];
    if (claims.length > 0) {
      throw new Error(
        `verifyHeldOutSet: ${pinnedPath} names manifest ${claims[0].manifestHash.slice(0, 12)} ` +
          `among the manifests it was drawn from, yet pins rosterHash ${
            String(pinned.rosterHash).slice(0, 12)
          } while this roster hashes ${computed.rosterHash.slice(0, 12)} — the pin was ` +
          `edited, not drawn over another roster; re-pin with scripts/holdout-set.ts`,
      );
    }
    return { ...computed, pinState: "other-roster" };
  }
  const pinnedMarkets = [...(pinned.markets as string[])].sort();
  const pinnedOnly = pinnedMarkets.filter(
    (market) => !computed.markets.includes(market),
  );
  const computedOnly = computed.markets.filter(
    (market) => !pinnedMarkets.includes(market),
  );
  if (pinnedOnly.length > 0 || computedOnly.length > 0) {
    throw new Error(
      `heldOutSetDrift: the set computed from the manifests' requestedSymbols ` +
        `(${computed.markets.length} markets) differs from the set pinned at ` +
        `${pinnedPath} for the same requested roster (${pinnedMarkets.length}) ` +
        `— pinned but not computed: ${pinnedOnly.join(", ") || "none"}; ` +
        `computed but not pinned: ${computedOnly.join(", ") || "none"}. The ` +
        `rule or the pin moved, not the roster; re-pin with ` +
        `scripts/holdout-set.ts only with the reason recorded — never read ` +
        `against a pin that names a different set`,
    );
  }
  return { ...computed, pinState: "verified" };
}

export type ResolvedHeldOut = HeldOutSet & {
  anchor: string;
  held: Set<string>;
  /** The pin looked for, whether the file stands, how the set stands to it, and `pinned` when verified. */
  pinPath: string;
  pinStands: boolean;
  pinState: PinState;
  pinned: boolean;
  /** The manifests' stamped `holdoutSymbols`, union, sorted — provenance only. */
  stamped: string[];
};

/**
 * The set a reader excludes on, verified against the anchor's tracked pin
 * when one stands and computed when none does. One anchor per call: shards
 * of two anchors are two measurements.
 */
export function resolveHeldOut(
  manifests: readonly HoldoutManifest[],
  pinDir = HOLDOUT_PIN_DIR,
): ResolvedHeldOut {
  const anchors = [...new Set(manifests.map((manifest) => manifest.anchor))].sort();
  if (anchors.length === 0) {
    throw new Error("resolveHeldOut: no manifests — there is no roster to draw a held-out set from");
  }
  // Shards of one measurement may carry different anchors (a sweep crossing
  // midnight; a re-run dead shard) — the ledger's identity excludes the
  // anchor for exactly that reason. The SET depends only on the roster; the
  // PIN is per anchor, so a multi-anchor read is computed and reported
  // unpinned rather than refused.
  const pinPath = holdoutPinPath(anchors.length === 1 ? anchors[0] : anchors.join("+"), pinDir);
  const pinStands = existsSync(pinPath);
  // A symbols-read set is unpinnable whether or not a file stands; "absent"
  // is reserved for a set that could have been pinned and was not.
  const set: HeldOutSet & { pinState: PinState } = pinStands
    ? verifyHeldOutSet(manifests, pinPath)
    : (() => {
      const computed = heldOutSet(manifests);
      return {
        ...computed,
        pinState: computed.basis === "symbols-read" ? "symbols-read" : "absent",
      };
    })();
  const stamped = [
    ...new Set(manifests.flatMap((manifest) => manifest.holdoutSymbols ?? [])),
  ].sort();
  return {
    basis: set.basis,
    markets: set.markets,
    rosterHash: set.rosterHash,
    rule: set.rule,
    anchor: anchors.join("+"),
    held: new Set(set.markets),
    pinPath,
    pinStands,
    pinState: set.pinState,
    pinned: set.pinState === "verified",
    stamped,
  };
}

/** The one header line every reader states: the rule, the count, the basis and pin, the stamp. */
/**
 * One sentence a reader prints about the held-out set — stated for what THIS
 * reader does with it: `pools` when it keeps the set out of class pools,
 * `labels` when it marks held-out markets on per-market lines. A reader with
 * neither prints the set as provenance only; the old one-template sentence
 * claimed pools and labels for readers that had neither (act 2's refuter).
 */
export function describeHeldOut(
  resolved: ResolvedHeldOut,
  behaviour: { labels: boolean; pools: boolean } = { labels: true, pools: true },
): string {
  const does = [
    behaviour.pools ? "excluded from every class pool" : null,
    behaviour.labels ? "labelled HELD OUT per market" : null,
  ].filter((part): part is string => part !== null);
  const use = does.length > 0 ? does.join(", ") : "named as provenance only (this reader pools nothing and prints no per-market line)";
  const basis = resolved.pinState === "verified"
    ? `pinned ${resolved.pinPath}`
    : resolved.pinState === "absent"
    ? `unpinned — no ${resolved.pinPath}, computed from requestedSymbols`
    : resolved.pinState === "other-roster"
    ? `unpinned for this roster — ${resolved.pinPath} pins another requested ` +
      `roster; computed from requestedSymbols (roster ${
        resolved.rosterHash.slice(0, 12)
      })`
    : `computed over the symbols read — no requested roster in the manifest — ` +
      `so unpinnable${
        resolved.pinStands ? `; ${resolved.pinPath} not consulted` : ""
      }`;
  return `holdout: ${resolved.rule} — ${resolved.markets.length} markets ` +
    `${use} (${basis}); ` +
    `stamped flag: ${resolved.stamped.length} markets, provenance only`;
}

/**
 * The embargo must cover the longest review window any arm can carry.
 *
 * `calendarFolds` stops a fold's decisions `embargoMs` before it closes so
 * every resolution lands inside the fold — look-ahead by construction. The
 * resolver's horizon is `reviewHours + 24h` (sweep.ts), and
 * `defaultReviewHours` is a grid axis, so an arm with a long enough window
 * would read the NEXT fold's bars from inside this one. Nothing asserted the
 * constant against the axis until the 2026-09-02 design review of the seal.
 * Called by the driver with every review window the run can produce: each
 * roster symbol's shipped cell and each grid override.
 */
export function assertEmbargoCoversReview(
  embargoMs: number,
  reviewHours: readonly number[],
): void {
  if (reviewHours.length === 0) {
    throw new Error(
      "assertEmbargoCoversReview: no review windows to check — an empty list " +
        "would pass any embargo vacuously",
    );
  }
  const longest = Math.max(...reviewHours);
  const horizonMs = (longest + 24) * 3_600_000;
  if (horizonMs > embargoMs) {
    throw new Error(
      `foldEmbargoTooShort: reviewHours ${longest} + 24h resolution horizon = ${
        longest + 24
      }h exceeds the ${Math.round(embargoMs / 3_600_000)}h fold embargo — a ` +
        `decision at a fold's embargoed edge would resolve against the next ` +
        `fold's bars; lengthen FOLD_EMBARGO_MS or drop the window from the grid`,
    );
  }
}
