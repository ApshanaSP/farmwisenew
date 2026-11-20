"use client";

/**
 * Ask the Map final: the Collector's own tools over the Ask box, and the answer views for the new steps.
 *   Gaps        "which wards or neighbourhoods are more than X km from a bank / ATM / ration shop ..." (the farthest step), as a list to print
 *               or download
 *   Rule check  licensed premises within N m of schools or places of worship (within of facilities); N is the officer's own setting,
 *               kept in this browser, and the panel says the legal distance is the Excise desk's to confirm
 *   Packs       the weekly review, the quarterly bank meeting, the pre-monsoon meeting: a printable page (/api/map/pack)
 *   Your lists  upload a CSV, Excel or PDF list, check where each row was placed, approve it (only then is it on the map), remove it
 * And the views: the league table of a ranked change, the gap list, the rule check's pairs. Every number shown is the server's.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import type { AskResponse } from "@/lib/map/ask";
import type { Plan, Step } from "@/lib/map/plan";
import { fmtDistance } from "@/lib/map/geom";
import { LAYER_WORD } from "@/lib/map/words";
import type { LayerId } from "@/lib/map/types";
import { I, type IconName } from "../icons";
import type { MapAsk } from "./useMapAsk";

type Lang = "en" | "ta";
const t = (lang: Lang, en: string, ta: string) => (lang === "ta" ? ta : en);
const take = (as: string, layer: LayerId, kinds: string[] | null = null): Step => ({ op: "take", as, layer, filter: null, where: kinds ? { government: null, kinds } : null });

/** the layers a gap can be measured from, in the order a Collector reaches for them */
const GAP_FROM: { layer: LayerId; kinds?: string[]; en: string; ta: string }[] = [
  { layer: "banks", en: "a bank branch", ta: "வங்கிக் கிளை" }, { layer: "atms", en: "an ATM", ta: "ஏடிஎம்" }, { layer: "ration_shops", en: "a ration shop", ta: "நியாய விலைக் கடை" },
  { layer: "hospitals", kinds: ["hospital", "health_centre"], en: "a hospital or health centre", ta: "மருத்துவமனை" }, { layer: "schools", en: "a school", ta: "பள்ளி" },
  { layer: "fire_stations", en: "a fire station", ta: "தீயணைப்பு நிலையம்" }, { layer: "pharmacies", en: "a pharmacy", ta: "மருந்தகம்" },
  { layer: "toilets", en: "a public toilet", ta: "பொதுக் கழிப்பறை" }, { layer: "bus_stations", en: "a bus station", ta: "பேருந்து நிலையம்" },
  { layer: "police", en: "a police station", ta: "காவல் நிலையம்" }, { layer: "my_list", en: "a place on your list", ta: "உங்கள் பட்டியல்" }
];
const RULE_OF: { id: string; layer: LayerId; kinds: string[] | null; en: string; ta: string }[] = [
  { id: "wine", layer: "liquor", kinds: ["wine_shop"], en: "Wine shops (TASMAC)", ta: "மதுக்கடைகள்" }, { id: "bars", layer: "liquor", kinds: ["bar", "pub"], en: "Bars and pubs", ta: "மதுக்கூடங்கள்" },
  { id: "all", layer: "liquor", kinds: null, en: "Wine shops and bars", ta: "அனைத்து மது இடங்களும்" }, { id: "list", layer: "my_list", kinds: null, en: "Places on your list", ta: "உங்கள் பட்டியல்" }
];
const RULE_NEAR: { id: string; layer: LayerId; en: string; ta: string }[] = [
  { id: "schools", layer: "schools", en: "Schools", ta: "பள்ளிகள்" }, { id: "worship", layer: "worship", en: "Places of worship", ta: "வழிபாட்டுத் தலங்கள்" },
  { id: "colleges", layer: "colleges", en: "Colleges", ta: "கல்லூரிகள்" }, { id: "hospitals", layer: "hospitals", en: "Hospitals", ta: "மருத்துவமனைகள்" }
];
const RULE_KEY = "diq.map.ruleMeters";
const readRule = () => { try { const v = Number(localStorage.getItem(RULE_KEY)); return v >= 10 && v <= 5000 ? v : 100; } catch { return 100; } };
const saveRule = (v: number) => { try { localStorage.setItem(RULE_KEY, String(v)); } catch { /* the setting lasts this visit */ } };

type Tool = "gap" | "rule" | "pack" | "lists" | null;

export function ToolsBar({ ask, lang }: { ask: MapAsk; lang: Lang }) {
  const [tool, setTool] = useState<Tool>(null);
  const btn = (id: Exclude<Tool, null>, ic: IconName, en: string, ta: string) => (
    <button className={tool === id ? "on" : ""} aria-expanded={tool === id} aria-controls={`amtool-${id}`} onClick={() => setTool(tool === id ? null : id)}><I n={ic} />{t(lang, en, ta)}</button>
  );
  return (
    <div className="amt">
      <div className="amt-row" role="toolbar" aria-label={t(lang, "Collector's tools", "ஆட்சியர் கருவிகள்")}>
        {btn("gap", "ruler", "Gaps", "இடைவெளிகள்")}{btn("rule", "shield", "Rule check", "விதி சோதனை")}{btn("pack", "doc", "Meeting pack", "கூட்டத் தொகுப்பு")}{btn("lists", "table", "Your lists", "உங்கள் பட்டியல்கள்")}
      </div>
      {tool === "gap" && <GapForm ask={ask} lang={lang} onDone={() => setTool(null)} />}
      {tool === "rule" && <RuleForm ask={ask} lang={lang} onDone={() => setTool(null)} />}
      {tool === "pack" && <PackForm lang={lang} />}
      {tool === "lists" && <ListsForm ask={ask} lang={lang} />}
    </div>
  );
}

function GapForm({ ask, lang, onDone }: { ask: MapAsk; lang: Lang; onDone: () => void }) {
  const [from, setFrom] = useState(0);
  const [km, setKm] = useState(2);
  const [by, setBy] = useState<"place" | "ward" | "zone">("place");
  const go = () => {
    const f = GAP_FROM[from];
    const plan: Plan = { language: lang, show: "far", steps: [take("f1", f.layer, f.kinds ?? null), { op: "farthest", as: "far", areas: by, from: "f1", beyond_m: Math.round(km * 1000) }] };
    const what = { place: t(lang, "Neighbourhoods", "பகுதிகள்"), ward: t(lang, "Wards", "வார்டுகள்"), zone: t(lang, "Zones", "மண்டலங்கள்") }[by];
    void ask.run(plan, t(lang, `${what} more than ${km} km from ${f.en}`, `${f.ta} இலிருந்து ${km} கி.மீ க்கு மேல் உள்ள ${what}`));
    onDone();
  };
  return (
    <form id="amtool-gap" className="amt-card" onSubmit={(e) => { e.preventDefault(); go(); }}>
      <p>{t(lang, "Which places are far from a service? Straight-line distance.", "எந்த இடங்கள் ஒரு சேவையிலிருந்து தொலைவில் உள்ளன? நேர்கோட்டுத் தூரம்.")}</p>
      <label>{t(lang, "Show", "காட்டு")}
        <select value={by} onChange={(e) => setBy(e.target.value as typeof by)}>
          <option value="place">{t(lang, "neighbourhoods", "பகுதிகள்")}</option><option value="ward">{t(lang, "wards (90 % of the ground)", "வார்டுகள்")}</option><option value="zone">{t(lang, "zones", "மண்டலங்கள்")}</option>
        </select></label>
      <label>{t(lang, "more than", "இதற்கு மேல்")}
        <input type="number" min={0.1} max={20} step={0.1} value={km} onChange={(e) => setKm(Math.max(0.1, Math.min(20, Number(e.target.value) || 2)))} aria-label={t(lang, "Kilometres", "கிலோமீட்டர்")} /> km</label>
      <label>{t(lang, "from", "இலிருந்து")}
        <select value={from} onChange={(e) => setFrom(Number(e.target.value))}>{GAP_FROM.map((f, i) => <option key={f.layer + i} value={i}>{t(lang, f.en, f.ta)}</option>)}</select></label>
      <button type="submit" className="pri" disabled={ask.busy}><I n="search" />{t(lang, "Find the gaps", "இடைவெளிகளைக் காண்")}</button>
    </form>
  );
}

function RuleForm({ ask, lang, onDone }: { ask: MapAsk; lang: Lang; onDone: () => void }) {
  const [of, setOf] = useState("wine");
  const [near, setNear] = useState<Set<string>>(new Set(["schools", "worship"]));
  const [m, setM] = useState(100);
  useEffect(() => setM(readRule()), []);
  const go = () => {
    const o = RULE_OF.find((x) => x.id === of)!;
    const ns = RULE_NEAR.filter((x) => near.has(x.id));
    if (!ns.length) return;
    saveRule(m);
    const plan: Plan = { language: lang, show: "rule", steps: [take("f1", o.layer, o.kinds), ...ns.map((x, i) => take(`n${i + 1}`, x.layer)),
      { op: "within", as: "rule", of: "f1", near: ns.map((_, i) => `n${i + 1}`), meters: m }] };
    void ask.run(plan, t(lang, `${o.en} within ${m} m of ${ns.map((x) => x.en.toLowerCase()).join(" or ")}`, `${ns.map((x) => x.ta).join(" / ")} இலிருந்து ${m} மீ க்குள் ${o.ta}`));
    onDone();
  };
  return (
    <form id="amtool-rule" className="amt-card" onSubmit={(e) => { e.preventDefault(); go(); }}>
      <label>{t(lang, "Check", "சோதி")}<select value={of} onChange={(e) => setOf(e.target.value)}>{RULE_OF.map((x) => <option key={x.id} value={x.id}>{t(lang, x.en, x.ta)}</option>)}</select></label>
      <fieldset><legend>{t(lang, "near", "அருகே")}</legend>
        {RULE_NEAR.map((x) => (
          <label key={x.id} className="chk"><input type="checkbox" checked={near.has(x.id)} onChange={() => setNear((s) => { const n = new Set(s); if (n.has(x.id)) n.delete(x.id); else n.add(x.id); return n; })} />{t(lang, x.en, x.ta)}</label>
        ))}
      </fieldset>
      <label>{t(lang, "within", "க்குள்")}<input type="number" min={10} max={5000} step={10} value={m} onChange={(e) => setM(Math.max(10, Math.min(5000, Math.round(Number(e.target.value) || 100))))} aria-label={t(lang, "Metres", "மீட்டர்")} /> m</label>
      <p className="amt-warn"><I n="info" />{t(lang, "Your setting, kept in this browser. Confirm the legal distance with the Excise desk (AC Excise) before acting on it.",
        "இது உங்கள் அமைப்பு. சட்டப்படியான தூரத்தை கலால் பிரிவிடம் (AC Excise) உறுதிசெய்த பின் செயல்படுங்கள்.")}</p>
      <button type="submit" className="pri" disabled={ask.busy || !near.size}><I n="shield" />{t(lang, "Check", "சோதி")}</button>
    </form>
  );
}

const PACKS: { kind: "weekly" | "bank" | "monsoon"; ic: IconName; en: string; ta: string; why: string }[] = [
  { kind: "weekly", ic: "cal", en: "Weekly review", ta: "வாராந்திர ஆய்வு", why: "Open cases by ward, the wards that got worse, past deadline." },
  { kind: "bank", ic: "chart", en: "Quarterly bank meeting", ta: "காலாண்டு வங்கிக் கூட்டம்", why: "Wards and neighbourhoods far from a bank or ATM; money points in flooded wards." },
  { kind: "monsoon", ic: "cloud", en: "Pre-monsoon meeting", ta: "பருவமழைக்கு முந்தைய கூட்டம்", why: "Flooding by ward, distance to fire stations, drains, works behind plan." }
];
function PackForm({ lang }: { lang: Lang }) {
  return (
    <div id="amtool-pack" className="amt-card">
      <p>{t(lang, "One printable page: a map, the top 10 and the numbers. The figures are counted by District IQ; the opening sentences may be written by Claude from them.",
        "ஒரு பக்கம்: வரைபடம், முதல் 10, எண்கள். எண்கள் District IQ கணக்கிட்டவை.")}</p>
      <ul className="amt-packs">
        {PACKS.map((p) => (
          <li key={p.kind}><a href={`/api/map/pack?kind=${p.kind}&format=html`} target="_blank" rel="noopener"><I n={p.ic} /><b>{t(lang, p.en, p.ta)}</b><small>{p.why}</small><I n="ext" /></a></li>
        ))}
      </ul>
    </div>
  );
}

interface ListRowV { n: number; name: string; how: "exact" | "approximate" | "none"; why: string | null; ward: number | null; note: string | null }
interface ListV { id: string; name: string; status: "draft" | "approved"; owner: string; mine: boolean; created: string; source: { file: string; kind: string }; rows: ListRowV[]; capped?: boolean }
function ListsForm({ ask, lang }: { ask: MapAsk; lang: Lang }) {
  const [lists, setLists] = useState<ListV[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const load = async () => {
    const r = await fetch("/api/map/lists").then((x) => (x.ok ? x.json() : null)).catch(() => null);
    setLists(r?.lists ?? []);
    if (!r) setErr(t(lang, "Your lists could not be loaded.", "பட்டியல்களை ஏற்ற முடியவில்லை."));
  };
  useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const upload = async () => {
    const f = file.current?.files?.[0];
    if (!f) { setErr(t(lang, "Choose a file first.", "முதலில் ஒரு கோப்பைத் தேர்வு செய்யவும்.")); return; }
    if (f.size > 2 * 1024 * 1024) { setErr(t(lang, "The file is over 2 MB.", "கோப்பு 2 MB க்கு மேல்.")); return; }
    setBusy(true); setErr(null);
    const fd = new FormData(); fd.append("file", f); fd.append("name", name);
    const r = await fetch("/api/map/lists", { method: "POST", body: fd }).then(async (x) => ({ ok: x.ok, j: await x.json().catch(() => ({})) })).catch(() => ({ ok: false, j: {} as Record<string, unknown> }));
    setBusy(false);
    if (!r.ok) { setErr(String((r.j as { error?: string }).error ?? t(lang, "The upload failed.", "பதிவேற்றம் தோல்வி."))); return; }
    const l = (r.j as { list: ListV }).list;
    setOpen(l.id); setName(""); if (file.current) file.current.value = "";
    await load();
  };
  const act = async (id: string, action: "approve" | "remove") => {
    if (action === "remove" && !window.confirm(t(lang, "Remove this list? It leaves the map at once.", "இந்தப் பட்டியலை நீக்கவா?"))) return;
    setBusy(true); setErr(null);
    const r = await fetch(`/api/map/lists/${id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action }) })
      .then(async (x) => ({ ok: x.ok, j: await x.json().catch(() => ({})) })).catch(() => ({ ok: false, j: {} as Record<string, unknown> }));
    setBusy(false);
    if (!r.ok) setErr(String((r.j as { error?: string }).error ?? "That did not work."));
    await load();
  };
  const show = (l: ListV) => void ask.run({ language: lang, show: "f1", steps: [take("f1", "my_list", [l.id])] }, t(lang, `Your list: ${l.name}`, `உங்கள் பட்டியல்: ${l.name}`));
  return (
    <div id="amtool-lists" className="amt-card">
      <form onSubmit={(e) => { e.preventDefault(); void upload(); }} className="amt-up">
        <p>{t(lang, "Load a list of places (CSV, Excel or PDF, up to 2 MB, 2,000 rows). Rows are placed from their latitude and longitude, or from a locality or ward the map knows. Nothing shows on the map until you approve it. Do not upload lists with people's personal details.",
          "இடங்களின் பட்டியலை ஏற்றுங்கள் (CSV, Excel அல்லது PDF). நீங்கள் ஒப்புதல் தரும் வரை வரைபடத்தில் காட்டாது. தனிநபர் விவரங்கள் உள்ள பட்டியலை ஏற்ற வேண்டாம்.")}</p>
        <input ref={file} type="file" accept=".csv,.xlsx,.xls,.pdf" aria-label={t(lang, "List file", "பட்டியல் கோப்பு")} />
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder={t(lang, "Name, e.g. Ration shops from TNPDS", "பெயர்")} aria-label={t(lang, "List name", "பட்டியல் பெயர்")} />
        <button type="submit" className="pri" disabled={busy}><I n="up" />{busy ? t(lang, "Reading…", "படிக்கிறது…") : t(lang, "Upload and check", "ஏற்றிச் சரிபார்")}</button>
      </form>
      {err && <p className="amp-err" role="alert">{err}</p>}
      {lists === null ? <p className="amt-muted">{t(lang, "Loading…", "ஏற்றுகிறது…")}</p> : !lists.length ? <p className="amt-muted">{t(lang, "No lists yet.", "பட்டியல் இல்லை.")}</p> : (
        <ul className="amt-lists">
          {lists.map((l) => {
            const placed = l.rows.filter((r) => r.how !== "none").length, approx = l.rows.filter((r) => r.how === "approximate").length;
            return (
              <li key={l.id}>
                <div className="amt-lh">
                  <b>{l.name}</b><span className={`amt-st ${l.status}`}>{l.status === "approved" ? t(lang, "on the map", "வரைபடத்தில்") : t(lang, "draft: check, then approve", "வரைவு")}</span>
                  <small>{placed} {t(lang, "of", "/")} {l.rows.length} {t(lang, "placed", "இடம் பெற்றன")}{approx ? ` · ${approx} ${t(lang, "approximate", "தோராயம்")}` : ""} · {l.source.kind.toUpperCase()}{l.capped ? ` · ${t(lang, "first 2,000 rows only", "முதல் 2,000 வரிசைகள்")}` : ""}</small>
                </div>
                <div className="amt-la">
                  <button type="button" onClick={() => setOpen(open === l.id ? null : l.id)} aria-expanded={open === l.id}>{t(lang, "Check rows", "வரிசைகள்")}</button>
                  {l.status === "draft" && l.mine && <button type="button" className="pri" disabled={busy || !placed} onClick={() => void act(l.id, "approve")}><I n="check" />{t(lang, "Approve", "ஒப்புதல்")}</button>}
                  {l.status === "approved" && <button type="button" onClick={() => show(l)} disabled={ask.busy}><I n="map" />{t(lang, "Show", "காட்டு")}</button>}
                  {l.mine && <button type="button" onClick={() => void act(l.id, "remove")} disabled={busy}><I n="trash" />{t(lang, "Remove", "நீக்கு")}</button>}
                </div>
                {open === l.id && (
                  <table className="amt-tbl"><thead><tr><th>#</th><th>{t(lang, "Name", "பெயர்")}</th><th>{t(lang, "Placed", "இடம்")}</th><th>{t(lang, "Ward", "வார்டு")}</th></tr></thead>
                    <tbody>{l.rows.slice(0, 300).map((r) => (
                      <tr key={r.n} className={r.how}><td>{r.n}</td><td>{r.name}</td>
                        <td>{r.how === "exact" ? t(lang, "exact", "துல்லியம்") : r.how === "approximate" ? `${t(lang, "approximate", "தோராயம்")}${r.note ? `: ${r.note}` : ""}` : `${t(lang, "not placed", "இல்லை")}: ${r.why ?? ""}`}</td><td>{r.ward ?? ""}</td></tr>
                    ))}</tbody></table>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

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
  w.document.write(`<!doctype html><meta charset="utf-8"><title>${esc(title)}</title><style>body{font:13px system-ui;margin:24px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #CBD5E1;padding:4px 6px;text-align:left}th{background:#F1F5F9}</style>`
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
