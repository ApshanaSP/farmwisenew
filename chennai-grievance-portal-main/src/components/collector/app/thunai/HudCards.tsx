"use client";
/**
 * The bar's v4 parts (Pillar 6): the caption of what Jarvis is saying with the word under the voice marked, the live progress
 * line of the turn's real steps, the evidence chip under an answer, the mission card (plan, then steps ticking) and the
 * interjection card (one line, Tell me or Later). Each draws only what the store holds, and every button calls a callback the
 * store carries (Thunai.tsx sets them): nothing here decides, fetches or invents a step or a number.
 *
 * Tamil is never letter-spaced, split or animated per glyph: the caption marks whole words, and lines fade in whole.
 */
import { useEffect, useRef } from "react";
import { I } from "../icons";
import type { HudActions, HudCaption, HudEvidence, HudInterjection, HudMission, HudMissionStepState, WorkStep } from "./hudstore";
import { captionView, evidenceParts, fmtMs, missionMs, missionPhase, progressItems } from "./hudview";

type Lang = "en" | "ta";
const T = (lang: Lang, en: string, ta: string) => (lang === "ta" ? ta : en);
const isTa = (t: string) => /[஀-௿]/.test(t);

/** What Jarvis is saying, a page at a time, the word under the voice marked (no word marked where the voice gives no boundaries). */
export function Caption({ c }: { c: HudCaption }) {
  const v = captionView(c.text, c.char);
  const lang = isTa(c.text) ? "ta" : c.lang;
  return (
    <div className="hud-cap" lang={lang} data-testid="caption">
      {/* a new page fades in whole: keyed by its page, never by the word */}
      <p key={`${c.text.length}:${c.text.slice(0, 24)}:${v.page}`}>
        {v.before ? "… " : ""}
        <span className="done">{v.done}</span>
        {v.word ? <mark>{v.word}</mark> : null}
        <span>{v.rest}</span>
        {v.after ? " …" : ""}
      </p>
    </div>
  );
}

const MARK: Record<WorkStep["state"], string> = { running: "…", done: "✓", failed: "✕" };

/** One line under the state word: the turn's real steps and the times code measured; a running step has no time yet. */
export function ProgressLine({ steps, lang }: { steps: WorkStep[]; lang: Lang }) {
  const { shown, earlier } = progressItems(steps);
  if (!shown.length) return null;
  const ta = lang === "ta";
  return (
    <ol className="hud-progress" lang={lang} data-testid="progress" aria-label={T(lang, "Steps", "படிகள்")}>
      {earlier > 0 && <li className="more">+{earlier}</li>}
      {shown.map((s) => (
        <li key={s.id} className={s.state}>
          <i aria-hidden="true">{MARK[s.state]}</i>
          <span lang={isTa(s.label) ? "ta" : "en"}>{s.label}</span>
          {s.ms != null && s.state !== "running" ? <small>{fmtMs(s.ms, ta)}</small> : null}
        </li>
      ))}
    </ol>
  );
}

/** Where the answer came from, in one line: tap it for the rows or the visual it rests on. */
export function EvidenceChip({ e, lang, onOpen }: { e: HudEvidence; lang: Lang; onOpen?: () => void }) {
  const parts = evidenceParts(e, lang === "ta");
  const label = `${T(lang, "How I know", "எப்படித் தெரியும்")}: ${parts.join(" · ")}`;
  const body = (
    <>
      <I n={e.by === "ai" ? "ai" : "tasks"} />
      {/* 28 Nov (the owner: the bar's line was cut into fragments): one short label, the whole on hover and on click */}
      <span className="hud-ev-k">{T(lang, "How I know", "எப்படித் தெரியும்")}</span>
      {[parts[0], parts.find((p) => /^n = /.test(p)) ?? parts[2]].filter(Boolean).map((p, i) => <span key={i}>{p}</span>)}
    </>
  );
  return onOpen
    ? <button type="button" className="hud-ev" lang={lang} onClick={onOpen} title={`${label}. ${T(lang, "Click for the rows this answer rests on", "இந்தப் பதிலின் தரவைக் காண அழுத்துங்கள்")}`} aria-label={label} data-testid="evidence">{body}</button>
    : <p className="hud-ev" lang={lang} aria-label={label} title={label} data-testid="evidence">{body}</p>;
}

const STEP_WORD: Record<HudMissionStepState, [string, string]> = {
  pending: ["waiting", "காத்திருக்கிறது"], running: ["running", "நடக்கிறது"], done: ["done", "முடிந்தது"], skipped: ["skipped", "தவிர்த்தது"], failed: ["failed", "தோல்வி"]
};

/** A mission: its plan with Start and Edit; once started, each step ticks with its real time, and Stop. */
export function MissionCard({ m, lang, a }: { m: HudMission; lang: Lang; a: HudActions }) {
  const phase = missionPhase(m);
  const ta = lang === "ta";
  const total = phase === "done" ? missionMs(m) : null;
  return (
    <section className={`th-card hud-mission ${phase}`} role="group" aria-label={m.title} lang={lang} data-testid="mission">
      <header>
        <I n="flow" />
        <b lang={isTa(m.title) ? "ta" : "en"}>{m.title}</b>
        <small>{phase === "plan" ? T(lang, "Plan", "திட்டம்") : phase === "running" ? T(lang, "Running", "நடக்கிறது") : T(lang, "Done", "முடிந்தது")}{total != null ? ` · ${fmtMs(total, ta)}` : ""}</small>
      </header>
      <ol>
        {m.steps.map((x, i) => (
          <li key={i} className={x.state} aria-current={x.state === "running" ? "step" : undefined}>
            <i className="tick" aria-hidden="true">{x.state === "done" ? "✓" : x.state === "failed" ? "✕" : x.state === "skipped" ? "–" : ""}</i>
            <span lang={isTa(x.label) ? "ta" : "en"}>{x.label}</span>
            <small>{x.ms != null ? fmtMs(x.ms, ta) : ""}<span className="hud-sr"> {STEP_WORD[x.state][ta ? 1 : 0]}</span></small>
          </li>
        ))}
      </ol>
      <div className="row">
        {phase === "plan" && <>
          <button className="primary" onClick={a.onMissionStart} disabled={!a.onMissionStart}><I n="play" />{T(lang, "Start", "தொடங்கு")}</button>
          <button onClick={a.onMissionEdit} disabled={!a.onMissionEdit}><I n="edit" />{T(lang, "Edit", "மாற்று")}</button>
          <button onClick={a.onMissionStop} disabled={!a.onMissionStop}>{T(lang, "Not now", "வேண்டாம்")}</button>
        </>}
        {phase === "running" && <button className="primary" onClick={a.onMissionStop} disabled={!a.onMissionStop}><I n="stop" />{T(lang, "Stop", "நிறுத்து")}</button>}
        {phase === "done" && <button onClick={a.onMissionStop} disabled={!a.onMissionStop}>{T(lang, "Close", "மூடு")}</button>}
      </div>
    </section>
  );
}

/** Something Jarvis noticed: a chime once, one line, and the Collector decides when to hear it. */
export function InterjectionCard({ x, lang, a }: { x: HudInterjection; lang: Lang; a: HudActions }) {
  const chimed = useRef<string | null>(null);
  useEffect(() => {
    if (chimed.current === x.id) return;
    chimed.current = x.id;
    a.chime?.();
  }, [x.id]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <section className={`th-card hud-int sev-${x.severity}`} role="group" aria-label={T(lang, "Jarvis noticed something", "ஜார்விஸ் ஒன்றைக் கவனித்தது")} lang={lang} data-testid="interjection">
      <p lang={isTa(x.text) ? "ta" : "en"}><I n="bell" />{x.text}</p>
      <div className="row">
        <button className="primary" onClick={() => a.onTellMe?.(x.id)} disabled={!a.onTellMe}>{T(lang, "Tell me", "சொல்லுங்கள்")}</button>
        <button onClick={() => a.onLater?.(x.id)} disabled={!a.onLater}>{T(lang, "Later", "பிறகு")}</button>
        {a.onNotAbout && <button onClick={() => a.onNotAbout?.(x.id)}>{T(lang, "Not about this", "இதைப் பற்றி வேண்டாம்")}</button>}
      </div>
    </section>
  );
}

/** The signals waiting: a count, which hears them when tapped. */
export function QueueBadge({ n, lang, onOpen }: { n: number; lang: Lang; onOpen?: () => void }) {
  if (n <= 0) return null;
  const label = T(lang, `${n} waiting`, `${n} காத்திருக்கின்றன`);
  return (
    <button type="button" className="hud-btn hud-queue" onClick={onOpen} disabled={!onOpen} title={T(lang, "Things I noticed, waiting for you", "நான் கவனித்தவை, உங்களுக்காகக் காத்திருக்கின்றன")} data-testid="queue">
      <I n="bell" /><em>{n > 99 ? "99+" : n}</em><span className="hud-sr">{label}</span>
    </button>
  );
}
