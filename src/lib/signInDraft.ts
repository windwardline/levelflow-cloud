// What the sign-in screen remembers while a reader steps away to read a document.
//
// §17o tier 2 sends a signed-out reader's legal link through the same tab — the
// doctrine's choice, and the right one: a new tab there was the defect the 2026-08-02
// session fix was cleaning up after. The consequence was that a reader partway
// through sign-in lost the screen: the address they had typed, or the "check your
// email" state they were waiting in, and Back returned a blank form.
//
// Same tab means the same sessionStorage, so the screen keeps its draft there and
// picks it up on the way back. This is the thing sessionStorage is for — per-tab form
// state that ends with the tab — and the payload is one address the reader typed into
// a visible input plus one boolean. No credential material, nothing that could stand
// in for a session, which is why this is a plain per-tab key while the browser-session
// marker next door had to become a cookie.
export const SIGN_IN_DRAFT_KEY = "levelflow-sign-in-draft";

export type SignInDraft = {
  email: string;
  sent: boolean;
};

// The line the send path writes, in one place, because the restore has to say the
// same thing (§17f: the copy exists once, not once per path that shows it).
export function sentMessage(email: string): string {
  return `Magic link sent to ${email}.`;
}

export function encodeSignInDraft(draft: SignInDraft): string {
  return JSON.stringify({ email: draft.email, sent: draft.sent });
}

// Narrowed, never trusted: this string outlives the build that wrote it, and a shape
// that is not a draft is no draft at all rather than a screen half-restored.
export function decodeSignInDraft(raw: string | null): SignInDraft | null {
  if (!raw) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // A value this app cannot read is a value it ignores. Nothing is lost but a
    // convenience, and reporting it would be reporting it to nobody.
    return null;
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return null;
  }

  const { email, sent } = parsed as Record<string, unknown>;
  if (typeof email !== "string" || typeof sent !== "boolean") {
    return null;
  }

  return { email, sent };
}

export function loadSignInDraft(): SignInDraft | null {
  return decodeSignInDraft(window.sessionStorage.getItem(SIGN_IN_DRAFT_KEY));
}

export function saveSignInDraft(draft: SignInDraft): void {
  window.sessionStorage.setItem(SIGN_IN_DRAFT_KEY, encodeSignInDraft(draft));
}

export function clearSignInDraft(): void {
  window.sessionStorage.removeItem(SIGN_IN_DRAFT_KEY);
}
