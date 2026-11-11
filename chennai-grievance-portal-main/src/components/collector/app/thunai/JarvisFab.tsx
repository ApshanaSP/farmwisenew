"use client";
/**
 * Jarvis's own button, above the chatbot's at the bottom right: the light-blue core and its name. A click starts it, and once it
 * is running the same button closes it. Saying "Hi Jarvis" opens it too (Thunai.tsx). Joined to it, a clock with the number of
 * questions asked: a click lists them, with what Jarvis answered (JarvisQuestions.tsx).
 */
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useLang } from "@/lib/i18n/lang";
import { I } from "../icons";
import { hud } from "./hudstore";
import JarvisQuestions, { useQuestionCount } from "./JarvisQuestions";
import "./jarvisswitch.css";

export default function JarvisFab() {
  const s = useSyncExternalStore(hud.subscribe, hud.get, hud.get);
  const [lang] = useLang();
  const ta = lang === "ta";
  const on = s.mode !== "off";
  const n = useQuestionCount();
  const [list, setList] = useState(false);
  const close = useCallback(() => setList(false), []);
  // the bar's own "Questions" button opens the same list
  useEffect(() => {
    const f = () => setList((v) => !v);
    window.addEventListener("jarvis:questions", f);
    return () => window.removeEventListener("jarvis:questions", f);
  }, []);
  return (
    <div className={`jvf-wrap${on ? " live" : ""}`} data-no-i18n>
      {/* on the page itself, not in the console's layer: Jarvis's screens sit above that layer and would hide the list */}
      {list && createPortal(<JarvisQuestions lang={ta ? "ta" : "en"} place={on ? "bar" : "fab"} onClose={close} />, document.body)}
      {s.denied && !on && <span className="jvf-note" role="alert">{ta ? "மைக் தடுக்கப்பட்டுள்ளது: முகவரிப் பட்டியில் அனுமதியுங்கள்" : "Microphone blocked: allow it in the address bar"}</span>}
      <div className="jvf-pair">
        <button className={`jvf-q${list ? " on" : ""}`} data-jq-toggle onClick={() => setList((v) => !v)} aria-expanded={list}
          title={ta ? "முந்தைய கேள்விகள்" : "Earlier questions"} aria-label={ta ? `முந்தைய கேள்விகள் (${n})` : `Earlier questions (${n})`}>
          <I n="clock" />{n > 0 && <em>{n > 99 ? "99+" : n}</em>}
        </button>
        <button className={`jvf${on ? " on" : ""}`} onClick={() => window.dispatchEvent(new CustomEvent("jarvis:mode", { detail: { toggle: true } }))}
          aria-pressed={on} title={on ? (ta ? "ஜார்விஸை மூடு" : "Close Jarvis") : (ta ? "ஜார்விஸைத் தொடங்கு, அல்லது \"ஹாய் ஜார்விஸ்\" என்று சொல்லுங்கள்" : "Start Jarvis, or say \"Hi Jarvis\"")}>
          <i className="jvf-core" aria-hidden="true"><b /></i>
          <span>{on ? (ta ? "ஜார்விஸை மூடு" : "Close Jarvis") : (ta ? "ஜார்விஸ்" : "Jarvis")}</span>
        </button>
      </div>
    </div>
  );
}
