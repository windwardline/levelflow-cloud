// User-facing copy for magic-link send failures. Supabase reports the cause
// via AuthError code/status; the split that matters to users is whether
// retrying can help (rate limit) or cannot (server-side failure).
type AuthEmailError = { code?: string; status?: number } | null | undefined;

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
