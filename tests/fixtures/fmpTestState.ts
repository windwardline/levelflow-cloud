// Temporary FMP state for tests. Built by hand rather than through the
// production path helper, so no test can reach this machine's live ledger or
// breaker by accident: tests/fmpGovernor.test.ts fails if any test file names
// that helper outside its one resolution assertion.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { FmpStatePaths } from "../../scripts/fmpState.ts";
import { scratchDir } from "../support/scratchDir.ts";

/** Provider refusal bodies as FMP actually sent them. */
export const BODIES = {
  // ~/Library/Logs/levelflow-minute-bank.log, 2026-09-07, after four days of it.
  restricted:
    "HTTP 402 Restricted Endpoint: This endpoint is not available under " +
    "your current subscription please visit our subscription page to " +
    "upgrade your plan at https://financialmodelingprep.com/",
  // function_logs, 2026-08-31.
  bandwidth:
    '{\n  "Error Message": "Bandwidth Limit Reach . Please upgrade your ' +
    "plan or visit our documentation for more details at " +
    'https://site.financialmodelingprep.com/"\n}',
  // ~/Library/Logs/levelflow-minute-bank.log lines 2426-2428, 2026-09-08T23:20:01Z.
  suspended:
    'HTTP 403 {\n  "Error Message": "Account suspended. Please contact ' +
    'info@financialmodelingprep.com more details."\n}',
  // A PREFIX, not the whole body: analyzer_events.message for the 13
  // news_calendar_sync rows of 2026-08-18 is cut at 258 characters by the Edge
  // function, and the full 401 body has never been captured.
  invalidKeyStoredPrefix:
    "news-calendar sync failed: Error: FMP economic calendar request failed " +
    '(401): {\n  "Error Message": "Invalid API KEY. Feel free to create a ' +
    "Free API Key or visit https://site.financialmodelingprep.com/faqs?" +
    "search=why-is-my-api-key-invalid for more information",
} as const;

/** The provider's own part of the stored 401 prefix, as a response body would carry it. */
export const INVALID_KEY_BODY_PREFIX = BODIES.invalidKeyStoredPrefix.slice(
  BODIES.invalidKeyStoredPrefix.indexOf("{"),
);

export function tempState(
  options: { sentinel?: boolean; legacyUsage?: unknown; legacyCircuit?: string } = {},
): FmpStatePaths {
  const root = scratchDir("fmp-test-state-");
  const state: FmpStatePaths = {
    breakerDir: join(root, "state", "breaker"),
    canonicalBankDir: join(root, "bank"),
    legacyCircuitPath: join(root, "legacy-circuit.json"),
    legacyUsagePath: join(root, "legacy-usage.json"),
    runsDir: join(root, "state", "runs"),
    usageDir: join(root, "state", "usage"),
  };
  if (options.sentinel !== false) {
    mkdirSync(state.usageDir, { recursive: true });
    writeFileSync(join(state.usageDir, "ledger.json"), "{}\n");
  }
  if (options.legacyUsage !== undefined) {
    writeFileSync(state.legacyUsagePath, JSON.stringify(options.legacyUsage));
  }
  if (options.legacyCircuit !== undefined) {
    writeFileSync(state.legacyCircuitPath, options.legacyCircuit);
  }
  return state;
}
