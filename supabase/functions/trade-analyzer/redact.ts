/**
 * A provider error message can carry the request URL, query string and all —
 * on 2026-08-07 nine `quote_fetch` rows landed in `analyzer_events` with the
 * FMP key inside `apikey=` (found and redacted in place 2026-09-14; rotation
 * is owed as a consequence). Applied at every birth site of provider error
 * text in the loader — providerFailures, providerWarnings, the two recorded
 * messages and the rethrow — and again at the telemetry choke point, so no
 * sink this repository writes (analyzer_events, market_data_health, the HTTP
 * response, trade_setups.confluence, the console) receives the value.
 * Values only; the parameter name stays, so the operator still sees which
 * request failed. Deno-free on purpose: the tests project can import it
 * while the loader and telemetry stay Edge-only.
 */
export function redactProviderSecrets(text: string): string {
  return text.replace(/([?&](?:apikey|api_key|token|access_token|key)=)[^&\s)'"]+/gi, "$1REDACTED");
}
