"use client";
/**
 * Jarvis's panel: one place to talk or type (the chat and the voice are the same Jarvis). It sits at the right of the
 * screen and the console narrows beside it, so nothing of the page is hidden; Jarvis's insight screens (the Stage) open
 * in the console's place, left of the panel, so the conversation goes on while they are read.
 *   - the conversation: what was heard (word for word, with the language it was said in), what Jarvis answered (in
 *     that language, the other one under it), and each insight screen as a card that opens it again;
 *   - the microphone: one big button, a ring that follows the voice, and the state in words (resting, listening,
 *     hearing, thinking, speaking), with the minute of quiet after which Jarvis rests;
 *   - typing: the same box answers typed questions.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { MapGeo } from "@/lib/collector/geo";
import type { AnswerCard as Card, ConsoleAction } from "@/lib/assistant/answer";
import AnswerCard from "../assistant/AnswerCard";
import { I } from "../icons";
import "../assistant/assistant.css";
import "./panel.css";

export interface Msg {
  id: string;
  who: "you" | "jarvis" | "note";
  text: string;
  /** the same words in the other language */
  alt?: string;
  lang: "en" | "ta";
  via?: "voice" | "typed";
  /** an insight screen this answer opened (a click opens it again) */
  screen?: { title: string; recipe: string; slots: Record<string, unknown> };
  /** an analyst answer (charts, table, sources) */
  card?: Card;
  at: number;
}

export type Ear = "off" | "resting" | "listening" | "hearing" | "reading" | "thinking" | "speaking" | "blocked";

const T = {
  en: { title: "Jarvis", sub: "Your district co-pilot", resting: "Resting · say “Hi Jarvis”", off: "Microphone off · press the mic", listening: "Listening… go ahead",
    hearing: "Hearing you…", reading: "Reading what you said…", thinking: "Thinking…", speaking: "Speaking", blocked: "Microphone blocked for this site",
    type: "Type a question, or press the mic and speak…", end: "End conversation", conv: (s: number) => `In conversation · no need to say my name · resting in ${s} s if quiet`,
    hello: "Hello, Collector.", helpLine: "Ask me anything about the district, in English or Tamil. I show the answer on screen and say it.",
    open: "Open insight", said: "You said", typed: "You typed", noted: "Noted", tools: "Settings", close: "Close Jarvis" },
  ta: { title: "ஜார்விஸ்", sub: "உங்கள் மாவட்டத் துணை", resting: "ஓய்வில் · “ஹாய் ஜார்விஸ்” சொல்லுங்கள்", off: "மைக் அணைப்பு · மைக்கை அழுத்துங்கள்", listening: "கேட்கிறேன்… சொல்லுங்கள்",
    hearing: "நீங்கள் பேசுவதைக் கேட்கிறேன்…", reading: "நீங்கள் சொன்னதைப் படிக்கிறேன்…", thinking: "யோசிக்கிறேன்…", speaking: "பேசுகிறேன்", blocked: "இந்தத் தளத்திற்கு மைக் தடுக்கப்பட்டுள்ளது",
    type: "கேள்வியைத் தட்டச்சு செய்யுங்கள், அல்லது மைக்கை அழுத்திப் பேசுங்கள்…", end: "உரையாடலை முடி", conv: (s: number) => `உரையாடலில் · பெயர் சொல்ல வேண்டாம் · ${s} வினாடி அமைதியானால் ஓய்வு`,
    hello: "வணக்கம், ஆட்சியர் அவர்களே.", helpLine: "மாவட்டம் பற்றி எதையும் தமிழிலோ ஆங்கிலத்திலோ கேளுங்கள். பதிலைத் திரையில் காட்டி, சொல்லுவேன்.",
    open: "திரையைத் திற", said: "நீங்கள் சொன்னது", typed: "நீங்கள் எழுதியது", noted: "குறிப்பு", tools: "அமைப்புகள்", close: "ஜார்விஸை மூடு" }
};

const SUGGEST: Record<"en" | "ta", string[]> = {
  en: ["What needs my attention today?", "Compare Adyar and Ambattur this week", "Show the severe cases", "How full are the reservoirs?", "Make me a flooding dashboard for this week", "Read today's news"],
  ta: ["இன்று என் கவனம் தேவைப்படுவது என்ன?", "அடையாறு மற்றும் அம்பத்தூர் இந்த வாரம் ஒப்பிடு", "கடுமையான நிகழ்வுகளைக் காட்டு", "ஏரிகளில் எவ்வளவு தண்ணீர் இருக்கு?", "இந்த வார வெள்ள நிலவரம் காட்டு", "இன்றைய செய்திகளைப் படி"]
};

export interface PanelProps {
  lang: "en" | "ta";
  ear: Ear;
  conv: boolean;
  idleLeft: number | null;
  level: number;
  thread: Msg[];
  busyLine: string | null;
  brain: string | null;
  geo: MapGeo | null;
  onSend: (text: string) => void;
  onMic: () => void;
  onEnd: () => void;
  onClose: () => void;
  onOpenScreen: (m: Msg) => void;
  onCardAsk: (q: string) => void;
  onCardAction: (a: ConsoleAction) => void;
  menu: ReactNode;
  /** the cards that wait for an answer (one question, a "yes", the approval tray), above the box */
  children?: ReactNode;
  focusKey?: number;
  /** the orb, where Jarvis's pointer starts when it presses the console's controls */
  orbRef?: React.Ref<HTMLSpanElement>;
  /** a small card in the corner (after a dashboard action), opened full by onExpand */
  mini?: boolean;
  onExpand?: () => void;
}

export default function Panel(p: PanelProps) {
  const w = T[p.lang];
  const [text, setText] = useState("");
  const [tools, setTools] = useState(false);
  const body = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { body.current?.scrollTo({ top: body.current.scrollHeight, behavior: "smooth" }); }, [p.thread.length, p.busyLine]);
  useEffect(() => { if (p.focusKey) input.current?.focus(); }, [p.focusKey]);
  const send = () => { const t = text.trim(); if (!t) return; setText(""); p.onSend(t); };
  const live = p.ear === "listening" || p.ear === "hearing";
  const status = p.ear === "off" ? w.off : p.ear === "resting" ? w.resting : w[p.ear];
  const last = [...p.thread].reverse().find((m) => m.who === "jarvis");

  if (p.mini) return (
    <aside className={`jv jv-mini jv-${p.ear}`} aria-label="Jarvis" data-no-i18n>
      <div className="jv-mini-h">
        <span ref={p.orbRef} className={`jv-orb ${p.ear}`} aria-hidden="true"><i /><b /></span>
        <div className="jv-ht"><b>{w.title}</b><small role="status" aria-live="polite">{p.busyLine ?? status}</small></div>
        <button className={`jv-mic sm${live ? " live" : ""}`} onClick={p.onMic} aria-label={live ? "Stop listening" : "Talk to Jarvis"} title={live ? "Stop listening" : "Talk to Jarvis"}>
          <span className="jv-ring" /><I n={p.ear === "speaking" ? "stop" : "mic"} /></button>
        <button className="jv-ib" onClick={p.onExpand} title={p.lang === "ta" ? "பெரிதாக்கு" : "Open the conversation"} aria-label="Open the conversation"><I n="expand" /></button>
        <button className="jv-ib" onClick={p.onClose} title={w.close} aria-label={w.close}><I n="x" /></button>
      </div>
      {last && !p.busyLine && <p className="jv-mini-t" lang={last.lang}>{last.text}</p>}
    </aside>
  );

  return (
    <aside className={`jv jv-${p.ear}`} aria-label="Jarvis" data-no-i18n>
      <header className="jv-h">
        <span ref={p.orbRef} className={`jv-orb ${p.ear}`} aria-hidden="true"><i /><b /></span>
        <div className="jv-ht"><b>{w.title}</b><small role="status" aria-live="polite">{status}</small></div>
        <div className="jv-hacts">
          <button className={`jv-ib${tools ? " on" : ""}`} onClick={() => setTools((v) => !v)} title={w.tools} aria-label={w.tools} aria-expanded={tools}><I n="sliders" /></button>
          <button className="jv-ib" onClick={p.onClose} title={w.close} aria-label={w.close}><I n="x" /></button>
        </div>
        {tools && <div className="jv-tools" onClick={() => setTools(false)}>{p.menu}</div>}
      </header>

      <div className="jv-b" ref={body}>
        {!p.thread.length && (
          <div className="jv-hello">
            <span className="jv-orb big" aria-hidden="true"><i /><b /></span>
            <h3>{w.hello}</h3>
            <p>{w.helpLine}</p>
            <div className="jv-sug">{SUGGEST[p.lang].map((q) => <button key={q} onClick={() => p.onSend(q)}><I n="arrowUR" />{q}</button>)}</div>
          </div>
        )}
        {p.thread.map((m) => (
          m.who === "note" ? <p key={m.id} className="jv-note">{m.text}</p>
            : m.who === "you" ? (
              <div key={m.id} className="jv-row you">
                <div className="jv-bub you">
                  <small><I n={m.via === "voice" ? "mic" : "edit"} />{m.via === "voice" ? w.said : w.typed}<em>{m.lang === "ta" ? "தமிழ்" : "English"}</em></small>
                  <span lang={m.lang}>{m.text}</span>
                </div>
              </div>
            ) : (
              <div key={m.id} className="jv-row bot">
                <span className="jv-av" aria-hidden="true" />
                <div className="jv-bub bot">
                  <span lang={m.lang}>{m.text}</span>
                  {m.alt && m.alt !== m.text && <span className="jv-alt" lang={m.lang === "ta" ? "en" : "ta"}>{m.alt}</span>}
                  {m.screen && (
                    <button className="jv-scr" onClick={() => p.onOpenScreen(m)}>
                      <span className="jv-scr-ic"><I n="tv" /></span><span><b>{m.screen.title}</b><small>{w.open}</small></span><I n="chevr" />
                    </button>
                  )}
                  {m.card && <div className="jv-card dic jv-dic" data-theme={typeof document !== "undefined" ? document.documentElement.dataset.theme : undefined}><AnswerCard card={m.card} geo={p.geo} onAsk={p.onCardAsk} onAction={p.onCardAction} expanded={false} onExpand={() => undefined} /></div>}
                </div>
              </div>
            )
        ))}
        {p.busyLine && (
          <div className="jv-row bot"><span className="jv-av" aria-hidden="true" /><div className="jv-bub bot busy"><span className="jv-dots"><i /><i /><i /></span>{p.busyLine}</div></div>
        )}
        {p.brain && !p.busyLine && <p className="jv-brain">{p.brain}</p>}
      </div>

      {p.children && <div className="jv-wait">{p.children}</div>}

      <footer className="jv-f">
        {p.conv && (
          <div className="jv-conv">
            <span className="jv-live" />{w.conv(p.idleLeft ?? 60)}
            <button onClick={p.onEnd}>{w.end}</button>
          </div>
        )}
        <div className="jv-box">
          <button className={`jv-mic${live ? " live" : ""}${p.ear === "thinking" || p.ear === "speaking" ? " busy" : ""}`} onClick={p.onMic}
            style={{ ["--lv" as string]: String(p.level) }} aria-label={live ? "Stop listening" : "Talk to Jarvis"} title={live ? "Stop listening" : "Talk to Jarvis"}>
            <span className="jv-ring" /><I n={p.ear === "speaking" ? "stop" : "mic"} />
          </button>
          <textarea ref={input} value={text} rows={1} placeholder={w.type} aria-label={w.type} maxLength={400}
            onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} />
          <button className="jv-send" onClick={send} disabled={!text.trim()} aria-label="Send"><I n="send" /></button>
        </div>
      </footer>
    </aside>
  );
}
