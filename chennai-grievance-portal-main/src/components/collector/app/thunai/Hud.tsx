"use client";
/**
 * Jarvis on the console: the light-blue core and one bar at the bottom of the screen, in the console's own theme. The bar says
 * what Jarvis is doing and whether it needs its name, and holds every control in words: Stop talking, Mute, Type, Close Jarvis.
 * The latest answer sits in one card in the corner, with its question and key figures; earlier ones go to the chatbot's Jarvis
 * tab, so nothing stacks over the dashboard. Everything here comes from hudstore.ts, which only real events write to, and the
 * console stays usable beneath: only the HUD's own controls take clicks.
 *
 * Motion is transform and opacity only, and the canvas stops when the tab is hidden. Tamil is never letter-spaced, split, or
 * animated per glyph: whole lines fade. prefers-reduced-motion gives static rings, a plain level bar and no power-on.
 */
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode, type RefObject } from "react";
import { drawCore, drawStill } from "./hudcore";
import { coreOf, hud, micOpen, powerOnDue, statusOf, type CoreState, type HudPanel } from "./hudstore";
import { voiceLevel } from "./mouth";
import { Reticle } from "./mapbridge";
import { CountUp } from "./countup";
import { I } from "../icons";
import "./hud.css";

export interface HudProps {
  lang: "en" | "ta";
  coreRef: RefObject<HTMLSpanElement>;
  /** a Stage screen is open: the core docks inside the bar */
  stageOpen: boolean;
  /** the questions and the approval tray that wait on the Collector */
  children?: ReactNode;
  onSend: (text: string) => void;
  /** stop what Jarvis is saying or working on */
  onStop: () => void;
  /** mute or unmute the microphone */
  onMute?: () => void;
  /** Jarvis closes, and the console is as it was */
  onClose?: () => void;
  onDismissFirstUse: () => void;
}

const reducedMotion = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
const isTa = (t: string) => /[஀-௿]/.test(t);

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
  const big = !stageOpen && (state === "speaking" || state === "thinking" || state === "hearing");
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

/** The latest answer, in one card in the corner: the question, the words, the key figures, and the screen to open again. */
function AnswerCorner({ asked, answer, p, lang }: { asked: string; answer: string; p: HudPanel | null; lang: "en" | "ta" }) {
  const ta = lang === "ta";
  const open = () => { if (p?.slots) window.dispatchEvent(new CustomEvent("jarvis:open-pin", { detail: { recipe: p.recipe, slots: p.slots, title: p.title } })); };
  return (
    <article className="hud-ans" lang={lang} data-testid="answer">
      <header>
        <small><I n="mic" />{ta ? "நீங்கள் கேட்டது" : "You asked"}</small>
        <button className="hud-x" onClick={() => hud.set({ answer: "", panels: [], asked: "" })} aria-label={ta ? "இந்தப் பதிலை மூடு" : "Close this answer"} title={ta ? "மூடு" : "Close"}><I n="x" /></button>
      </header>
      {asked && <p className="hud-q" lang={isTa(asked) ? "ta" : "en"}>{asked}</p>}
      {p?.title && <h3>{p.title}</h3>}
      {answer && <p className="hud-a" lang={isTa(answer) ? "ta" : "en"}>{answer}</p>}
      {p && p.figures.length > 0 && (
        <dl>{p.figures.map((f, i) => <div key={i}><dt>{f.label}</dt><dd><CountUp value={f.value} />{f.unit ? <small> {f.unit}</small> : null}</dd></div>)}</dl>
      )}
      {/* a source the Collector would recognise; the data's own table names (change_drivers) are not */}
      {p?.source && !/^[a-z0-9_]+$/.test(p.source) && <footer>{ta ? "ஆதாரம்" : "Source"}: {p.source}</footer>}
      <div className="hud-ans-acts">
        {p?.slots && <button onClick={open}><I n="expand" />{ta ? "முழுத் திரையில் பார்" : "Open full screen"}</button>}
        <button data-jq-toggle onClick={() => window.dispatchEvent(new CustomEvent("jarvis:questions"))}><I n="clock" />{ta ? "முந்தைய கேள்விகள்" : "Earlier questions"}</button>
      </div>
    </article>
  );
}

export default function Hud({ lang, coreRef, stageOpen, children, onSend, onStop, onMute, onClose, onDismissFirstUse }: HudProps) {
  const s = useSyncExternalStore(hud.subscribe, hud.get, hud.get);
  const [text, setText] = useState("");
  const ta = lang === "ta";
  const typing = s.typing;
  const setTyping = (v: boolean) => hud.set({ typing: v });
  // the power-on: 1.2 s, once a session, never repeated; never with reduced motion; any click or key skips it
  const [powered, setPowered] = useState(() => { try { return !powerOnDue(reducedMotion(), sessionStorage.getItem("jarvis-powered")); } catch { return true; } });
  // written with reduced motion too: the power-on's tone reads this flag
  useEffect(() => { try { sessionStorage.setItem("jarvis-powered", "1"); } catch { /* it plays again: harmless */ } }, []);
  useEffect(() => {
    if (powered) return;
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
  // the line changes by itself when the time without its name runs out
  const [now, setNow] = useState(0);
  useEffect(() => {
    setNow(Date.now());
    if (!s.engagedUntil) return;
    const t = setTimeout(() => setNow(Date.now()), Math.max(0, s.engagedUntil - Date.now()) + 50);
    return () => clearTimeout(t);
  }, [s.engagedUntil, s.core]);
  const { word, hint } = statusOf(s, ta, now);
  const muted = s.mode === "muted";
  // what was said shows while it is being heard and worked on; after that, it is in the answer's card
  const showWords = !!s.ribbon && (s.core === "hearing" || s.core === "thinking");
  const line = showWords ? (s.ribbon.length > 130 ? `…${s.ribbon.slice(-130)}` : s.ribbon) : "";
  const panel = s.panels[0] ?? null;
  return (
    <div className={`hud${stageOpen ? " with-stage" : ""}${powered ? "" : " powering"}`} data-core={s.core} data-testid="hud" data-no-i18n lang={lang}>
      {!stageOpen && (s.answer || panel) && <AnswerCorner asked={s.asked} answer={s.answer} p={panel} lang={lang} />}
      <div className="hud-dock">
        <div className="hud-cards" lang={lang}>{children}</div>
        <Core state={s.core} stageOpen={stageOpen} anchor={coreRef} />
        <section className="hud-bar" aria-label={ta ? "ஜார்விஸ்" : "Jarvis"}>
          <div className="hud-read">
            <div className="hud-state" lang={lang} data-testid="state">
              {micOpen(s) ? <span className="hud-mic"><i aria-hidden="true" /></span> : null}
              <b>{word}</b>
              {hint && !showWords && <span className="hud-hint">{hint}</span>}
            </div>
            {reducedMotion() && <span className="hud-levelbar" aria-hidden="true"><span ref={level} /></span>}
            {showWords && <div className="hud-ribbon" lang={isTa(s.ribbon) ? "ta" : "en"} data-testid="ribbon">{line}</div>}
            {!showWords && <div data-testid="ribbon" hidden>{s.ribbon}</div>}
            {s.core === "thinking" && hint && showWords && <div className="hud-hint">{hint}</div>}
            {s.faint && <div className="hud-faint" data-testid="faint">{s.faint}</div>}
            {s.notice && <div className="hud-notice" role="status" lang={lang}>{s.notice}</div>}
            {s.needsResume && <div className="hud-notice" lang={lang}>{ta ? "குரலைக் கேட்க எங்காவது கிளிக் செய்யுங்கள்" : "Click anywhere to hear the voice"}</div>}
            {s.strip.budgetLow && <div className="hud-notice warn" lang={lang}>{ta ? "கொஞ்சம் பொறுங்கள்: அடுத்த கேள்விக்கு \"ஜார்விஸ்\" என்று முதலில் சொல்லுங்கள்" : "Too much talk in the room: say \"Jarvis\" first for your next question"}</div>}
          </div>
          <div className="hud-acts">
            {s.core === "speaking" && <button className="hud-btn" onClick={onStop}><I n="stop" />{ta ? "பேச்சை நிறுத்து" : "Stop talking"}</button>}
            <button className={`hud-btn${muted ? " pri" : ""}`} onClick={onMute} aria-pressed={muted} title={muted ? (ta ? "மைக்கைத் திற" : "Turn the microphone back on") : (ta ? "மைக்கை மூடு: எனக்குக் கேட்காது" : "Turn the microphone off: I won't hear you")}>
              <I n="mic" />{muted ? (ta ? "மைக்கைத் திற" : "Unmute") : (ta ? "மைக்கை மூடு" : "Mute")}
            </button>
            <button className="hud-btn" onClick={() => setTyping(!typing)} aria-expanded={typing} aria-label={ta ? "தட்டச்சு" : "Type instead"} title={ta ? "தட்டச்சு" : "Type instead"}><I n="edit" />{ta ? "தட்டச்சு" : "Type"}</button>
            <button className="hud-btn" data-jq-toggle onClick={() => window.dispatchEvent(new CustomEvent("jarvis:questions"))} title={ta ? "முந்தைய கேள்விகள்" : "Earlier questions"}><I n="clock" />{ta ? "கேள்விகள்" : "Questions"}</button>
            <button className="hud-btn close" onClick={onClose} title={ta ? "ஜார்விஸை மூடி டாஷ்போர்டுக்குத் திரும்பு" : "Close Jarvis and go back to the dashboard"}><I n="x" />{ta ? "ஜார்விஸை மூடு" : "Close Jarvis"}</button>
          </div>
          {typing && (
            <form className="hud-compose" onSubmit={(e) => { e.preventDefault(); const t = text.trim(); if (t) { setText(""); setTyping(false); onSend(t); } }}>
              <input value={text} onChange={(e) => setText(e.target.value)} placeholder={ta ? "உங்கள் கேள்வியைத் தட்டச்சு செய்யுங்கள்…" : "Type your question and press Enter…"} autoFocus aria-label={ta ? "கேள்வி" : "Question"} lang={lang} />
            </form>
          )}
        </section>
      </div>
      {s.firstUse && (
        <div className="hud-first" role="dialog" aria-label={ta ? "முதல் பயன்பாடு" : "First use"} lang={lang}>
          <p>{ta ? "ஜார்விஸ் திறந்திருக்கும்போது இந்த அறையில் பேசுவது எழுத்தாக மாற்றும் சேவைகளுக்கு அனுப்பப்படும்; சேமிக்கப்படாது. மூடியிருக்கும்போது \"ஹாய் ஜார்விஸ்\" என்பதை மட்டும் கேட்க உலாவி கேட்டுக்கொண்டிருக்கும். அறையில் யார் சொன்னாலும் கேட்கும்." : "While Jarvis is open, speech in this room goes to transcription services and is not stored. While it is closed, this browser's speech service listens only for \"Hi Jarvis\". It obeys anyone in the room: it cannot tell voices apart."}</p>
          <button onClick={onDismissFirstUse} autoFocus>{ta ? "புரிந்தது, திற" : "Understood, open it"}</button>
        </div>
      )}
      {!stageOpen && <Reticle />}
      <div className="hud-live" aria-live="polite" lang={lang}>{said}</div>
    </div>
  );
}

export { coreOf };
