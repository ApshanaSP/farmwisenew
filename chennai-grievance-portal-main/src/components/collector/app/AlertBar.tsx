"use client";
/**
 * The banners at the top of every page of the console (LT-01, LT-02, LT-29):
 *   - the alerts lane: a warning for Chennai, or an event the news is full of, with what IMD, NDMA SACHET and the news
 *     each say and whether they agree; red when a hazard feed has gone quiet during the alert, with the fallback figures.
 *   - the admin notice: an AI key a provider refused, and how to renew it.
 * One slim line each (the canvas is 680 px tall); the details open below on a click. Read every 5 minutes and whenever
 * the data changes.
 */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { zoomOf } from "./Shell";
import type { AlertLane } from "@/lib/collector/alerts";
import { I } from "./icons";
import { fmtWhen } from "./lib";
import "./alerts.css";

interface Payload { lane: AlertLane; admin: { title: string; line: string } | null }
const LEVEL = ["none", "yellow", "orange", "red"];

/**
 * compact: one small chip in the band's top line (the Collector's console), the details in a drop-down on a click, so
 * the alert no longer pushes every page's cards down.
 */
export function AlertBar({ now, compact }: { now: string; compact?: boolean }) {
  const [d, setD] = useState<Payload | null>(null);
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    const load = () => fetch("/api/collector/alerts").then((r) => (r.ok ? r.json() : null)).then((j) => { if (live && j?.lane) setD(j); }).catch(() => undefined);
    load();
    const t = setInterval(load, 5 * 60_000);
    return () => { live = false; clearInterval(t); };
  }, [now]);
  if (!d) return null;
  const b = d.lane.banner;
  const admin = d.admin && hidden !== d.admin.line ? d.admin : null;
  if (!b && !admin) return null;
  if (compact) return <AlertChip d={d} b={b} admin={admin} now={now} open={open} setOpen={setOpen} onHide={() => admin && setHidden(admin.line)} />;
  return (
    <div className="alb" role="region" aria-label="Alerts">
      {b && (
        <div className={`alb-row t-${b.tone}${open ? " open" : ""}`}>
          <button className="alb-h" onClick={() => setOpen((o) => !o)} aria-expanded={open} title="What each source says">
            <I n={b.tone === "red" ? "alert" : "cloud"} />
            <b>{b.title}</b>
            <span>{b.line}</span>
            <I n={open ? "chevd" : "chevr"} />
          </button>
          {open && (
            <div className="alb-d">
              <ul className="alb-src">
                {d.lane.sources.map((s) => (
                  <li key={s.key} className={`lv-${LEVEL[s.level]}`}>
                    <b>{s.label}</b><span>{s.says}</span>{s.t && <small>{s.t.length > 10 ? fmtWhen(s.t, now) : s.t}</small>}
                  </li>
                ))}
              </ul>
              {d.lane.fallback && (
                <p className="alb-fb"><I n="drop" />
                  <span><b>Meanwhile:</b>{" "}
                    {d.lane.fallback.rain24hMm != null ? `IMD rain ${d.lane.fallback.rain24hMm} mm in 24 hours${d.lane.fallback.rainAt ? ` (to ${fmtWhen(d.lane.fallback.rainAt, now)})` : ""}` : "no IMD rain reading"}
                    {d.lane.fallback.lakes.length ? `; lakes ${d.lane.fallback.lakes.map((l) => `${l.name} ${l.pct}%`).join(", ")} full` : ""}.
                  </span>
                </p>
              )}
              {d.lane.news.length > 0 && (
                <ul className="alb-news">
                  {d.lane.news.slice(0, 6).map((n) => (
                    <li key={n.id}>
                      {n.url ? <a href={n.url} target="_blank" rel="noreferrer">{n.titleEn ?? n.title}</a> : <span>{n.titleEn ?? n.title}</span>}
                      <small>{n.publisher ?? "News"} · {fmtWhen(n.t, now)}{n.chennaiUnder ? " · names Chennai" : ""}</small>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
      {admin && (
        <div className="alb-row t-admin">
          <div className="alb-h static"><I n="alert" /><b>{admin.title}</b><span>{admin.line}</span>
            <button className="alb-x" onClick={() => setHidden(admin.line)} aria-label="Hide until it changes" title="Hide until it changes"><I n="x" /></button>
          </div>
        </div>
      )}
    </div>
  );
}

function AlertChip({ d, b, admin, now, open, setOpen, onHide }: { d: Payload; b: Payload["lane"]["banner"]; admin: Payload["admin"]; now: string; open: boolean;
  setOpen: (f: (o: boolean) => boolean) => void; onHide: () => void }) {
  const tone = b?.tone ?? "admin";
  const btn = useRef<HTMLButtonElement>(null);
  // the band clips what overflows it, so the details open on the console's canvas, under the chip
  const [at, setAt] = useState<{ host: HTMLElement; left: number; top: number } | null>(null);
  useLayoutEffect(() => {
    const el = btn.current, host = el?.closest<HTMLElement>(".app");
    if (!open || !el || !host) { setAt(null); return; }
    const z = zoomOf(el), r = el.getBoundingClientRect(), h = host.getBoundingClientRect();
    setAt({ host, left: Math.max(8, (r.left - h.left) / z), top: (r.bottom - h.top) / z + 6 });
  }, [open]);
  return (
    <span className="alc-w" data-pop>
      <button ref={btn} className={`alc t-${tone}${open ? " open" : ""}`} onClick={() => setOpen((o) => !o)} aria-expanded={open} title={b ? `${b.title}: ${b.line}` : admin?.line}>
        <span className="alc-dot" aria-hidden="true" /><I n={tone === "red" ? "alert" : tone === "admin" ? "info" : "cloud"} />
        {/* the event's name only ("Cyclone Murasu"); what each source says opens on a click */}
        <b>{(b?.title ?? admin?.title ?? "").split(" · ")[0]}</b><I n="chevd" />
      </button>
      {open && at && createPortal(
        <div className={`alc-pop t-${tone}`} role="dialog" aria-label="Alerts" data-pop style={{ left: at.left, top: at.top }}>
          {b && (
            <>
              <p className="alc-line">{b.line}</p>
              <ul className="alb-src">
                {d.lane.sources.map((s) => (
                  <li key={s.key} className={`lv-${LEVEL[s.level]}`}>
                    <b>{s.label}</b><span>{s.says}</span>{s.t && <small>{s.t.length > 10 ? fmtWhen(s.t, now) : s.t}</small>}
                  </li>
                ))}
              </ul>
              {d.lane.fallback && (
                <p className="alb-fb"><I n="drop" />
                  <span><b>Meanwhile:</b>{" "}
                    {d.lane.fallback.rain24hMm != null ? `IMD rain ${d.lane.fallback.rain24hMm} mm in 24 hours${d.lane.fallback.rainAt ? ` (to ${fmtWhen(d.lane.fallback.rainAt, now)})` : ""}` : "no IMD rain reading"}
                    {d.lane.fallback.lakes.length ? `; lakes ${d.lane.fallback.lakes.map((l) => `${l.name} ${l.pct}%`).join(", ")} full` : ""}.
                  </span>
                </p>
              )}
              {d.lane.news.length > 0 && (
                <ul className="alb-news">
                  {d.lane.news.slice(0, 5).map((n) => (
                    <li key={n.id}>
                      {n.url ? <a href={n.url} target="_blank" rel="noreferrer">{n.titleEn ?? n.title}</a> : <span>{n.titleEn ?? n.title}</span>}
                      <small>{n.publisher ?? "News"} · {fmtWhen(n.t, now)}</small>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
          {admin && (
            <p className="alc-admin"><I n="alert" /><span><b>{admin.title}</b> {admin.line}</span>
              <button onClick={onHide} aria-label="Hide until it changes" title="Hide until it changes"><I n="x" /></button></p>
          )}
        </div>, at.host
      )}
    </span>
  );
}
