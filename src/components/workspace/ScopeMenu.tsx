import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, X } from "lucide-react";
import {
  AVAILABLE_ASSET_GROUPS,
  formatSecurityLabel,
  type SecurityGroup,
  type SecurityType,
  type SupportedSymbol,
} from "../../lib/symbolMap";
import {
  formatClockTime,
  formatReopen,
  marketAvailability,
  type MarketAvailability,
} from "../../lib/marketHours";
import { useIsMobileViewport } from "../../hooks/useMobileViewport";

export type ScanScope =
  | { kind: "all" }
  | { assetType: SecurityType; kind: "group" }
  | { kind: "symbol"; symbol: SupportedSymbol };

export type ScopeMenuRow = {
  availability: MarketAvailability;
  count?: number;
  interactive: boolean;
  key: string;
  label: string;
  nested: boolean;
  scope: ScanScope;
};

/**
 * Pure row model for the scope menu, in display order (spec §4): All
 * markets, then each group (alphabetical — AVAILABLE_ASSET_GROUPS already
 * carries that order), then that group's markets (already base/quote
 * sorted, also carried as-is). A market row's availability is always its
 * group's: the engine only models calendars per asset type
 * (src/lib/marketHours.ts), never per symbol.
 */
export function buildScopeMenuRows(
  now: Date,
  groups: SecurityGroup[] = AVAILABLE_ASSET_GROUPS,
): ScopeMenuRow[] {
  const rows: ScopeMenuRow[] = [
    {
      // Crypto's calendar never closes (marketHours.ts's CRYPTO_CALENDAR),
      // so at least one group is always open - "All markets" never shows a
      // reopen affordance and is never inert. No count: scanning "all"
      // sends the server no symbol list, and it applies its own curated
      // default universe rather than every listed market (see
      // AdvisorWorkspace.tsx's scanMarkets) - a client-computed total here
      // could overstate what a scan actually covers, which is exactly the
      // kind of unreconciled count spec §5 replaces.
      availability: { open: true },
      interactive: true,
      key: "all",
      label: "All markets",
      nested: false,
      scope: { kind: "all" },
    },
  ];

  for (const group of groups) {
    const availability = marketAvailability(group.label, "", now);
    rows.push({
      availability,
      count: group.options.length,
      interactive: availability.open,
      key: `group:${group.label}`,
      label: group.label,
      nested: false,
      scope: { assetType: group.label, kind: "group" },
    });
    for (const option of group.options) {
      rows.push({
        availability,
        interactive: availability.open,
        key: `symbol:${option.symbol}`,
        label: option.label,
        nested: true,
        scope: { kind: "symbol", symbol: option.symbol },
      });
    }
  }

  return rows;
}

export function describeScanScope(scope: ScanScope): string {
  if (scope.kind === "all") {
    return "All markets";
  }
  if (scope.kind === "group") {
    return scope.assetType;
  }
  return formatSecurityLabel(scope.symbol);
}

// The open-state affordance ("Scan N") only ever applies to "all"/"group"
// rows - spec §4 gives individual market rows no affordance when open. The
// closed-state reopen label applies uniformly (markets, groups, and in
// principle "all" alike); the caller uppercases it via CSS and the word
// "closed" itself never renders (spec §10b) - the muted, non-interactive row
// IS the signal.
export function formatScopeMenuAffordance(
  availability: MarketAvailability,
  count: number,
  now: Date,
): string {
  return availability.open
    ? `Scan ${count}`
    : `Opens ${formatReopen(availability.opensAt, now)}`;
}

export function formatScopeCountLine(
  scope: ScanScope,
  counts: { qualified: number; scanned: number },
  now: Date,
): string {
  return `${describeScanScope(scope)} — ${counts.scanned} scanned · ${counts.qualified} qualify · ${
    formatClockTime(now)
  }`;
}

// A closed or otherwise non-interactive row never produces a scope - the
// component's click and keyboard-Enter handlers both route through this, so
// "no onSelect fired for a closed row" is one guaranteed code path instead
// of two independently-maintained checks.
export function resolveRowActivation(row: ScopeMenuRow): ScanScope | null {
  return row.interactive ? row.scope : null;
}

export function moveScopeMenuHighlight(
  rows: ScopeMenuRow[],
  currentKey: string | null,
  direction: 1 | -1,
): string | null {
  const interactiveKeys = rows
    .filter((row) => row.interactive)
    .map((row) => row.key);
  if (interactiveKeys.length === 0) {
    return null;
  }

  const currentPos = currentKey ? interactiveKeys.indexOf(currentKey) : -1;
  if (currentPos === -1) {
    return direction === 1
      ? interactiveKeys[0]
      : interactiveKeys[interactiveKeys.length - 1];
  }

  const nextPos = (currentPos + direction + interactiveKeys.length) %
    interactiveKeys.length;
  return interactiveKeys[nextPos];
}

function isSameScope(a: ScanScope, b: ScanScope): boolean {
  if (a.kind !== b.kind) {
    return false;
  }
  if (a.kind === "group" && b.kind === "group") {
    return a.assetType === b.assetType;
  }
  if (a.kind === "symbol" && b.kind === "symbol") {
    return a.symbol === b.symbol;
  }
  return true;
}

// Spec §4: a group row carries its scan count, a closed row carries its reopen
// line, an open market row carries nothing (the row itself is the affordance),
// and "All markets" carries nothing at all — it never shows a count (see
// buildScopeMenuRows) and its calendar never closes.
export function showsAffordance(row: ScopeMenuRow): boolean {
  if (row.scope.kind === "all") {
    return false;
  }
  if (!row.availability.open) {
    return true;
  }
  return row.scope.kind !== "symbol";
}

// Mobile renders the menu as a full-screen sheet instead of an anchored popup —
// spec §4's universal contract: "One dropdown, three scope kinds, identical on
// desktop and mobile (mobile renders it as a full-screen sheet)." It applies to
// every ScopeMenu instance, so the choice lives inside the component itself
// rather than as a prop each call site would otherwise compute and thread
// through identically — see useIsMobileViewport() below.
//
// Q1-#21: this file used to re-export the breakpoint under a second name plus a
// shouldUseSheetLayout predicate, both with no product caller — the component
// reads the app's one viewport hook directly. src/hooks/useMobileViewport.ts is
// the one home for both the number and the comparison, and tests/hooks.test.ts
// covers them there.
type ScopeMenuProps = {
  /** Accessible label for the trigger ("Scan scope"), and the sheet's title. */
  label: string;
  /** Injectable clock for tests; defaults to `new Date()`. */
  now?: Date;
  onSelect: (scope: ScanScope) => void;
  /**
   * Whether `label` also renders as a visible caption above the trigger.
   * Neither call site draws one (the rail leads with its own eyebrow, and the
   * merged mobile surface pins the trigger in its control row), so both pass
   * false and the trigger carries `label` as its aria-label instead — same
   * accessible name, no caption.
   */
  showLabel?: boolean;
  value: ScanScope;
};

// Accessible "collapsible dropdown listbox" (button + popup, WAI-ARIA APG),
// not a native <select> - closed markets need to render muted and
// unselectable with their own reopen affordance, which a native <option>
// cannot do (the mock's own open menu, a-desk-v3.html:92-149, is those muted
// rows and reopen labels).
//
// The popup renders through a portal because the host sits inside a clipping
// ancestor - each Desk column is its own `overflow-y-auto` scroll container
// (AdvisorWorkspace's column classes) - so an absolutely-positioned popup
// would be cut off at the column edge.
export function ScopeMenu(
  {
    label,
    now,
    onSelect,
    showLabel = true,
    value,
  }: ScopeMenuProps,
) {
  const baseId = useId();
  const sheet = useIsMobileViewport();
  const [open, setOpen] = useState(false);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [position, setPosition] = useState<
    { left: number; top: number; width: number } | null
  >(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  // The mobile sheet's own root. listRef covers only the option list, and the
  // sheet's header — title bar and Close button — is a SIBLING of that list
  // inside the portal, so without this ref the outside-press listener below
  // treated a press on the Close button as a press outside the menu: it
  // unmounted the portal before mouseup, the button's click never completed, and
  // focus was left on the body instead of returning to the trigger. Null in the
  // anchored-popup presentation, where the option list IS the portal's root.
  const sheetRef = useRef<HTMLDivElement>(null);

  // Recomputed on every render, not memoized: `now` defaulting to
  // `new Date()` would otherwise make `clock` a fresh value on every render
  // anyway, so the memo would never actually skip work. buildScopeMenuRows
  // is cheap (one pass over ~50 rows), and staying live means availability
  // reflects the real clock the moment the menu is opened rather than
  // whatever it was when the component last happened to re-render for some
  // other reason.
  const clock = now ?? new Date();
  const rows = buildScopeMenuRows(clock);

  function place() {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (rect) {
      setPosition({ left: rect.left, top: rect.bottom + 4, width: rect.width });
    }
  }

  function openMenu() {
    place();
    const selectedRow = rows.find((row) => isSameScope(row.scope, value));
    setActiveKey(
      selectedRow?.interactive
        ? selectedRow.key
        : moveScopeMenuHighlight(rows, null, 1),
    );
    setOpen(true);
  }

  const close = useCallback(() => {
    setOpen(false);
    setPosition(null);
  }, []);

  // Stable identity, the same bar App.tsx's MobileAccountMenu keeps: the open
  // effect below now depends on this, and a fresh function each render would
  // tear its four listeners down and rebuild them on every parent render
  // instead of only on a real open/close transition.
  const closeAndFocusTrigger = useCallback(() => {
    close();
    triggerRef.current?.focus();
  }, [close]);

  function activate(row: ScopeMenuRow) {
    const scope = resolveRowActivation(row);
    if (!scope) {
      return;
    }
    onSelect(scope);
    closeAndFocusTrigger();
  }

  useEffect(() => {
    if (!open) {
      return;
    }
    listRef.current?.focus();

    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (
        !rootRef.current?.contains(target) &&
        !sheetRef.current?.contains(target) &&
        !listRef.current?.contains(target)
      ) {
        close();
      }
    }
    // Escape on the document rather than only in the list's own switch below:
    // the sheet's header is not focusable, so a tap on the title bar leaves
    // document.activeElement on the body, where a React handler bound to the
    // option list hears nothing. One owner for the key, so a press can never
    // take two paths to one dismissal.
    function handleEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") {
        return;
      }
      event.preventDefault();
      closeAndFocusTrigger();
    }
    function handleScroll(event: Event) {
      // Scrolling inside the popup's own option list is normal listbox use,
      // not a reason to dismiss it - only an ancestor of the trigger
      // scrolling (which would leave the popup floating over the wrong
      // spot) should close it.
      if (listRef.current?.contains(event.target as Node)) {
        return;
      }
      close();
    }
    function handleResize() {
      place();
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    window.addEventListener("scroll", handleScroll, true);
    window.addEventListener("resize", handleResize);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
      window.removeEventListener("scroll", handleScroll, true);
      window.removeEventListener("resize", handleResize);
    };
    // close and closeAndFocusTrigger are useCallback-stable, so `open` is the
    // only value here that ever actually changes.
  }, [close, closeAndFocusTrigger, open]);

  // Shared between the anchored popup and the full-screen sheet - the two
  // presentations differ only in their outer container, never in what a row
  // looks like or does (spec §4: "identical on desktop and mobile").
  function renderOptionRows() {
    return rows.map((row) => {
      const selected = isSameScope(row.scope, value);
      return (
        <li
          key={row.key}
          aria-disabled={!row.interactive}
          aria-selected={selected}
          id={`${baseId}-${row.key}`}
          role="option"
          className={rowClassName(row, row.key === activeKey)}
          onClick={() => activate(row)}
          onMouseEnter={() => row.interactive && setActiveKey(row.key)}
        >
          <span className="flex min-w-0 items-center gap-2">
            {selected
              ? (
                <Check
                  className="h-3.5 w-3.5 shrink-0 text-accent"
                  aria-hidden="true"
                />
              )
              : <span className="w-3.5 shrink-0" aria-hidden="true" />}
            {/* min-w-0 is the structural half of §17m.5: the label is the part
                that yields, explicitly, so no label, locale weekday or future
                holiday-calendar date can push the availability line out of a row
                the popup clips in one axis. `truncate` already zeroes this
                item's automatic minimum (overflow:hidden does that on its own),
                so this is the guarantee stated rather than discovered — the
                measured defect was the line's SIZE, which the type below
                addresses. */}
            <span className="min-w-0 truncate">{row.label}</span>
          </span>
          {showsAffordance(row)
            ? (
              // Spec §17m.5: "closed-market availability lines must not
              // truncate — OPENS 6:00P SUN reads in full even while the row is
              // disabled." shrink-0 + whitespace-nowrap is the structural half;
              // the type is what makes it fit. Measured in Chromium against the
              // built CSS, "OPENS 12:00P WED" in the retired treatment
              // (.eyebrow + font-mono: 12px at 0.14em) took 142.1px of a 248px
              // popup and left the market name a 40px stub; at 10.5px / 0.06em
              // it takes 110.9px and leaves 71px. Its own literal classes rather
              // than .eyebrow for exactly that reason — this line is not the
              // same size as a section eyebrow any more.
              // tests/scopeMenu.test.tsx pins the sizes and the width budget
              // against the longest string the real formatters can produce.
              <span className="shrink-0 whitespace-nowrap font-mono text-[10.5px] font-semibold uppercase leading-4 tracking-[0.06em] text-ink-muted">
                {formatScopeMenuAffordance(
                  row.availability,
                  row.count ?? 0,
                  clock,
                )}
              </span>
            )
            : null}
        </li>
      );
    });
  }

  function handleListKeyDown(event: ReactKeyboardEvent) {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        setActiveKey((current) => moveScopeMenuHighlight(rows, current, 1));
        return;
      case "ArrowUp":
        event.preventDefault();
        setActiveKey((current) => moveScopeMenuHighlight(rows, current, -1));
        return;
      case "Home":
        event.preventDefault();
        setActiveKey(moveScopeMenuHighlight(rows, null, 1));
        return;
      case "End":
        event.preventDefault();
        setActiveKey(moveScopeMenuHighlight(rows, null, -1));
        return;
      case "Enter":
      case " ": {
        event.preventDefault();
        const activeRow = rows.find((row) => row.key === activeKey);
        if (activeRow) {
          activate(activeRow);
        }
        return;
      }
      // Escape is deliberately absent: the document-level listener in the open
      // effect owns it, so it works from the sheet's header too — and one owner
      // means the key cannot take two paths to one dismissal.
      case "Tab":
        // The popup is portaled to document.body, outside the trigger's
        // real position in the page's DOM order. Letting native Tab
        // traversal continue from inside the portal would land focus
        // somewhere unrelated to where the user actually is; closing and
        // returning focus to the trigger (same as Escape) keeps the next
        // real Tab press - Shift or not, "Tab" is the same event.key for
        // both - continuing from the right spot in the page.
        event.preventDefault();
        closeAndFocusTrigger();
        return;
      default:
    }
  }

  return (
    <div ref={rootRef} className="grid min-w-0 gap-1">
      {/* Spec §16 suppresses the visible caption on both pickers, but the
          caption is what every element here takes its name from — so the node
          always renders and only its styling changes. Hiding it with .sr-only
          (clipped, not display:none) keeps it in the accessibility tree, so
          each aria-labelledby below resolves in both modes. Removing it
          instead is what cost the trigger its selected value: a bare
          aria-label REPLACES element content in the name computation, and the
          value lives in that content. */}
      <span
        id={`${baseId}-label`}
        className={showLabel
          ? "eyebrow"
          : "sr-only"}
      >
        {label}
      </span>
      <button
        ref={triggerRef}
        aria-expanded={open}
        aria-haspopup="listbox"
        // Caption + current value, always: the value lives in this button's
        // content, and a bare aria-label would replace it in the name
        // computation rather than joining it.
        aria-labelledby={`${baseId}-label ${baseId}-value`}
        className="field flex w-full items-center justify-between gap-2 text-left text-sm font-semibold normal-case text-ink"
        id={baseId}
        type="button"
        onClick={() => (open ? close() : openMenu())}
        onKeyDown={(event) => {
          if (["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) {
            event.preventDefault();
            openMenu();
          }
        }}
      >
        <span id={`${baseId}-value`} className="truncate">
          {describeScanScope(value)}
        </span>
        <ChevronDown
          className="h-4 w-4 shrink-0 text-ink-muted"
          aria-hidden="true"
        />
      </button>

      {open && position
        ? createPortal(
          sheet
            ? (
              <div
                ref={sheetRef}
                aria-labelledby={`${baseId}-sheet-title`}
                aria-modal="true"
                className="motion-fade-in fixed inset-0 z-30 flex flex-col bg-sheet"
                role="dialog"
              >
                <div className="flex shrink-0 items-center justify-between gap-3 border-b border-hairline px-4 py-3">
                  <span
                    id={`${baseId}-sheet-title`}
                    className="text-sm font-semibold text-ink"
                  >
                    {label}
                  </span>
                  <button
                    aria-label="Close"
                    className="cpv-copy"
                    type="button"
                    onClick={closeAndFocusTrigger}
                  >
                    <X className="h-5 w-5" aria-hidden="true" />
                  </button>
                </div>
                <ul
                  ref={listRef}
                  aria-activedescendant={activeKey ? `${baseId}-${activeKey}` : undefined}
                  aria-labelledby={`${baseId}-label`}
                  className="scrolly flex-1 overflow-y-auto py-1"
                  role="listbox"
                  tabIndex={-1}
                  onKeyDown={handleListKeyDown}
                >
                  {renderOptionRows()}
                </ul>
              </div>
            )
            : (
              <ul
                ref={listRef}
                aria-activedescendant={activeKey ? `${baseId}-${activeKey}` : undefined}
                aria-labelledby={`${baseId}-label`}
                className="motion-fade-in scrolly fixed z-30 max-h-80 overflow-y-auto rounded-lg border border-hairline bg-sheet py-1 shadow-lg"
                role="listbox"
                // The anchored popup matches its trigger's width: the rail's
                // scope field is the only ≥lg host, and the rows are built to
                // read inside it (see rowClassName).
                style={{
                  left: position.left,
                  top: position.top,
                  width: position.width,
                }}
                tabIndex={-1}
                onKeyDown={handleListKeyDown}
              >
                {renderOptionRows()}
              </ul>
            ),
          document.body,
        )
        : null}
    </div>
  );
}

function rowClassName(row: ScopeMenuRow, isActive: boolean): string {
  // Spec §17m.5's other half: the row's own type and insets come down so the
  // availability line above always has room — 13px instead of 14px, and ~7px of
  // horizontal padding and gap given back. The 44px row height is untouched
  // (min-h-11, the kit's floor for a pointer target), so nothing here trades
  // reach for legibility.
  //
  // At every width, deliberately: spec §4's universal contract is "one dropdown,
  // three scope kinds, identical on desktop and mobile (mobile renders it as a
  // full-screen sheet)", and a per-breakpoint row type would make the sheet a
  // different menu rather than the same one in another frame.
  const base =
    "flex min-h-11 cursor-pointer items-center justify-between gap-2.5 pr-2.5 text-[13px]";
  const indent = row.nested ? "pl-6" : "pl-2.5";
  if (!row.interactive) {
    return `${base} ${indent} cursor-not-allowed text-ink-muted`;
  }
  const weight = row.nested ? "font-medium" : "font-semibold";
  // A closed row is already non-interactive above; this keeps the muted tone
  // as the only "closed" cue an interactive row would ever need (spec §10b:
  // the word "closed" never renders).
  const tone = row.availability.open ? "text-ink" : "text-ink-muted";
  const highlight = isActive ? "bg-accent/10" : "";
  return `${base} ${indent} ${weight} ${tone} ${highlight}`;
}
