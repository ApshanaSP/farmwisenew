"use client";

import { useEffect, useState } from "react";
import { I } from "./icons";
import { NewsDetails } from "./Detail";
import { Empty, fmtShort, plural, rel, type Row } from "./lib";

const Loading = () => <div className="empty" style={{ margin: "auto" }}><I n="refresh" className="spin" />Loading the reports…</div>;
import type { Console } from "./CollectorApp";
import type { Story } from "./Overview";

const TOPIC: Record<string, string> = { power: "Power shutdown notices", weather: "Rain and weather updates", dengue: "Dengue updates" };

/**
 * A news story read inside the console: the chosen report in full (or its summary when the outlet's page could not
 * be read), with its translation and what the AI read from it, and every outlet's report of the same story beside it.
 */
export function NewsPreview({ s, c }: { s: Story; c: Console }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [sel, setSel] = useState(0);
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
        if (live) { setRows(list); setSel(0); }
      })
      .catch((e) => live && setErr(e.message));
    return () => { live = false; };
  }, [s.id, s.docIds]);

  if (err) return <Empty>{err}</Empty>;
  if (!rows) return <Loading />;
  if (!rows.length) return <Empty>The reports of this story are no longer in the store.</Empty>;
  const a = rows[Math.min(sel, rows.length - 1)];
  const en = a.lang !== "en" && a.title_en ? String(a.title_en) : String(a.title);
  // the outlet's page often repeats the headline as its first line
  const paras = String(a.body ?? "").split(/\n+/).map((p) => p.trim())
    .filter((p, k) => p.length > 1 && !(k === 0 && p.toLowerCase() === String(a.title).trim().toLowerCase()));
  const outlets = new Set(rows.map((r) => r.publisher).filter(Boolean)).size;

  return (
    <div className="np">
      <article className="np-read">
        <div className="np-tags">
          {s.topic && <span className="tg"><I n="layers" />{TOPIC[s.topic] ?? s.topic}</span>}
          {s.incident
            ? <span className="tg"><I n="alert" />{s.sev ? `${s.sev} severity incident` : "In our records"}{s.grievances ? ` · ${plural(s.grievances, "citizen complaint")}` : ""}</span>
            : <span className="tg"><I n="news" />News only · no department record</span>}
          <span className="tg">{plural(rows.length, "report")} · {plural(outlets, "outlet")}</span>
        </div>
        <h3>{en}</h3>
        {a.lang !== "en" && a.title_en && <p className="np-orig" lang="ta">{a.title}</p>}
        <div className="np-meta">
          <b>{a.publisher ?? "News"}</b><span>{fmtShort(a.t)} ({rel(a.t, c.now)})</span>
          {(a.ai?.place || (a.place && !/^chennai( district)?$/i.test(a.place))) && <span><I n="pin" />{a.ai?.place ?? a.place}</span>}
        </div>
        {a.ai && <NewsDetails ai={a.ai} />}
        <div className="np-text" lang={a.lang === "ta" ? "ta" : undefined}>
          {paras.length ? paras.map((p, k) => <p key={k}>{p}</p>)
            : <>{a.summary && String(a.summary).trim() !== String(a.title).trim() ? <p>{a.summary}</p> : null}
              <p className="np-note">{a.publisher ?? "The outlet"} lets news monitors read only its headline{a.summary ? " and summary" : ""}; the full report is on its site.</p></>}
        </div>
        <div className="np-act">
          {a.url && <a className="btn sm" href={a.url} target="_blank" rel="noreferrer"><I n="link" />Read at {a.publisher ?? "the outlet"} ↗</a>}
          {s.incident && <button className="btn sm plain" onClick={() => c.openInc(s.incident!)}><I n="alert" />Open the incident</button>}
        </div>
      </article>
      <aside className="np-side">
        <div className="iv-t"><I n="layers" />Coverage<span>{rows.length > 1 ? "every outlet's report of this story, newest first" : "one report"}</span></div>
        <div className="np-list">
          {rows.map((r, k) => (
            <button key={r.id} className={`np-i${k === sel ? " on" : ""}`} onClick={() => setSel(k)} aria-pressed={k === sel}>
              <span className="np-i-h"><b>{r.publisher ?? "News"}</b><time>{fmtShort(r.t)}</time></span>
              <span className="np-i-t">{r.lang !== "en" && r.title_en ? r.title_en : r.title}</span>
              {r.lang !== "en" && r.title_en && <small lang="ta">{r.title}</small>}
              <em>{r.body ? "Full report" : "Headline and summary"}</em>
            </button>
          ))}
        </div>
      </aside>
    </div>
  );
}
