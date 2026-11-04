"use client";
/**
 * The top bar's Jarvis mode switch: on, off, mute. A red dot and the word "Listening" whenever the microphone is open. Used by
 * the console and the dev test console.
 */
import { useSyncExternalStore } from "react";
import { useLang } from "@/lib/i18n/lang";
import { hud } from "./hudstore";
import "./jarvisswitch.css";

const send = (detail: Record<string, unknown>) => window.dispatchEvent(new CustomEvent("jarvis:mode", { detail }));

export default function JarvisSwitch() {
  const s = useSyncExternalStore(hud.subscribe, hud.get, hud.get);
  const [lang] = useLang();
  const ta = lang === "ta";
  const on = s.mode === "on", muted = s.mode === "muted";
  return (
    <div className={`jsw${on ? " on" : ""}${muted ? " muted" : ""}`} data-no-i18n>
      <button className="jsw-main" role="switch" aria-checked={s.mode !== "off"} onClick={() => send({ toggle: true })} title={ta ? "ஜார்விஸ் பயன்முறை (Ctrl+Shift+J)" : "Jarvis mode (Ctrl+Shift+J)"}>
        <i className="jsw-core" aria-hidden="true" />
        <span>{ta ? "ஜார்விஸ்" : "Jarvis"}</span>
      </button>
      {s.mode !== "off" && (
        <button className="jsw-mute" onClick={() => send({ mute: true })} aria-pressed={muted} title={ta ? "மௌனம் (Ctrl+Shift+M)" : "Mute (Ctrl+Shift+M)"}>
          {muted ? (ta ? "மௌனம்" : "Muted") : <><i className="jsw-dot" aria-hidden="true" />{ta ? "கேட்கிறது" : "Listening"}</>}
        </button>
      )}
      {s.denied && <span className="jsw-denied" role="alert">{ta ? "மைக் தடுக்கப்பட்டுள்ளது: முகவரிப் பட்டியில் அனுமதியுங்கள்" : "Microphone blocked: allow it in the address bar"}</span>}
      {s.needsResume && !s.denied && <span className="jsw-resume">{ta ? "தொடர கிளிக் செய்யுங்கள்" : "Click to resume"}</span>}
    </div>
  );
}
