"use client";

/*
 * Department insights on the officer's one page: a compact tile per store source that concerns the
 * department (weather, lakes, police records, hospitals, ...), then what its grievances are about and
 * its own work record. A tile shows the headline figures, the most useful finding and one chart;
 * "Details" opens every chart and table of that source.
 */
import { I, type IconName } from "@/components/collector/app/icons";
import { Chart, Empty, HBars, fmtDate, fmtTime } from "@/components/collector/app/lib";
import type { InsightModule } from "@/lib/officer/insights";
import type { Ctx } from "./OfficerApp";

export const MODULE_ICON: Record<string, IconName> = {
  work: "tasks", patterns: "chart", police: "shield", hospital: "health", lakes: "drop", pwdworks: "cone", pwdfield: "doc", weather: "cloud", air: "wind", markets: "leaf"
};

/** `tile`: on a tile the old data is said in its foot, not twice */
function Badges({ m, c, tile }: { m: InsightModule; c: Pick<Ctx, "areaName">; tile?: boolean }) {
  return (
    <span className="oin-badges">
      {m.area === "district" ? <span className="chip chip-np" title="This source covers the whole district; the zone and taluk filters do not apply">District-wide</span>
        : c.areaName ? <span className="chip chip-src">{c.areaName}</span> : null}
      {!tile && m.stale && m.asOf && <span className="chip sev-high" title={m.refreshNote ?? "The source has not sent newer data"}>Data up to {fmtDate(m.asOf)}</span>}
    </span>
  );
}

function Kpis({ m, max }: { m: InsightModule; max?: number }) {
  return (
    <div className="oin-k">
      {m.kpis.slice(0, max ?? m.kpis.length).map((k) => (
        <div key={k.label} className={`oin-kpi ${k.tone ? `k-${k.tone}` : ""}`}>
          <small>{k.label}</small><b>{k.value}</b>{k.sub && <span title={k.sub}>{k.sub}</span>}
        </div>
      ))}
    </div>
  );
}

function ChartBox({ ch }: { ch: InsightModule["charts"][number] }) {
  return (
    <div className={`oin-chart${ch.kind === "hbar" ? " hb-c" : ""}`}>
      <div className="oin-ct">{ch.title}</div>
      {ch.values.length === 0 ? <Empty>Nothing in this period.</Empty>
        : ch.kind === "hbar" ? <HBars rows={ch.labels.map((l, k) => ({ l, v: ch.values[k] }))} />
          : <Chart kind={ch.kind} vals={ch.values} labels={ch.labels} fmt={(v) => `${v.toLocaleString("en-IN")} ${ch.unit}`} />}
    </div>
  );
}

/** One source on the page: headline figures, two findings, one chart. */
export function ModuleTile({ m, c, onOpen, style }: { m: InsightModule; c: Ctx; onOpen: () => void; style?: React.CSSProperties }) {
  return (
    <article className="card otile" style={style}>
      <div className="ch">
        <I n={MODULE_ICON[m.key] ?? "doc"} /><h2 title={m.source}>{m.title}</h2>
        <Badges m={m} c={c} tile />
      </div>
      <div className="otile-b">
        {m.empty ? <Empty>{m.empty}</Empty> : (
          <>
            <Kpis m={m} max={4} />
            {m.notes.length > 0 && <ul className="oin-n">{m.notes.slice(0, 1).map((n) => <li key={n}>{n}</li>)}</ul>}
            {m.charts[0] && <ChartBox ch={m.charts[0]} />}
          </>
        )}
      </div>
      <div className="otile-f">
        <span title={m.stale ? m.refreshNote ?? m.source : m.source}><I n="clock" />
          {m.stale && m.asOf ? <small className="old">Data up to {fmtDate(m.asOf)}</small> : m.window}</span>
        {!m.empty && (m.charts.length > 1 || m.tables.some((t) => t.rows.length) || m.notes.length > 2 || m.kpis.length > 4)
          && <button className="more" onClick={onOpen}>Details<I n="chevr" /></button>}
      </div>
    </article>
  );
}

const num = (v: unknown) => Number(String(v ?? "").replace(/,/g, "")) || 0;

/**
 * The page's last section, "Work & insights": what the department's grievances are about against the period before, how many came in
 * across the period, where the open work is, and a tile per store source that concerns the department (weather, lakes, police records,
 * hospitals ...). The work record's figures are the band's tiles, so they are not repeated: its full record opens from the section's head.
 */
export function InsightsSection({ c, modules, failed, retry, openModule, trend, area }: {
  c: Ctx; modules: InsightModule[] | null; failed: string | null; retry: () => void; openModule: (key: string) => void;
  trend: React.ReactNode; area: React.ReactNode;
}) {
  const patterns = modules?.find((m) => m.key === "patterns");
  const work = modules?.find((m) => m.key === "work");
  const sources = (modules ?? []).filter((m) => m.key !== "work" && m.key !== "patterns");
  const types = patterns?.tables[0]?.rows ?? [];
  const maxType = Math.max(1, ...types.map((r) => num(r[1])));
  const P = c.ov.periodInfo;
  return (
    <>
      <div className="ofc-h" id="ofc-ins">
        <I n="chart" /><h2>Work &amp; insights</h2><small>{c.dept.short} · {P.label}{c.areaName ? ` · ${c.areaName}` : ""}</small>
        {work && !work.empty && <button className="more" onClick={() => openModule("work")} title="Your department's full work record: received, resolved, on time, by zone and type"><I n="tasks" />Work record<I n="right" /></button>}
      </div>
      {failed && <div className="o-state err ofc-err" role="alert"><I n="alert" />{failed}<button className="btn sm plain" onClick={retry}>Try again</button></div>}
      <section className="ofc-row ofc-ins3">
        <article className="card oi-types">
          <div className="ch"><I n="chart" /><h2>Complaint types <span>· against {/^prev\b/.test(P.prev) ? `the ${P.prev}` : P.prev}</span></h2>
            {patterns && <button className="more" onClick={() => openModule("patterns")}>Details<I n="right" /></button>}</div>
          <div className="fitlist">
            {types.length ? types.map((r) => {
              const ch = String(r[3]);
              const up = ch.startsWith("+") || ch === "new", down = ch.startsWith("−");
              return (
                <div key={String(r[0])} className="oi-type" title={`${r[0]}: ${r[1]} this period, ${r[2]} before (${ch})`}>
                  <span className="oi-tl">{r[0]}</span>
                  <span className="oi-tn">{r[1]}<small> was {r[2]}</small></span>
                  <span className={`oi-ch${up ? " up" : down ? " down" : ""}`}>{ch}</span>
                  <span className="oi-bar"><i style={{ width: `${(num(r[1]) / maxType) * 100}%` }} /></span>
                </div>
              );
            }) : <Empty>{modules ? "No grievances in this period." : "Reading the department's data…"}</Empty>}
          </div>
        </article>
        {trend}
        {area}
      </section>
      {sources.length > 0 && (
        <section className="ofc-row ofc-tiles" aria-label={`${c.dept.short} data in the district`}>
          {sources.map((m) => <ModuleTile key={m.key} m={m} c={c} onOpen={() => openModule(m.key)} />)}
        </section>
      )}
    </>
  );
}

/** Everything one source has: every figure, finding, chart and table (opened from its tile). */
export function ModuleFull({ m, c }: { m: InsightModule; c: Ctx }) {
  return (
    <div className="oin-b">
      <div className="oin-w"><I n="clock" />{m.window}{m.asOf ? <> · newest record {fmtTime(m.asOf)}, {fmtDate(m.asOf)}</> : null} · {m.source}
        <Badges m={m} c={c} /></div>
      {m.empty ? <Empty>{m.empty}</Empty> : (
        <>
          <Kpis m={m} />
          {m.notes.length > 0 && <ul className="oin-n">{m.notes.map((n) => <li key={n}>{n}</li>)}</ul>}
          {m.charts.length > 0 && <div className="oin-c">{m.charts.map((ch) => <ChartBox key={ch.title} ch={ch} />)}</div>}
          {m.tables.filter((t) => t.rows.length).map((t) => (
            <div key={t.title} className="oin-t">
              <div className="oin-ct">{t.title}</div>
              <div className="tbl-wrap">
                <table>
                  <thead><tr>{t.columns.map((h) => <th key={h}>{h}</th>)}</tr></thead>
                  <tbody>{t.rows.map((r, k) => <tr key={k} className="static">{r.map((v, j) => <td key={j} className={j ? "" : "ev"}>{v}</td>)}</tr>)}</tbody>
                </table>
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
