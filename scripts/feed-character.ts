/**
 * feed-character — the daily-containment witness over a calibration cache.
 *
 * For each market, loads the daily store and each requested intraday store
 * from the cache directory, runs `dailyContainment`, and prints the witness:
 * the verdict line and one line per year (days judged, median range ratio,
 * median bar-range ratio, escape share, under share). The tracked copy of
 * this output over the real cache is `docs/research/r3/feed-character.txt`.
 *
 * An absent daily or intraday store is named in the table as ABSENT and in
 * the summary line, and under `--fail-on-escape` it fails the run — never a
 * silent skip, because an absent store reads as a clean one to anyone
 * scanning the table for ESCAPES.
 *
 *   tsx scripts/feed-character.ts [--cache-dir .calibration-cache]
 *     [--symbols roster | A,B,C] [--timeframes 5min[,15min]] [--fail-on-escape]
 *
 * `--fail-on-escape` exits 1 after printing when any store escapes — the
 * form a preflight or a CI gate calls.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { defaultScanSymbols } from "../supabase/functions/trade-analyzer/symbols.ts";
import { resolveProviderSymbols } from "../supabase/functions/trade-analyzer/symbols.ts";
import { DEFAULT_CACHE_DIR } from "./calibrationCache.ts";
import { dailyContainment, formatFeedCharacter, type OhlcBar } from "./feedCharacter.ts";
import { flagReader, OperatorInputError } from "./flagReader.ts";

const VALUE_FLAGS = new Set(["--cache-dir", "--symbols", "--timeframes"]);
const BOOLEAN_FLAGS = new Set(["--fail-on-escape"]);

function loadStore(cacheDir: string, symbol: string, timeframe: string): OhlcBar[] | null {
  const path = join(cacheDir, `${symbol}-${timeframe}-7000.rolling.json`);
  if (!existsSync(path)) return null;
  const parsed = JSON.parse(readFileSync(path, "utf8")) as { items?: unknown };
  if (!Array.isArray(parsed.items)) {
    throw new Error(`${path}: the store carries no items array — a store the witness cannot read is a refused store`);
  }
  return parsed.items.map((item) => {
    const bar = item as { high?: unknown; low?: unknown; time?: unknown };
    const high = Number(bar.high);
    const low = Number(bar.low);
    const time = Number(bar.time);
    if (!Number.isFinite(high) || !Number.isFinite(low) || !Number.isFinite(time)) {
      throw new Error(`${path}: a bar carries a non-finite high, low or time`);
    }
    return { high, low, time };
  });
}

export function feedCharacterReport(input: {
  cacheDir: string;
  symbols: string[];
  timeframes: string[];
}): { absent: string[]; escaping: string[]; text: string } {
  const lines: string[] = [];
  const escaping: string[] = [];
  const absent: string[] = [];
  for (const symbol of input.symbols) {
    // The store is keyed by the PROVIDER symbol, exactly as the sweep keys it
    // (^GSPC for SP, OTRUMPUSD for TRUMPUSD); a market with no provider
    // mapping has no store and is named absent.
    const provider = resolveProviderSymbols(symbol)[0] ?? symbol;
    const daily = loadStore(input.cacheDir, provider, "daily");
    if (!daily) {
      // Named in the table and in the exit code, never skipped: an absent
      // store reads as a clean one to anyone scanning for ESCAPES.
      absent.push(`${symbol} daily`);
      lines.push(`${symbol} daily ABSENT — nothing to contain the intraday series in`);
      continue;
    }
    for (const timeframe of input.timeframes) {
      const intraday = loadStore(input.cacheDir, provider, timeframe);
      if (!intraday) {
        absent.push(`${symbol} ${timeframe}`);
        lines.push(`${symbol} ${timeframe} ABSENT`);
        continue;
      }
      const witness = dailyContainment(intraday, daily);
      if (witness.verdict === "escapes") escaping.push(`${symbol} ${timeframe} (${witness.escapeYears.join(", ")})`);
      lines.push(formatFeedCharacter(symbol, timeframe, witness));
    }
  }
  return { absent, escaping, text: lines.join("\n") };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const { str } = flagReader(args, VALUE_FLAGS);
  let failOnEscape = false;
  for (let index = 0; index < args.length; index += 1) {
    if (args[index].startsWith("--")) {
      if (VALUE_FLAGS.has(args[index])) {
        index += 1;
      } else if (BOOLEAN_FLAGS.has(args[index])) {
        failOnEscape = true;
      } else {
        throw new OperatorInputError(`unknown flag ${args[index]}`);
      }
      continue;
    }
    throw new OperatorInputError(`unexpected argument ${args[index]} — markets are named with --symbols`);
  }
  const symbolsArg = (str("--symbols") ?? "roster").trim();
  const symbols = symbolsArg.toLowerCase() === "roster"
    ? [...defaultScanSymbols]
    : symbolsArg.split(",").map((value) => value.trim().toUpperCase()).filter(Boolean);
  if (symbols.length === 0) {
    throw new OperatorInputError("--symbols names no market");
  }
  const timeframes = (str("--timeframes") ?? "5min").split(",").map((value) => value.trim()).filter(Boolean);
  const report = feedCharacterReport({ cacheDir: str("--cache-dir") ?? DEFAULT_CACHE_DIR, symbols, timeframes });
  console.log(report.text);
  if (report.absent.length > 0) {
    console.log(`\n${report.absent.length} store(s) absent: ${report.absent.join("; ")}`);
  }
  if (report.escaping.length > 0) {
    console.log(`\n${report.escaping.length} store(s) escape their daily bars: ${report.escaping.join("; ")}`);
  }
  if (failOnEscape && (report.escaping.length > 0 || report.absent.length > 0)) {
    console.error(`feed-character: refusing — ${[...report.escaping, ...report.absent.map((a) => `${a} absent`)].join("; ")}`);
    process.exit(1);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error: unknown) => {
    if (error instanceof OperatorInputError) {
      console.error(error.message);
      process.exit(1);
    }
    console.error(error);
    process.exit(1);
  });
}
