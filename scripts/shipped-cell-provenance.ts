// Provenance of every market's SHIPPED cell — so a confirm figure can say
// whether it is held back (R4 act 2, design review rows D1 and D2(a)).
//
// R3's corpora grade every market against its own shipped configuration:
// the empty grid cell `baseline` = the live class row + the market's
// per-symbol layer, which the manifest carries as `symbols[].symbolOverride`.
// Seventy-two of those layers were derived on 2026-08-11 in three tranches,
// each selected on a calendar of its own:
//
//   derived-4d     the 4c corpus's per-CLASS fit+select folds
//   holdout-cycle  the same per-class folds, on the stratified holdout
//   totality       a per-MARKET re-cut of each market's own series span at
//                  50%/75% (grid-totalr --per-market-folds; the arithmetic
//                  is copied below, not imported — the flag is retired)
//
// R3's held-back calendar is each class's `confirm` fold. Where a cell's
// selection window reaches into that fold, its confirm figure on R3 is not
// held back: the rows that would confirm it are rows that chose it. The
// design's lens put 21 of the 27 totality picks there. This reader derives
// the fact per market from the record — tranche membership from the 4d
// confirm-read artifacts (the rule tests/calibrationState.test.ts pins: a
// cell ships iff its tranche's confirm read is positive, later tranche
// wins), the selection window from the tranche's calendar, the overlap
// from the R3 manifest's folds — and never guesses: a market whose
// provenance the record cannot state gets `tranche: null` and a reason.
//
// It reads manifests and JSON artifacts only. It opens no corpus, so the
// one-clock door has nothing to judge here; each manifest's hash is
// recomputed so a hand-edited calendar is refused all the same. The 4d
// artifacts' FIGURES are invalid (the 2026-08-11 clock defect); none is
// copied — only membership and calendars.
//
//   npx tsx scripts/shipped-cell-provenance.ts \
//     --r3 docs/research/r3/capture-all-classfolds.jsonl.manifest.json \
//     --r3-global docs/research/r3/capture-all.jsonl.manifest.json \
//     --picks-dir docs/research/baseline-2026-08-10 \
//     --selection-manifest sweeps/4c/shard-0.jsonl.manifest.json,... \
//     --out docs/research/r4/shipped-cell-provenance.json
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { flagReader, OperatorInputError, tokenFault } from "./flagReader.ts";
import { writeResearchArtifact } from "./researchArtifact.ts";
import { sha256Hex, stableStringify } from "./sweepManifest.ts";

export const DAY_MS = 86_400_000;

export type Window = { startMs: number; endMs: number };
export type FoldWindow = Window & { decisionEndMs: number | null };
export type FoldWindows = { fit: FoldWindow; select: FoldWindow; confirm: FoldWindow };
export type SelectionWindow = {
  fitStartMs: number;
  selectStartMs: number;
  selectEndMs: number;
  /**
   * The window the cell was CONFIRMED on — its tranche's confirm fold. A
   * shipped derived cell exists because it read positive there, so a
   * later fold overlapping these dates is survivor-selected (act 2's
   * refuter): held back means clear of this window too.
   */
  confirmStartMs: number;
  confirmEndMs: number;
};
export type Span = { firstTime: number; lastTime: number };

type Fold = {
  name?: unknown;
  startMs?: unknown;
  endMs?: unknown;
  decisionEndMs?: unknown;
};

export type ManifestSymbol = {
  symbol: string;
  assetType?: string;
  symbolOverride?: Record<string, unknown>;
  series?: Record<string, { firstTime?: unknown; lastTime?: unknown }>;
};

export type ManifestLike = {
  analyzerVersion?: string;
  generatedAt?: string;
  manifestHash?: string;
  clock?: unknown;
  folds?: Fold[];
  foldsByClass?: Record<string, Fold[]>;
  requestedSymbols?: unknown;
  holdoutSymbols?: unknown;
  symbols?: ManifestSymbol[];
};

export type TrancheName = "derived-4d" | "holdout-cycle" | "totality";

/**
 * The three tranches, in PRECEDENCE order. tests/calibrationState.test.ts
 * derives the shipped table as `{...picks, ...holdoutPicks, ...totalityPicks}`
 * — a later tranche's cell overrides an earlier one's — and requires a
 * cell exactly where a tranche's confirm read is positive. This array is
 * that rule stated once, with each tranche's selection calendar beside it.
 */
export const TRANCHES: readonly {
  tranche: TrancheName;
  picks: string;
  confirm: string;
  selection: "class-folds" | "per-market-recut";
}[] = [
  {
    tranche: "derived-4d",
    picks: "4d-final-picks.json",
    confirm: "4d-confirm-read.json",
    selection: "class-folds",
  },
  {
    tranche: "holdout-cycle",
    picks: "4d-holdout-final-picks.json",
    confirm: "4d-holdout-confirm-read.json",
    selection: "class-folds",
  },
  {
    tranche: "totality",
    picks: "4d-totality-final-picks.json",
    confirm: "4d-totality-confirm-read.json",
    selection: "per-market-recut",
  },
];

export type PicksArtifact = {
  analyzerVersion?: string;
  frozenAt?: string;
  finalPicks: Record<string, { variant: string }>;
};

export type ConfirmReadArtifact = {
  readAt?: string;
  confirmReport: Record<string, { confirmTotalDelta: number | null; variant: string }>;
};

export type TrancheRecord = {
  tranche: TrancheName;
  selection: "class-folds" | "per-market-recut";
  picks: PicksArtifact;
  confirm: ConfirmReadArtifact;
};

export type PickProvenance = {
  tranche: TrancheName;
  variant: string;
  confirmed: boolean;
  selectionWindow: SelectionWindow | null;
  overlapWithR3ConfirmDays: number | null;
  confirmationWindow?: Window | null;
  overlapWithR3ConfirmDaysFromConfirmation?: number | null;
};

export type MarketProvenance = {
  symbol: string;
  assetType: string;
  shippedVariant: "baseline";
  derived: boolean;
  tranche: TrancheName | null;
  reason?: string;
  pickVariant: string | null;
  symbolOverride: Record<string, unknown>;
  picks: PickProvenance[];
  selectionSpan: Span | null;
  selectionWindow: SelectionWindow | null;
  r3SelectWindow: FoldWindow;
  r3ConfirmWindow: FoldWindow;
  overlapWithR3SelectDays: number | null;
  overlapWithR3ConfirmDays: number | null;
  confirmationWindow?: Window | null;
  overlapWithR3ConfirmDaysFromConfirmation?: number | null;
  marginToR3ConfirmDays: number | null;
  heldBack: boolean | null;
  r3GlobalConfirmWindow?: FoldWindow;
  overlapWithGlobalConfirmDays?: number | null;
  heldBackFromGlobal?: boolean | null;
};

export type TrancheSummary = {
  picksFrozen: number;
  picksConfirmed: number;
  picksOverlappingR3Confirm: number;
  shipped: number;
  shippedHeldBack: number;
  shippedNotHeldBack: number;
  shippedUndeterminable: number;
};

/**
 * The per-market re-cut, copied from grid-totalr's `--per-market-folds`
 * (scripts/grid-totalr.ts, the `refold` closure): fit is the first half of
 * the market's own span by decision time, select the next quarter, confirm
 * the last. Copied rather than imported because act 2 retires the flag; the
 * arithmetic has to survive its removal for the provenance to stay
 * derivable.
 */
export function recutSpan(span: Span): SelectionWindow {
  const fitEnd = span.firstTime + (span.lastTime - span.firstTime) * 0.5;
  const selectEnd = span.firstTime + (span.lastTime - span.firstTime) * 0.75;
  return {
    confirmEndMs: span.lastTime,
    confirmStartMs: selectEnd,
    fitStartMs: span.firstTime,
    selectStartMs: fitEnd,
    selectEndMs: selectEnd,
  };
}

/** Milliseconds two half-open windows share; touching windows share none. */
export function overlapMs(first: Window, second: Window): number {
  return Math.max(
    0,
    Math.min(first.endMs, second.endMs) - Math.max(first.startMs, second.startMs),
  );
}

export function overlapDays(first: Window, second: Window): number {
  return overlapMs(first, second) / DAY_MS;
}

/** The selection window as a plain window: fit start through select end. */
export function selectionAsWindow(window: SelectionWindow): Window {
  return { startMs: window.fitStartMs, endMs: window.selectEndMs };
}

/** The confirmation window as a plain window: the tranche's confirm fold. */
export function confirmationAsWindow(window: SelectionWindow): Window {
  return { startMs: window.confirmStartMs, endMs: window.confirmEndMs };
}

function finite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * A fold list as the three named windows, refusing a calendar this reader
 * cannot name or order. A fold with a missing name would otherwise be read
 * as whichever slot was left, which is the shape the tuning readers refuse
 * at their doors too.
 */
export function foldWindows(folds: unknown, where: string): FoldWindows {
  if (!Array.isArray(folds)) {
    throw new Error(`${where}: folds are not a list — cannot state a calendar`);
  }
  const byName = new Map<string, FoldWindow>();
  for (const fold of folds as Fold[]) {
    const name = typeof fold?.name === "string" ? fold.name : null;
    const startMs = finite(fold?.startMs);
    const endMs = finite(fold?.endMs);
    if (name === null || startMs === null || endMs === null) {
      throw new Error(
        `${where}: a fold lacks a name or a finite startMs/endMs — ${
          JSON.stringify(fold)
        }`,
      );
    }
    if (byName.has(name)) {
      throw new Error(`${where}: fold "${name}" appears twice`);
    }
    byName.set(name, { startMs, endMs, decisionEndMs: finite(fold.decisionEndMs) });
  }
  const fit = byName.get("fit");
  const select = byName.get("select");
  const confirm = byName.get("confirm");
  if (!fit || !select || !confirm) {
    throw new Error(
      `${where}: the calendar must name fit, select and confirm — got ${
        [...byName.keys()].join(", ") || "nothing"
      }`,
    );
  }
  const ordered = fit.startMs < fit.endMs && fit.endMs <= select.startMs &&
    select.startMs < select.endMs && select.endMs <= confirm.startMs &&
    confirm.startMs < confirm.endMs;
  if (!ordered) {
    throw new Error(
      `${where}: folds are not ordered fit < select < confirm — ` +
        `${JSON.stringify({ fit, select, confirm })}`,
    );
  }
  return { fit, select, confirm };
}

export function foldWindowsByClass(
  foldsByClass: unknown,
  where: string,
): Record<string, FoldWindows> {
  if (!foldsByClass || typeof foldsByClass !== "object" || Array.isArray(foldsByClass)) {
    throw new Error(`${where}: foldsByClass is not a class → folds record`);
  }
  const out: Record<string, FoldWindows> = {};
  for (const [assetType, folds] of Object.entries(foldsByClass as Record<string, unknown>)) {
    out[assetType] = foldWindows(folds, `${where} [${assetType}]`);
  }
  if (Object.keys(out).length === 0) {
    throw new Error(`${where}: foldsByClass names no class`);
  }
  return out;
}

/**
 * Read a manifest and recompute its hash — the same arithmetic the corpus
 * door applies (sweepStats verifyManifest), applied here without the door
 * because no corpus is opened. A calendar edited by hand is refused.
 */
export function readVerifiedManifest(path: string): ManifestLike {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    throw new OperatorInputError(`${path}: cannot read this manifest`);
  }
  const manifest = JSON.parse(text) as ManifestLike;
  const { generatedAt: _generatedAt, manifestHash, ...hashedPayload } = manifest;
  const recomputed = sha256Hex(stableStringify(hashedPayload));
  if (typeof manifestHash !== "string" || recomputed !== manifestHash) {
    throw new Error(
      `${path}: manifest hash mismatch — recorded ${
        String(manifestHash)
      }, recomputed ${recomputed}; a calendar this reader cannot trust states no provenance`,
    );
  }
  if (!Array.isArray(manifest.symbols)) {
    throw new Error(`${path}: manifest carries no symbols list`);
  }
  return manifest;
}

function readJsonArtifact<T>(path: string, requiredKey: keyof T & string): T {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    throw new OperatorInputError(`${path}: cannot read this artifact`);
  }
  const parsed = JSON.parse(text) as T;
  const value = (parsed as Record<string, unknown>)[requiredKey];
  if (!value || typeof value !== "object") {
    throw new Error(`${path}: carries no ${requiredKey} record`);
  }
  return parsed;
}

export function readTranches(picksDir: string): TrancheRecord[] {
  return TRANCHES.map((entry) => ({
    tranche: entry.tranche,
    selection: entry.selection,
    picks: readJsonArtifact<PicksArtifact>(join(picksDir, entry.picks), "finalPicks"),
    confirm: readJsonArtifact<ConfirmReadArtifact>(
      join(picksDir, entry.confirm),
      "confirmReport",
    ),
  }));
}

/** "k=v,k=v" → record; the shape every 4d pick and confirm row carries. */
export function parseVariant(variant: string): Record<string, string> {
  const parts: Record<string, string> = {};
  for (const pair of variant.split(",")) {
    const eq = pair.indexOf("=");
    if (eq <= 0) {
      throw new Error(`variant "${variant}" has a part without key=value: "${pair}"`);
    }
    parts[pair.slice(0, eq)] = pair.slice(eq + 1);
  }
  return parts;
}

/** The pick's fields that the per-symbol layer does not carry at that value. */
export function overrideDiffers(
  override: Record<string, unknown>,
  variant: string,
): string[] {
  return Object.entries(parseVariant(variant))
    .filter(([key, value]) => String(override[key]) !== value)
    .map(([key]) => key);
}

/** Merged min-first / max-last across manifests — grid-totalr's own merge. */
export function selectionSpans(manifests: ManifestLike[]): Map<string, Span> {
  const spans = new Map<string, Span>();
  for (const manifest of manifests) {
    for (const entry of manifest.symbols ?? []) {
      const series = entry.series?.["15min"];
      const firstTime = finite(series?.firstTime);
      const lastTime = finite(series?.lastTime);
      if (firstTime === null || lastTime === null) continue;
      const current = spans.get(entry.symbol);
      spans.set(entry.symbol, {
        firstTime: Math.min(current?.firstTime ?? Infinity, firstTime),
        lastTime: Math.max(current?.lastTime ?? -Infinity, lastTime),
      });
    }
  }
  return spans;
}

export type ProvenanceInput = {
  r3: { path: string; manifest: ManifestLike };
  r3Global?: { path: string; manifest: ManifestLike };
  tranches: TrancheRecord[];
  selection: { path: string; manifest: ManifestLike }[];
};

function requestedRoster(manifest: ManifestLike, path: string): string[] {
  const requested = manifest.requestedSymbols;
  if (!Array.isArray(requested) || requested.length === 0 ||
    !requested.every((symbol) => typeof symbol === "string")) {
    throw new Error(
      `${path}: requestedSymbols is missing or empty — the roster the sweep ` +
        `was asked for is the population here, never the union of what was read`,
    );
  }
  const roster = requested as string[];
  if (new Set(roster).size !== roster.length) {
    throw new Error(`${path}: requestedSymbols repeats a symbol`);
  }
  return roster;
}

function rosterEntries(
  manifest: ManifestLike,
  path: string,
  roster: string[],
): Map<string, ManifestSymbol> {
  const entries = new Map<string, ManifestSymbol>();
  for (const entry of manifest.symbols ?? []) {
    if (entries.has(entry.symbol)) {
      throw new Error(`${path}: symbol ${entry.symbol} appears twice in symbols`);
    }
    entries.set(entry.symbol, entry);
  }
  for (const symbol of roster) {
    const entry = entries.get(symbol);
    if (!entry) {
      throw new Error(
        `${path}: requested symbol ${symbol} has no symbols[] entry — its ` +
          `class and per-symbol layer cannot be stated`,
      );
    }
    if (typeof entry.assetType !== "string") {
      throw new Error(`${path}: ${symbol} carries no assetType — no calendar maps to it`);
    }
    if (!entry.symbolOverride || typeof entry.symbolOverride !== "object") {
      throw new Error(
        `${path}: ${symbol} carries no symbolOverride key — this manifest ` +
          `predates the per-symbol layer stamp and cannot state the shipped cell`,
      );
    }
  }
  return entries;
}

function windowFor(
  selection: "class-folds" | "per-market-recut",
  assetType: string,
  span: Span | null,
  classFolds: Record<string, FoldWindows>,
): { window: SelectionWindow | null; reason?: string } {
  if (selection === "class-folds") {
    const folds = classFolds[assetType];
    if (!folds) {
      return {
        window: null,
        reason: `the selection manifests carry no ${assetType} fold calendar`,
      };
    }
    return {
      window: {
        confirmEndMs: folds.confirm.endMs,
        confirmStartMs: folds.confirm.startMs,
        fitStartMs: folds.fit.startMs,
        selectStartMs: folds.select.startMs,
        selectEndMs: folds.select.endMs,
      },
    };
  }
  if (!span) {
    return {
      window: null,
      reason: "no 15min series span in any selection manifest — the per-market re-cut cannot be reproduced",
    };
  }
  return { window: recutSpan(span) };
}

export function buildProvenance(input: ProvenanceInput): Record<string, unknown> {
  const r3Path = input.r3.path;
  const r3 = input.r3.manifest;
  const roster = requestedRoster(r3, r3Path).slice().sort();
  const entries = rosterEntries(r3, r3Path, roster);
  if (r3.foldsByClass === undefined) {
    throw new Error(
      `${r3Path}: carries no foldsByClass — the held-back calendar is the ` +
        `per-CLASS confirm fold; pass the classfolds manifest as --r3`,
    );
  }
  const r3Folds = foldWindowsByClass(r3.foldsByClass, `${r3Path} foldsByClass`);
  for (const symbol of roster) {
    const assetType = entries.get(symbol)!.assetType!;
    if (!r3Folds[assetType]) {
      throw new Error(`${r3Path}: ${symbol} is class ${assetType}, which foldsByClass does not name`);
    }
  }

  let globalFolds: FoldWindows | null = null;
  if (input.r3Global) {
    const { path, manifest } = input.r3Global;
    if (manifest.folds === undefined || manifest.foldsByClass !== undefined) {
      throw new Error(
        `${path}: --r3-global must carry global folds and no foldsByClass — ` +
          `the two R3 manifests are being read the wrong way round`,
      );
    }
    globalFolds = foldWindows(manifest.folds, `${path} folds`);
    const globalRoster = requestedRoster(manifest, path).slice().sort();
    if (stableStringify(globalRoster) !== stableStringify(roster)) {
      throw new Error(`${path}: requestedSymbols differ from ${r3Path} — not the same roster`);
    }
    const globalEntries = rosterEntries(manifest, path, roster);
    for (const symbol of roster) {
      const mine = stableStringify(entries.get(symbol)!.symbolOverride);
      const theirs = stableStringify(globalEntries.get(symbol)!.symbolOverride);
      if (mine !== theirs) {
        throw new Error(
          `${path}: ${symbol}'s per-symbol layer differs from ${r3Path}'s — ` +
            `the two arms would grade different shipped cells`,
        );
      }
    }
  }

  if (input.selection.length === 0) {
    throw new Error("no selection manifest given — the selection calendars cannot be stated");
  }
  let classFolds: Record<string, FoldWindows> | null = null;
  let classFoldsKey = "";
  for (const { path, manifest } of input.selection) {
    if (manifest.foldsByClass === undefined) {
      throw new Error(
        `${path}: selection manifest carries no foldsByClass — the ` +
          `derived-4d and holdout-cycle tranches were selected on per-class folds`,
      );
    }
    const folds = foldWindowsByClass(manifest.foldsByClass, `${path} foldsByClass`);
    const key = stableStringify(folds);
    if (classFolds === null) {
      classFolds = folds;
      classFoldsKey = key;
    } else if (key !== classFoldsKey) {
      throw new Error(
        `${path}: foldsByClass differ from ${input.selection[0].path}'s — two ` +
          `calendars cannot both be the selection calendar`,
      );
    }
  }
  const spans = selectionSpans(input.selection.map((entry) => entry.manifest));

  // The record's own consistency, before any market is stated: a frozen
  // pick without a confirm row, a confirm row without a pick, or a pick
  // and its confirm row naming different variants means the artifacts
  // disagree with each other, and provenance read off a disagreeing record
  // is a guess.
  for (const record of input.tranches) {
    for (const [symbol, pick] of Object.entries(record.picks.finalPicks)) {
      const read = record.confirm.confirmReport[symbol];
      if (!read) {
        throw new Error(
          `${record.tranche}: ${symbol} was frozen but has no confirm-read row — ` +
            `the record cannot say whether it shipped`,
        );
      }
      if (read.variant !== pick.variant) {
        throw new Error(
          `${record.tranche}: ${symbol} frozen as ${pick.variant} but read as ${read.variant}`,
        );
      }
    }
    for (const symbol of Object.keys(record.confirm.confirmReport)) {
      if (!record.picks.finalPicks[symbol]) {
        throw new Error(
          `${record.tranche}: ${symbol} has a confirm-read row but was never frozen`,
        );
      }
    }
  }

  const markets: MarketProvenance[] = [];
  const trancheSummary: Record<TrancheName, TrancheSummary> = {
    "derived-4d": emptyTrancheSummary(),
    "holdout-cycle": emptyTrancheSummary(),
    "totality": emptyTrancheSummary(),
  };
  const multiplyConfirmed: Record<string, TrancheName[]> = {};
  const withinOneDayOfBoundary: string[] = [];

  for (const symbol of roster) {
    const entry = entries.get(symbol)!;
    const assetType = entry.assetType!;
    const symbolOverride = entry.symbolOverride!;
    const derived = Object.keys(symbolOverride).length > 0;
    const r3Class = r3Folds[assetType];
    const span = spans.get(symbol) ?? null;

    const picks: PickProvenance[] = [];
    for (const record of input.tranches) {
      const pick = record.picks.finalPicks[symbol];
      if (!pick) continue;
      const read = record.confirm.confirmReport[symbol];
      const confirmed = (read.confirmTotalDelta ?? 0) > 0;
      const { window } = windowFor(record.selection, assetType, span, classFolds!);
      const overlap = window === null
        ? null
        : overlapDays(selectionAsWindow(window), r3Class.confirm);
      picks.push({
        tranche: record.tranche,
        variant: pick.variant,
        confirmed,
        selectionWindow: window,
        overlapWithR3ConfirmDays: overlap,
      });
      const summary = trancheSummary[record.tranche];
      summary.picksFrozen += 1;
      if (confirmed) summary.picksConfirmed += 1;
      if (overlap !== null && overlap > 0) summary.picksOverlappingR3Confirm += 1;
    }

    const confirmedIn = picks.filter((pick) => pick.confirmed);
    if (confirmedIn.length > 1) {
      multiplyConfirmed[symbol] = confirmedIn.map((pick) => pick.tranche);
    }
    let tranche: TrancheName | null = null;
    let pickVariant: string | null = null;
    let reason: string | undefined;
    let selectionWindow: SelectionWindow | null = null;
    if (confirmedIn.length === 0) {
      reason = derived
        ? "the R3 manifest carries a per-symbol layer but no confirm-read artifact confirms a pick for this market"
        : "no per-symbol layer: the shipped cell is the class row, whose derivation window is not in these artifacts";
    } else {
      const shipped = confirmedIn[confirmedIn.length - 1];
      const differs = derived ? overrideDiffers(symbolOverride, shipped.variant) : [];
      if (!derived) {
        reason = `confirmed positive in ${shipped.tranche} but the R3 manifest carries no per-symbol layer for it`;
      } else if (differs.length > 0) {
        reason = `confirmed in ${shipped.tranche} as ${shipped.variant} but the R3 ` +
          `manifest's per-symbol layer differs on ${differs.join(", ")}`;
      } else {
        tranche = shipped.tranche;
        pickVariant = shipped.variant;
        selectionWindow = shipped.selectionWindow;
        if (selectionWindow === null) {
          const record = input.tranches.find((candidate) => candidate.tranche === shipped.tranche)!;
          reason = windowFor(record.selection, assetType, span, classFolds!).reason;
        }
      }
    }

    const window = selectionWindow === null ? null : selectionAsWindow(selectionWindow);
    const confirmation = selectionWindow === null ? null : confirmationAsWindow(selectionWindow);
    const overlapSelect = window === null ? null : overlapDays(window, r3Class.select);
    const overlapConfirmMs = window === null ? null : overlapMs(window, r3Class.confirm);
    const overlapConfirmationMs = confirmation === null ? null : overlapMs(confirmation, r3Class.confirm);
    // Held back = clear of BOTH the window the cell was selected on and the
    // window it was confirmed on (act 2's refuter: every shipped derived cell
    // read positive on its tranche's confirm fold, which covers 94–99% of
    // R3's; a positive figure for such a cell here is the winner's curse).
    const heldBack = overlapConfirmMs === null || overlapConfirmationMs === null
      ? null
      : overlapConfirmMs === 0 && overlapConfirmationMs === 0;
    const margin = selectionWindow === null
      ? null
      : (r3Class.confirm.startMs - selectionWindow.selectEndMs) / DAY_MS;
    if (margin !== null && Math.abs(margin) < 1) withinOneDayOfBoundary.push(symbol);

    const market: MarketProvenance = {
      symbol,
      assetType,
      shippedVariant: "baseline",
      derived,
      tranche,
      ...(reason === undefined ? {} : { reason }),
      pickVariant,
      symbolOverride,
      picks,
      selectionSpan: span,
      selectionWindow,
      r3SelectWindow: r3Class.select,
      r3ConfirmWindow: r3Class.confirm,
      overlapWithR3SelectDays: overlapSelect,
      overlapWithR3ConfirmDays: overlapConfirmMs === null ? null : overlapConfirmMs / DAY_MS,
      confirmationWindow: confirmation,
      overlapWithR3ConfirmDaysFromConfirmation: overlapConfirmationMs === null
        ? null
        : overlapConfirmationMs / DAY_MS,
      marginToR3ConfirmDays: margin,
      heldBack,
    };
    if (globalFolds) {
      const globalOverlapMs = window === null ? null : overlapMs(window, globalFolds.confirm);
      const globalConfirmationMs = confirmation === null ? null : overlapMs(confirmation, globalFolds.confirm);
      market.r3GlobalConfirmWindow = globalFolds.confirm;
      market.overlapWithGlobalConfirmDays = globalOverlapMs === null ? null : globalOverlapMs / DAY_MS;
      // The same rule against the global fold: clear of both windows.
      market.heldBackFromGlobal = globalOverlapMs === null || globalConfirmationMs === null
        ? null
        : globalOverlapMs === 0 && globalConfirmationMs === 0;
    }
    markets.push(market);

    if (tranche !== null) {
      const summary = trancheSummary[tranche];
      summary.shipped += 1;
      if (heldBack === true) summary.shippedHeldBack += 1;
      else if (heldBack === false) summary.shippedNotHeldBack += 1;
      else summary.shippedUndeterminable += 1;
    }
  }

  const derivedCount = markets.filter((market) => market.derived).length;
  const summary = {
    markets: markets.length,
    derived: derivedCount,
    notDerived: markets.length - derivedCount,
    tranches: trancheSummary,
    shippedDerivedCells: markets.filter((market) => market.tranche !== null).length,
    heldBack: markets.filter((market) => market.heldBack === true).length,
    notHeldBack: markets.filter((market) => market.heldBack === false).length,
    undeterminable: markets.filter((market) => market.heldBack === null).length,
    undeterminableDerived: markets.filter((market) => market.derived && market.heldBack === null).length,
    ...(globalFolds
      ? {
        heldBackFromGlobal: markets.filter((market) => market.heldBackFromGlobal === true).length,
        notHeldBackFromGlobal: markets.filter((market) => market.heldBackFromGlobal === false).length,
      }
      : {}),
    multiplyConfirmed,
    withinOneDayOfBoundary,
    reasons: Object.fromEntries(
      markets.filter((market) => market.reason !== undefined)
        .map((market) => [market.symbol, market.reason]),
    ),
  };

  return {
    generatedAt: new Date().toISOString(),
    rule:
      "heldBack = the shipped cell's selection window [fitStartMs, selectEndMs) AND its " +
      "confirmation window (the tranche's confirm fold, or the re-cut's last quarter) both " +
      "share zero days with the R3 per-class confirm fold [startMs, endMs]; null where the " +
      "shipped cell's windows are not derivable from these inputs (no per-symbol layer, or a " +
      "record that does not state the cell). A shipped derived cell exists because it read " +
      "positive on its confirmation window, so a later fold overlapping those dates is " +
      "survivor-selected: for a cell that is not held back only a confirmed-negative confirm " +
      "figure is admissible (R4 act 2, review rows D2(a) and the diff refuter's item 5).",
    trancheRule:
      "a market's shipped derived cell is the LAST tranche (derived-4d, holdout-cycle, " +
      "totality) whose confirm read is positive for it (tests/calibrationState.test.ts); " +
      "its pick must match the R3 manifest's symbolOverride field for field, or the " +
      "tranche is null with the reason stated.",
    recut:
      "totality selection window = the market's own 15min span re-cut at " +
      "fitEnd = first + (last - first) * 0.5, selectEnd = first + (last - first) * 0.75 " +
      "(grid-totalr --per-market-folds arithmetic, copied); derived-4d and holdout-cycle " +
      "selection window = the selection manifests' per-class fit+select folds.",
    clockNote:
      "the selection manifests were stamped under the pre-R0 clock and carry no clock " +
      "block; the R3 manifests carry venue-wall-utc-v4. Fold boundaries between the two " +
      "differ by hours, so a margin under one day is listed in withinOneDayOfBoundary " +
      "rather than trusted.",
    figuresNote:
      "the 4d artifacts' expectancy figures rest on the invalidated 2026-08-11 corpus; " +
      "none is copied here — only pick membership, confirm-read sign and calendars.",
    inputs: {
      r3: {
        path: r3Path,
        manifestHash: r3.manifestHash,
        analyzerVersion: r3.analyzerVersion ?? null,
        clock: r3.clock ?? null,
        requestedSymbols: roster.length,
        holdoutSymbols: Array.isArray(r3.holdoutSymbols) ? r3.holdoutSymbols.length : null,
      },
      r3Global: input.r3Global
        ? {
          path: input.r3Global.path,
          manifestHash: input.r3Global.manifest.manifestHash,
          analyzerVersion: input.r3Global.manifest.analyzerVersion ?? null,
        }
        : null,
      picks: input.tranches.map((record) => ({
        tranche: record.tranche,
        picksFile: TRANCHES.find((entry) => entry.tranche === record.tranche)!.picks,
        confirmFile: TRANCHES.find((entry) => entry.tranche === record.tranche)!.confirm,
        analyzerVersion: record.picks.analyzerVersion ?? null,
        frozenAt: record.picks.frozenAt ?? null,
        readAt: record.confirm.readAt ?? null,
        selection: record.selection,
      })),
      selection: input.selection.map(({ path, manifest }) => ({
        path,
        manifestHash: manifest.manifestHash,
        analyzerVersion: manifest.analyzerVersion ?? null,
        generatedAt: manifest.generatedAt ?? null,
        clock: manifest.clock ?? null,
        symbols: manifest.symbols?.length ?? 0,
      })),
    },
    windows: {
      r3ByClass: r3Folds,
      r3Global: globalFolds,
      selectionByClass: classFolds,
    },
    summary,
    markets,
  };
}

function emptyTrancheSummary(): TrancheSummary {
  return {
    picksFrozen: 0,
    picksConfirmed: 0,
    picksOverlappingR3Confirm: 0,
    shipped: 0,
    shippedHeldBack: 0,
    shippedNotHeldBack: 0,
    shippedUndeterminable: 0,
  };
}

function day(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function formatTable(body: Record<string, unknown>): string {
  const markets = body.markets as MarketProvenance[];
  const summary = body.summary as ReturnType<typeof buildProvenance>["summary"] & {
    markets: number;
    derived: number;
    notDerived: number;
    tranches: Record<TrancheName, TrancheSummary>;
    shippedDerivedCells: number;
    heldBack: number;
    notHeldBack: number;
    undeterminable: number;
    undeterminableDerived: number;
    heldBackFromGlobal?: number;
    notHeldBackFromGlobal?: number;
    multiplyConfirmed: Record<string, TrancheName[]>;
    withinOneDayOfBoundary: string[];
    reasons: Record<string, string>;
  };
  const lines: string[] = [];
  lines.push(
    `${"market".padEnd(10)} ${"class".padEnd(12)} ${"tranche".padEnd(14)} ` +
      `${"selection window".padEnd(25)} ${"confirm ovl".padStart(11)} ` +
      `${"margin".padStart(9)}  held back`,
  );
  for (const market of markets) {
    const window = market.selectionWindow === null
      ? "—"
      : `${day(market.selectionWindow.fitStartMs)} → ${day(market.selectionWindow.selectEndMs)}`;
    const overlap = market.overlapWithR3ConfirmDays === null
      ? "—"
      : `${market.overlapWithR3ConfirmDays.toFixed(1)}d`;
    const margin = market.marginToR3ConfirmDays === null
      ? "—"
      : `${market.marginToR3ConfirmDays >= 0 ? "+" : ""}${market.marginToR3ConfirmDays.toFixed(1)}d`;
    const held = market.heldBack === null
      ? `n/a — ${market.reason ?? "no reason recorded"}`
      : market.heldBack
      ? "yes"
      : "NO";
    lines.push(
      `${market.symbol.padEnd(10)} ${market.assetType.padEnd(12)} ` +
        `${(market.tranche ?? "—").padEnd(14)} ${window.padEnd(25)} ` +
        `${overlap.padStart(11)} ${margin.padStart(9)}  ${held}`,
    );
  }
  lines.push("");
  lines.push(
    `${summary.markets} markets · ${summary.derived} carry a per-symbol layer · ` +
      `${summary.shippedDerivedCells} shipped derived cells attributed to a tranche`,
  );
  for (const [tranche, counts] of Object.entries(summary.tranches)) {
    lines.push(
      `  ${tranche.padEnd(14)} picks frozen ${counts.picksFrozen}, confirmed ` +
        `${counts.picksConfirmed}, picks whose selection window overlaps R3's confirm ` +
        `fold ${counts.picksOverlappingR3Confirm}; shipped ${counts.shipped}: held back ` +
        `${counts.shippedHeldBack}, NOT held back ${counts.shippedNotHeldBack}, ` +
        `undeterminable ${counts.shippedUndeterminable}`,
    );
  }
  lines.push(
    `  held back ${summary.heldBack} · not held back ${summary.notHeldBack} · ` +
      `undeterminable ${summary.undeterminable} (${summary.undeterminableDerived} of them derived)`,
  );
  if (summary.heldBackFromGlobal !== undefined) {
    lines.push(
      `  against the global confirm fold: held back ${summary.heldBackFromGlobal} · ` +
        `not held back ${summary.notHeldBackFromGlobal}`,
    );
  }
  const multiply = Object.entries(summary.multiplyConfirmed);
  if (multiply.length > 0) {
    lines.push(
      `  confirmed in more than one tranche (later wins): ${
        multiply.map(([symbol, tranches]) => `${symbol} (${tranches.join(" → ")})`).join(", ")
      }`,
    );
  }
  if (summary.withinOneDayOfBoundary.length > 0) {
    lines.push(
      `  within one day of the confirm boundary (clock note applies): ${
        summary.withinOneDayOfBoundary.join(", ")
      }`,
    );
  }
  return lines.join("\n");
}

const VALUE_FLAGS = new Set([
  "--r3",
  "--r3-global",
  "--picks-dir",
  "--selection-manifest",
  "--out",
]);

function main(): void {
  const argv = process.argv.slice(2);
  // Every token is either a declared flag, that flag's value, or refused by
  // name. This reader takes no positional argument, so a stray token is a
  // typo, and an undeclared flag is the failure flagReader's header names
  // that flagReader itself cannot catch: its guard fires when the SCRIPT
  // reads an undeclared flag, never when the OPERATOR types one. A declared
  // flag's next token is consumed only when it is a usable value — the
  // shared predicate decides — so a flag-shaped or blank value is left for
  // flagReader to refuse in its own words rather than reported as a stray.
  const undeclared: string[] = [];
  const stray: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    if (VALUE_FLAGS.has(argv[index])) {
      if (tokenFault(argv[index + 1]) === null) index += 1;
      continue;
    }
    if (/^-{1,2}[A-Za-z]/.test(argv[index])) undeclared.push(argv[index]);
    else stray.push(argv[index]);
  }
  if (undeclared.length > 0) {
    throw new OperatorInputError(
      `unknown flag(s) ${undeclared.join(", ")} — this reader declares ${
        [...VALUE_FLAGS].sort().join(", ")
      }. Refused rather than ignored: an unrecognised flag's next token would ` +
        `be read as something else entirely, or silently leave an input unread.`,
    );
  }
  const { str } = flagReader(argv, VALUE_FLAGS);
  // Each flag is read by its literal name — the flag law derives the
  // declared-and-read pairing from these calls. No input has a default: a
  // run over inputs nobody named states provenance for nothing.
  const r3Path = str("--r3");
  const picksDir = str("--picks-dir");
  const selectionList = str("--selection-manifest");
  const outPath = str("--out");
  const globalPath = str("--r3-global");
  const missing = [
    ["--r3", r3Path, "the R3 per-class-folds manifest"],
    ["--picks-dir", picksDir, "the directory holding the 4d picks and confirm-read artifacts"],
    ["--selection-manifest", selectionList, "the 4c manifest(s) the tranches were selected on, comma-separated"],
    ["--out", outPath, "the artifact path to write"],
  ].filter(([, value]) => value === undefined);
  if (missing.length > 0) {
    throw new OperatorInputError(
      missing.map(([arg, , what]) => `${arg} is required — pass ${what}`).join("; ") +
        "; this reader has no default input, because a run over inputs nobody " +
        "named states provenance for nothing",
    );
  }
  if (stray.length > 0) {
    throw new OperatorInputError(
      `unexpected argument(s) ${stray.join(", ")} — this reader takes no ` +
        `positional path; name every input by its flag (${
          [...VALUE_FLAGS].sort().join(", ")
        })`,
    );
  }
  const selectionPaths = selectionList!.split(",").map((path) => path.trim())
    .filter((path) => path.length > 0);
  if (selectionPaths.length === 0) {
    throw new OperatorInputError("--selection-manifest named no path");
  }

  // Every input is read and validated before anything is written.
  const body = buildProvenance({
    r3: { path: r3Path!, manifest: readVerifiedManifest(r3Path!) },
    ...(globalPath === undefined
      ? {}
      : { r3Global: { path: globalPath, manifest: readVerifiedManifest(globalPath) } }),
    tranches: readTranches(picksDir!),
    selection: selectionPaths.map((path) => ({ path, manifest: readVerifiedManifest(path) })),
  });

  console.log(formatTable(body));
  if (!existsSync(dirname(outPath!))) mkdirSync(dirname(outPath!), { recursive: true });
  writeResearchArtifact(outPath!, body);
  console.log(`\nwrote ${outPath}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    main();
  } catch (error: unknown) {
    // An operator's mistake prints one line; anything else keeps its stack.
    if (error instanceof OperatorInputError) {
      console.error(error.message);
    } else {
      console.error(error);
    }
    process.exit(1);
  }
}
