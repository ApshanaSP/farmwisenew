"use client";

/**
 * District IQ component kit: built once, used by the citizen portal, both consoles and Ask District IQ.
 * Styles: ui.css (global). Motion: motion.ts. Every animation respects prefers-reduced-motion (MotionConfig "user"
 * plus `reduced()` for the hand-written ones).
 *
 * Note on the consoles: they are scaled with CSS `zoom`, which breaks layout-measuring animations (layoutId). Sliding
 * indicators here therefore measure offsetLeft/offsetWidth (local CSS pixels, unaffected by zoom) and animate x/width.
 */
import {
  forwardRef, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState,
  type ButtonHTMLAttributes, type CSSProperties, type KeyboardEvent as RKeyboardEvent, type ReactNode
} from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowDown, ArrowUp, Bell, Check, CheckCircle2, ChevronDown, ChevronRight, CircleAlert, Clock3, FileCheck2, Hourglass, Inbox, Loader2,
  RotateCcw, Send, ShieldCheck, Upload, Wrench, X, XCircle
} from "lucide-react";
import { EASE_OUT, T, dialog as dialogV, drawer as drawerV, reduced, scrim as scrimV, sheet as sheetV, spring } from "./motion";

const cx = (...a: (string | false | null | undefined)[]) => a.filter(Boolean).join(" ");

// ============================================================================================== buttons ==

type BtnVariant = "primary" | "secondary" | "ghost" | "danger" | "ok" | "ai";
export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: BtnVariant;
  size?: "sm" | "md" | "lg";
  loading?: boolean;
  icon?: ReactNode;
  iconRight?: ReactNode;
  block?: boolean;
  shimmer?: boolean;
}
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", loading, icon, iconRight, block, shimmer, className, children, disabled, type = "button", ...rest }, ref
) {
  return (
    <button ref={ref} type={type} disabled={disabled || loading} aria-busy={loading || undefined}
      className={cx("ui-btn", variant, size !== "md" && size, block && "block", shimmer && "shimmer", loading && "loading", className)} {...rest}>
      {loading && <Loader2 className="ui-spin" aria-hidden="true" />}
      {icon}{children != null && <span>{children}</span>}{iconRight}
    </button>
  );
});

export const IconButton = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { label: string; size?: "sm" | "md"; ghost?: boolean }>(
  function IconButton({ label, size = "md", ghost, className, children, type = "button", ...rest }, ref) {
    return (
      <button ref={ref} type={type} aria-label={label} title={label} className={cx("ui-iconbtn", size === "sm" && "sm", ghost && "ghost", className)} {...rest}>
        {children}
      </button>
    );
  }
);

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="ui-kbd">{children}</kbd>;
}

// ===================================================================================== sliding indicator ==

/** Position of the active child (data-key === active) inside `ref`, in local CSS pixels; re-measured on resize. */
export function useIndicator<T extends HTMLElement>(active: string | number | null | undefined, deps: unknown[] = []) {
  const ref = useRef<T>(null);
  const [box, setBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const first = useRef(true);
  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const on = el.querySelector<HTMLElement>(`[data-key="${String(active)}"]`);
    setBox(on ? { x: on.offsetLeft, y: on.offsetTop, w: on.offsetWidth, h: on.offsetHeight } : null);
  }, [active]);
  useLayoutEffect(() => {
    measure();
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(el);
    document.fonts?.ready.then(measure).catch(() => {});
    return () => ro.disconnect();
  }, [measure, ...deps]); // eslint-disable-line react-hooks/exhaustive-deps
  const animateNow = !first.current;
  useEffect(() => { if (box) first.current = false; }, [box]);
  return { ref, box, animateNow };
}

// ================================================================================== segmented control ==

export interface SegOption<V extends string> { value: V; label: ReactNode; title?: string }
export function SegmentedControl<V extends string>({ options, value, onChange, label, size, tone = "accent", className, role = "tablist" }: {
  options: SegOption<V>[]; value: V; onChange: (v: V) => void; label: string; size?: "sm"; tone?: "accent" | "quiet" | "ai"; className?: string;
  role?: "tablist" | "group";
}) {
  const { ref, box, animateNow } = useIndicator<HTMLDivElement>(value, [options.length]);
  const onKey = (e: RKeyboardEvent) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const i = options.findIndex((o) => o.value === value) + (e.key === "ArrowRight" ? 1 : -1);
    const o = options[(i + options.length) % options.length];
    onChange(o.value);
    e.preventDefault();
    ref.current?.querySelector<HTMLElement>(`[data-key="${o.value}"]`)?.focus();
  };
  return (
    <div ref={ref} className={cx("ui-seg", size, tone !== "accent" && tone, className)} role={role} aria-label={label} onKeyDown={onKey}>
      {box && (
        <motion.span className="ui-seg-pill" aria-hidden="true" initial={false}
          animate={{ x: box.x - 3, width: box.w }} style={{ left: 3, right: "auto", top: 3, bottom: 3, height: "auto" }}
          transition={animateNow ? spring.snappy : { duration: 0 }} />
      )}
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button key={o.value} type="button" data-key={o.value} className="ui-seg-o" title={o.title}
            {...(role === "tablist" ? { role: "tab", "aria-selected": on } : { "aria-pressed": on })}
            tabIndex={on ? 0 : -1} onClick={() => onChange(o.value)}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// ================================================================================================ tabs ==

export interface TabItem<V extends string> { value: V; label: ReactNode; count?: number | null; title?: string; className?: string }
export function Tabs<V extends string>({ items, value, onChange, label, className }: {
  items: TabItem<V>[]; value: V; onChange: (v: V) => void; label: string; className?: string;
}) {
  const { ref, box, animateNow } = useIndicator<HTMLDivElement>(value, [items.length, items.map((i) => i.count).join(",")]);
  return (
    <div ref={ref} className={cx("ui-tabs", className)} role="tablist" aria-label={label}>
      {items.map((t) => (
        <button key={t.value} type="button" role="tab" aria-selected={t.value === value} data-key={t.value} title={t.title}
          className={cx("ui-tab", t.className)} onClick={() => onChange(t.value)}>
          {t.label}{t.count != null && <span className="ui-tab-n">{t.count.toLocaleString("en-IN")}</span>}
        </button>
      ))}
      {box && (
        <motion.span className="ui-tab-bar" aria-hidden="true" initial={false} style={{ left: 0, right: "auto" }}
          animate={{ x: box.x + 8, width: Math.max(0, box.w - 16) }} transition={animateNow ? spring.snappy : { duration: 0 }} />
      )}
    </div>
  );
}

// ========================================================================================= chips, pills ==

export type Tone = "accent" | "ai" | "live" | "critical" | "high" | "medium" | "ok" | "neutral";
export function Chip({ tone = "neutral", pill, lg, icon, children, title, className }: {
  tone?: Tone; pill?: boolean; lg?: boolean; icon?: ReactNode; children: ReactNode; title?: string; className?: string;
}) {
  return <span className={cx("ui-chip", pill && "pill", lg && "lg", className)} data-tone={tone} title={title}>{icon}{children}</span>;
}

export function FilterChip({ children, onRemove, removeLabel = "Remove filter" }: { children: ReactNode; onRemove: () => void; removeLabel?: string }) {
  return (
    <motion.span className="ui-fchip" layout="position" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}
      transition={{ duration: T.fast }}>
      {children}
      <button type="button" onClick={onRemove} aria-label={removeLabel}><X aria-hidden="true" /></button>
    </motion.span>
  );
}

/** Citizen complaint statuses (7) and the officer stages (6), each with its colour and icon. */
const STATUS: Record<string, { tone: Tone; ic: typeof Check; label?: string }> = {
  "Complaint Filed": { tone: "accent", ic: FileCheck2 },
  "Pending Approval": { tone: "medium", ic: Hourglass },
  "Approved by Department Officer": { tone: "accent", ic: ShieldCheck },
  "In Progress": { tone: "high", ic: Wrench },
  "Completed - Pending Collector Verification": { tone: "live", ic: Clock3, label: "Awaiting Collector" },
  "Verified by Collector": { tone: "ok", ic: CheckCircle2 },
  Rejected: { tone: "critical", ic: XCircle },
  // officer stages
  new: { tone: "accent", ic: Inbox, label: "New" },
  approved: { tone: "high", ic: Wrench, label: "In action" },
  action: { tone: "high", ic: Wrench, label: "In action" },
  sent: { tone: "live", ic: Send, label: "Sent to Collector" },
  verified: { tone: "ok", ic: CheckCircle2, label: "Verified" },
  closed: { tone: "neutral", ic: Check, label: "Closed" },
  returned: { tone: "high", ic: RotateCcw, label: "Returned" }
};
export function StatusPill({ status, short }: { status: string; short?: boolean }) {
  const s = STATUS[status] ?? { tone: "neutral" as Tone, ic: CircleAlert };
  const Ic = s.ic;
  return (
    <span className="ui-pill" data-tone={s.tone} title={status}>
      {/* officer stages are keys ("sent"): always their label; citizen statuses read in full unless `short` */}
      <Ic aria-hidden="true" />{s.label && (short || /^[a-z]+$/.test(status)) ? s.label : status}
    </span>
  );
}

const SEV_TONE: Record<string, Tone> = { severe: "critical", critical: "critical", high: "high", medium: "medium", low: "neutral" };
export function SeverityBadge({ s, label }: { s: string; label?: ReactNode }) {
  return <span className="ui-sev" data-tone={SEV_TONE[String(s).toLowerCase()] ?? "neutral"}><i aria-hidden="true" />{label ?? s}</span>;
}

export function LiveDot({ state = "ok", label }: { state?: "ok" | "warn" | "off"; label?: string }) {
  return <span className={cx("ui-live", state !== "ok" && state)} role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true} />;
}

export function Avatar({ name, src, lg }: { name: string; src?: string | null; lg?: boolean }) {
  const ini = name.split(/[\s.@_-]+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "?";
  return <span className={cx("ui-avatar", lg && "lg")} aria-hidden="true">{src ? <img src={src} alt="" /> : ini}</span>;
}

// =============================================================================================== cards ==

export function Card({ children, className, pad, roomy, hover, style, as: As = "section" }: {
  children: ReactNode; className?: string; pad?: boolean; roomy?: boolean; hover?: boolean; style?: CSSProperties; as?: "section" | "div" | "article";
}) {
  return <As className={cx("ui-card", pad && "pad", roomy && "roomy", hover && "hover", className)} style={style}>{children}</As>;
}

export function CardHeader({ icon, tone = "accent", title, subtitle, count, onMore, moreLabel = "See all", children }: {
  icon?: ReactNode; tone?: Tone; title: ReactNode; subtitle?: ReactNode; count?: number | null; onMore?: () => void; moreLabel?: string; children?: ReactNode;
}) {
  return (
    <header className="ui-ch">
      {icon && <span className="ui-ch-ic" data-tone={tone} aria-hidden="true">{icon}</span>}
      <div className="ui-ch-t"><h3>{title}</h3>{subtitle && <small>{subtitle}</small>}</div>
      <div className="ui-ch-r">
        {count != null && <span className="ui-count">{count.toLocaleString("en-IN")}</span>}
        {children}
        {onMore && <button type="button" className="ui-more" onClick={onMore}>{moreLabel}<ChevronRight aria-hidden="true" /></button>}
      </div>
    </header>
  );
}

// ============================================================================================= numbers ==

/** Count-up number: rolls to a new value over 900ms (jumps under reduced motion); `flash` tints it azure for 1s on change. */
export function CountUp({ value, dec = 0, flash, className, duration = 900 }: { value: number; dec?: number; flash?: boolean; className?: string; duration?: number }) {
  const [shown, setShown] = useState(value);
  const [lit, setLit] = useState(false);
  const from = useRef(value);
  const mounted = useRef(false);
  const prev = useRef(value);
  useEffect(() => {
    if (!flash || prev.current === value) return;
    prev.current = value;
    setLit(true);
    const t = setTimeout(() => setLit(false), 1000);
    return () => clearTimeout(t);
  }, [value, flash]);
  useEffect(() => {
    const start = from.current;
    from.current = value;
    const firstRun = !mounted.current;
    mounted.current = true;
    // the first value counts up from zero (the entrance); later values roll from the previous one
    const s0 = firstRun ? 0 : start;
    if (reduced() || s0 === value) { setShown(value); return; }
    const t0 = performance.now();
    let raf = 0;
    const step = (t: number) => {
      const p = Math.min(1, (t - t0) / duration);
      const e = 1 - Math.pow(1 - p, 3);
      setShown(s0 + (value - s0) * e);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  const txt = dec ? shown.toFixed(dec) : Math.round(shown).toLocaleString("en-IN");
  return <span className={cx(className, "ui-num")} style={lit ? { background: "var(--accent-soft)", borderRadius: 4, transition: "background 1s" } : { transition: "background 1s" }}>{txt}</span>;
}

/** Sparkline: no axes, 1.5px line drawn in on load, a soft area and the last point dotted. */
export function Sparkline({ values, color = "var(--accent)", width = 84, height = 32, className }: {
  values: number[]; color?: string; width?: number; height?: number; className?: string;
}) {
  const id = `sp${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const n = values.length;
  if (n < 2) return null;
  const mx = Math.max(...values), mn = Math.min(...values);
  const x = (i: number) => 1.5 + (i * (width - 5)) / (n - 1);
  const y = (v: number) => 3 + (1 - (v - mn) / (mx - mn || 1)) * (height - 6);
  const d = values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
  return (
    <svg className={cx("ui-spark", className)} width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true" style={{ color }}>
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="currentColor" stopOpacity=".24" />
          <stop offset="1" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      <motion.path d={`${d} L${x(n - 1)} ${height} L${x(0)} ${height}Z`} fill={`url(#${id})`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: T.enter, delay: 0.3 }} />
      <motion.path d={d} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round"
        initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.8, ease: EASE_OUT }} />
      <circle cx={x(n - 1)} cy={y(values[n - 1])} r="2.6" fill="currentColor" stroke="var(--surface)" strokeWidth="1.5" />
    </svg>
  );
}

/** KPI tile: uppercase label, big mono number that counts up, a delta chip, a sparkline; optional click. */
export function KpiTile({ label, value, delta, spark, color = "var(--accent)", tip, onClick, suffix }: {
  label: string; value: number; delta?: { text: string; good: boolean | null; up?: boolean } | null; spark?: number[]; color?: string; tip?: string;
  onClick?: (el: HTMLElement) => void; suffix?: ReactNode;
}) {
  const body = (
    <>
      <span className="ui-kpi-l">{label}</span>
      <span className="ui-kpi-r">
        <span><span className="ui-kpi-n"><CountUp value={value} flash /></span>{suffix}</span>
        {spark && <Sparkline values={spark} color={color} />}
      </span>
      {delta && (
        <span className={cx("ui-delta", delta.good === true && "good", delta.good === false && "bad")}>
          {delta.up != null && (delta.up ? <ArrowUp aria-hidden="true" /> : <ArrowDown aria-hidden="true" />)}{delta.text}
        </span>
      )}
    </>
  );
  const style = { "--kc": color } as CSSProperties;
  return onClick
    ? <button type="button" className="ui-kpi btn" style={style} onClick={(e) => onClick(e.currentTarget)}><Tip text={tip}>{body}</Tip></button>
    : <div className="ui-kpi" style={style} title={tip}>{body}</div>;
}

/** Circular progress (0..1). */
export function ProgressRing({ value, size = 36, stroke = 3, color, children }: { value: number; size?: number; stroke?: number; color?: string; children?: ReactNode }) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r;
  return (
    <span style={{ position: "relative", display: "inline-grid", placeItems: "center", width: size, height: size }}>
      <svg className="ui-ring" width={size} height={size} aria-hidden="true">
        <circle className="bg" cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} />
        <motion.circle className="fg" cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} strokeDasharray={c} style={color ? { stroke: color } : undefined}
          initial={{ strokeDashoffset: c }} animate={{ strokeDashoffset: c * (1 - Math.max(0, Math.min(1, value))) }} transition={{ duration: 0.9, ease: EASE_OUT }} />
      </svg>
      {children && <span style={{ position: "absolute", font: "600 11px var(--font-num)" }}>{children}</span>}
    </span>
  );
}

// ============================================================================================= tooltip ==

/** Hover / focus tooltip after 200ms; rendered in <body> so the consoles' zoom never offsets it. */
export function Tip({ text, children, side = "top" }: { text?: ReactNode; children: ReactNode; side?: "top" | "bottom" }) {
  const [at, setAt] = useState<{ x: number; y: number; b: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const show = (el: HTMLElement) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const r = el.getBoundingClientRect();
      setAt({ x: r.left + r.width / 2, y: r.top, b: r.bottom });
    }, 200);
  };
  const hide = () => { clearTimeout(timer.current); setAt(null); };
  useEffect(() => () => clearTimeout(timer.current), []);
  if (!text) return <>{children}</>;
  return (
    <span style={{ display: "contents" }} onMouseOver={(e) => show(e.currentTarget.firstElementChild as HTMLElement ?? e.target as HTMLElement)}
      onMouseLeave={hide} onFocus={(e) => show(e.target as HTMLElement)} onBlur={hide}>
      {children}
      {at && typeof document !== "undefined" && createPortal(
        <motion.div className="ui-tip" role="tooltip" initial={{ opacity: 0, y: side === "top" ? 4 : -4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: T.fast }}
          style={{ left: Math.max(8, Math.min(window.innerWidth - 288, at.x - 140)), ...(side === "top" ? { bottom: window.innerHeight - at.y + 8 } : { top: at.b + 8 }) }}>
          {text}
        </motion.div>, document.body)}
    </span>
  );
}

// ===================================================================================== dialog & drawer ==

function useFocusTrap(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const el = ref.current;
    const focusables = () => Array.from(el?.querySelectorAll<HTMLElement>('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])') ?? []).filter((x) => !x.hasAttribute("disabled"));
    requestAnimationFrame(() => (el?.querySelector<HTMLElement>("[data-autofocus]") ?? focusables()[0] ?? el)?.focus());
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopPropagation(); onClose(); }
      if (e.key !== "Tab" || !el) return;
      const f = focusables();
      if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
    };
    document.addEventListener("keydown", onKey, true);
    return () => { document.removeEventListener("keydown", onKey, true); prev?.focus?.(); };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  return ref;
}

/** The one dialog: blurred scrim, soft spring scale .96 -> 1, Esc / scrim closes, focus trap; sizes narrow | normal | wide. */
export function Dialog({ open, onClose, title, subtitle, size = "normal", children, footer, icon, className }: {
  open: boolean; onClose: () => void; title: ReactNode; subtitle?: ReactNode; size?: "narrow" | "normal" | "wide"; children: ReactNode; footer?: ReactNode;
  icon?: ReactNode; className?: string;
}) {
  const ref = useFocusTrap(open, onClose);
  const hid = useId();
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div key="s" className="ui-scrim" variants={scrimV} initial="initial" animate="animate" exit="exit" onClick={onClose} />
          <div key="w" className="ui-dialog-wrap">
            <motion.div ref={ref} role="dialog" aria-modal="true" aria-labelledby={hid} tabIndex={-1}
              className={cx("ui-dialog", size !== "normal" && size, className)} variants={dialogV} initial="initial" animate="animate" exit="exit">
              <header className="ui-dialog-h">
                {icon}
                <div><h2 id={hid}>{title}</h2>{subtitle && <small>{subtitle}</small>}</div>
                <IconButton label="Close" ghost onClick={onClose}><X aria-hidden="true" /></IconButton>
              </header>
              <div className="ui-dialog-b">{children}</div>
              {footer && <footer className="ui-dialog-f">{footer}</footer>}
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}

/** Right-side drawer; a bottom sheet on phones (< 768px). */
export function Drawer({ open, onClose, label, children, width = 560 }: { open: boolean; onClose: () => void; label: string; children: ReactNode; width?: number }) {
  const ref = useFocusTrap(open, onClose);
  const [phone, setPhone] = useState(false);
  useEffect(() => { const f = () => setPhone(window.innerWidth < 768); f(); window.addEventListener("resize", f); return () => window.removeEventListener("resize", f); }, []);
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div key="s" className="ui-scrim" variants={scrimV} initial="initial" animate="animate" exit="exit" onClick={onClose} />
          <motion.aside key="d" ref={ref} role="dialog" aria-modal="true" aria-label={label} tabIndex={-1}
            className={phone ? "ui-sheet" : "ui-drawer"} style={phone ? undefined : { width: `min(${width}px,100%)` }}
            variants={phone ? sheetV : drawerV} initial="initial" animate="animate" exit="exit"
            {...(phone ? { drag: "y" as const, dragConstraints: { top: 0, bottom: 0 }, dragElastic: { top: 0, bottom: 0.6 }, onDragEnd: (_: unknown, i: { offset: { y: number } }) => { if (i.offset.y > 120) onClose(); } } : {})}>
            {children}
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

// ============================================================================================== toasts ==

export interface ToastItem { id: number; msg: ReactNode; kind?: "ok" | "alert"; act?: { label: string; run: () => void } }
export function useToasts() {
  const [items, setItems] = useState<ToastItem[]>([]);
  const dismiss = useCallback((id: number) => setItems((t) => t.filter((x) => x.id !== id)), []);
  const push = useCallback((msg: ReactNode, kind: "ok" | "alert" = "ok", act?: ToastItem["act"]) => {
    const id = Date.now() + Math.random();
    setItems((t) => [...t.slice(-3), { id, msg, kind, act }]);
    setTimeout(() => dismiss(id), kind === "alert" ? 7000 : 3600);
  }, [dismiss]);
  return { items, push, dismiss };
}
/** Top-right stack: slides in, swipe right to dismiss. */
export function Toaster({ items, dismiss, className }: { items: ToastItem[]; dismiss: (id: number) => void; className?: string }) {
  return (
    <div className={cx("ui-toasts", className)} role="status" aria-live="polite">
      <AnimatePresence initial={false}>
        {items.map((t) => (
          <motion.div key={t.id} layout className={cx("ui-toast", t.kind === "alert" && "alert")}
            initial={{ opacity: 0, x: 40, scale: 0.98 }} animate={{ opacity: 1, x: 0, scale: 1 }} exit={{ opacity: 0, x: 60, transition: { duration: T.fast } }}
            transition={spring.snappy} drag="x" dragConstraints={{ left: 0, right: 0 }} dragElastic={{ left: 0, right: 0.8 }}
            onDragEnd={(_, i) => { if (i.offset.x > 80) dismiss(t.id); }}>
            {t.kind === "alert" ? <Bell aria-hidden="true" /> : <CheckCircle2 aria-hidden="true" />}
            <span className="ui-toast-m">{t.msg}</span>
            {t.act && <button type="button" className="ui-toast-a" onClick={() => { t.act!.run(); dismiss(t.id); }}>{t.act.label}</button>}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

// =================================================================================== states: loading… ==

export function Skeleton({ w = "100%", h = 14, r, style, className }: { w?: number | string; h?: number | string; r?: number; style?: CSSProperties; className?: string }) {
  return <span className={cx("ui-skel", className)} aria-hidden="true" style={{ display: "block", width: w, height: h, borderRadius: r, ...style }} />;
}

export function EmptyState({ icon, children, action, tone }: { icon?: ReactNode; children: ReactNode; action?: ReactNode; tone?: "ok" | "err" }) {
  return (
    <div className={cx("ui-empty", tone)}>
      <span className="ui-empty-ic" aria-hidden="true">{icon ?? (tone === "ok" ? <Check /> : tone === "err" ? <CircleAlert /> : <Inbox />)}</span>
      <div>{children}</div>
      {action}
    </div>
  );
}

/** An inline error with the reason in plain words and a Retry button: never a blank card. */
export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <EmptyState tone="err" action={onRetry && <Button size="sm" icon={<RotateCcw aria-hidden="true" />} onClick={onRetry}>Retry</Button>}>
      {message}
    </EmptyState>
  );
}

/** A thin progress bar at the very top, shown only when loading lasts over 1.2s. */
export function TopProgress({ active }: { active: boolean }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (!active) { setShow(false); return; }
    const t = setTimeout(() => setShow(true), 1200);
    return () => clearTimeout(t);
  }, [active]);
  return (
    <AnimatePresence>
      {show && <motion.div className="ui-topbar" initial={{ scaleX: 0, opacity: 1 }} animate={{ scaleX: 0.85 }} exit={{ scaleX: 1, opacity: 0 }} transition={{ duration: 2.4, ease: EASE_OUT }} />}
    </AnimatePresence>
  );
}

// ================================================================================================ table ==

export interface Column<R> { key: string; label: ReactNode; num?: boolean; sortable?: boolean; sticky?: boolean; render?: (r: R) => ReactNode; value?: (r: R) => number | string; width?: number | string }
/** Sticky header, optional sticky first column, row hover, sortable headers. */
export function DataTable<R>({ columns, rows, rowKey, onRow, initialSort, maxHeight, empty }: {
  columns: Column<R>[]; rows: R[]; rowKey: (r: R, i: number) => string | number; onRow?: (r: R) => void;
  initialSort?: { key: string; dir: 1 | -1 }; maxHeight?: number | string; empty?: ReactNode;
}) {
  const [sort, setSort] = useState(initialSort ?? null);
  const sorted = useMemo(() => {
    if (!sort) return rows;
    const c = columns.find((x) => x.key === sort.key);
    const val = c?.value ?? ((r: R) => (r as Record<string, unknown>)[sort.key] as number | string);
    return [...rows].sort((a, b) => {
      const va = val(a), vb = val(b);
      return (typeof va === "number" && typeof vb === "number" ? va - vb : String(va ?? "").localeCompare(String(vb ?? ""))) * sort.dir;
    });
  }, [rows, sort, columns]);
  return (
    <div className="ui-table-wrap" style={{ maxHeight }}>
      <table className="ui-table">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} className={cx(c.num && "num", c.sortable && "sort", c.sticky && "stick")} style={{ width: c.width }}
                aria-sort={sort?.key === c.key ? (sort.dir === 1 ? "ascending" : "descending") : undefined}
                onClick={c.sortable ? () => setSort((s) => (s?.key === c.key ? { key: c.key, dir: (s.dir * -1) as 1 | -1 } : { key: c.key, dir: c.num ? -1 : 1 })) : undefined}>
                {c.label}{c.sortable && <ChevronDown className="ui-sort" width={12} height={12} aria-hidden="true" />}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r, i) => (
            <tr key={rowKey(r, i)} className={onRow ? "click" : undefined} onClick={onRow ? () => onRow(r) : undefined}
              tabIndex={onRow ? 0 : undefined} onKeyDown={onRow ? (e) => { if (e.key === "Enter") onRow(r); } : undefined}>
              {columns.map((c) => (
                <td key={c.key} className={cx(c.num && "num", c.sticky && "stick")}>{c.render ? c.render(r) : String((r as Record<string, unknown>)[c.key] ?? "")}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length && (empty ?? <EmptyState>Nothing to show.</EmptyState>)}
    </div>
  );
}

// ============================================================================ timeline, stepper, OTP ==

export interface TimelineItem { state: "done" | "now" | "todo" | "bad"; title: ReactNode; time?: ReactNode; body?: ReactNode; icon?: ReactNode }
export function Timeline({ items }: { items: TimelineItem[] }) {
  return (
    <ol className="ui-tl">
      {items.map((it, i) => (
        <motion.li key={i} className={cx("ui-tl-i", it.state)} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: T.base, delay: i * 0.05, ease: EASE_OUT }}>
          <span className="ui-tl-dot" aria-hidden="true">
            {it.icon ?? (it.state === "done" ? <Check /> : it.state === "bad" ? <X /> : null)}
            {it.state === "now" && (
              <motion.span style={{ position: "absolute", inset: -2, borderRadius: "50%", border: "2px solid var(--accent)" }}
                initial={{ scale: 1, opacity: 0.8 }} animate={{ scale: 1.9, opacity: 0 }} transition={{ duration: 1.2, ease: "easeOut" }} />
            )}
          </span>
          <div className="ui-tl-b">
            <b>{it.title}</b>{it.time && <time>{it.time}</time>}{it.body && <p>{it.body}</p>}
          </div>
        </motion.li>
      ))}
    </ol>
  );
}

/** Numbered steps; the line between steps fills (scaleX, 400ms); completed steps show a check and are clickable. */
export function Stepper({ steps, current, onStep }: { steps: string[]; current: number; onStep?: (i: number) => void }) {
  return (
    <ol className="ui-steps" aria-label="Progress">
      {steps.map((s, i) => {
        const st = i < current ? "done" : i === current ? "now" : "todo";
        const Num = st === "done" && onStep ? "button" : "span";
        return (
          <li key={s} className={cx("ui-step", st)} aria-current={st === "now" ? "step" : undefined}>
            <Num className="ui-step-n" {...(Num === "button" ? { type: "button" as const, onClick: () => onStep!(i), "aria-label": `Back to step ${i + 1}: ${s}` } : {})}>
              {st === "done" ? <Check aria-hidden="true" /> : i + 1}
            </Num>
            {i < steps.length - 1 && (
              <motion.span className="ui-step-bar" aria-hidden="true" initial={false} animate={{ scaleX: i < current ? 1 : 0 }} transition={{ duration: 0.4, ease: EASE_OUT }} />
            )}
            <span className="ui-step-l">{s}</span>
          </li>
        );
      })}
    </ol>
  );
}

/** One box per digit: auto-advance, backspace goes back, paste fills all. */
export function OtpInput({ value, onChange, length = 6, autoFocus, label = "One-time code", disabled }: {
  value: string; onChange: (v: string) => void; length?: number; autoFocus?: boolean; label?: string; disabled?: boolean;
}) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const digits = Array.from({ length }, (_, i) => value[i] ?? "");
  const set = (i: number, d: string) => {
    const next = digits.slice();
    next[i] = d;
    onChange(next.join("").replace(/\s/g, "").slice(0, length));
  };
  return (
    <div className="ui-otp" role="group" aria-label={label}>
      {digits.map((d, i) => (
        <input key={i} ref={(el) => { refs.current[i] = el; }} className={cx("ui-otp-c", d && "fill")} inputMode="numeric" autoComplete={i === 0 ? "one-time-code" : "off"}
          maxLength={1} value={d} disabled={disabled} autoFocus={autoFocus && i === 0} aria-label={`Digit ${i + 1}`}
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, "");
            if (!v) return set(i, "");
            set(i, v[v.length - 1]);
            refs.current[i + 1]?.focus();
          }}
          onKeyDown={(e) => {
            if (e.key === "Backspace" && !digits[i] && i > 0) { refs.current[i - 1]?.focus(); set(i - 1, ""); e.preventDefault(); }
            if (e.key === "ArrowLeft" && i > 0) refs.current[i - 1]?.focus();
            if (e.key === "ArrowRight" && i < length - 1) refs.current[i + 1]?.focus();
          }}
          onPaste={(e) => {
            const p = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, length);
            if (!p) return;
            e.preventDefault();
            onChange(p);
            refs.current[Math.min(p.length, length - 1)]?.focus();
          }} />
      ))}
    </div>
  );
}

/** A ring that counts down `seconds` (e.g. the OTP resend timer). */
export function CountdownRing({ seconds, onDone, size = 28 }: { seconds: number; onDone?: () => void; size?: number }) {
  const [left, setLeft] = useState(seconds);
  useEffect(() => {
    setLeft(seconds);
    if (seconds <= 0) return;
    const t = setInterval(() => setLeft((s) => { if (s <= 1) { clearInterval(t); onDone?.(); return 0; } return s - 1; }), 1000);
    return () => clearInterval(t);
  }, [seconds]); // eslint-disable-line react-hooks/exhaustive-deps
  return <ProgressRing value={seconds ? left / seconds : 0} size={size}>{left}</ProgressRing>;
}

// ============================================================================================ dropzone ==

export function Dropzone({ onFiles, accept, multiple = true, children, disabled }: {
  onFiles: (files: File[]) => void; accept?: string; multiple?: boolean; children?: ReactNode; disabled?: boolean;
}) {
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className={cx("ui-drop", over && "over")} role="button" tabIndex={disabled ? -1 : 0} aria-disabled={disabled}
      onClick={() => !disabled && input.current?.click()}
      onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && !disabled) { e.preventDefault(); input.current?.click(); } }}
      onDragOver={(e) => { e.preventDefault(); if (!disabled) setOver(true); }} onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); if (!disabled && e.dataTransfer.files.length) onFiles(Array.from(e.dataTransfer.files)); }}>
      <span className="ui-drop-ic" aria-hidden="true"><Upload /></span>
      {children ?? <span><b>Choose files</b> or drag them here</span>}
      <input ref={input} type="file" hidden accept={accept} multiple={multiple} disabled={disabled}
        onChange={(e) => { if (e.target.files?.length) onFiles(Array.from(e.target.files)); e.target.value = ""; }} />
    </div>
  );
}

// ====================================================================================== celebrations ==

/** A check that draws itself (circle, then tick). */
export function SuccessCheck({ size = 72, color = "var(--ok)" }: { size?: number; color?: string }) {
  return (
    <svg className="ui-check" width={size} height={size} viewBox="0 0 52 52" aria-hidden="true">
      <motion.circle cx="26" cy="26" r="23" stroke={color} strokeWidth="2.5" initial={{ pathLength: 0, opacity: 0 }} animate={{ pathLength: 1, opacity: 1 }}
        transition={{ duration: 0.6, ease: EASE_OUT }} />
      <motion.path d="M15 27l7 7 15-16" stroke={color} strokeWidth="3.5" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }}
        transition={{ duration: 0.4, delay: 0.45, ease: EASE_OUT }} />
    </svg>
  );
}

/** 12 particles in brand colours, once (skipped under reduced motion). */
export function Confetti() {
  const [on] = useState(() => !reduced());
  if (!on) return null;
  const cols = ["#0B7290", "#18A7BC", "#FF7A5C", "#F2C94C", "#34D399", "#7FD3E6"];
  return (
    <span className="ui-confetti" aria-hidden="true">
      {Array.from({ length: 12 }, (_, i) => {
        const a = (i / 12) * Math.PI * 2 + (i % 2 ? 0.2 : -0.1);
        const d = 70 + (i % 3) * 22;
        return (
          <motion.i key={i} style={{ background: cols[i % cols.length] }} initial={{ x: 0, y: 0, opacity: 1, rotate: 0, scale: 1 }}
            animate={{ x: Math.cos(a) * d, y: Math.sin(a) * d + 30, opacity: 0, rotate: 180 + i * 30, scale: 0.6 }}
            transition={{ duration: 1.1, ease: EASE_OUT, delay: 0.25 }} />
        );
      })}
    </span>
  );
}

/** Rolls a code in digit by digit (e.g. the new complaint code). */
export function RollingText({ text, delay = 0.2 }: { text: string; delay?: number }) {
  return (
    <span aria-label={text} style={{ display: "inline-flex", overflow: "hidden" }}>
      {text.split("").map((ch, i) => (
        <motion.span key={i} aria-hidden="true" initial={{ y: "100%", opacity: 0 }} animate={{ y: "0%", opacity: 1 }}
          transition={{ duration: T.base, delay: delay + i * 0.035, ease: EASE_OUT }} style={{ display: "inline-block", whiteSpace: "pre" }}>
          {ch}
        </motion.span>
      ))}
    </span>
  );
}
