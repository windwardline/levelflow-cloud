import { useEffect, useState } from "react";

// 1024 mirrors --breakpoint-lg (src/styles/index.css) exactly rather than
// introducing a second number that could drift from it. This is a plain pixel
// comparison, not a rem media query, so it can't fall prey to the bug that
// made index.css's breakpoints pixel-pinned in the first place (rem
// breakpoints resolve against the browser's font-size setting); a
// `min-width: 1024px` match here always agrees with Tailwind's own
// `lg:`-generated media query.
export const MOBILE_BREAKPOINT_PX = 1024;

export function isMobileViewportWidth(viewportWidthPx: number): boolean {
  return viewportWidthPx < MOBILE_BREAKPOINT_PX;
}

// The one viewport check in the app. Two surfaces need to know the width in
// JavaScript rather than in CSS, and for the same reason: each swaps in a
// composition CSS cannot express as a restyling of the other — ScopeMenu's
// full-screen sheet vs its anchored popup, and the Desk's merged mobile Scan
// surface (spec §17e, m-scan-v3.html) vs its ≥lg three-column shell, where the
// pinned/scroll split needs wrapper boxes no `display: contents` trick can
// conjure. Rendering ONE of the two (rather than both, CSS-hidden) is what
// keeps a single "Scan scope" trigger, a single chart canvas, and a single
// accessible name for each control at every width.
export function useIsMobileViewport(): boolean {
  const [mobile, setMobile] = useState(() =>
    typeof window === "undefined"
      ? false
      : isMobileViewportWidth(window.innerWidth)
  );

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const query = window.matchMedia(`(min-width: ${MOBILE_BREAKPOINT_PX}px)`);
    const onChange = () => setMobile(!query.matches);
    onChange();
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  return mobile;
}
