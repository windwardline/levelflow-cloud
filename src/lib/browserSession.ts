// The signal that says "this browser signed in", which is what lets a stored
// Supabase session be restored on the next load. Its purpose is the posture
// tests/hooks.test.ts has always described: a Levelflow session ends with the
// browser session rather than persisting in localStorage for the next person at
// the machine.
//
// It is a session cookie, and it used to be a sessionStorage key. sessionStorage
// is scoped to one TAB, so it could not tell "a second tab of this browser" apart
// from "a different person tomorrow" — and the app hands its readers new tabs by
// design: every legal link carries target="_blank" rel="noopener noreferrer"
// (LegalLinks.tsx and App.tsx's account menu), and a noopener tab starts with an
// empty sessionStorage shed. So when /legal/*.html's own "Back to Levelflow"
// (href="/") or "Donate" (href="/?donate") navigated that tab to the app,
// useAuthSession found a stored session with no marker beside it and signed the
// reader out — of that tab, of the tab they came from, and (through the default
// global scope) of every other device they held. Opening the app itself in a
// second tab did the same. That was the owner's report of 2026-08-02.
//
// A cookie with no Expires and no Max-Age is the primitive that draws the line
// where this posture actually wants it: every tab of the running browser shares
// one, and the browser drops it when the session ends. It carries no secret — the
// literal word "true" — and licenses nothing on its own: the session it unlocks
// is same-origin localStorage, which no other origin can read either way.
export const BROWSER_SESSION_MARKER = "levelflow-active-browser-session";
const MARKER_VALUE = "true";

// Moving the marker out of sessionStorage costs one thing, and this is what pays
// it back. A cookie is writable by a PARENT domain, so any sibling of
// levelflow.windwardline.com could otherwise set
// `levelflow-active-browser-session` for every subdomain of the house and vouch
// for a browser session it knows nothing about. The __Host- prefix is the
// browser-enforced answer: a cookie by that name is accepted only when it is
// Secure, path=/, and carries NO Domain attribute — and "no Domain" is precisely
// what a parent cannot satisfy for someone else's host.
//
// The prefix requires a secure origin, so a plain-http one keeps the bare name.
// Each origin then reads only the name it can itself write (below), which is what
// keeps the http fallback from becoming a way to plant the https marker.
export function markerName(secureOrigin: boolean): string {
  return secureOrigin ? `__Host-${BROWSER_SESSION_MARKER}` : BROWSER_SESSION_MARKER;
}

// Read on every load, so it has to be exact. document.cookie is one flat string,
// and a substring test would accept any cookie whose name merely ENDS with this
// one. The per-tab key is still honoured as a fallback: a browser that refuses
// cookies outright (Safari's "Block all cookies" and its equivalents) can write
// nothing here, and degrading to the old per-tab behaviour is a better failure
// than an app nobody can stay signed in to.
export function browserSessionMarked(
  cookieJar: string,
  tabMarker: string | null,
  secureOrigin: boolean,
): boolean {
  const expected = `${markerName(secureOrigin)}=${MARKER_VALUE}`;
  return (
    cookieJar.split(";").some((entry) => entry.trim() === expected) ||
    tabMarker === MARKER_VALUE
  );
}

// path=/ because the app and the static legal pages are different paths of one
// origin and must read one marker — and because __Host- accepts no other path.
// Secure only where it can be honoured: production is https (vercel.json sends
// upgrade-insecure-requests), but `npm run dev` binds 0.0.0.0 so a phone on the
// LAN can load it over plain http, and a browser silently drops a Secure cookie
// there — which would sign that reader out on every load.
export function markerCookie(secureOrigin: boolean): string {
  return `${markerName(secureOrigin)}=${MARKER_VALUE}; path=/; SameSite=Lax${
    secureOrigin ? "; Secure" : ""
  }`;
}

// Same name, same path, same flags — a deletion that differs in any of them
// deletes nothing — with a lifetime that has already run out.
export function clearedMarkerCookie(secureOrigin: boolean): string {
  return `${markerName(secureOrigin)}=; path=/; Max-Age=0; SameSite=Lax${
    secureOrigin ? "; Secure" : ""
  }`;
}

export function browserSessionActive(): boolean {
  return browserSessionMarked(
    document.cookie,
    window.sessionStorage.getItem(BROWSER_SESSION_MARKER),
    isSecureOrigin(),
  );
}

export function markBrowserSession(): void {
  document.cookie = markerCookie(isSecureOrigin());
  window.sessionStorage.setItem(BROWSER_SESSION_MARKER, MARKER_VALUE);
}

export function clearBrowserSession(): void {
  document.cookie = clearedMarkerCookie(isSecureOrigin());
  window.sessionStorage.removeItem(BROWSER_SESSION_MARKER);
}

function isSecureOrigin(): boolean {
  return window.location.protocol === "https:";
}
