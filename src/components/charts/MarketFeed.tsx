import { useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { MarketChart } from "./MarketChart";
import { fetchMarketData, type MarketDataResponse } from "../../lib/marketData";
import type { SupportedSymbol } from "../../lib/symbolMap";
import { toFmpSymbol } from "../../lib/symbolMap";

const SYMBOL_OPTIONS: Array<{ label: string; value: SupportedSymbol }> = [
  { label: "EURUSD", value: "EURUSD" },
  { label: "GBPUSD", value: "GBPUSD" },
  { label: "NAS100", value: "NAS100" },
];

export function MarketFeed() {
  const [selectedSymbol, setSelectedSymbol] = useState<SupportedSymbol>("EURUSD");
  const [marketData, setMarketData] = useState<MarketDataResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshNonce, setRefreshNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function loadMarketData() {
      setLoading(true);
      setError(null);

      try {
        const nextData = await fetchMarketData({ symbol: selectedSymbol });
        if (!cancelled) {
          setMarketData(nextData);
        }
      } catch (requestError) {
        if (!cancelled) {
          setError(requestError instanceof Error ? requestError.message : "Market data request failed.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadMarketData();

    return () => {
      cancelled = true;
    };
  }, [selectedSymbol, refreshNonce]);

  const ticker = useMemo(() => toFmpSymbol(selectedSymbol), [selectedSymbol]);
  const latestClose = marketData?.latestClose;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate">FMP market feed</p>
          <h2 className="text-xl font-semibold tracking-normal text-navy">Market context</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-bullish/10 px-3 py-1 text-sm font-semibold text-bullish">{ticker}</span>
          <button
            aria-label="Refresh market data"
            className="secondary-button min-h-9 px-3 py-1"
            disabled={loading}
            type="button"
            onClick={() => setRefreshNonce((value) => value + 1)}
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="mb-4 grid gap-3 md:grid-cols-[1fr_auto] md:items-center">
        <div className="segmented-grid">
          {SYMBOL_OPTIONS.map((option) => (
            <button
              className={`segmented-button px-3 ${selectedSymbol === option.value ? "segmented-button-active" : ""}`}
              key={option.value}
              type="button"
              onClick={() => setSelectedSymbol(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
        <div className="min-w-36 rounded-lg bg-canvas px-3 py-2 text-right">
          <p className="text-xs font-semibold uppercase tracking-normal text-slate">Latest close</p>
          <p className="text-lg font-semibold tracking-normal text-navy">
            {typeof latestClose === "number" ? formatPrice(selectedSymbol, latestClose) : "Pending"}
          </p>
        </div>
      </div>

      <MarketChart data={marketData?.points ?? []} loading={loading} />

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm">
        <p className={error ? "font-semibold text-danger" : "text-slate"}>
          {error
            ? error
            : marketData
              ? `${marketData.providerStatus} - ${marketData.resultsCount} bars from ${marketData.from} to ${marketData.to}`
              : "Loading provider data"}
        </p>
        {marketData?.asOf && <p className="text-slate">Refreshed {formatAsOf(marketData.asOf)}</p>}
      </div>
    </div>
  );
}

function formatPrice(symbol: SupportedSymbol, value: number) {
  if (symbol.includes("USD") && !symbol.startsWith("US")) {
    return value.toLocaleString(undefined, {
      maximumFractionDigits: 5,
      minimumFractionDigits: 5,
    });
  }

  return value.toLocaleString(undefined, {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  });
}

function formatAsOf(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
