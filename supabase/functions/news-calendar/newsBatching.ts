/**
 * How many symbols may ride in one FMP news request.
 *
 * FMP's news endpoints honour approximately the FIRST 25 symbols of the
 * `symbols` parameter and silently discard the rest, at HTTP 200 with a full
 * hundred articles. There is no error, no truncation notice, and no
 * documentation of the behaviour.
 *
 * MEASURED against the live API on 2026-08-25, not inferred. BTCUSD returns
 * 74 articles at position 25 of a list and ZERO at position 26 of the same
 * list with one symbol inserted ahead of it. The boundary reproduced on the
 * forex endpoint and held across four independent samples taken minutes
 * apart.
 *
 * It was live and it was costing majors. FOREX_NEWS_SYMBOLS carried 28
 * symbols in alphabetical order, so USDCHF and USDJPY sat past the cap and
 * received NO headlines at all — while each returns 100 articles when queried
 * alone. Two of the most news-driven pairs on the roster were scored as
 * though no news about them existed, because of where their names sort.
 */
export const FMP_NEWS_SYMBOL_CAP = 25;

/**
 * Symbols per request. Deliberately BELOW the cap rather than at it: the cap
 * is an undocumented provider behaviour that can tighten without notice, and
 * the price of margin is one extra request an hour.
 */
export const NEWS_SYMBOL_BATCH = 20;

/**
 * Split a symbol list into request-sized batches.
 *
 * Its own module so the guarantee is testable: news-calendar/index.ts reads
 * Deno globals at module top and is deliberately off the test typecheck
 * graph, and widening that graph to reach one function would trade a real
 * boundary for a convenience.
 */
export function batchNewsSymbols(
  symbols: string[],
  size = NEWS_SYMBOL_BATCH,
): string[][] {
  if (size < 1) {
    throw new Error(`batchNewsSymbols: size must be >= 1, got ${size}`);
  }
  const batches: string[][] = [];
  for (let index = 0; index < symbols.length; index += size) {
    batches.push(symbols.slice(index, index + size));
  }
  return batches;
}
