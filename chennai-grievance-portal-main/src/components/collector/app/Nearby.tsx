"use client";

import { useEffect, useState } from "react";
import { I, type IconName } from "./icons";
import { Empty, fmtShort, plural, rel } from "./lib";
import type { Console } from "./CollectorApp";
import type { DistrictView, Nearby, NearbyDetail, NearbyEvent, Topic } from "@/lib/collector/nearby";

export const TOPIC_IC: Record<Topic, IconName> = { health: "health", water: "drop", hazard: "alert", order: "shield", transport: "cone", civic: "bulb", other: "news" };
const TOPIC_WORD: Record<Topic, string> = { health: "Disease", water: "Rain & water", hazard: "Fire & gas", order: "Law & order", transport: "Roads & rail", civic: "Services", other: "Other" };
const LEVEL_WORD = { prepare: "Prepare", watch: "Watch", note: "Note" } as const;
const LEVEL_HINT = {
  prepare: "Likely to reach Chennai soon, or already serious",
  watch: "Could affect Chennai: keep an eye on it"
} as const;

/**
 * "Next door": news from Tiruvallur, Kancheepuram and Chengalpattu of the last 7 days that could reach Chennai, in two
 * groups (Prepare, then Watch), each split by district. Only news: read hourly from Google News in English and Tamil.
 */
function groups(n: Nearby): { lv: "prepare" | "watch"; districts: { d: DistrictView; items: NearbyEvent[] }[] }[] {
  return (["prepare", "watch"] as const).map((lv) => ({
    lv, districts: n.districts.map((d) => ({ d, items: d.events.filter((e) => e.level === lv) })).filter((x) => x.items.length)
  })).filter((g) => g.districts.length);
}
export const nextDoorCount = (n: Nearby | null) => n?.watch.length ?? 0;

/** Latest news, "Next door" tab: compact rows under Prepare / Watch and the district. */
export function NextDoorList({ c, now }: { c: Console; now: string }) {
  const n = c.nearby;
  if (!n) return <Empty>Reading the neighbouring districts&apos; news…</Empty>;
  const g = groups(n);
  if (!g.length) return <Empty>Nothing in Tiruvallur, Kancheepuram or Chengalpattu news of the last {n.days} days calls for a precaution in Chennai.</Empty>;
  return (
    <div className="nd">
      {g.map(({ lv, districts }) => (
        <section key={lv} className={`nd-g ${lv}`}>
          <div className="nd-lv" title={LEVEL_HINT[lv]}><em className={`nb-lv ${lv}`}>{LEVEL_WORD[lv]}</em><span>{LEVEL_HINT[lv]}</span></div>
          {districts.map(({ d, items }) => (
            <div key={d.key} className="nd-dist">
              <div className="nd-d"><I n="pin" />{d.name}<small>{plural(items.length, "item")}</small></div>
              {items.map((e) => (
                <button key={e.id} className="nd-row" onClick={() => c.openNearby(e)} title="What happened, and the suggested precaution">
                  <span className="nd-ic"><I n={TOPIC_IC[e.topic]} /></span>
                  <span className="nd-b"><b>{e.title}</b><small>{TOPIC_WORD[e.topic]} · {plural(e.outlets, "outlet")} · {rel(e.last, now)}</small></span>
                </button>
              ))}
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}

/** "See more" on the Next door tab: the same groups, each item with why it matters and the precaution. */
export function NextDoorAll({ c }: { c: Console }) {
  const n = c.nearby;
  if (!n) return <Empty>Reading the neighbouring districts&apos; news…</Empty>;
  const g = groups(n);
  return (
    <div className="nd nd-all">
      <p className="nd-meta">
        News of the last {n.days} days from Tiruvallur, Kancheepuram and Chengalpattu that could reach Chennai
        {n.fetchedAt ? `, read ${rel(n.fetchedAt, c.now)}` : ""}{n.model ? " and sorted by AI" : ""}.{n.error ? ` ${n.error}` : ""}
      </p>
      {!g.length && <Empty>Nothing in the neighbouring districts&apos; news calls for a precaution in Chennai.</Empty>}
      {g.map(({ lv, districts }) => (
        <section key={lv} className={`nd-g ${lv}`}>
          <div className="nd-lv"><em className={`nb-lv ${lv}`}>{LEVEL_WORD[lv]}</em><span>{LEVEL_HINT[lv]}</span></div>
          {districts.map(({ d, items }) => (
            <div key={d.key} className="nd-dist">
              <div className="nd-d"><I n="pin" />{d.name}<small lang="ta">{d.ta}</small><small>{d.dir} of Chennai · borders {d.zones.map((z) => z.name).join(", ")}</small></div>
              {items.map((e) => (
                <button key={e.id} className="nd-row wide" onClick={() => c.openNearby(e)}>
                  <span className="nd-ic"><I n={TOPIC_IC[e.topic]} /></span>
                  <span className="nd-b">
                    <b>{e.title}</b>
                    <small>{TOPIC_WORD[e.topic]} · {plural(e.outlets, "outlet")} · {rel(e.last, c.now)}</small>
                    <span className="nd-why">{e.why}</span>
                    <span className="nd-step"><I n="right" />{e.step}</span>
                  </span>
                </button>
              ))}
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}

/** What happened in one event (AI from every outlet's report), when the event was clicked. */
function useDetail(e: NearbyEvent): NearbyDetail | null | "loading" {
  const [d, setD] = useState<{ id: string; v: NearbyDetail | null } | null>(null);
  useEffect(() => {
    let live = true;
    fetch(`/api/collector/nearby?event=${encodeURIComponent(e.id)}`).then((r) => (r.ok ? r.json() : null))
      .then((j) => live && setD({ id: e.id, v: j?.detail ?? null })).catch(() => live && setD({ id: e.id, v: null }));
    return () => { live = false; };
  }, [e.id]);
  return d?.id === e.id ? d.v : "loading";
}

/** One event from a neighbouring district: what happened, why it matters for Chennai, the precaution, and every report. */
export function NearbyEventBody({ e }: { e: NearbyEvent; c?: Console }) {
  const d = useDetail(e);
  const det = d === "loading" ? null : d;
  const heads = [...new Map(e.reports.map((r) => [r.title.toLowerCase(), r])).values()];
  return (
    <div className="nb-x">
      <div className="nb-xh">
        <em className={`nb-lv ${e.level}`}>{LEVEL_WORD[e.level]}</em>
        <span><I n={TOPIC_IC[e.topic]} />{TOPIC_WORD[e.topic]}</span>
        <span><I n="pin" />{e.district}</span>
        <span><I n="clock" />{fmtShort(e.first)}{e.last !== e.first ? ` to ${fmtShort(e.last)}` : ""}</span>
        <span><I n="news" />{plural(e.outlets, "outlet")}</span>
      </div>
      <h3>{e.title}</h3>
      {e.original && e.original !== e.title && <p className="nv-orig" lang="ta">{e.original}</p>}

      <div className="nb-what">
        <div className="iv-t"><I n="doc" />What happened
          {det?.ai && <span className="dx-ai"><I n="ai" />AI, from {plural(e.reports.length, "report")}</span>}</div>
        {d === "loading" ? <p className="nb-load">Reading the reports…</p>
          : det?.ai ? (
            <>
              <p>{det.what}</p>
              {det.facts.length > 0 && (
                <dl className="nb-facts">{det.facts.map((f) => <div key={f.label}><dt>{f.label}</dt><dd>{f.text}</dd></div>)}</dl>
              )}
            </>
          ) : det?.texts.length ? (
            det.texts.slice(0, 1).map((t) => <p key={t.publisher}><b>{t.publisher}:</b> {t.text}</p>)
          ) : (
            <ul className="nb-heads">{heads.slice(0, 4).map((r) => <li key={r.title} lang={r.lang === "ta" ? "ta" : undefined}>{r.title} <small>· {r.publisher}</small></li>)}</ul>
          )}
      </div>

      <div className="nb-xw">
        <div><small>Why it matters for Chennai</small><p>{det?.why ?? e.why}</p></div>
        <div><small>Suggested precaution</small><p>{det?.step ?? e.step}</p></div>
      </div>

      <div className="iv-t"><I n="news" />Reports<span>{plural(e.reports.length, "report")} · {plural(e.outlets, "outlet")}</span></div>
      <ul className="nb-xr">
        {e.reports.map((r, k) => (
          <li key={k}>
            <span><b>{r.publisher}</b><time>{fmtShort(r.t)}</time></span>
            <p lang={r.lang === "ta" ? "ta" : undefined}>{r.title}</p>
            {r.url && <a href={r.url} target="_blank" rel="noreferrer"><I n="link" />Read ↗</a>}
          </li>
        ))}
      </ul>
    </div>
  );
}
