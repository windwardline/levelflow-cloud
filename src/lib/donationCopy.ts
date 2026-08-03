// What a donation pays for, in one place, for every surface that says it.
//
// Owner ruling (2026-08-02): "Levelflow does run on paid market data, email, and
// hosting plans, and the development does take time. Donations go toward all of
// those things, so find a way to make the message succinct, all-encompassing, and
// consistent across all screens where it appears. Neither one of the examples you
// gave were wrong, so maybe combine them?"
//
// The two examples were the Donate page's line about the paid market-data, email
// and hosting plans — the costs, but not the work — and the sign-in disclosure's
// list of market data, email, hosting and development — the list, but not what
// Levelflow is paying for. Combined: the first sentence is the fact neither
// surface can show, the second is where the money goes. Two short declarative
// sentences, §17f, and every screen says the same one.
//
// (Both retired sentences are quoted nowhere in src/ — a guard scans the whole
// tree for them, so even this comment paraphrases rather than repeats them.)
//
// A constant rather than the same words typed twice: the last time this sentence
// lived at two call sites it drifted into two different claims, and the guard that
// caught the duplication (tests/donateComposition.test.ts) could only ever pin one
// of them as the survivor.
export const DONATION_SUPPORT_COPY =
  "Levelflow runs on paid market-data, email, and hosting plans. Donations support those costs and continued development.";
