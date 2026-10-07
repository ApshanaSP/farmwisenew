"use client";

import { useEffect, useState } from "react";
import { I } from "./icons";
import { Explained, NewsDetails, useAnalysis } from "./Detail";
import { OfficerCard } from "./Overview";
import { MEDIA_KIND, deptIcon, fmtDay, fmtShort, fmtTime, plural, rel, type Row } from "./lib";
import type { Console } from "./CollectorApp";
import type { Story } from "./Overview";

type Full = { status: string; text: string | null; url: string | null } | "loading";

/**
 * A news story, laid out like an incident: what happened and why it matters (analysed by AI from every outlet's
 * report), the key facts, the report itself in full (fetched from the outlet when the monitor kept only a headline),
 * how the story unfolded across outlets, and the department that handles it with its contacts.
 */
export function NewsView({ s, c }: { s: Story; c: Console }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [dept, setDept] = useState<Row | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [sel, setSel] = useState(0);
  const [full, setFull] = useState<Record<string, Full>>({});
  const ana = useAnalysis(`/api/collector/news/analysis?ids=${encodeURIComponent(s.docIds.join(","))}`, s.id);

  useEffect(() => {
    let live = true;
    fetch(`/api/collector/news?ids=${encodeURIComponent(s.docIds.join(","))}`)
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || "Could not load the reports.");
        // the same headline from the same outlet twice is one report; the story's own headline first
        const seen = new Set<string>();
        const list = (j.articles as Row[]).filter((a) => {
          const k = `${a.publisher}|${String(a.title).toLowerCase()}`;
          return seen.has(k) ? false : (seen.add(k), true);
        });
        list.sort((a, b) => Number(b.id === s.id) - Number(a.id === s.id) || Number(!!b.body) - Number(!!a.body));
        if (live) { setRows(list); setSel(0); setDept(j.dept ?? null); }
      })
      .catch((e) => live && setErr(e.message));
    return () => { live = false; };
  }, [s.id, s.docIds]);

  const a = rows?.[Math.min(sel, rows.length - 1)];
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
  const ai = rows.find((r) => r.ai)?.ai as Row | undefined;
  const place = rows.map((r) => r.ai?.place || (r.place && !/^chennai( district)?$/i.test(r.place) ? r.place : null)).find(Boolean) ?? "Chennai";
  const lead = rows[0];
  const rules = { summary: String(lead.summary && lead.summary !== lead.title ? lead.summary : (lead.title_en || lead.title)), facts: [], attention: [],
    needsYou: false, what: [], why: [], next: null, ai: false } as unknown as Parameters<typeof Explained>[0]["rules"];

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
        {lead.lang !== "en" && lead.title_en && <p className="nv-orig" lang="ta">{lead.title}</p>}
        <div className="iv-where">
          <span><I n="pin" />{place}</span>
          {dept && <span><I n={deptIcon(dept.code)} />{dept.name}</span>}
          <span><I n="clock" />First reported {fmtShort(times[0])} ({rel(times[0], c.now)})</span>
          <span><I n="news" />{plural(rows.length, "report")} · {plural(outlets.length, "outlet")}</span>
          {s.incident && <button className="iv-loc" onClick={() => c.openInc(s.incident!)}><I n="alert" />Open the incident</button>}
        </div>
      </div>

      <div className="iv-b">
        <section className="iv-col">
          <Explained a={ana.a} busy={ana.busy} rules={rules} open={false} deptName={dept?.name ?? "The department"} needLabel="Why it matters to you" />
          {ana.a?.handled && !ana.a.why.length && <div className="iv-ok"><I n="checkc" /><span>{ana.a.handled}</span></div>}
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
          {a.lang !== "en" && a.title_en && <p className="np-orig" lang="ta">{a.title}</p>}
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
