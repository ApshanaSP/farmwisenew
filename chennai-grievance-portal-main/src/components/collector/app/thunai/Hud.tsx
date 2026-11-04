"use client";
/**
 * The HUD: what Jarvis mode looks like over the console. Everything on it comes from hudstore.ts, which only real events write
 * to. The console stays visible and usable beneath: only the HUD's own controls take clicks. There is no film artwork here and no
 * logo: a near-black layer, one electric cyan, one amber for warnings, thin technical lines, tabular numerals.
 *
 * Motion is transform and opacity only, and the canvas stops when the tab is hidden. Tamil is never letter-spaced, split, or
 * animated per glyph: whole lines fade. prefers-reduced-motion gives static rings, a plain level bar and no power-on.
 */
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode, type RefObject } from "react";
import { drawCore, drawStill } from "./hudcore";
import { coreOf, hud, type CoreState, type HudPanel, type WorkStep } from "./hudstore";
import { voiceLevel } from "./mouth";
import { Reticle } from "./mapbridge";
import "./hud.css";

export interface HudProps {
  lang: "en" | "ta";
  coreRef: RefObject<HTMLSpanElement>;
  /** a Stage screen is open: the core stays docked, the rails fold into the top band */
  stageOpen: boolean;
  /** the questions and the approval tray that wait on the Collector */
  children?: ReactNode;
  onSend: (text: string) => void;
  onStop: () => void;
  onDismissFirstUse: () => void;
}

const reducedMotion = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
const STATE_WORD: Record<CoreState, { en: string; ta: string }> = {
  off: { en: "Off", ta: "அணைப்பு" }, idle: { en: "Muted", ta: "மௌனம்" }, listening: { en: "Listening", ta: "கேட்கிறேன்" }, hearing: { en: "Hearing", ta: "கேட்கிறேன்" }, thinking: { en: "Thinking", ta: "யோசிக்கிறேன்" },
  speaking: { en: "Speaking", ta: "பேசுகிறேன்" }, holding: { en: "Holding", ta: "காத்திருக்கிறேன்" }, interrupted: { en: "Stopped", ta: "நிறுத்தினேன்" }, offline: { en: "Offline", ta: "இணைப்பு இல்லை" }
};

/** The core: the canvas loop, its size by state (transform only), SVG rings for the dial. */
function Core({ state, stageOpen, anchor }: { state: CoreState; stageOpen: boolean; anchor: RefObject<HTMLSpanElement> }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef(state);
  const since = useRef(0);
  const [still] = useState(reducedMotion);
  if (stateRef.current !== state) { stateRef.current = state; since.current = performance.now(); }
  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1), size = 240;
    c.width = c.height = size * dpr;
    const g = c.getContext("2d", { alpha: true })!;
    if (still) { drawStill(g, size, dpr, stateRef.current); return; }
    let raf = 0;
    let smooth = 0;
    const frame = (t: number) => {
      raf = 0;
      if (document.hidden) return;
      smooth += (hud.level() - smooth) * 0.35;
      drawCore(g, size, dpr, { state: stateRef.current, t, mic: smooth, voice: voiceLevel(t), since: since.current });
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    const vis = () => { if (!document.hidden && !raf) raf = requestAnimationFrame(frame); };
    document.addEventListener("visibilitychange", vis);
    return () => { if (raf) cancelAnimationFrame(raf); document.removeEventListener("visibilitychange", vis); };
  }, [still]);
  useEffect(() => {
    if (!still || !canvas.current) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    drawStill(canvas.current.getContext("2d")!, 240, dpr, state);
  }, [state, still]);
  const big = !stageOpen && (state === "speaking" || state === "thinking");
  return (
    <div className={`hud-core${big ? " big" : ""}`} data-state={state} aria-hidden="true">
      <span ref={anchor} className="hud-anchor" />
      <svg className="hud-dial" viewBox="-120 -120 240 240">
        <circle r="116" />
        <g className="hud-ticks">{Array.from({ length: 36 }, (_, i) => <line key={i} x1="0" y1="-116" x2="0" y2={i % 3 ? "-111" : "-106"} transform={`rotate(${i * 10})`} />)}</g>
      </svg>
      <canvas ref={canvas} className="hud-canvas" />
    </div>
  );
}

/** A number that counts up to the value code gave it. Whole digits in a tabular face; with reduced motion, it just arrives. */
function CountUp({ value }: { value: number }) {
  const [shown, setShown] = useState(reducedMotion() ? value : 0);
  useEffect(() => {
    if (reducedMotion()) { setShown(value); return; }
    let raf = 0;
    const t0 = performance.now();
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / 650);
      const e = 1 - (1 - k) ** 3;
      setShown(value * e);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  const whole = Number.isInteger(value);
  return <>{(whole ? Math.round(shown) : Math.round(shown * 10) / 10).toLocaleString("en-IN")}</>;
}

/** An answer as an angular glass panel, arriving from the core. */
function Panel({ p, lang }: { p: HudPanel; lang: "en" | "ta" }) {
  const el = useRef<HTMLElement>(null);
  useEffect(() => {
    const e = el.current, core = document.querySelector(".hud-core");
    if (!e || !core || reducedMotion()) return;
    const a = core.getBoundingClientRect(), b = e.getBoundingClientRect();
    e.animate(
      [{ transform: `translate(${a.left + a.width / 2 - b.left - b.width / 2}px, ${a.top + a.height / 2 - b.top - b.height / 2}px) scale(.2)`, opacity: 0 }, { transform: "none", opacity: 1 }],
      { duration: 420, easing: "cubic-bezier(.16,1,.3,1)" }
    );
  }, []);
  return (
    <article ref={el} className="hud-panel" lang={lang}>
      <h3>{p.title}</h3>
      {p.takeaway && <p>{p.takeaway}</p>}
      {p.figures.length > 0 && (
        <dl>{p.figures.map((f, i) => <div key={i}><dt>{f.label}</dt><dd><CountUp value={f.value} />{f.unit ? <small> {f.unit}</small> : null}</dd></div>)}</dl>
      )}
      {p.source && <footer>{lang === "ta" ? "ஆதாரம்" : "Source"}: {p.source}</footer>}
    </article>
  );
}

function Timeline({ steps, lang }: { steps: WorkStep[]; lang: "en" | "ta" }) {
  if (!steps.length) return null;
  return (
    <ol className="hud-steps" lang={lang} aria-label={lang === "ta" ? "செயல்கள்" : "Work"}>
      {steps.map((s) => (
        <li key={s.id} className={s.state}>
          <i aria-hidden="true" />
          <span>{s.label}</span>
          {s.ms != null && s.ms > 0 && <time>{s.ms >= 1000 ? `${(s.ms / 1000).toFixed(1)} s` : `${s.ms} ms`}</time>}
        </li>
      ))}
    </ol>
  );
}

export default function Hud({ lang, coreRef, stageOpen, children, onSend, onStop, onDismissFirstUse }: HudProps) {
  const s = useSyncExternalStore(hud.subscribe, hud.get, hud.get);
  const [typing, setTyping] = useState(false);
  const [text, setText] = useState("");
  const ta = lang === "ta";
  const [powered, setPowered] = useState(() => {
    if (reducedMotion()) return true;
    try { return sessionStorage.getItem("jarvis-powered") === "1"; } catch { return true; }
  });
  // the power-on: 1.2 s, once a session, skippable by any click or key
  useEffect(() => {
    if (powered) return;
    try { sessionStorage.setItem("jarvis-powered", "1"); } catch { /* it plays again: harmless */ }
    const done = () => setPowered(true);
    const t = setTimeout(done, 1200);
    window.addEventListener("pointerdown", done, { once: true, capture: true });
    window.addEventListener("keydown", done, { once: true, capture: true });
    return () => { clearTimeout(t); window.removeEventListener("pointerdown", done, { capture: true }); window.removeEventListener("keydown", done, { capture: true }); };
  }, [powered]);
  // for screen readers: the answer, whole, half a second after it settles; never the partials
  const [said, setSaid] = useState("");
  useEffect(() => { const t = setTimeout(() => setSaid(s.answer), 500); return () => clearTimeout(t); }, [s.answer]);
  const level = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!reducedMotion()) return;
    const t = setInterval(() => { if (level.current) level.current.style.transform = `scaleX(${hud.level().toFixed(2)})`; }, 120);
    return () => clearInterval(t);
  }, []);
  const word = STATE_WORD[s.core]?.[lang] ?? "";
  const strip = s.strip;
  return (
    <div className={`hud${stageOpen ? " with-stage" : ""}${powered ? "" : " powering"}`} data-core={s.core} data-testid="hud" data-no-i18n>
      <div className="hud-veil" aria-hidden="true" />
      <div className="hud-top">
        <Core state={s.core} stageOpen={stageOpen} anchor={coreRef} />
        <div className="hud-under">
          <div className="hud-state" lang={lang}>{word}</div>
          {reducedMotion() && <span className="hud-levelbar" aria-hidden="true"><span ref={level} /></span>}
          <div className="hud-ribbon" lang={s.ribbon && /[஀-௿]/.test(s.ribbon) ? "ta" : "en"} data-testid="ribbon">{s.ribbon}</div>
          {s.faint && <div className="hud-faint" data-testid="faint">{s.faint}</div>}
          {s.answer && !stageOpen && <div className="hud-answer" lang={/[஀-௿]/.test(s.answer) ? "ta" : "en"} data-testid="answer">{s.answer}</div>}
          {s.notice && <div className="hud-notice" role="status" lang={lang}>{s.notice}</div>}
          {s.needsResume && <div className="hud-notice" lang={lang}>{ta ? "தொடர கிளிக் செய்யுங்கள்" : "Click to resume"}</div>}
          {strip.budgetLow && <div className="hud-notice warn" lang={lang}>{ta ? "கேட்கும் வரம்பு நெருங்கிவிட்டது: முதலில் \"ஜார்விஸ்\" என்று சொல்லுங்கள்" : "The listening budget is low: say Jarvis first"}</div>}
        </div>
      </div>
      <aside className="hud-rail left"><Timeline steps={s.steps} lang={lang} /></aside>
      {!stageOpen && <aside className="hud-rail right">{s.panels.map((p) => <Panel key={p.id} p={p} lang={lang} />)}</aside>}
      <div className="hud-cards" lang={lang}>{children}</div>
      {s.firstUse && (
        <div className="hud-first" role="dialog" aria-label={ta ? "முதல் பயன்பாடு" : "First use"} lang={lang}>
          <p>{ta ? "ஜார்விஸ் பயன்முறையில் இந்த அறையில் பேசுவது எழுத்தாக மாற்றும் சேவைகளுக்கு அனுப்பப்படும்; சேமிக்கப்படாது. அறையில் உள்ள யார் சொன்னாலும் கேட்கும்." : "In Jarvis mode, speech in this room is sent to transcription services and not stored. It obeys anyone in the room: it cannot tell voices apart."}</p>
          <button onClick={onDismissFirstUse}>{ta ? "புரிந்தது" : "Understood"}</button>
        </div>
      )}
      <footer className="hud-strip" aria-label={ta ? "அமைப்பு" : "System"}>
        <span><b>{ta ? "கடைசி" : "Last turn"}</b>{strip.lastMs != null ? ` ${(strip.lastMs / 1000).toFixed(1)} s` : " --"}</span>
        <span><b>{ta ? "ஒப்புகை" : "Ack"}</b>{strip.ackMs != null ? ` ${(strip.ackMs / 1000).toFixed(1)} s` : " --"}</span>
        <span><b>{ta ? "மாடல்" : "Model"}</b> {strip.provider ? strip.provider.replace(/^.*\//, "") : ta ? "விதிகள்" : "rules"}</span>
        <span><b>{ta ? "குரல்" : "Voice"}</b> {strip.path ?? "--"}</span>
        <span><b>{ta ? "தரவு" : "Data as of"}</b> {strip.freshness ?? "--"}</span>
        <span className={strip.budgetLow ? "warn" : ""}><b>{ta ? "கேட்பு" : "Listening"}</b> {strip.ambient}/8 {ta ? "நிமிடம்" : "a min"}</span>
        {strip.tokens != null && strip.tokens > 0 && <span><b>{ta ? "டோக்கன்கள்" : "Tokens"}</b> {strip.tokens.toLocaleString("en-IN")}</span>}
        <span className="hud-spacer" />
        <button className="hud-btn" onClick={onStop} aria-label={ta ? "நிறுத்து (Esc)" : "Stop (Esc)"} title="Esc">Esc</button>
        <button className="hud-btn" onClick={() => setTyping((v) => !v)} aria-label={ta ? "தட்டச்சு" : "Type instead"} aria-expanded={typing}>⌨</button>
      </footer>
      {typing && (
        <form className="hud-compose" onSubmit={(e) => { e.preventDefault(); const t = text.trim(); if (t) { setText(""); setTyping(false); onSend(t); } }}>
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder={ta ? "தட்டச்சு செய்யுங்கள்…" : "Type a request…"} autoFocus aria-label={ta ? "கேள்வி" : "Request"} lang={lang} />
        </form>
      )}
      <Reticle />
      <div className="hud-live" aria-live="polite" lang={lang}>{said}</div>
    </div>
  );
}

export { coreOf };
