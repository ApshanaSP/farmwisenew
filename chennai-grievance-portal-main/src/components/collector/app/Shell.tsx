"use client";

/**
 * The console shell, shared by the Collector and the Department Officer consoles: the 64px icon rail, the pager with its
 * sliding pill, the page title that rolls, the command palette, the alerts bell and the toast stack.
 *
 * The consoles are scaled with CSS `zoom`, so nothing here uses layout-measuring animations (layoutId): indicators
 * measure offsetLeft / offsetTop (local CSS pixels) and animate transform; dialogs grow from the click point via
 * `useGrowFrom`, which converts viewport pixels into the zoomed box's own pixels.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { AnimatePresence, motion } from "motion/react";
import { I, type IconName } from "./icons";
import { spring, T, EASE_OUT, EASE_IN_OUT, reduced } from "@/components/ui/motion";

// ------------------------------------------------------------ the click point --

/** Where the last pointer press happened (viewport pixels): dialogs grow from there. */
let lastPoint: { x: number; y: number; at: number } | null = null;
if (typeof window !== "undefined") {
  window.addEventListener("pointerdown", (e) => { lastPoint = { x: e.clientX, y: e.clientY, at: Date.now() }; }, true);
}
/** The zoom applied to the console canvas (1 outside the fitted console). */
export function zoomOf(el: Element | null): number {
  const app = el?.closest(".app") as HTMLElement | null;
  const z = app ? parseFloat(getComputedStyle(app).zoom || "1") : 1;
  return Number.isFinite(z) && z > 0 ? z : 1;
}
/**
 * A dialog grows from the element that opened it: before the first paint the transform-origin is set to the last
 * click (if recent), in the dialog's own pixels, and the `grow` class plays a scale + fade from there.
 */
export function useGrowFrom<T extends HTMLElement>(ref: RefObject<T>, deps: unknown[] = []) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (reduced()) { el.classList.add("grow-fade"); return; }
    const p = lastPoint && Date.now() - lastPoint.at < 1500 ? lastPoint : null;
    const r = el.getBoundingClientRect();
    const z = zoomOf(el);
    // getBoundingClientRect is in viewport pixels; transform-origin wants the element's own (zoomed) pixels
    const ox = p ? (p.x - r.left) / z : r.width / z / 2;
    const oy = p ? (p.y - r.top) / z : r.height / z / 2;
    el.style.transformOrigin = `${Math.round(ox)}px ${Math.round(oy)}px`;
    el.classList.remove("grow");
    void el.offsetWidth; // restart the animation
    el.classList.add("grow");
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
}

// -------------------------------------------------------------- indicators --

function useSlot<T extends HTMLElement>(active: string | null | undefined, axis: "x" | "y", deps: unknown[] = []) {
  const ref = useRef<T>(null);
  const [box, setBox] = useState<{ o: number; s: number } | null>(null);
  const seen = useRef(false);
  const measure = useCallback(() => {
    const on = active == null ? null : ref.current?.querySelector<HTMLElement>(`[data-key="${active}"]`);
    setBox(on ? (axis === "x" ? { o: on.offsetLeft, s: on.offsetWidth } : { o: on.offsetTop, s: on.offsetHeight }) : null);
  }, [active, axis]);
  useLayoutEffect(() => {
    measure();
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [measure, ...deps]); // eslint-disable-line react-hooks/exhaustive-deps
  const animate = seen.current;
  useEffect(() => { if (box) seen.current = true; }, [box]);
  return { ref, box, animate };
}

// -------------------------------------------------------------------- rail --

export interface RailItem { key: string; label: string; icon: IconName; onClick: () => void; hint?: string; badge?: number }
/** The 64px icon rail: the pages, a divider, then the tools. The active page has an azure pill and a 2px bar that slide. */
export function Rail({ pages, tools, active }: { pages: RailItem[]; tools: RailItem[]; active: string }) {
  const { ref, box, animate } = useSlot<HTMLElement>(pages.some((p) => p.key === active) ? active : null, "y", [pages.length]);
  const btn = (it: RailItem, page: boolean) => (
    <button key={it.key} data-key={it.key} type="button" className={`rail-i${page && it.key === active ? " on" : ""}`} onClick={it.onClick}
      aria-label={it.label} aria-current={page && it.key === active ? "page" : undefined} data-tip={it.hint ? `${it.label} · ${it.hint}` : it.label}>
      <I n={it.icon} />
      {it.badge ? <em className="rail-b">{it.badge > 99 ? "99+" : it.badge}</em> : null}
    </button>
  );
  return (
    <nav ref={ref} className="rail" aria-label="Pages">
      {box && (
        <motion.span className="rail-pill" aria-hidden="true" initial={false} animate={{ y: box.o, height: box.s }}
          transition={animate ? spring.snappy : { duration: 0 }} />
      )}
      {pages.map((p) => btn(p, true))}
      <span className="rail-div" aria-hidden="true" />
      {tools.map((t) => btn(t, false))}
    </nav>
  );
}

// -------------------------------------------------------------- page tabs --

export interface TabItem { key: string; label: string; icon: IconName; badge?: number }
/**
 * The pages as tabs in the top bar (Marina): icon + name, with a 3px ocean bar under the active tab that slides to
 * the next one. PageUp / PageDown also turn pages. On phones the tabs become a bottom bar.
 */
export function PageTabs({ items, active, onPick }: { items: TabItem[]; active: string; onPick: (k: string) => void }) {
  const { ref, box, animate } = useSlot<HTMLElement>(active, "x", [items.length]);
  return (
    <nav ref={ref} className="ptabs" role="tablist" aria-label="Pages (PageUp / PageDown)">
      {items.map((it) => (
        <button key={it.key} data-key={it.key} type="button" role="tab" aria-selected={it.key === active}
          className={`ptab${it.key === active ? " on" : ""}`} onClick={() => onPick(it.key)}>
          <I n={it.icon} /><span>{it.label}</span>
          {it.badge ? <em className="ptab-b">{it.badge > 99 ? "99+" : it.badge}</em> : null}
        </button>
      ))}
      {box && (
        <motion.span className="ptab-bar" aria-hidden="true" initial={false} animate={{ x: box.o, width: box.s }}
          transition={animate ? spring.snappy : { duration: 0 }} />
      )}
    </nav>
  );
}

/** "Good morning" / "Good afternoon" / "Good evening" for an IST wall-clock time ("2026-10-06 09:11:00"). */
export function greeting(now: string): string {
  const h = Number(/[ T](\d{2}):/.exec(now)?.[1] ?? new Date().getHours());
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

// ------------------------------------------------------------------- pager --

/** ‹ ① ② ③ ④ ›: the active page's name sits inside the pill, which slides; PageUp / PageDown also turn pages. */
export function Pager({ pages, page, onPage, short }: { pages: { key: string; label: string }[]; page: string; onPage: (k: string) => void; short?: (k: string) => string }) {
  const pi = pages.findIndex((p) => p.key === page);
  const { ref, box, animate } = useSlot<HTMLDivElement>(page, "x", [pages.length, page]);
  return (
    <div ref={ref} className="pager" role="tablist" aria-label="Pages" data-tip="PageUp / PageDown">
      <button className="nx" onClick={() => pages[pi - 1] && onPage(pages[pi - 1].key)} disabled={pi <= 0} aria-label="Previous page"><I n="chevl" /></button>
      {box && (
        <motion.span className="pg-pill" aria-hidden="true" initial={false} animate={{ x: box.o, width: box.s }}
          transition={animate ? spring.snappy : { duration: 0 }} />
      )}
      {pages.map((p, k) => (
        <button key={p.key} data-key={p.key} role="tab" aria-selected={page === p.key} className={`pg${page === p.key ? " on" : ""}`} onClick={() => onPage(p.key)} title={p.label}>
          <i>{k + 1}</i>{page === p.key && <span>{short ? short(p.key) : p.label}</span>}
        </button>
      ))}
      <button className="nx" onClick={() => pages[pi + 1] && onPage(pages[pi + 1].key)} disabled={pi >= pages.length - 1} aria-label="Next page"><I n="chevr" /></button>
    </div>
  );
}

/** The page title: when it changes, the old one rolls up and out and the new one rolls in. */
export function RollTitle({ text, className = "" }: { text: string; className?: string }) {
  return (
    <h1 className={`roll ${className}`}>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span key={text} initial={{ y: "70%", opacity: 0 }} animate={{ y: "0%", opacity: 1 }} exit={{ y: "-70%", opacity: 0 }}
          transition={{ duration: T.base, ease: EASE_OUT }}>{text}</motion.span>
      </AnimatePresence>
    </h1>
  );
}

// ------------------------------------------------------------ page change --

/** Pages slide in 24px from the direction of travel and fade; reduced motion: fade only. */
export function PageSwap({ k, dir, children, className }: { k: string; dir: number; children: ReactNode; className?: string }) {
  return (
    <AnimatePresence mode="wait" initial={false} custom={dir}>
      <motion.div key={k} id="view" className={className} custom={dir}
        variants={{
          enter: (d: number) => ({ opacity: 0, x: 24 * d }),
          center: { opacity: 1, x: 0, transition: { duration: T.slow, ease: EASE_OUT } },
          exit: (d: number) => ({ opacity: 0, x: -16 * d, transition: { duration: T.fast, ease: EASE_IN_OUT } })
        }}
        initial="enter" animate="center" exit="exit">
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

// --------------------------------------------------------- command palette --

export interface Hit { g: string; ic: IconName; l: string; s?: string; run: () => void; kbd?: string }
/**
 * The command palette ("/"): type to search incidents, zones and departments, or to run an action ("Go to Trends",
 * "Export report", "Switch to light theme", "Open data sources"). Arrow keys move, Enter runs, Esc closes.
 */
export function Palette({ open, onClose, actions, search, ask }: {
  open: boolean; onClose: () => void; actions: Hit[]; search: (q: string) => Promise<Hit[]>; ask?: (q: string) => void;
}) {
  const [q, setQ] = useState("");
  const [found, setFound] = useState<Hit[]>([]);
  const [busy, setBusy] = useState(false);
  const [idx, setIdx] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => { if (open) { setQ(""); setFound([]); setIdx(0); requestAnimationFrame(() => input.current?.focus()); } }, [open]);
  useEffect(() => {
    const t = q.trim();
    if (t.length < 2) { setFound([]); return; }
    let live = true;
    setBusy(true);
    const h = setTimeout(() => search(t).then((r) => live && setFound(r)).catch(() => {}).finally(() => live && setBusy(false)), 180);
    return () => { live = false; clearTimeout(h); };
  }, [q]); // eslint-disable-line react-hooks/exhaustive-deps
  const hits = useMemo(() => {
    const t = q.trim().toLowerCase();
    const acts = t ? actions.filter((a) => `${a.l} ${a.s ?? ""}`.toLowerCase().includes(t)) : actions;
    const out = [...acts, ...found];
    if (t.length >= 3 && ask) out.push({ g: "Ask", ic: "chat", l: `Ask District IQ: “${q.trim()}”`, s: "Opens the assistant with this question", run: () => ask(q.trim()) });
    return out;
  }, [q, actions, found, ask]);
  useEffect(() => { setIdx(0); }, [hits.length]);
  useEffect(() => { list.current?.querySelector<HTMLElement>(`[data-i="${idx}"]`)?.scrollIntoView({ block: "nearest" }); }, [idx]);
  const run = (h: Hit) => { onClose(); h.run(); };
  let g = "";
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div key="s" className="scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: T.fast }} onClick={onClose} />
          <motion.div key="p" className="pal" role="dialog" aria-label="Search and commands" aria-modal="true"
            initial={{ opacity: 0, y: -8, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6, scale: 0.98 }} transition={spring.snappy}>
            <div className="pal-in">
              <I n="search" />
              <input ref={input} id="dic-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search incidents, zones, departments… or type a command"
                aria-label="Search" autoComplete="off" spellCheck={false}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") { setIdx((i) => Math.min(hits.length - 1, i + 1)); e.preventDefault(); }
                  else if (e.key === "ArrowUp") { setIdx((i) => Math.max(0, i - 1)); e.preventDefault(); }
                  else if (e.key === "Enter" && hits[idx]) { e.preventDefault(); run(hits[idx]); }
                  else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onClose(); }
                }} />
              {busy ? <span className="pal-busy" aria-hidden="true" /> : <kbd>Esc</kbd>}
            </div>
            <div className="pal-l" ref={list} role="listbox" aria-label="Results">
              {hits.length ? hits.map((h, k) => {
                const head = h.g !== g ? <div className="pal-g">{h.g}</div> : null;
                g = h.g;
                return (
                  <div key={`${h.g}-${k}`}>
                    {head}
                    <button data-i={k} role="option" aria-selected={k === idx} className={k === idx ? "hl" : ""} onMouseMove={() => setIdx(k)}
                      onMouseDown={(e) => e.preventDefault()} onClick={() => run(h)}>
                      <span className="pal-ic"><I n={h.ic} /></span>
                      <span className="pal-t"><b>{h.l}</b>{h.s && <small>{h.s}</small>}</span>
                      {h.kbd ? <kbd>{h.kbd}</kbd> : k === idx ? <I n="right" className="pal-go" /> : null}
                    </button>
                  </div>
                );
              }) : <div className="empty">{q.trim().length < 2 ? "Type at least two letters." : busy ? "Searching…" : "No matches. Try a zone, street, department or incident ID."}</div>}
            </div>
            <div className="pal-f"><span><kbd>↑</kbd><kbd>↓</kbd> move</span><span><kbd>Enter</kbd> open</span><span><kbd>/</kbd> search anywhere</span></div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// -------------------------------------------------------------- the bell --

export interface BellItem { id: string; title: string; sub: string; sev: string; t: number; icon: IconName }
/** Alerts: the bell shakes once when new alerts arrive; the popover groups them into Now (last hour) and Earlier today. */
export function Bell({ items, unread, open, onToggle, onPick, onMarkRead, nowMs }: {
  items: BellItem[]; unread: number; open: boolean; onToggle: () => void; onPick: (id: string) => void; onMarkRead: () => void; nowMs: number;
}) {
  const prev = useRef(unread);
  const [shake, setShake] = useState(0);
  useEffect(() => { if (unread > prev.current) setShake((s) => s + 1); prev.current = unread; }, [unread]);
  const groups = [
    { l: "Now", rows: items.filter((i) => nowMs - i.t < 3600e3) },
    { l: "Earlier today", rows: items.filter((i) => nowMs - i.t >= 3600e3) }
  ].filter((g) => g.rows.length);
  return (
    <div className="rel">
      <motion.button className="tbtn icon" data-pop onClick={onToggle} aria-label="Alerts" aria-expanded={open} key={shake}
        animate={shake ? { rotate: [0, -14, 12, -8, 5, 0] } : undefined} transition={{ duration: 0.6 }}>
        <I n="bell" />{unread > 0 && <span className="dot-n">{unread}</span>}
      </motion.button>
      <AnimatePresence>
        {open && (
          <motion.div className="pop bellpop" initial={{ opacity: 0, y: -6, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -4 }}
            transition={{ duration: T.fast }} style={{ transformOrigin: "top right" }}>
            <div className="pop-h">Severe and high · last 24 hours<button className="lnk" onClick={onMarkRead}>Mark all read</button></div>
            {groups.length ? groups.map((g) => (
              <div key={g.l}>
                <div className="pop-g">{g.l}</div>
                {g.rows.map((i) => (
                  <button key={i.id} className="pop-i" onClick={() => onPick(i.id)}>
                    <span className={`bell-dot s-${i.sev.toLowerCase()}`} aria-hidden="true" />
                    <span><b>{i.title}</b><small>{i.sub}</small></span>
                  </button>
                ))}
              </div>
            )) : <div className="empty">No alerts.</div>}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ------------------------------------------------------------------ toasts --

export interface ToastMsg { id: number; msg: string; kind: "ok" | "alert"; act?: { label: string; run: () => void } }
/** Top-right toast stack: slides in, swipe right to dismiss. */
export function ToastStack({ toasts, dismiss }: { toasts: ToastMsg[]; dismiss: (id: number) => void }) {
  return (
    <div className="toasts" role="status" aria-live="polite">
      <AnimatePresence initial={false}>
        {toasts.map((t) => (
          <motion.div key={t.id} layout="position" className={`toast${t.kind === "alert" ? " alert" : ""}`}
            initial={{ opacity: 0, x: 40, scale: 0.98 }} animate={{ opacity: 1, x: 0, scale: 1 }} exit={{ opacity: 0, x: 60, transition: { duration: T.fast } }}
            transition={spring.snappy} drag="x" dragConstraints={{ left: 0, right: 0 }} dragElastic={{ left: 0, right: 0.7 }}
            onDragEnd={(_, i) => { if (i.offset.x > 80) dismiss(t.id); }}>
            <I n={t.kind === "alert" ? "bell" : "checkc"} /><span>{t.msg}</span>
            {t.act && <button onClick={() => { t.act!.run(); dismiss(t.id); }}>{t.act.label}</button>}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
