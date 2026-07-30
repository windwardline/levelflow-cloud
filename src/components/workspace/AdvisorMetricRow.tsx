export function MetricRow({
  label,
  value,
  valueClassName = "text-ink",
}: {
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div className="flex min-h-10 min-w-0 items-center justify-between gap-3 rounded-lg bg-paper px-3 py-2">
      <span className="min-w-0 text-ink-muted">{label}</span>
      <span
        className={`min-w-0 text-right font-mono font-semibold tabular-nums ${valueClassName}`}
      >
        {value}
      </span>
    </div>
  );
}
