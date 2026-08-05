import type { BrokerAccount, BrokerClassification } from "../profile";
import {
  AVAILABLE_ASSET_GROUPS,
  type SecurityGroup,
  type SecurityType,
} from "../symbolMap";
import { isDisplayExcluded } from "./offsets";

// Amendment 13. E8 Forex accounts cannot trade futures, so futures markets are
// removed from user view and from scanner action and results whenever an E8
// Forex account is active. NOTHING IS DELETED behind that curtain (owner,
// explicit): futures calibration, replay-sweep artifacts, and learned state are
// all retained, and futures series may continue to serve as internal derivation
// sources — WTI reads CLUSD and BRENT reads BZUSD exactly as before.
//
// Energies (WTI, BRENT) remain on Forex accounts: the owner's own tickets
// priced both on the live Pro Forex account
// (docs/research/e8-observations-2026-08-02.md, batches 1-2).
//
// The account governs the menu; the edge record governs setups.

/** What each classification cannot trade. Indices/Metals stay wherever they are scannable. */
export const HIDDEN_ASSET_TYPES_BY_CLASSIFICATION: Record<
  BrokerClassification,
  SecurityType[]
> = {
  crypto: ["Forex", "Metals", "Energies", "Indices", "Futures"],
  forex: ["Futures"],
  futures: ["Forex", "Metals", "Energies", "Indices", "Crypto"],
};

export function visibleAssetGroups(account: BrokerAccount | null): SecurityGroup[] {
  const hidden = account === null
    ? new Set<SecurityType>()
    : new Set(HIDDEN_ASSET_TYPES_BY_CLASSIFICATION[account.classification]);
  // Amendment 23's offset ruling (owner, 2026-08-05): applied after
  // classification hiding, unconditionally — a display-excluded symbol
  // (BRENT today) never reaches any user surface regardless of account,
  // where classification hiding is account-specific. AVAILABLE_ASSET_GROUPS
  // itself (symbolMap.ts) is untouched by this filter and stays the master
  // list backend broker-matching and replay sweeps read — see offsets.ts's
  // own header. A group left with zero options (none currently — Energies
  // keeps WTI) drops out entirely rather than rendering an empty menu
  // section. isDisplayExcluded is the one predicate every other reopen/
  // affordance check reuses too (fix round 1) — never a second list.
  return AVAILABLE_ASSET_GROUPS
    .filter((group) => !hidden.has(group.label))
    .map((group) => ({
      ...group,
      options: group.options.filter(
        (option) => !isDisplayExcluded(option.symbol),
      ),
    }))
    .filter((group) => group.options.length > 0);
}

export function visibleAssetSymbols(account: BrokerAccount | null): string[] {
  return visibleAssetGroups(account).flatMap((group) =>
    group.options.map((option) => option.symbol),
  );
}
