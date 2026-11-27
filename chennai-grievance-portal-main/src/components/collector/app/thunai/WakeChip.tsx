"use client";
/**
 * B7 (27 Nov, the hosted copy in Chrome): while Jarvis is closed, a short line on Jarvis's own button says why "Hey Jarvis" does not listen
 * yet (hudstore.ts wakeNeeds, set by Thunai.tsx's closed listener): the microphone is not allowed on this site yet, or the browser holds the
 * listener's audio until a click on the page. A click on it is that click, and where the microphone is not allowed yet it asks the browser for
 * it (the page never asks unprompted). Drawn inside the button's own box (JarvisFab.tsx, .jvf-wrap) so it sits with it; nothing when that box
 * is not on the page (the chatbot open) or nothing is needed.
 */
import { useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { hud } from "./hudstore";

/** the chip's words: one plain line, in the site's language */
export function wakeChipText(ta: boolean): string {
  return ta ? "\"ஹே ஜார்விஸ்\" இயங்க ஒருமுறை கிளிக் செய்யுங்கள்" : "Click once to turn on \"Hey Jarvis\"";
}

export default function WakeChip({ lang }: { lang: "en" | "ta" }) {
  const s = useSyncExternalStore(hud.subscribe, hud.get, hud.get);
  const need = s.mode === "off" ? s.wakeNeeds ?? null : null;
  const [box, setBox] = useState<Element | null>(null);
  // the button's box comes and goes with the chatbot: looked for again while a chip is wanted
  useEffect(() => {
    if (!need) { setBox(null); return; }
    const find = () => setBox((b) => { const el = document.querySelector(".dic .jvf-wrap"); return el === b ? b : el; });
    find();
    const t = setInterval(find, 1000);
    return () => clearInterval(t);
  }, [need]);
  if (!need || !box) return null;
  const ta = lang === "ta";
  return createPortal(
    <button type="button" className="jvf-note" style={{ order: -1, cursor: "pointer", border: 0, textAlign: "left" }} lang={lang} data-testid="wake-chip"
      onClick={() => { if (need === "allow") window.dispatchEvent(new CustomEvent("jarvis:wake-enable")); }}>
      {wakeChipText(ta)}
    </button>,
    box
  );
}
