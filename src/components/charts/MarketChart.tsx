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
import { formatNumber } from "../workspace/advisorFormat";

// Every level the mock's chart draws (a-desk-v3.html:191-194), which is every
// level the ladder lists — takeProfit1 included. `side` is deliberately absent:
// the mock colors these lines by role (target buy, entry accent, stop sell),
// never by direction, and the stagehead's own tag is what names the side.
type ChartSetup = Pick<AnalyzerSetup, "entryPrice" | "stopLoss" | "takeProfit" | "takeProfit1">;

type MarketChartProps = {
  data: MarketDataPoint[];
  /**
   * Fills the height of whatever container the chart is in, instead of taking
   * its own. Set by the full-viewport overlay (spec §17), which owns the
   * height there; every other call site leaves it off and gets the inline
   * heights below.
   */
  fill?: boolean;
  loading?: boolean;
  /**
   * Supplied by the Desk stage only: renders the "Expand chart" control in the
   * chart's top-right corner (spec §17, §17m.3 — every width, not just mobile).
   * The overlay's own instance passes nothing, so an expanded chart never
   * offers to expand itself again.
   */
  onExpand?: () => void;
  setup?: ChartSetup | null;
  viewKey?: string;
};

// Spec §16 / a-desk-v3.html:177: the stage's chart sheet — a square-cornered
// hairline border on sheet, so the setup sheet below it can attach border-t-0
// with no rounded corner or second frame in between. A constant because the
// overlay variant appends its own height to it (spec §17) and this must stay
// one string rather than two that could drift.
const CHART_SHEET =
  "relative min-w-0 overflow-hidden border border-hairline bg-sheet";

// The six-button tool cluster, floating over live canvas at the sheet's top-right
// corner. One string because the inline chart and the overlay's own instance draw
// the same cluster and must not drift — the only difference is that the inline one
// gives the corner up below lg (see its own comment at the call site).
// §17m follow-up (owner, 2026-08-01): the inline tools shrank with the chart
// and read obtrusive at full size. The cluster is as small as stays legible —
// compact chrome, tucked to the corner. The overlay instance (fill) keeps
// touch-sized buttons: it is the one place fingers land on these.
const CHART_TOOLS =
  "absolute right-2 top-2 z-10 flex flex-wrap justify-end gap-1 rounded-md border border-hairline bg-sheet p-0.5 shadow-xs";

export type ChartTheme = {
  sheet: string;
  ink: string;
  inkMuted: string;
  hairline: string;
  accent: string;
  buy: string;
  sell: string;
};

/**
 * Resolves the Stage-1 design tokens to concrete color strings for the
 * canvas-drawn chart, which cannot consume `var(--color-*)` references the
 * way DOM/CSS can. Defaults to reading the live document, but accepts an
 * injectable source (any `getPropertyValue` provider, e.g. a plain object)
 * so it can be unit-tested without a DOM — see tests/chartTheme.test.ts.
 */
export function readChartTheme(
  source: Pick<CSSStyleDeclaration, "getPropertyValue"> = getComputedStyle(document.documentElement),
): ChartTheme {
  const v = (name: string) => source.getPropertyValue(name).trim();
  return {
    sheet: v("--color-sheet"),
    ink: v("--color-ink"),
    inkMuted: v("--color-ink-muted"),
    hairline: v("--color-hairline"),
    accent: v("--color-accent"),
    buy: v("--color-buy"),
    sell: v("--color-sell"),
  };
}

// The one thing this library does that production CSP sees.
//
// lightweight-charts draws everything on canvas and sets every other style
// through CSSOM (`element.style.x = …`), which CSP does not police — but its
// attribution widget builds a real `<style>` element and assigns its text
// (AttributionLogoWidget, one `document.createElement("style")` in the whole
// bundle), and `style-src 'self'` blocks exactly that. Reproduced under the
// production header rather than assumed: the element lands in the DOM with
// `sheet === null`, so the rule it carries never applies, and the consequences
// are worse than the console line. The `<a id="tv-attr-logo">` it styles loses
// `position: absolute` and falls into the pane cell's normal flow, and — because
// the same blocked rule is where the SVG's `--fill`/`--stroke` come from — every
// path resolves to `fill: none`. The attribution link renders as an invisible
// 35x16 box in the middle of the chart's layout.
//
// That link is not decoration: the library's licence asks for the attribution
// notice and a link to tradingview.com on a page available to users, and this
// widget is what satisfies it (LayoutOptions.attributionLogo's own docs). So the
// fix is to let that one stylesheet through by content hash —
// vercel.json's style-src carries `'sha256-3pRED1tOXas1FXFoPb9TGCjmYe9XQsmO9OV23khV2nY='`
// — rather than to disable the widget, which would move a licence obligation
// onto app copy no ruling covers. A hash is not a loosening: it admits one
// byte-identical stylesheet and nothing else. Inline style ATTRIBUTES stay
// blocked (those need 'unsafe-hashes'), and 'unsafe-inline' is still absent.
//
// tests/securityHardening.test.ts recomputes that hash from the installed
// lightweight-charts and fails if vercel.json disagrees, so a version bump that
// re-values the stylesheet is a red build rather than the same silent violation
// coming back.
export function MarketChart(
  {
    data,
    fill = false,
    loading = false,
    onExpand,
    setup = null,
    viewKey = "default",
  }: MarketChartProps,
) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const priceLinesRef = useRef<IPriceLine[]>([]);
  const lastFitKeyRef = useRef("");
  const [hoverBar, setHoverBar] = useState<CandlestickData<Time> | null>(null);
  // Not the theme itself — just a tick that bumps whenever data-theme changes,
  // so the effects below know to re-read fresh colors from readChartTheme().
  const [themeVersion, setThemeVersion] = useState(0);

  useEffect(() => {
    const observer = new MutationObserver(() => setThemeVersion((version) => version + 1));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }

    const theme = readChartTheme();
    const chart = createChart(containerRef.current, {
      height: containerRef.current.clientHeight || 440,
      layout: {
        background: { type: ColorType.Solid, color: theme.sheet },
        textColor: theme.inkMuted,
      },
      grid: {
        vertLines: { color: theme.hairline },
        horzLines: { color: theme.hairline },
      },
      rightPriceScale: {
        borderColor: theme.hairline,
      },
      timeScale: {
        borderColor: theme.hairline,
        rightOffset: 8,
      },
      crosshair: {
        vertLine: { color: theme.accent },
        horzLine: { color: theme.accent },
      },
      handleScale: true,
      handleScroll: true,
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      borderDownColor: theme.sell,
      borderUpColor: theme.buy,
      downColor: theme.sell,
      wickDownColor: theme.sell,
      wickUpColor: theme.buy,
      upColor: theme.buy,
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
    // Mount-only chart creation; theme changes are applied by the effect below.
  }, []);

  useEffect(() => {
    if (!chartRef.current || !candleSeriesRef.current) {
      return;
    }

    const theme = readChartTheme();
    chartRef.current.applyOptions({
      layout: {
        background: { type: ColorType.Solid, color: theme.sheet },
        textColor: theme.inkMuted,
      },
      grid: {
        vertLines: { color: theme.hairline },
        horzLines: { color: theme.hairline },
      },
      rightPriceScale: {
        borderColor: theme.hairline,
      },
      timeScale: {
        borderColor: theme.hairline,
      },
      crosshair: {
        vertLine: { color: theme.accent },
        horzLine: { color: theme.accent },
      },
    });
    candleSeriesRef.current.applyOptions({
      borderDownColor: theme.sell,
      borderUpColor: theme.buy,
      downColor: theme.sell,
      wickDownColor: theme.sell,
      wickUpColor: theme.buy,
      upColor: theme.buy,
    });
  }, [themeVersion]);

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

    const theme = readChartTheme();
    // Same gate the ladder puts on its own Target 1 row
    // (AdvisorRecommendationPanel), so the chart never draws a level the
    // ladder is not listing — the inconsistency this replaced.
    const hasLadder = typeof setup.takeProfit1 === "number" &&
      setup.takeProfit1 > 0;

    // The mock's four lines, in its own reading order and label grammar
    // (a-desk-v3.html:191-194): "TARGET 2 · 1.09480", "TARGET 1 · 1.09120",
    // "ENTRY · 1.08840", "STOP · 1.08560". Colors come from the live tokens
    // read above rather than from CSS, because a canvas cannot resolve
    // var(--color-*) — the MutationObserver's themeVersion is what re-runs
    // this effect on a theme flip.
    const levels = [
      {
        color: theme.buy,
        label: hasLadder ? "TARGET 2" : "TARGET",
        price: setup.takeProfit,
      },
      ...(hasLadder
        ? [{ color: theme.buy, label: "TARGET 1", price: setup.takeProfit1! }]
        : []),
      { color: theme.accent, label: "ENTRY", price: setup.entryPrice },
      { color: theme.sell, label: "STOP", price: setup.stopLoss },
    ];

    priceLinesRef.current = levels.map((level) =>
      series.createPriceLine({
        axisLabelVisible: true,
        color: level.color,
        lineStyle: LineStyle.Dashed,
        lineWidth: 2,
        price: level.price,
        // formatNumber is the ladder's own display formatter, so a line's price
        // reads byte-identical to the ladder row beside it. It is now the only
        // price formatter this file has (Q1-I12): the local one it replaced
        // capped at two decimals over 100 and would print a futures level that
        // never appears in the ladder — and the OHLC readout above the chart was
        // still calling it, so the defect this line's move fixed went on living
        // in the hover box.
        title: `${level.label} · ${formatNumber(level.price)}`,
      })
    );
  }, [setup, themeVersion]);

  // One width for all four values, decided by the bar's own magnitude: five
  // decimals under 100 (forex, most crypto), two at or above (indices,
  // metals, treasuries). Fixed digits because this row re-renders per bar —
  // ragged widths make the whole cluster shiver under the crosshair.
  const ohlcDigits =
    hoverBar && Math.abs(hoverBar.close) < 100 ? 5 : 2;

  return (
    // CHART_SHEET (above) IS the stage's chart sheet, kept as this component's
    // own root — rather than an outer wrapper in AdvisorWorkspace — so there is
    // exactly one frame around the chart. The overlay's instance adds h-full:
    // there the dialog owns the height and the sheet stretches to it.
    <div className={fill ? `${CHART_SHEET} h-full` : CHART_SHEET}>
      <div
        className={`absolute left-2 top-2 z-10 max-w-[calc(100%-8.5rem)] rounded-md border border-hairline bg-sheet px-2 py-1 text-[11px] font-semibold text-ink-muted shadow-xs ${
          hoverBar ? "block" : "hidden sm:block"
        }`}
      >
        {hoverBar ? (
          <span className="whitespace-nowrap">
            O {formatNumber(hoverBar.open, ohlcDigits)} H {formatNumber(hoverBar.high, ohlcDigits)} L {formatNumber(hoverBar.low, ohlcDigits)} C {formatNumber(hoverBar.close, ohlcDigits)}
          </span>
        ) : (
          <span className="flex items-center gap-1.5">
            <Crosshair className="h-3 w-3" aria-hidden="true" />
            Hover for OHLC
          </span>
        )}
      </div>
      {/* Wave 6 rider: below lg the INLINE chart gives this corner to Expand
          chart. The cluster is ~232px wide against a 343px mobile chart, so the
          two cannot share the top-right, and m-scan-v3.html draws exactly one
          control on that chart — the Expand chip. Nothing is lost: pinch and pan
          still work on the inline canvas (handleScale/handleScroll), and the
          overlay Expand opens — the one instance that passes `fill` — keeps the
          full cluster at a size it can be used at. */}
      <div className={fill ? CHART_TOOLS : `${CHART_TOOLS} max-lg:hidden`}>
        <ChartToolButton touch={fill} label="Scroll left" onClick={() => scrollChart(chartRef.current, -1)}>
          <ChevronsLeft className={fill ? "h-4 w-4" : "h-3.5 w-3.5"} aria-hidden="true" />
        </ChartToolButton>
        <ChartToolButton touch={fill} label="Zoom in" onClick={() => zoomChart(chartRef.current, 0.72)}>
          <ZoomIn className={fill ? "h-4 w-4" : "h-3.5 w-3.5"} aria-hidden="true" />
        </ChartToolButton>
        <ChartToolButton touch={fill} label="Zoom out" onClick={() => zoomChart(chartRef.current, 1.35)}>
          <ZoomOut className={fill ? "h-4 w-4" : "h-3.5 w-3.5"} aria-hidden="true" />
        </ChartToolButton>
        <ChartToolButton touch={fill} label="Scroll right" onClick={() => scrollChart(chartRef.current, 1)}>
          <ChevronsRight className={fill ? "h-4 w-4" : "h-3.5 w-3.5"} aria-hidden="true" />
        </ChartToolButton>
        <ChartToolButton touch={fill} label="Autoscale price" onClick={() => chartRef.current?.priceScale("right").applyOptions({ autoScale: true })}>
          <MoveHorizontal className={fill ? "h-4 w-4" : "h-3.5 w-3.5"} aria-hidden="true" />
        </ChartToolButton>
        <ChartToolButton touch={fill} label="Default chart view" onClick={() => resetChart(chartRef.current)}>
          <Maximize2 className={fill ? "h-4 w-4" : "h-3.5 w-3.5"} aria-hidden="true" />
        </ChartToolButton>
      </div>
      {/* Spec §17's Expand chart affordance, in the chart's TOP-right corner —
          m-scan-v3.html:32's own right:6px/top:6px. It used to ride the
          bottom-right (m-mobile-v3.html:16,:56); live inspection found it
          crowding the date axis there, and the wave-6 rider moved it. Held at
          the kit's 44px tap floor, which grows DOWNWARD from the top edge
          (items-start plus the mock's 6px top pad) so the label itself sits on
          the mock's inset rather than 44px below it.

          §17m.3 removed its lg:hidden gate: the inline chart is ~1/3 of the
          stage at every width now, so the overlay is how a reader sees a big one
          on the desktop too. At ≥lg it steps clear of the tool cluster above it
          (right-3/top-3, one 40px row) and takes the cluster's own sheet-chip
          treatment, because at that size it sits over live candles rather than
          the mock's quiet mobile corner. Literal variants throughout (C1), and
          the ≥lg additions cannot reach below lg. */}
      {onExpand
        ? (
          <button
            className="absolute right-0 top-0 z-10 inline-flex min-h-11 items-start px-2 pt-1.5 text-[11px] font-semibold text-accent lg:right-2 lg:top-11 lg:items-center lg:rounded-md lg:border lg:border-hairline lg:bg-sheet lg:px-2 lg:py-0.5 lg:text-[11px] lg:shadow-xs"
            type="button"
            onClick={onExpand}
          >
            Expand chart
          </button>
        )
        : null}
      {/* 168px below lg, the mock's own compact inline height
          (m-scan-v3.html:28) — the merged Scan surface pins this chart inside a
          fixed viewport, and Expand chart gives a reader the whole one when they
          want it. `fill` is the container-owns-the-height mode, used by the
          overlay (which is the viewport) and, since §17m.3, by the ≥lg stage,
          whose wrapper hands the chart its ~1/3 share of the region instead of
          the fixed 500/560px this used to draw there — that height was most of a
          1280x800 region on its own. The ≥lg fallbacks below stay for any
          caller that does not own a height. */}
      <div
        ref={containerRef}
        className={fill
          ? "h-full w-full"
          : "w-full max-lg:h-[168px] lg:h-[500px] xl:h-[560px]"}
      />
      {loading && <div className="absolute inset-0 grid place-items-center bg-sheet text-sm font-semibold text-ink">Loading market data</div>}
      {!loading && data.length === 0 && (
        <div className="absolute inset-0 grid place-items-center bg-sheet px-6 text-center text-sm font-semibold text-ink-muted">No chart data available yet</div>
      )}
    </div>
  );
}

function ChartToolButton({ children, label, touch = false, onClick }: { children: ReactNode; label: string; touch?: boolean; onClick: () => void }) {
  return (
    <button
      aria-label={label}
      className={touch
        ? "inline-flex h-7 w-7 items-center justify-center rounded-md text-ink-muted transition hover:bg-accent/10 hover:text-accent"
        : "inline-flex h-6 w-6 items-center justify-center rounded text-ink-muted transition hover:bg-accent/10 hover:text-accent"}
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

