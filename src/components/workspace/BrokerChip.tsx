// E8 Markets is presentation-only in this stage (spec §12: "no toggle, no
// second broker") but must appear as a visible chip wherever the app names
// the broker — Profile's Broker card and both mastheads today. One component
// keeps every call site byte-identical instead of hand-copied spans drifting
// apart later.
//
// The treatment is the mock's own .broker (docs/design/mockups/tokens.css:22-24,
// drawn on the masthead at a-desk-v3.html:82): a 13px bold pill on sheet with a
// 1.5px hairline border, a 6px radius, 7px/12px padding and an 8px buy dot —
// not the app's .chip idiom, which is an 11px uppercase micro-label for the
// scan and trade rows. The mock's ▾ caret is omitted: spec §12 has no toggle
// behind it.
export function BrokerChip() {
  return (
    <span className="inline-flex items-center gap-2 rounded-md border-[1.5px] border-hairline bg-sheet px-3 py-[7px] text-[13px] font-bold text-ink">
      <span className="h-2 w-2 rounded-full bg-buy" aria-hidden="true" />
      E8 Markets
    </span>
  );
}
