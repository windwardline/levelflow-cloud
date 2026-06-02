import { useEffect, useRef } from "react";
import { ColorType, LineSeries, createChart } from "lightweight-charts";

const SAMPLE_SERIES = [
  { time: "2026-05-22", value: 1.081 },
  { time: "2026-05-23", value: 1.084 },
  { time: "2026-05-24", value: 1.083 },
  { time: "2026-05-25", value: 1.089 },
  { time: "2026-05-26", value: 1.091 },
  { time: "2026-05-27", value: 1.087 },
  { time: "2026-05-28", value: 1.094 },
  { time: "2026-05-29", value: 1.096 },
  { time: "2026-06-01", value: 1.099 },
  { time: "2026-06-02", value: 1.101 },
] as const;

export function MarketChart() {
  const containerRef = useRef<HTMLDivElement | null>(null);

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
      },
    });

    const lineSeries = chart.addSeries(LineSeries, {
      color: "#5B8266",
      lineWidth: 3,
    });

    lineSeries.setData([...SAMPLE_SERIES]);
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
    };
  }, []);

  return <div ref={containerRef} className="h-[260px] w-full" />;
}
