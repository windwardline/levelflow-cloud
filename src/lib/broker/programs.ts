import type {
  LeverageClass,
  ProgramFamily,
  ProgramLine,
  Provenance,
  Stage,
  Valued,
} from "./types";

// Spec §19b. Ten program lines ship — the researched set, less two. The bar is a
// [PRIMARY] account-size ladder and a [PRIMARY] rule set. `E8 Classic` fails it
// (its article 404'd on re-fetch and its drawdown is described two ways);
// `E8 Track` and `E8 Track 1:1` fail it (never found on either help subdomain,
// secondary-only). Neither appears in the selector, and neither re-enters on
// recollection or a checkout screenshot — only behind a fresh primary-research
// pass that clears the same bar the ten cleared (§20i ruling 6).

const HELP = "https://help.e8markets.com/en/articles";
const HELP_FUTURES = "https://helpfutures.e8markets.com/en/articles";

function primary(article: string, slug: string, base = HELP): Provenance {
  return { article, tag: "primary", method: null, url: `${base}/${article}-${slug}` };
}

/** 8880316 — the Custom Account article, which publishes every ladder. */
export const CUSTOM_ACCOUNT = primary("8880316", "what-is-the-custom-account");
/** 5514982 — leverage by product. "Leverage will differ between each product, but not between stages." */
export const LEVERAGE_ARTICLE = primary("5514982", "how-much-leverage-do-you-offer");
/** 5514977 — instruments by product. The per-line class universe. */
export const INSTRUMENTS_ARTICLE = primary(
  "5514977",
  "what-instruments-are-allowed-to-be-traded-spreads",
);
/** 10155917 — allowed margin per program and size, and the margin per contract. */
export const MAX_CONTRACTS = primary(
  "10155917",
  "max-available-contract-sizes",
  HELP_FUTURES,
);
/** 9453396 — the flat ticket caps, the max-position formula, the bridging rule. */
export const LOT_RESTRICTIONS = primary(
  "9453396",
  "are-there-lot-order-size-restrictions",
);
/** 9453488 — contract sizes. Three instrument rows, and the pip-value derivation it declines to print. */
export const CONTRACT_SIZES = primary("9453488", "what-are-the-contract-sizes");
/** 13004287 — tick size and profit per tick. */
export const TICK_SIZES = primary(
  "13004287",
  "tick-size-and-profit-per-tick-calculation",
  HELP_FUTURES,
);
/** 13001922 — the 45-instrument fee/hours roster. */
export const INSTRUMENT_ROSTER = primary(
  "13001922",
  "instrument-list-and-trading-hours",
  HELP_FUTURES,
);
/** 13390461 — the canonical instrument list, which spells E-mini Euro FX `E7`. */
export const CANONICAL_LIST = primary(
  "13390461",
  "stop-trading-the-wrong-contract-month",
  HELP_FUTURES,
);
/** 15655062 — E8 Zero's own product page, the only page publishing its leverage. */
export const ZERO_PRODUCT = primary("15655062", "e8-zero");
/** The E8X dashboard's trading-symbols table: the 28-pair forex contract size. */
export const E8X_TRADING_SYMBOLS: Provenance = {
  article: null,
  tag: "primary",
  method: null,
  url: "https://e8x.e8markets.com/trading-symbols",
};

function valued<T>(value: T | null, source: Provenance): Valued<T> {
  return { source, value };
}

export type ProgramLineSpec = {
  /** Selector label. §20j pins all eleven option strings, `None` included. */
  label: string;
  line: ProgramLine;
  family: ProgramFamily;
  /** The program's real ladder, in ascending order. Never a shared constant. */
  accountSizes: number[];
  accountSizeSource: Provenance;
  /**
   * The purchased drawdown tier's domain, on the four customizable lines only;
   * null on the six preset lines, whose parameters are published per size
   * (§19g). Encoded as the paired token the selector renders, because daily and
   * dynamic move together — "Profit Target adjusts automatically with drawdown
   * changes" — so a two-number column could hold a configuration E8 does not
   * sell.
   */
  drawdownTiers: string[] | null;
  leverage: Partial<Record<LeverageClass, Valued<number>>>;
  /**
   * 10155917's allowed-margin figure per size and stage. The published
   * "Maximum Contract Size" column is this figure evaluated at the $10,000
   * standard margin — reading it as a contract count would cap `MGC` at 2 on a
   * $25K Signature account when its $1,000 margin permits 20.
   */
  allowedMargin: Record<Stage, Record<number, number>> | null;
};

// 5514982's Table 1, identical for E8 One, E8 Pro Forex and E8 Signature Forex.
// The article's own "Indicies" typo is not reproduced — it is a spelling of a
// column header, not a value.
const FOREX_LINE_LEVERAGE: ProgramLineSpec["leverage"] = {
  forex: valued(30, LEVERAGE_ARTICLE),
  indices: valued(15, LEVERAGE_ARTICLE),
  metals: valued(15, LEVERAGE_ARTICLE),
  energies: valued(15, LEVERAGE_ARTICLE),
  crypto: valued(1, LEVERAGE_ARTICLE),
};

// 5514982's Table 2, identical for all three crypto lines.
const CRYPTO_LINE_LEVERAGE: ProgramLineSpec["leverage"] = {
  bitcoin: valued(5, LEVERAGE_ARTICLE),
  ethereum: valued(5, LEVERAGE_ARTICLE),
  other_crypto: valued(2, LEVERAGE_ARTICLE),
};

// E8 Zero is absent from 5514982 entirely and publishes the same figures on its
// own product page, so the value's url is the product article rather than the
// leverage article (§19b). Energies has no row there — and E8 Zero's own class
// list omits energies — so the key is absent rather than guessed at 1:15.
const ZERO_LEVERAGE: ProgramLineSpec["leverage"] = {
  forex: valued(30, ZERO_PRODUCT),
  indices: valued(15, ZERO_PRODUCT),
  metals: valued(15, ZERO_PRODUCT),
  crypto: valued(1, ZERO_PRODUCT),
};

// Signature Futures: a single flat table, no Challenge/Performance split and no
// scaling mechanic presented anywhere on 10155917 — structurally confirming the
// cap is stage-invariant.
const SIGNATURE_FUTURES_ALLOWANCE = {
  25_000: 20_000,
  50_000: 40_000,
  100_000: 80_000,
  150_000: 120_000,
};

// Zero Futures Performance scales the allowance with locked profit (1.5% and 3%
// triggers, "the account scales automatically at the start of each new trading
// day"). Levelflow cannot see locked profit, so it clamps to the STARTING
// allowance — the conservative floor — and §20d publishes the scaling table
// rather than guessing where the user sits.
const ZERO_FUTURES_ALLOWANCE: Record<Stage, Record<number, number>> = {
  challenge: { 50_000: 40_000, 100_000: 80_000, 200_000: 100_000 },
  performance: { 50_000: 20_000, 100_000: 30_000, 200_000: 40_000 },
};

const ONE_LADDER = [5_000, 10_000, 25_000, 50_000, 100_000, 200_000, 400_000, 500_000];
// Pro's ladder carries a $150,000 tier E8 One's eight do not. The two products'
// ladders are not identical and a shared ladder constant would be wrong for one.
const PRO_LADDER = [
  5_000,
  10_000,
  25_000,
  50_000,
  100_000,
  150_000,
  200_000,
  400_000,
  500_000,
];
const SIGNATURE_LADDER = [25_000, 50_000, 100_000, 150_000];
const ZERO_LADDER = [50_000, 100_000, 200_000];

// E8's own tiers, paired as E8 pairs them (8880316): daily % and dynamic % move
// together on One; Pro's daily is a fixed 2.5% on every tier and only the static
// leg moves, but the token still carries both so one column shape serves all
// four customizable lines.
const ONE_DRAWDOWN_TIERS = ["3-4", "4-6", "5.3-8", "6.6-10", "9.2-14"];
const PRO_DRAWDOWN_TIERS = ["2.5-6", "2.5-8", "2.5-10"];

export const PROGRAM_LINES: ProgramLineSpec[] = [
  {
    label: "E8 One",
    line: "one",
    family: "cfd_forex",
    accountSizes: ONE_LADDER,
    accountSizeSource: CUSTOM_ACCOUNT,
    drawdownTiers: ONE_DRAWDOWN_TIERS,
    leverage: FOREX_LINE_LEVERAGE,
    allowedMargin: null,
  },
  {
    label: "E8 One Crypto",
    line: "one_crypto",
    family: "cfd_crypto",
    accountSizes: ONE_LADDER,
    accountSizeSource: CUSTOM_ACCOUNT,
    drawdownTiers: ONE_DRAWDOWN_TIERS,
    leverage: CRYPTO_LINE_LEVERAGE,
    allowedMargin: null,
  },
  {
    label: "E8 Pro Forex",
    line: "pro_forex",
    family: "cfd_forex",
    accountSizes: PRO_LADDER,
    accountSizeSource: CUSTOM_ACCOUNT,
    drawdownTiers: PRO_DRAWDOWN_TIERS,
    leverage: FOREX_LINE_LEVERAGE,
    allowedMargin: null,
  },
  {
    label: "E8 Pro Crypto",
    line: "pro_crypto",
    family: "cfd_crypto",
    accountSizes: PRO_LADDER,
    accountSizeSource: CUSTOM_ACCOUNT,
    drawdownTiers: PRO_DRAWDOWN_TIERS,
    leverage: CRYPTO_LINE_LEVERAGE,
    allowedMargin: null,
  },
  {
    label: "E8 Signature Forex",
    line: "signature_forex",
    family: "cfd_forex",
    accountSizes: SIGNATURE_LADDER,
    accountSizeSource: CUSTOM_ACCOUNT,
    drawdownTiers: null,
    leverage: FOREX_LINE_LEVERAGE,
    allowedMargin: null,
  },
  {
    label: "E8 Signature Crypto",
    line: "signature_crypto",
    family: "cfd_crypto",
    accountSizes: SIGNATURE_LADDER,
    accountSizeSource: CUSTOM_ACCOUNT,
    drawdownTiers: null,
    leverage: CRYPTO_LINE_LEVERAGE,
    allowedMargin: null,
  },
  {
    label: "E8 Signature Futures",
    line: "signature_futures",
    family: "futures",
    accountSizes: SIGNATURE_LADDER,
    accountSizeSource: CUSTOM_ACCOUNT,
    drawdownTiers: null,
    leverage: {},
    allowedMargin: {
      challenge: SIGNATURE_FUTURES_ALLOWANCE,
      performance: SIGNATURE_FUTURES_ALLOWANCE,
    },
  },
  {
    label: "E8 Zero",
    line: "zero",
    family: "cfd_forex",
    accountSizes: ZERO_LADDER,
    accountSizeSource: CUSTOM_ACCOUNT,
    drawdownTiers: null,
    leverage: ZERO_LEVERAGE,
    allowedMargin: null,
  },
  // The word "Futures" in the two Zero labels is Levelflow's: E8's own pages call
  // the forex-side product "E8 Zero" and the futures products "E8 Zero Starter
  // and Max" without disambiguating them, and one selector cannot carry two
  // products named the same thing.
  {
    label: "E8 Zero Futures Starter",
    line: "zero_futures_starter",
    family: "futures",
    accountSizes: ZERO_LADDER,
    accountSizeSource: CUSTOM_ACCOUNT,
    drawdownTiers: null,
    leverage: {},
    allowedMargin: ZERO_FUTURES_ALLOWANCE,
  },
  {
    label: "E8 Zero Futures Max",
    line: "zero_futures_max",
    family: "futures",
    accountSizes: ZERO_LADDER,
    accountSizeSource: CUSTOM_ACCOUNT,
    drawdownTiers: null,
    leverage: {},
    allowedMargin: ZERO_FUTURES_ALLOWANCE,
  },
];

export const PROGRAM_LINE_IDS: ProgramLine[] = PROGRAM_LINES.map((p) => p.line);

export function getProgramLine(line: string): ProgramLineSpec | null {
  return PROGRAM_LINES.find((program) => program.line === line) ?? null;
}

export function isProgramLine(value: unknown): value is ProgramLine {
  return typeof value === "string" &&
    PROGRAM_LINES.some((program) => program.line === value);
}

export function isStage(value: unknown): value is Stage {
  return value === "challenge" || value === "performance";
}

/** §19b: `Challenge` · `Performance`. The app's voice drops E8's SimFi™ mark. */
export const STAGE_OPTIONS: { label: string; value: Stage }[] = [
  { label: "Challenge", value: "challenge" },
  { label: "Performance", value: "performance" },
];

/**
 * §19b: `0.10%` to `1.50%` in `0.05%` steps, default `0.50%`.
 *
 * The ceiling is 1.50% because it is the top of the band E8 itself observes
 * (9453413) and because at 1.50% a single stop consumes three quarters of the
 * tightest published daily line, the Signature 2% Daily Pause (11969807) — the
 * shape 6929927 prohibits outright as "All-or-nothing Trading". The default is
 * 0.50% because four full stops fit inside that 2% pause line and five inside
 * Pro's 2.5% Daily Drawdown, and because it sits below the 1% per-trade-idea cap
 * E8 reserves the right to impose on a flagged account. The floor is 0.10% so
 * the smallest ladder tier still produces a placeable size.
 */
export const RISK_PERCENT_MIN = 0.1;
export const RISK_PERCENT_MAX = 1.5;
export const RISK_PERCENT_STEP = 0.05;
export const RISK_PERCENT_DEFAULT = 0.5;

export const RISK_PERCENT_OPTIONS: number[] = (() => {
  const options: number[] = [];
  for (let step = 0; ; step += 1) {
    const value = Number((RISK_PERCENT_MIN + step * RISK_PERCENT_STEP).toFixed(2));
    if (value > RISK_PERCENT_MAX + 1e-9) {
      break;
    }
    options.push(value);
  }
  return options;
})();

/** `0.50%` — the selector's own rendering, comma-free and two-decimal. */
export function formatRiskPercent(value: number) {
  return `${value.toFixed(2)}%`;
}

/** `$100,000` — comma-grouped, no cents (§19b item 2). */
export function formatAccountSize(value: number) {
  return `$${new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value)}`;
}

/**
 * `3% daily · 4% max` — E8's own tiers rendered verbatim from the paired token
 * the column holds (§19b item 5, §19g).
 */
export function formatDrawdownTier(token: string) {
  const [daily, max] = token.split("-");
  return `${daily}% daily · ${max}% max`;
}

export function drawdownTiersFor(line: string): string[] | null {
  return getProgramLine(line)?.drawdownTiers ?? null;
}

/**
 * The allowed margin for a futures program at a size and stage, or null where
 * this program publishes no allowance table (every CFD line).
 */
export function allowedMarginFor(
  line: ProgramLine,
  accountSize: number,
  stage: Stage,
): number | null {
  const table = getProgramLine(line)?.allowedMargin;
  if (!table) {
    return null;
  }
  return table[stage][accountSize] ?? null;
}

/**
 * E8's published "Maximum Contract Size" column, for the CI identity in §19f:
 * `floor(allowedMargin / 10000)` equals this for all ten program/size rows.
 */
export const STANDARD_FUTURES_MARGIN = 10_000;
