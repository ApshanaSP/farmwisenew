"use client";
/**
 * Jarvis on the console: one bar at the bottom of the screen, in the console's own theme, with the light-blue core docked at its
 * left and the state shown as a glow on its border. The bar says what Jarvis is doing and whether it needs its name, shows the
 * words it heard, then the words it is saying with the word under the voice marked, the turn's real steps as one line, and where
 * each answer came from (the evidence chip); it holds every control in words: Stop talking, Mute, Type, Questions, Close Jarvis.
 * A mission's plan and anything Jarvis noticed come up as cards above the bar. The latest answer sits in one small card in the
 * corner (it folds to a pill); earlier ones are one click away (Questions). Everything here comes from hudstore.ts, which only real
 * events write to, and the console stays usable beneath: only the HUD's own controls take clicks.
 *
 * One state machine drives every visual (hudcore.ts visualOf): the core's motion, its brightness and the bar's glow, from one
 * smoothed audio level. The core draws about 15 frames a second at rest, 60 while speaking, and none when nothing moves.
 * Motion is transform and opacity only. Tamil is never letter-spaced, split, or animated per glyph: whole lines fade.
 * prefers-reduced-motion gives a still core, a plain level bar and no power-on.
 */
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode, type RefObject } from "react";
import { drawCore, frameDelay, glowAt, smoothLevel, visualOf, visualStateOf, type VisualState } from "./hudcore";
import { coreOf, hud, MIC_SLOW_MS, micOpen, powerOnDue, statusOf, type HudPanel } from "./hudstore";
import { announcement, currentSteps, SETTLE_MS, type Heard } from "./hudview";
import { Caption, EvidenceChip, InterjectionCard, MissionCard, ProgressLine, QueueBadge } from "./HudCards";
import { useQuestionCount } from "./JarvisQuestions";
import { voiceLevel } from "./mouth";
import { Reticle } from "./mapbridge";
import { CountUp } from "./countup";
import { I } from "../icons";
import "./hud.css";

export interface HudProps {
  lang: "en" | "ta";
  coreRef: RefObject<HTMLSpanElement>;
  /** a Stage screen is open: the corner card and the reticle step aside (the bar and its captions stay) */
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
/**
 * The room the console leaves for Jarvis's bar (its dock's height, 24 px around it), in steps of 44 px, and never more than 26 % of the
 * screen (132 px at least): a tall stack of cards rises over the page instead of squeezing it away.
 */
export function hudRoom(dockH: number, screenH: number): number {
  const need = Math.max(0, dockH) + 24;
  const step = 88 + Math.max(0, Math.ceil((need - 88) / 44)) * 44;
  return Math.round(Math.min(step, Math.max(132, screenH * 0.26)));
}
/** the core's size in the bar, in CSS pixels: the canvas is drawn at this size, not scaled down from a bigger one */
export const CORE_PX = 40;
/** the core's shortest frame: every second frame on a 144 Hz screen (about 72 fps), every frame at 60 Hz (measured: 15 ms gave 47 fps at 144 Hz) */
export const MIN_FRAME_MS = 12;
const toneNow = (): "light" | "dark" => (document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light");

/**
 * The core: one canvas, its loop driven by the state machine. The loop draws only as often as the state needs (frameDelay) and
 * stops when nothing moves; a state change starts it again. It writes the bar's glow (opacity only) on the same frame.
 */
function Core({ v, anchor, glow }: { v: VisualState; anchor: RefObject<HTMLSpanElement>; glow: RefObject<HTMLElement> }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const vs = useRef(v);
  const since = useRef(0);
  const kick = useRef<() => void>(() => undefined);
  const [still] = useState(reducedMotion);
  if (vs.current !== v) { vs.current = v; since.current = typeof performance !== "undefined" ? performance.now() : 0; }
  useEffect(() => { kick.current(); }, [v]);
  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = c.height = Math.round(CORE_PX * dpr);
    const g = c.getContext("2d", { alpha: true });
    if (!g) return;
    let raf = 0, timer: ReturnType<typeof setTimeout> | null = null, alive = true, lastPaint = 0;
    let smooth = 0, ph = 0, last = 0;
    const paint = (t: number) => {
      const st = vs.current;
      const dt = last ? Math.min(100, t - last) : 0;
      last = t;
      // one smoothed level: the voice's while it speaks, the microphone's otherwise; a fixed one with reduced motion
      smooth = still ? 0.4 : smoothLevel(smooth, st === "speaking" ? voiceLevel(t) : hud.level(), dt);
      const vis = visualOf(st, smooth);
      ph += (dt / 1000) * vis.speed;
      // reduced motion draws an interruption already collapsed: there is no motion to show it collapsing
      drawCore(g, CORE_PX, dpr, { v: vis, ph, t, since: still ? -1e9 : since.current, tone: toneNow() });
      if (glow.current) glow.current.style.opacity = glowAt(vis, ph).toFixed(3);
      return vis;
    };
    const frame = (t: number) => {
      raf = 0;
      if (!alive) return;
      // a 144 Hz screen calls this 144 times a second: the core draws at most about 60 times (the fps spec measured 143 draws a second
      // while speaking); the calls in between are skipped, not drawn
      if (lastPaint && t - lastPaint < MIN_FRAME_MS) { raf = requestAnimationFrame(frame); return; }
      lastPaint = t;
      const vis = paint(t);
      const d = frameDelay(vis, { hidden: document.hidden, reduced: still, sinceMs: t - since.current });
      if (d == null) { last = 0; return; }
      if (d <= 20) raf = requestAnimationFrame(frame);
      // the wait is the whole delay: the frame that follows the timer only adds to it, so the idle core stays at or under its rate
      // (measured: d - 8 drew 16 a second against the 15 the brief allows)
      else timer = setTimeout(() => { timer = null; if (alive) raf = requestAnimationFrame(frame); }, d);
    };
    kick.current = () => { if (alive && !raf && !timer) raf = requestAnimationFrame(frame); };
    kick.current();
    const shown = () => { if (!document.hidden) kick.current(); };
    document.addEventListener("visibilitychange", shown);
    // a still core is drawn again when the console's theme changes under it (its colours follow the theme)
    const themed = typeof MutationObserver === "function" ? new MutationObserver(() => kick.current()) : null;
    themed?.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => {
      alive = false;
      if (raf) cancelAnimationFrame(raf);
      if (timer) clearTimeout(timer);
      kick.current = () => undefined;
      document.removeEventListener("visibilitychange", shown);
      themed?.disconnect();
    };
  }, [still]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="hud-core" data-state={v} aria-hidden="true">
      <span ref={anchor} className="hud-anchor" />
      <canvas ref={canvas} className="hud-canvas" />
    </div>
  );
}

/** The latest answer, in one small card in the corner: the question, the words, the key figures, the screen to open again. */
function AnswerCorner({ asked, answer, p, lang, setPill }: { asked: string; answer: string; p: HudPanel | null; lang: "en" | "ta"; setPill: (v: boolean) => void }) {
  const ta = lang === "ta";
  // v13 (21 Nov review, finding 1 6): a city screen shows in place on the map, this card its answer; Details opens its Stage, that same screen
  const city = p?.recipe === "city";
  const open = () => { if (p?.slots) window.dispatchEvent(new CustomEvent("jarvis:open-pin", { detail: { id: p.id, recipe: p.recipe, slots: p.slots, title: p.title, ...(city ? { full: true } : {}) } })); };
  return (
    <article className="hud-ans" lang={lang} data-testid="answer">
      <header>
        <small><I n="mic" />{ta ? "நீங்கள் கேட்டது" : "You asked"}</small>
        <span>
          <button className="hud-x" onClick={() => setPill(true)} aria-expanded={true} aria-label={ta ? "இந்தப் பதிலைச் சிறிதாக்கு" : "Fold this answer away"} title={ta ? "சிறிதாக்கு" : "Fold"}><I n="minus" /></button>
          <button className="hud-x" onClick={() => hud.set({ answer: "", panels: [], asked: "" })} aria-label={ta ? "இந்தப் பதிலை மூடு" : "Close this answer"} title={ta ? "மூடு" : "Close"}><I n="x" /></button>
        </span>
      </header>
      {asked && <p className="hud-q" lang={isTa(asked) ? "ta" : "en"}>{asked}</p>}
      {p?.title && <h3>{p.title}</h3>}
      {answer && <p className="hud-a" lang={isTa(answer) ? "ta" : "en"}>{answer}</p>}
      {p && p.figures.length > 0 && (
        <dl>{p.figures.map((f, i) => <div key={i}><dt>{f.label}</dt><dd><CountUp value={f.value} />{f.unit ? <small> {f.unit}</small> : null}</dd></div>)}</dl>
      )}
      {/* a source the Collector would recognise; the data's own table names (change_drivers) are not */}
      {p?.source && !/^[a-z0-9_]+$/.test(p.source) && <footer>{ta ? "ஆதாரம்" : "Source"}: {p.source}</footer>}
      {p?.slots && <div className="hud-ans-acts"><button onClick={open}><I n="expand" />{city ? (ta ? "விவரங்கள்" : "Details") : (ta ? "முழுத் திரையில் பார்" : "Open full screen")}</button></div>}
    </article>
  );
}

export default function Hud({ lang, coreRef, stageOpen, children, onSend, onStop, onMute, onClose, onDismissFirstUse }: HudProps) {
  const s = useSyncExternalStore(hud.subscribe, hud.get, hud.get);
  const [text, setText] = useState("");
  const ta = lang === "ta";
  const typing = s.typing;
  const setTyping = (v: boolean) => hud.set({ typing: v });
  const asked = useQuestionCount();
  const glow = useRef<HTMLElement>(null);
  // the corner card folds to a pill and stays folded for the next answers, until it is opened again
  const [pill, setPill] = useState(false);
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
  const level = useRef<HTMLSpanElement>(null);
  // v18 (24 Nov, the owner: "the Jarvis board and the suggestions board hide the screen"): the room the bar and the cards over it take, kept
  // in --hud-dock-h, so an open screen ends above them however tall they grow (hud.css)
  const dock = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = dock.current;
    if (!el || typeof ResizeObserver !== "function") return;
    const root = document.documentElement;
    // --hud-room (26 Nov, "no overlaps"): what the page under the bar leaves free for it (dock.css). It moves in steps and shrinks only after
    // two calm seconds, so the page does not jump with every line Jarvis says
    let room = 0, calm: ReturnType<typeof setTimeout> | null = null;
    const apply = (v: number) => { room = v; root.style.setProperty("--hud-room", `${v}px`); };
    const set = () => {
      const h = Math.ceil(el.getBoundingClientRect().height);
      root.style.setProperty("--hud-dock-h", `${h}px`);
      const want = hudRoom(h, window.innerHeight);
      if (calm) { clearTimeout(calm); calm = null; }
      if (want > room) apply(want);
      else if (want < room) calm = setTimeout(() => apply(want), 2000);
    };
    set();
    const ro = new ResizeObserver(set);
    ro.observe(el);
    window.addEventListener("resize", set);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", set);
      if (calm) clearTimeout(calm);
      root.style.removeProperty("--hud-dock-h");
      root.style.removeProperty("--hud-room");
    };
  }, []);
  // the answer's card starts under the console's band, so it never lies over the top bar, the filters or the counts (hud.css); measured
  // while the card is up (the page under it may change)
  const cardUp = !stageOpen && !pill && !!(s.answer || s.panels[0]);
  useEffect(() => {
    if (!cardUp) return;
    const root = document.documentElement;
    let last = "";
    const set = () => {
      const r = document.querySelector(".dic .band")?.getBoundingClientRect();
      const v = `${Math.round(r && r.height > 0 ? Math.min(Math.max(r.bottom, 64), window.innerHeight * 0.4) : 64)}px`;
      if (v !== last) { last = v; root.style.setProperty("--band-end", v); }
    };
    set();
    const t = setInterval(set, 1500);
    window.addEventListener("resize", set);
    return () => { clearInterval(t); window.removeEventListener("resize", set); };
  }, [cardUp]);
  useEffect(() => {
    if (!reducedMotion()) return;
    const t = setInterval(() => { if (level.current) level.current.style.transform = `scaleX(${hud.level().toFixed(2)})`; }, 120);
    return () => clearInterval(t);
  }, []);
  // the line changes by itself when the time without its name runs out, and (B5) when a microphone still opening becomes slow
  const [now, setNow] = useState(0);
  useEffect(() => {
    setNow(Date.now());
    const due = [s.engagedUntil, s.micSince ? s.micSince + MIC_SLOW_MS : 0].filter((x) => x > Date.now());
    if (!due.length) return;
    const t = setTimeout(() => setNow(Date.now()), Math.max(0, Math.min(...due) - Date.now()) + 50);
    return () => clearTimeout(t);
  }, [s.engagedUntil, s.core, s.micSince]);
  const { word, hint } = statusOf(s, ta, now);
  // for screen readers: what settled, half a second after it settles (something noticed, an answer, else the state's word);
  // never the words being heard
  const [said, setSaid] = useState("");
  const heard = useRef<Heard>({ word: "", answer: "" });
  const alert = s.interjection?.text ?? "";
  useEffect(() => {
    const t = setTimeout(() => {
      const next: Heard = { word, answer: s.answer, alert };
      const a = announcement(heard.current, next);
      heard.current = next;
      if (a) setSaid(a);
    }, SETTLE_MS);
    return () => clearTimeout(t);
  }, [word, s.answer, alert]);
  const muted = s.mode === "muted";
  const vis = visualStateOf(s);
  const hot = micOpen(s);
  // what was said shows while it is being heard and worked on; after that, it is in the answer's card
  const showWords = !!s.ribbon && (s.core === "hearing" || s.core === "thinking");
  const line = showWords ? (s.ribbon.length > 130 ? `…${s.ribbon.slice(-130)}` : s.ribbon) : "";
  const panel = s.panels[0] ?? null;
  // the turn's real steps while it works (a plan's own chips, when the console shows them, take the line's place: hud.css); only this
  // turn's: an earlier turn's steps never show while the next sentence is read or answered
  const steps = currentSteps(s.steps, s.turnAt);
  const working = s.core === "thinking" && steps.length > 0;
  // what Jarvis is saying, while it says it (and while it waits to go on)
  const saying = !!s.caption?.text && (s.core === "speaking" || s.core === "holding");
  const evidence = s.evidence && (s.answer || panel) && s.core !== "hearing" && s.core !== "thinking" ? s.evidence : null;
  const a = s.actions;
  return (
    <div className={`hud${stageOpen ? " with-stage" : ""}${powered ? "" : " powering"}`} data-core={s.core} data-visual={vis} data-mic={hot ? "hot" : "off"} data-testid="hud" data-no-i18n lang={lang}>
      {!stageOpen && !pill && (s.answer || panel) && <AnswerCorner asked={s.asked} answer={s.answer} p={panel} lang={lang} setPill={setPill} />}
      <div className="hud-dock" ref={dock}>
        <div className="hud-cards" lang={lang}>
          {s.interjection && <InterjectionCard x={s.interjection} lang={lang} a={a} />}
          {s.mission && <MissionCard m={s.mission} lang={lang} a={a} />}
          {children}
        </div>
        <section className="hud-bar" aria-label={ta ? "ஜார்விஸ்" : "Jarvis"}>
          <i className="hud-glow" ref={glow} aria-hidden="true" />
          <Core v={vis} anchor={coreRef} glow={glow} />
          <div className="hud-read">
            <div className="hud-state" lang={lang} data-testid="state">
              {hot ? <span role="img" aria-label={ta ? "மைக் இயக்கத்தில்" : "Microphone on"} title={ta ? "மைக் இயக்கத்தில்: நான் கேட்கிறேன்" : "Microphone on: I can hear the room"} className="hud-mic"><i /></span> : null}
              <b>{word}</b>
              {hint && !showWords && <span className="hud-hint">{hint}</span>}
            </div>
            {working && <ProgressLine steps={steps} lang={lang} />}
            {reducedMotion() && <span className="hud-levelbar" aria-hidden="true"><span ref={level} /></span>}
            {showWords && <div className="hud-ribbon" lang={isTa(s.ribbon) ? "ta" : "en"} data-testid="ribbon">{line}</div>}
            {!showWords && <div data-testid="ribbon" hidden>{s.ribbon}</div>}
            {s.core === "thinking" && hint && showWords && <div className="hud-hint">{hint}</div>}
            {saying && s.caption && <Caption c={s.caption} />}
            {evidence && <EvidenceChip e={evidence} lang={lang} onOpen={a.onEvidence} />}
            {s.faint && <div className="hud-faint" data-testid="faint">{s.faint}</div>}
            {s.notice && <div className="hud-notice" role="status" lang={lang} title={s.notice}>{s.notice}</div>}
            {/* B1/B8 (27 Nov): the browser lets no sound in or out until a click on the page (Chrome on a site with no click yet) */}
            {s.needsResume && <div className="hud-notice" role="status" lang={lang}>{ta ? "நான் கேட்கவும் பேசவும் பக்கத்தில் எங்காவது ஒருமுறை கிளிக் செய்யுங்கள்" : "Click anywhere on the page so I can hear you and speak"}</div>}
            {s.strip.budgetLow && <div className="hud-notice warn" lang={lang}>{ta ? "கொஞ்சம் பொறுங்கள்: அடுத்த கேள்விக்கு \"ஜார்விஸ்\" என்று முதலில் சொல்லுங்கள்" : "Too much talk in the room: say \"Jarvis\" first for your next question"}</div>}
          </div>
          <div className="hud-acts">
            {/* the folded answer: one of the bar's own buttons (26 Nov: floating, it lay over the department filter) */}
            {!stageOpen && pill && (s.answer || panel) && (
              <button className="hud-btn hud-pill-b" data-testid="answer-pill" onClick={() => setPill(false)} aria-expanded={false}
                title={`${ta ? "பதிலைக் காட்டு" : "Show the answer"}: ${panel?.title || s.asked || s.answer}`}><i className="hud-pill-dot" aria-hidden="true" />{ta ? "பதில்" : "Answer"}</button>
            )}
            <QueueBadge n={s.queue} lang={lang} onOpen={a.onQueue} />
            {s.core === "speaking" && <button className="hud-btn" onClick={onStop}><I n="stop" />{ta ? "பேச்சை நிறுத்து" : "Stop talking"}</button>}
            <button className={`hud-btn${muted ? " pri" : ""}`} onClick={onMute} aria-pressed={muted} title={muted ? (ta ? "மைக்கைத் திற" : "Turn the microphone back on") : (ta ? "மைக்கை மூடு: எனக்குக் கேட்காது" : "Turn the microphone off: I won't hear you")}>
              <I n="mic" />{muted ? (ta ? "மைக்கைத் திற" : "Unmute") : (ta ? "மைக்கை மூடு" : "Mute")}
            </button>
            <button className="hud-btn" onClick={() => setTyping(!typing)} aria-expanded={typing} aria-label={ta ? "தட்டச்சு" : "Type instead"} title={ta ? "தட்டச்சு" : "Type instead"}><I n="edit" />{ta ? "தட்டச்சு" : "Type"}</button>
            {/* the one way to the earlier questions while Jarvis is open (Jarvis's own button has it while it is closed) */}
            <button className="hud-btn hud-qs" data-jq-toggle onClick={() => window.dispatchEvent(new CustomEvent("jarvis:questions"))} title={ta ? "முந்தைய கேள்விகள்" : "Earlier questions"}
              aria-label={ta ? `முந்தைய கேள்விகள் (${asked})` : `Earlier questions (${asked})`}>
              <I n="clock" />{ta ? "கேள்விகள்" : "Questions"}{asked > 0 && <em aria-hidden="true">{asked > 99 ? "99+" : asked}</em>}
            </button>
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
