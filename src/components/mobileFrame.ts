// Spec §17g (owner ruling, binding): "No mobile view scrolls as a whole screen.
// Every <lg surface is a fixed-viewport frame (the merged Scan screen's
// pattern): chrome pinned, and the necessary list/content region scrolls within
// itself — flat, no box chrome (the box-on-box rule governs scroll regions too;
// hairline separation at most, thin scrollbars)."
//
// The merged Scan surface (§17e, m-scan-v3.html:9,29,32) built that pattern
// first; these are its own three class strings, lifted here so the six surfaces
// that now share it cannot drift into six frames. App.tsx sizes the shell row to
// exactly "viewport minus header" below lg (mainShellClassName's 100dvh grid),
// and each surface fills it with one of these frames.
//
// Literal strings, never assembled from parts (C1,
// tests/tailwindVariantGuard.test.ts): Tailwind's build-time scanner reads
// source text, so a class name has to exist in it as a complete token.

// The frame: a flex column that fills the shell row and never grows past it.
// min-h-0 is what lets the scroll region below actually be shorter than its
// content instead of stretching the column, and min-w-0 keeps a long ticker or a
// wide table from widening the whole surface.
export const MOBILE_FRAME = "flex min-h-0 min-w-0 flex-1 flex-col";

// The pinned chrome above the scroll region. It owns the surface's top gutter,
// because the fixed shell contributes no padding of its own (m-scan-v3.html:29).
export const MOBILE_FRAME_PINNED = "shrink-0 px-4 pt-3";

// The one scrolling region (m-scan-v3.html:32). Flat by construction — no
// border, no fill, no radius, no shadow — because §17g extends the box-on-box
// rule to scroll regions. The thin scrollbar is the kit's own .scrolly, shared
// with the ≥lg Desk's three columns. pb-24 is the fixed MobileTabBar's
// clearance: below lg the bar is mounted on every surface, and the region runs
// to the bottom of the viewport underneath it.
export const MOBILE_FRAME_SCROLL =
  "scrolly min-h-0 flex-1 overflow-y-auto px-4 pb-24";
