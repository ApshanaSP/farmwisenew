"use client";
/**
 * Jarvis's answer about the dataset open in the Data Studio (it took over the Studio's own analyst column): the answer
 * in words, what was counted, the chart, and the actions the analyst had: add it to this dataset's dashboard, set an
 * alert ("tell me when"), or open it big in the Studio. The numbers come from the dataset's engine
 * (/api/collector/studio/[id], action "ask": the AI plans the query, the rows are counted), never from the model.
 */
import dynamic from "next/dynamic";
import { useState } from "react";
import { fmtNum, type PanelData, type Plan } from "@/lib/studio/types";
import { I } from "../icons";

const StudioChart = dynamic(() => import("../studio/StudioChart"), { ssr: false, loading: () => <div className="ds-skel sm" /> });

export interface StudioReply {
  kind: "query" | "watch" | "unsupported" | "why";
  plan?: Plan | null; panel?: PanelData | null; answer?: string; note?: string | null; by: "ai" | "rules"; model: string | null; how?: string;
  watch?: { op: "gt" | "gte" | "lt" | "lte"; threshold: number } | null;
}
export interface StudioMsg { id: string; name: string; q: string; a: StudioReply }

export default function StudioAnswer({ s }: { s: StudioMsg }) {
  const a = s.a;
  const [added, setAdded] = useState(false);
  const [watched, setWatched] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const post = async (json: Record<string, unknown>) => {
    const r = await fetch(`/api/collector/studio/${s.id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(json) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error ?? "That did not work.");
    window.dispatchEvent(new CustomEvent("diq:studio-refresh", { detail: { id: s.id } }));
  };
  const add = () => a.plan && post({ action: "add-panel", plan: a.plan }).then(() => setAdded(true)).catch((e) => setErr(e.message));
  const watch = () => a.plan && a.watch && post({ action: "watch", text: s.q, plan: a.plan, op: a.watch.op, threshold: a.watch.threshold }).then(() => setWatched(true)).catch((e) => setErr(e.message));
  const open = () => a.plan && window.dispatchEvent(new CustomEvent("diq:studio-spot", { detail: { id: s.id, plan: a.plan, answer: a.answer } }));
  const chart = a.panel && a.panel.chart !== "kpi" && a.panel.chart !== "table" && a.panel.chart !== "map" && a.panel.values.length > 0;
  return (
    <div className="ds-a jv-ds">
      <small className="jv-ds-src"><I n="table" />From {s.name}</small>
      {a.kind === "unsupported" ? <p className="ds-muted">{a.note}</p> : (
        <>
          {a.panel?.subtitle && <p className="ds-a-how"><I n="sliders" /><span><b>Counted:</b> {a.panel.subtitle}</span></p>}
          {a.note && <p className="ds-muted">{a.note}</p>}
          {chart && <div className="ds-a-c"><StudioChart panel={a.panel!} height={150} compact /></div>}
          {a.panel?.kpi && <div className="ds-a-k"><b>{fmtNum(a.panel.kpi.value, a.panel.format, a.panel.unit)}</b><small>{a.panel.kpi.sub}</small></div>}
          <div className="ds-a-acts">
            {a.kind === "watch" && a.watch && (
              <button className="ds-btn sm" disabled={watched} onClick={watch}><I n="bell" />{watched ? "Alert saved" : `Alert me when ${a.watch.op.startsWith("g") ? "above" : "below"} ${a.watch.threshold.toLocaleString("en-IN")}`}</button>
            )}
            {a.plan && <button className="ds-chip-b" disabled={added} onClick={add}><I n={added ? "check" : "plus"} />{added ? "On the dashboard" : "Add to dashboard"}</button>}
            {a.plan && <button className="ds-chip-b" onClick={open}><I n="expand" />Open in the Studio</button>}
          </div>
          {err && <p className="ds-muted" role="alert">{err}</p>}
          <small className="ds-a-by">{a.by === "ai" ? `Planned by AI (${a.model?.split("/").pop()}) · computed from the rows` : "Read by rules (no AI answered) · computed from the rows"}</small>
        </>
      )}
    </div>
  );
}
