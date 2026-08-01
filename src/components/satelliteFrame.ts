// Spec §17i, as amended 2026-08-01: "Desktop is an app-shell frame on EVERY page
// — no exceptions ('Every single page.'): the authed tabs … AND the seldom-used
// set (parking, login, the legal trio, 404). Top chrome pinned (the masthead
// where one exists; the page's own head region otherwise), THE footer pinned
// bottom and always visible, the content region scrolling between them."
//
// The satellite pages have no masthead, so their frame is the other two rows:
// content, then footer. That is the whole difference from App.tsx's
// mainShellClassName — same unit, same overflow, same reason for minmax(0,1fr)
// (a bare 1fr floors at its own min-content height, which is exactly how a long
// privacy notice would push the footer off the bottom of the frame).
//
// At every width, not only ≥lg: §17g's mobile footer rule is about the authed
// app, where a bottom tab bar already owns the bottom of the viewport and the
// account menu carries the link set. These pages have neither, so a reader on a
// phone would have no route to Help, Donate or the legal trio at all if the
// footer were dropped below lg. One frame, one footer, every width.
//
// Literal strings, never assembled from parts (C1,
// tests/tailwindVariantGuard.test.ts): Tailwind's build-time scanner reads source
// text, so a class name has to exist in it as a complete token. Shared rather
// than written twice for the same reason src/components/mobileFrame.ts is shared
// — two copies of a frame are two frames waiting to drift.

// The frame: content row, footer row, exactly the viewport tall.
export const SATELLITE_FRAME =
  "grid h-[100dvh] grid-rows-[minmax(0,1fr)_auto] overflow-hidden bg-paper text-ink";

// Every element that carries the string below is a tab stop with a name
// (tabIndex={0} + role="region" + aria-label at the call site, guarded by
// tests/appFrame.test.ts): the frame took the document's scroll away, so this box
// is the only thing that can move, and a scroll box no element can focus is a
// scroll box no keyboard can move (WCAG 2.1.1). The attributes stay at the call
// site rather than riding this string — a class list cannot carry a name, and the
// name is what makes the new stop announce as something instead of "region".
//
// The one scrolling region between them, flat by construction — §17c's
// box-on-box rule governs scroll regions too (§17g). A flex column so a short
// page's content can centre itself on auto margins, which, unlike
// justify-content, collapse to zero instead of clipping the top when the content
// is taller than the region. The thin scrollbar is the kit's own .scrolly, shared
// with the Desk's columns and every mobile scroll region.
export const SATELLITE_FRAME_SCROLL =
  "scrolly flex min-h-0 flex-col overflow-y-auto";
