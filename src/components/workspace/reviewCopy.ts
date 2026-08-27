/**
 * Engine sentences, rewritten into the reader's voice.
 *
 * WHY THE RULES ARE DATA. These were a chain of `.replace()` calls, and a
 * chain cannot be asked which of its links still matches anything. Three had
 * already rotted against an engine that moved on, and the most costly one was
 * the market decline: its pattern demanded a numeric `-0.12R`, the analyzer
 * had stopped emitting the magnitude on purpose (SC-5, the 2026-08-11 clock
 * defect), and so the branch silently stopped firing and the RAW engine
 * sentence went to the reader on all 15 declined markets.
 *
 * Nothing failed. A dead rewrite reads exactly like a rewrite whose input
 * never occurs, which is the same shape as every other defect this repo has
 * spent the week removing: a rule applied to a population it was not derived
 * for, with no mechanism to notice it going stale.
 *
 * `tests/reviewCopyCoupling.test.ts` is that mechanism. It extracts the
 * sentences the analyzer can actually emit from the analyzer's own source,
 * then deletes each rule in turn and requires the rendered corpus to change.
 * A rule that claims nothing is a failure, not a spare.
 */
export type ReviewRewrite = {
  pattern: RegExp;
  to: string | ((substring: string, ...args: string[]) => string);
};

/**
 * Applied IN ORDER, and the order is load-bearing: the vocabulary swaps near
 * the end operate on sentences the specific rules above them have already
 * reshaped. `Not enough FMP daily bars returned for analyzer confidence.`
 * only reaches its plain-language rule after `FMP` and `analyzer confidence`
 * have been swapped out from under it.
 */
export const REVIEW_REWRITES: ReviewRewrite[] = [
  {
    pattern:
      /No clear direction passed review: buy \d+(?:\.\d+)?, sell \d+(?:\.\d+)?, block \d+(?:\.\d+)?\./i,
    to: "The chart did not show a clear enough direction.",
  },
  {
    pattern:
      /The current (buy|sell) setup scored (\d+); Levelflow requires (\d+) or higher for this market\./i,
    to: (_match, side: string, score: string, threshold: string) =>
      `The ${side.toLowerCase()} case reached ${score}/100. This market needs ${threshold}/100 or higher.`,
  },
  {
    // The decline. Matched WITHOUT a number, because the analyzer withholds
    // the magnitude deliberately: every `measuredExpectancyR` in the register
    // comes from the corpus the clock defect invalidated, so quoting it to
    // three decimals would publish a false precision. The direction survives
    // and is the whole reason for the decline.
    //
    // The wording tracks the no-trade gate's own sentence in
    // trade-analyzer/index.ts, so a market declined at either gate says the
    // same thing to the reader.
    pattern:
      /Levelflow does not produce setups for this market: its own measured record is negative after the venue's published costs\.\s*(.*)$/i,
    to: (_match, reprobe: string) =>
      `Levelflow's measured record says this market does not earn setups after the venue's costs. ${reprobe}`
        .trim(),
  },
  {
    pattern:
      /Payoff was ([0-9.]+)x; Levelflow requires at least ([0-9.]+)x for this market\./i,
    to: (_match, payoff: string, required: string) =>
      `The target was not far enough from the entry to justify the risk (${payoff}x payoff; ${required}x required).`,
  },
  {
    pattern:
      /Trading costs took the payoff from ([0-9.]+)x to ([0-9.]+)x; Levelflow requires at least ([0-9.]+)x for this market\./i,
    to: (_match, gross: string, net: string, required: string) =>
      `Trading costs took the payoff from ${gross}x to ${net}x (${required}x required).`,
  },
  {
    pattern:
      /The live market has already crossed the computed limit entry, so the setup was withheld rather than shown as a resting order\./i,
    to:
      "Price moved through the planned entry before the setup could be shown, so Levelflow held it back rather than show a stale order.",
  },
  {
    pattern:
      /Limit entry failed price validation, so no limit(?:-order)? setup was shown\./i,
    to: "A valid limit entry was not available at the current price.",
  },
  {
    pattern:
      /Fewer than three review timeframes were available from the provider\./i,
    to: "Some chart intervals are missing, so Levelflow is waiting for better coverage.",
  },
  {
    pattern:
      /Estimated (?:spread and slippage|trading costs) reduced the setup score by (\d+)\./i,
    to: (_match, penalty: string) => `Trading costs reduced the score by ${penalty}.`,
  },
  { pattern: /reduced confidence\./gi, to: "reduced timing quality." },
  { pattern: /FMP/gi, to: "The chart feed" },
  { pattern: /analyzer confidence/gi, to: "review" },
  {
    // Reads as a clause because `FMP` above has already become "The chart
    // feed"; saying "chart history" again here stuttered.
    pattern: /did not return enough bars for this instrument\./i,
    to: "does not have enough recent history for this market yet.",
  },
  {
    pattern: /Not enough .* daily bars returned for review\./i,
    to: "The chart feed does not have enough daily history for this market yet.",
  },
];

/**
 * Rules deleted rather than kept as spares, each because the corpus test
 * proved it claims nothing the analyzer says:
 *
 *   /\d+ major scheduled event(s)? reduced setup quality./  the analyzer now
 *     says "A major scheduled event is active for this market.", already plain
 *   /Correlation filter kept existing X setup.../  the analyzer emits the
 *     reader-facing wording directly, and the rule that rewrote that wording
 *     to itself went with it
 *   /provider/, /analyzer/  the sentences carrying them are replaced whole by
 *     rules above, so these swapped nothing
 *   /setup family/, /resolved outcomes/, /reward-to-risk/  no emitter
 *   /ATR/  handled by formatStrategyName, which is a different surface
 *   /liquidity/ -> "price levels"  the ONE sentence carrying it is "Late
 *     Friday liquidity conditions reduce setup quality.", which the swap
 *     turned into "Late Friday price levels conditions" — a blanket noun swap
 *     inside a compound modifier. The reader here trades for a living and
 *     liquidity is their word, so the sentence is better left alone.
 */

export function applyRewrites(
  value: string,
  rules: readonly ReviewRewrite[] = REVIEW_REWRITES,
) {
  return rules
    .reduce(
      (text, rule) =>
        text.replace(rule.pattern, rule.to as string & ((...args: string[]) => string)),
      value,
    )
    // Normalisation, not a rewrite: it collapses the whitespace the engine's
    // concatenated sentences leave behind. Deliberately outside the rule list,
    // since it is a legitimate no-op on most inputs and the coupling test
    // requires every RULE to change something.
    .replace(/\s+/g, " ")
    .trim();
}

export function cleanReviewMessage(value: string) {
  return applyRewrites(value);
}

export function uniqueReviewMessages(values: string[]) {
  return Array.from(
    new Set(
      values
        .filter(Boolean)
        .map(cleanReviewMessage)
        .filter((value) => value.length > 0),
    ),
  );
}

// Plain-language gloss for the execution-quality labels so "Thin" or
// "Poor" never appears without an explanation of what it costs the trader.
const EXECUTION_LABEL_DESCRIPTIONS: Record<string, string> = {
  Clean:
    "Trading costs (spread, slippage, and commission) are a small fraction of the risk.",
  Acceptable: "Trading costs are noticeable but leave the payoff intact.",
  Thin:
    "Trading costs eat a meaningful share of the payoff — consider smaller size or better pricing.",
  Poor:
    "Trading costs are high relative to this setup's risk; the payoff after costs is weak.",
};

export function describeExecutionLabel(label: string | null | undefined) {
  return (label && EXECUTION_LABEL_DESCRIPTIONS[label]) ??
    "Trading costs were checked against what the setup risks.";
}

export function formatStrategyName(value: string) {
  return value
    .replace(/_/g, " ")
    .replace(/\bATR\b/gi, "Volatility")
    .replace(/\bRsi\b/g, "Momentum")
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .trim();
}
