"use client";
/**
 * The questions asked of Jarvis, one click from its own button (and from its bar): newest first, each with what Jarvis answered.
 * A question that opened a screen opens it again; any question can be asked again. "See all" opens the chatbot's Jarvis tab.
 */
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import { I } from "../icons";
import { jarvisLog, type JLog } from "./jarvislog";

export interface QPair { q: JLog; a: JLog[] }

/** each question with the answers that came after it, newest question first */
export function pairsOf(list: JLog[]): QPair[] {
  const out: QPair[] = [];
  for (const m of list) {
    if (m.who === "you") out.push({ q: m, a: [] });
    else if (out.length) out[out.length - 1].a.push(m);
  }
  return out.reverse();
}

const when = (at: number) => {
  const d = new Date(at);
  const today = new Date().toDateString() === d.toDateString();
  return d.toLocaleString("en-IN", today ? { hour: "numeric", minute: "2-digit" } : { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
};

export function useQuestionCount(): number {
  const list = useSyncExternalStore(jarvisLog.subscribe, jarvisLog.get, jarvisLog.empty);
  return useMemo(() => list.filter((m) => m.who === "you").length, [list]);
}

/** the list is drawn on the page itself, so it takes the console's theme, colours and position with it */
function consoleLook() {
  const d = document.querySelector(".dic");
  const css = d ? getComputedStyle(d) : null;
  const style: Record<string, string> = {};
  for (const k of ["--elev", "--text", "--text-2", "--line", "--font-ui"]) { const v = css?.getPropertyValue(k).trim(); if (v) style[k] = v; }
  return { theme: d?.getAttribute("data-theme") ?? "light", tall: !!d && !d.classList.contains("fit"), style: style as CSSProperties };
}

export default function JarvisQuestions({ lang, place, onClose }: { lang: "en" | "ta"; place: "fab" | "bar"; onClose: () => void }) {
  const list = useSyncExternalStore(jarvisLog.subscribe, jarvisLog.get, jarvisLog.empty);
  const pairs = useMemo(() => pairsOf(list).slice(0, 15), [list]);
  const [open, setOpen] = useState<string | null>(pairs[0]?.q.id ?? null);
  const box = useRef<HTMLElement>(null);
  const opened = useRef<HTMLLIElement>(null);
  const [look] = useState(consoleLook);
  const ta = lang === "ta";
  // an answer opened low in a long list comes into view, it does not open out of sight below the fold
  useEffect(() => { opened.current?.scrollIntoView({ block: "nearest" }); }, [open]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    // a click anywhere else closes it (the button that opened it toggles it itself)
    const down = (e: PointerEvent) => { const t = e.target as Element | null; if (box.current && t && !box.current.contains(t) && !t.closest?.("[data-jq-toggle]")) onClose(); };
    window.addEventListener("keydown", key);
    window.addEventListener("pointerdown", down, true);
    return () => { window.removeEventListener("keydown", key); window.removeEventListener("pointerdown", down, true); };
  }, [onClose]);
  const again = (q: string) => { onClose(); window.dispatchEvent(new CustomEvent("jarvis:show", { detail: q })); };
  const screen = (s: NonNullable<JLog["screen"]>) => { onClose(); window.dispatchEvent(new CustomEvent("jarvis:open-pin", { detail: s })); };
  return (
    <section ref={box} className={`jq jq-${place}${look.tall ? " jq-tall" : ""}`} style={look.style} data-theme={look.theme} role="dialog" aria-label={ta ? "முந்தைய கேள்விகள்" : "Earlier questions"} lang={lang} data-no-i18n data-thunai-ui data-testid="jarvis-questions">
      <header>
        <b><I n="clock" />{ta ? "முந்தைய கேள்விகள்" : "Earlier questions"}</b>
        <span>
          {pairs.length > 0 && <button className="jq-all" onClick={() => { onClose(); window.dispatchEvent(new CustomEvent("diq:jarvis-log")); }}>{ta ? "அனைத்தும்" : "See all"}</button>}
          <button className="jq-x" onClick={onClose} aria-label={ta ? "மூடு" : "Close"}><I n="x" /></button>
        </span>
      </header>
      {!pairs.length && <p className="jq-empty">{ta ? "இன்னும் எதுவும் கேட்கவில்லை. \"ஹாய் ஜார்விஸ்\" என்று சொல்லிக் கேளுங்கள்." : "Nothing asked yet. Say \"Hi Jarvis\" and ask."}</p>}
      <ol>
        {pairs.map(({ q, a }) => {
          const isOpen = open === q.id;
          const shot = a.find((x) => x.screen)?.screen;
          const words = a.map((x) => x.text).filter(Boolean).join(" ");
          return (
            <li key={q.id} className={isOpen ? "open" : ""} ref={isOpen ? opened : undefined}>
              <button className="jq-q" onClick={() => setOpen(isOpen ? null : q.id)} aria-expanded={isOpen} lang={q.lang}>
                <span>{q.text}</span><small>{when(q.at)}</small>
              </button>
              {isOpen && (
                <div className="jq-a">
                  {words ? <p lang={a[0]?.lang}>{words}</p> : <p className="jq-none">{ta ? "பதில் பதிவாகவில்லை" : "No answer was kept"}</p>}
                  <div className="jq-acts">
                    {shot && <button onClick={() => screen(shot)}><I n="expand" />{ta ? "திரையைத் திற" : "Open the screen"}</button>}
                    <button onClick={() => again(q.text)}><I n="mic" />{ta ? "மீண்டும் கேள்" : "Ask again"}</button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
