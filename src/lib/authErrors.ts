// User-facing copy for magic-link send failures. Supabase reports the cause
// via AuthError code/status; the split that matters to users is whether
// retrying can help (rate limit) or cannot (server-side failure).
type AuthEmailError = { code?: string; status?: number } | null | undefined;

/**
 * 1r: whether a failed PostgREST read means the session is dead server-side.
 * A 401 — or PostgREST's own JWT refusal code — is the one failure re-auth
 * fixes and retrying cannot; everything else is a retryable read failure and
 * must never end a visit. auth-js keeps its local session object through
 * this, which is exactly why the data boundary has to carry the verdict.
 */
export function isDeadSessionError(
  error: unknown,
  status: number | undefined,
): boolean {
  if (status === 401) {
    return true;
  }
  const code = (error as { code?: unknown } | null | undefined)?.code;
  return code === "PGRST301";
}

export function describeAuthEmailError(error: AuthEmailError) {
  if (error?.code === "over_email_send_rate_limit" || error?.status === 429) {
    return "Too many attempts. Wait a moment, then request a new link.";
  }
  if (error?.code === "unexpected_failure" || (error?.status ?? 0) >= 500) {
    const ref = error?.code ? ` (ref: ${error.code})` : "";
    return `Sign-in is temporarily unavailable on our side. Retrying won't help — contact support if this continues.${ref}`;
  }
  return "The sign-in link could not be sent. Try again shortly.";
}
