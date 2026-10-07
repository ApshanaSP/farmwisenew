"use client";

/**
 * Where a dataset came from and whether it is the district's: the Relevance verdict, and for a link how it was read
 * (downloaded or in a browser, signed in or public), which of the things on the page is used (switch to another),
 * how often it refreshes, and the history of its refreshes.
 */
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { AUTH_LABEL, type ConnectInfo, type DatasetMeta } from "@/lib/studio/types";
import type { Console } from "../CollectorApp";
import { I, type IconName } from "../icons";
import { api } from "./client";

const EVERY: { v: number | null; t: string }[] = [{ v: null, t: "By hand" }, { v: 60, t: "Hourly" }, { v: 360, t: "Every 6 h" }, { v: 1440, t: "Daily" }];
const KIND_IC: Record<string, IconName> = { file: "doc", api: "bolt", table: "table", feed: "news", headlines: "news" };

function ago(iso: string | null | undefined): string {
  if (!iso) return "never";
  const m = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h} h ago` : `${Math.round(h / 24)} d ago`;
}

export default function SourceBar({ meta, c, onChoose, onRefresh, onChanged }: {
  meta: DatasetMeta; c: Console; onChoose: (candidate: string) => void; onRefresh: () => void; onChanged: () => void;
}) {
  const cx: ConnectInfo | null = meta.source.connect ?? null;
  const rel = meta.relevance ?? null;
  const [open, setOpen] = useState<null | "tables" | "sync">(null);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const off = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(null); };
    window.addEventListener("mousedown", off);
    return () => window.removeEventListener("mousedown", off);
  }, [open]);
  if (!cx && !rel) return null;
  const schedule = async (every: number | null) => {
    try { await api(`/api/collector/studio/${meta.id}`, { json: { action: "schedule", every } }); c.toast(every ? `Refreshes ${EVERY.find((e) => e.v === every)?.t.toLowerCase()}.` : "Refreshes only by hand now."); onChanged(); }
    catch (e: any) { c.toast(e.message, "alert"); }
  };
  const relText = rel ? (rel.forced ? "Added anyway" : rel.verdict === "district" ? "Chennai data" : rel.verdict === "partly" ? (rel.filtered ? `Chennai's rows of a TN table` : "Partly Chennai") : "Not district data") : null;
  return (
    <div className="ds-src" ref={box}>
      {rel && (
        <span className={`ds-src-chip rel-${rel.forced ? "forced" : rel.verdict}`} title={[rel.why, ...rel.signals].join("\n")}>
          <I n={rel.verdict === "district" && !rel.forced ? "checkc" : rel.filtered ? "pin" : "alert"} />{relText}
        </span>
      )}
      {cx && (
        <>
          <span className="ds-src-chip" title={cx.method === "browser" ? "Opened in a real browser (the page builds itself with JavaScript, or a sign-in)" : "Downloaded as the site sends it"}>
            <I n={cx.method === "browser" ? "app" : "download"} />{cx.method === "browser" ? "Read in a browser" : "Downloaded"}
          </span>
          <span className="ds-src-chip" title={AUTH_LABEL[cx.auth]}>
            <I n={cx.auth === "none" ? "gov" : "shield"} />{cx.auth === "none" ? "Public" : cx.account ? `Signed in as ${cx.account}` : AUTH_LABEL[cx.auth]}
          </span>
          <button className={`ds-src-chip btn${open === "tables" ? " on" : ""}`} onClick={() => setOpen(open === "tables" ? null : "tables")} title="What on the link is used">
            <I n={KIND_IC[cx.candidates.find((x) => x.id === cx.choice)?.kind ?? "table"] ?? "table"} />{cx.via}{cx.candidates.length > 1 && <em>{cx.candidates.length}</em>}<I n="chevd" />
          </button>
          <button className={`ds-src-chip btn${cx.lastError ? " bad" : ""}${open === "sync" ? " on" : ""}`} onClick={() => setOpen(open === "sync" ? null : "sync")} title={cx.lastError ?? "Refresh"}>
            <I n={cx.lastError ? "alert" : "refresh"} />{cx.lastError ? "Last refresh failed" : `Fetched ${ago(cx.history[0]?.at ?? cx.fetchedAt)}`}{cx.every ? <em>{EVERY.find((e) => e.v === cx.every)?.t ?? `${cx.every} min`}</em> : null}<I n="chevd" />
          </button>
        </>
      )}
      <AnimatePresence>
        {open === "tables" && cx && (
          <motion.div className="ds-pop" initial={{ opacity: 0, y: -6, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.18 }}>
            <header><b>What the link holds</b><small>Scored on size, numbers, dates and Chennai places. Choose another to rebuild the dashboard from it.</small></header>
            <ul>
              {cx.candidates.map((x) => (
                <li key={x.id} className={x.id === cx.choice ? "on" : ""}>
                  <span className="ds-pop-ic"><I n={KIND_IC[x.kind] ?? "table"} /></span>
                  <div><b>{x.label}</b><small>{x.why}</small>{x.headers.length > 0 && <code>{x.headers.slice(0, 6).join(" · ")}</code>}</div>
                  <span className="ds-score" style={{ ["--s" as string]: `${x.score}%` }}><i />{x.score}</span>
                  {x.id === cx.choice ? <em className="ds-inuse">In use</em> : <button className="ds-btn sm" onClick={() => { setOpen(null); onChoose(x.id); }}>Use this</button>}
                </li>
              ))}
            </ul>
          </motion.div>
        )}
        {open === "sync" && cx && (
          <motion.div className="ds-pop" initial={{ opacity: 0, y: -6, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.18 }}>
            <header><b>Keep it up to date</b><small>A refresh reads the link again with the same sign-in. Nothing is rebuilt when the data has not changed; a failed refresh keeps the last good data.</small></header>
            <div className="ds-seg wide">{EVERY.map((e) => <button key={String(e.v)} className={(cx.every ?? null) === e.v ? "on" : ""} onClick={() => schedule(e.v)}>{e.t}</button>)}</div>
            <button className="ds-btn wide" onClick={() => { setOpen(null); onRefresh(); }}><I n="refresh" />Fetch now</button>
            {cx.lastError && <p className="ds-pop-err"><I n="alert" />{cx.lastError}</p>}
            <ol className="ds-hist">
              {cx.history.slice(0, 8).map((h, i) => (
                <li key={i} className={h.ok ? (h.changed ? "chg" : "same") : "bad"}><i /><span><b>{h.ok ? (h.changed ? "Updated" : "No change") : "Failed"}</b> · {ago(h.at)}{h.rows != null ? ` · ${h.rows.toLocaleString("en-IN")} rows` : ""}</span><small>{h.note}</small></li>
              ))}
            </ol>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
