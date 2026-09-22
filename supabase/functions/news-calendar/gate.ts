/**
 * news-calendar's door, kept pure so it can be executed rather than read.
 *
 * A POST with the sync token runs every provider feed. The sync script used to
 * prove the token with exactly that POST, so every credential sync bought a full
 * calendar, earnings and news sync. The verify is now a token-gated GET that
 * returns before any spend decision: it proves the token clears the gate and
 * names the FMP_API_KEY the running function holds by a short SHA-256 prefix,
 * which the script compares against the Keychain's own. It cannot prove the
 * provider accepts that key — only a fetch that runs can.
 */

export type NewsCalendarRoute =
  | "method-not-allowed"
  | "sync"
  | "unauthorized"
  | "verify";

export function routeNewsCalendarRequest(
  method: string,
  authorized: boolean,
): NewsCalendarRoute {
  if (method !== "GET" && method !== "POST") return "method-not-allowed";
  if (!authorized) return "unauthorized";
  return method === "GET" ? "verify" : "sync";
}

/**
 * Sixteen hex characters: 64 bits of a hash of a high-entropy key, enough to
 * tell two keys apart and nowhere near enough to recover one.
 * `scripts/ops/sync-function-secrets.sh` cuts its local digest to the same
 * width (tests/newsCalendarGate.test.ts holds the two together).
 */
export const FINGERPRINT_HEX_CHARS = 16;

export async function keyFingerprint(
  key: string | null | undefined,
): Promise<string | null> {
  if (!key) return null;
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(key),
  );
  return Array.from(
    new Uint8Array(digest),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("").slice(0, FINGERPRINT_HEX_CHARS);
}

export function verifyBody(input: {
  fingerprint: string | null;
  parked: boolean;
}) {
  return {
    gate: "accepted" as const,
    fetched: false as const,
    parked: input.parked,
    fmpKeyFingerprint: input.fingerprint,
  };
}

/** The marker as it appears on the wire, which is what the script greps. */
export const VERIFY_MARKER = JSON.stringify({ gate: "accepted" }).slice(1, -1);
