// The ad-hoc spend guard (§21j Phase 1).
//
// FMP bills bytes over a trailing 30-day window and publishes no usage
// endpoint, so nothing can ask how much allowance is left — it can only be
// measured on the way past. The replay sweeps exhausted a 150 GB Ultimate
// allowance in days on 2026-08-13 because no code between the command line
// and the provider was able to refuse them. Steady-state Levelflow sits near
// 2% of the same allowance; one sweep campaign is the other 98%.
//
// This is deliberately a guard, not a gate. A script that never imports it
// spends freely — only §21d's chokepoint, which holds the key, can make the
// ad-hoc class unable to overspend. What this buys is a bound on the one
// consumer that has actually caused an outage, for one file and no
// infrastructure.

import { soleFlagIndex } from "./flagReader.ts";

const UNITS: Record<string, number> = {
  b: 1,
  kb: 1024,
  mb: 1024 ** 2,
  gb: 1024 ** 3,
};

export class ByteBudgetExceededError extends Error {
  constructor(readonly limitBytes: number, readonly spentBytes: number) {
    super(
      `FMP byte budget exhausted: ${spentBytes} bytes spent against a ${limitBytes} byte ` +
        `ceiling. Halting before the next fetch. Raise --byte-budget deliberately or ` +
        `narrow the sweep; do not remove the ceiling.`,
    );
    this.name = "ByteBudgetExceededError";
  }
}

export type ByteBudget = {
  record: (bytes: number) => void;
  spent: () => number;
  remaining: () => number;
};

export function createByteBudget(limitBytes: number): ByteBudget {
  // A ceiling that reads as nothing must stop the run rather than quietly
  // meaning "unlimited" — the same law the minute bank carries (#344).
  if (!Number.isFinite(limitBytes) || limitBytes <= 0) {
    throw new Error(
      `Refusing a byte budget that reads as nothing: ${String(limitBytes)}. ` +
        `Declare a positive ceiling in bytes.`,
    );
  }

  let spent = 0;

  return {
    record(bytes: number) {
      // Credit first. These bytes were served before they could be counted,
      // so refusing to record them would under-report real consumption —
      // exactly how an allowance disappears without anyone seeing it. The
      // ceiling stops the NEXT fetch; it cannot un-spend this one.
      spent += bytes;
      if (spent > limitBytes) {
        throw new ByteBudgetExceededError(limitBytes, spent);
      }
    },
    spent: () => spent,
    remaining: () => limitBytes - spent,
  };
}

const encoder = new TextEncoder();

// The single point where a sweep's spend is measured. Reading the body is the
// only moment the real cost is knowable — FMP publishes no usage endpoint, and
// Content-Length is absent on chunked responses.
export async function readJsonWithBudget<T = unknown>(
  response: { text: () => Promise<string> },
  budget: ByteBudget,
): Promise<T> {
  const text = await response.text();
  // Charge before parsing. A payload that halts the run still cost what it
  // cost, and an unparseable one is not free either.
  budget.record(encoder.encode(text).length);
  return JSON.parse(text) as T;
}

export function parseByteBudgetArg(argv: readonly string[]): number {
  // Resolved through the shared step rather than indexOf (#364 round 53,
  // finding 1). This file is exempt from the VALUE_FLAGS law because the
  // size regex below already closes the missing-value and flag-shaped-value
  // modes — but the law lists THREE, and first-occurrence-only was open
  // here: `--byte-budget 2gb --byte-budget 150gb` started under the 2 GB
  // ceiling without a word, on the one dial whose whole reason for
  // existing is that nothing else can refuse an ad-hoc run's spend.
  const flagAt = soleFlagIndex(argv, "--byte-budget");
  const raw = flagAt === -1 ? undefined : argv[flagAt + 1];
  if (raw === undefined) {
    throw new Error(
      `--byte-budget is required. An ad-hoc FMP run declares its ceiling before ` +
        `it starts (e.g. --byte-budget 2gb). See §21j.`,
    );
  }

  const match = /^(\d+(?:\.\d+)?)\s*(b|kb|mb|gb)?$/i.exec(raw.trim());
  if (!match) {
    throw new Error(
      `--byte-budget could not be read: ${raw}. Use bytes or a b/kb/mb/gb suffix.`,
    );
  }

  const scale = UNITS[(match[2] ?? "b").toLowerCase()];
  return Math.floor(Number(match[1]) * scale);
}
