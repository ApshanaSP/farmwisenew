/**
 * District IQ chart theme for ECharts, in both themes (mirror of tokens.css; canvas charts cannot read CSS variables).
 * Transparent background, Plus Jakarta Sans, muted axis text, dashed grid, rounded bar tops, 2px lines over a soft area, a glass
 * tooltip like the kit's Tooltip, 700ms cubic-out entrances staggered 30ms, and universal transitions so a filter change
 * morphs the marks instead of redrawing them.
 */
export type Theme = "dark" | "light";

export interface ChartPalette {
  series: string[];
  text: string; text2: string; text3: string;
  grid: string; axis: string;
  surface: string; tooltipBg: string; tooltipLine: string;
  muted: string; prev: string; track: string;
  rose: string; fell: string;
  severity: Record<string, string>;
  font: string; mono: string;
}

const FONT = '"Plus Jakarta Sans Variable", "Plus Jakarta Sans", "Noto Sans Tamil Variable", system-ui, -apple-system, "Segoe UI", sans-serif';
const MONO = '"Geist Mono", ui-monospace, Menlo, Consolas, monospace';

export const PALETTE: Record<Theme, ChartPalette> = {
  dark: {
    series: ["#3CC2DB", "#74D6EA", "#FF8466", "#F2C94C", "#34D399", "#FF5C6C"],
    text: "#E8F1F8", text2: "#AFC2D3", text3: "#7F94A9",
    grid: "rgba(255,255,255,.05)", axis: "rgba(255,255,255,.1)",
    surface: "#0D1C2B", tooltipBg: "rgba(16,35,58,.95)", tooltipLine: "rgba(148,190,230,.2)",
    muted: "#4F6478", prev: "#1E3347", track: "rgba(255,255,255,.04)",
    rose: "#FFA24C", fell: "#34D399",
    severity: { Severe: "#FF5C6C", High: "#FFA24C", Medium: "#F2C94C", Low: "#8BA0B5" },
    font: FONT, mono: MONO
  },
  light: {
    series: ["#0B7290", "#18A7BC", "#E5533A", "#E0A800", "#0E9F6E", "#E0364A"],
    text: "#0F1B2D", text2: "#40506A", text3: "#64748B",
    grid: "#EDF1F6", axis: "#DDE4EC",
    surface: "#FFFFFF", tooltipBg: "rgba(255,255,255,.97)", tooltipLine: "#E0E7EF",
    muted: "#C2CDD9", prev: "#E0E7EF", track: "#EEF2F6",
    rose: "#E5720F", fell: "#0E9F6E",
    severity: { Severe: "#E0364A", High: "#E5720F", Medium: "#B98B00", Low: "#64748B" },
    font: FONT, mono: MONO
  }
};

/** The page's current theme (html data-theme, or the console's own .dic data-theme). */
export function currentTheme(): Theme {
  if (typeof document === "undefined") return "light";
  const dic = document.querySelector<HTMLElement>(".dic[data-theme]");
  return (dic?.dataset.theme ?? document.documentElement.dataset.theme) === "dark" ? "dark" : "light";
}

/** Shared option pieces: spread into an ECharts option. */
export function chartBase(theme: Theme = currentTheme()) {
  const p = PALETTE[theme];
  return {
    backgroundColor: "transparent",
    color: p.series,
    textStyle: { fontFamily: p.font, color: p.text2 },
    animationDuration: 700,
    animationEasing: "cubicOut" as const,
    animationDelay: (idx: number) => idx * 30,
    animationDurationUpdate: 420,
    animationEasingUpdate: "cubicInOut" as const,
    tooltip: {
      confine: true, backgroundColor: p.tooltipBg, borderColor: p.tooltipLine, borderWidth: 1, padding: [8, 11],
      textStyle: { color: p.text, fontSize: 12.5, fontFamily: p.font },
      extraCssText: "border-radius:8px;backdrop-filter:blur(16px);box-shadow:0 18px 40px -16px rgba(0,0,0,.5);font-variant-numeric:tabular-nums"
    }
  };
}

export function axis(theme: Theme = currentTheme()) {
  const p = PALETTE[theme];
  return {
    axisLine: { lineStyle: { color: p.axis } },
    axisTick: { show: false },
    axisLabel: { color: p.text3, fontSize: 11, fontFamily: p.font },
    splitLine: { lineStyle: { color: p.grid, type: "dashed" as const } }
  };
}

/** a bar series style: rounded tops, universal transition */
export const barStyle = { itemStyle: { borderRadius: [4, 4, 0, 0] }, universalTransition: true };
/** a line series style: 2px line over an accent area 24% -> 0% */
export function lineStyle(color: string) {
  return {
    smooth: 0.25, symbol: "circle", symbolSize: 5, showSymbol: false, lineStyle: { width: 2, color }, itemStyle: { color },
    areaStyle: { color: { type: "linear", x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: `${color}3D` }, { offset: 1, color: `${color}00` }] } },
    universalTransition: true
  };
}
