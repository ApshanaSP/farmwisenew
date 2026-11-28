"use client";
/**
 * The action tracker inside Rain's four tabs (RainView.tsx, ImpactView.tsx): what was asked of which department at each place a
 * rain hit, how far it has got, and whether the place held in the next comparable rain. Pieces, each inside the existing
 * screens, no steps to walk through:
 *   FixSummary  a tab's all-rains screen: one line of numbers, the stages, and the list of places acted on
 *   BulkFix     a rain's screen: every place it hit, how many are tracked, and one button to assign the rest to their departments
 *   FixPill     a list row: the place's stage or outcome
 *   FixBox      a place's card: assign it (department, what to change, due date), or follow it (steps, photos, verify / send back,
 *               the outcome at the next rain)
 * Data: /api/rehearsal/tasks/collector (lib/rehearsal/trackview.ts). Every assign, verify and send-back is confirmed with the
 * Collector's password (the console's confirm box picks up the request).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { I } from "../icons";
import type { PastRain, RChoke, RStreet } from "@/lib/rehearsal/types";
import type { RainStreet } from "@/lib/rehearsal/satflood";
import type { FixView, TrackPayload } from "@/lib/rehearsal/trackview";
import { COMPARABLE_SHARE, defaultDue, floodDefault, newestByPlace, summarize, type FixLens, type OutcomeView, type RainTest, type Stage, type TrailEvent } from "@/lib/rehearsal/tracker";
import type { RainApi } from "./rainLayer";
import { fmtD, fmtT, n0, plural, range } from "./rainKit";
import "./fixtrack.css";

export const TRACK_URL = "/api/rehearsal/tasks/collector";
const today = () => new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
const plusDays = (d: string, n: number) => new Date(Date.parse(d + "T00:00:00Z") + n * 86_400_000).toISOString().slice(0, 10);

/** each tab's words */
export const FIX_WORD: Record<FixLens, { one: string; many: string; again: string; held: string; hit: string }> = {
  flood: { one: "street", many: "streets", again: "Flooded again", held: "no flooding", hit: "flooded" },
  traffic: { one: "road", many: "roads", again: "Jammed again", held: "no jam", hit: "jammed" },
  power: { one: "ward", many: "wards", again: "Lost power again", held: "power stayed on", hit: "lost power" },
  metro: { one: "line", many: "lines", again: "Late again", held: "trains on time", hit: "ran late" }
};
const STAGE_WORD: Record<Stage, string> = { open: "No action yet", assigned: "Assigned", in_action: "In action", done: "Done · check it", verified: "Verified", closed: "Withdrawn" };
const STEP_WORD: Record<TrailEvent["step"], string> = { assign: "Assigned", progress: "Update", done: "Marked done", verify: "Verified by you", reopen: "Sent back", withdraw: "Withdrawn by you", reassign: "Moved by you" };

export interface Fixes {
  /** null: no tracker here (the dev preview) */
  url: string | null;
  data: TrackPayload | null;
  err: string | null;
  reload: () => void;
  /** a place's fixes, newest first */
  forPlace: (lens: FixLens, place: string) => FixView[];
  deptName: (code: string) => string;
  post: (body: Record<string, unknown>) => Promise<Record<string, any> | null>; // eslint-disable-line @typescript-eslint/no-explicit-any
  toast: (msg: string, kind?: "ok" | "alert") => void;
  /** the rains, to name them */
  rainBy: Map<string, PastRain>;
}

/** the tracker, read once when Rain opens and again after each change; `rains` names the rains in its words */
export function useFixes(api: RainApi, toast: (msg: string, kind?: "ok" | "alert") => void, rains: PastRain[]): Fixes {
  const url = api.state.startsWith("/api/rehearsal/dev") ? null : TRACK_URL;
  const [data, setData] = useState<TrackPayload | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const toastRef = useRef(toast);
  toastRef.current = toast;
  const reload = useCallback(() => {
    if (!url) return;
    fetch(url).then((r) => r.json().then((j) => { if (r.ok) { setData(j); setErr(null); } else setErr(j.error ?? "The action tracker could not be read."); }))
      .catch(() => setErr("The action tracker could not be read."));
  }, [url]);
  // read again every 2 minutes while Rain is open, so a fix the department marks done shows up for checking without a reload
  useEffect(() => { reload(); const t = setInterval(reload, 120_000); return () => clearInterval(t); }, [reload]);
  const post = useCallback(async (body: Record<string, unknown>) => {
    if (!url) return null;
    try {
      const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { toastRef.current(r.status === 428 ? "Not confirmed: nothing was changed." : j.error ?? "That could not be done.", "alert"); return null; }
      reload();
      return j;
    } catch { toastRef.current("That could not be done. Check the connection and try again.", "alert"); return null; }
  }, [url, reload]);
  const byPlace = useMemo(() => {
    const m = new Map<string, FixView[]>();
    for (const f of data?.fixes ?? []) { const k = `${f.lens}|${f.place}`; (m.get(k) ?? m.set(k, []).get(k)!).push(f); }
    for (const v of m.values()) v.sort((a, b) => b.id - a.id);
    return m;
  }, [data]);
  const names = useMemo(() => new Map((data?.depts ?? []).map((d) => [d.code, d.name])), [data]);
  const rainBy = useMemo(() => new Map(rains.map((r) => [r.id, r])), [rains]);
  return {
    url, data, err, reload, post, toast, rainBy,
    forPlace: (lens, place) => byPlace.get(`${lens}|${place}`) ?? [],
    deptName: (code) => names.get(code) ?? code
  };
}

const rainName = (fx: Fixes, id: string | null) => {
  if (!id) return "";
  const r = fx.rainBy.get(id);
  return r ? range(r) : fmtD(id.replace(/^rain-/, ""));
};

/** the stage, or the outcome once a rain has tested the place */
function pillOf(f: FixView): { cls: string; text: string; title: string } {
  const w = FIX_WORD[f.lens];
  if (f.outcome.kind === "again") return { cls: "again", text: w.again, title: `${w.again} in a rain after the work was done` };
  if (f.outcome.kind === "held") return { cls: "held", text: "Resolved", title: `${w.held[0].toUpperCase()}${w.held.slice(1)} in a comparable rain after the work was done` };
  return { cls: f.late ? "late" : f.stage, text: f.late ? `${STAGE_WORD[f.stage]} · late` : STAGE_WORD[f.stage], title: f.due ? `Due ${fmtD(f.due)}` : STAGE_WORD[f.stage] };
}

export function FixPill({ fx, lens, place }: { fx?: Fixes; lens: FixLens; place: string }) {
  const f = fx?.forPlace(lens, place)[0];
  if (!f) return null;
  const p = pillOf(f);
  return <span className={`fx-pill s-${p.cls}`} title={p.title}>{p.text}</span>;
}

/** one rain test in words: how the rain at the place compared */
function testWords(fx: Fixes, t: RainTest, cause: string): string {
  if (t.basis === "none") return `no reliable gauge figure for both rains`;
  const where = t.basis === "ward" ? "in the ward" : t.basis === "district" ? "across the district" : "at the wettest gauge";
  return `${Math.round(t.laterMm ?? 0)} mm ${where}, against ${Math.round(t.causeMm ?? 0)} mm in the ${rainName(fx, cause)} rain`;
}

/** the outcome in one or two plain sentences */
export function outcomeWords(fx: Fixes, f: FixView): string {
  const w = FIX_WORD[f.lens], o: OutcomeView = f.outcome;
  const t = o.rain ? o.tests.find((x) => x.rain === o.rain) : null;
  const before = o.tests.filter((x) => x.result === "before").map((x) => rainName(fx, x.rain));
  const pre = before.length ? `It ${w.hit} again in the ${before.join(" and ")} rain, before the work was done. ` : "";
  if (o.kind === "again" && t) return `${w.again} in the ${rainName(fx, t.rain)} rain, after the work was done (${testWords(fx, t, f.rain)}).`;
  // a re-flood after the work is never hidden by a later dry rain
  const earlierAgain = (o.againIn ?? []).filter((id) => id !== o.rain).map((id) => rainName(fx, id));
  const was = earlierAgain.length ? ` It ${w.hit} again in the ${earlierAgain.join(" and ")} rain after the work.` : "";
  if (o.kind === "held" && t) return `Resolved: ${w.held} in the ${rainName(fx, t.rain)} rain (${testWords(fx, t, f.rain)}).${was}`;
  if (o.why === "no-figure") return `${pre}The rains since had no reliable gauge figure to compare, so they cannot test it yet.`;
  if (o.why === "not-done") return `${pre}The next heavy rain tests it once the work is done.`;
  if (o.why === "open") { const x = o.tests.find((y) => y.result === "open")!; return `${pre}The ${rainName(fx, x.rain)} rain's reports are still coming in.`; }
  if (o.why === "lighter") {
    const x = [...o.tests].reverse().find((y) => y.result === "lighter")!;
    const need = x.causeMm != null ? ` A rain of ${Math.ceil(COMPARABLE_SHARE * x.causeMm)} mm or more tests it.` : "";
    return `${pre}Only lighter rain since the work was done (${testWords(fx, x, f.rain)}).${need}`;
  }
  if (o.why === "no-cause") return "Its rain record could not be read, so it cannot be tested now.";
  return `${pre}No heavy rain since the work was done: the next one tests it.`;
}

const who = (e: TrailEvent) => (e.step === "assign" || e.step === "verify" || e.step === "reopen" || e.step === "withdraw" || e.step === "reassign" ? "Collector" : e.by.split("@")[0] || "Officer");
const photoUrl = (p: string) => `/api/rehearsal/photo/${p}`;

/**
 * A tab's tracker on its all-rains screen: "12 streets acted on · 8 resolved in the 18 Nov rain · 2 flooded again · 2 not
 * yet tested", the stages, and the places (what needs the Collector first). Nothing before the first action but one line.
 */
export function FixSummary({ fx, lens, onOpen }: { fx?: Fixes; lens: FixLens; onOpen: (f: FixView) => void }) {
  const [open, setOpen] = useState(false);
  if (!fx?.url) return null;
  const w = FIX_WORD[lens];
  if (!fx.data) return fx.err ? <p className="fx-sum-empty"><I n="alert" />{fx.err}</p> : null;
  const rows = [...newestByPlace(fx.data.fixes.filter((f) => f.lens === lens)).values()];
  if (!rows.length) return <p className="fx-sum-empty"><I n="tasks" />No {w.many} acted on yet. Open a rain to assign the {w.many} it hit to their departments and track them here.</p>;
  const s = summarize(rows, lens);
  const tested = s.testedIn.length === 1 ? ` in the ${rainName(fx, s.testedIn[0])} rain` : "";
  // what needs the Collector first: done (to check), hit again, late; then in action, assigned; resolved and verified last
  const rank = (f: FixView) => (f.stage === "done" ? 0 : f.outcome.kind === "again" ? 1 : f.late ? 2 : f.stage === "in_action" ? 3 : f.stage === "assigned" ? 4 : 5);
  const list = rows.sort((a, b) => rank(a) - rank(b) || (a.due ?? "").localeCompare(b.due ?? "") || b.id - a.id);
  const chips: [string, number, string][] = [["done", s.done, "Done, to check"], ["late", s.late, "Late"], ["in_action", s.inAction, "In action"], ["assigned", s.assigned, "Assigned"], ["verified", s.verified, "Verified"]];
  return (
    <section className="fx-sum" aria-label="Action tracker">
      <h4><I n="tasks" />Action tracker</h4>
      <p className="fx-line">
        <b>{n0(s.places)}</b> {s.places === 1 ? w.one : w.many} acted on · <b className="ok">{n0(s.held)}</b> resolved{tested} · <b className="bad">{n0(s.again)}</b> {w.again.toLowerCase()} · <b>{n0(s.pending)}</b> not yet tested
      </p>
      <ul className="fx-chips">{chips.filter(([, n]) => n > 0).map(([k, n, t]) => <li key={k} className={`s-${k}`}><b>{n0(n)}</b>{t}</li>)}</ul>
      <button className="fx-more" onClick={() => setOpen((v) => !v)} aria-expanded={open}>{open ? "Hide the list" : `Show the ${plural(s.places, w.one, w.many)}`}<I n={open ? "up" : "chevd"} /></button>
      {open && (
        <ul className="fx-rows">
          {list.map((f) => {
            const p = pillOf(f);
            const last = [...f.trail].reverse().find((e) => e.step !== "assign" && e.at);
            return (
              <li key={f.id}><button onClick={() => onOpen(f)}>
                <span className="fx-rn"><b>{f.label}</b><small>{f.deptName} · {f.stage === "verified" || f.stage === "done" ? `after the ${rainName(fx, f.rain)} rain` : f.due ? `due ${fmtD(f.due)}` : "no due date"}{last ? ` · updated ${fmtD(last.at)}` : ""}</small></span>
                <span className={`fx-pill s-${p.cls}`} title={p.title}>{p.text}</span>
              </button></li>
            );
          })}
        </ul>
      )}
      <details className="fx-how">
        <summary>How the next rain is checked</summary>
        <p>A place counts as resolved when a heavy rain after the work was done brought at least {Math.round(COMPARABLE_SHARE * 100)} % of the rain that led to the action, and it was not hit.
          {lens === "flood" ? ` For a street, hit means a flooding report on it or within ${fx.data.nearM} m of it, or satellite water on it when a satellite passed.` : ` Hit means the place is in that rain's record on this tab.`}
          {" "}Rain at the place is the ward&apos;s rain from the CFM-DSS gauges; where that is missing, the district average, then the wettest gauge. Only real rain counts: at least 20 mm at the ward or across the district, or 64.5 mm (IMD&apos;s heavy-rain mark) at the wettest gauge, with every day of the rain read. Without such a figure for both rains, the later rain does not test the place. A rain is read once its reports are in, two days after it ends; being hit in any later rain, even a lighter one, counts as {w.again.toLowerCase()}.</p>
      </details>
    </section>
  );
}

/** a place a rain hit, with its default department and note; `area`: its zone's name (places are reviewed and sent area by area) */
export interface FixPlace { place: string; label: string; dept: string; note: string; area?: string }

/**
 * A rain's places, AREA BY AREA (owner, 28 Nov: "not overall: area-wise review and send"): one line of totals, then one row per
 * zone with how many places have no action and which departments they go to. Opening a zone lists its places (name and
 * department) to review; its own button assigns just that zone's places (one password per zone). To change a department or a
 * note first, open the place itself.
 */
export function BulkFix({ fx, lens, rainId, places, tracked: already }: { fx?: Fixes; lens: FixLens; rainId: string; places: FixPlace[];
  /** places already in hand another way: a street with a sent "before the next heavy rain" job (the existing severe-street action) */
  tracked?: Set<string> }) {
  const [open, setOpen] = useState<string | null>(null);
  const [due, setDue] = useState(() => defaultDue(today()));
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => { setOpen(null); }, [rainId, lens]);
  if (!fx?.url || !fx.data || !places.length) return null;
  const w = FIX_WORD[lens];
  // a place may get an action unless one is unfinished, or it was already acted on for this rain
  const free = places.filter((p) => {
    if (already?.has(p.place)) return false;
    // a Traffic "water on the road" item is the same job as the Flooding tab's fix for that street and rain: not offered twice
    if (lens === "traffic" && p.place.startsWith("flood:") && fx.forPlace("flood", p.place.slice(6)).some((x) => x.rain === rainId && x.stage !== "closed")) return false;
    const xs = fx.forPlace(lens, p.place).filter((x) => x.stage !== "closed");
    return !xs.some((x) => x.stage !== "verified") && !xs.some((x) => x.rain === rainId);
  });
  const tracked = places.length - free.length;
  const areas = [...free.reduce((m, p) => {
    const k = p.area || "Place not known";
    return m.set(k, [...(m.get(k) ?? []), p]);
  }, new Map<string, FixPlace[]>()).entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
  const deptsOf = (xs: FixPlace[]) => [...xs.reduce((m, p) => m.set(p.dept, (m.get(p.dept) ?? 0) + 1), new Map<string, number>()).entries()].sort((a, b) => b[1] - a[1]);
  const go = async (area: string, xs: FixPlace[]) => {
    setBusy(area);
    const j = await fx.post({ action: "assign", lens, rain: rainId, due, items: xs.map((p) => ({ place: p.place, dept: p.dept, note: p.note })) });
    setBusy(null);
    if (j) {
      setOpen(null);
      fx.toast(`${area}: ${plural(j.created, w.one, w.many)} assigned to ${plural(j.depts, "department")}.${j.skipped?.length ? ` ${plural(j.skipped.length, w.one, w.many)} skipped.` : ""} The departments see them on their officer consoles.`, "ok");
    }
  };
  return (
    <section className="fx-bulk" aria-label="Take action, area by area">
      <p><I n="tasks" /><span><b>{n0(places.length)}</b> {places.length === 1 ? w.one : w.many} {w.hit} in this rain · <b>{n0(tracked)}</b> tracked · <b>{n0(free.length)}</b> with no action, in <b>{n0(areas.length)}</b> {areas.length === 1 ? "area" : "areas"}</span></p>
      {free.length > 0 && (
        <>
          <label className="fx-due"><span>Due by</span><input type="date" value={due} min={today()} max={plusDays(today(), 120)} onChange={(e) => setDue(e.target.value)} /></label>
          <ul className="fx-areas">
            {areas.map(([area, xs]) => {
              const on = open === area;
              const ds = deptsOf(xs);
              return (
                <li key={area} className={on ? "on" : ""}>
                  <button className="fx-area-h" onClick={() => setOpen(on ? null : area)} aria-expanded={on}>
                    <span><b>{area}</b><small>{plural(xs.length, w.one, w.many)} · {ds.map(([c, n]) => `${fx.deptName(c)}${ds.length > 1 ? ` ${n}` : ""}`).join(", ")}</small></span>
                    <span className="fx-area-go">Review<I n={on ? "up" : "chevd"} /></span>
                  </button>
                  {on && (
                    <div className="fx-area-b">
                      <ol>{xs.map((p) => <li key={p.place}><b>{p.label}</b><small>{fx.deptName(p.dept)} · {p.note}</small></li>)}</ol>
                      <div className="fx-acts">
                        <button className="rv-go" disabled={!!busy || !due} onClick={() => go(area, xs)}><I n="send" />{busy === area ? "Assigning…" : `Assign ${xs.length === 1 ? `this ${w.one}` : `these ${n0(xs.length)} ${w.many}`} in ${area}`}</button>
                        <button className="rv-btn" disabled={!!busy} onClick={() => setOpen(null)}>Close</button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          <small className="fx-areas-note">Each {w.one} goes with its own note on what to change, due by the date above. To change a department or a note first, open the {w.one} itself.</small>
        </>
      )}
    </section>
  );
}

/**
 * A place's card: assign it, or follow it. `rainId` is the rain to act on (the chosen rain when it hit the place, else the
 * latest that did); null when no rain in the record hit it.
 */
export function FixBox({ fx, lens, place, rainId, def }: { fx?: Fixes; lens: FixLens; place: string; rainId: string | null; def: { dept: string; note: string } | null }) {
  const [again, setAgain] = useState(false);
  useEffect(() => { setAgain(false); }, [place, rainId]);
  if (!fx?.url) return null;
  if (!fx.data) return fx.err ? <section className="fx-box"><p className="rv-muted">{fx.err}</p></section> : null;
  const w = FIX_WORD[lens];
  const xs = fx.forPlace(lens, place);
  const cur = xs[0] ?? null;
  const live = xs.filter((x) => x.stage !== "closed");
  const canNew = !!rainId && !!def && !live.some((x) => x.stage !== "verified") && !live.some((x) => x.rain === rainId);
  if (!cur) {
    if (!rainId || !def) return null;
    return (
      <section className="fx-box">
        <h4><I n="send" />Take action <small>after the {rainName(fx, rainId)} rain</small></h4>
        <AssignForm fx={fx} lens={lens} place={place} rainId={rainId} def={def} />
      </section>
    );
  }
  return (
    <section className="fx-box">
      <h4><I n="tasks" />Action on this {w.one} {xs.length > 1 && <small>{xs.length} actions, newest first</small>}</h4>
      <FixDetail fx={fx} f={cur} />
      {xs.slice(1).map((f) => (
        <details key={f.id} className="fx-old"><summary>Earlier: after the {rainName(fx, f.rain)} rain · {pillOf(f).text}</summary><FixDetail fx={fx} f={f} /></details>
      ))}
      {canNew && (again
        ? <AssignForm fx={fx} lens={lens} place={place} rainId={rainId!} def={def!} onCancel={() => setAgain(false)} />
        : <button className="rv-btn fx-again" onClick={() => setAgain(true)}><I n="plus" />Take a new action after the {rainName(fx, rainId)} rain</button>)}
    </section>
  );
}

function AssignForm({ fx, lens, place, rainId, def, onCancel }: { fx: Fixes; lens: FixLens; place: string; rainId: string; def: { dept: string; note: string }; onCancel?: () => void }) {
  const [dept, setDept] = useState(def.dept);
  const [note, setNote] = useState(def.note);
  const [due, setDue] = useState(() => defaultDue(today()));
  const [busy, setBusy] = useState(false);
  useEffect(() => { setDept(def.dept); setNote(def.note); }, [place, rainId]); // eslint-disable-line react-hooks/exhaustive-deps
  const depts = fx.data?.depts ?? [];
  const ok = note.trim().length >= 10 && !!due;
  const go = async () => {
    setBusy(true);
    const j = await fx.post({ action: "assign", lens, rain: rainId, due, items: [{ place, dept, note: note.trim() }] });
    setBusy(false);
    if (j?.created) fx.toast(`Assigned to ${fx.deptName(dept)}, due ${fmtD(due)}. The department sees it on its officer console.`, "ok");
    else if (j) fx.toast(j.skipped?.[0]?.words ? `Not assigned: ${j.skipped[0].words}.` : "Not assigned.", "alert");
  };
  return (
    <div className="fx-form">
      <label><span>Department</span>
        <select value={dept} onChange={(e) => setDept(e.target.value)}>
          {!depts.some((d) => d.code === dept) && <option value={dept}>{fx.deptName(dept)}</option>}
          {depts.map((d) => <option key={d.code} value={d.code}>{d.name}</option>)}
        </select>
      </label>
      <label><span>Due by</span><input type="date" value={due} min={today()} max={plusDays(today(), 120)} onChange={(e) => setDue(e.target.value)} /></label>
      <label className="wide"><span>What to change</span><textarea rows={3} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} /></label>
      <div className="fx-acts wide">
        <button className="rv-go" disabled={busy || !ok} onClick={go}><I n="send" />{busy ? "Assigning…" : `Assign to ${fx.deptName(dept)}`}</button>
        {onCancel && <button className="rv-btn" disabled={busy} onClick={onCancel}>Cancel</button>}
      </div>
      <small className="wide">The department sees it on its officer console and reports what it changed, with photos. You verify it here, and the next heavy rain shows whether it worked.</small>
    </div>
  );
}

function FixDetail({ fx, f }: { fx: Fixes; f: FixView }) {
  // back: send back; pull: withdraw; move: another department or due date
  const [mode, setMode] = useState<null | "back" | "pull" | "move">(null);
  const back = mode === "back";
  const setBack = (v: boolean) => setMode(v ? "back" : null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [mDept, setMDept] = useState(f.dept);
  const [mDue, setMDue] = useState(() => (f.due ? f.due.slice(0, 10) : defaultDue(today())));
  const p = pillOf(f);
  const step = async (action: "verify" | "reopen" | "withdraw" | "reassign") => {
    setBusy(true);
    const body = action === "verify" ? { action, id: f.id }
      : action === "reassign" ? { action, id: f.id, ...(mDept !== f.dept ? { dept: mDept } : {}), due: mDue, ...(note.trim() ? { note: note.trim() } : {}) }
        : { action, id: f.id, note: note.trim() };
    const j = await fx.post(body);
    setBusy(false);
    if (j) {
      setMode(null); setNote("");
      fx.toast(action === "verify" ? `Verified: ${f.label}.` : action === "reopen" ? `Sent back to ${f.deptName}.` : action === "withdraw" ? `Withdrawn: ${f.label}. The place is free for a new action.`
        : `Moved to ${fx.deptName(mDept)}, due ${fmtD(mDue)}.`, "ok");
    }
  };
  const live = f.stage === "assigned" || f.stage === "in_action";
  const steps = f.trail.filter((e) => e.step !== "assign");
  return (
    <div className="fx-detail">
      <div className="fx-dh"><span><b>{f.deptName}</b><small>After the {rainName(fx, f.rain)} rain · {f.due ? `due ${fmtD(f.due)}` : "no due date"}</small></span>
        <span className={`fx-pill s-${p.cls}`} title={p.title}>{p.text}</span></div>
      <p className="fx-note">{f.note}</p>
      {steps.length > 0 ? (
        <ol className="fx-steps">
          {steps.map((e, k) => (
            <li key={k} className={`k-${e.step}`}>
              <span><b>{STEP_WORD[e.step]}</b><small>{e.at ? fmtT(e.at) : ""} · {who(e)}</small></span>
              {e.remarks && <q>{e.remarks}</q>}
              {e.photo && <a href={photoUrl(e.photo)} target="_blank" rel="noopener noreferrer"><I n="photo" />Site photo{e.photoM != null ? (e.photoM <= 300 ? ", taken at the place" : `, taken ${n0(e.photoM)} m away`) : ""}</a>}
            </li>
          ))}
        </ol>
      ) : <p className="rv-muted fx-wait">{f.late ? `Past its due date with no update from ${f.deptName}.` : `No update from ${f.deptName} yet.`}</p>}
      {f.stage === "done" && !back && (
        <div className="fx-acts">
          <button className="rv-go" disabled={busy} onClick={() => step("verify")}><I n="checkc" />Verify</button>
          <button className="rv-btn" disabled={busy} onClick={() => setBack(true)}>Send back</button>
        </div>
      )}
      {(live || f.stage === "done") && mode == null && (
        <div className="fx-acts fx-acts-sub">
          {live && <button className="rv-btn" disabled={busy} onClick={() => setMode("move")} title="Give it to another department or change its due date"><I n="send" />Move or change due date</button>}
          <button className="rv-btn" disabled={busy} onClick={() => setMode("pull")} title="Close this action (sent by mistake, or no longer needed); the place is free for a new one"><I n="x" />Withdraw</button>
        </div>
      )}
      {mode === "move" && (
        <div className="fx-form">
          <label><span>Department</span>
            <select value={mDept} onChange={(e) => setMDept(e.target.value)}>
              {!(fx.data?.depts ?? []).some((d) => d.code === mDept) && <option value={mDept}>{fx.deptName(mDept)}</option>}
              {(fx.data?.depts ?? []).map((d) => <option key={d.code} value={d.code}>{d.name}</option>)}
            </select>
          </label>
          <label><span>Due by</span><input type="date" value={mDue} min={today()} max={plusDays(today(), 120)} onChange={(e) => setMDue(e.target.value)} /></label>
          <div className="fx-acts wide">
            <button className="rv-go" disabled={busy || (mDept === f.dept && mDue === (f.due ?? "").slice(0, 10))} onClick={() => step("reassign")}><I n="send" />Save</button>
            <button className="rv-btn" disabled={busy} onClick={() => setMode(null)}>Cancel</button>
          </div>
        </div>
      )}
      {mode === "pull" && (
        <div className="fx-back">
          <textarea rows={2} maxLength={300} placeholder="Why is it withdrawn?" value={note} onChange={(e) => setNote(e.target.value)} aria-label="Why it is withdrawn" />
          <div className="fx-acts">
            <button className="rv-go" disabled={busy || note.trim().length < 5} onClick={() => step("withdraw")}><I n="x" />Withdraw</button>
            <button className="rv-btn" disabled={busy} onClick={() => setMode(null)}>Cancel</button>
          </div>
        </div>
      )}
      {back && (
        <div className="fx-back">
          <textarea rows={2} maxLength={300} placeholder="What is still needed?" value={note} onChange={(e) => setNote(e.target.value)} aria-label="What is still needed" />
          <div className="fx-acts">
            <button className="rv-go" disabled={busy || note.trim().length < 5} onClick={() => step("reopen")}><I n="send" />Send back</button>
            <button className="rv-btn" disabled={busy} onClick={() => setBack(false)}>Cancel</button>
          </div>
        </div>
      )}
      <p className={`fx-out o-${f.outcome.kind}`}><I n={f.outcome.kind === "held" ? "checkc" : f.outcome.kind === "again" ? "alert" : "cloud"} /><span>{outcomeWords(fx, f)}</span></p>
    </div>
  );
}

// ------------------------------------------------------------------ Flooding's places --

export interface FloodPlace extends FixPlace {
  ward: number;
  reports: number;
  source: "complaint" | "satellite" | "both";
  /** the flood memory's street (null: a street only the satellite saw) */
  street: RStreet | null;
  sat: RainStreet["sat"];
}

/** a satellite street's name */
export const satName = (s: NonNullable<RainStreet["sat"]>) => s.name ?? (s.near ? `A lane off ${s.near}` : `A road in ward ${s.ward}`);

/**
 * The streets a rain flooded: those with a flooding report (the flood memory's streets) and, when a satellite passed, the
 * streets it saw water on; each with its default department and note (tracker.ts floodDefault).
 */
export function floodPlacesOf(rain: PastRain & { streets?: RainStreet[] }, streetBy: Map<string, RStreet>, chokes: RChoke[], areaOf?: (ward: number) => string): FloodPlace[] {
  const word = range(rain);
  const depts = new Map<string, string[]>();
  for (const c of chokes) (depts.get(c.street) ?? depts.set(c.street, []).get(c.street)!).push(c.dept);
  const list: { key: string; reports: number; source: FloodPlace["source"]; sat: RainStreet["sat"] }[] = rain.streets?.length
    ? rain.streets.map((x) => ({ key: x.key, reports: x.reports, source: x.source, sat: x.sat }))
    : [...rain.reports.reduce((m, r) => (r.street ? m.set(r.street, (m.get(r.street) ?? 0) + 1) : m), new Map<string, number>()).entries()].map(([key, n]) => ({ key, reports: n, source: "complaint" as const, sat: null }));
  const out: FloodPlace[] = [];
  for (const x of list) {
    const s = streetBy.get(x.key) ?? null;
    if (!s && !x.sat) continue;
    const label = s ? s.label : satName(x.sat!);
    const ward = s ? s.ward : x.sat!.ward;
    const d = floodDefault({ label, ward, water_m: s?.water_m ?? null, chokeDepts: depts.get(x.key) }, word);
    out.push({ place: x.key, label, ward, reports: x.reports, source: x.source, street: s, sat: x.sat, dept: d.dept, note: d.note, area: areaOf?.(ward) });
  }
  return out.sort((a, b) => b.reports - a.reports || (b.sat?.floodedM ?? 0) - (a.sat?.floodedM ?? 0) || a.place.localeCompare(b.place));
}
