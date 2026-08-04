import {
  useCallback,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { CLASSIFICATIONS } from "../../lib/broker/catalog";
import type { BrokerAccount } from "../../lib/profile";
import { useIsMobileViewport } from "../../hooks/useMobileViewport";

// ---------------------------------------------------------------------------
// The label formula (§19 retrofit, amendment 18; TASK 6 VERDICT, plan
// 2026-08-03: "the PIPED dressing ships everywhere: `E8 | FOREX | 100K`,
// ALL CAPS, at every width and on every surface"). One function derives
// every displayed account label — BrokerChip's own trigger text and every
// row this menu renders both call labelAccounts, so the formula, the
// byte-intact tokens the caps transform reads, and the collision suffix can
// never drift apart between the two surfaces.
// ---------------------------------------------------------------------------

export type LabeledBrokerAccount = { account: BrokerAccount; label: string };

function kFormAccountSize(size: number): string {
  // Every catalog ladder (programs.ts's ONE_LADDER/PRO_LADDER/
  // SIGNATURE_LADDER/ZERO_LADDER) is a clean multiple of 1,000 from $5,000 to
  // $500,000, so this never actually rounds a real account's size —
  // Math.round is a defensive floor against a future off-ladder value, not a
  // rounding this data needs today.
  return `${Math.round(size / 1000)}K`;
}

function formatAccountFormula(account: BrokerAccount): string {
  // CLASSIFICATIONS (catalog.ts) is total over BrokerClassification's three
  // values, and brokerAccountProblem (profile.ts) already refuses to save a
  // draft whose classification does not match its program line's — so a
  // saved account's classification always resolves here.
  const classification = CLASSIFICATIONS.find(
    (entry) => entry.value === account.classification,
  )!.label;
  // "E8" is a literal, not derived from account.brokerId: the type holds
  // only the one value "e8" (spec §12, one broker), so deriving a constant
  // from a constant would just be indirection.
  return `E8 | ${classification} | ${kFormAccountSize(account.accountSize)}`;
}

/**
 * Every account's displayed label: the formula plus the owner's collision
 * suffix (TASK 6 VERDICT) — a single space then a 1-based ordinal in
 * parentheses, e.g. " (1)", " (2)", never the mockup's original "-1". Two
 * accounts collide when their formula strings match exactly: the formula
 * carries only classification and size, never program line, platform,
 * stage, or drawdown tier, so an E8 One $100,000 account and an E8 Pro Forex
 * $100,000 account are indistinguishable by formula alone (the mockup's own
 * demonstration, docs/design/mockups/s-switcher-v1.html).
 *
 * Ordinal assignment is a pure function of the account SET, not of the order
 * `accounts` happens to arrive in: within a colliding group, members are
 * sorted by `id` before ordinals are handed out, so the same account always
 * gets the same suffix regardless of how the caller's array is ordered
 * (Supabase's own `.select()` carries no ORDER BY — see useUserProfile.ts).
 * The lowest-`id` member of a group renders bare; each next member appends
 * its 1-based position in that sorted group. A group of one never carries a
 * suffix. A rename is a later task (TASK 6 VERDICT) — this is the formula
 * and the suffix machinery only; BrokerAccount carries no name field yet.
 */
export function labelAccounts(accounts: BrokerAccount[]): LabeledBrokerAccount[] {
  const groups = new Map<string, BrokerAccount[]>();
  for (const account of accounts) {
    const formula = formatAccountFormula(account);
    const group = groups.get(formula);
    if (group) {
      group.push(account);
    } else {
      groups.set(formula, [account]);
    }
  }

  const suffixById = new Map<string, string>();
  for (const group of groups.values()) {
    const ordered = [...group].sort((a, b) => a.id.localeCompare(b.id));
    ordered.forEach((account, index) => {
      suffixById.set(account.id, index === 0 ? "" : ` (${index})`);
    });
  }

  return accounts.map((account) => ({
    account,
    label: `${formatAccountFormula(account)}${suffixById.get(account.id) ?? ""}`,
  }));
}

// ---------------------------------------------------------------------------
// The interactive menu (amendment 18): ScopeMenu.tsx's own machinery —
// useIsMobileViewport's sheet/anchored-popup split, createPortal(...,
// document.body), closeAndFocusTrigger, document-level Escape, and
// outside-mousedown handling — reapplied to a menu that switches which
// account is active rather than a value the caller has not yet committed to
// (hence role="menu"/"menuitem" here, not ScopeMenu's listbox/option).
//
// Split from BrokerChip rather than folded into one component (unlike
// ScopeMenu, which owns both its trigger and its popup): the switcher's own
// pill visuals and aria-haspopup/aria-expanded live on BrokerChip's trigger
// button, so this component is the popup half alone, told where to anchor
// via the trigger's own ref rather than owning one itself.
// ---------------------------------------------------------------------------

type MenuItem =
  | { kind: "account"; key: string; account: BrokerAccount; label: string }
  | { kind: "manage"; key: "manage" };

function moveHighlight(
  itemKeys: string[],
  currentKey: string | null,
  direction: 1 | -1,
): string | null {
  if (itemKeys.length === 0) {
    return null;
  }
  const currentPos = currentKey ? itemKeys.indexOf(currentKey) : -1;
  if (currentPos === -1) {
    return direction === 1 ? itemKeys[0] : itemKeys[itemKeys.length - 1];
  }
  const nextPos = (currentPos + direction + itemKeys.length) % itemKeys.length;
  return itemKeys[nextPos];
}

// Every row (account or "Manage accounts") shares one shape: min-h-11 (§17n)
// and the same uppercase + tracking pairing BrokerChip's own trigger uses,
// inherited by any plain-text child (CSS text-transform is an inherited
// property) rather than repeated per span — the account row's own "Active"
// marker included. Unlike ScopeMenu's rowClassName there is no disabled
// state to carry: every row here is always interactive.
function rowClassName(isManage: boolean, isActive: boolean): string {
  const base =
    "flex min-h-11 cursor-pointer items-center gap-2.5 px-2.5 text-[13px] uppercase tracking-[0.06em]";
  const shape = isManage ? "font-semibold" : "justify-between font-bold border-b border-hairline";
  const tone = isManage ? "text-ink-muted" : "text-ink";
  const highlight = isActive ? "bg-accent/10" : "";
  return `${base} ${shape} ${tone} ${highlight}`;
}

type AccountSwitcherMenuProps = {
  accounts: BrokerAccount[];
  activeId: string | null;
  onClose: () => void;
  onManage: () => void;
  onSelect: (id: string) => void;
  triggerRef: RefObject<HTMLButtonElement | null>;
};

type Position = { left: number; top: number; width: number };

// Accessible "collapsible menu" (button + popup, WAI-ARIA APG menu pattern),
// portaled to document.body for the same reason ScopeMenu's popup is: the
// host can sit inside a clipping ancestor (a scroll container, an overflow
// region), and an absolutely-positioned popup would be cut off at its edge.
export function AccountSwitcherMenu(
  { accounts, activeId, onClose, onManage, onSelect, triggerRef }:
    AccountSwitcherMenuProps,
) {
  const baseId = useId();
  const sheet = useIsMobileViewport();
  const labeled = labelAccounts(accounts);
  const items: MenuItem[] = [
    ...labeled.map(({ account, label }): MenuItem => ({
      account,
      key: `account:${account.id}`,
      kind: "account",
      label,
    })),
    { key: "manage", kind: "manage" },
  ];
  const itemKeys = items.map((item) => item.key);
  const initialKey = activeId !== null && itemKeys.includes(`account:${activeId}`)
    ? `account:${activeId}`
    : itemKeys[0] ?? null;
  const [activeKey, setActiveKey] = useState<string | null>(initialKey);

  const listRef = useRef<HTMLDivElement>(null);
  // The mobile sheet's own root. listRef covers only the row list, and the
  // sheet's header — its Close control — is a SIBLING of that list inside
  // the portal, so without this ref the outside-press listener below would
  // treat a press on Close as a press outside the menu (ScopeMenu's own
  // documented reason for the equivalent ref). Null in the anchored-popup
  // presentation, where the row list IS the portal's root.
  const sheetRef = useRef<HTMLDivElement>(null);

  // A ref is read here (triggerRef.current), which react-hooks/refs rightly
  // keeps out of the render body — ScopeMenu.tsx's own place() sidesteps this
  // by only ever running from an event handler (openMenu(), called from the
  // trigger's own onClick, before setOpen(true)). This component cannot use
  // that trick: it does not exist until BrokerChip's `open` is already true,
  // so there is no shared event handler for it to piggyback on. useCallback
  // plus the layout effect below is the sanctioned alternative — position
  // starts null and is computed once, synchronously before paint, so there
  // is no visible frame where the anchored popup renders at the wrong spot.
  const place = useCallback((): Position | null => {
    const rect = triggerRef.current?.getBoundingClientRect();
    return rect ? { left: rect.left, top: rect.bottom + 4, width: rect.width } : null;
  }, [triggerRef]);

  const [position, setPosition] = useState<Position | null>(null);

  const closeAndFocusTrigger = useCallback(() => {
    onClose();
    triggerRef.current?.focus();
  }, [onClose, triggerRef]);

  // The keyboard path's own activation (Enter/Space on the highlighted item,
  // in handleKeyDown below) — the per-row mouse path does not call this: an
  // onClick that reaches closeAndFocusTrigger's ref read through a named
  // helper, from inside the rows' own .map(), is exactly what tripped
  // react-hooks/refs below (a real constraint the codebase's C1-style guards
  // taught this file to work around rather than silence — see the rows
  // comment), so each row's onClick reads triggerRef.current directly
  // instead of routing through this function.
  const activate = useCallback((item: MenuItem) => {
    if (item.kind === "manage") {
      onManage();
    } else {
      onSelect(item.account.id);
    }
    closeAndFocusTrigger();
  }, [closeAndFocusTrigger, onManage, onSelect]);

  // Layout, not a plain effect: it must run before the browser paints, both
  // so the anchored popup never flashes at {0,0} on its very first frame and
  // so reading triggerRef.current here (rather than during render, above)
  // satisfies react-hooks/refs — effects, layout effects included, are the
  // rule's own sanctioned place for a ref read.
  useLayoutEffect(() => {
    listRef.current?.focus();
    setPosition(place());

    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (
        !triggerRef.current?.contains(target) &&
        !sheetRef.current?.contains(target) &&
        !listRef.current?.contains(target)
      ) {
        onClose();
      }
    }
    // Escape on the document rather than only inside the row list's own
    // switch below: the sheet's header is not focusable, so a tap on it
    // leaves document.activeElement on the body, where a React handler bound
    // to the row list hears nothing. One owner for the key, so a press can
    // never take two paths to one dismissal (ScopeMenu's own reasoning).
    function handleEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") {
        return;
      }
      event.preventDefault();
      closeAndFocusTrigger();
    }
    function handleScroll(event: Event) {
      // Scrolling inside the popup's own row list is normal menu use, not a
      // reason to dismiss it — only an ancestor of the trigger scrolling
      // (which would leave the popup floating over the wrong spot) should
      // close it.
      if (listRef.current?.contains(event.target as Node)) {
        return;
      }
      onClose();
    }
    function handleResize() {
      setPosition(place());
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
    // place, onClose and closeAndFocusTrigger are all useCallback-stable;
    // triggerRef is a ref object PROP whose identity BrokerChip never
    // changes across its own re-renders. This effect therefore has nothing
    // that changes across this component's short mounted lifetime, matching
    // ScopeMenu's own "one real dependency" shape for its equivalent
    // open-effect.
  }, [closeAndFocusTrigger, onClose, place, triggerRef]);

  function handleKeyDown(event: ReactKeyboardEvent) {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        setActiveKey((current) => moveHighlight(itemKeys, current, 1));
        return;
      case "ArrowUp":
        event.preventDefault();
        setActiveKey((current) => moveHighlight(itemKeys, current, -1));
        return;
      case "Home":
        event.preventDefault();
        setActiveKey(itemKeys[0] ?? null);
        return;
      case "End":
        event.preventDefault();
        setActiveKey(itemKeys[itemKeys.length - 1] ?? null);
        return;
      case "Enter":
      case " ": {
        event.preventDefault();
        const item = items.find((candidate) => candidate.key === activeKey);
        if (item) {
          activate(item);
        }
        return;
      }
      // Escape is deliberately absent: the document-level listener above
      // owns it, so it works from the sheet's header too.
      case "Tab":
        // The popup is portaled to document.body, outside the trigger's real
        // position in the page's DOM order. Letting native Tab traversal
        // continue from inside the portal would land focus somewhere
        // unrelated to where the reader actually is; closing and returning
        // focus to the trigger (same as Escape) keeps the next real Tab
        // press continuing from the right spot in the page.
        event.preventDefault();
        closeAndFocusTrigger();
        return;
      default:
    }
  }

  // Computed once per render as a plain value, rather than a renderRows()
  // function called from inside the JSX (ScopeMenu's own renderOptionRows()
  // shape) — react-hooks/refs (eslint-plugin-react-hooks 7.1.1's React
  // Compiler-derived analysis) could not prove a ref read inside either
  // shape was safely deferred to a click rather than reachable during
  // render, empirically, for THIS component: a .map()-built onClick that
  // reaches triggerRef.current only through a named helper (activate ->
  // closeAndFocusTrigger, ScopeMenu's own pattern) tripped it here even
  // though ScopeMenu's structurally identical version does not. Each row's
  // onClick below reads triggerRef.current directly instead, which the rule
  // accepts — still only ever executed on an actual click, exactly as
  // before, just spelled out inline rather than through the shared helper.
  const rows = items.map((item) => {
    const isHighlighted = item.key === activeKey;
    if (item.kind === "manage") {
      return (
        <div
          key={item.key}
          id={`${baseId}-${item.key}`}
          role="menuitem"
          className={rowClassName(true, isHighlighted)}
          onClick={() => {
            onManage();
            onClose();
            triggerRef.current?.focus();
          }}
          onMouseEnter={() => setActiveKey(item.key)}
        >
          Manage accounts
        </div>
      );
    }
    const isCurrent = item.account.id === activeId;
    return (
      <div
        key={item.key}
        aria-current={isCurrent ? "true" : undefined}
        id={`${baseId}-${item.key}`}
        role="menuitem"
        className={rowClassName(false, isHighlighted)}
        onClick={() => {
          onSelect(item.account.id);
          onClose();
          triggerRef.current?.focus();
        }}
        onMouseEnter={() => setActiveKey(item.key)}
      >
        <span className="min-w-0 truncate">{item.label}</span>
        {isCurrent
          ? (
            <span className="shrink-0 whitespace-nowrap text-[10.5px] font-bold tracking-[0.08em] text-accent">
              Active
            </span>
          )
          : null}
      </div>
    );
  });

  return createPortal(
    sheet
      ? (
        <div
          ref={sheetRef}
          role="dialog"
          aria-modal="true"
          // No visible title: the mockup's "Accounts" sheet caption is not
          // in this task's composition authority (chip classes, anchored
          // menu, §17g sheet, ACTIVE marker, Manage accounts foot row), and
          // it is not yet a registered §20j string — the accessible name
          // below reuses the chip's own established one instead of coining
          // new copy.
          aria-label="E8 Markets"
          className="motion-fade-in fixed inset-0 z-30 flex flex-col bg-sheet"
        >
          <div className="flex shrink-0 items-center justify-end border-b border-hairline px-4 py-3">
            <button
              aria-label="Close"
              className="cpv-copy"
              type="button"
              onClick={closeAndFocusTrigger}
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
          <div
            ref={listRef}
            aria-activedescendant={activeKey ? `${baseId}-${activeKey}` : undefined}
            aria-label="E8 Markets"
            className="scrolly flex-1 overflow-y-auto py-1"
            role="menu"
            tabIndex={-1}
            onKeyDown={handleKeyDown}
          >
            {rows}
          </div>
        </div>
      )
      : position
      ? (
        <div
          ref={listRef}
          aria-activedescendant={activeKey ? `${baseId}-${activeKey}` : undefined}
          aria-label="E8 Markets"
          className="motion-fade-in scrolly fixed z-30 max-h-80 overflow-y-auto rounded-lg border border-hairline bg-sheet py-1 shadow-lg"
          role="menu"
          style={{ left: position.left, top: position.top, width: position.width }}
          tabIndex={-1}
          onKeyDown={handleKeyDown}
        >
          {rows}
        </div>
      )
      : null,
    document.body,
  );
}
