export function cleanReviewMessage(value: string) {
  return value
    .replace(/No clear direction passed review: buy \d+(?:\.\d+)?, sell \d+(?:\.\d+)?, block \d+(?:\.\d+)?\./i, "The chart did not show a clear enough direction.")
    .replace(/The current (buy|sell) setup scored (\d+); LevelFlow requires (\d+) or higher for this market\./i, (_match, side: string, score: string, threshold: string) => `The ${side.toLowerCase()} case reached ${score}/100. This market needs ${threshold}/100 or higher.`)
    .replace(/Payoff was ([0-9.]+)x; LevelFlow requires at least ([0-9.]+)x for this market\./i, (_match, payoff: string, required: string) => `The target was not far enough from the entry to justify the risk (${payoff}x payoff; ${required}x required).`)
    .replace(/Limit entry failed price validation, so no limit(?:-order)? setup was shown\./i, "A valid limit entry was not available at the current price.")
    .replace(/Fewer than three review timeframes were available from the provider\./i, "Some chart intervals are missing, so LevelFlow is waiting for better coverage.")
    .replace(/\d+ major scheduled event(?:s)? reduced setup quality\./i, "Upcoming scheduled news reduced timing quality.")
    .replace(/Estimated spread and slippage reduced the setup score by (\d+)\./i, (_match, penalty: string) => `Trading costs reduced the score by ${penalty}.`)
    .replace(/reduced confidence\./gi, "reduced timing quality.")
    .replace(/FMP/gi, "The chart feed")
    .replace(/provider/gi, "chart feed")
    .replace(/analyzer confidence/gi, "review")
    .replace(/analyzer/gi, "LevelFlow")
    .replace(/Correlation filter kept existing ([A-Z0-9]+) setup with equal or higher confidence\./i, "A related market already has a stronger current setup.")
    .replace(/did not return enough bars for this instrument\./i, "does not have enough recent chart history for this market yet.")
    .replace(/Not enough .* daily bars returned for review\./i, "The chart feed does not have enough daily history for this market yet.")
    .replace(/setup family/gi, "pattern")
    .replace(/resolved outcomes/gi, "finished setups")
    .replace(/reward-to-risk/gi, "payoff")
    .replace(/ATR/gi, "volatility")
    .replace(/liquidity/gi, "price levels")
    .replace(/\s+/g, " ")
    .trim();
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

export function formatStrategyName(value: string) {
  return value
    .replace(/_/g, " ")
    .replace(/\bATR\b/gi, "Volatility")
    .replace(/\bRsi\b/g, "Momentum")
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .trim();
}
