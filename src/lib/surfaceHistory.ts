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

// The surface a history entry carries, or null for "no surface of ours" — which is
// both the entry load's own state (§17o: "The entry load pushes nothing") and any
// state another writer left. Null is what tells App to restore the surface the
// reader entered on, and Back from there leaves Levelflow, because nothing is
// intercepted at the entry.
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

// No URL. §17o: "Surfaces have no addresses; the state does, and the address bar
// stays as the reader found it" — which is what lets the consumed ?donate arrival
// compose, since a model that pushed paths or queries would put something back into
// a URL another ruling just cleaned.
export function pushSurface(surface: Surface): void {
  window.history.pushState(
    encodeSurfaceState(surface),
    "",
  );
}
