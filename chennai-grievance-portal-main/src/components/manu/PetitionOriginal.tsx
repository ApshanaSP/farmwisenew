"use client";
/**
 * On a case screen: the paper petition behind it, so the officer or Collector can read what was actually written. Nothing when there is
 * none. A page opens over the screen, not in a new browser tab: each tab signs in on its own, so a new tab would be refused the photo.
 */
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import "./manu.css";

interface Item { code: string; subject: string; filedAt: string; pages: string[] }
/** a photo or video a citizen attached to an online complaint in the case (QA pass 6, officer-day-09) */
interface Media { code: string; title: string; filedAt: string; url: string; kind: "photo" | "video" }

const isVideo = (u: string) => /\.mp4$/i.test(u);

function Viewer({ pages, start, onClose, title = "Original petition" }: { pages: string[]; start: number; onClose: () => void; title?: string }) {
  const [at, setAt] = useState(start), [zoom, setZoom] = useState(1), [turn, setTurn] = useState(0);
  const go = (k: number) => { setAt(Math.max(0, Math.min(pages.length - 1, k))); setZoom(1); setTurn(0); };
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopPropagation(); onClose(); } // only this viewer closes, not the case screen behind it
      else if (e.key === "ArrowRight") { setAt((a) => Math.min(pages.length - 1, a + 1)); setZoom(1); setTurn(0); }
      else if (e.key === "ArrowLeft") { setAt((a) => Math.max(0, a - 1)); setZoom(1); setTurn(0); }
    };
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  }, [pages.length, onClose]);
  return createPortal(
    <div className="mn-lb" role="dialog" aria-modal="true" aria-label={title} data-no-i18n onClick={onClose}>
      <div className="mn-lb-bar" onClick={(e) => e.stopPropagation()}>
        <b>{title}{pages.length > 1 ? ` · page ${at + 1} of ${pages.length}` : ""}</b>
        <span className="mn-gap" />
        {pages.length > 1 && <button onClick={() => go(at - 1)} disabled={at === 0}>Previous</button>}
        {pages.length > 1 && <button onClick={() => go(at + 1)} disabled={at === pages.length - 1}>Next</button>}
        <button onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))} aria-label="Zoom out">−</button>
        <button onClick={() => setZoom((z) => Math.min(4, z + 0.25))} aria-label="Zoom in">+</button>
        <button onClick={() => setTurn((t) => (t + 90) % 360)}>Rotate</button>
        <button onClick={onClose}>Close</button>
      </div>
      <div className="mn-lb-view">
        {isVideo(pages[at])
          ? <video src={pages[at]} controls style={{ height: `${zoom * 100}%`, transform: `rotate(${turn}deg)` }} onClick={(e) => e.stopPropagation()} />
          // eslint-disable-next-line @next/next/no-img-element
          : <img src={pages[at]} alt={`${title}, ${at + 1} of ${pages.length}`} style={{ height: `${zoom * 100}%`, transform: `rotate(${turn}deg)` }} onClick={(e) => e.stopPropagation()} />}
      </div>
    </div>,
    document.body
  );
}

export default function PetitionOriginal({ incidentId }: { incidentId: string }) {
  const [items, setItems] = useState<Item[]>([]);
  const [media, setMedia] = useState<Media[]>([]);
  const [open, setOpen] = useState<{ pages: string[]; at: number; title: string } | null>(null);
  useEffect(() => {
    let live = true;
    fetch(`/api/manu/case/${encodeURIComponent(incidentId)}`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : { items: [], media: [] }))
      .then((j) => { if (live) { setItems(j.items ?? []); setMedia(j.media ?? []); } }).catch(() => undefined);
    return () => { live = false; };
  }, [incidentId]);
  if (!items.length && !media.length) return null;
  const urls = media.map((m) => m.url);
  return (
    <>
    {media.length > 0 && (
      <div className="mn-orig" data-no-i18n>
        <b>Sent by the citizen {media.length === 1 ? "" : `(${media.length})`}</b>
        {media.map((m, k) => (
          <div key={m.url}>
            <small>{m.code} · {m.title}</small>
            <span>
              <button type="button" title={`Open the ${m.kind}`} aria-label={`Open the ${m.kind} attached to complaint ${m.code}`} onClick={() => setOpen({ pages: urls, at: k, title: "Attached by the citizen" })}>
                {m.kind === "video" ? <span className="mn-vid">Video</span> : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={m.url} alt="" />
                )}
              </button>
            </span>
          </div>
        ))}
      </div>
    )}
    {items.length > 0 && (
    <div className="mn-orig" data-no-i18n>
      <b>Original {items.length === 1 ? "petition" : `petitions (${items.length})`}</b>
      {items.map((p) => (
        <div key={p.code}>
          <small>{p.code} · {p.subject}</small>
          <span>
            {p.pages.map((u, k) => (
              <button key={u} type="button" title={`Open page ${k + 1}`} aria-label={`Open page ${k + 1} of the petition`} onClick={() => setOpen({ pages: p.pages, at: k, title: "Original petition" })}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={u} alt="" />
              </button>
            ))}
          </span>
        </div>
      ))}
    </div>
    )}
    {open && <Viewer pages={open.pages} start={open.at} title={open.title} onClose={() => setOpen(null)} />}
    </>
  );
}
