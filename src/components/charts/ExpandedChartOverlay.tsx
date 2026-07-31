import {
  useEffect,
  useId,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

// Spec §17: "Expand chart ships on mobile (owner: 'I do not want to skip
// features just because we can'): an 'Expand chart' affordance opens the same
// MarketChart full-viewport (100dvw/100dvh overlay) with its level lines and
// theme reactivity; 44px close target, Escape and focus trap, aria-modal,
// functional labels only."
//
// The chart arrives as `children` rather than being built here: the caller
// mounts a second MarketChart with the identical props its inline instance
// has, which is what makes "the same chart" true by construction — same data,
// same level lines, same MutationObserver watching data-theme. Reparenting the
// mounted one would tear down and rebuild the canvas anyway, and would leave
// the inline chart's container empty behind the overlay.
//
// Portaled to document.body for the reason ScopeMenu's popup already is: every
// Desk column is its own overflow-y-auto scroll container, and a fixed element
// inside one inherits nothing useful from it. z-40 sits above both the fixed
// mobile tab bar (z-20) and the scope menu's own full-screen sheet (z-30), so
// the chart a reader just asked to see full-viewport is never underneath
// something else.
type ExpandedChartOverlayProps = {
  children: ReactNode;
  /** The market the chart is showing — the dialog's own accessible name. */
  marketName: string;
  onClose: () => void;
};

// Everything focusable the dialog can contain: the close control plus the
// chart's own tool buttons. Queried live rather than captured once, since the
// chart's overlays (loading, empty) come and go while the dialog is open.
const FOCUSABLE = 'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';

export function ExpandedChartOverlay(
  { children, marketName, onClose }: ExpandedChartOverlayProps,
) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  // The element that had focus when the dialog opened — the trigger, in every
  // real path here. Captured rather than passed in as a ref so the trigger can
  // stay where the mock puts it (inside the chart's own bottom-right corner)
  // without threading a ref up through MarketChart's props.
  const previouslyFocusedRef = useRef<Element | null>(null);

  useEffect(() => {
    previouslyFocusedRef.current = document.activeElement;
    closeRef.current?.focus();

    // Restored, not cleared: another overlay or a future modal may have set it,
    // and "hidden" is only correct to undo back to whatever was there before.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
      const restore = previouslyFocusedRef.current;
      if (restore instanceof HTMLElement) {
        restore.focus();
      }
    };
  }, []);

  function handleKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== "Tab") {
      return;
    }

    // A real trap, not ScopeMenu's "Tab closes it": this dialog covers the
    // whole viewport, so there is nowhere sensible for Tab to go except round
    // its own controls. Both directions wrap.
    const focusable = Array.from(
      dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [],
    );
    if (focusable.length === 0) {
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;

    if (event.shiftKey && (active === first || !dialogRef.current?.contains(active))) {
      event.preventDefault();
      last.focus();
      return;
    }
    if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return createPortal(
    <div
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-modal="true"
      className="fixed inset-0 z-40 flex h-[100dvh] w-[100dvw] flex-col bg-paper"
      role="dialog"
      onKeyDown={handleKeyDown}
    >
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-hairline px-4 py-2">
        <span
          id={titleId}
          className="min-w-0 truncate font-display text-lg font-bold text-ink"
        >
          {marketName}
        </span>
        <button
          ref={closeRef}
          aria-label="Close"
          className="-mr-2 inline-flex min-h-11 min-w-11 items-center justify-center rounded-md text-ink-muted transition hover:text-accent"
          type="button"
          onClick={onClose}
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>
      <div className="min-h-0 flex-1 p-3">{children}</div>
    </div>,
    document.body,
  );
}
