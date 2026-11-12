"use client";
/**
 * The chatbot's second tab: what was asked of Jarvis and what it answered, newest at the bottom, in the chat's own look. An answer
 * that opened a screen can open it again, and an answer's chart stays with it until the page reloads.
 */
import { useEffect, useRef, useSyncExternalStore } from "react";
import type { MapGeo } from "@/lib/collector/geo";
import { useLang } from "@/lib/i18n/lang";
import AnswerCard from "../assistant/AnswerCard";
import { I } from "../icons";
import { jarvisLog } from "./jarvislog";
import StudioAnswer from "./StudioAnswer";
import { istDateTime } from "@/lib/ist-dates";
import "./jarvislog.css";

const when = (at: number) => istDateTime(at);

export default function JarvisLogView({ geo, onClose }: { geo: MapGeo | null; onClose: () => void }) {
  const list = useSyncExternalStore(jarvisLog.subscribe, jarvisLog.get, jarvisLog.empty);
  const [lang] = useLang();
  const ta = lang === "ta";
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => { box.current?.scrollTo({ top: box.current.scrollHeight }); }, [list.length]);
  const again = (detail: { recipe: string; slots: Record<string, unknown>; title: string }) => { onClose(); window.dispatchEvent(new CustomEvent("jarvis:open-pin", { detail })); };
  const ask = (q: string) => { onClose(); window.dispatchEvent(new CustomEvent("jarvis:show", { detail: q })); };
  return (
    <>
      <div className="aq-thread jl" ref={box} data-no-i18n>
        {!list.length && (
          <div className="jl-empty">
            <i className="jvf-core" aria-hidden="true"><b /></i>
            <h3>{ta ? "இன்னும் எதுவும் கேட்கவில்லை" : "Nothing asked of Jarvis yet"}</h3>
            <p>{ta ? "\"ஹாய் ஜார்விஸ்\" என்று சொல்லிக் கேளுங்கள். கேள்விகளும் பதில்களும் இங்கே சேரும்." : "Say \"Hi Jarvis\" and ask. Your questions and its answers are kept here."}</p>
          </div>
        )}
        {list.map((m) => m.who === "you" ? (
          <div key={m.id} className="aq-row me">
            <div className="aq-bubble" lang={m.lang}>{m.text}<small className="jl-t">{m.via === "voice" ? (ta ? "சொன்னது" : "Said") : (ta ? "தட்டச்சு" : "Typed")} · {when(m.at)}</small></div>
          </div>
        ) : (
          <div key={m.id} className="aq-row bot">
            <i className="jvf-core aq-av" aria-hidden="true"><b /></i>
            <div className="aq-col">
              <p className="jl-a" lang={m.lang}>{m.text}</p>
              {m.screen && <button className="jl-open" onClick={() => again(m.screen!)}><I n="expand" /><span>{m.screen.title}</span></button>}
              {m.studio && <div className="dic jl-card"><StudioAnswer s={m.studio} /></div>}
              {m.card && <div className="jl-card"><AnswerCard card={m.card} geo={geo} onAsk={ask} onAction={(a) => { onClose(); window.dispatchEvent(new CustomEvent("jarvis:card-action", { detail: a })); }} expanded={false} onExpand={() => undefined} /></div>}
            </div>
          </div>
        ))}
      </div>
      {list.length > 0 && <div className="jl-foot"><button onClick={() => jarvisLog.clear()}><I n="trash" />{ta ? "பதிவை அழி" : "Clear this list"}</button></div>}
    </>
  );
}
