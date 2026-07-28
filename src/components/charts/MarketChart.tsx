import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronsLeft, ChevronsRight, Crosshair, Maximize2, MoveHorizontal, ZoomIn, ZoomOut } from "lucide-react";
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
  viewKey?: string;
};

export function MarketChart({ data, loading = false, setup = null, viewKey = "default" }: MarketChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const priceLinesRef = useRef<IPriceLine[]>([]);
  const lastFitKeyRef = useRef("");
  const [hoverBar, setHoverBar] = useState<CandlestickData<Time> | null>(null);
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

    chart.subscribeCrosshairMove((param) => {
      const bar = param.seriesData.get(candleSeries) as CandlestickData<Time> | undefined;
      setHoverBar(bar ?? null);
    });

    let resizeFrame = 0;
    const resize = () => {
      if (containerRef.current) {
        window.cancelAnimationFrame(resizeFrame);
        resizeFrame = window.requestAnimationFrame(() => {
          if (containerRef.current) {
            chart.applyOptions({ height: containerRef.current.clientHeight || 440, width: containerRef.current.clientWidth });
          }
        });
      }
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(containerRef.current);

    resize();
    window.addEventListener("resize", resize);

    return () => {
      window.removeEventListener("resize", resize);
      resizeObserver.disconnect();
      window.cancelAnimationFrame(resizeFrame);
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only chart creation; theme changes are applied by the effect below
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

    const chartData = normalizeChartData(data);

    candleSeriesRef.current.setData(chartData);
    const fitKey = `${viewKey}:${chartData.length}:${String(chartData[0]?.time ?? "")}:${String(chartData.at(-1)?.time ?? "")}`;
    if (chartData.length > 0 && fitKey !== lastFitKeyRef.current) {
      lastFitKeyRef.current = fitKey;
      chartRef.current.timeScale().fitContent();
    }
  }, [data, viewKey]);

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
    <div className="relative min-w-0 overflow-hidden rounded-lg border border-slate/15 bg-white">
      <div className="absolute left-3 top-3 z-10 hidden max-w-[calc(100%-8.5rem)] rounded-lg border border-slate/15 bg-white/90 px-3 py-2 text-xs font-semibold text-slate shadow-xs sm:block">
        {hoverBar ? (
          <span className="whitespace-nowrap">
            O {formatChartPrice(hoverBar.open)} H {formatChartPrice(hoverBar.high)} L {formatChartPrice(hoverBar.low)} C {formatChartPrice(hoverBar.close)}
          </span>
        ) : (
          <span className="flex items-center gap-2">
            <Crosshair className="h-3.5 w-3.5" aria-hidden="true" />
            Hover for OHLC
          </span>
        )}
      </div>
      <div className="absolute right-3 top-3 z-10 flex flex-wrap justify-end gap-1.5 rounded-lg border border-slate/15 bg-white/90 p-1 shadow-xs">
        <ChartToolButton label="Scroll left" onClick={() => scrollChart(chartRef.current, -1)}>
          <ChevronsLeft className="h-4 w-4" aria-hidden="true" />
        </ChartToolButton>
        <ChartToolButton label="Zoom in" onClick={() => zoomChart(chartRef.current, 0.72)}>
          <ZoomIn className="h-4 w-4" aria-hidden="true" />
        </ChartToolButton>
        <ChartToolButton label="Zoom out" onClick={() => zoomChart(chartRef.current, 1.35)}>
          <ZoomOut className="h-4 w-4" aria-hidden="true" />
        </ChartToolButton>
        <ChartToolButton label="Scroll right" onClick={() => scrollChart(chartRef.current, 1)}>
          <ChevronsRight className="h-4 w-4" aria-hidden="true" />
        </ChartToolButton>
        <ChartToolButton label="Autoscale price" onClick={() => chartRef.current?.priceScale("right").applyOptions({ autoScale: true })}>
          <MoveHorizontal className="h-4 w-4" aria-hidden="true" />
        </ChartToolButton>
        <ChartToolButton label="Default chart view" onClick={() => resetChart(chartRef.current)}>
          <Maximize2 className="h-4 w-4" aria-hidden="true" />
        </ChartToolButton>
      </div>
      <div ref={containerRef} className="h-[390px] w-full sm:h-[500px] xl:h-[560px]" />
      {loading && <div className="absolute inset-0 grid place-items-center bg-white/70 text-sm font-semibold text-navy">Loading market data</div>}
      {!loading && data.length === 0 && (
        <div className="absolute inset-0 grid place-items-center bg-white/80 px-6 text-center text-sm font-semibold text-slate">No chart data available yet</div>
      )}
      {setup ? <SetupZoneSummary setup={setup} /> : null}
    </div>
  );
}

function SetupZoneSummary({ setup }: { setup: ChartSetup }) {
  const isBuy = setup.side === "buy";
  const risk = Math.abs(setup.entryPrice - setup.stopLoss);
  const reward = Math.abs(setup.takeProfit - setup.entryPrice);
  const rewardRisk = reward / Math.max(risk, 0.00001);

  return (
    <div className="grid gap-2 border-t border-slate/15 bg-white/95 px-3 py-3 text-xs font-semibold text-slate sm:grid-cols-4">
      <div>
        <p className="uppercase tracking-normal text-slate">Entry</p>
        <p className={isBuy ? "mt-1 text-bullish" : "mt-1 text-danger"}>{formatChartPrice(setup.entryPrice)}</p>
      </div>
      <div>
        <p className="uppercase tracking-normal text-slate">Stop</p>
        <p className="mt-1 text-danger">{formatChartPrice(setup.stopLoss)}</p>
      </div>
      <div>
        <p className="uppercase tracking-normal text-slate">Target</p>
        <p className="mt-1 text-navy">{formatChartPrice(setup.takeProfit)}</p>
      </div>
      <div>
        <p className="uppercase tracking-normal text-slate">Payoff</p>
        <p className="mt-1 text-navy">{Number.isFinite(rewardRisk) ? `${rewardRisk.toFixed(2)}x` : "Pending"}</p>
      </div>
    </div>
  );
}

function ChartToolButton({ children, label, onClick }: { children: ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      aria-label={label}
      className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate transition hover:bg-bullish/10 hover:text-bullish"
      title={label}
      type="button"
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function normalizeChartData(data: MarketDataPoint[]) {
  const deduped = new Map<string, CandlestickData<Time>>();
  for (const point of data) {
    const close = Number(point.close);
    const open = Number(point.open ?? point.value ?? close);
    const high = Number(point.high ?? close);
    const low = Number(point.low ?? close);
    const time = point.time as Time;
    if (!Number.isFinite(close) || !Number.isFinite(open) || !Number.isFinite(high) || !Number.isFinite(low) || time === null || time === undefined) {
      continue;
    }
    deduped.set(String(time), {
      close,
      high: Math.max(high, open, close),
      low: Math.min(low, open, close),
      open,
      time,
    });
  }
  return Array.from(deduped.values()).sort((first, second) => compareChartTime(first.time, second.time));
}

function compareChartTime(first: Time, second: Time) {
  return chartTimeValue(first) - chartTimeValue(second);
}

function chartTimeValue(value: Time) {
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "string") {
    return Date.parse(value);
  }
  return Date.UTC(value.year, value.month - 1, value.day) / 1000;
}

function resetChart(chart: IChartApi | null) {
  if (!chart) {
    return;
  }
  chart.priceScale("right").applyOptions({ autoScale: true });
  chart.timeScale().fitContent();
}

function zoomChart(chart: IChartApi | null, factor: number) {
  const range = chart?.timeScale().getVisibleLogicalRange();
  if (!chart || !range) {
    return;
  }
  const center = (range.from + range.to) / 2;
  const halfWidth = Math.max((range.to - range.from) * factor * 0.5, 4);
  chart.timeScale().setVisibleLogicalRange({ from: center - halfWidth, to: center + halfWidth });
}

function scrollChart(chart: IChartApi | null, direction: -1 | 1) {
  const range = chart?.timeScale().getVisibleLogicalRange();
  if (!chart || !range) {
    return;
  }
  const span = range.to - range.from;
  const offset = Math.max(span * 0.28, 4) * direction;
  chart.timeScale().setVisibleLogicalRange({ from: range.from + offset, to: range.to + offset });
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

function formatChartPrice(value: number) {
  return value.toLocaleString(undefined, {
    maximumFractionDigits: Math.abs(value) >= 100 ? 2 : 5,
    minimumFractionDigits: Math.abs(value) >= 100 ? 2 : 5,
  });
}
