"use client";
/**
 * On a case screen: the paper petition behind it, so the officer or Collector can read what was actually written. Nothing when there is
 * none. A page opens over the screen, not in a new browser tab: each tab signs in on its own, so a new tab would be refused the photo.
 */
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import "./manu.css";

interface Item { code: string; subject: string; filedAt: string; pages: string[] }

function Viewer({ pages, start, onClose }: { pages: string[]; start: number; onClose: () => void }) {
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
    <div className="mn-lb" role="dialog" aria-modal="true" aria-label="Original petition" data-no-i18n onClick={onClose}>
      <div className="mn-lb-bar" onClick={(e) => e.stopPropagation()}>
        <b>Original petition{pages.length > 1 ? ` · page ${at + 1} of ${pages.length}` : ""}</b>
        <span className="mn-gap" />
        {pages.length > 1 && <button onClick={() => go(at - 1)} disabled={at === 0}>Previous</button>}
        {pages.length > 1 && <button onClick={() => go(at + 1)} disabled={at === pages.length - 1}>Next</button>}
        <button onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))} aria-label="Zoom out">−</button>
        <button onClick={() => setZoom((z) => Math.min(4, z + 0.25))} aria-label="Zoom in">+</button>
        <button onClick={() => setTurn((t) => (t + 90) % 360)}>Rotate</button>
        <button onClick={onClose}>Close</button>
      </div>
      <div className="mn-lb-view">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={pages[at]} alt={`Page ${at + 1} of the petition`} style={{ height: `${zoom * 100}%`, transform: `rotate(${turn}deg)` }} onClick={(e) => e.stopPropagation()} />
      </div>
    </div>,
    document.body
  );
}

export default function PetitionOriginal({ incidentId }: { incidentId: string }) {
  const [items, setItems] = useState<Item[]>([]);
  const [open, setOpen] = useState<{ pages: string[]; at: number } | null>(null);
  useEffect(() => {
    let live = true;
    fetch(`/api/manu/case/${encodeURIComponent(incidentId)}`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : { items: [] })).then((j) => live && setItems(j.items ?? [])).catch(() => undefined);
    return () => { live = false; };
  }, [incidentId]);
  if (!items.length) return null;
  return (
    <div className="mn-orig" data-no-i18n>
      <b>Original {items.length === 1 ? "petition" : `petitions (${items.length})`}</b>
      {items.map((p) => (
        <div key={p.code}>
          <small>{p.code} · {p.subject}</small>
          <span>
            {p.pages.map((u, k) => (
              <button key={u} type="button" title={`Open page ${k + 1}`} aria-label={`Open page ${k + 1} of the petition`} onClick={() => setOpen({ pages: p.pages, at: k })}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={u} alt="" />
              </button>
            ))}
          </span>
        </div>
      ))}
      {open && <Viewer pages={open.pages} start={open.at} onClose={() => setOpen(null)} />}
    </div>
  );
}
