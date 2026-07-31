// E8 Markets is presentation-only in this stage (spec §12: "no toggle, no
// second broker") but must appear as a visible chip wherever the app names
// the broker — Profile's Broker card and the mobile header's compact
// identity strip today. One component keeps both call sites byte-identical
// instead of two hand-copied spans drifting apart later.
export function BrokerChip() {
  return (
    <span className="chip inline-flex items-center gap-1.5 text-ink-muted">
      <span className="h-1.5 w-1.5 rounded-full bg-buy" aria-hidden="true" />
      E8 Markets
    </span>
  );
}
