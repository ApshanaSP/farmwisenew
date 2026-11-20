"use client";
/**
 * The map panel (Ask the Map, Rain) can be moved off the part of the map the Collector wants to see: drag it by its
 * header anywhere over the map and dock it back on the left (the Dock button, or a double click on the header). Where it
 * was left is remembered per view in this browser. Wherever it is, it keeps one standard size, the map's height (up to
 * MAX_H), so everything in it reads from top to bottom; there is no minimise any more (owner, 17 Nov 2026: a panel
 * shrunk to its header could not be made big again). Desktop only: on a phone the panel is a bottom sheet.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { I } from "../icons";

type Pos = { x: number; y: number };
const KEY = "diq.panel.";
/** the panel's standard height: the map's height less a margin, never more than this (a full-screen map stays visible) */
const MAX_H = 820;
const MARGIN = 12;

export function useDragPanel(kind: "ask" | "rain" | "traffic", off: boolean) {
  const ref = useRef<HTMLElement | null>(null);
  const [pos, setPos] = useState<Pos | null>(null);
  const [dragging, setDragging] = useState(false);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const loaded = useRef(false);

  // the map box the panel sits in (its offset parent), measured whenever it changes size (the map grows when the view opens)
  useEffect(() => {
    const p = ref.current?.offsetParent as HTMLElement | null;
    if (!p) return;
    const measure = () => setBox({ w: p.clientWidth, h: p.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(p);
    return () => ro.disconnect();
  }, []);
  // where it was left, read after mount (the first render matches the server's)
  useEffect(() => {
    if (off) return;
    try {
      const j = JSON.parse(localStorage.getItem(KEY + kind) ?? "null");
      if (j && typeof j === "object" && j.pos && Number.isFinite(j.pos.x) && Number.isFinite(j.pos.y)) setPos(j.pos);
    } catch { /* no storage: docked */ }
    loaded.current = true;
  }, [kind, off]);
  useEffect(() => {
    if (!loaded.current || off) return;
    try { localStorage.setItem(KEY + kind, JSON.stringify({ pos })); } catch { /* not kept */ }
  }, [pos, kind, off]);

  /** the standard height for this map */
  const height = box.h ? Math.max(240, Math.min(MAX_H, box.h - 2 * MARGIN)) : 0;
  /** inside the map: the whole panel, at its standard height, always in view */
  const clamp = useCallback((p: Pos): Pos => {
    const w = ref.current?.offsetWidth ?? 400;
    if (!box.w) return p;
    return { x: Math.round(Math.min(Math.max(0, p.x), Math.max(0, box.w - w))), y: Math.round(Math.min(Math.max(0, p.y), Math.max(0, box.h - height - MARGIN))) };
  }, [box, height]);
  const at = pos && !off ? clamp(pos) : null;

  const onPointerDown = (e: React.PointerEvent<HTMLElement>) => {
    const el = ref.current;
    if (off || !el || e.button !== 0 || (e.target as HTMLElement).closest("button, a, input, textarea, select, label, [role=tab]")) return;
    const h = e.currentTarget;
    const start = { px: e.clientX, py: e.clientY, x: el.offsetLeft, y: el.offsetTop };
    try { h.setPointerCapture(e.pointerId); } catch { /* a pointer the browser no longer tracks: the moves still reach the header */ }
    e.preventDefault();
    setDragging(true);
    const move = (ev: PointerEvent) => setPos(clamp({ x: start.x + ev.clientX - start.px, y: start.y + ev.clientY - start.py }));
    const up = () => {
      setDragging(false);
      h.removeEventListener("pointermove", move);
      h.removeEventListener("pointerup", up);
      h.removeEventListener("pointercancel", up);
      try { if (h.hasPointerCapture(e.pointerId)) h.releasePointerCapture(e.pointerId); } catch { /* already released */ }
    };
    h.addEventListener("pointermove", move);
    h.addEventListener("pointerup", up);
    h.addEventListener("pointercancel", up);
  };
  const dock = () => setPos(null);

  return {
    ref,
    /** for the panel: where it is, at its standard height */
    style: at ? ({ left: at.x, top: at.y, bottom: "auto", height: height || undefined } as React.CSSProperties) : undefined,
    cls: `${at ? " moved" : ""}${dragging ? " dragging" : ""}`,
    /** moved to the right half of the map: the map key goes to the left so it never covers the panel */
    right: !!at && !!box.w && at.x + (ref.current?.offsetWidth ?? 400) / 2 > box.w / 2,
    /** for the header: drag it, double-click it to dock */
    handle: { className: "amp-drag", onPointerDown, onDoubleClick: (e: React.MouseEvent) => { if (!(e.target as HTMLElement).closest("button, a, input")) dock(); } },
    tools: off ? null : <PanelTools moved={!!at} onDock={dock} />
  };
}

/** Dock, once the panel has been moved */
function PanelTools({ moved, onDock }: { moved: boolean; onDock: () => void }) {
  if (!moved) return null;
  return (
    <span className="amp-tools">
      <button className="amp-ib" onClick={onDock} title="Put the panel back on the left (or double-click its header)" aria-label="Dock the panel on the left"><I n="sidebar" /></button>
    </span>
  );
}

/** The grip at the start of a draggable header */
export const Grip = ({ off }: { off: boolean }) => (off ? null : <span className="amp-grip" title="Drag to move the panel"><I n="grip" /></span>);
