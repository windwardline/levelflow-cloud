import type { BrokerClassification, BrokerPlatform } from "../profile";
import { getProgramLine, PROGRAM_LINES, type ProgramLineSpec } from "./programs";
import type { ProgramLine } from "./types";

// §20i ruling 7. The configuration is a catalog, not a form: every option here
// is transcribed from the verified purchase-screen record
// (docs/research/e8-purchase-screen-2026-08-02.md — three market walks,
// twenty-nine frames). No free-form numeric entry exists, and no selectable
// combination may exist that the checkout does not sell.
//
// The walk, in order (amendment 14): broker -> market -> program line ->
// platform -> balance tier -> drawdown token where E8 sells a choice. The
// futures lines' single EOD option is auto-set, never asked (ruling 7).

/** §20j: the three market names, E8's own, and already this app's SecurityType labels. */
export const CLASSIFICATIONS: { label: string; value: BrokerClassification }[] = [
  { label: "Forex", value: "forex" },
  { label: "Crypto", value: "crypto" },
  { label: "Futures", value: "futures" },
];

/** §20j: the platform names as the checkout prints them. */
export const PLATFORM_LABELS: Record<BrokerPlatform, string> = {
  matchtrader: "MatchTrader",
  tradelocker: "TradeLocker",
  tradovate: "Tradovate",
};

const CLASSIFICATION_OF: Record<ProgramLine, BrokerClassification> = {
  one: "forex",
  one_crypto: "crypto",
  pro_forex: "forex",
  pro_crypto: "crypto",
  signature_forex: "forex",
  signature_crypto: "crypto",
  signature_futures: "futures",
  // The Futures walk sells Zero MAX and Zero Starter; the Forex and Crypto
  // walks sell no Zero at all ("No E8 Zero (futures-only)"). Amendment 19:
  // the checkout record rules, so `zero` — classified forex per its
  // `cfd_forex` family — is unsold, and programLinesFor never returns it.
  // The record stays (amendment 13); the walk simply never reaches it.
  zero: "forex",
  zero_futures_starter: "futures",
  zero_futures_max: "futures",
};

// The Forex walk: E8 One offers MatchTrader AND TradeLocker; Pro and Signature
// offer TradeLocker only. The Crypto walk: TradeLocker only on every line, One
// included — MatchTrader is forex-One-only. The Futures walk: Tradovate only.
const PLATFORMS_OF: Record<ProgramLine, BrokerPlatform[]> = {
  one: ["tradelocker", "matchtrader"],
  one_crypto: ["tradelocker"],
  pro_forex: ["tradelocker"],
  pro_crypto: ["tradelocker"],
  signature_forex: ["tradelocker"],
  signature_crypto: ["tradelocker"],
  signature_futures: ["tradovate"],
  zero: ["tradelocker"],
  zero_futures_starter: ["tradovate"],
  zero_futures_max: ["tradovate"],
};

export function classificationOf(line: ProgramLine): BrokerClassification {
  return CLASSIFICATION_OF[line];
}

export function programLinesFor(
  classification: BrokerClassification,
): ProgramLineSpec[] {
  // Amendment 19: `zero` is on no checkout walk, so no walk offers it.
  return PROGRAM_LINES.filter(
    (program) =>
      program.line !== "zero" &&
      CLASSIFICATION_OF[program.line] === classification,
  );
}

export function platformsFor(line: ProgramLine): BrokerPlatform[] {
  return PLATFORMS_OF[line];
}

/**
 * Amendment 12, the owner's own proposal: platform is an option wherever a line
 * has more than one, with MatchTrader present but disabled until Levelflow has
 * verified a frame on it. Feed identity is per-platform
 * (docs/research/e8-feed-verification-2026-08-02.md, open item 4), so an
 * unverified platform cannot carry a sizing claim.
 */
export function isPlatformVerified(platform: BrokerPlatform): boolean {
  return platform !== "matchtrader";
}

/** `zero` appears on no purchase-screen walk. Greyed until the owner rules. */
export function isProgramLineVerified(line: ProgramLine): boolean {
  return getProgramLine(line) !== null && line !== "zero";
}
