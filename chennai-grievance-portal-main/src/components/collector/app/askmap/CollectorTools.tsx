"use client";

/**
 * Ask the Map final: the answer views for the Collector's steps. Every number shown is the server's.
 *   LeagueTable  a ranked change ("which wards got worse"), every area with a report, the biggest change first
 *   SpeedTable   how fast each area, kind or department closes its cases
 *   GroupList    a count by kind or department
 *   GapList      a typed "which wards are more than 2 km from a fire station" (the farthest step), as a list to print or download
 *   RulePairs    a typed "wine shops within 100 m of schools" (within of facilities): each place and the one it is too close to
 * The tool panels that once sat over the Ask box (Gaps, Rule check, Meeting pack, Your lists) were taken out on 28 Nov 2026 (owner: "I don't
 * want those tools"); the questions they built can still be typed.
 */
import { useMemo, useState } from "react";
import type { AskResponse } from "@/lib/map/ask";
import { fmtDistance } from "@/lib/map/geom";
import { LAYER_WORD } from "@/lib/map/words";
import type { LayerId } from "@/lib/map/types";
import { I } from "../icons";
import type { MapAsk } from "./useMapAsk";

type Lang = "en" | "ta";
const t = (lang: Lang, en: string, ta: string) => (lang === "ta" ? ta : en);

// ---------------------------------------------------------------- answer views --

const csvCell = (v: unknown) => { const s = v == null ? "" : String(v); const safe = /^[=+\-@]/.test(s) ? `'${s}` : s; return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe; };
function download(name: string, head: string[], rows: unknown[][], meta: string[]) {
  const body = [...meta.map((m) => `# ${m}`), head.join(","), ...rows.map((r) => r.map(csvCell).join(","))].join("\n") + "\n";
  const url = URL.createObjectURL(new Blob([body], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a"); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
function printTable(title: string, sub: string, head: string[], rows: (string | number)[][]) {
  const w = window.open("", "_blank", "noopener=no");
  if (!w) return;
  const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
  w.document.write(`<!doctype html><meta charset="utf-8"><title>${esc(title)}</title><style>:root{color-scheme:light}body{font:13px system-ui;margin:24px;background:#fff;color:#0F172A}table{border-collapse:collapse;width:100%}th,td{border:1px solid #CBD5E1;padding:4px 6px;text-align:left}th{background:#F1F5F9}</style>`
    + `<h1 style="font-size:18px">${esc(title)}</h1><p>${esc(sub)}</p><table><tr>${head.map((h) => `<th>${esc(h)}</th>`).join("")}</tr>${rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`).join("")}</table>`);
  w.document.close(); w.focus(); w.print();
}

/** The league table of a ranked change: every area with any report, the biggest rise (or fall) first; a row's cases on the map on a click. */
export function LeagueTable({ r, ask, lang }: { r: AskResponse; ask: MapAsk; lang: Lang }) {
  const k = r.extra.rank;
  const [all, setAll] = useState(false);
  if (!k) return null;
  const rows = all ? k.rows : k.rows.slice(0, 10);
  const head = [t(lang, "#", "#"), t(lang, k.by === "ward" ? "Ward" : k.by === "zone" ? "Zone" : "Taluk", k.by === "ward" ? "வார்டு" : k.by === "zone" ? "மண்டலம்" : "வட்டம்"),
    t(lang, k.beforeLabel.en, k.beforeLabel.ta), t(lang, k.nowLabel.en, k.nowLabel.ta), t(lang, "Change", "மாற்றம்"), "%"];
  const data = k.rows.map((x, i) => [i + 1, lang === "ta" ? x.label_ta : x.label, x.before, x.now, x.delta, x.pct ?? ""]);
  return (
    <div className="amt-view">
      <div className="amp-sec" style={{ cursor: "default" }}>{t(lang, "League table", "தரவரிசை")}<span className="n">{k.rows.length}</span></div>
      <table className="amt-tbl league"><thead><tr>{head.map((h) => <th key={h} scope="col">{h}</th>)}</tr></thead>
        <tbody>{rows.map((x, i) => (
          <tr key={x.key} tabIndex={0} className={ask.spot?.label === x.label ? "on" : ""} onClick={() => ask.setSpot(ask.spot?.label === x.label ? null : { ids: x.ids, label: x.label })}
            onKeyDown={(e) => { if (e.key === "Enter") ask.setSpot({ ids: x.ids, label: x.label }); }}>
            <td>{i + 1}</td><td>{lang === "ta" ? x.label_ta : x.label}</td><td>{x.before.toLocaleString("en-IN")}</td><td>{x.now.toLocaleString("en-IN")}</td>
            <td className={x.delta > 0 ? "up" : x.delta < 0 ? "down" : ""}>{x.delta > 0 ? "+" : ""}{x.delta.toLocaleString("en-IN")}</td><td>{x.pct == null ? "–" : `${x.pct > 0 ? "+" : ""}${x.pct}`}</td>
          </tr>))}</tbody></table>
      <p className="amt-muted">{t(lang, "Per cent only where there were 5 or more before. A click shows that area's cases now.", "முன்பு 5 அல்லது அதற்கு மேல் இருந்தால் மட்டும் சதவீதம்.")}</p>
      <div className="amp-tacts">
        {k.rows.length > 10 && <button onClick={() => setAll((v) => !v)}>{all ? t(lang, "Top 10", "முதல் 10") : t(lang, `All ${k.rows.length}`, `அனைத்தும் ${k.rows.length}`)}</button>}
        <button onClick={() => download(`league-${k.by}.csv`, head, data, [`District IQ · Ask the Map league table`, `As of ${r.asOf.data || r.asOf.now}`, `${k.nowLabel.en} against ${k.beforeLabel.en}`])}><I n="download" />CSV</button>
        <button onClick={() => printTable(t(lang, "League table", "தரவரிசை"), `${r.answer?.headline ?? ""} As of ${r.asOf.data || r.asOf.now}.`, head, data as (string | number)[][])}><I n="doc" />{t(lang, "Print", "அச்சிடு")}</button>
      </div>
    </div>
  );
}

/** v2: how fast each area, kind or department closes its cases: a table (median days to close, closed, still open), a click shows its cases. */
export function SpeedTable({ r, ask, lang }: { r: AskResponse; ask: MapAsk; lang: Lang }) {
  const k = r.extra.speed;
  const [all, setAll] = useState(false);
  if (!k) return null;
  const rows = all ? k.rows : k.rows.slice(0, 10);
  const unitEn = { ward: "Ward", zone: "Zone", taluk: "Taluk", category: "Kind", dept: "Department" }[k.by];
  const unitTa = { ward: "வார்டு", zone: "மண்டலம்", taluk: "வட்டம்", category: "வகை", dept: "துறை" }[k.by];
  const head = ["#", t(lang, unitEn, unitTa), t(lang, "Median days to close", "நடுநிலை நாட்கள்"), t(lang, "Closed", "முடிந்தவை"), t(lang, "Still open", "திறந்தவை")];
  const data = k.rows.map((x, i) => [i + 1, lang === "ta" ? x.label_ta : x.label, x.medianDays, x.closed, x.open]);
  return (
    <div className="amt-view">
      <div className="amp-sec" style={{ cursor: "default" }}>{t(lang, k.order === "fast" ? "Fastest to close" : "Slowest to close", k.order === "fast" ? "வேகமாகத் தீர்ப்பவை" : "மெதுவாகத் தீர்ப்பவை")}<span className="n">{k.rows.length}</span></div>
      <table className="amt-tbl league"><thead><tr>{head.map((h) => <th key={h} scope="col">{h}</th>)}</tr></thead>
        <tbody>{rows.map((x, i) => (
          <tr key={x.key} tabIndex={0} className={ask.spot?.label === x.label ? "on" : ""} onClick={() => ask.setSpot(ask.spot?.label === x.label ? null : { ids: x.ids, label: x.label })}
            onKeyDown={(e) => { if (e.key === "Enter") ask.setSpot({ ids: x.ids, label: x.label }); }}>
            <td>{i + 1}</td><td>{lang === "ta" ? x.label_ta : x.label}</td><td>{x.medianDays}</td><td>{x.closed.toLocaleString("en-IN")}</td><td>{x.open.toLocaleString("en-IN")}</td>
          </tr>))}</tbody></table>
      <p className="amt-muted">{t(lang, `Days from the first report to closing, the middle value; only where ${k.minClosed} or more were closed. A click shows that row's cases.`, `முதல் புகாரிலிருந்து முடிவு வரை நாட்கள்; ${k.minClosed}+ முடிந்தவை உள்ளவை மட்டும்.`)}</p>
      <div className="amp-tacts">
        {k.rows.length > 10 && <button onClick={() => setAll((v) => !v)}>{all ? t(lang, "Top 10", "முதல் 10") : t(lang, `All ${k.rows.length}`, `அனைத்தும் ${k.rows.length}`)}</button>}
        <button onClick={() => download(`speed-${k.by}.csv`, head, data, [`District IQ · Ask the Map: how fast cases close`, `As of ${r.asOf.data || r.asOf.now}`])}><I n="download" />CSV</button>
        <button onClick={() => printTable(t(lang, "How fast cases close", "தீர்வு வேகம்"), `${r.answer?.headline ?? ""} As of ${r.asOf.data || r.asOf.now}.`, head, data as (string | number)[][])}><I n="doc" />{t(lang, "Print", "அச்சிடு")}</button>
      </div>
    </div>
  );
}

/** A count by kind or department: a ranked list (no place of its own on the map); a click shows its cases. */
export function GroupList({ r, ask, lang }: { r: AskResponse; ask: MapAsk; lang: Lang }) {
  const g = r.extra.groups;
  const by = r.extra.groupsBy;
  const [all, setAll] = useState(false);
  if (!g?.length || (by !== "category" && by !== "dept" && by !== "near")) return null;
  const rows = all ? g : g.slice(0, 10);
  const total = g.reduce((a, x) => a + x.n, 0);
  const title = by === "category" ? t(lang, "By kind", "வகை வாரியாக") : by === "dept" ? t(lang, "By department", "துறை வாரியாக") : t(lang, "By the place near", "அருகிலுள்ள இடம் வாரியாக");
  return (
    <div className="amt-view">
      <div className="amp-sec" style={{ cursor: "default" }}>{title}<span className="n">{g.length}</span></div>
      <table className="amt-tbl league"><thead><tr><th scope="col">#</th><th scope="col">{by === "category" ? t(lang, "Kind", "வகை") : by === "dept" ? t(lang, "Department", "துறை") : t(lang, "Place", "இடம்")}</th><th scope="col">{t(lang, "Cases", "சம்பவங்கள்")}</th><th scope="col">%</th></tr></thead>
        <tbody>{rows.map((x, i) => (
          <tr key={x.key} tabIndex={0} className={ask.spot?.label === x.label ? "on" : ""} onClick={() => ask.setSpot(ask.spot?.label === x.label ? null : { ids: x.ids, label: x.label })}
            onKeyDown={(e) => { if (e.key === "Enter") ask.setSpot({ ids: x.ids, label: x.label }); }}>
            <td>{i + 1}</td><td>{lang === "ta" ? x.label_ta : x.label}</td><td>{x.n.toLocaleString("en-IN")}</td><td>{total ? Math.round((x.n / total) * 100) : 0}</td>
          </tr>))}</tbody></table>
      {g.length > 10 && <div className="amp-tacts"><button onClick={() => setAll((v) => !v)}>{all ? t(lang, "Top 10", "முதல் 10") : t(lang, `All ${g.length}`, `அனைத்தும் ${g.length}`)}</button></div>}
    </div>
  );
}

/** A gap answer as a list: each area, how far, and the nearest place it was measured to. */
export function GapList({ r, lang }: { r: AskResponse; lang: Lang }) {
  const g = r.extra.gap, areas = r.extra.areas;
  const [all, setAll] = useState(false);
  if (!g || !areas) return null;
  const lw = LAYER_WORD[g.from];
  const unit = g.by === "place" ? t(lang, "Neighbourhood", "பகுதி") : g.by === "ward" ? t(lang, "Ward", "வார்டு") : t(lang, "Zone", "மண்டலம்");
  const head = ["#", unit, g.by === "place" ? t(lang, "Distance", "தூரம்") : t(lang, "90 % within", "90% நிலம்"), t(lang, `Nearest ${lw.one}`, `அருகிலுள்ள ${lw.ta_one}`)];
  const data = areas.map((a, i) => [i + 1, lang === "ta" ? a.label_ta : a.label, Math.round(a.p90), a.worst.to?.name ?? ""]);
  const rows = all ? areas : areas.slice(0, 12);
  return (
    <div className="amt-view">
      <div className="amp-sec" style={{ cursor: "default" }}>{t(lang, "Gap list", "இடைவெளிப் பட்டியல்")}<span className="n">{areas.length}{g.beyond != null ? ` / ${g.total}` : ""}</span></div>
      {!areas.length ? <p className="amt-muted">{t(lang, "None: every one is within the distance.", "எதுவும் இல்லை.")}</p> : (
        <table className="amt-tbl"><thead><tr>{head.map((h) => <th key={h} scope="col">{h}</th>)}</tr></thead>
          <tbody>{rows.map((a, i) => <tr key={a.key}><td>{i + 1}</td><td>{lang === "ta" ? a.label_ta : a.label}</td><td>{fmtDistance(a.p90, lang)}</td><td>{a.worst.to?.name ?? (lang === "ta" ? lw.ta_one : `a ${lw.one}`)}</td></tr>)}</tbody></table>
      )}
      <div className="amp-tacts">
        {areas.length > 12 && <button onClick={() => setAll((v) => !v)}>{all ? t(lang, "Fewer", "குறைவாக") : t(lang, `All ${areas.length}`, `அனைத்தும் ${areas.length}`)}</button>}
        <button disabled={!areas.length} onClick={() => download(`gaps-${g.from}.csv`, [...head.slice(0, 2), "metres", head[3]], data, [`District IQ · Ask the Map gap list`, `As of ${r.asOf.data || r.asOf.now}`, `${r.answer?.headline ?? ""}`, "Straight-line distances"])}><I n="download" />CSV</button>
        <button disabled={!areas.length} onClick={() => printTable(t(lang, "Gap list", "இடைவெளிப் பட்டியல்"), `${r.answer?.headline ?? ""} ${r.answer?.meaning ?? ""} As of ${r.asOf.data || r.asOf.now}.`, head, areas.map((a, i) => [i + 1, a.label, fmtDistance(a.p90), a.worst.to?.name ?? ""]))}><I n="doc" />{t(lang, "Print", "அச்சிடு")}</button>
      </div>
    </div>
  );
}

/** A rule check's pairs: each place kept and the one it is too close to, nearest first. */
export function RulePairs({ r, lang }: { r: AskResponse; lang: Lang }) {
  const p = r.extra.pairs;
  const [all, setAll] = useState(false);
  const items = useMemo(() => p?.items ?? [], [p]);
  if (!p) return null;
  const head = ["#", t(lang, "Place", "இடம்"), t(lang, "Too close to", "அருகிலுள்ளது"), t(lang, "Distance", "தூரம்")];
  const name = (x: { name: string | null; name_ta: string | null; layer: LayerId }) => (lang === "ta" ? x.name_ta ?? x.name : x.name) ?? (lang === "ta" ? LAYER_WORD[x.layer].ta_one : `A ${LAYER_WORD[x.layer].one}`);
  const rows = all ? items : items.slice(0, 12);
  return (
    <div className="amt-view">
      <div className="amp-sec" style={{ cursor: "default" }}>{t(lang, `Within ${p.meters} m`, `${p.meters} மீ க்குள்`)}<span className="n">{items.length}</span></div>
      {items.length > 0 && <table className="amt-tbl"><thead><tr>{head.map((h) => <th key={h} scope="col">{h}</th>)}</tr></thead>
        <tbody>{rows.map((x, i) => <tr key={x.id}><td>{i + 1}</td><td>{name(x)}</td><td>{name(x.near)}</td><td>{fmtDistance(x.near.m, lang)}</td></tr>)}</tbody></table>}
      <p className="amt-warn"><I n="info" />{t(lang, "Straight line between the map points of each place. OpenStreetMap lists only some shops. Confirm the legal distance and each place on the ground with the Excise desk.",
        "நேர்கோட்டுத் தூரம். OpenStreetMap சில கடைகளை மட்டுமே காட்டுகிறது. சட்டப்படியான தூரத்தை கலால் பிரிவிடம் உறுதிசெய்யவும்.")}</p>
      <div className="amp-tacts">
        {items.length > 12 && <button onClick={() => setAll((v) => !v)}>{all ? t(lang, "Fewer", "குறைவாக") : t(lang, `All ${items.length}`, `அனைத்தும் ${items.length}`)}</button>}
        <button disabled={!items.length} onClick={() => download("rule-check.csv", ["#", "place", "too close to", "metres", "lat", "lon"], items.map((x, i) => [i + 1, x.name ?? "", x.near.name ?? "", x.near.m, x.lat, x.lon]),
          [`District IQ · Ask the Map rule check`, `As of ${r.asOf.data || r.asOf.now}`, `${r.answer?.headline ?? ""}`, "Distance set by the officer; the legal distance is the Excise desk's to confirm"])}><I n="download" />CSV</button>
      </div>
    </div>
  );
}

/** The layers an answer used that OpenStreetMap holds only in part, said under the answer. */
export function PartialNote({ r, lang }: { r: AskResponse; lang: Lang }) {
  const ps = r.asOf.layers.filter((l) => l.partial);
  if (!ps.length) return null;
  return (
    <p className="amt-partial" role="note"><I n="alert" />
      {ps.map((l) => t(lang, `${l.en}: OpenStreetMap, ${l.count.toLocaleString("en-IN")} ${l.partial!.what}, not the full list (${l.partial!.owner} holds it).`,
        `${l.ta}: OpenStreetMap இல் ${l.count} மட்டும், முழுப் பட்டியல் அல்ல.`)).join(" ")}
    </p>
  );
}
