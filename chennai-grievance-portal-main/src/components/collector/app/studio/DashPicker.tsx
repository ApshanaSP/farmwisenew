"use client";

/**
 * Pinning to a dashboard, the one way it is done everywhere in the Studio: the dataset's "Add to dashboard" (the whole
 * dataset) and the "Pin" on its summary, numbers, findings and charts. A small pop-up lists the dashboards (the last
 * one used first, then the most recently changed) and "New dashboard" with a name field (the dataset's name to start
 * with). The tiles go to the chosen dashboard, and a toast says where they went, with "Open".
 *
 * Also the Studio's small pop-up (Popover): it opens on the console's canvas, not inside the card, so a card that clips
 * its overflow (a chart, a tile) cannot cut it off; the console's zoom is allowed for, as AlertBar does.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import type { DashboardSummary, NewTile } from "@/lib/studio/dashtypes";
import type { Console } from "../CollectorApp";
import { I, type IconName } from "../icons";
import { zoomOf } from "../Shell";
import { api } from "./client";

/** What a pin adds: tiles, or a whole dataset (its summary, numbers, findings and charts, chosen by the server). */
export type PinWhat = { tiles: NewTile[] } | { datasetId: string };

const LAST = "diq-studio-dash-last";
export const lastDash = (): string | null => { try { return localStorage.getItem(LAST); } catch { return null; } };
const remember = (id: string) => { try { localStorage.setItem(LAST, id); } catch { /* not kept in this browser */ } };

/** The last one used first, then the most recently changed. */
export function sortDash(list: DashboardSummary[], last: string | null): DashboardSummary[] {
  return [...list].sort((a, b) => (a.id === last ? -1 : b.id === last ? 1 : b.updatedAt.localeCompare(a.updatedAt)));
}

const tilesWord = (n: number) => `${n} ${n === 1 ? "tile" : "tiles"}`;

/** Adds to a dashboard, or makes a new one with that name first. Says where it went, in a sentence for the toast. */
export async function pinTo(target: { id: string; name: string } | { name: string }, what: PinWhat): Promise<{ id: string; name: string; msg: string }> {
  if ("id" in target) {
    const r = await api<{ dashboard: DashboardSummary; added?: string[] }>(`/api/collector/studio/dashboards/${target.id}/tiles`, { json: what });
    const n = r.added?.length ?? 1;
    const name = r.dashboard?.name ?? target.name;
    return { id: target.id, name, msg: !n ? `Already on “${name}”: nothing new to add.` : n > 1 ? `Added ${tilesWord(n)} to “${name}”` : `Added to “${name}”` };
  }
  if ("datasetId" in what) {
    const r = await api<{ dashboard: DashboardSummary }>("/api/collector/studio/dashboards", { json: { name: target.name, datasetId: what.datasetId } });
    return { id: r.dashboard.id, name: r.dashboard.name, msg: `Made the dashboard “${r.dashboard.name}” (${tilesWord(r.dashboard.tiles)})` };
  }
  const r = await api<{ dashboard: DashboardSummary }>("/api/collector/studio/dashboards", { json: { name: target.name } });
  try {
    await api(`/api/collector/studio/dashboards/${r.dashboard.id}/tiles`, { json: what });
  } catch (e) {
    // nothing was added: the empty dashboard made for it goes too, so a refused pin leaves nothing behind (and no
    // dashboard the Studio's list does not know about)
    await api(`/api/collector/studio/dashboards/${r.dashboard.id}`, { method: "DELETE" }).catch(() => undefined);
    throw e;
  }
  return { id: r.dashboard.id, name: r.dashboard.name, msg: `Made the dashboard “${r.dashboard.name}” and added it there` };
}

/**
 * A pin with no pop-up (the details panel's button, which is not the Studio's to change): it goes to the last dashboard
 * used, else the most recent one, else a new one named after the dataset; the toast says where and offers "Open".
 */
export async function quickPin(c: Console, dashboards: DashboardSummary[], what: PinWhat, name: string, onOpen: (id: string) => void): Promise<string | null> {
  const to = sortDash(dashboards, lastDash())[0];
  try {
    const r = await pinTo(to ? { id: to.id, name: to.name } : { name }, what);
    remember(r.id);
    c.toast(r.msg, "ok", { label: "Open", run: () => onOpen(r.id) });
    return r.id;
  } catch (e) { c.toast((e as Error).message, "alert"); return null; }
}

/** The Studio's pop-up, under (or above, near the bottom) the button that opened it. Closes on a click elsewhere, Escape or a scroll. */
export function Popover({ anchor, onClose, label, className = "", width = 288, role = "dialog", children }: {
  anchor: RefObject<HTMLElement | null>; onClose: () => void; label: string; className?: string; width?: number; role?: "dialog" | "menu"; children: ReactNode;
}) {
  const box = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  const [at, setAt] = useState<{ host: HTMLElement; left: number; top: number; up: boolean } | null>(null);
  useLayoutEffect(() => {
    const el = anchor.current;
    const host = el?.closest<HTMLElement>(".app") ?? el?.closest<HTMLElement>(".dic") ?? null;
    if (!el || !host) return;
    // the button's place is in screen pixels; the pop-up's in the console's own (zoomed) pixels
    const z = zoomOf(el), r = el.getBoundingClientRect(), h = host.getBoundingClientRect();
    const maxLeft = h.width / z - width - 8;
    const left = Math.max(8, Math.min((r.right - h.left) / z - width, maxLeft));
    const up = r.bottom + 360 * z > window.innerHeight && r.top - h.top > 380 * z;
    setAt({ host, left, top: up ? (r.top - h.top) / z - 6 : (r.bottom - h.top) / z + 6, up });
  }, [anchor, width]);
  useEffect(() => {
    if (!at) return;
    box.current?.querySelector<HTMLElement>("input, button:not(:disabled)")?.focus({ preventScroll: true });
    const inside = (t: EventTarget | null) => t instanceof Node && (!!box.current?.contains(t) || !!anchor.current?.contains(t));
    const down = (e: Event) => { if (!inside(e.target)) close.current(); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); close.current(); anchor.current?.focus(); } };
    // only a scroll that moves the button leaves the pop-up in the wrong place (a chart or list scrolling elsewhere does not)
    const scroll = (e: Event) => { const t = e.target; if (anchor.current && (t === document || (t instanceof Node && t.contains(anchor.current)))) close.current(); };
    const resize = () => close.current();
    document.addEventListener("pointerdown", down, true);
    document.addEventListener("keydown", key, true);
    window.addEventListener("scroll", scroll, true);
    window.addEventListener("resize", resize);
    return () => {
      document.removeEventListener("pointerdown", down, true);
      document.removeEventListener("keydown", key, true);
      window.removeEventListener("scroll", scroll, true);
      window.removeEventListener("resize", resize);
    };
  }, [at, anchor]);
  if (!at) return null;
  return createPortal(
    <div ref={box} className={`ds-pop ${className}${at.up ? " up" : ""}`} role={role} aria-label={label} data-pop style={{ left: at.left, top: at.top, width }}>{children}</div>,
    at.host
  );
}

/**
 * The pin button and its pop-up. `what` may be a function, so a chart's plan is read when the pin is pressed.
 * `name` is the new dashboard's name to start with (the dataset's).
 */
export default function DashPicker({ c, dashboards, what, name, label = "Pin", icon = "bookmark", title, className = "ds-pinbtn", onOpen, onDone }: {
  c: Console; dashboards: DashboardSummary[]; what: PinWhat | (() => PinWhat); name: string; label?: string; icon?: IconName; title?: string; className?: string;
  onOpen: (id: string) => void; onDone?: (id: string) => void;
}) {
  const btn = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [newName, setNewName] = useState(name);
  const close = useCallback(() => setOpen(false), []);
  const last = open ? lastDash() : null;
  const list = open ? sortDash(dashboards, last) : [];
  const go = async (target: { id: string; name: string } | { name: string }) => {
    setBusy(true);
    try {
      const r = await pinTo(target, typeof what === "function" ? what() : what);
      remember(r.id);
      setOpen(false);
      c.toast(r.msg, "ok", { label: "Open", run: () => onOpen(r.id) });
      onDone?.(r.id);
    } catch (e) { c.toast((e as Error).message, "alert"); }
    finally { setBusy(false); }
  };
  const ok = newName.trim().length >= 2;
  return (
    <>
      <button ref={btn} type="button" className={className} onClick={() => { if (!open) setNewName(name); setOpen((o) => !o); }}
        aria-haspopup="dialog" aria-expanded={open} title={title ?? "Pin to a dashboard"}>
        <I n={icon} /><span>{label}</span>
      </button>
      {open && (
        <Popover anchor={btn} onClose={close} label="Pin to a dashboard" className="ds-dp">
          <header className="ds-dp-h"><I n="grid" /><b>{list.length ? "Add to which dashboard?" : "Make your first dashboard"}</b></header>
          {list.length > 0 && (
            <ul className="ds-dp-l">
              {list.map((d) => (
                <li key={d.id}>
                  <button type="button" disabled={busy} onClick={() => go(d)}>
                    <span className="ds-dp-ic"><I n="grid" /></span>
                    <span className="ds-dp-b"><b>{d.name}</b><small>{tilesWord(d.tiles)}{d.datasets.length ? ` · ${d.datasets.map((x) => x.name).join(", ")}` : ""}</small></span>
                    {d.id === last && <em>Last used</em>}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <form className="ds-dp-new" onSubmit={(e) => { e.preventDefault(); if (ok && !busy) go({ name: newName.trim() }); }}>
            <label><small>{list.length ? "Or a new dashboard" : "Its name"}</small>
              <input value={newName} maxLength={80} onChange={(e) => setNewName(e.target.value)} aria-label="Name of the new dashboard" placeholder="Name the dashboard" /></label>
            <button type="submit" className="ds-btn sm" disabled={busy || !ok}>{busy ? <span className="ds-spin sm" /> : <I n="plus" />}Make it and add</button>
          </form>
        </Popover>
      )}
    </>
  );
}
