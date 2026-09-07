// The stop rule after Target 1, per market — amendment 42 (owner ruling,
// 2026-09-07): the desk's instruction renders the protection mode the
// engine stamped on the setup (`risk_model.runnerProtection`, E7's
// decision-time fact), because that is the physics the market is graded
// under. Before this the desk told every operator to move the stop to
// entry while the calibration grades 65–72 of 97 markets under trail_tp1
// — worth 3,244.6 R of divergence on forex's select fold between the
// instructed and the graded path (docs/research/banked-share-design-2026-09-05.md §0).
//
// Every sentence here is spec text (docs/superpowers/specs/
// 2026-07-30-levelflow-desk-design.md §7; the guide-content spec §3, §11),
// verbatim and load-bearing; tests/languageGuard.test.ts pins each one.

export const RUNNER_PROTECTIONS = ["breakeven", "hold", "trail_tp1"] as const;
export type RunnerProtection = (typeof RUNNER_PROTECTIONS)[number];

/** The two-target instruction, one per stamped mode — the sentence the ladder card, the open trade state and the Guide render. */
export const LADDER_INSTRUCTIONS: Record<RunnerProtection, string> = {
  breakeven:
    "Set your take-profit at Target 2. When price reaches Target 1, close half and move your stop to your entry — the banked half is yours either way.",
  hold:
    "Set your take-profit at Target 2. When price reaches Target 1, close half and leave your stop where it is — the banked half is yours either way.",
  trail_tp1:
    "Set your take-profit at Target 2. When price reaches Target 1, close half and move your stop to Target 1 — the banked half is yours either way.",
};

/** The Guide's glossary term and definition for each stop rule (spec §11 / §17d register: only what the surface cannot show). */
export const PROTECTION_TERMS: Record<RunnerProtection, { body: string; term: string }> = {
  breakeven: {
    body: "Edit the stop-loss order to the price you entered at. From there, the worst case for what remains is breaking even.",
    term: "Move your stop to your entry",
  },
  hold: {
    body: "Leave the stop-loss order at the level the setup gave it. What remains can still lose the full risk; the banked half is already yours.",
    term: "Leave your stop where it is",
  },
  trail_tp1: {
    body: "Edit the stop-loss order to the Target 1 price. From there, the worst case for what remains is closing at Target 1.",
    term: "Move your stop to Target 1",
  },
};

/**
 * The mode a setup was graded under. A row without the stamp predates E7
 * (2026-08-03): both live writers graded every such row under the
 * resolver's breakeven fallback, so breakeven is the truthful instruction
 * for it — the physics it was graded under, not a guess. A stamp the desk
 * does not know is a defect, never a fallback: a new mode ships with its
 * sentence or does not ship.
 */
export function runnerProtectionOf(riskModel: Record<string, unknown> | null | undefined): RunnerProtection {
  const stamped = riskModel?.runnerProtection;
  if (stamped === undefined || stamped === null) {
    return "breakeven";
  }
  if (typeof stamped === "string" && (RUNNER_PROTECTIONS as readonly string[]).includes(stamped)) {
    return stamped as RunnerProtection;
  }
  throw new Error(
    `runnerProtection "${String(stamped)}" has no desk instruction — a mode ships with its sentence (src/lib/protectionCopy.ts) or does not ship`,
  );
}

export function ladderInstruction(riskModel: Record<string, unknown> | null | undefined): string {
  return LADDER_INSTRUCTIONS[runnerProtectionOf(riskModel)];
}

/** After Target 1 has hit: what to do with the stop, with the level named, per mode. */
export function afterTargetOneInstruction(input: {
  entry: string;
  riskModel: Record<string, unknown> | null | undefined;
  stop: string;
  targetOne: string;
}): string {
  switch (runnerProtectionOf(input.riskModel)) {
    case "breakeven":
      return `Target 1 hit — bank half, move stop to ${input.entry}`;
    case "trail_tp1":
      return `Target 1 hit — bank half, move stop to ${input.targetOne}`;
    case "hold":
      return `Target 1 hit — bank half, leave stop at ${input.stop}`;
  }
}
