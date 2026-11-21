"use client";
/**
 * Ask the Map's workspace (v2): on a computer the grown map is split in two, the chat docked full height on the left and
 * the map on the right. The line between them drags (or takes the arrow keys) to resize; either side folds away
 * ("Map only", "Chat only") and comes back with one click. The split and what is folded are remembered in this browser.
 * When the panel is dragged off its dock it floats over the whole map as before (dragPanel.tsx). On a phone the panes
 * stack: the map above, the chat as a sheet below (unchanged). Only CSS variables and classes on the map box change, so
 * the map, its tools and Apshana's map tools keep working; the map is resized by its own ResizeObserver.
 */
import { useEffect, useRef, useState } from "react";
import { I } from "../icons";

const KEY = "diq.askmap.ws";
const MIN = 320, DEF = 430;
type Fold = "none" | "chat" | "map";

export function useWorkspace(panel: React.RefObject<HTMLElement | null>, on: boolean, ta: boolean, onLayout?: () => void) {
  const relayout = useRef(onLayout);
  relayout.current = onLayout;
  const [width, setWidth] = useState(DEF);
  const [fold, setFold] = useState<Fold>("none");
  const [dragging, setDragging] = useState(false);
  const loaded = useRef(false);
  const wrapOf = () => (panel.current?.offsetParent as HTMLElement | null) ?? null;

  useEffect(() => {
    try {
      const j = JSON.parse(localStorage.getItem(KEY) ?? "null");
      if (j && Number.isFinite(j.width)) setWidth(j.width);
      if (j && (j.fold === "chat" || j.fold === "map")) setFold(j.fold);
    } catch { /* not kept */ }
    loaded.current = true;
  }, []);
  useEffect(() => { if (loaded.current) try { localStorage.setItem(KEY, JSON.stringify({ width, fold })); } catch { /* not kept */ } }, [width, fold]);

  // the split lives on the map box: a class and one CSS variable
  useEffect(() => {
    const wrap = wrapOf();
    if (!wrap) return;
    if (!on) { wrap.classList.remove("ws", "ws-nochat", "ws-nomap"); return; }
    const max = Math.max(MIN, Math.round(wrap.clientWidth * 0.62));
    wrap.classList.add("ws");
    wrap.classList.toggle("ws-nochat", fold === "chat");
    wrap.classList.toggle("ws-nomap", fold === "map");
    wrap.style.setProperty("--ws-chat", fold === "chat" ? "0px" : fold === "map" ? "100%" : `${Math.min(max, Math.max(MIN, width))}px`);
    return () => { wrap.classList.remove("ws", "ws-nochat", "ws-nomap"); wrap.style.removeProperty("--ws-chat"); };
  }, [on, width, fold]); // eslint-disable-line react-hooks/exhaustive-deps
  // the answer framed again in the map's new pane: when the split opens, a side folds, or a drag ends (not on every pixel of a drag)
  useEffect(() => {
    if (!on || dragging) return;
    const t = setTimeout(() => relayout.current?.(), 160);
    return () => clearTimeout(t);
  }, [on, fold, dragging]); // eslint-disable-line react-hooks/exhaustive-deps

  const clampW = (w: number) => { const wrap = wrapOf(); const max = wrap ? Math.max(MIN, Math.round(wrap.clientWidth * 0.62)) : 900; return Math.min(max, Math.max(MIN, Math.round(w))); };
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const wrap = wrapOf();
    if (!wrap || e.button !== 0) return;
    e.preventDefault();
    const h = e.currentTarget, left = wrap.getBoundingClientRect().left;
    try { h.setPointerCapture(e.pointerId); } catch { /* still moves */ }
    setDragging(true);
    const move = (ev: PointerEvent) => setWidth(clampW(ev.clientX - left));
    const up = () => { setDragging(false); h.removeEventListener("pointermove", move); h.removeEventListener("pointerup", up); h.removeEventListener("pointercancel", up); };
    h.addEventListener("pointermove", move);
    h.addEventListener("pointerup", up);
    h.addEventListener("pointercancel", up);
  };
  const onKey = (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 80 : 24;
    if (e.key === "ArrowLeft") { e.preventDefault(); setWidth((w) => clampW(w - step)); }
    else if (e.key === "ArrowRight") { e.preventDefault(); setWidth((w) => clampW(w + step)); }
    else if (e.key === "Home") { e.preventDefault(); setWidth(MIN); }
    else if (e.key === "End") { e.preventDefault(); setWidth(clampW(10_000)); }
    else if (e.key === "Enter") { e.preventDefault(); setWidth(DEF); }
  };
  const L = ta
    ? { split: "அரட்டை மற்றும் வரைபடம் இடையே: இழுத்து அல்லது அம்புக்குறி விசைகளால் அளவை மாற்றுங்கள்", mapOnly: "வரைபடம் மட்டும்", chatOnly: "அரட்டை மட்டும்", both: "இரண்டும்", showChat: "அரட்டையைக் காட்டு", showMap: "வரைபடத்தைக் காட்டு" }
    : { split: "Between the chat and the map: drag, or use the arrow keys, to resize", mapOnly: "Map only", chatOnly: "Chat only", both: "Chat and map", showChat: "Show the chat", showMap: "Show the map" };

  return {
    fold,
    setFold,
    /** the line between the chat and the map, and the tab that brings a folded chat back */
    split: on ? (
      <>
        {fold === "none" && (
          <div className={`ws-split${dragging ? " on" : ""}`} role="separator" aria-orientation="vertical" aria-label={L.split} title={L.split} tabIndex={0}
            aria-valuemin={MIN} aria-valuenow={width} onPointerDown={onPointerDown} onKeyDown={onKey} onDoubleClick={() => setWidth(DEF)}>
            <span />
          </div>
        )}
        {fold === "chat" && <button className="ws-tab" onClick={() => setFold("none")} title={L.showChat} aria-label={L.showChat}><I n="chat" /><span>{L.showChat}</span></button>}
      </>
    ) : null,
    /** for the panel's header: fold the map or the chat away */
    tools: on ? (
      <span className="ws-tools" role="group" aria-label={L.both}>
        {fold === "map"
          ? <button className="amp-ib" onClick={() => setFold("none")} title={L.showMap} aria-label={L.showMap}><I n="map" /></button>
          : <button className="amp-ib" onClick={() => setFold("map")} title={L.chatOnly} aria-label={L.chatOnly}><I n="expand" /></button>}
        {fold !== "map" && <button className="amp-ib" onClick={() => setFold("chat")} title={L.mapOnly} aria-label={L.mapOnly}><I n="chevl" /></button>}
      </span>
    ) : null
  };
}
