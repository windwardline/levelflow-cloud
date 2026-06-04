import { useEffect, useRef } from "react";
import {
  ColorType,
  LineSeries,
  LineStyle,
  createChart,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type LineData,
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
  const lineSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const priceLinesRef = useRef<IPriceLine[]>([]);

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }

    const chart = createChart(containerRef.current, {
      height: 260,
      layout: {
        background: { type: ColorType.Solid, color: "#FFFFFF" },
        textColor: "#52606D",
      },
      grid: {
        vertLines: { color: "rgba(128, 138, 149, 0.12)" },
        horzLines: { color: "rgba(128, 138, 149, 0.12)" },
      },
      rightPriceScale: {
        borderColor: "rgba(128, 138, 149, 0.25)",
      },
      timeScale: {
        borderColor: "rgba(128, 138, 149, 0.25)",
        rightOffset: 8,
      },
      handleScale: true,
      handleScroll: true,
    });

    const lineSeries = chart.addSeries(LineSeries, {
      color: "#5B8266",
      lineWidth: 3,
    });

    chartRef.current = chart;
    lineSeriesRef.current = lineSeries;
    chart.timeScale().fitContent();

    const resize = () => {
      if (containerRef.current) {
        chart.applyOptions({ width: containerRef.current.clientWidth });
      }
    };

    resize();
    window.addEventListener("resize", resize);

    return () => {
      window.removeEventListener("resize", resize);
      chart.remove();
      chartRef.current = null;
      lineSeriesRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!lineSeriesRef.current || !chartRef.current) {
      return;
    }

    const chartData = data.map((point) => ({ time: point.time as Time, value: point.value })) satisfies LineData<Time>[];
    lineSeriesRef.current.setData(chartData);
    if (chartData.length > 0) {
      chartRef.current.timeScale().fitContent();
    }
  }, [data]);

  useEffect(() => {
    if (!lineSeriesRef.current) {
      return;
    }

    const series = lineSeriesRef.current;
    priceLinesRef.current.forEach((line) => series.removePriceLine(line));
    priceLinesRef.current = [];

    if (!setup) {
      return;
    }

    const entryColor = setup.side === "buy" ? "#3F7A52" : "#B84A4A";
    const riskColor = "#B84A4A";
    const targetColor = "#111C38";

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
  }, [setup]);

  return (
    <div className="relative">
      <div ref={containerRef} className="h-[260px] w-full" />
      {loading && <div className="absolute inset-0 grid place-items-center bg-white/70 text-sm font-semibold text-navy">Loading market data</div>}
      {!loading && data.length === 0 && (
        <div className="absolute inset-0 grid place-items-center bg-white/80 text-sm font-semibold text-slate">No market data returned</div>
      )}
    </div>
  );
}
