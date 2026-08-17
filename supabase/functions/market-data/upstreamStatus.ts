// Why a whole module for one predicate: `index.ts` carries Deno globals, so
// it is excluded from `tsconfig.tests.json` and nothing in it can be unit
// tested. This classifier decides whether a deploy goes red, so it is the last
// thing that should be untested — it lives out here where CI can exercise it.
//
// FMP meters bytes over a trailing 30 days and publishes no usage endpoint
// (§21a), so the only evidence that the allowance is gone is the prose it
// serves in the refusal body. HTTP status cannot carry this: 429 is also the
// 3,000-requests-per-minute ceiling, which is transient and genuinely ours to
// handle. Only the bandwidth message means the 30-day allowance is spent.

export type UpstreamFailureKind = "quota-exhausted" | "other";

// Narrow on purpose. Every phrase here appears in FMP's bandwidth refusal and
// nowhere else in its error vocabulary. Widening this to catch more failures
// would convert the E2E stand-down from "the provider is out of budget" into
// "something went wrong", which is the silent pass this exists to prevent.
const QUOTA_MARKERS = [
  /bandwidth limit/i,
  /limit reach/i,
  /upgrade your plan/i,
];

export function classifyUpstreamFailure(
  providerStatus: string,
): UpstreamFailureKind {
  return QUOTA_MARKERS.some((marker) => marker.test(providerStatus))
    ? "quota-exhausted"
    : "other";
}
