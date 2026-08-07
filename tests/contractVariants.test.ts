import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { defaultScanSymbols } from "../supabase/functions/trade-analyzer/symbols.ts";
import { describe, it } from "node:test";
import {
  CONTRACT_SIZE_VARIANTS,
  isContractSizeVariant,
  parentMarketOf,
  variantsOf,
} from "../src/lib/broker/contractVariants.ts";
import { MASTER_LIST_ROWS, sweepUniverse } from "../src/lib/broker/masterList.ts";
import {
  FOREX_ACCOUNT_CRYPTO_CFDS,
  OFFERED_CLASSIFICATIONS_BY_ACCOUNT_TYPE,
  accountTypesOffering,
  scannableSymbolsFor,
} from "../src/lib/broker/visibility.ts";
import { AVAILABLE_ASSET_SYMBOLS, SECURITY_OPTIONS } from "../src/lib/symbolMap.ts";
import { BROKER_INSTRUMENTS } from "../src/lib/broker/instruments.ts";

// Owner ruling (2026-08-05): one analyzed market per underlying, per account
// type; contract size is a sizing dimension, never a second scan row. These
// pins are the durable half of that ruling — the register alone would decay
// into a comment, and the failure it prevents is silent. Two rows for one gold
// opportunity does not throw; it just double-counts the opportunity in the
// ranked scan and counts one trade's outcome twice in the money-positive
// record every calibration decision reads.
describe("contract-size variants are sized, never scanned (owner ruling 2026-08-05)", () => {
  it("declares MGCUSD as micro gold against GCUSD", () => {
    assert.equal(parentMarketOf("MGCUSD"), "GCUSD");
    assert.equal(isContractSizeVariant("MGCUSD"), true);
    assert.deepEqual(variantsOf("GCUSD"), ["MGCUSD"]);
  });

  it("keeps every declared variant out of all three account types' scannable sets", () => {
    for (const variant of Object.keys(CONTRACT_SIZE_VARIANTS)) {
      for (const classification of ["forex", "crypto", "futures"] as const) {
        assert.ok(
          !scannableSymbolsFor(classification).includes(variant),
          `${variant} must not be scannable on a ${classification} account`,
        );
      }
      assert.ok(
        !scannableSymbolsFor(null).includes(variant),
        `${variant} must not be scannable in the account-agnostic union either`,
      );
    }
  });

  it("keeps every variant's parent ANALYZED — a variant may never orphan its market", () => {
    // The failure this catches: demoting a variant whose parent is measured
    // nowhere would remove the underlying market from Levelflow entirely. Gold
    // must not vanish because micro gold was demoted.
    //
    // The bar is ANALYZED, not scannable, and this test is why the distinction
    // got written down: when FDXM was declared FDAX's variant on 2026-08-06,
    // requiring a scannable parent failed a CORRECT ruling, because FDAX is
    // itself withheld pending its own sweep. Nothing is lost while both are
    // withheld — FDAX is that market's analyzed representation and its
    // visibility is a separate, pending decision. What would genuinely orphan
    // the market is a parent absent from the sweep universe.
    const swept = new Set(sweepUniverse().map((entry) => entry.levelflowSymbol));
    for (const [variant, parent] of Object.entries(CONTRACT_SIZE_VARIANTS)) {
      assert.ok(
        swept.has(parent),
        `${variant}'s parent ${parent} is not swept anywhere — the market would be lost`,
      );
    }
  });

  it("keeps every variant in the sizing layer — sizing is the whole reason it exists", () => {
    // MGC's tick value is a tenth of GC's, so a size computed for one is wrong
    // for the other. Demoting it from the scan must never cost it its sizing
    // identity, or the ruling would have broken what it set out to preserve.
    const sized = new Set(BROKER_INSTRUMENTS.map((row) => row.levelflowSymbol));
    for (const variant of Object.keys(CONTRACT_SIZE_VARIANTS)) {
      assert.ok(sized.has(variant), `${variant} must remain in BROKER_INSTRUMENTS`);
    }
  });

  it("keeps every variant in the symbol map but out of the scannable master set", () => {
    const mapped = new Set(SECURITY_OPTIONS.map((option) => option.symbol));
    for (const variant of Object.keys(CONTRACT_SIZE_VARIANTS)) {
      assert.ok(mapped.has(variant), `${variant} stays a known symbol`);
      assert.ok(
        !AVAILABLE_ASSET_SYMBOLS.includes(variant) ||
          !scannableSymbolsFor(null).includes(variant),
        `${variant} must not reach a user surface`,
      );
    }
  });

  it("drops every variant from the sweep universe — the same market twice teaches nothing", () => {
    const swept = new Set(sweepUniverse().map((entry) => entry.levelflowSymbol));
    for (const [variant, parent] of Object.entries(CONTRACT_SIZE_VARIANTS)) {
      assert.ok(!swept.has(variant), `${variant} must not be swept separately`);
      assert.ok(swept.has(parent), `${parent} must still be swept`);
    }
  });

  it("never declares a variant whose parent is itself a variant", () => {
    // A chain (A sizes against B, B sizes against C) would make "the analyzed
    // market" ambiguous. One hop, always.
    for (const [variant, parent] of Object.entries(CONTRACT_SIZE_VARIANTS)) {
      assert.equal(
        isContractSizeVariant(parent),
        false,
        `${variant} points at ${parent}, which is itself a variant`,
      );
    }
  });

  it("declares a variant only for a symbol the registry actually knows", () => {
    const known = new Set(
      MASTER_LIST_ROWS.map((entry) => entry.levelflowSymbol).filter(
        (symbol): symbol is string => symbol !== null,
      ),
    );
    for (const [variant, parent] of Object.entries(CONTRACT_SIZE_VARIANTS)) {
      assert.ok(known.has(variant), `${variant} is not a registry row`);
      assert.ok(known.has(parent), `${parent} is not a registry row`);
    }
  });
});

// The dual-listing model (owner-directed 2026-08-06). A market's registry
// `classification` records where its offering evidence came from — one value,
// by design. Reading it as "the account type this market belongs to"
// understates the offering, because amendment 19 clause 3 rules that an E8
// Forex account carries every crypto-classified market. So every crypto row is
// dual-listed, and the per-account-type view has to say so or it misreports
// two thirds of what those accounts actually offer.
describe("dual listing — one market, more than one account type", () => {
  it("offers every crypto-classified market on both Crypto and Forex accounts", () => {
    assert.deepEqual(accountTypesOffering("crypto").sort(), ["crypto", "forex"]);
  });

  it("keeps forex and futures single-listed — the bundling runs one way only", () => {
    // A Crypto account does NOT carry forex, and a Futures account carries
    // neither. Asserting the negative matters: a symmetric rule would silently
    // put futures on forex accounts, which amendment 13 exists to forbid.
    assert.deepEqual(accountTypesOffering("forex"), ["forex"]);
    assert.deepEqual(accountTypesOffering("futures"), ["futures"]);
  });

  it("agrees with the resolver it inverts, for every classification", () => {
    // The two directions must never drift, which is why this is derived from
    // OFFERED_CLASSIFICATIONS_BY_ACCOUNT_TYPE rather than stored beside it.
    for (const accountType of ["forex", "crypto", "futures"] as const) {
      for (const offered of OFFERED_CLASSIFICATIONS_BY_ACCOUNT_TYPE[accountType]) {
        assert.ok(
          accountTypesOffering(offered).includes(accountType),
          `${accountType} offers ${offered}, so ${offered} must list ${accountType}`,
        );
      }
    }
  });

  it("puts BNBUSD on both account types — the case that exposed the gap", () => {
    const bnb = MASTER_LIST_ROWS.find((entry) => entry.brokerName === "BNBUSD");
    assert.ok(bnb, "BNBUSD must have a registry row");
    assert.deepEqual(
      accountTypesOffering(bnb!.classification).sort(),
      ["crypto", "forex"],
      "E8 prices BNB on the live Pro Forex account as well as on Crypto",
    );
  });

  it("lets a dual-listed market be scannable on one account and excluded on the other", () => {
    // The mechanism amendment 24 requires, proved against a real dual-listed
    // symbol rather than asserted. Exclusion is scoped by account type, so the
    // same market can carry different verdicts — which is only meaningful
    // because the market is genuinely offered on both.
    const scoped = [{
      levelflowSymbol: "BTCUSD",
      accountTypes: ["forex"] as const,
      ground: "sweep-performance" as const,
      detail: "synthetic fixture — exercises per-account-type scoping only",
    }];
    assert.ok(!scannableSymbolsFor("forex", scoped).includes("BTCUSD"));
    assert.ok(scannableSymbolsFor("crypto", scoped).includes("BTCUSD"));
  });
});

// Corrected 2026-08-06 against the screenshots, on the owner's instruction to
// confirm each account type's offering from the live record rather than infer
// it. Amendment 19 clause 3 had been applied as "a Forex account carries every
// crypto-classified market"; the Pro Forex record tickets exactly eight crypto
// CFDs and totals itself at 46 instruments — "the complete CFD universe".
describe("a Forex account carries eight crypto CFDs, not the Crypto account's set", () => {
  it("names exactly the eight the screenshots ticket", () => {
    assert.deepEqual([...FOREX_ACCOUNT_CRYPTO_CFDS].sort(), [
      "ADAUSD",
      "BCHUSD",
      "BNBUSD",
      "BTCUSD",
      "ETHUSD",
      "LTCUSD",
      "SOLUSD",
      "XRPUSD",
    ]);
  });

  it("carries every onboarded major, and no crypto beyond them", () => {
    // Deliberately NOT pinned at E8's own 46. That is E8's instrument count
    // (38 FX-denominated + 8 crypto); Levelflow's scannable forex set is
    // smaller because indices and BNBUSD are gated no-trade and BRENT is
    // display-excluded. Pinning 46 here would conflate what E8 offers with
    // what Levelflow currently scans — two different facts, and the standing
    // order is about closing the gap between them, not about hiding it behind
    // a number that happens to match.
    const forexScannable = new Set(scannableSymbolsFor("forex"));
    const cryptoOnForex = [...forexScannable].filter((symbol) =>
      FOREX_ACCOUNT_CRYPTO_CFDS.has(symbol)
    );
    assert.ok(cryptoOnForex.length > 0, "the majors must reach Forex accounts");
    for (const symbol of forexScannable) {
      const isCrypto = scannableSymbolsFor("crypto").includes(symbol);
      if (isCrypto) {
        assert.ok(
          FOREX_ACCOUNT_CRYPTO_CFDS.has(symbol),
          `${symbol} is on a Forex account but is not one of the eight ticketed CFDs`,
        );
      }
    }
  });

  it("keeps a crypto market off Forex when the screenshots never ticketed it", () => {
    // The regression this exists for, and it was latent rather than visible:
    // today only the eight are onboarded, so "all crypto" and "these eight"
    // coincide and the bug is invisible. This asserts against the mechanism,
    // not against today's data — a synthetic crypto option stands in for the
    // twenty-five mates the standing order will onboard, and it must appear on
    // a Crypto account while staying off a Forex one.
    const cryptoOnly = "ATOMUSD";
    assert.ok(
      !FOREX_ACCOUNT_CRYPTO_CFDS.has(cryptoOnly),
      "ATOMUSD is a Crypto-account market the Forex screenshots never priced",
    );
    assert.ok(
      !scannableSymbolsFor("forex").includes(cryptoOnly),
      "a Crypto-only market must never reach a Forex account",
    );
  });

  it("leaves the Crypto and Futures accounts untouched by the carve-out", () => {
    // OFFERED and SCANNABLE were different facts here, and BNBUSD was why: E8
    // priced it on both account types while Levelflow gated it no-trade pending
    // a promotion decision. That decision landed on 2026-08-07 — an FMP match
    // is the only test — so the two facts now agree for all eight, and the
    // carve-out's own job is unchanged: it never touches Crypto or Futures.
    const onCrypto = new Set(scannableSymbolsFor("crypto"));
    const onFutures = new Set(scannableSymbolsFor("futures"));
    let checked = 0;
    for (const major of FOREX_ACCOUNT_CRYPTO_CFDS) {
      if (!onCrypto.has(major)) continue;
      checked += 1;
      assert.ok(
        !onFutures.has(major),
        `${major} must not appear on a Futures account`,
      );
    }
    assert.ok(checked >= 7, `expected the onboarded majors, checked ${checked}`);
    // BNBUSD was withheld by its own no-trade gate, and the release removed it:
    // E8 prices BNBUSD on both account types and FMP matches it (-13.1 bp,
    // measured on the live crypto book). So it is now among the eight the
    // carve-out covers, present on crypto and on forex, absent on futures —
    // which is exactly what the loop above already asserts for it.
    assert.ok(onCrypto.has("BNBUSD"));
    assert.ok(FOREX_ACCOUNT_CRYPTO_CFDS.has("BNBUSD"));
    assert.ok(!onFutures.has("BNBUSD"));
  });
});

// The variant rule spans the Deno/browser boundary, so it is declared twice and
// pinned to itself. src/lib/broker/contractVariants.ts governs the client and
// the registry; trade-analyzer/symbols.ts governs the server's scan universe.
// Neither can import the other — that boundary is why this file's symbolMap is
// its own copy — so drift is caught here instead.
describe("the variant register is identical on both sides of the Deno boundary", () => {
  it("declares the same symbols in the Edge Function as in src", () => {
    const source = readFileSync(
      "supabase/functions/trade-analyzer/symbols.ts",
      "utf8",
    );
    const block = source.match(
      /export const contractSizeVariants = new Set\(\[([\s\S]*?)\]\);/,
    );
    assert.ok(block, "the Edge Function must declare contractSizeVariants");
    const edgeSide = [...block![1].matchAll(/"([A-Z0-9]+)"/g)].map((m) => m[1]).sort();
    assert.deepEqual(
      edgeSide,
      Object.keys(CONTRACT_SIZE_VARIANTS).sort(),
      "a variant added on one side of the boundary must be added on the other",
    );
  });

  it("keeps every variant out of the server's default scan universe", () => {
    // The failure this caught when it was written: MGCUSD was filtered from the
    // client resolver but still sat in defaultScanSymbols, so the scan door
    // would have walked micro gold and duplicated gold in the corpus — the
    // exact double-count the ruling exists to prevent, surviving the ruling.
    for (const variant of Object.keys(CONTRACT_SIZE_VARIANTS)) {
      assert.ok(
        !defaultScanSymbols.includes(variant),
        `${variant} must not be in the server's scan universe`,
      );
    }
  });
});
