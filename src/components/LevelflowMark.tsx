// Spec §17h's mark A, at its canonical geometry: "a rounded-square tile carrying
// three horizontals from the app's own chart — target (ink, full width), entry
// (accent, full width), stop (ink at 45% opacity, shorter). Canonical geometry on
// a 32-grid: tile rx 7; lines x=7, heights 2.6, rx 1.3, at y 9 / 14.7 / 20.4;
// widths 18 / 18 / 12."
//
// Inline rather than an <img> of public/brand/levelflow-mark.svg, for the reason
// §17h itself gives: "fills come from the app's real tokens — the mark IS the
// palette, never approximated hexes." An <img> loads an isolated document that
// cannot see a CSS custom property, so it can only carry baked hexes and a
// per-theme file swap; inline, every fill is the live token and the mark re-values
// with the theme in the same frame the rest of the page does. It is also the idiom
// this app already uses for theme-reactive vector art (AuthScreen's own hero
// chartline draws with stroke="var(--color-accent)").
//
// The rendition is the sheet tile with a hairline edge, which is §17h's own answer
// for a paper ground: "on the og card's paper ground the corner mark takes the
// same lesson lightward: sheet tile with a hairline edge, the app's card idiom."
// Every surface this renders on — the parking screen, the login hero — is a paper
// ground. It is also the one rendition needing no per-theme swap at all: sheet,
// hairline, ink and accent each re-value, so light and dark are the same six
// attributes rather than two files.
//
// Decorative, deliberately: every surface that carries this puts the wordmark
// directly beneath it, so an accessible name here would announce the product's
// name twice to a screen reader and add nothing to either announcement.
export function LevelflowMark({ className }: { className: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      viewBox="0 0 32 32"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect
        x="0.5"
        y="0.5"
        width="31"
        height="31"
        rx="6.5"
        fill="var(--color-sheet)"
        stroke="var(--color-hairline)"
      />
      <rect
        x="7"
        y="9"
        width="18"
        height="2.6"
        rx="1.3"
        fill="var(--color-ink)"
      />
      <rect
        x="7"
        y="14.7"
        width="18"
        height="2.6"
        rx="1.3"
        fill="var(--color-accent)"
      />
      <rect
        x="7"
        y="20.4"
        width="12"
        height="2.6"
        rx="1.3"
        fill="var(--color-ink)"
        opacity="0.45"
      />
    </svg>
  );
}
