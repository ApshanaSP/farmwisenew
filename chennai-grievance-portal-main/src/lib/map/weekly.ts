/**
 * v3 (owner, 22 Nov 2026: "weekly report… more visualizing, interactive, understandable, not simply showing the data"): the weekly
 * review as one interactive page. The server counts everything here, from the executor's own collections (runMapPlan over the same
 * filters the map uses, so a department officer sees only their department); the page draws and links them:
 *   the headline figures (reported this week against the week before, still open, past deadline, severe, closed this week),
 *   a map of all 200 wards shaded by a figure the officer picks (reported, the change, past deadline, or one kind of problem),
 *   the day-by-day bars of the last 14 days, the kinds of problem (a click shades the map by that kind), the zones (sortable;
 *   a hover lights up their wards), the departments, and the wards that rose most. A ward clicked anywhere opens its card.
 * No complaint text or personal detail is on the page: counts, ward and zone names, kinds and departments only.
 */
import { checkPlan, type Plan, type Step } from "./plan";
import { runMapPlan, wardName, type Ctx, type Hit } from "./execute";
import { zoneTa } from "./words";
import type { World } from "./types";

export interface WeeklyWard { ward: number; name: string; zone: number; d: string; n: number; before: number; open: number; overdue: number; severe: number; pop: number | null; cx: number; cy: number }
export interface WeeklyData {
  now: string;
  kpi: { reported: number; reportedBefore: number; open: number; overdue: number; severe: number; severeBefore: number; closed: number; closedBefore: number; medianDays: number | null };
  days: { date: string; n: number; thisWeek: boolean }[];
  wards: WeeklyWard[];
  view: { w: number; h: number };
  cats: { code: string; label: string; n: number; before: number; byWard: Record<string, number> }[];
  zones: { zone: number; name: string; n: number; before: number; open: number; overdue: number; severe: number }[];
  depts: { code: string; name: string; open: number; overdue: number; n: number }[];
}

const inc = (as: string, f: Record<string, unknown>): Step => ({ op: "take", as, layer: "incidents", where: null,
  filter: { category: null, family: null, severity: null, status: "any", dept: null, overdue: null, citizen: null, period: null, text: null, ...f } as never });
function hitsOf(steps: Step[], w: World, ctx: Ctx, lock: string | null): Hit[] {
  const p: Plan = { steps, show: steps[steps.length - 1].as, language: "en" };
  const c = checkPlan(p);
  if (!c.ok) throw new Error(`weekly plan refused: ${c.problems[0]}`);
  return runMapPlan(c.plan, w, ctx, lock).hits;
}
const ms = (s: string) => Date.parse(s.replace(" ", "T") + "Z");

export function weeklyData(w: World, ctx: Ctx, lock: string | null): WeeklyData {
  const now = ms(w.now);
  const day = 86_400_000;
  // the last 14 days, every status (this week and the week before); the open past-deadline cases of any age; everything closed
  const fortnight = hitsOf([inc("a", { period: { kind: "last_days", days: 14, offset: 0 } })], w, ctx, lock).map((h) => h.inc);
  const overdueAll = hitsOf([inc("a", { status: "open", overdue: true })], w, ctx, lock).map((h) => h.inc);
  const closedAll = hitsOf([inc("a", { status: "closed" })], w, ctx, lock).map((h) => h.inc);
  const age = (s: string) => (now - ms(s)) / day;
  const thisWk = fortnight.filter((i) => age(i.first) < 7), lastWk = fortnight.filter((i) => age(i.first) >= 7);
  const closedIn = (lo: number, hi: number) => closedAll.filter((i) => i.closedAt && age(i.closedAt) >= lo && age(i.closedAt) < hi);
  const closedNow = closedIn(0, 7);
  const durs = closedNow.map((i) => (ms(i.closedAt!) - ms(i.first)) / day).filter((x) => x >= 0).sort((a, b) => a - b);
  const kpi = {
    reported: thisWk.length, reportedBefore: lastWk.length, open: thisWk.filter((i) => i.open).length, overdue: overdueAll.length,
    severe: thisWk.filter((i) => i.sev === "Severe").length, severeBefore: lastWk.filter((i) => i.sev === "Severe").length,
    closed: closedNow.length, closedBefore: closedIn(7, 14).length, medianDays: durs.length ? Math.round(durs[Math.floor(durs.length / 2)] * 10) / 10 : null
  };
  // the calendar days, oldest first, the last one today
  const today = w.now.slice(0, 10);
  const days = Array.from({ length: 14 }, (_, k) => { const d = new Date(ms(`${today} 00:00:00`) - (13 - k) * day).toISOString().slice(0, 10); return { date: d, n: 0, thisWeek: k >= 7 }; });
  const dayIx = new Map(days.map((d, i) => [d.date, i]));
  for (const i of fortnight) { const k = dayIx.get(i.first.slice(0, 10)); if (k != null) days[k].n++; }

  // the wards as SVG paths (no map tiles: it prints and opens anywhere), the same projection as packSvg
  const b = w.district, W = 560, H = 640;
  const kx = Math.cos(((b.s + b.n) / 2) * Math.PI / 180);
  const sc = Math.min((W - 20) / ((b.e - b.w) * kx), (H - 20) / (b.n - b.s));
  const X = (lon: number) => 10 + (lon - b.w) * kx * sc, Y = (lat: number) => 10 + (b.n - lat) * sc;
  const pathOf = (rings: [number, number][][]) => rings.map((ring) => {
    let out = "", lx = -99, ly = -99;
    for (const [la, lo] of ring) { const x = X(lo), y = Y(la); if (Math.abs(x - lx) + Math.abs(y - ly) < 1.2) continue; out += `${out ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`; lx = x; ly = y; }
    return `${out}Z`;
  }).join("");
  const count = <T,>(xs: T[], key: (x: T) => string | number | null) => { const m = new Map<string, number>(); for (const x of xs) { const k = key(x); if (k != null) m.set(String(k), (m.get(String(k)) ?? 0) + 1); } return m; };
  const nW = count(thisWk, (i) => i.ward), bW = count(lastWk, (i) => i.ward), oW = count(thisWk.filter((i) => i.open), (i) => i.ward);
  const odW = count(overdueAll, (i) => i.ward), sW = count(thisWk.filter((i) => i.sev === "Severe"), (i) => i.ward);
  const wards: WeeklyWard[] = w.wards.map((wd) => ({ ward: wd.ward, name: wardName(w, wd.ward).en, zone: wd.zone, d: pathOf(wd.rings as [number, number][][]),
    n: nW.get(String(wd.ward)) ?? 0, before: bW.get(String(wd.ward)) ?? 0, open: oW.get(String(wd.ward)) ?? 0, overdue: odW.get(String(wd.ward)) ?? 0,
    severe: sW.get(String(wd.ward)) ?? 0, pop: wd.pop, cx: Math.round(X(wd.lon)), cy: Math.round(Y(wd.lat)) }));

  // the kinds of problem reported most this week (12), each with its count in every ward
  const nC = count(thisWk, (i) => i.cat), bC = count(lastWk, (i) => i.cat);
  const cats = [...nC.entries()].sort((a, c) => c[1] - a[1]).slice(0, 12).map(([code, n]) => ({
    code, label: w.cats.get(code)?.label ?? code, n, before: bC.get(code) ?? 0,
    byWard: Object.fromEntries(count(thisWk.filter((i) => i.cat === code), (i) => i.ward))
  }));
  const zones = w.zones.map((z) => ({ zone: z.zone, name: z.name || zoneTa(z.zone, z.name), n: thisWk.filter((i) => i.zone === z.zone).length, before: lastWk.filter((i) => i.zone === z.zone).length,
    open: thisWk.filter((i) => i.zone === z.zone && i.open).length, overdue: overdueAll.filter((i) => i.zone === z.zone).length, severe: thisWk.filter((i) => i.zone === z.zone && i.sev === "Severe").length }))
    .sort((a, c) => c.n - a.n || a.zone - c.zone);
  const openNow = hitsOf([inc("a", { status: "open" })], w, ctx, lock).map((h) => h.inc);
  const dO = count(openNow, (i) => i.dept), dOd = count(overdueAll, (i) => i.dept), dN = count(thisWk, (i) => i.dept);
  const depts = [...dO.entries()].sort((a, c) => c[1] - a[1]).slice(0, 10).map(([code, open]) => ({ code, name: w.depts.get(code)?.name ?? code, open, overdue: dOd.get(code) ?? 0, n: dN.get(code) ?? 0 }));
  return { now: w.now, kpi, days, wards, view: { w: W, h: H }, cats, zones, depts };
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

/** The weekly review as an interactive page: the data inline (as JSON, `<` escaped), drawn by a small script with no library. */
export function weeklyHtml(p: { title: string; asOf: string; sentences: string[]; wordsBy: "claude" | "template"; notes: string[]; weekly: WeeklyData }): string {
  // the figures are read by JSON.parse from a JSON script block: every < written as its JSON escape, so no text can ever close the block
  const data = JSON.stringify(p.weekly).replace(/</g, "\\u003c");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(p.title)} · District IQ</title>
<style>${CSS}</style></head>
<body>
<header class="top">
  <div><p class="eyebrow">District IQ · Chennai district</p><h1>${esc(p.title)}</h1><p class="sub">The last 7 days against the 7 before · as of ${esc(p.asOf.slice(0, 16))} IST</p></div>
  <div class="tools"><button id="theme" aria-label="Switch light or dark">◐</button><button id="print">Print</button></div>
</header>
<main>
  <section class="lead">${p.sentences.map((s) => `<p>${esc(s)}</p>`).join("")}<p class="fine">${p.wordsBy === "claude" ? "Written by Claude Haiku 5.5 from the figures on this page; a sentence with any number not in them is dropped." : "Sentences from templates."} Every figure is counted by District IQ from its own records.</p></section>
  <section class="kpis" id="kpis"></section>
  <section class="grid">
    <article class="card map">
      <header><h2>Wards</h2><div class="seg" id="metric" role="tablist"></div></header>
      <p class="hint" id="mapHint"></p>
      <div class="mapwrap"><svg id="svg" role="img" aria-label="Map of Chennai's 200 wards"></svg><div class="tip" id="tip" hidden></div></div>
      <div class="legend" id="legend"></div>
    </article>
    <aside class="side">
      <article class="card" id="wardCard"><h2>Pick a ward</h2><p class="hint">Click a ward on the map, a bar or a row: its week shows here.</p></article>
      <article class="card"><header><h2>Day by day</h2><span class="hint">reports a day, the last 14 days</span></header><div id="days" class="days"></div></article>
    </aside>
  </section>
  <section class="grid2">
    <article class="card"><header><h2>Kinds of problem</h2><span class="hint">this week · a click shades the map by that kind</span></header><div id="cats" class="bars"></div></article>
    <article class="card"><header><h2>Wards that rose most</h2><span class="hint">reports this week against last</span></header><ol id="worse" class="worse"></ol></article>
  </section>
  <section class="grid2">
    <article class="card"><header><h2>Zones</h2><span class="hint">a click on a heading sorts; a hover lights up the zone</span></header><div class="tblwrap"><table id="zones"></table></div></article>
    <article class="card"><header><h2>Departments</h2><span class="hint">open now · of them past deadline</span></header><div id="depts" class="bars"></div></article>
  </section>
</main>
<footer>${p.notes.map(esc).join(" ")} Ward boundaries: DataMeet community data; ward names from OpenStreetMap neighbourhoods (© OpenStreetMap contributors, ODbL). District IQ · Ask the Map.</footer>
<script id="data" type="application/json">${data}</script>
<script>${JS}</script>
</body></html>`;
}

const CSS = `:root{--bg:#F6F7FB;--card:#fff;--ink:#0F172A;--ink2:#475569;--ink3:#94A3B8;--line:#E2E8F0;--acc:#2563EB;--hot:#E11D48;--good:#059669;--warn:#D97706;--sh:0 1px 2px rgba(15,23,42,.06),0 8px 24px rgba(15,23,42,.06);color-scheme:light}
@media (prefers-color-scheme:dark){:root:not([data-theme=light]){--bg:#0B1220;--card:#111A2E;--ink:#E5ECF6;--ink2:#A3B1C6;--ink3:#64748B;--line:#22304A;--sh:0 1px 2px rgba(0,0,0,.3),0 8px 24px rgba(0,0,0,.25);color-scheme:dark}}
:root[data-theme=dark]{--bg:#0B1220;--card:#111A2E;--ink:#E5ECF6;--ink2:#A3B1C6;--ink3:#64748B;--line:#22304A;--sh:0 1px 2px rgba(0,0,0,.3),0 8px 24px rgba(0,0,0,.25);color-scheme:dark}
*{box-sizing:border-box}html{background:var(--bg)}body{margin:0;font:14px/1.45 system-ui,"Segoe UI",Roboto,sans-serif;color:var(--ink);background:var(--bg)}
.top{display:flex;justify-content:space-between;align-items:flex-end;gap:16px;max-width:1240px;margin:0 auto;padding:24px 20px 8px}
.eyebrow{margin:0;font:700 11px system-ui;letter-spacing:.12em;text-transform:uppercase;color:var(--acc)}h1{margin:2px 0 0;font-size:26px;letter-spacing:-.01em}.sub{margin:4px 0 0;color:var(--ink2)}
.tools{display:flex;gap:8px}.tools button,.seg button,th button{font:inherit;cursor:pointer;border:1px solid var(--line);background:var(--card);color:var(--ink);border-radius:9px;padding:7px 12px}
.tools button:hover{border-color:var(--acc)}main{max-width:1240px;margin:0 auto;padding:8px 20px 24px;display:flex;flex-direction:column;gap:16px}
.lead{background:linear-gradient(135deg,rgba(37,99,235,.10),rgba(225,29,72,.06));border:1px solid var(--line);border-radius:14px;padding:14px 18px}.lead p{margin:4px 0;font-size:15px}.lead .fine{font-size:12px;color:var(--ink3)}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px}
.kpi{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:14px 16px;box-shadow:var(--sh);position:relative;overflow:hidden;animation:rise .5s cubic-bezier(.2,.8,.2,1) both}
.kpi b{display:block;font:800 30px/1.1 system-ui;letter-spacing:-.02em;font-variant-numeric:tabular-nums}.kpi span{color:var(--ink2);font-size:13px}.kpi em{display:inline-block;margin-top:6px;font:700 12px system-ui;font-style:normal;padding:2px 8px;border-radius:999px}
.kpi em.up{background:rgba(225,29,72,.12);color:var(--hot)}.kpi em.down{background:rgba(5,150,105,.12);color:var(--good)}.kpi em.flat{background:rgba(148,163,184,.15);color:var(--ink2)}
.kpi::after{content:"";position:absolute;left:0;top:0;bottom:0;width:4px;background:var(--c,var(--acc))}
.grid{display:grid;grid-template-columns:minmax(0,1.5fr) minmax(0,1fr);gap:16px}.grid2{display:grid;grid-template-columns:1fr 1fr;gap:16px}.side{display:flex;flex-direction:column;gap:16px}
@media (max-width:920px){.grid,.grid2{grid-template-columns:1fr}.top{flex-direction:column;align-items:flex-start}}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:14px 16px;box-shadow:var(--sh);min-width:0}
.card>header{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap}h2{margin:0;font-size:15px}.hint{color:var(--ink3);font-size:12px;margin:4px 0 8px}
.seg{display:flex;gap:4px;flex-wrap:wrap}.seg button{padding:5px 10px;font-size:12px;border-radius:999px}.seg button.on{background:var(--acc);border-color:var(--acc);color:#fff}
.mapwrap{position:relative}#svg{width:100%;height:auto;display:block}#svg path{stroke:var(--card);stroke-width:.6;cursor:pointer;transition:fill .35s,opacity .2s}
#svg path:hover,#svg path.sel{stroke:var(--ink);stroke-width:1.6}#svg.dim path:not(.lit){opacity:.25}#svg text{font:700 9px system-ui;fill:var(--ink);pointer-events:none;paint-order:stroke;stroke:var(--card);stroke-width:2.5px}
.tip{position:absolute;pointer-events:none;background:var(--ink);color:var(--card);font-size:12px;padding:7px 9px;border-radius:8px;max-width:240px;box-shadow:var(--sh);transform:translate(-50%,-110%);white-space:nowrap}.tip b{display:block;font-size:12.5px}
.legend{display:flex;align-items:center;gap:8px;font-size:11.5px;color:var(--ink2);margin-top:6px}.legend .ramp{flex:1;height:8px;border-radius:4px;max-width:260px}
.days{display:flex;align-items:flex-end;gap:4px;height:150px;padding-top:8px}.days .d{flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;height:100%;justify-content:flex-end;cursor:default}
.days .d i{width:100%;border-radius:5px 5px 2px 2px;background:var(--ink3);opacity:.55;transform-origin:bottom;animation:grow .6s cubic-bezier(.2,.8,.2,1) both}.days .d.tw i{background:var(--acc);opacity:1}
.days .d small{font-size:10px;color:var(--ink3)}.days .d:hover i{filter:brightness(1.15)}.days .d b{font-size:10px;color:var(--ink2);font-variant-numeric:tabular-nums}
.bars{display:flex;flex-direction:column;gap:6px}.bar{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:2px 10px;align-items:center;padding:6px 8px;border-radius:9px;cursor:pointer;border:1px solid transparent}
.bar:hover{background:rgba(148,163,184,.10)}.bar.on{border-color:var(--acc);background:rgba(37,99,235,.08)}.bar .t{font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.bar .v{font:700 13px system-ui;font-variant-numeric:tabular-nums}
.bar .track{grid-column:1/-1;height:7px;border-radius:4px;background:rgba(148,163,184,.18);position:relative;overflow:hidden}.bar .track i{position:absolute;inset:0 auto 0 0;border-radius:4px;background:linear-gradient(90deg,#60A5FA,#2563EB);transform-origin:left;animation:grows .7s cubic-bezier(.2,.8,.2,1) both}
.bar .track u{position:absolute;inset:0 auto 0 0;border-radius:4px;background:linear-gradient(90deg,#FB7185,#E11D48)}
.bar .delta{font-size:11px;color:var(--ink3)}.bar .delta.up{color:var(--hot)}.bar .delta.down{color:var(--good)}
.worse{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:4px;counter-reset:w}.worse li{display:grid;grid-template-columns:24px 1fr auto;gap:8px;align-items:center;padding:6px 8px;border-radius:9px;cursor:pointer;counter-increment:w}
.worse li::before{content:counter(w);width:22px;height:22px;border-radius:50%;display:grid;place-items:center;font:800 11px system-ui;color:#fff;background:var(--hot)}.worse li:hover{background:rgba(148,163,184,.10)}.worse b{font-weight:600}.worse span{font:700 12.5px system-ui;color:var(--hot);font-variant-numeric:tabular-nums}.worse small{display:block;color:var(--ink3);font-size:11.5px}
.tblwrap{overflow-x:auto}table{width:100%;border-collapse:collapse;font-size:13px}th,td{padding:7px 8px;text-align:right;border-bottom:1px solid var(--line);white-space:nowrap}th:first-child,td:first-child{text-align:left}
th button{border:0;background:none;padding:0;font-weight:700;color:var(--ink2);font-size:12px}th button.on{color:var(--acc)}tbody tr{cursor:pointer}tbody tr:hover{background:rgba(37,99,235,.06)}td .up{color:var(--hot)}td .down{color:var(--good)}
#wardCard .big{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:10px 0}#wardCard .big div{background:rgba(148,163,184,.10);border-radius:10px;padding:8px}#wardCard .big b{display:block;font:800 20px system-ui;font-variant-numeric:tabular-nums}#wardCard .big span{font-size:11.5px;color:var(--ink2)}
#wardCard ul{margin:4px 0 0;padding-left:18px}#wardCard li{margin:2px 0}#wardCard .z{color:var(--ink2);font-size:12.5px;margin:2px 0 0}
footer{max-width:1240px;margin:0 auto;padding:4px 20px 28px;color:var(--ink3);font-size:12px}
@keyframes rise{from{opacity:0;transform:translateY(8px)}}@keyframes grow{from{transform:scaleY(0)}}@keyframes grows{from{transform:scaleX(0)}}
@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
@media print{:root{--bg:#fff;--card:#fff;--sh:none}.tools,.seg,.tip{display:none!important}body{font-size:12px}.card,.kpi{break-inside:avoid}main{padding:0 8px}}`;

/* The page's script: plain DOM and SVG, no library; it only draws the figures above and links the views. */
const JS = `(function(){
var D=JSON.parse(document.getElementById('data').textContent);
var $=function(id){return document.getElementById(id)};var fmt=function(n){return Number(n).toLocaleString('en-IN')};
var NS='http://www.w3.org/2000/svg';var el=function(t,a,p){var e=document.createElementNS(NS,t);for(var k in a)e.setAttribute(k,a[k]);if(p)p.appendChild(e);return e};
var h=function(t,c,txt){var e=document.createElement(t);if(c)e.className=c;if(txt!=null)e.textContent=txt;return e};
var pct=function(a,b){return b>0?Math.round((a-b)/b*100):null};
var trend=function(a,b,goodDown){var p=pct(a,b);if(p==null||p===0)return ['flat',p==null?'no week before':'same as last week'];var up=p>0;return [(up!==!!goodDown)?'up':'down',(up?'▲ ':'▼ ')+Math.abs(p)+' % on last week'];};
var root=document.documentElement;$('theme').onclick=function(){var d=root.getAttribute('data-theme');var dark=d?d==='dark':matchMedia('(prefers-color-scheme: dark)').matches;root.setAttribute('data-theme',dark?'light':'dark')};$('print').onclick=function(){print()};
/* the headline figures, counted up */
var K=D.kpi;var kp=[[K.reported,'reported this week',trend(K.reported,K.reportedBefore),'#2563EB'],[K.open,'of them still open',null,'#7C3AED'],[K.overdue,'past deadline now (any age)',null,'#D97706'],
 [K.severe,'severe this week',trend(K.severe,K.severeBefore),'#E11D48'],[K.closed,'closed this week',trend(K.closed,K.closedBefore,true),'#059669']];
if(K.medianDays!=null)kp.push([K.medianDays,'median days to close (closed this week)',null,'#0891B2']);
kp.forEach(function(k,i){var c=h('div','kpi');c.style.setProperty('--c',k[3]);c.style.animationDelay=(i*60)+'ms';var b=h('b',null,'0');c.appendChild(b);c.appendChild(h('span',null,k[1]));
 if(k[2]){var em=h('em',k[2][0],k[2][1]);c.appendChild(document.createElement('br'));c.appendChild(em)}$('kpis').appendChild(c);
 var t0=null,v=k[0],dec=v%1!==0;var step=function(t){if(!t0)t0=t;var f=Math.min(1,(t-t0)/700);f=1-Math.pow(1-f,3);b.textContent=dec?(v*f).toFixed(1):fmt(Math.round(v*f));if(f<1)requestAnimationFrame(step)};requestAnimationFrame(step)});
/* the ward map */
var svg=$('svg');svg.setAttribute('viewBox','0 0 '+D.view.w+' '+D.view.h);var paths={};var byWard={};D.wards.forEach(function(w){byWard[w.ward]=w;var p=el('path',{d:w.d},svg);p.dataset.w=w.ward;paths[w.ward]=p});
var labels=el('g',{},svg);
var METRICS=[['n','Reported'],['delta','Change'],['overdue','Past deadline'],['severe','Severe']];var metric='n',cat=null,sel=null;
var RAMP=['#FEF3C7','#FDE68A','#FBBF24','#F97316','#DC2626','#991B1B'],DIV=['#047857','#34D399','#E2E8F0','#FB923C','#DC2626'];
var val=function(w){if(cat)return (cat.byWard[w.ward]||0);if(metric==='delta')return w.n-w.before;return w[metric]};
var breaks=[];var mixer=function(v){if(v<=0)return 'rgba(148,163,184,.18)';var k=0;while(k<breaks.length&&v>breaks[k])k++;return RAMP[Math.min(RAMP.length-1,k)]};
var diver=function(v,m){if(v===0)return DIV[2];var f=Math.min(1,Math.abs(v)/m);return v>0?(f>.5?DIV[4]:DIV[3]):(f>.5?DIV[0]:DIV[1])};
function paint(){var vs=D.wards.map(val);var max=Math.max.apply(null,vs.map(Math.abs).concat([1]));
 /* six shades, each holding about the same number of wards with any (quantiles), so the map shows contrast */
 var pos=vs.filter(function(v){return v>0}).sort(function(a,b){return a-b});breaks=[];for(var q=1;q<RAMP.length;q++){var b=pos[Math.floor(q*pos.length/RAMP.length)];if(b!=null&&breaks.indexOf(b)<0)breaks.push(b)}
 D.wards.forEach(function(w,i){paths[w.ward].style.fill=(metric==='delta'&&!cat)?diver(vs[i],max):mixer(vs[i])});
 [].forEach.call(seg.children,function(x,j){x.classList.toggle('on',!cat&&METRICS[j][0]===metric)});
 while(labels.firstChild)labels.removeChild(labels.firstChild);
 D.wards.map(function(w,i){return [w,vs[i]]}).filter(function(x){return x[1]>0}).sort(function(a,b){return b[1]-a[1]}).slice(0,5).forEach(function(x,i){var w=x[0];var g=el('g',{transform:'translate('+w.cx+','+w.cy+')'},labels);el('circle',{r:8,fill:'#0F172A',stroke:'#fff','stroke-width':1.5},g);var t=el('text',{y:3,'text-anchor':'middle',style:'fill:#fff;stroke:none;font-size:9px'},g);t.textContent=i+1});
 var lg=$('legend');lg.innerHTML='';var what=cat?cat.label+' this week':metric==='delta'?'change on last week':metric==='overdue'?'past deadline now':metric==='severe'?'severe this week':'reported this week';
 lg.appendChild(h('span',null,metric==='delta'&&!cat?'fewer':'0'));var r=h('span','ramp');r.style.background='linear-gradient(90deg,'+((metric==='delta'&&!cat)?DIV.join(','):RAMP.join(','))+')';lg.appendChild(r);
 lg.appendChild(h('span',null,metric==='delta'&&!cat?'more':fmt(max)));lg.appendChild(h('span',null,'· '+what+' · numbered: the top 5'));
 $('mapHint').textContent=cat?('Shaded by '+cat.label.toLowerCase()+' reports this week. Click the kind again to clear.'):'Hover a ward for its figures; click it for its week.';}
var seg=$('metric');METRICS.forEach(function(m){var b=h('button',m[0]===metric?'on':'',m[1]);b.setAttribute('role','tab');b.onclick=function(){metric=m[0];cat=null;[].forEach.call(seg.children,function(x){x.classList.remove('on')});b.classList.add('on');[].forEach.call(document.querySelectorAll('#cats .bar'),function(x){x.classList.remove('on')});paint()};seg.appendChild(b)});
var tip=$('tip');var wrap=svg.parentNode;
svg.addEventListener('mousemove',function(e){var t=e.target;if(t.tagName!=='path'){tip.hidden=true;return}var w=byWard[t.dataset.w];var r=wrap.getBoundingClientRect();tip.style.left=(e.clientX-r.left)+'px';tip.style.top=(e.clientY-r.top)+'px';
 tip.innerHTML='';tip.appendChild(h('b',null,w.name));tip.appendChild(document.createTextNode(cat?(fmt(cat.byWard[w.ward]||0)+' '+cat.label.toLowerCase()):(fmt(w.n)+' reported · '+fmt(w.before)+' the week before · '+fmt(w.overdue)+' past deadline')));tip.hidden=false});
svg.addEventListener('mouseleave',function(){tip.hidden=true});svg.addEventListener('click',function(e){if(e.target.dataset&&e.target.dataset.w)pick(Number(e.target.dataset.w))});
function pick(n){var w=byWard[n];if(!w)return;if(sel)paths[sel].classList.remove('sel');sel=n;paths[n].classList.add('sel');
 var c=$('wardCard');c.innerHTML='';c.appendChild(h('h2',null,w.name));var z=D.zones.filter(function(x){return x.zone===w.zone})[0];c.appendChild(h('p','z',(z?z.name+' zone':'Zone '+w.zone)+(w.pop?' · '+fmt(w.pop)+' people':'')));
 var big=h('div','big');[[w.n,'reported this week'],[w.open,'still open'],[w.overdue,'past deadline']].forEach(function(x){var d=h('div');d.appendChild(h('b',null,fmt(x[0])));d.appendChild(h('span',null,x[1]));big.appendChild(d)});c.appendChild(big);
 var tr=trend(w.n,w.before);c.appendChild(h('p','z',fmt(w.before)+' the week before · '+tr[1]+(w.severe?' · '+fmt(w.severe)+' severe':'')));
 var ks=D.cats.map(function(k){return [k.label,k.byWard[n]||0]}).filter(function(x){return x[1]>0}).sort(function(a,b){return b[1]-a[1]}).slice(0,5);
 if(ks.length){c.appendChild(h('p','hint','Most reported here this week'));var ul=h('ul');ks.forEach(function(x){ul.appendChild(h('li',null,x[0]+': '+fmt(x[1])))});c.appendChild(ul)}
 if(innerWidth<920)c.scrollIntoView({behavior:'smooth',block:'nearest'});}
/* day by day */
var dmax=Math.max.apply(null,D.days.map(function(d){return d.n}).concat([1]));var DN=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
D.days.forEach(function(d,i){var c=h('div','d'+(d.thisWeek?' tw':''));var dt=new Date(d.date+'T00:00:00Z');c.title=dt.toUTCString().slice(0,11)+': '+fmt(d.n)+' reports'+(d.thisWeek?' (this week)':' (the week before)');
 c.appendChild(h('b',null,fmt(d.n)));var bar=h('i');bar.style.height=Math.max(2,d.n/dmax*100)+'%';bar.style.animationDelay=(i*35)+'ms';c.appendChild(bar);c.appendChild(h('small',null,DN[dt.getUTCDay()].slice(0,2)));$('days').appendChild(c)});
/* kinds of problem: a click shades the map */
var cmax=Math.max.apply(null,D.cats.map(function(k){return Math.max(k.n,k.before)}).concat([1]));
D.cats.forEach(function(k,i){var b=h('div','bar');b.tabIndex=0;b.appendChild(h('span','t',k.label));var v=h('span','v',fmt(k.n));b.appendChild(v);var tr=h('div','track');var x=h('i');x.style.width=(k.n/cmax*100)+'%';x.style.animationDelay=(i*40)+'ms';tr.appendChild(x);b.appendChild(tr);
 var t=trend(k.n,k.before);b.appendChild(h('span','delta '+t[0],fmt(k.before)+' the week before · '+t[1]));
 var go=function(){var on=cat===k;cat=on?null:k;[].forEach.call(document.querySelectorAll('#cats .bar'),function(x){x.classList.remove('on')});if(!on)b.classList.add('on');paint();if(!on)svg.scrollIntoView({behavior:'smooth',block:'center'})};
 b.onclick=go;b.onkeydown=function(e){if(e.key==='Enter')go()};$('cats').appendChild(b)});
/* the wards that rose most */
D.wards.filter(function(w){return w.n>w.before}).sort(function(a,b){return (b.n-b.before)-(a.n-a.before)||b.n-a.n}).slice(0,10).forEach(function(w){var li=h('li');var d=h('div');d.appendChild(h('b',null,w.name));d.appendChild(h('small',null,fmt(w.before)+' → '+fmt(w.n)+' reports'));li.appendChild(d);li.appendChild(h('span',null,'+'+fmt(w.n-w.before)));li.onclick=function(){pick(w.ward)};$('worse').appendChild(li)});
/* zones: sortable, a hover lights up their wards */
var cols=[['name','Zone'],['n','This week'],['delta','Change'],['open','Open'],['overdue','Past deadline'],['severe','Severe']];var sortBy='n',asc=false;var tbl=$('zones');
function zrows(){var z=D.zones.map(function(x){return Object.assign({delta:x.n-x.before},x)});z.sort(function(a,b){var u=a[sortBy],v=b[sortBy];var r=typeof u==='string'?u.localeCompare(v):u-v;return asc?r:-r});
 tbl.innerHTML='';var th=h('thead');var tr=h('tr');cols.forEach(function(c){var t=h('th');var b=h('button',c[0]===sortBy?'on':'',c[1]+(c[0]===sortBy?(asc?' ▲':' ▼'):''));b.onclick=function(){if(sortBy===c[0])asc=!asc;else{sortBy=c[0];asc=c[0]==='name'}zrows()};t.appendChild(b);tr.appendChild(t)});th.appendChild(tr);tbl.appendChild(th);
 var tb=h('tbody');z.forEach(function(x){var r=h('tr');r.appendChild(h('td',null,x.name+' ('+x.zone+')'));r.appendChild(h('td',null,fmt(x.n)));var dc=h('td');dc.appendChild(h('span',x.delta>0?'up':x.delta<0?'down':'',(x.delta>0?'+':'')+fmt(x.delta)));r.appendChild(dc);
  r.appendChild(h('td',null,fmt(x.open)));r.appendChild(h('td',null,fmt(x.overdue)));r.appendChild(h('td',null,fmt(x.severe)));
  r.onmouseenter=function(){svg.classList.add('dim');D.wards.forEach(function(w){paths[w.ward].classList.toggle('lit',w.zone===x.zone)})};r.onmouseleave=function(){svg.classList.remove('dim')};
  r.onclick=function(){var top=D.wards.filter(function(w){return w.zone===x.zone}).sort(function(a,b){return b.n-a.n})[0];if(top)pick(top.ward);svg.scrollIntoView({behavior:'smooth',block:'center'})};tb.appendChild(r)});tbl.appendChild(tb)}
zrows();
/* departments: open now, the past-deadline part in red */
var dm=Math.max.apply(null,D.depts.map(function(d){return d.open}).concat([1]));
D.depts.forEach(function(d,i){var b=h('div','bar');b.style.cursor='default';b.appendChild(h('span','t',d.name));b.appendChild(h('span','v',fmt(d.open)));var tr=h('div','track');var x=h('i');x.style.width=(d.open/dm*100)+'%';x.style.animationDelay=(i*40)+'ms';tr.appendChild(x);var u=h('u');u.style.width=(d.overdue/dm*100)+'%';tr.appendChild(u);b.appendChild(tr);
 b.appendChild(h('span','delta'+(d.overdue?' up':''),fmt(d.overdue)+' past deadline · '+fmt(d.n)+' new this week'));$('depts').appendChild(b)});
paint();var first=D.wards.slice().sort(function(a,b){return b.n-a.n})[0];if(first&&first.n)pick(first.ward);
})();`;
