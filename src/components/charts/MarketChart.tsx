import { useEffect, useRef, useState } from "react";
import {
  CandlestickSeries,
  ColorType,
  LineStyle,
  createChart,
  type CandlestickData,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type Time,
} from "lightweight-charts";
import type { MarketDataPoint } from "../../lib/marketData";
import type { AnalyzerSetup } from "../../lib/tradeAnalyzer";

type ChartSetup = Pick<AnalyzerSetup, "entryPrice" | "side" | "stopLoss" | "takeProfit">;

type MarketChartProps = {
  data: MarketDataPoint[];
  loading?: boolean;
  setup?: ChartSetup | null;
};

export function MarketChart({ data, loading = false, setup = null }: MarketChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const priceLinesRef = useRef<IPriceLine[]>([]);
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme ?? "light");

  useEffect(() => {
    const observer = new MutationObserver(() => setTheme(document.documentElement.dataset.theme ?? "light"));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }

    const palette = chartPalette(theme);
    const chart = createChart(containerRef.current, {
      height: containerRef.current.clientHeight || 440,
      layout: {
        background: { type: ColorType.Solid, color: palette.background },
        textColor: palette.text,
      },
      grid: {
        vertLines: { color: palette.grid },
        horzLines: { color: palette.grid },
      },
      rightPriceScale: {
        borderColor: palette.border,
      },
      timeScale: {
        borderColor: palette.border,
        rightOffset: 8,
      },
      handleScale: true,
      handleScroll: true,
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      borderDownColor: "#A94D4D",
      borderUpColor: "#5B8266",
      downColor: "#A94D4D",
      wickDownColor: "#A94D4D",
      wickUpColor: "#5B8266",
      upColor: "#5B8266",
    });

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    chart.timeScale().fitContent();

    const resize = () => {
      if (containerRef.current) {
        chart.applyOptions({ height: containerRef.current.clientHeight || 440, width: containerRef.current.clientWidth });
      }
    };

    resize();
    window.addEventListener("resize", resize);

    return () => {
      window.removeEventListener("resize", resize);
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
    };
  }, []);

  useEffect(() => {
    const palette = chartPalette(theme);
    chartRef.current?.applyOptions({
      layout: {
        background: { type: ColorType.Solid, color: palette.background },
        textColor: palette.text,
      },
      grid: {
        vertLines: { color: palette.grid },
        horzLines: { color: palette.grid },
      },
      rightPriceScale: {
        borderColor: palette.border,
      },
      timeScale: {
        borderColor: palette.border,
      },
    });
  }, [theme]);

  useEffect(() => {
    if (!candleSeriesRef.current || !chartRef.current) {
      return;
    }

    const chartData = data.map((point) => {
      const close = point.close;
      return {
        close,
        high: point.high ?? close,
        low: point.low ?? close,
        open: point.open ?? point.value,
        time: point.time as Time,
      };
    }) satisfies CandlestickData<Time>[];

    candleSeriesRef.current.setData(chartData);
    if (chartData.length > 0) {
      chartRef.current.timeScale().fitContent();
    }
  }, [data]);

  useEffect(() => {
    if (!candleSeriesRef.current) {
      return;
    }

    const series = candleSeriesRef.current;
    priceLinesRef.current.forEach((line) => series.removePriceLine(line));
    priceLinesRef.current = [];

    if (!setup) {
      return;
    }

    const entryColor = setup.side === "buy" ? "#3F7A52" : "#A94D4D";
    const riskColor = "#A94D4D";
    const targetColor = theme === "dark" ? "#DDE6F2" : "#111C38";

    priceLinesRef.current = [
      series.createPriceLine({
        axisLabelVisible: true,
        color: entryColor,
        lineStyle: LineStyle.Solid,
        lineWidth: 2,
        price: setup.entryPrice,
        title: `${setup.side.toUpperCase()} LIMIT`,
      }),
      series.createPriceLine({
        axisLabelVisible: true,
        color: riskColor,
        lineStyle: LineStyle.Dashed,
        lineWidth: 2,
        price: setup.stopLoss,
        title: "STOP",
      }),
      series.createPriceLine({
        axisLabelVisible: true,
        color: targetColor,
        lineStyle: LineStyle.Dotted,
        lineWidth: 2,
        price: setup.takeProfit,
        title: "TARGET",
      }),
    ];
  }, [setup, theme]);

  return (
    <div className="relative overflow-hidden rounded-lg border border-slate/15 bg-white">
      <div className="absolute right-3 top-3 z-10">
        <button className="secondary-button min-h-9 px-3 py-1 text-xs" type="button" onClick={() => chartRef.current?.timeScale().fitContent()}>
          Reset view
        </button>
      </div>
      <div ref={containerRef} className="h-[390px] w-full sm:h-[500px] xl:h-[560px]" />
      {loading && <div className="absolute inset-0 grid place-items-center bg-white/70 text-sm font-semibold text-navy">Loading market data</div>}
      {!loading && data.length === 0 && (
        <div className="absolute inset-0 grid place-items-center bg-white/80 px-6 text-center text-sm font-semibold text-slate">No verified market data returned</div>
      )}
    </div>
  );
}

function chartPalette(theme: string) {
  if (theme === "dark") {
    return {
      background: "#101826",
      border: "rgba(216, 224, 234, 0.16)",
      grid: "rgba(216, 224, 234, 0.08)",
      text: "#D8E0EA",
    };
  }

  return {
    background: "#FFFFFF",
    border: "rgba(128, 138, 149, 0.25)",
    grid: "rgba(128, 138, 149, 0.12)",
    text: "#52606D",
  };
}
