import { visibleAssetSymbols } from "../../lib/broker/visibility";
import { marketAvailability } from "../../lib/marketHours";
import type { BrokerAccount } from "../../lib/profile";
import {
  AVAILABLE_ASSET_GROUPS,
  AVAILABLE_ASSET_SYMBOLS,
  getSecurityOption,
  normalizeSymbol,
  type SupportedSymbol,
} from "../../lib/symbolMap";
import type { MarketScanCandidate } from "../../lib/tradeAnalyzer";
import type { ScanScope } from "./ScopeMenu";

function normalizeAssetType(value: string) {
  return value.toLowerCase().replace(/[^a-z]/g, "");
}

// Scope-aware market-scan filtering, keyed on ScopeMenu.tsx's ScanScope
// (which adds a "symbol" kind alongside "all" and per-group scoping).
//
// §19 retrofit, Task 9 (amendment 13): intersected with
// visibleAssetSymbols(account), the same table Task 8 put behind the scope
// menu — so the scan action itself can never REQUEST a market this account
// cannot trade, menu-visible or not. A named symbol/group scope the account
// hides resolves to an empty list rather than a hidden market slipping
// through: both Scan buttons already disable at length === 0 (AdvisorWorkspace,
// MarketScanPanel), so this is what disables them for an all-hidden scope
// rather than a new string doing it (spec §17f). visibleAssetSymbols(null)
// returns every symbol, so this is a no-op with no active account.
export function getMarketScanSymbolsForScope(
  scope: ScanScope,
  account: BrokerAccount | null,
): SupportedSymbol[] {
  const visible = new Set(visibleAssetSymbols(account));
  if (scope.kind === "all") {
    return AVAILABLE_ASSET_SYMBOLS.filter((symbol) => visible.has(symbol));
  }
  if (scope.kind === "symbol") {
    return visible.has(scope.symbol) ? [scope.symbol] : [];
  }
  return (AVAILABLE_ASSET_GROUPS.find((group) => group.label === scope.assetType)
    ?.options.map((option) => option.symbol) ?? [])
    .filter((symbol) => visible.has(symbol));
}

// Defensive, not strictly load-bearing today: AdvisorWorkspace's selectScope
// clears the result whenever scope changes, so a completed scan's candidates
// already match the current scope by construction. (The reset used to live in
// MarketScanPanel, which this comment named until the scope moved up to the
// workspace for §17e's merged mobile surface.) This still
// guards the case where scope changes while a scan is in flight and an
// earlier request's response lands after a narrower scope is selected.
// m3: no longer also filters by a minimum-confidence band — the rail's
// legacy Quality filter is retired (spec §5 has none), since letting a
// client-side band hide rows made the visible list disagree with the
// server-truth scanned/qualified count line.
//
// §19 retrofit, Task 9 (amendment 13): also intersected with
// visibleAssetSymbols(account) — NOT redundant with AdvisorWorkspace's
// scope-reset effect above. That effect only fires for a named group/symbol
// scope the new account hides, and deliberately leaves scope "all" alone
// (every account can see *something*, so "all" is never itself invalid). A
// scan completed under one account can therefore still be sitting in
// scanResult, under scope "all", after a switch to an account of a
// different classification — this intersection is what keeps its
// now-untradeable rows from rendering. visibleAssetSymbols(null) returns
// every symbol, so this is a no-op with no active account.
export function filterMarketScanCandidatesByScope(
  candidates: MarketScanCandidate[],
  scope: ScanScope,
  account: BrokerAccount | null,
) {
  const visible = new Set(visibleAssetSymbols(account));
  return candidates.filter((candidate) =>
    matchesScanScope(candidate, scope) && visible.has(candidate.symbol)
  );
}

// I5: the scan must never ask the server to attempt a market that's
// currently closed. (1e corrected this header's old premise: the engine
// DOES have calendar awareness of its own — trade-analyzer/sessions.ts
// gates every review — so this filter is the request-saving half, not the
// only guard, and tests/sessionCalendarParity.test.ts pins the two
// calendars to each other so what this skips and what the server refuses
// are one fact.) Applied uniformly to every scope including "all". "All" used to send an empty symbol list and let the
// server fall back to its own curated default universe
// (supabase/functions/trade-analyzer/symbols.ts's defaultScanSymbols) -
// that curation already excludes the same no-trade/temporarily-unavailable
// symbols AVAILABLE_ASSET_OPTIONS does client-side, so resolving "all" to
// that same explicit list and filtering it here loses nothing while
// finally letting closed markets drop out of it too. The server's own
// `scanned` count (normalizedSymbols.length) then reflects exactly this
// list's length - only markets actually attempted.
//
// That empty-list form is now refused rather than merely unused: one request
// covering every market is what exceeded the 2s CPU budget in production, so
// the list this returns is what src/lib/scanBatching.ts splits into
// request-sized chunks.
export function filterSymbolsByAvailability(
  symbols: SupportedSymbol[],
  now: Date,
): SupportedSymbol[] {
  return symbols.filter((symbol) => {
    const { assetType } = getSecurityOption(symbol);
    return marketAvailability(assetType, symbol, now).open;
  });
}

function matchesScanScope(
  candidate: MarketScanCandidate,
  scope: ScanScope,
): boolean {
  if (scope.kind === "all") {
    return true;
  }
  if (scope.kind === "symbol") {
    return normalizeSymbol(candidate.symbol) === normalizeSymbol(scope.symbol);
  }
  return normalizeAssetType(candidate.assetType) ===
    normalizeAssetType(scope.assetType);
}

// Scan rail row meta (design spec §5): "Buy · confidence N" / "Sell ·
// confidence N". Every real opportunity carries both a side and a score, so
// the fallbacks below are defensive, not a documented product state — they
// degrade to what's actually known rather than fabricating either half.
export function formatScanRowMeta(
  side: MarketScanCandidate["side"],
  confidenceScore: MarketScanCandidate["confidenceScore"],
): string {
  if (!side) {
    // Defensive: a candidate always carries a side in practice. The em dash
    // is the app-wide absent-value mark - never a retired verb.
    return "\u2014";
  }
  const sideLabel = side === "buy" ? "Buy" : "Sell";
  return typeof confidenceScore === "number" &&
      Number.isFinite(confidenceScore)
    ? `${sideLabel} · confidence ${Math.round(confidenceScore)}`
    : sideLabel;
}
