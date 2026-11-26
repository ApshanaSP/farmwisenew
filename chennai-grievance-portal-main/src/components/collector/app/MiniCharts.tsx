"use client";

/**
 * The small charts of the Briefing and the department summary: two-series columns and lines, horizontal bars and one-bar splits. Drawn in
 * the page's own text and tokens (so the Tamil translator and both themes reach every label), thin marks, one axis with its unit, a legend
 * whenever there are two series, a read-out on hover or keyboard focus, and the same numbers as a table for screen readers.
 */
import { useId, useState, type ReactNode } from "react";
import { useSize } from "./lib";

const num = (v: number) => v.toLocaleString("en-IN");

/** Clean axis steps: 0, 5, 10, 15 (never 0, 4.6, 9.3); whole numbers, for these count cases. Pure. */
export function axisTicks(max: number, lines = 3): number[] {
  const top = Math.max(1, Math.ceil(max));
  let step = 1;
  for (const s of [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 2500, 5000, 10000, 20000, 50000]) { step = s; if (top / s <= lines) break; }
  const n = Math.max(1, Math.ceil(top / step));
  return Array.from({ length: n + 1 }, (_, k) => k * step);
}

export interface Pair { key: string; /** under the axis */ label: string; /** in the read-out */ tip: string; a: number; b: number }

export function Legend({ names }: { names: [string, string] }) {
  return <span className="mc-leg"><i className="a" /><em>{names[0]}</em><i className="b" /><em>{names[1]}</em></span>;
}

/** Two counts side by side for each day (columns) or week (lines), on one axis. `caption` is what the axis counts ("cases a day"). */
export function PairChart({ kind, data, names, caption, height = 150, every = 1 }: {
  kind: "columns" | "lines"; data: Pair[]; names: [string, string]; caption: string; height?: number; /** a label under every n-th point */ every?: number;
}) {
  const [ref, { w: W }] = useSize<HTMLDivElement>();
  const [at, setAt] = useState<number | null>(null);
  const id = useId();
  const L = 30, R = 8, T = 18, B = 20, H = height;
  const ticks = axisTicks(Math.max(...data.flatMap((d) => [d.a, d.b]), 1));
  const top = ticks[ticks.length - 1], iw = Math.max(0, W - L - R), n = Math.max(1, data.length), band = iw / n;
  const y = (v: number) => T + (1 - v / top) * (H - T - B);
  const x = (k: number) => (kind === "lines" && n > 1 ? L + (k * iw) / (n - 1) : L + (k + 0.5) * band);
  const base = H - B;
  const bw = Math.min(14, Math.max(3, (band - 8) / 2));
  // the bar's data end is rounded, its foot is square on the baseline
  const bar = (left: number, v: number) => {
    const h = base - y(v), r = Math.min(3, bw / 2, h);
    return h <= 0 ? "" : `M${left} ${base}V${base - h + r}Q${left} ${base - h} ${left + r} ${base - h}H${left + bw - r}Q${left + bw} ${base - h} ${left + bw} ${base - h + r}V${base}Z`;
  };
  const line = (f: (d: Pair) => number) => data.map((d, k) => `${k ? "L" : "M"}${x(k).toFixed(1)} ${y(f(d)).toFixed(1)}`).join("");
  const move = (e: React.PointerEvent<SVGRectElement>) => {
    const r = e.currentTarget.getBoundingClientRect(), f = (e.clientX - r.left) / (r.width || 1);
    setAt(Math.max(0, Math.min(n - 1, kind === "lines" ? Math.round(f * (n - 1)) : Math.floor(f * n))));
  };
  const step = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    setAt((k) => Math.max(0, Math.min(n - 1, (k ?? (e.key === "ArrowRight" ? -1 : n)) + (e.key === "ArrowRight" ? 1 : -1))));
  };
  const tip = at != null ? data[at] : null;
  return (
    <div ref={ref} className="mc" style={{ height: H }}>
      {W > 60 && (
        <svg width={W} height={H} role="img" aria-labelledby={id} tabIndex={0} onKeyDown={step} onBlur={() => setAt(null)}>
          <title id={id}>{`${caption}: ${names[0]}, ${names[1]}`}</title>
          <text className="mc-cap" x={0} y={9}>{caption}</text>
          {ticks.map((t) => (
            <g key={t}>
              <line className={t ? "mc-grid" : "mc-axis"} x1={L} x2={W - R} y1={y(t)} y2={y(t)} />
              <text className="mc-tick" x={L - 6} y={y(t) + 3.5} textAnchor="end">{num(t)}</text>
            </g>
          ))}
          {at != null && (kind === "columns"
            ? <rect className="mc-band" x={x(at) - band / 2 + 1} y={T - 4} width={Math.max(0, band - 2)} height={base - T + 4} rx="4" />
            : <line className="mc-cross" x1={x(at)} x2={x(at)} y1={T - 4} y2={base} />)}
          {kind === "columns" ? data.map((d, k) => (
            <g key={d.key}>
              <path className="mc-a" d={bar(x(k) - bw - 1, d.a)} />
              <path className="mc-b" d={bar(x(k) + 1, d.b)} />
            </g>
          )) : (
            <>
              <path className="mc-la" d={line((d) => d.a)} /><path className="mc-lb" d={line((d) => d.b)} />
              {(at != null ? [at] : [n - 1]).map((k) => data[k] && (
                <g key={k}>
                  <circle className="mc-da" cx={x(k)} cy={y(data[k].a)} r="4" /><circle className="mc-db" cx={x(k)} cy={y(data[k].b)} r="4" />
                </g>
              ))}
            </>
          )}
          {/* labels counted from the latest point back, so the last one is always named and none touch */}
          {data.map((d, k) => (n - 1 - k) % every === 0 ? (
            <text key={d.key} className="mc-tick" x={x(k)} y={H - 5} textAnchor={kind === "lines" ? (k === 0 ? "start" : k === n - 1 ? "end" : "middle") : "middle"}>{d.label}</text>
          ) : null)}
          <rect x={L} y={0} width={iw} height={base} fill="transparent" onPointerMove={move} onPointerLeave={() => setAt(null)} />
        </svg>
      )}
      {tip && at != null && (
        <div className={`mc-tip${x(at) > W * 0.6 ? " left" : ""}`} style={{ left: x(at), top: 14 }} role="status">
          <small>{tip.tip}</small>
          <span><i className="a" /><b>{num(tip.a)}</b>{names[0]}</span>
          <span><i className="b" /><b>{num(tip.b)}</b>{names[1]}</span>
        </div>
      )}
      <table className="mc-sr"><caption>{caption}</caption><thead><tr><th /><th>{names[0]}</th><th>{names[1]}</th></tr></thead>
        <tbody>{data.map((d) => <tr key={d.key}><th>{d.tip}</th><td>{d.a}</td><td>{d.b}</td></tr>)}</tbody></table>
    </div>
  );
}

export interface HRow { key: string; label: string; v: number; /** beside the value, smaller */ sub?: string; color?: string; onClick?: () => void; title?: string }

/** Horizontal bars, the value at the end of each; a row can open its records. */
export function HBarsList({ rows, empty }: { rows: HRow[]; empty: ReactNode }) {
  const max = Math.max(1, ...rows.map((r) => r.v));
  if (!rows.some((r) => r.v > 0)) return <p className="mc-none">{empty}</p>;
  return (
    <ul className="hr-list">
      {rows.map((r) => {
        const inner = <>
          <span className="hr-l" title={r.label}>{r.label}</span>
          <span className="hr-t"><i style={{ width: `${((r.v / max) * 100).toFixed(1)}%`, minWidth: r.v ? 2 : 0, background: r.color }} /></span>
          <span className="hr-v"><b>{num(r.v)}</b>{r.sub && <small>{r.sub}</small>}</span>
        </>;
        return <li key={r.key}>{r.onClick && r.v > 0 ? <button onClick={r.onClick} title={r.title}>{inner}</button> : <div title={r.title}>{inner}</div>}</li>;
      })}
    </ul>
  );
}

export interface SplitPart { key: string; name: string; v: number; tone: "ok" | "late" | "none" }
/** One whole in parts: a bar and its legend with every count. */
export function SplitBar({ title, parts, empty, onPart }: { title: string; parts: SplitPart[]; empty: string; onPart?: (key: string) => void }) {
  const tot = parts.reduce((s, p) => s + p.v, 0);
  return (
    <div className="sp">
      <span className="sp-t">{title}<b>{num(tot)}</b></span>
      {tot === 0 ? <p className="mc-none">{empty}</p> : (
        <>
          <div className="sp-bar" role="img" aria-label={parts.map((p) => `${p.name}: ${p.v}`).join(", ")}>
            {parts.filter((p) => p.v > 0).map((p) => <i key={p.key} className={p.tone} style={{ flexGrow: p.v }} title={`${p.name}: ${num(p.v)} (${Math.round((p.v / tot) * 100)}%)`} />)}
          </div>
          <ul className="sp-leg">
            {parts.filter((p) => p.v > 0 || p.tone !== "none").map((p) => (
              <li key={p.key}>{onPart && p.v > 0
                ? <button onClick={() => onPart(p.key)}><i className={p.tone} /><span>{p.name}</span><b>{num(p.v)}</b><small>{`${Math.round((p.v / tot) * 100)}%`}</small></button>
                : <div><i className={p.tone} /><span>{p.name}</span><b>{num(p.v)}</b><small>{`${Math.round((p.v / tot) * 100)}%`}</small></div>}</li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
