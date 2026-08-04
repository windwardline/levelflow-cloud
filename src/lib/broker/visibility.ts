import type { BrokerAccount, BrokerClassification } from "../profile";
import {
  AVAILABLE_ASSET_GROUPS,
  AVAILABLE_ASSET_SYMBOLS,
  type SecurityGroup,
  type SecurityType,
} from "../symbolMap";

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
  if (account === null) {
    return AVAILABLE_ASSET_GROUPS;
  }
  const hidden = new Set(HIDDEN_ASSET_TYPES_BY_CLASSIFICATION[account.classification]);
  return AVAILABLE_ASSET_GROUPS.filter((group) => !hidden.has(group.label));
}

export function visibleAssetSymbols(account: BrokerAccount | null): string[] {
  if (account === null) {
    return AVAILABLE_ASSET_SYMBOLS;
  }
  return visibleAssetGroups(account).flatMap((group) =>
    group.options.map((option) => option.symbol),
  );
}
