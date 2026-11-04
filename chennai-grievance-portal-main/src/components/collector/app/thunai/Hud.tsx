"use client";
/**
 * The HUD: what Jarvis mode looks like over the console. Everything on it comes from hudstore.ts, which only real events
 * write to. The console stays visible and usable beneath: only the HUD's own controls take clicks.
 */
import { useState, useSyncExternalStore, type ReactNode, type RefObject } from "react";
import { hud } from "./hudstore";

export interface HudProps {
  lang: "en" | "ta";
  coreRef: RefObject<HTMLSpanElement>;
  /** the questions and the approval tray that wait on the Collector */
  children?: ReactNode;
  onSend: (text: string) => void;
}

export default function Hud({ lang, coreRef, children, onSend }: HudProps) {
  const s = useSyncExternalStore(hud.subscribe, hud.get, hud.get);
  const [typing, setTyping] = useState(false);
  const [text, setText] = useState("");
  const ta = lang === "ta";
  return (
    <div className="hud" data-core={s.core} data-testid="hud" data-no-i18n>
      <span ref={coreRef} className="hud-anchor" aria-hidden="true" />
      <div className="hud-ribbon" lang={lang}>{s.ribbon}</div>
      {s.faint && <div className="hud-faint">{s.faint}</div>}
      {s.answer && <div className="hud-answer" lang={lang}>{s.answer}</div>}
      {s.notice && <div className="hud-notice" role="status">{s.notice}</div>}
      <div className="hud-cards">{children}</div>
      <button className="hud-key" onClick={() => setTyping((v) => !v)} aria-label={ta ? "தட்டச்சு" : "Type instead"} aria-expanded={typing}>⌨</button>
      {typing && <form className="hud-compose" onSubmit={(e) => { e.preventDefault(); const t = text.trim(); if (t) { setText(""); onSend(t); } }}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder={ta ? "தட்டச்சு செய்யுங்கள்…" : "Type a request…"} autoFocus aria-label={ta ? "கேள்வி" : "Request"} />
      </form>}
    </div>
  );
}
