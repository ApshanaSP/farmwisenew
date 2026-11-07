"use client";
/**
 * Rain's Traffic, Power and Metro tabs (inside RainView's panel, on the Overview's own map), read like Flooding: all
 * rains first (three numbers, the findings, the rains, the roads / wards / lines hit most), then one rain (each place
 * it hit, with what happened there in one line), then a place's card (how often, what happened in the chosen rain,
 * what to do before the next one), with Back. The map shows the places only: roads, wards, rail lines; Traffic keeps
 * the reports behind a road on its card, under "Where this comes from". Data: /api/rehearsal/impacts
 * (lib/rehearsal/impacts.ts). Traffic adds live flow and incidents when the server has a TomTom key.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { I, type IconName } from "../icons";
import type { ImpactData, ImpactItem, ImpactReport, Lens } from "@/lib/rehearsal/impacts";
import type { LiveIncident } from "@/lib/rehearsal/traffic";
import type { PastRain } from "@/lib/rehearsal/types";
import type { RainApi, RainLayer } from "./rainLayer";
import { fmtT, n0, plural, RainDots, range } from "./rainKit";

export const LENS_WORD: Record<Lens, { title: string; icon: IconName; item: string; items: string; often: string; inRain: (n: number, of: number) => string }> = {
  traffic: { title: "Traffic", icon: "flow", item: "road", items: "Roads", often: "Traffic jammed here", inRain: (n) => `${plural(n, "road")} jammed` },
  power: { title: "Power", icon: "bolt", item: "ward", items: "Wards", often: "Power went off here", inRain: (n) => `${plural(n, "ward")} lost power` },
  metro: { title: "Metro", icon: "pin", item: "line", items: "Lines", often: "Trains ran late", inRain: (n, of) => `${n} of ${of} lines late` }
};
const SOURCE_WORD: Record<ImpactReport["source"], string> = { police: "Police report", citizen: "Citizen complaint", news: "News", flood: "Flood record" };

export default function ImpactView({ lens, api, rains, rainId, onRain, onLayer, onOpenIncident, escRef, data: given }: {
  lens: Lens;
  api: RainApi;
  /** the rains, newest first (the same as Flooding's) */
  rains: PastRain[];
  /** the rain shown (null: all rains), shared with the other tabs */
  rainId: string | null;
  onRain: (id: string | null) => void;
  onLayer: (l: RainLayer | null) => void;
  onOpenIncident: (id: string) => void;
  escRef: React.MutableRefObject<(() => boolean) | null>;
  /** already loaded by RainView (for the tabs' counts) */
  data: ImpactData | null;
}) {
  const w = LENS_WORD[lens];
  const [d, setD] = useState<ImpactData | null>(given);
  const [err, setErr] = useState<string | null>(null);
  const [pick, setPick] = useState<string | null>(null);
  const [all, setAll] = useState(false);
  const [live, setLive] = useState<{ enabled: boolean; at: string | null; incidents: LiveIncident[]; why: string | null } | null>(null);
  const [liveOn, setLiveOn] = useState(false);
  useEffect(() => { setPick(null); setAll(false); }, [lens, rainId]);
  useEffect(() => {
    if (given) { setD(given); return; }
    let on = true;
    setD(null); setErr(null);
    fetch(api.impacts + lens).then((r) => r.json().then((j) => { if (!on) return; if (r.ok) setD(j); else setErr(j.error ?? "Could not load."); })).catch(() => on && setErr("Could not load."));
    return () => { on = false; };
  }, [lens, api, given]);
  useEffect(() => {
    if (lens !== "traffic") return;
    fetch(api.live).then((r) => (r.ok ? r.json() : null)).then((j) => j && setLive(j)).catch(() => undefined);
  }, [lens, api]);

  const oldestFirst = useMemo(() => [...rains].reverse(), [rains]);
  const rain = rainId ? rains.find((r) => r.id === rainId) ?? null : null;
  const items = useMemo(() => d?.items ?? [], [d]);
  const itemBy = useMemo(() => new Map(items.map((x) => [x.key, x])), [items]);

  // Escape: the card, then the rain; then the console closes the view
  useEffect(() => {
    escRef.current = () => {
      if (pick) { setPick(null); return true; }
      if (rainId) { onRain(null); return true; }
      return false;
    };
    return () => { escRef.current = null; };
  }, [pick, rainId, escRef, onRain]);

  // ---- the map: the places only (roads, underpasses, wards, rail lines), strong where the chosen rain hit them
  const shot = useRef({ key: "", seq: 0 });
  const layer = useMemo<RainLayer | null>(() => {
    if (!d) return null;
    const key = `${lens}|${rainId}|${pick}`;
    if (shot.current.key !== key) shot.current = { key, seq: shot.current.seq + 1 };
    const lvl = (x: ImpactItem): 0 | 1 | 2 | 3 => (rain ? x.byRain[rain.id]?.level ?? 0 : x.level);
    const tip = (x: ImpactItem) => `${x.label} · ${rain ? x.byRain[rain.id]?.why ?? "not hit in this rain" : x.rains.length ? `${w.often.toLowerCase()} in ${x.rains.length} of ${rains.length} rains` : x.facts[0] ?? ""}`;
    const streets: RainLayer["streets"] = items.filter((x) => x.lines?.length).map((x) => ({ key: x.key, lines: x.lines!, at: [x.lat, x.lon], level: lvl(x), tip: tip(x) }));
    const areas: RainLayer["areas"] = items.filter((x) => x.rings?.length).map((x) => ({ key: x.key, rings: x.rings!, level: lvl(x), tip: tip(x) }));
    const rails: RainLayer["rails"] = items.filter((x) => x.path?.length).map((x) => ({ id: x.key, color: x.color ?? "#6D28D9", path: x.path!, level: rain ? lvl(x) : (Math.max(1, x.level) as 1 | 2 | 3), tip: tip(x) }));
    // underpasses, and Metro's closed stations (the chosen rain's, or those closed in two or more rains)
    const points: NonNullable<RainLayer["points"]> = items.filter((x) => x.kind === "underpass" && lvl(x) > 0).map((x) => ({ key: x.key, lat: x.lat, lon: x.lon, level: lvl(x), glyph: "U", tip: tip(x) }));
    if (lens === "metro") {
      const seen = new Map<string, { x: ImpactItem; c: NonNullable<ImpactItem["byRain"][string]["closed"]>[number]; n: number }>();
      for (const x of items) for (const [id, h] of Object.entries(x.byRain)) {
        if (rain && id !== rain.id) continue;
        for (const c of h.closed ?? []) { const k = `${x.key}#${c.name}`; seen.set(k, { x, c, n: (seen.get(k)?.n ?? 0) + 1 }); }
      }
      for (const [k, { x, c, n }] of seen) if (rain || n >= 2)
        points.push({ key: k, lat: c.lat, lon: c.lon, level: 3, glyph: "×", tip: `${c.name} (${x.label}) · ${rain ? `closed about ${c.hours} h` : `closed in ${n} rains`}${c.use ? ` · use ${c.use}` : ""}` });
    }
    const hitPts = (x: ImpactItem): [number, number][] => (x.lines?.length ? x.lines.flat() : x.rings?.length ? x.rings.flat() : x.path?.length ? x.path : [[x.lat, x.lon]]);
    let pts: [number, number][] | null = rain ? items.filter((x) => x.byRain[rain.id]).flatMap((x) => (lens === "traffic" ? [[x.lat, x.lon] as [number, number]] : hitPts(x)))
      : lens === "metro" ? items.flatMap(hitPts) : items.filter((x) => x.level >= 2).map((x) => [x.lat, x.lon] as [number, number]);
    if (!pts.length) pts = null;
    let maxZoom: number | undefined;
    const sel = pick ? itemBy.get(pick) : null;
    if (sel) { pts = hitPts(sel); maxZoom = sel.kind === "line" ? 13 : 16; }
    return {
      theme: lens, streets, dots: [], points, areas, rails,
      tiles: lens === "traffic" && liveOn && live?.enabled ? api.tiles : null,
      live: lens === "traffic" && liveOn ? (live?.incidents ?? []).map((x) => ({ id: x.id, path: x.path, flooding: x.flooding, tip: `${x.kind}: ${x.label}${x.delayMin ? ` · ${x.delayMin} min delay` : ""}${x.from ? ` · ${x.from} → ${x.to}` : ""}` })) : [],
      sel: sel ? { kind: sel.rings ? "area" : sel.path ? "line" : sel.lines ? "street" : "point", id: sel.key } : null,
      fit: { seq: shot.current.seq, pts, maxZoom },
      onPick: (_kind, id) => { const k = id.split("#")[0]; if (itemBy.has(k)) setPick(k); }
    };
  }, [d, lens, rain, rainId, pick, items, itemBy, liveOn, live, api, rains.length]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { onLayer(layer); }, [layer, onLayer]);

  if (!d) return (
    <div className="rv-wait">
      {err ? <><I n="alert" /><b>{err}</b></> : <><span className="rv-spin" /><b>Reading the {w.title.toLowerCase()} record of past rains…</b></>}
    </div>
  );

  const hitOf = (id: string) => d.rains.find((r) => r.id === id)?.hit ?? 0;

  // ---- a place's card
  const x = pick ? itemBy.get(pick) : null;
  if (x) {
    const now = rain ? x.byRain[rain.id] : null;
    const reps = d.reports.filter((r) => r.item === x.key && (!rain || r.rain === rain.id)).sort((a, b) => b.at.localeCompare(a.at));
    return (
      <>
        <button className="rv-back" onClick={() => setPick(null)}><I n="chevl" />Back to {rain ? `the ${range(rain)} rain` : "all rains"}</button>
        <div className="rv-card">
          <div className="rv-card-h">
            <span className={`rv-cic ${lens}`} style={x.color ? { background: x.color } : undefined}><I n={x.kind === "underpass" ? "cone" : w.icon} /></span>
            <span><b>{x.label}</b><small>{x.sub}</small></span>
          </div>
          {rain && (
            <div className={`rv-hit${now ? ` lv-${now.level}` : " none"}`}>
              <small>In the {range(rain)} rain</small>
              <b>{now ? (now.closed?.length ? now.why.split(" · ")[0] : now.why) : lens === "traffic" ? "No jam reported here" : lens === "power" ? "Power stayed on" : "Trains ran on time"}</b>
              {now?.closed?.length ? <ul>{now.closed.map((c) => <li key={c.name}><b>{c.name}</b> closed about {c.hours} h{c.use ? <> · people sent to <b>{c.use}</b></> : null}</li>)}</ul> : null}
            </div>
          )}
          <div className="rv-often">
            <b>{w.often} in {x.rains.length} of {rains.length} heavy rains</b>
            <RainDots rains={oldestFirst} on={(r) => !!x.byRain[r.id]} now={rain?.id ?? null} onRain={(id) => onRain(id)} />
          </div>
          {!rain && x.rains.length > 0 && (
            <ul className="rv-byrain">
              {[...x.rains].reverse().slice(0, all ? undefined : 4).map((id) => {
                const r = rains.find((y) => y.id === id);
                return r ? <li key={id}><button onClick={() => onRain(id)}><span>{range(r)}</span><b className={`lv-${x.byRain[id].level}`}>{x.byRain[id].why}</b></button></li> : null;
              })}
              {x.rains.length > 4 && <li><button className="rv-more" onClick={() => setAll((v) => !v)}>{all ? "Show fewer" : `All ${x.rains.length} rains`}</button></li>}
            </ul>
          )}
          <ul className="rv-facts">{x.facts.map((f) => <li key={f}>{f}</li>)}</ul>
          {x.jobs.length > 0 && <section className="rv-act"><h4><I n="tasks" />Before the next heavy rain</h4>
            <ul className="rv-jobs">{x.jobs.map((j) => <li key={j.en}><small>{j.who}</small>{j.en}</li>)}</ul></section>}
          {reps.length > 0 && <Sources lens={lens} list={reps} onOpenIncident={onOpenIncident} />}
        </div>
      </>
    );
  }

  // ---- one rain: each place it hit, with what happened there
  if (rain) {
    const k = rains.indexOf(rain);
    const newer = k > 0 ? rains[k - 1] : null, older = k < rains.length - 1 ? rains[k + 1] : null;
    // the worst first: longest without power, latest trains, else the strongest jam
    const worse = (y: ImpactItem) => { const h = y.byRain[rain.id]; return lens === "power" ? h.hours ?? 0 : lens === "metro" ? (h.minutes ?? 0) + 10 * (h.closed?.length ?? 0) : h.level; };
    const hit = items.filter((y) => y.byRain[rain.id]).sort((a, b) => worse(b) - worse(a) || b.rains.length - a.rains.length || a.label.localeCompare(b.label));
    const zones = new Map<string, number>();
    for (const y of hit) { const z = lens === "power" ? y.sub.replace(/ zone$/, "") : y.sub.split(" · ").pop() ?? ""; if (z && !z.startsWith("Outside") && lens !== "metro") zones.set(z, (zones.get(z) ?? 0) + 1); }
    const topZones = [...zones.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([z]) => z);
    const shown = all ? hit : hit.slice(0, 8);
    const closed = hit.flatMap((y) => (y.byRain[rain.id].closed ?? []).map((c) => ({ y, c })));
    return (
      <>
        <nav className="rv-nav">
          <button onClick={() => onRain(null)}><I n="chevl" />All rains</button>
          <span className="tspace" />
          <button disabled={!older} onClick={() => older && onRain(older.id)} title="The rain before"><I n="chevl" />{older ? range(older) : "Older"}</button>
          <button disabled={!newer} onClick={() => newer && onRain(newer.id)} title="The rain after">{newer ? range(newer) : "Newer"}<I n="chevr" /></button>
        </nav>
        <div className="rv-rh">
          <h3>{range(rain)} rain · {w.title}</h3>
          <div className="rv-chips">
            {rain.maxMm != null && <span><I n="drop" />{Math.round(rain.maxMm)} mm at the wettest gauge</span>}
            <span><I n={w.icon} />{w.inRain(hit.length, items.length)}</span>
          </div>
        </div>
        <p className="rv-desc">{rainSentence(lens, hit, rain.id, topZones, items.length)}</p>
        {closed.length > 0 && (
          <>
            <h4 className="rv-sec">Route changes <small>stations closed in this rain</small></h4>
            <ul className="rv-list">
              {closed.map(({ y, c }) => (
                <li key={y.key + c.name}><button onClick={() => setPick(y.key)}><i style={{ background: y.color }} />
                  <b>{c.name} closed about {c.hours} h{c.use ? `: use ${c.use}` : ""}</b><small>{y.label}</small></button></li>
              ))}
            </ul>
          </>
        )}
        {hit.length > 0 && (
          <>
            <h4 className="rv-sec">{w.items} hit in this rain <small>{n0(hit.length)} · what happened at each</small></h4>
            <ItemList list={shown} rains={oldestFirst} rainId={rain.id} onPick={setPick} />
            {hit.length > 8 && <button className="rv-more" onClick={() => setAll((v) => !v)}>{all ? "Show fewer" : `Show all ${n0(hit.length)}`}</button>}
          </>
        )}
      </>
    );
  }

  // ---- all rains
  const top = lens === "metro" ? items : items.filter((y) => y.level >= 2).slice(0, 6);
  const maxHit = Math.max(1, ...d.rains.map((r) => r.hit));
  return (
    <>
      <section className="rv-kpis">{d.kpis.map((k) => <div key={k.label}><b>{k.n}</b><span>{k.label}</span></div>)}</section>
      {d.insights.length > 0 && <p className="rv-insight"><I n="bulb" /><span>{d.insights.map((s) => <span key={s} style={{ display: "block" }}>{s}</span>)}</span></p>}
      {lens === "traffic" && live?.enabled && <LiveBox live={live} on={liveOn} set={setLiveOn} />}
      <h4 className="rv-sec">Past heavy rains <small>newest first · click one to see what it hit</small></h4>
      <ul className="rv-rains">
        {rains.map((r) => (
          <li key={r.id}><button onClick={() => onRain(r.id)}>
            <span className="rv-date"><b>{range(r)}</b><small>{r.maxMm != null ? `${Math.round(r.maxMm)} mm` : "IMD heavy rain day"}</small></span>
            <span className="rv-mid"><span className="rv-bar"><i style={{ width: `${Math.max(3, (100 * hitOf(r.id)) / maxHit)}%` }} /></span>
              <small>{w.inRain(hitOf(r.id), items.length)}</small></span>
            <I n="chevr" />
          </button></li>
        ))}
      </ul>
      {top.length > 0 && (
        <>
          <h4 className="rv-sec">{lens === "metro" ? "The lines" : `${w.items} hit in the most rains`} <small>click one for what happened there</small></h4>
          <ItemList list={top} rains={oldestFirst} onPick={setPick} />
        </>
      )}
      {lens === "traffic" && (
        <details className="rv-from">
          <summary>Where this comes from</summary>
          <ul className="rv-src">
            {d.sources.map((s) => (
              <li key={s.label}><span className={`rv-tag k-${s.kind}`}>{s.kind === "open" ? "Open data" : s.kind}</span><span>{s.label}</span><b>{n0(s.n)}</b><small>{s.note}</small></li>
            ))}
          </ul>
        </details>
      )}
    </>
  );
}

/** one rain in a sentence: how many places, where, and the main reason */
function rainSentence(lens: Lens, hit: ImpactItem[], id: string, zones: string[], lines: number): React.ReactNode {
  const where = zones.length ? <>, the most in <b>{zones.join(" and ")}</b></> : null;
  if (lens === "traffic") {
    if (!hit.length) return "No traffic jam with a place was reported in this rain.";
    const wet = hit.filter((x) => /water/i.test(x.byRain[id].why)).length;
    return <>Traffic jammed on <b>{plural(hit.length, "road")}</b>{where}.{wet ? <> Water on the road was the reason on <b>{wet}</b> of them.</> : null}</>;
  }
  if (lens === "power") {
    if (!hit.length) return "No ward lost power in this rain.";
    const hrs = hit.map((x) => x.byRain[id].hours ?? 0);
    const worst = hit.reduce((m, x) => ((x.byRain[id].hours ?? 0) > (m.byRain[id].hours ?? 0) ? x : m), hit[0]);
    return <>Power went off in <b>{plural(hit.length, "ward")}</b>{where}, for about <b>{Math.round(hrs.reduce((a, b) => a + b, 0) / hrs.length)} h</b> on average; the longest, <b>{worst.byRain[id].hours} h</b>, in <b>{worst.label}</b>.</>;
  }
  if (!hit.length) return "Trains ran on time on every line in this rain.";
  const mins = hit.map((x) => x.byRain[id].minutes ?? 0).filter((m) => m >= 5);
  const closed = hit.reduce((a, x) => a + (x.byRain[id].closed?.length ?? 0), 0);
  return <>Trains ran late on <b>{hit.length} of {lines} lines</b>{mins.length ? <>, about <b>{Math.round(mins.reduce((a, b) => a + b, 0) / mins.length)} min</b> on average</> : null}{closed ? <>; <b>{plural(closed, "station")}</b> closed</> : null}.</>;
}

function ItemList({ list, rains, rainId = null, onPick }: { list: ImpactItem[]; rains: PastRain[]; rainId?: string | null; onPick: (key: string) => void }) {
  return (
    <ul className="rv-streets">
      {list.map((x) => (
        <li key={x.key}><button onClick={() => onPick(x.key)}>
          <span className="rv-sn">
            <b>{x.color && <i className="rv-sw" style={{ background: x.color }} />}{x.label}</b>
            <small className={rainId ? `why lv-${x.byRain[rainId]?.level ?? 0}` : ""}>{rainId ? x.byRain[rainId]?.why : x.kind === "line" ? x.facts[0] ?? x.sub : x.sub}</small>
          </span>
          <span className="rv-often-s"><RainDots rains={rains} on={(r) => !!x.byRain[r.id]} now={rainId} /><em>{x.rains.length} of {rains.length}</em></span>
        </button></li>
      ))}
    </ul>
  );
}

/** the records behind a place, folded away: Traffic's reports, and news for every tab */
function Sources({ lens, list, onOpenIncident }: { lens: Lens; list: ImpactReport[]; onOpenIncident: (id: string) => void }) {
  const [more, setMore] = useState(false);
  const shown = more ? list : list.slice(0, 6);
  return (
    <details className="rv-from" open={lens !== "traffic"}>
      <summary>{lens === "traffic" ? "Where this comes from" : "In the news"} <small>{n0(list.length)}</small></summary>
      <ul className="rv-list">
        {shown.map((r) => {
          const inner = <><i className={r.source} /><b>{r.title}</b><small>{SOURCE_WORD[r.source]}{r.outlet ? ` · ${r.outlet}` : ""} · {r.source === "flood" ? r.at.slice(0, 10).split("-").reverse().join("/") : fmtT(r.at)}</small></>;
          return (
            <li key={r.id}>
              {r.incident ? <button onClick={() => onOpenIncident(r.incident!)} title="Open the report">{inner}</button>
                : r.url ? <a className="rv-a" href={r.url} target="_blank" rel="noopener noreferrer" title="Read the article">{inner}</a>
                  : <div className="rv-a">{inner}</div>}
            </li>
          );
        })}
      </ul>
      {list.length > 6 && <button className="rv-more" onClick={() => setMore((v) => !v)}>{more ? "Show fewer" : `Show all ${n0(list.length)}`}</button>}
    </details>
  );
}

function LiveBox({ live, on, set }: { live: { enabled: boolean; at: string | null; incidents: LiveIncident[]; why: string | null }; on: boolean; set: (v: boolean) => void }) {
  const jams = live.incidents.filter((x) => x.kind === "Jam").length, closed = live.incidents.filter((x) => x.kind === "Road closed").length, flood = live.incidents.filter((x) => x.flooding).length;
  return (
    <section className="rv-live on">
      <h4><span className="dot" />Live traffic now <span className={`rv-tag k-live`} style={{ marginLeft: "auto" }}>Live</span></h4>
      <p>{live.incidents.length ? `${plural(jams, "jam")}, ${plural(closed, "closed road")}${flood ? `, ${plural(flood, "flooded road")}` : ""} over the district${live.at ? `, as of ${new Date(live.at).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit" })}` : ""}.` : "No traffic incident over the district right now."}</p>
      <label><input type="checkbox" checked={on} onChange={(e) => set(e.target.checked)} />Show live speeds and incidents on the map (TomTom)</label>
      {live.why && <p>{live.why}</p>}
    </section>
  );
}
