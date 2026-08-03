// Spec §17o tier 1: "Each switch pushes a history entry, so Back walks the surface
// path backwards." Before this, no in-app destination had a history entry at all —
// fourteen of them — so the browser's Back, which is the only navigation control an
// OS hands a phone, left Levelflow rather than walking back through it.
//
// What a surface IS lives here, in the three coordinates that decide what a reader
// is looking at: which tab, which of the Desk's two mobile sub-surfaces, and which
// legal document when one is open. The mobile sub-surfaces count because two of the
// tab bar's three destinations are sub-views of one tab (§17e) — a comparison that
// ignored them would make Back skip the tab bar's own path.
//
// The fields are plain strings rather than App's own unions: this module decides
// history, not vocabulary, and App narrows what comes back out of a state before
// applying it (a state can be older than the build that reads it, or belong to
// something else entirely).
export type Surface = {
  tab: string;
  deskView: string;
  document: string | null;
};

// One key, named so nothing else would choose it. history.state is shared with
// every other writer on the origin, so a record that is not under this key is not
// ours (readSurfaceState below treats it as the entry state).
const SURFACE_KEY = "levelflowSurface";

type SurfaceHistoryState = {
  [SURFACE_KEY]: Surface;
};

export function sameSurface(a: Surface, b: Surface): boolean {
  return a.tab === b.tab && a.deskView === b.deskView && a.document === b.document;
}

export function encodeSurfaceState(surface: Surface): SurfaceHistoryState {
  return { [SURFACE_KEY]: { ...surface } };
}

// The surface a history entry carries, or null for "no surface of ours".
//
// Null does NOT mean "the entry". The entry gets this state stamped onto it at mount
// (replaceSurface below), so the entries left carrying null are the ones this app
// did not create: a same-document fragment navigation — which the Guide's own table
// of contents performs ten times over, and which fires popstate with a null state
// exactly as a traversal does — or another writer on the origin. App leaves the
// surface alone for those, because a reader clicking "Confidence" in the Guide's
// contents is not asking to go anywhere else.
export function readSurfaceState(state: unknown): Surface | null {
  if (typeof state !== "object" || state === null || !(SURFACE_KEY in state)) {
    return null;
  }

  const surface = (state as Record<string, unknown>)[SURFACE_KEY];
  if (typeof surface !== "object" || surface === null) {
    return null;
  }

  const { tab, deskView, document } = surface as Record<string, unknown>;
  if (
    typeof tab !== "string" ||
    typeof deskView !== "string" ||
    !(typeof document === "string" || document === null)
  ) {
    return null;
  }

  return { tab, deskView, document };
}

// No URL, in either of the two writers below. §17o: "Surfaces have no addresses; the
// state does, and the address bar stays as the reader found it" — which is what lets
// the consumed ?donate arrival compose, since a model that pushed paths or queries
// would put something back into a URL another ruling just cleaned. Omitting the
// third argument entirely is what leaves the URL untouched.
export function pushSurface(surface: Surface): void {
  window.history.pushState(
    encodeSurfaceState(surface),
    "",
  );
}

// The entry, stamped with the surface the reader arrived on. replaceState creates no
// history entry, so §17o's "the entry load pushes nothing" holds exactly — what
// changes is that the entry now SAYS which surface it is, which is the only way to
// tell it apart from an entry this app never made (a fragment navigation). Called
// once, at mount, and nowhere else.
export function replaceSurface(surface: Surface): void {
  window.history.replaceState(
    encodeSurfaceState(surface),
    "",
  );
}
