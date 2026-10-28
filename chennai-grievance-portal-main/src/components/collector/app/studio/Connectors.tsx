"use client";

/**
 * The Connectors tab: every dataset kept up to date by a Live Connector, its health (Healthy, Late, Failing, Paused,
 * Needs review), its source and schedule, the last success and the next run, the rows each run added (a 30-day
 * sparkline), and its history. A self-heal proposal (new columns) and a quarantine (a suspicious change) wait here
 * for a person's answer; the last good data stays live meanwhile.
 */
import { useCallback, useEffect, useState } from "react";
import type { Console } from "../CollectorApp";
import { I, type IconName } from "../icons";
import { api } from "./client";
import { LangSwitch, day, useLang } from "./Outcome";

type Health = "healthy" | "late" | "failing" | "paused" | "review";
interface Run { at: string; kind: string; ok: boolean; rowsAdded: number | null; rows: number | null; note: string }
export interface ConnView {
  id: string; dataset: string; url: string; locate: string; pattern: string | null; mode: "replace" | "append" | "snapshots";
  schedule: { every: "hourly" | "daily" | "weekly"; at: string; tolerance: number }; status: Health; paused: boolean; rows: number; retention: number;
  lastOkAt: string | null; lastRunAt: string | null; nextAt: string; retryAt: string | null; history: Run[]; key: string[];
  proposal: { at: string; old: string[]; next: string[]; mapping: Record<string, string | null> } | null;
  quarantine: { at: string; why: string; rows: number } | null;
}

const T = {
  en: { title: "Live Connectors", sub: "Datasets that keep themselves up to date from the sites that publish them.", none: "No connector yet. Open a dataset added from a link and press “Keep this updated”.",
    run: "Run now", pause: "Pause", resume: "Resume", history: "History", open: "Open dataset", edit: "Schedule", save: "Save", cancel: "Cancel", backfill: "Fill in past days",
    last: "Last success", next: "Next run", added: "Added last run", rows: "rows", runs: "rows added per run, last 30 days", server: "Connectors run while District IQ's server is running.",
    approve: "Map to the old columns", approveNew: "Keep the new columns", accept: "Approve the held data", reject: "Reject it",
    h: { healthy: "Healthy", late: "Late", failing: "Failing", paused: "Paused", review: "Needs review" } as Record<Health, string>,
    every: { hourly: "Hourly", daily: "Daily", weekly: "Weekly" }, mode: { replace: "Replace", append: "Append", snapshots: "Snapshots" } },
  ta: { title: "நேரடி இணைப்புகள்", sub: "வெளியிடும் தளங்களிலிருந்து தாமாகப் புதுப்பிக்கப்படும் தரவுத்தொகுப்புகள்.", none: "இன்னும் இணைப்பு இல்லை. இணைப்பிலிருந்து சேர்த்த தரவைத் திறந்து “புதுப்பித்து வை” அழுத்தவும்.",
    run: "இப்போது இயக்கு", pause: "நிறுத்து", resume: "தொடர்", history: "வரலாறு", open: "தரவைத் திற", edit: "அட்டவணை", save: "சேமி", cancel: "ரத்து", backfill: "முந்தைய நாட்களை நிரப்பு",
    last: "கடைசி வெற்றி", next: "அடுத்த ஓட்டம்", added: "கடைசியில் சேர்ந்தவை", rows: "வரிசைகள்", runs: "ஒவ்வொரு ஓட்டத்திலும் சேர்ந்த வரிசைகள், 30 நாட்கள்", server: "District IQ சர்வர் இயங்கும்போது மட்டுமே இணைப்புகள் இயங்கும்.",
    approve: "பழைய நெடுவரிசைகளுடன் இணை", approveNew: "புதிய நெடுவரிசைகளை வைத்துக்கொள்", accept: "நிறுத்திய தரவை ஏற்று", reject: "நிராகரி",
    h: { healthy: "நலம்", late: "தாமதம்", failing: "தோல்வி", paused: "நிறுத்தப்பட்டது", review: "பார்வை தேவை" } as Record<Health, string>,
    every: { hourly: "மணிக்கு ஒருமுறை", daily: "தினமும்", weekly: "வாரந்தோறும்" }, mode: { replace: "மாற்று", append: "சேர்", snapshots: "படிகள்" } }
};
const HEALTH_IC: Record<Health, IconName> = { healthy: "checkc", late: "clock", failing: "alert", paused: "stop", review: "info" };

const when = (iso: string | null) => {
  if (!iso) return "—";
  const d = new Date(Date.parse(iso) + 5.5 * 3600_000).toISOString();
  return `${day(d.slice(0, 10))}, ${d.slice(11, 16)} IST`;
};

function Spark({ runs }: { runs: Run[] }) {
  const since = Date.now() - 30 * 864e5;
  const xs = runs.filter((r) => Date.parse(r.at) >= since && r.kind === "new").map((r) => Math.max(0, r.rowsAdded ?? 0)).reverse();
  if (xs.length < 2) return <span className="ds-muted">—</span>;
  const w = 120, h = 26, max = Math.max(1, ...xs);
  const pts = xs.map((v, i) => `${((i / (xs.length - 1)) * w).toFixed(1)},${(h - 2 - (v / max) * (h - 4)).toFixed(1)}`).join(" ");
  return <svg className="ds-conn-spark" viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`${xs.length} runs; most rows added in one run: ${max.toLocaleString("en-IN")}`}><polyline points={pts} fill="none" stroke="currentColor" strokeWidth="1.8" /></svg>;
}

export default function Connectors({ c, onOpen, onChanged }: { c: Console; onOpen: (id: string) => void; onChanged: () => void }) {
  const [lang, setLang] = useLang();
  const t = T[lang];
  const [list, setList] = useState<ConnView[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState<Record<string, "history" | "edit" | null>>({});
  const load = useCallback(async () => {
    try { const r = await api<{ connectors: ConnView[] }>("/api/collector/studio/connectors"); setList(r.connectors); setErr(null); } catch (e) { setErr((e as Error).message); }
  }, []);
  useEffect(() => { load(); }, [load]);
  const act = async (id: string, action: string, extra: object = {}) => {
    setBusy(`${id}:${action}`);
    try {
      const r = await api<{ run: Run | null }>("/api/collector/studio/connectors", { json: { action, id, ...extra } });
      if (r.run) c.toast(r.run.note.slice(0, 160), r.run.ok ? "ok" : "alert");
      await load();
      onChanged();
    } catch (e) { c.toast((e as Error).message, "alert"); }
    setBusy(null);
  };

  return (
    <section className="ds-span card ds-conns" aria-labelledby="ds-conns-t">
      <header className="ds-out-h">
        <span className="ds-out-ic k-choose"><I n="refresh" /></span>
        <div className="ds-out-ht"><h2 id="ds-conns-t" lang={lang}>{t.title}</h2><small className="ds-muted" lang={lang}>{t.sub} {t.server}</small></div>
        <LangSwitch lang={lang} setLang={setLang} />
      </header>
      {err && <p className="ds-out-why" role="alert"><I n="alert" />{err} <button className="ds-lnk" onClick={load}>Retry</button></p>}
      {!list && !err && <div className="ds-conn-l" aria-live="polite" aria-busy="true"><div className="ds-skel sm" /><div className="ds-skel sm" /></div>}
      {list && !list.length && <div className="ds-empty big"><I n="refresh" /><span lang={lang}>{t.none}</span></div>}
      <div className="ds-conn-l">
        {list?.map((k) => {
          const last = k.history.find((h) => h.kind === "new");
          const o = open[k.id];
          return (
            <article key={k.id} className={`ds-conn h-${k.status}`}>
              <header className="ds-conn-h">
                <span className={`ds-health h-${k.status}`} lang={lang}><I n={HEALTH_IC[k.status]} />{t.h[k.status]}</span>
                <div className="ds-conn-t"><b>{k.dataset}</b><small title={k.url}>{k.pattern ?? k.url.replace(/^https?:\/\//, "")}</small></div>
                <span className="ds-tag">{t.every[k.schedule.every]} · {k.schedule.at} IST · {t.mode[k.mode]}</span>
              </header>
              <dl className="ds-conn-m">
                <div><dt lang={lang}>{t.last}</dt><dd>{when(k.lastOkAt)}</dd></div>
                <div><dt lang={lang}>{t.next}</dt><dd>{k.paused ? "—" : when(k.retryAt ?? k.nextAt)}</dd></div>
                <div><dt lang={lang}>{t.added}</dt><dd>{last ? `${(last.rowsAdded ?? 0).toLocaleString("en-IN")} ${t.rows}` : "—"} · {k.rows.toLocaleString("en-IN")} in all</dd></div>
                <div><dt lang={lang}>{t.runs}</dt><dd><Spark runs={k.history} /></dd></div>
              </dl>
              {k.history[0] && <p className="ds-conn-note">{k.history[0].note}</p>}
              {k.proposal && (
                <div className="ds-conn-q" role="group" aria-label="Self-heal proposal">
                  <b>The columns changed. Proposed mapping (new → old):</b>
                  <ul>{Object.entries(k.proposal.mapping).map(([n, m]) => <li key={n}><code>{n}</code> → {m ? <code>{m}</code> : <i>new column</i>}</li>)}</ul>
                  <div className="ds-out-acts">
                    <button className="ds-btn" disabled={!!busy} onClick={() => act(k.id, "approve")}><I n="check" /><span lang={lang}>{t.approve}</span></button>
                    <button className="ds-ghost" disabled={!!busy} onClick={() => act(k.id, "approveNew")}><span lang={lang}>{t.approveNew}</span></button>
                  </div>
                </div>
              )}
              {k.quarantine && (
                <div className="ds-conn-q" role="group" aria-label="Quarantine">
                  <b>Held in quarantine:</b> {k.quarantine.why} The last good data stays live.
                  <div className="ds-out-acts">
                    <button className="ds-ghost" disabled={!!busy} onClick={() => act(k.id, "accept")}><I n="check" /><span lang={lang}>{t.accept}</span></button>
                    <button className="ds-btn" disabled={!!busy} onClick={() => act(k.id, "reject")}><I n="x" /><span lang={lang}>{t.reject}</span></button>
                  </div>
                </div>
              )}
              <div className="ds-out-acts">
                <button className="ds-btn sm" disabled={!!busy || !!k.proposal || !!k.quarantine} onClick={() => act(k.id, "run")}>{busy === `${k.id}:run` ? <span className="ds-spin sm" /> : <I n="play" />}<span lang={lang}>{t.run}</span></button>
                <button className="ds-ghost" disabled={!!busy} onClick={() => act(k.id, k.paused ? "resume" : "pause")}><I n={k.paused ? "play" : "stop"} /><span lang={lang}>{k.paused ? t.resume : t.pause}</span></button>
                <button className="ds-ghost" aria-expanded={o === "edit"} onClick={() => setOpen((x) => ({ ...x, [k.id]: o === "edit" ? null : "edit" }))}><I n="cal" /><span lang={lang}>{t.edit}</span></button>
                <button className="ds-ghost" aria-expanded={o === "history"} onClick={() => setOpen((x) => ({ ...x, [k.id]: o === "history" ? null : "history" }))}><I n="clock" /><span lang={lang}>{t.history}</span></button>
                {k.locate === "newest-file-matching" && <button className="ds-ghost" disabled={!!busy} onClick={() => act(k.id, "backfill", { days: 10 })}><I n="download" /><span lang={lang}>{t.backfill}</span></button>}
                <button className="ds-ghost" onClick={() => onOpen(k.id)}><I n="right" /><span lang={lang}>{t.open}</span></button>
              </div>
              {o === "edit" && <ScheduleForm k={k} t={t} lang={lang} onSave={(s) => { act(k.id, "schedule", s); setOpen((x) => ({ ...x, [k.id]: null })); }} onCancel={() => setOpen((x) => ({ ...x, [k.id]: null }))} />}
              {o === "history" && (
                <ol className="ds-conn-hist">
                  {k.history.map((h, i) => <li key={i} className={`k-${h.kind}${h.ok ? "" : " bad"}`}><time>{when(h.at)}</time><span>{h.note}</span></li>)}
                </ol>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function ScheduleForm({ k, t, lang, onSave, onCancel }: { k: ConnView; t: (typeof T)["en"]; lang: string; onSave: (s: object) => void; onCancel: () => void }) {
  const [every, setEvery] = useState(k.schedule.every);
  const [at, setAt] = useState(k.schedule.at);
  const [tol, setTol] = useState(k.schedule.tolerance);
  const [mode, setMode] = useState(k.mode);
  return (
    <form className="ds-conn-form" onSubmit={(e) => { e.preventDefault(); onSave({ every, at, tolerance: tol, mode }); }}>
      <label><span lang={lang}>{t.edit}</span><select value={every} onChange={(e) => setEvery(e.target.value as typeof every)}>{(["hourly", "daily", "weekly"] as const).map((x) => <option key={x} value={x}>{t.every[x]}</option>)}</select></label>
      <label><span>At (IST)</span><input type="time" value={at} onChange={(e) => setAt(e.target.value)} required /></label>
      <label><span>Grace (minutes)</span><input type="number" min={0} max={10080} value={tol} onChange={(e) => setTol(Number(e.target.value))} /></label>
      <label><span>Mode</span><select value={mode} onChange={(e) => setMode(e.target.value as typeof mode)}>{(["replace", "append", "snapshots"] as const).map((x) => <option key={x} value={x}>{t.mode[x]}</option>)}</select></label>
      <div className="ds-out-acts"><button className="ds-btn sm"><span lang={lang}>{t.save}</span></button><button type="button" className="ds-ghost" onClick={onCancel}><span lang={lang}>{t.cancel}</span></button></div>
    </form>
  );
}
