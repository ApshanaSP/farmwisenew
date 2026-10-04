"use client";

/**
 * The picture an answer draws from its datasets: a chart, a map or a table, with the type switch, views of the
 * answer's other datasets, PNG/CSV export and expand. Chart, map and table share this one component because the
 * Collector switches between them on the same data without a new question.
 */
import dynamic from "next/dynamic";
import { useMemo, useRef, useState } from "react";
import type * as Echarts from "echarts/core";
import { allowedTypes, alternatives, defaultSpec, fmtValue, switchType } from "@/lib/assistant/chartspec";
import type { AnswerCard as Card, ChartSpec, ChartType, ConsoleAction, Dataset } from "@/lib/assistant/answer";
import type { Lang } from "@/lib/assistant/lang";
import type { MapGeo } from "@/lib/collector/geo";
import { I, type IconName } from "../icons";
import { T } from "./text";

const ChartRenderer = dynamic(() => import("./ChartRenderer"), { ssr: false, loading: () => <div className="aq-chart-wait" /> });
const MapAnswer = dynamic(() => import("./MapAnswer"), { ssr: false, loading: () => <div className="aq-chart-wait" /> });

/** Labels for the chart choice (the chart names themselves come from text.ts). */
const X2: Record<Lang, { suggested: string; alsoFits: string; backTo: string; moreCharts: string }> = {
  en: { suggested: "Suggested for this question", alsoFits: "Also fits", backTo: "Back to the suggested chart", moreCharts: "More chart types" },
  ta: { suggested: "இந்தக் கேள்விக்குப் பொருத்தமானது", alsoFits: "இதுவும் பொருந்தும்", backTo: "பரிந்துரைத்த வரைபடத்துக்குத் திரும்பு", moreCharts: "மேலும் வரைபட வகைகள்" },
  tanglish: { suggested: "Indha kelvikku suit aagum", alsoFits: "Idhuvum suit aagum", backTo: "Suggest panna chart-ku thirumbu", moreCharts: "Innum chart types" }
};

const TYPE_ICON: Partial<Record<ChartType, IconName>> = {
  horizontal_bar: "barH", bar: "chart", line: "line", area: "line", donut: "donut", grouped_bar: "chart", stacked_bar: "chart",
  map_zones: "map", map_wards: "map", map_points: "map", map_hotspots: "map", table: "table", heatmap: "layers", small_multiples: "grid", dumbbell: "compare", rose: "spark", treemap: "layers", gauge: "target"
};

export interface FigureProps {
  card: Card;
  geo: MapGeo | null;
  onAction: (a: ConsoleAction) => void;
  expanded: boolean;
  onExpand: () => void;
  /** clicking a bar or dot asks about it ("Tell me about Flooding & waterlogging") when the chart has no console filter */
  onAsk?: (q: string) => void;
}

/** A chart answer (the same component draws maps and tables: the type switch moves between them). */
export const ChartResponse = (p: FigureProps) => <FigureResponse {...p} />;
/** A map answer. */
export const MapResponse = (p: FigureProps) => <FigureResponse {...p} />;
/** A table answer (list answers open as a table). */
export const TableResponse = (p: FigureProps) => <FigureResponse {...p} />;

export function FigureResponse({ card, geo, onAction, expanded, onExpand, onAsk }: FigureProps) {
  const t = T[card.language as Lang] ?? T.en;
  const [chart, setChart] = useState<ChartSpec | null>(card.chart);
  const [tableView, setTableView] = useState(card.display === "table");
  // every chart form only when asked for ("More"): by default the one chosen for the question and one or two that also fit
  const [allTypes, setAllTypes] = useState(false);
  // which dataset the table shows: the answer's own list at first, then whichever view the Collector picked
  const [tableId, setTableId] = useState<string | null>(card.table);
  const echart = useRef<Echarts.ECharts | null>(null);
  const ds = useMemo(() => card.datasets.find((d) => d.id === (chart?.dataset ?? card.table)) ?? card.datasets[0] ?? null, [card, chart]);
  const tableDs = card.datasets.find((d) => d.id === tableId) ?? ds;
  const activeId = tableView ? tableDs?.id : ds?.id;
  // an answer with several views of its data (localities, wards, types, map): tabs switch between them here, with no new question
  const tabs = card.datasets.length > 1 ? card.datasets.slice(0, 5) : [];
  const pick = (d: Dataset) => {
    if (card.chart?.dataset === d.id) { setChart(card.chart); setTableView(false); return; }
    const s = defaultSpec(d, card.datasets, card.chart);
    if (s) { setChart(s); setTableView(false); }
    else { setTableId(d.id); setTableView(true); }
  };
  const isMap = !!chart && chart.type.startsWith("map");
  const panels = chart?.type === "small_multiples" && chart.series && ds ? Math.min(6, new Set(ds.rows.map((r) => String(r[chart.series!]))).size) : 0;
  const height = panels ? Math.ceil(panels / (panels <= 2 ? panels : panels <= 4 ? 2 : 3)) * (expanded ? 190 : 150)
    : expanded ? 420 : Math.min(360, Math.max(200, 44 + 26 * Math.min(11, ds?.rows.length ?? 6)));

  const drill = (key: string | number | null) => {
    if (key == null || !chart?.x) return;
    // no console filter for this chart: the click becomes the next question, about that bar, in the same scope
    if (!ds?.drill) {
      const where = (card.scopeLine ?? "").split(" · ").filter((x) => !/^as of|all departments|district-wide|chennai news/i.test(x)).join(", ");
      if (onAsk && typeof key === "string" && key.trim()) onAsk(`Tell me about ${key}${where ? ` (${where})` : ""}`);
      return;
    }
    const row = ds.rows.find((r) => String(r[chart.x!]) === String(key));
    const v = row?.[ds.drill.field];
    if (v == null) return;
    const a = ds.drill.action;
    onAction({ action: a, label: "", zone: a === "filter_zone" ? Number(v) : null, dept: a === "filter_dept" ? String(v) : null, taluk: a === "filter_taluk" ? String(v) : null });
  };
  const png = () => {
    const url = echart.current?.getDataURL({ pixelRatio: 2, backgroundColor: "#0B1426" });
    if (url) save(url, `district-iq-${slug(chart?.title ?? "chart")}.png`);
  };
  const csv = () => {
    const d = tableView ? tableDs : ds;
    if (!d) return;
    const cols = d.fields.filter((f) => f.kind !== "geo");
    const cell = (v: unknown) => { const s = v == null ? "" : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const body = "﻿" + [cols.map((f) => cell(f.label)).join(","), ...d.rows.map((r) => cols.map((f) => cell(r[f.key])).join(","))].join("\n");
    save(URL.createObjectURL(new Blob([body], { type: "text/csv;charset=utf-8" })), `district-iq-${slug(d.title)}.csv`);
  };
  const types = ds ? allowedTypes(ds).filter((x) => x !== "kpi" && TYPE_ICON[x]) : [];
  const x = X2[card.language as Lang] ?? X2.en;
  const onSuggested = !tableView && !!chart && !!card.chart && chart.type === card.chart.type && chart.dataset === card.chart.dataset;
  const alts = chart && ds ? alternatives(chart, ds) : [];
  const choose = (ty: ChartType) => {
    if (!chart) return;
    if (ty === "table") { setTableId(ds?.id ?? null); setTableView(true); } else { setTableView(false); setChart(switchType(chart, ty, card.datasets)); }
  };
  if (!ds || !(chart || card.datasets.some((d) => d.rows.length > 0))) return null;

  return (
    <figure className="aq-fig">
      {tabs.length > 0 && (
        <div className="aq-tabs" role="tablist" aria-label={t.views}>
          {tabs.map((d) => (
            <button key={d.id} role="tab" aria-selected={activeId === d.id} className={activeId === d.id ? "on" : ""} onClick={() => pick(d)} title={d.title}>
              {d.tab ?? d.title}
            </button>
          ))}
        </div>
      )}
      {chart && !tableView && (
        <figcaption>
          <b>{chart.title}</b>{chart.subtitle && <span>{chart.subtitle}</span>}
          {/* why this form: the composer's reason for the question, else "suggested for this question: dumbbell" */}
          {onSuggested && (
            <span className="aq-why-chart" title={x.suggested}><I n="spark" />{card.chartReason || `${x.suggested}: ${t.types[chart.type] ?? chart.type}`}</span>
          )}
        </figcaption>
      )}
      <div className="aq-tools" role="toolbar" aria-label={t.chartTools}>
        {/* the chart chosen for the question; one or two other forms that also fit; every form only on request */}
        {chart && !allTypes && (
          <>
            {!onSuggested && card.chart && (
              <button className="aq-alt" onClick={() => { setTableView(false); setChart(card.chart); }}><I n={TYPE_ICON[card.chart.type] ?? "chart"} />{x.backTo}</button>
            )}
            {onSuggested && alts.map((a) => (
              <button key={a} className="aq-alt" onClick={() => choose(a)} title={`${x.alsoFits}: ${t.types[a] ?? a}`}><I n={TYPE_ICON[a] ?? "chart"} />{t.types[a] ?? a}</button>
            ))}
            <button className="aq-alt more" onClick={() => setAllTypes(true)} title={x.moreCharts} aria-label={x.moreCharts}><I n="dots" /></button>
          </>
        )}
        {chart && allTypes && types.map((ty) => (
          <button key={ty} className={!tableView && chart.type === ty ? "on" : ""} title={t.types[ty] ?? ty} aria-label={t.types[ty] ?? ty} onClick={() => choose(ty)}>
            <I n={TYPE_ICON[ty]!} />
          </button>
        ))}
        {!chart && <span className="aq-tools-l">{t.table}</span>}
        <span className="sp" />
        {!isMap && !tableView && chart && <button onClick={png} title={t.png} aria-label={t.png}><I n="photo" /></button>}
        <button onClick={csv} title={t.csv} aria-label={t.csv}><I n="download" /></button>
        <button onClick={onExpand} title={expanded ? t.shrink : t.expand} aria-label={expanded ? t.shrink : t.expand}><I n="expand" /></button>
      </div>
      {tableView || !chart ? <DataTable ds={tableDs ?? ds} lang={card.language as Lang} onOpen={(id) => onAction({ action: "open_incident", label: "", id })} />
        : isMap ? <MapAnswer spec={chart} ds={ds} geo={geo} height={height + 40} onZone={(z) => onAction({ action: "filter_zone", label: "", zone: z })} />
          : <ChartRenderer spec={chart} ds={ds} lang={card.language as Lang} height={height} onDrill={drill} onReady={(e) => { echart.current = e; }} />}
      {ds.normal && chart?.normalBand && !tableView && <p className="aq-note"><i className="band" />{t.usual}: {fmtValue(ds.normal.lo)}–{fmtValue(ds.normal.hi)} ({ds.normal.basis})</p>}
      {ds.total != null && ds.total > ds.rows.length && <p className="aq-note">{t.showing(ds.rows.length, ds.total)}</p>}
    </figure>
  );
}

function DataTable({ ds, lang, onOpen }: { ds: Dataset; lang: Lang; onOpen: (id: string) => void }) {
  const [more, setMore] = useState(false);
  const t = T[lang] ?? T.en;
  const cols = ds.fields.filter((f) => f.kind !== "geo" && !(f.kind === "id" && f.key !== ds.idField && f.key !== "id"));
  const rows = ds.rows.slice(0, more ? 100 : 20);
  return (
    <div className="aq-table">
      <table>
        <caption className="sr">{ds.title}</caption>
        <thead><tr>{cols.map((f) => <th key={f.key} className={f.kind === "value" ? "num" : ""}>{f.label}</th>)}</tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {cols.map((f) => {
                const v = r[f.key];
                if ((f.key === ds.idField || f.key === "id") && typeof v === "string" && /^INC-/.test(v)) return <td key={f.key}><button className="lnk" onClick={() => onOpen(v)}>{v}</button></td>;
                return <td key={f.key} className={f.kind === "value" ? "num" : ""}>{f.kind === "value" ? fmtValue(v == null ? null : Number(v), f.format ?? "integer", f.unit ?? null) : v == null ? "—" : String(v)}</td>;
              })}
            </tr>
          ))}
          {!rows.length && <tr><td colSpan={cols.length}>{t.none}</td></tr>}
        </tbody>
      </table>
      {!more && ds.rows.length > 20 && <button className="lnk aq-more" onClick={() => setMore(true)}>{t.more}</button>}
    </div>
  );
}

function save(href: string, name: string) {
  const a = document.createElement("a");
  a.href = href;
  a.download = name;
  a.click();
  if (href.startsWith("blob:")) setTimeout(() => URL.revokeObjectURL(href), 2000);
}
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50) || "data";
