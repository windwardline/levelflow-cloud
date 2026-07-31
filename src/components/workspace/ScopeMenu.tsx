import {
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
  formatSecurityDisplaySymbol,
  formatSecurityLabel,
  type SecurityGroup,
  type SecurityType,
  type SupportedSymbol,
} from "../../lib/symbolMap";
import {
  formatReopen,
  marketAvailability,
  type MarketAvailability,
} from "../../lib/marketHours";

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

// What the trigger button itself shows. The "heading" variant is the Desk
// stagehead's display heading (spec §16, a-desk-v3.html:165), where the full
// descriptive label ("EUR/USD - Euro / U.S. Dollar") would run past the whole
// stage at heading size — it shows the ticker alone. Every other presentation,
// the option rows included, stays on the full label.
export function scopeTriggerLabel(
  scope: ScanScope,
  variant: "field" | "heading",
): string {
  return variant === "heading" && scope.kind === "symbol"
    ? formatSecurityDisplaySymbol(scope.symbol)
    : describeScanScope(scope);
}

// The open-state affordance ("Scan N") only ever applies to "all"/"group"
// rows outside symbol-only mode - spec §4 gives individual market rows no
// affordance when open. The closed-state reopen label applies uniformly
// (markets, groups, and in principle "all" alike); the caller uppercases it
// via CSS and the word "closed" itself never renders (spec §10b) - the
// muted, non-interactive row IS the signal.
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
  const time = new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(now);
  return `${describeScanScope(scope)} — ${counts.scanned} scanned · ${counts.qualified} qualify · ${time}`;
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

// In `symbolOnly` mode (the stage's direct-review picker) "All markets" is
// dropped and every group row becomes a plain, non-interactive section
// header - reviewing is always exactly one market (spec §4: "the stage
// picker stays as the direct review shortcut"), so only symbol rows stay
// selectable. Closed groups keep their reopen affordance in this mode too
// (it still explains why the symbols under it are muted); open ones show
// nothing, since there is no scan action to take from here.
//
// I4: unlike the scan scope menu (where a closed market genuinely can't be
// scanned - I5), the stage picker's whole job is direct review, and
// reviewing a market has never required it to be open. Before this fix,
// symbol rows inherited their group's `interactive: availability.open`
// unconditionally, so on a weekend the stage could not select any
// non-crypto market at all. Symbol rows are forced interactive here
// regardless of availability; rowClassName still mutes a closed one's text
// as the visual "closed" cue (spec #10b), it just no longer also disables
// the click.
export function effectiveRows(
  rows: ScopeMenuRow[],
  symbolOnly: boolean,
): ScopeMenuRow[] {
  if (!symbolOnly) {
    return rows;
  }
  return rows
    .filter((row) => row.scope.kind !== "all")
    .map((row) => {
      if (row.scope.kind === "group") {
        return { ...row, interactive: false };
      }
      return row.interactive ? row : { ...row, interactive: true };
    });
}

export function showsAffordance(row: ScopeMenuRow, symbolOnly: boolean): boolean {
  // "All markets" never shows a count (see buildScopeMenuRows) and is
  // never closed, so it never has anything to show here.
  if (row.scope.kind === "all") {
    return false;
  }
  if (!row.availability.open) {
    return true;
  }
  if (row.scope.kind === "symbol") {
    return false;
  }
  return !symbolOnly;
}

// Mobile renders the menu as a full-screen sheet instead of an anchored
// popup — spec §4's universal contract: "One dropdown, three scope kinds,
// identical on desktop and mobile (mobile renders it as a full-screen
// sheet)." That applies to every ScopeMenu instance (the stage's symbolOnly
// picker and the scan scope selector alike), so the choice lives inside the
// component itself rather than as a prop each of today's two call sites
// would otherwise need to compute and thread through identically.
//
// 1024 mirrors --breakpoint-lg (src/styles/index.css) exactly rather than
// introducing a second number that could drift from it. This is a plain
// pixel comparison, not a rem media query, so it can't fall prey to the bug
// that made index.css's breakpoints pixel-pinned in the first place (rem
// breakpoints resolve against the browser's font-size setting); a
// `min-width: 1024px` match here always agrees with Tailwind's own
// `lg:`-generated media query.
export const MOBILE_SHEET_BREAKPOINT_PX = 1024;

// Floor for the anchored popup under a "heading" trigger — see the style
// prop on the popup below for why only that variant needs one.
const HEADING_MENU_MIN_WIDTH_PX = 288;

export function shouldUseSheetLayout(viewportWidthPx: number): boolean {
  return viewportWidthPx < MOBILE_SHEET_BREAKPOINT_PX;
}

function useScopeMenuSheetMode(): boolean {
  const [sheet, setSheet] = useState(() =>
    typeof window === "undefined"
      ? false
      : shouldUseSheetLayout(window.innerWidth)
  );

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const query = window.matchMedia(
      `(min-width: ${MOBILE_SHEET_BREAKPOINT_PX}px)`,
    );
    const onChange = () => setSheet(!query.matches);
    onChange();
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  return sheet;
}

export type ScopeMenuProps = {
  /** Accessible label for the trigger (e.g. "Scan scope", "Market"), and the sheet's title. */
  label: string;
  /** Injectable clock for tests; defaults to `new Date()`. */
  now?: Date;
  onSelect: (scope: ScanScope) => void;
  /**
   * Whether `label` also renders as a visible caption above the trigger.
   * Spec §16's recomposed Desk draws neither picker with one (the stage's
   * market name IS the stagehead heading, and the rail leads with its own
   * "Scan" eyebrow), so both call sites pass false and the trigger carries
   * `label` as its aria-label instead — same accessible name, no caption.
   */
  showLabel?: boolean;
  /**
   * Restricts the menu to symbol selection: no "All markets" row, and group
   * rows become inert section headers. Used for the stage's direct-review
   * picker, which always needs exactly one market.
   */
  symbolOnly?: boolean;
  value: ScanScope;
  /**
   * "field" is the kit's bordered form control (the scan rail's scope
   * picker). "heading" renders the trigger as the stagehead's display
   * heading — the market name at heading size on bare paper
   * (a-desk-v3.html:165) — while keeping the identical listbox behavior,
   * closed-market muting and reopen affordances included.
   */
  variant?: "field" | "heading";
};

// Accessible "collapsible dropdown listbox" (button + popup, WAI-ARIA APG),
// not a native <select> - closed markets need to render muted and
// unselectable with their own reopen affordance, which a native <option>
// cannot do. The popup renders through a portal because its two hosts
// (MarketScanPanel, AdvisorWorkspace's stage header) both sit inside
// `.terminal-panel`, which clips overflow for its rounded corners/shadow;
// an absolutely-positioned popup would be clipped there.
export function ScopeMenu(
  {
    label,
    now,
    onSelect,
    showLabel = true,
    symbolOnly = false,
    value,
    variant = "field",
  }: ScopeMenuProps,
) {
  const baseId = useId();
  const sheet = useScopeMenuSheetMode();
  const [open, setOpen] = useState(false);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [position, setPosition] = useState<
    { left: number; top: number; width: number } | null
  >(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // Recomputed on every render, not memoized: `now` defaulting to
  // `new Date()` would otherwise make `clock` a fresh value on every render
  // anyway, so the memo would never actually skip work. buildScopeMenuRows
  // is cheap (one pass over ~50 rows), and staying live means availability
  // reflects the real clock the moment the menu is opened rather than
  // whatever it was when the component last happened to re-render for some
  // other reason.
  const clock = now ?? new Date();
  const rows = effectiveRows(buildScopeMenuRows(clock), symbolOnly);

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

  function close() {
    setOpen(false);
    setPosition(null);
  }

  function closeAndFocusTrigger() {
    close();
    triggerRef.current?.focus();
  }

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
        !rootRef.current?.contains(target) && !listRef.current?.contains(target)
      ) {
        close();
      }
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
    window.addEventListener("scroll", handleScroll, true);
    window.addEventListener("resize", handleResize);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("scroll", handleScroll, true);
      window.removeEventListener("resize", handleResize);
    };
  }, [open]);

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
            <span className="truncate">{row.label}</span>
          </span>
          {showsAffordance(row, symbolOnly)
            ? (
              <span className="shrink-0 font-mono text-xs font-semibold uppercase tracking-normal text-ink-muted">
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
      case "Escape":
        event.preventDefault();
        closeAndFocusTrigger();
        return;
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
    <div ref={rootRef} className={variant === "heading" ? "grid min-w-0" : "grid min-w-0 gap-1"}>
      {showLabel
        ? (
          <span
            id={`${baseId}-label`}
            className="text-xs font-semibold uppercase tracking-normal text-ink-muted"
          >
            {label}
          </span>
        )
        : null}
      <button
        ref={triggerRef}
        aria-expanded={open}
        aria-haspopup="listbox"
        // With no visible caption there is no label element to point at, so
        // the trigger carries the name itself. aria-label and aria-labelledby
        // are mutually exclusive here on purpose: setting both would let the
        // labelledby chain win and silently re-introduce a reference to an
        // element that is no longer rendered.
        aria-label={showLabel ? undefined : label}
        aria-labelledby={showLabel ? `${baseId}-label ${baseId}-value` : undefined}
        className={variant === "heading"
          ? "flex min-w-0 items-center gap-2 border-none bg-transparent p-0 text-left font-display text-2xl font-bold text-ink"
          : "field flex w-full items-center justify-between gap-2 text-left text-sm font-semibold normal-case text-ink"}
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
          {scopeTriggerLabel(value, variant)}
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
                aria-labelledby={`${baseId}-sheet-title`}
                aria-modal="true"
                className="fixed inset-0 z-30 flex flex-col bg-sheet"
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
                className="scrolly fixed z-30 max-h-80 overflow-y-auto rounded-lg border border-hairline bg-sheet py-1 shadow-lg"
                role="listbox"
                // The anchored popup normally matches its trigger's width. A
                // "heading" trigger is only as wide as the ticker it shows
                // ("ES"), which would squeeze every descriptive option label
                // to nothing — the floor applies to that variant alone so the
                // ≥lg scan-rail popup keeps its exact previous geometry.
                style={{
                  left: position.left,
                  minWidth: variant === "heading"
                    ? HEADING_MENU_MIN_WIDTH_PX
                    : undefined,
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
  const base =
    "flex min-h-11 cursor-pointer items-center justify-between gap-3 pr-3 text-sm";
  const indent = row.nested ? "pl-7" : "pl-3";
  if (!row.interactive) {
    return `${base} ${indent} cursor-not-allowed text-ink-muted`;
  }
  const weight = row.nested ? "font-medium" : "font-semibold";
  // I4: a symbolOnly market row stays clickable even when its group is
  // closed (effectiveRows), but still reads as closed - muted text, same
  // tone as the disabled case above, just without cursor-not-allowed.
  const tone = row.availability.open ? "text-ink" : "text-ink-muted";
  const highlight = isActive ? "bg-accent/10" : "";
  return `${base} ${indent} ${weight} ${tone} ${highlight}`;
}
