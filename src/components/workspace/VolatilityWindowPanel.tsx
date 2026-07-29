import { useEffect, useState } from "react";
import { Clock3, TrendingUp } from "lucide-react";
import { fetchMarketData, type MarketDataResponse } from "../../lib/marketData";
import type { SupportedSymbol } from "../../lib/symbolMap";
import { findBestVolatilityWindow } from "../../lib/volatilityWindows";

type VolatilityWindowPanelProps = {
  symbol: SupportedSymbol;
  timezone: string;
};

export function VolatilityWindowPanel({
  symbol,
  timezone,
}: VolatilityWindowPanelProps) {
  const [data, setData] = useState<MarketDataResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const window = data ? findBestVolatilityWindow(data.points, timezone) : null;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setNotice("");

    fetchMarketData({ days: 60, symbol, timeframe: "15min" })
      .then((nextData) => {
        if (!cancelled) {
          setData(nextData);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setData(null);
          setNotice(
            "Recent intraday movement is not available for this market yet.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [symbol]);

  return (
    <section className="terminal-panel p-5">
      <div className="mb-4 flex items-center gap-3">
        <Clock3 className="h-5 w-5 text-navy" aria-hidden="true" />
        <div>
          <p className="text-sm font-semibold text-slate">Timing edge</p>
          <h3 className="text-lg font-semibold tracking-normal text-navy">
            Best time window
          </h3>
        </div>
      </div>

      {loading
        ? (
          <p className="text-sm leading-6 text-slate">
            Measuring recent intraday movement.
          </p>
        )
        : window
        ? (
          <div className="grid gap-3">
            <div className="rounded-lg border border-bullish/20 bg-bullish/10 px-3 py-3">
              <p className="text-xs font-semibold uppercase tracking-normal text-bullish">
                {window.sessionLabel}
              </p>
              <p className="mt-1 text-xl font-semibold text-navy">
                {window.localWindowLabel}
              </p>
              <p className="mt-1 text-xs font-semibold uppercase tracking-normal text-slate">
                {window.utcWindowLabel}
              </p>
            </div>
            <div className="grid gap-2 text-sm">
              <Metric
                label="Average movement"
                value={`${window.averageMovePct}%`}
              />
              <Metric
                label="Asset baseline"
                value={`${window.baselineMovePct}%`}
              />
              <Metric
                label="Relative edge"
                value={`${window.edgePct > 0 ? "+" : ""}${window.edgePct}%`}
              />
              <Metric
                label="Sample"
                value={`${window.sampleCount} candles / ${window.confidence}`}
              />
            </div>
            <p className="flex items-start gap-2 text-xs font-medium leading-5 text-slate">
              <TrendingUp
                className="mt-0.5 h-3.5 w-3.5 shrink-0 text-bullish"
                aria-hidden="true"
              />
              Based on recent 15-minute candles for this selected market. Use it
              as a timing reference, not a trade signal.
            </p>
          </div>
        )
        : (
          <p className="text-sm leading-6 text-slate">
            {notice ||
              "More intraday candles are needed before Levelflow can show a data-backed timing window."}
          </p>
        )}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-h-10 min-w-0 items-center justify-between gap-3 rounded-lg bg-canvas px-3 py-2">
      <span className="min-w-0 text-slate">{label}</span>
      <span className="min-w-0 text-right font-semibold text-navy">
        {value}
      </span>
    </div>
  );
}
