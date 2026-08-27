import { describeAuthEmailError } from "./authErrors";
import { sentMessage } from "./signInDraft";

/**
 * The magic-link send, as a function that can be executed by a test.
 *
 * WHY THIS IS NOT IN THE COMPONENT. Magic link is the ONLY way a real operator
 * signs in: every Playwright spec authenticates with signInWithPassword, which
 * no production user ever does, so the production sign-in path had zero
 * end-to-end exercise. Its two halves were each covered — describeAuthEmailError
 * in tests/authErrors.test.ts and sentMessage in tests/signInDraft.test.ts —
 * and the handler that WIRES them was covered by nothing. Two tested parts and
 * an untested join is the shape that reads as coverage and is not.
 *
 * The join carries real decisions: the address is trimmed and lowercased before
 * it reaches the provider AND before it is shown back, an error must return the
 * form to a usable state rather than stranding it mid-send, and a missing client
 * has to be told apart from a failed send. None of that was observable until it
 * lived somewhere a test could call.
 *
 * The provider is taken as a parameter, so a test drives the real logic against
 * a stand-in and no test ever sends mail.
 */

/** The narrow slice of the Supabase client this needs, so a test can stand in for it. */
export type MagicLinkSender = {
  auth: {
    signInWithOtp(credentials: {
      email: string;
      options?: { emailRedirectTo?: string };
    }): Promise<{ error: { code?: string; message?: string; status?: number } | null }>;
  };
};

export type MagicLinkResult =
  /** No client was constructed — a configuration fact, not a send failure. */
  | { kind: "unconfigured"; message: string }
  | { email: string; kind: "sent"; message: string }
  | { kind: "failed"; message: string };

export const UNCONFIGURED_MESSAGE = "Cloud connection is not configured.";

/**
 * Normalised ONCE, here, and the same value is used for the send, the draft and
 * the message shown back. Doing it at the call site instead is how the three
 * drift: the provider receives one address and the reader is told another.
 */
export function normalizeSignInEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export async function requestMagicLink(
  sender: MagicLinkSender | null,
  rawEmail: string,
  appUrl: string,
): Promise<MagicLinkResult> {
  if (!sender) {
    return { kind: "unconfigured", message: UNCONFIGURED_MESSAGE };
  }

  const email = normalizeSignInEmail(rawEmail);
  const { error } = await sender.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: appUrl },
  });

  if (error) {
    return { kind: "failed", message: describeAuthEmailError(error) };
  }

  return { email, kind: "sent", message: sentMessage(email) };
}
