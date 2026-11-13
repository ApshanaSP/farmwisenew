"use client";
/** Public: where a petition stands, for anyone holding the slip. The QR code opens this page already filled in. */
import { useCallback, useEffect, useRef, useState } from "react";
import "@/components/manu/manu.css";
import { typedDigits } from "@/lib/typed-digits";
import { shownStatus as shown } from "@/lib/manu/track-words";
import LangToggle from "@/components/LangToggle";
import { getLang, hasLangChoice, setLang, useLang, type UiLang } from "@/lib/i18n/lang";

interface Step { status: string; stage: string; note: string | null; at: string }
interface View { code: string; status: string; filedAt: string; department: string; dueBy: string | null; lang?: "ta" | "en" | null; steps: Step[] }

// The page is in English and the site's Translator puts the hand-checked Tamil in place (lib/i18n/ta.ts); a Tamil petitioner, sent here by
// the SMS, got English everything but the heading, with no switch (hunt2-desk-15). Dates follow the language too.
const locale = (l: UiLang) => (l === "ta" ? "ta-IN" : "en-IN");
const day = (t: string, l: UiLang) => new Date(`${t.replace(" ", "T")}+05:30`).toLocaleString(locale(l), { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
const dateOnly = (t: string, l: UiLang) => new Date(`${t.replace(" ", "T")}+05:30`).toLocaleDateString(locale(l), { timeZone: "Asia/Kolkata", day: "numeric", month: "long", year: "numeric" });

export default function TrackPage() {
  const [code, setCode] = useState(""), [last4, setLast4] = useState("");
  const [view, setView] = useState<View | null>(null), [err, setErr] = useState<string | null>(null), [busy, setBusy] = useState(false);
  const [lang] = useLang();

  const ask = useCallback(async (c: string, body: { key?: string; last4?: string }) => {
    setBusy(true); setErr(null);
    try {
      const r = await fetch("/api/track", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: c, ...body }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Tracking is not available just now.");
      setView(j);
      // a Tamil petition opens in Tamil, for this visit, unless the person has chosen a language here
      if (j.lang === "ta" && getLang() !== "ta" && !hasLangChoice()) setLang("ta", false);
    } catch (e) { setView(null); setErr((e as Error).message); } finally { setBusy(false); }
  }, []);

  const codeBox = useRef<HTMLInputElement>(null);
  /** Back to an empty form for another slip (journeys-02). The QR link's number and key leave the address too, or a reload shows the old result. */
  const checkAnother = useCallback(() => {
    setView(null); setErr(null); setCode(""); setLast4("");
    if (window.location.search) window.history.replaceState(window.history.state, "", window.location.pathname);
    setTimeout(() => codeBox.current?.focus(), 0);
  }, []);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const c = q.get("code") ?? "", k = q.get("k") ?? "";
    if (c) setCode(c);
    if (c && k) void ask(c, { key: k });
  }, [ask]);

  return (
    <main className="trk diq-bg" style={{ minHeight: "100dvh" }}>
      <div style={{ display: "flex", justifyContent: "flex-end" }}><LangToggle /></div>
      <h1>உங்கள் மனுவின் நிலை</h1>
      <p>Track your petition or complaint</p>
      {!view && (
        <form className="trk-card trk-form" onSubmit={(e) => { e.preventDefault(); void ask(code, { last4 }); }}>
          <label>Number on your slip<input ref={codeBox} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="2026-123ABC" autoComplete="off" /></label>
          <label>Last 4 digits of your mobile<input value={last4} onChange={(e) => setLast4(typedDigits(e.target.value))} inputMode="numeric" maxLength={4} autoComplete="off" /></label>
          <button className="trk-btn" disabled={busy}>{busy ? "Checking…" : "Check status"}</button>
          {err && <p className="trk-err" role="alert">{err}</p>}
        </form>
      )}
      {view && (
        <section className="trk-card">
          <div className="trk-status"><small>{view.code}</small><b>{shown(view.status)}</b></div>
          <div className="trk-meta">
            <span>With: {view.department}</span>
            <span>Received: {day(view.filedAt, lang)}</span>
            {view.dueBy && <span>Expected by: {dateOnly(view.dueBy, lang)}</span>}
          </div>
          <ol className="trk-steps">
            {view.steps.map((s, k) => <li key={k}><b>{shown(s.status)}</b><small>{day(s.at, lang)}</small>{s.note && <p>{s.note}</p>}</li>)}
          </ol>
          <button type="button" className="trk-btn" style={{ marginTop: 14 }} onClick={checkAnother}>Check another number</button>
        </section>
      )}
    </main>
  );
}
