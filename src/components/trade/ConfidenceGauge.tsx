import { getConfidenceTier } from "../../lib/confidenceTiers";

type ConfidenceGaugeProps = {
  score: number;
  label?: string;
};

export function ConfidenceGauge({ score, label = "Confidence" }: ConfidenceGaugeProps) {
  const clamped = Math.max(0, Math.min(100, score));
  const tier = getConfidenceTier(clamped);
  const stroke = clamped >= 85
    ? "#5B8266"
    : clamped >= 75
      ? "#4E6F5A"
      : clamped >= 66
        ? "#B98948"
        : "#A94D4D";

  return (
    <div className="w-full min-w-0">
      <div className="relative mx-auto aspect-[2/1] w-full max-w-[260px] overflow-hidden">
        <svg viewBox="0 0 200 112" className="h-full w-full" role="img" aria-label={`${label}: ${clamped}`}>
          <path
            d="M 20 100 A 80 80 0 0 1 180 100"
            fill="none"
            stroke="rgba(128, 138, 149, 0.22)"
            strokeLinecap="round"
            strokeWidth="18"
            pathLength={100}
          />
          <path
            d="M 20 100 A 80 80 0 0 1 180 100"
            fill="none"
            stroke={stroke}
            strokeLinecap="round"
            strokeWidth="18"
            pathLength={100}
            strokeDasharray={`${clamped} 100`}
          />
        </svg>
        <div className="absolute inset-x-0 bottom-0 flex flex-col items-center">
          <span className="text-4xl font-semibold tracking-normal text-navy">{clamped}</span>
          <span className="text-xs font-medium uppercase tracking-normal text-slate">
            {tier ? `${tier.label} ${label}` : label}
          </span>
        </div>
      </div>
    </div>
  );
}
