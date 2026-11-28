"use client";

import { useEffect, useState } from "react";
import { I } from "./icons";
import { Explained, NewsDetails, useAnalysis } from "./Detail";
import { DeskTags, OfficerCard } from "./Overview";
import { ConflictBox, useStoryConflicts } from "./Conflicts";
import { MEDIA_KIND, deptIcon, fmtDay, fmtShort, fmtTime, plural, rel, type Row } from "./lib";
import type { Console } from "./CollectorApp";
import type { Story } from "./Overview";

type Full = { status: string; text: string | null; url: string | null } | "loading";

/**
 * A news story, laid out like an incident: what happened and why it matters (analysed by AI from every outlet's
 * report), the key facts, the report itself in full (fetched from the outlet when the monitor kept only a headline),
 * how the story unfolded across outlets, and the department that handles it with its contacts.
 */
import { NewsActButton } from "./NewsAct";

export function NewsView({ s, c }: { s: Story; c: Console }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [dept, setDept] = useState<Row | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [sel, setSel] = useState(0);
  const [full, setFull] = useState<Record<string, Full>>({});
  const ana = useAnalysis(`/api/collector/news/analysis?ids=${encodeURIComponent(s.docIds.slice(0, 60).join(","))}`, s.id);
  const diffs = useStoryConflicts(c, s.outletNames.length === 1 ? [] : s.docIds, s.title, s.id);

  useEffect(() => {
    let live = true;
    fetch(`/api/collector/news?ids=${encodeURIComponent(s.docIds.slice(0, 60).join(","))}`)
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error || "Could not load the reports.");
        // the same headline from the same outlet twice is one report; the story's own headline first
        const seen = new Set<string>();
        const list = (j.articles as Row[]).filter((a) => {
          const k = `${a.publisher}|${String(a.title).toLowerCase()}`;
          return seen.has(k) ? false : (seen.add(k), true);
        });
        // 29 Nov (the owner: "some articles show only the headline"): a report with its whole article first, then the story's own report
        list.sort((a, b) => Number(!!b.body) - Number(!!a.body) || Number(b.id === s.id) - Number(a.id === s.id));
        if (live) { setRows(list); setSel(0); setDept(j.dept ?? null); }
      })
      .catch((e) => live && setErr(e.message));
    return () => { live = false; };
  }, [s.id, s.docIds]);

  // 28 Nov (the owner: "if it is not from an official outlet, don't show it"): a story none of whose reports is from a listed outlet is
  // not opened at all; the Collector is told why in one line
  useEffect(() => {
    if (rows && !rows.length) { c.closeAll(); c.toast("That story has no report from an official news outlet, so it is not shown.", "alert"); }
  }, [rows]); // eslint-disable-line react-hooks/exhaustive-deps
  const a = rows?.[Math.min(sel, rows.length - 1)];
  // a report whose article could not be fetched gives way to another report of the story that has its text
  useEffect(() => {
    if (!rows || !a || a.body) return;
    const f = full[a.id];
    if (f && f !== "loading" && !f.text) {
      const k = rows.findIndex((r) => r.body || (full[r.id] && full[r.id] !== "loading" && (full[r.id] as Exclude<Full, "loading">).text));
      if (k >= 0 && k !== sel) setSel(k);
    }
  }, [full, a, rows, sel]);
  // the monitor kept only the headline: fetch the article from the outlet once, when it is read
  useEffect(() => {
    if (!a || a.body || full[a.id]) return;
    setFull((f) => ({ ...f, [a.id]: "loading" }));
    fetch(`/api/collector/news/article?id=${encodeURIComponent(a.id)}`)
      .then((r) => r.json())
      .then((j) => setFull((f) => ({ ...f, [a.id]: { status: j.status ?? "unreachable", text: j.text ?? null, url: j.url ?? null } })))
      .catch(() => setFull((f) => ({ ...f, [a.id]: { status: "unreachable", text: null, url: null } })));
  }, [a, full]);

  const close = <button className="xbtn" onClick={c.closeAll} aria-label="Close"><I n="x" /></button>;
  if (err || !rows || !rows.length || !a) {
    return (
      <div className="modal iv iv2 nv" role="dialog" aria-label="News">
        <div className="iv-h s-news">{close}<h2>{err ? "News" : !rows ? "Loading…" : s.title}</h2></div>
        <div className="empty">{err ?? (!rows ? "Loading the reports…" : "The reports of this story are not from an official news outlet.")}</div>
      </div>
    );
  }

  const en = a.lang !== "en" && a.title_en ? String(a.title_en) : String(a.title);
  const fetched = full[a.id];
  const text = a.body ?? (fetched && fetched !== "loading" ? fetched.text : null);
  const link = (fetched && fetched !== "loading" && fetched.url) || (a.url && !/news\.google\.com/.test(a.url) ? a.url : null) || a.url;
  // the outlet's page often repeats the headline as its first line
  const paras = String(text ?? "").split(/\n+/).map((p) => p.trim())
    .filter((p, k) => p.length > 1 && !(k === 0 && p.toLowerCase() === String(a.title).trim().toLowerCase()));
  const outlets = [...new Set(rows.map((r) => r.publisher).filter(Boolean))] as string[];
  const times = rows.map((r) => String(r.t)).sort();
  // each outlet once: its first report, its kind, its link and how many reports it carried
  const outletRows = outlets.map((name) => {
    const mine = rows.filter((r) => r.publisher === name).sort((x, y) => String(x.t).localeCompare(String(y.t)));
    return { name, kind: String(mine[0].kind ?? ""), t: String(mine[0].t), url: mine.find((r) => r.url)?.url ?? null, n: mine.length };
  }).sort((x, y) => x.t.localeCompare(y.t));
  const ai = rows.find((r) => r.ai)?.ai as Row | undefined;
  const place = rows.map((r) => r.ai?.place || (r.place && !/^chennai( district)?$/i.test(r.place) ? r.place : null)).find(Boolean) ?? "Chennai";
  const lead = rows[0];
  // until the AI's account is ready, the news desk's line on what happened (it has read the report), else the outlet's summary
  const rules = { summary: s.desk?.gist || String(lead.summary && lead.summary !== lead.title ? lead.summary : (lead.title_en || lead.title)), facts: [],
    attention: s.desk?.v === "act" && s.desk.why ? [s.desk.why] : [], needsYou: s.desk?.v === "act" && !!s.desk.why, what: [], why: [], next: null, ai: false } as unknown as Parameters<typeof Explained>[0]["rules"];

  // How it unfolded: every report, oldest first, by day
  const order = rows.map((r, k) => ({ r, k })).sort((x, y) => String(x.r.t).localeCompare(String(y.r.t)));
  const days: { day: string; items: { r: Row; k: number }[] }[] = [];
  for (const x of order) {
    const day = String(x.r.t).slice(0, 10);
    const g = days[days.length - 1];
    if (g && g.day === day) g.items.push(x);
    else days.push({ day, items: [x] });
  }

  return (
    <div className="modal iv iv2 nv" role="dialog" aria-label={en}>
      <div className="iv-h s-news">
        {close}
        <h2>{s.title}</h2>
        {lead.lang !== "en" && lead.title_en && <p className="nv-orig" lang="ta" translate="no">{lead.title}</p>}
        <div className="iv-where">
          {s.desk && <span className="nw-tags"><DeskTags i={s} /></span>}
          {s.desk?.v === "act" && <NewsActButton s={s} className="big" />}
          <span><I n="pin" />{place}</span>
          {dept && <span><I n={deptIcon(dept.code)} />{dept.name}</span>}
          <span><I n="clock" />First reported {fmtShort(times[0])} ({rel(times[0], c.now)})</span>
          <span><I n="news" />{plural(rows.length, "report")} · {plural(outlets.length, "outlet")}</span>
          {s.incident && <button className="iv-loc" onClick={() => c.openInc(s.incident!)}><I n="alert" />Open the incident</button>}
        </div>
      </div>

      <div className="iv-b">
        <section className="iv-col">
          <Explained a={ana.a} busy={ana.busy} rules={rules} open={false} deptName={dept?.name ?? "The department"} needLabel="Why it matters to you" noAi={ana.noAi} act={s.desk ? s.desk.v === "act" : null} />
          {ana.a?.handled && !ana.a.why.length && s.desk?.v !== "act" && s.desk?.v !== "know" && <div className="iv-ok"><I n="checkc" /><span>{ana.a.handled}</span></div>}
          {diffs && <ConflictBox items={diffs} />}
          <div>
            <div className="iv-t"><I n="news" />Sources<span>{plural(outlets.length, "outlet")}, {plural(rows.length, "report")}</span></div>
            <ul className="nw-src">
              {outletRows.map((o) => {
                const url = o.url && /^https?:/i.test(String(o.url)) ? String(o.url) : null;
                return (
                  <li key={o.name}>
                    <b>{o.name}</b><small>{MEDIA_KIND[o.kind] ?? "News"} · {fmtShort(o.t)}{o.n > 1 ? ` · ${o.n} reports` : ""}</small>
                    {url && <a href={url} target="_blank" rel="noopener noreferrer" title={`Read at ${o.name}`}>Open<I n="ext" /></a>}
                  </li>
                );
              })}
            </ul>
          </div>
          <div>
            <div className="iv-t"><I n="doc" />Key facts</div>
            <div className="facts">
              <div><small>First reported</small><b>{fmtShort(times[0])}</b></div>
              <div><small>Latest report</small><b>{fmtShort(times[times.length - 1])}</b></div>
              <div><small>Outlets</small><b>{outlets.length}</b></div>
              <div><small>Place</small><b title={String(place)}>{place}</b></div>
              <div><small>Casualties</small><b>{ai?.dead || ai?.injured ? [ai.dead ? plural(Number(ai.dead), "death") : null, ai.injured ? `${ai.injured} injured` : null].filter(Boolean).join(", ") : "None reported"}</b></div>
              <div><small>Status</small><b>{ai?.status ? String(ai.status).replace(/_/g, " ") : s.incident ? `${s.sev ?? ""} incident on record` : "News only"}</b></div>
            </div>
          </div>
        </section>

        <section className="iv-col nv-read">
          <div className="iv-t"><I n="news" />The report<span>{a.publisher}{MEDIA_KIND[a.kind] ? ` · ${MEDIA_KIND[a.kind]}` : ""} · {fmtShort(a.t)}</span></div>
          <h3 className="nv-h">{en}</h3>
          {a.lang !== "en" && a.title_en && <p className="np-orig" lang="ta" translate="no">{a.title}</p>}
          {a.ai && <NewsDetails ai={a.ai} />}
          <div className="np-text" lang={a.lang === "ta" ? "ta" : undefined}>
            {paras.length ? paras.map((p, k) => <p key={k}>{p}</p>)
              : fetched === "loading" ? <p className="np-note"><I n="refresh" className="spin" />Fetching the full report from {a.publisher ?? "the outlet"}…</p>
                : <>{a.summary && String(a.summary).trim() !== String(a.title).trim() ? <p>{a.summary}</p> : null}
                  <p className="np-note">{noText(fetched ? fetched.status : null, a.publisher)}</p></>}
          </div>
          {link && <div className="np-act"><a className="btn sm" href={link} target="_blank" rel="noreferrer"><I n="link" />Read at {a.publisher ?? "the outlet"} ↗</a></div>}
        </section>

        <section className="iv-col">
          <div className="iv-t"><I n="clock" />How it unfolded<span>{plural(rows.length, "report")}, oldest first</span></div>
          <ul className="tl np-tl">
            {days.map((g) => (
              <li key={g.day} style={{ listStyle: "none" }}>
                <div className="tl-day">{fmtDay(g.day + " 00:00:00")}</div>
                <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                  {g.items.map(({ r, k }) => (
                    <li key={r.id} className={`ev np-ev${k === sel ? " on" : ""}`}>
                      <span className="dotc t-high"><I n="news" /></span>
                      <button className="evb" onClick={() => setSel(k)} aria-pressed={k === sel} title="Read this report">
                        <span className="eh"><b>{r.publisher ?? "News"}</b><span>{MEDIA_KIND[r.kind] ?? "News"}</span><time>{fmtTime(r.t)}</time></span>
                        <span className="np-ev-t">{r.lang !== "en" && r.title_en ? r.title_en : r.title}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
          {dept && (
            <div className="np-who">
              <div className="iv-t"><I n="phone" />Who is responsible</div>
              <p className="np-dept"><b>{dept.name ?? dept.code}</b><small>handles {String(dept.label ?? "this").toLowerCase()}</small></p>
              {(dept.contacts as Row[]).map((o) => <OfficerCard key={o.contact_id} o={o} compact />)}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

/** Why the full report is not shown, in words. */
function noText(status: string | null, outlet: string | null) {
  const o = outlet ?? "The outlet";
  switch (status) {
    case "robots_disallowed": return `${o} does not allow news monitors to read its pages; read the full report on its site.`;
    case "not_in_sitemap": return `${o} no longer lists this report in its news sitemap (outlets keep only the last day or two); read it on its site.`;
    case "no_text": return `${o}'s page could not be read as an article; read it on its site.`;
    case "unreachable": return `${o}'s site could not be reached just now; read it on its site.`;
    default: return `${o} lets news monitors read only its headline; the full report is on its site.`;
  }
}
