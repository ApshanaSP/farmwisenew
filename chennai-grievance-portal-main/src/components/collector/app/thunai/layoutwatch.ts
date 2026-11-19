/**
 * Re-read something placed over the page (the numbered badges, v4 Pillar 6) when the page may have moved, instead of on a timer:
 * a change to the page's elements outside Jarvis's own layer, a resize, a scroll. At most once a frame; nothing runs while
 * nothing moves. Jarvis's own layer is ignored, so re-drawing the badges does not wake it again.
 */

type Win = Pick<Window, "addEventListener" | "removeEventListener">;
type MO = new (cb: MutationCallback) => Pick<MutationObserver, "observe" | "disconnect">;

export function followLayout(changed: () => void, o: { root?: Node | null; ignore?: string; win?: Win | null; frame?: (f: () => void) => void; Observer?: MO | null } = {}): () => void {
  const win = o.win !== undefined ? o.win : typeof window !== "undefined" ? window : null;
  const root = o.root !== undefined ? o.root : typeof document !== "undefined" ? document.body : null;
  const Observer = o.Observer !== undefined ? o.Observer : typeof MutationObserver === "function" ? MutationObserver : null;
  const frame = o.frame ?? ((f: () => void) => (typeof requestAnimationFrame === "function" ? requestAnimationFrame(() => f()) : setTimeout(f, 16)));
  let queued = false, live = true;
  const fire = () => { if (queued || !live) return; queued = true; frame(() => { queued = false; if (live) changed(); }); };
  const outside = (r: MutationRecord) => {
    if (!o.ignore) return true;
    const n = r.target;
    const el = (n.nodeType === 1 ? n : n.parentElement) as Element | null;
    return !el?.closest(o.ignore);
  };
  const mo = Observer && root ? new Observer((records) => { if (records.some(outside)) fire(); }) : null;
  mo?.observe(root!, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "style", "hidden", "aria-hidden", "open"] });
  win?.addEventListener("resize", fire);
  win?.addEventListener("scroll", fire, { capture: true, passive: true } as AddEventListenerOptions);
  return () => {
    live = false;
    mo?.disconnect();
    win?.removeEventListener("resize", fire);
    win?.removeEventListener("scroll", fire, { capture: true } as EventListenerOptions);
  };
}

/** the same places, to the pixel: nothing to re-draw */
export function samePlaces(a: { n: number; x: number; y: number; name: string }[], b: { n: number; x: number; y: number; name: string }[]): boolean {
  return a.length === b.length && a.every((p, i) => p.n === b[i].n && p.name === b[i].name && Math.round(p.x) === Math.round(b[i].x) && Math.round(p.y) === Math.round(b[i].y));
}
