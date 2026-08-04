import { useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { AccountSwitcherMenu, labelAccounts } from "./AccountSwitcherMenu";
import type { BrokerAccount } from "../../lib/profile";

// E8 Markets is presentation-only in this stage (spec §12: "no toggle, no
// second broker") but must appear as a visible chip wherever the app names
// the broker — Profile's Broker card and both mastheads today. One component
// keeps every call site byte-identical instead of hand-copied spans drifting
// apart later.
//
// The treatment is the mock's own .broker (docs/design/mockups/tokens.css:22-24,
// drawn on the masthead at a-desk-v3.html:81): a 13px bold pill on sheet with a
// 1.5px hairline border, a 6px radius, 7px/12px padding and an 8px buy dot —
// not the app's .chip idiom, which is an 11px uppercase micro-label for the
// scan and trade rows. The mock's ▾ caret is omitted on the informational form:
// spec §12 has no toggle behind it there.
// compact is the mobile masthead's variant (m-mobile-v3.html:43): the same
// pill at 12px and 5px/9px padding, labeled just "E8". Content surfaces
// (Profile's Broker card, Insights) keep the full name — the compaction is
// the top bar's space ruling, not a rename, so the accessible name stays
// "E8 Markets" in both variants.
//
// §19 retrofit, amendment 18: with one or more saved accounts the chip
// becomes the account switcher — this file owns the trigger button
// (aria-haspopup, aria-expanded, the pill's own visuals) and mounts
// AccountSwitcherMenu.tsx as the popup half. §17n's 44px floor is new to
// every state below, because the informational span used to carry no
// interaction at all (spec §12's "no toggle") — min-h-11 goes directly on
// whichever element is now the real button, the same shape App.tsx's
// MobileAccountMenu trigger already uses (one element, sized to the floor,
// its content simply smaller and centered inside it) rather than a wrapper
// div absorbing the height around an unchanged inner span.
export function BrokerChip(
  { accounts, activeId, compact = false, onManage, onSelect }: {
    accounts: BrokerAccount[];
    activeId: string | null;
    compact?: boolean;
    onManage: () => void;
    onSelect: (id: string) => void;
  },
) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  if (accounts.length === 0) {
    // Today's informational form, now tappable: no broker is configured yet,
    // so the chip's one job is routing to Profile's broker setup — the same
    // destination App.tsx's MobileAccountMenu names on its own onOpenProfile
    // prop, reached here through onManage, the single navigation prop this
    // component takes with or without a saved account ("Manage accounts"
    // below and "go set one up" here are the same trip to the same tab).
    if (compact) {
      return (
        <button
          aria-label="E8 Markets"
          className="inline-flex min-h-11 items-center gap-2 rounded-md border-[1.5px] border-hairline bg-sheet px-[9px] py-[5px] text-xs font-bold text-ink"
          type="button"
          onClick={onManage}
        >
          <span className="h-2 w-2 rounded-full bg-buy" aria-hidden="true" />
          E8
        </button>
      );
    }
    return (
      <button
        className="inline-flex min-h-11 items-center gap-2 rounded-md border-[1.5px] border-hairline bg-sheet px-3 py-[7px] text-[13px] font-bold text-ink"
        type="button"
        onClick={onManage}
      >
        <span className="h-2 w-2 rounded-full bg-buy" aria-hidden="true" />
        E8 Markets
      </button>
    );
  }

  // Task 2b's carry-forward: activateBrokerAccount throws on an id the
  // caller has not saved. saveBrokerAccount never activates its own new row
  // (useUserProfile.ts has no such chain), so a freshly-saved first account
  // can leave activeBrokerAccountId null for a render or two — accounts with
  // one or more rows and nothing yet resolved-active. resolvedActiveId falls
  // back to the first saved account for DISPLAY only; it never calls
  // onSelect itself, and a real activation still only happens when the
  // reader picks a row (a fresh, render-bound interaction — never chained
  // after a save, per the carry-forward).
  const activeAccount = accounts.find((account) => account.id === activeId);
  const resolvedActiveId = activeAccount?.id ?? accounts[0].id;
  const current = labelAccounts(accounts).find(
    (entry) => entry.account.id === resolvedActiveId,
  )!;

  const pillClassName = compact
    ? "inline-flex min-h-11 items-center gap-2 rounded-md border-[1.5px] border-hairline bg-sheet px-[9px] py-[5px] text-xs font-bold uppercase tracking-[0.05em] text-ink whitespace-nowrap"
    : "inline-flex min-h-11 items-center gap-2 rounded-md border-[1.5px] border-hairline bg-sheet px-3 py-[7px] text-[13px] font-bold uppercase tracking-[0.06em] text-ink whitespace-nowrap";

  return (
    <>
      <button
        ref={triggerRef}
        aria-expanded={open}
        aria-haspopup="menu"
        className={pillClassName}
        type="button"
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => {
          if (["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        <span className="h-2 w-2 rounded-full bg-buy" aria-hidden="true" />
        {current.label}
        <ChevronDown className="h-4 w-4 shrink-0 text-ink-muted" aria-hidden="true" />
      </button>
      {open
        ? (
          <AccountSwitcherMenu
            accounts={accounts}
            activeId={resolvedActiveId}
            onClose={() => setOpen(false)}
            onManage={onManage}
            onSelect={onSelect}
            triggerRef={triggerRef}
          />
        )
        : null}
    </>
  );
}
