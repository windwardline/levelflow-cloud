export type E8ProgramCode = "e8_one" | "e8_signature" | "e8_pro";

export type E8Ruleset = {
  id: string;
  label: string;
  drawdownMode: "dynamic_intraday" | "dynamic_eod" | "static";
  dynamicDrawdownPct?: number;
  staticDrawdownPct?: number;
  dailyDrawdownPct: number;
  dailyLossAutoPausePct?: number;
  dailyProfitCapPct?: number;
  profitTargetPct: number;
};

export type E8Program = {
  code: E8ProgramCode;
  name: string;
  balances: number[];
  payoutOptions: number[];
  defaultPayout: number;
  phaseTwoRequired: boolean;
  newsBlackoutEnforced: boolean;
  rulesets: E8Ruleset[];
};

export type E8AccountSelection = E8Ruleset & {
  id: string;
  program: E8Program;
  balance: number;
  payoutOptions: number[];
  defaultPayout: number;
  leverageRatio: "1:30";
  rawSpreadsEnabled: true;
  noCommissionsEnabled: false;
  noCommissionsSelectable: false;
};

const e8OneRulesets: E8Ruleset[] = [
  {
    id: "dd4-daily3-target6",
    label: "4% Dynamic DD / 3% Daily DD / 6% Target",
    drawdownMode: "dynamic_intraday",
    dynamicDrawdownPct: 4,
    dailyDrawdownPct: 3,
    profitTargetPct: 6,
  },
  {
    id: "dd6-daily4-target9",
    label: "6% Dynamic DD / 4% Daily DD / 9% Target",
    drawdownMode: "dynamic_intraday",
    dynamicDrawdownPct: 6,
    dailyDrawdownPct: 4,
    profitTargetPct: 9,
  },
  {
    id: "dd8-daily53-target12",
    label: "8% Dynamic DD / 5.3% Daily DD / 12% Target",
    drawdownMode: "dynamic_intraday",
    dynamicDrawdownPct: 8,
    dailyDrawdownPct: 5.3,
    profitTargetPct: 12,
  },
  {
    id: "dd10-daily66-target16",
    label: "10% Dynamic DD / 6.6% Daily DD / 16% Target",
    drawdownMode: "dynamic_intraday",
    dynamicDrawdownPct: 10,
    dailyDrawdownPct: 6.6,
    profitTargetPct: 16,
  },
  {
    id: "dd14-daily92-target21",
    label: "14% Dynamic DD / 9.2% Daily DD / 21% Target",
    drawdownMode: "dynamic_intraday",
    dynamicDrawdownPct: 14,
    dailyDrawdownPct: 9.2,
    profitTargetPct: 21,
  },
];

export const E8_PROGRAMS: Record<E8ProgramCode, E8Program> = {
  e8_one: {
    code: "e8_one",
    name: "E8 One",
    balances: [5_000, 10_000, 25_000, 50_000, 100_000, 200_000, 400_000, 500_000],
    payoutOptions: [80, 90, 100],
    defaultPayout: 80,
    phaseTwoRequired: true,
    newsBlackoutEnforced: true,
    rulesets: e8OneRulesets,
  },
  e8_signature: {
    code: "e8_signature",
    name: "E8 Signature",
    balances: [25_000, 50_000, 100_000, 150_000],
    payoutOptions: [80],
    defaultPayout: 80,
    phaseTwoRequired: false,
    newsBlackoutEnforced: false,
    rulesets: [
      {
        id: "signature-auto",
        label: "Auto-applied EOD Dynamic DD / 2% Auto-Pause / 6% Target",
        drawdownMode: "dynamic_eod",
        dailyDrawdownPct: 2,
        dailyLossAutoPausePct: 2,
        profitTargetPct: 6,
      },
    ],
  },
  e8_pro: {
    code: "e8_pro",
    name: "E8 Pro",
    balances: [5_000, 10_000, 25_000, 50_000, 100_000, 200_000],
    payoutOptions: [80],
    defaultPayout: 80,
    phaseTwoRequired: false,
    newsBlackoutEnforced: true,
    rulesets: [
      {
        id: "pro-static8-daily25-cap2-target8",
        label: "8% Static DD / 2.5% Daily DD / 2% Daily Profit Cap / 8% Target",
        drawdownMode: "static",
        staticDrawdownPct: 8,
        dailyDrawdownPct: 2.5,
        dailyProfitCapPct: 2,
        profitTargetPct: 8,
      },
    ],
  },
};

export const PROGRAM_ORDER: E8ProgramCode[] = ["e8_one", "e8_signature", "e8_pro"];

export function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

export function getSignatureDrawdownPct(balance: number) {
  return balance >= 100_000 ? 3 : 4;
}

export function getAccountSizeId(programCode: E8ProgramCode, balance: number, rulesetId: string) {
  if (programCode === "e8_one") {
    return `e8-one-${balance}-${rulesetId}`;
  }

  if (programCode === "e8_signature") {
    return `e8-signature-${balance}`;
  }

  return `e8-pro-${balance}`;
}

export function getSelection(programCode: E8ProgramCode, balance: number, rulesetId: string): E8AccountSelection {
  const program = E8_PROGRAMS[programCode];
  const baseRuleset = program.rulesets.find((ruleset) => ruleset.id === rulesetId) ?? program.rulesets[0];

  const ruleset =
    programCode === "e8_signature"
      ? {
          ...baseRuleset,
          id: balance >= 100_000 ? "signature-dd3-target6" : "signature-dd4-target6",
          dynamicDrawdownPct: getSignatureDrawdownPct(balance),
          label: `${getSignatureDrawdownPct(balance)}% EOD Dynamic DD / 2% Auto-Pause / 6% Target`,
        }
      : baseRuleset;

  return {
    ...ruleset,
    id: getAccountSizeId(programCode, balance, ruleset.id),
    program,
    balance,
    payoutOptions: program.payoutOptions,
    defaultPayout: program.defaultPayout,
    leverageRatio: "1:30",
    rawSpreadsEnabled: true,
    noCommissionsEnabled: false,
    noCommissionsSelectable: false,
  };
}
