// "Show me the donation surface", as a URL can say it: /?donate or /#donate.
//
// The satellite pages have always asked this way — public/legal/*.html's footer
// carries `<a href="/?donate">Donate</a>`, and so does the parking page — but only
// the sign-in screen answered. A signed-in reader who tapped it got the app's
// remembered tab instead, since App.tsx read the ask nowhere. One predicate here,
// read by both surfaces (AuthScreen's disclosure, App's opening tab), so the two
// cannot drift on what asking looks like.
//
// Kept as a pair of pure functions over the URL's own two halves, with the DOM
// pair beneath them: this repo's unit suite has no DOM, and the rules worth
// pinning — what counts as the ask, and what a cleanup may take out of a URL that
// also carries a magic link — are all decisions about strings.
export function donateAsked(search: string, hash: string): boolean {
  return new URLSearchParams(search).has("donate") || hash === "#donate";
}

// Only the ask comes out; everything else in the URL stays. A magic link lands on
// this same URL and its parameters are read from it twice — useAuthSession's
// hasAuthRedirectParams, then auth-js for detectSessionInUrl — so a cleanup that
// took the whole query string would take a reader's sign-in with it.
//
// Returns a same-origin path, which is what history.replaceState should be handed:
// it cannot carry the document to another origin by accident, and it is what the
// address bar should read.
export function urlWithoutDonate(href: string): string {
  const url = new URL(href);
  url.searchParams.delete("donate");
  if (url.hash === "#donate") {
    url.hash = "";
  }
  return `${url.pathname}${url.search}${url.hash}`;
}

export function donateRequested(): boolean {
  return donateAsked(window.location.search, window.location.hash);
}

// Consumed on arrival, and taken back out of the URL. replaceState, so nothing
// navigates and no history entry appears: Back still returns to the page the
// reader came from, and Forward returns to the app rather than to the ask.
export function clearDonateRequest(): void {
  if (!donateRequested()) {
    return;
  }

  window.history.replaceState(
    window.history.state,
    "",
    urlWithoutDonate(window.location.href),
  );
}
