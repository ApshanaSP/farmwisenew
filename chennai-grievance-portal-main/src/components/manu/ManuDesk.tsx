"use client";
/**
 * The Manu Desk: photos of paper petitions go in on the left, the AI reads them, and the petition officer checks each one beside its
 * photo and approves it. Nothing goes to a department unapproved. Only the petition officer's own login opens this.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MANU_DEPTS, MANU_LIMITS, type Approved, type PaddleSaw, type ReadField, type ReadStage, type Repeats, type SmsNote } from "@/lib/manu/constants";
import type { DeskItem, Detail } from "@/lib/manu/petitions";
import { shrinkForUpload } from "./shrink";
import "./manu.css";

interface Form { name: string; mobile: string; door: string; street: string; area: string; pincode: string; ward: string; date: string; subject: string; problem: string; request: string; dept: string; urgent: boolean; fullText: string }

const EMPTY: Form = { name: "", mobile: "", door: "", street: "", area: "", pincode: "", ward: "", date: "", subject: "", problem: "", request: "", dept: "", urgent: false, fullText: "" };

function formOf(d: Detail): Form {
  const g = d.reading;
  if (!g) return EMPTY;
  return {
    name: g.name ?? "", mobile: g.mobile ?? "", door: g.door_no ?? "", street: g.street ?? "", area: g.area_en ?? "", pincode: g.pincode ?? "", ward: g.ward ? String(g.ward) : d.suggestedWard ? String(d.suggestedWard.ward) : "",
    date: g.date ?? "", subject: g.subject ?? "", problem: g.problem_en, request: g.request_en, dept: g.department, urgent: g.urgent, fullText: g.full_text
  };
}

async function call<T>(url: string, body?: unknown): Promise<T> {
  const r = await fetch(url, body === undefined ? { cache: "no-store" } : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401) { window.location.href = "/login?redirect=/officer"; throw new Error("Your session has ended."); }
  if (!r.ok) throw new Error(j.error || "That did not work. Please try again.");
  return j as T;
}

const clock = (t: string) => {
  if (!t) return "";
  const d = new Date(`${t.replace(" ", "T")}+05:30`);
  return d.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
};

function smsLine(s: SmsNote): string {
  if (s.state === "sent") return `An SMS was sent to the number ending ${s.last4}.`;
  if (s.state === "test") return `Test SMS sent to the team inbox, for the number ending ${s.last4}. Nothing went to the phone.`;
  if (s.state === "testnumber") return `Test SMS sent to the test number ending ${s.last4}. Nothing went to the petitioner's phone.`;
  if (s.state === "sending") return "The SMS is on its way. Open this petition again in a minute to see if it went.";
  if (s.state === "unsure") return "The SMS service did not confirm this SMS. It is not sent again on its own, so the petitioner is not texted twice.";
  if (s.state === "failed") return "The SMS could not be sent just now. It will be tried again.";
  if (s.state === "none") return "No SMS was sent because this petition has no valid mobile number.";
  return "No SMS was sent because the SMS service is not set up yet.";
}

function Field({ label, flag, must, hint, wide, children }: { label: string; flag?: boolean; must?: boolean; hint?: string | null; wide?: boolean; children: React.ReactNode }) {
  return (
    <label className={`mn-f${flag ? " flag" : ""}${wide ? " wide" : ""}`}>
      <span>{label}{must && <i> *</i>}</span>
      {children}
      {(flag || hint) && <small>{flag ? (hint ? `Check this against the paper. ${hint}` : "Check this against the paper.") : hint}</small>}
    </label>
  );
}

function Photos({ pages, onDelete }: { pages: string[]; onDelete?: (page: number) => void }) {
  const [at, setAt] = useState(0), [zoom, setZoom] = useState(1), [turn, setTurn] = useState(0);
  useEffect(() => { setAt(0); setZoom(1); setTurn(0); }, [pages]);
  return (
    <section className="mn-photo">
      <div className="mn-tools">
        {pages.length > 1 && <span className="mn-pages">{pages.map((_, k) => <button key={k} className={k === at ? "on" : ""} onClick={() => setAt(k)}>Page {k + 1}</button>)}</span>}
        <span className="mn-gap" />
        <button onClick={() => setZoom((z) => Math.max(0.6, z - 0.25))} aria-label="Zoom out">−</button>
        <button onClick={() => setZoom((z) => Math.min(3.5, z + 0.25))} aria-label="Zoom in">+</button>
        <button onClick={() => setTurn((t) => (t + 90) % 360)}>Rotate</button>
        {onDelete && <button className="mn-del-img" onClick={() => onDelete(at)}>{pages.length > 1 ? "Delete this page" : "Delete image"}</button>}
      </div>
      <div className="mn-view">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={pages[at]} alt={`Petition page ${at + 1}`} style={{ width: `${zoom * 100}%`, transform: `rotate(${turn}deg)` }} />
      </div>
    </section>
  );
}

const STAGE_SHORT: Record<ReadStage["step"], string> = { queued: "Waiting to be read", paddle: "PaddleOCR is reading", ai: "AI OCR is reading", compare: "Comparing the readings" };

const ORDER: ReadStage["step"][] = ["queued", "paddle", "ai", "compare"];

/** The reading, step by step, from the server's real progress: PaddleOCR on this computer, then the AI OCR, then the comparison. */
function ReadingSteps({ stage, pages }: { stage: ReadStage | null; pages: number }) {
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    const t0 = Date.now();
    const t = setInterval(() => setSecs(Math.floor((Date.now() - t0) / 1000)), 1000);
    return () => clearInterval(t);
  }, []);
  const step = stage?.step ?? "queued";
  const at = ORDER.indexOf(step);
  const off = stage?.paddle === "off";
  const pageNote = stage?.page && stage.pages && stage.pages > 1 ? ` (page ${stage.page} of ${stage.pages})` : "";
  const rows: { key: string; state: "done" | "now" | "next" | "off"; text: string }[] = [
    { key: "queued", state: at > 0 ? "done" : "now", text: at > 0 ? "The petition has been received." : "The petition has been received and is waiting to be read." },
    off
      ? { key: "paddle", state: "off", text: "PaddleOCR is not available. Reading will continue with AI OCR alone." }
      : { key: "paddle", state: at > 1 ? "done" : at === 1 ? "now" : "next", text: at > 1 ? "PaddleOCR has read the document." : at === 1 ? `PaddleOCR is reading the document on this computer${pageNote}.` : "PaddleOCR will read the document." },
    { key: "ai", state: at > 2 ? "done" : at === 2 ? "now" : "next", text: at > 2 ? "AI OCR has read the document." : at === 2 ? "AI OCR is reading the document." : "AI OCR will then read the document." },
    { key: "compare", state: at === 3 ? "now" : "next", text: off ? "The reading will be prepared for your verification." : at === 3 ? "Comparing both readings and preparing them for your verification." : "Both readings will be compared for your verification." }
  ];
  return (
    <div className="mn-reading" role="status" aria-live="polite">
      <span className="mn-spin" aria-hidden="true" />
      <h2>Reading the petition</h2>
      <ol className="mn-steps">
        {rows.map((r) => <li key={r.key} className={r.state}><i aria-hidden="true" />{r.text}</li>)}
      </ol>
      <p className="mn-time">Time taken so far: {secs} {secs === 1 ? "second" : "seconds"}.</p>
      <p>A one-page petition usually takes about a minute{pages > 1 ? ", and each further page takes a little longer" : ""}. You may verify other petitions meanwhile.</p>
    </div>
  );
}

type Notice = { kind: "approved"; approved: Approved } | { kind: "deleted" };

/** The desk's home: where an officer lands after each petition, ready to upload the next. */
function Home({ notice, waiting, sending, onCamera, onFiles, onNext }: { notice: Notice | null; waiting: number; sending: number; onCamera: () => void; onFiles: () => void; onNext: () => void }) {
  return (
    <div className="mn-home">
      {notice?.kind === "approved" && (
        <div className="mn-ok" role="status">
          <h3>{notice.approved.attached ? "Petition approved and added to the existing complaint" : "Petition approved and forwarded"}</h3>
          <p>Complaint number <strong>{notice.approved.code}</strong> is now with {notice.approved.dept} and the Collector&apos;s Office.</p>
          <p className="mn-sms" data-sms={notice.approved.sms.state}>{smsLine(notice.approved.sms)}</p>
        </div>
      )}
      {notice?.kind === "deleted" && <div className="mn-ok" role="status"><h3>The petition has been deleted.</h3></div>}
      {sending > 0 ? (
        <div className="mn-reading" role="status" aria-live="polite">
          <span className="mn-spin" aria-hidden="true" />
          <h2>Uploading the petition securely</h2>
          <p>{sending > 1 ? `${sending} uploads remaining. ` : ""}Please wait. Reading will begin as soon as the upload is complete.</p>
        </div>
      ) : (
        <>
          <h2>{notice ? "Upload the next petition" : "Upload a petition to begin"}</h2>
          <p>Take a photograph or choose a file. PaddleOCR and AI OCR will read it, and you may then verify the details beside the photograph and approve it.</p>
          <div className="mn-homeb">
            <button className="mn-primary" onClick={onCamera}>Take a photo</button>
            <button onClick={onFiles}>Choose files</button>
          </div>
          {waiting > 0 && (
            <div className="mn-wait">
              <span>{waiting} {waiting === 1 ? "petition is" : "petitions are"} awaiting verification.</span>
              <button onClick={onNext}>Verify the next petition</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Check({ d, onFiled, onDelete, onReload, onHome }: { d: Detail; onFiled: (r: Approved) => void; onDelete: () => void; onReload: () => void; onHome: () => void }) {
  const [f, setF] = useState<Form>(() => formOf(d));
  const [repeats, setRepeats] = useState<Repeats | null>(d.repeats);
  const [zone, setZone] = useState<string | null>(d.suggestedWard?.zone ?? null);
  const [attach, setAttach] = useState<string | null>(null);
  const [busy, setBusy] = useState(false), [err, setErr] = useState<string | null>(null);
  const first = useRef(true);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => ({ ...x, [k]: v }));
  const flag = (k: ReadField) => !!d.reading?.unsure_fields.includes(k);

  // the "came before" check follows the corrections
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    const t = setTimeout(() => {
      call<{ repeats: Repeats; zone: string | null }>(`/api/manu/petitions/${d.id}`, { action: "repeats", mobile: f.mobile, name: f.name, street: f.street, ward: Number(f.ward) || null, dept: f.dept, problem: f.problem })
        .then((j) => { setRepeats(j.repeats); setZone(j.zone); setAttach((a) => (a && j.repeats.matches.some((m) => m.incidentId === a) ? a : null)); }).catch(() => undefined);
    }, 500);
    return () => clearTimeout(t);
  }, [d.id, f.mobile, f.name, f.street, f.ward, f.dept, f.problem]);

  const file = async () => {
    setBusy(true); setErr(null);
    try {
      const j = await call<{ approved: Approved }>(`/api/manu/petitions/${d.id}`, { action: "file", fields: { ...f, ward: Number(f.ward), attachTo: attach } });
      onFiled(j.approved);
    } catch (e) { setErr((e as Error).message); setBusy(false); }
  };
  const again = async () => {
    setBusy(true); setErr(null);
    try { await call(`/api/manu/petitions/${d.id}`, { action: "read" }); onReload(); } catch (e) { setErr((e as Error).message); setBusy(false); }
  };
  const fromArea = !d.reading?.ward && d.suggestedWard && f.ward === String(d.suggestedWard.ward);
  const unsure = d.reading?.unsure_fields.length ?? 0;
  const saw = (k: keyof PaddleSaw) => (d.reading?.paddle_saw?.[k] ? `PaddleOCR read ${d.reading.paddle_saw[k]}.` : null);
  const backup = d.reading?.readers === "paddle";
  const readBy = d.reading?.readers === "paddle+ai" ? ` Read by PaddleOCR and AI OCR in ${d.seconds ?? "?"} s.` : d.reading?.readers === "ai" ? ` Read by AI OCR in ${d.seconds ?? "?"} s. PaddleOCR was off, so the numbers had no second check.` : ` Read in ${d.seconds ?? "?"} s.`;

  return (
    <form className="mn-form" data-no-i18n onSubmit={(e) => { e.preventDefault(); void file(); }}>
      <div className="mn-formhead">
        <h3>Verify and approve</h3>
        <small>{backup ? "The AI OCR could not be reached, so this is PaddleOCR's text only. Fill in the rest from the photo, or use Read again." : d.reading ? `${unsure ? `${unsure} ${unsure === 1 ? "detail" : "details"} marked for checking.` : ""}${readBy}`.trim() : d.readError ?? "Type the details from the photo."}</small>
      </div>

      {repeats?.headline && (
        <div className="mn-came">
          <b>Came before</b>
          <p>{repeats.headline}</p>
          <ul>
            {repeats.matches.slice(0, 4).map((m) => (
              <li key={m.code}>
                <span><strong>{m.code}</strong> · {clock(m.filedAt)} · {m.status}<br />{m.problem}</span>
                {m.open && m.incidentId && m.sameProblem && (
                  <button type="button" className={attach === m.incidentId ? "on" : ""} onClick={() => setAttach((a) => (a === m.incidentId ? null : m.incidentId))}>
                    {attach === m.incidentId ? "Will be added" : "Add to this case"}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mn-grid">
        <Field label="Name" must flag={flag("name")} wide><input value={f.name} onChange={(e) => set("name", e.target.value)} /></Field>
        <Field label="Mobile" flag={flag("mobile")} hint={saw("mobile") ?? "Always compare the digits with the paper."}><input inputMode="numeric" maxLength={10} value={f.mobile} onChange={(e) => set("mobile", e.target.value.replace(/\D/g, ""))} /></Field>
        <Field label="Date on the petition" flag={flag("date")} hint={saw("date")}><input value={f.date} onChange={(e) => set("date", e.target.value)} placeholder="DD.MM.YYYY" /></Field>
        <Field label="Door no." flag={flag("door_no")}><input value={f.door} onChange={(e) => set("door", e.target.value)} /></Field>
        <Field label="Street" flag={flag("street")}><input value={f.street} onChange={(e) => set("street", e.target.value)} /></Field>
        <Field label="Area" flag={flag("area_en")}><input value={f.area} onChange={(e) => set("area", e.target.value)} /></Field>
        <Field label="Pincode" flag={flag("pincode")} hint={saw("pincode")}><input inputMode="numeric" maxLength={6} value={f.pincode} onChange={(e) => set("pincode", e.target.value.replace(/\D/g, ""))} /></Field>
        <Field label="Ward" must flag={flag("ward") || !!fromArea} hint={fromArea ? `Not written on the paper. Suggested from ${d.suggestedWard!.area}.` : zone ? `${zone} zone` : null}>
          <input inputMode="numeric" maxLength={3} value={f.ward} onChange={(e) => set("ward", e.target.value.replace(/\D/g, ""))} />
        </Field>
        <Field label="Department" must>
          <select value={f.dept} onChange={(e) => set("dept", e.target.value)}>
            <option value="">Choose…</option>
            {MANU_DEPTS.map((x) => <option key={x.code} value={x.code}>{x.label}</option>)}
          </select>
        </Field>
        <Field label="Subject (as written)" flag={flag("subject")} wide><input value={f.subject} onChange={(e) => set("subject", e.target.value)} /></Field>
        <Field label="The problem, in one line (English)" must wide><input value={f.problem} onChange={(e) => set("problem", e.target.value)} /></Field>
        <Field label="What they ask for (English)" wide><input value={f.request} onChange={(e) => set("request", e.target.value)} /></Field>
        <label className="mn-urgent wide">
          <input type="checkbox" checked={f.urgent} onChange={(e) => set("urgent", e.target.checked)} />
          <span><b>Urgent</b> danger to life or safety, a medical emergency, or a vulnerable person in distress now</span>
        </label>
        {d.reading?.aadhaar_last4 && <p className="mn-note wide">An Aadhaar number on this page is hidden here (ending {d.reading.aadhaar_last4}).</p>}
        <Field label="The petition's full text" flag={flag("full_text")} wide><textarea rows={7} value={f.fullText} onChange={(e) => set("fullText", e.target.value)} /></Field>
      </div>

      {err && <p className="mn-err" role="alert">{err}</p>}
      {d.smsMode !== "off" && <p className="mn-sms">{!/^[6-9]\d{9}$/.test(f.mobile) ? "This petition has no valid mobile number, so no SMS will be sent." : d.smsMode === "live" ? <>On approval, an SMS goes to <b>{f.mobile}</b>. Make sure this matches the paper.</> : <>On approval, a test SMS for <b>{f.mobile}</b> goes to the team inbox. Make sure this matches the paper.</>}</p>}
      <div className="mn-acts">
        <button type="submit" className="mn-primary" disabled={busy}>{busy ? "Forwarding to the department…" : attach ? "Approve and add to the case" : "Approve and send"}</button>
        <button type="button" onClick={() => void again()} disabled={busy}>Read again</button>
        <button type="button" onClick={onHome} disabled={busy}>Back to home</button>
        <button type="button" className="mn-del" onClick={onDelete} disabled={busy}>Delete petition</button>
      </div>
    </form>
  );
}

export default function ManuDesk() {
  const [items, setItems] = useState<DeskItem[] | null>(null);
  const [sel, setSel] = useState<number | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [together, setTogether] = useState(false);
  const [sending, setSending] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const seen = useRef<string>("");
  const pickRef = useRef<HTMLInputElement>(null), camRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try { setItems((await call<{ items: DeskItem[] }>("/api/manu/petitions")).items); } catch (e) { setErr((e as Error).message); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const reading = items?.some((i) => i.status === "reading") || sending > 0;
  useEffect(() => {
    const t = setInterval(() => void load(), reading ? MANU_LIMITS.pollMs : 30_000);
    return () => clearInterval(t);
  }, [reading, load]);

  const toCheck = useMemo(() => (items ?? []).filter((i) => i.status === "needs_check" || i.status === "read_failed").sort((a, b) => Number(b.urgent) - Number(a.urgent) || a.at.localeCompare(b.at)), [items]);
  const inReader = useMemo(() => (items ?? []).filter((i) => i.status === "reading"), [items]);
  const filed = useMemo(() => (items ?? []).filter((i) => i.status === "filed").sort((a, b) => b.at.localeCompare(a.at)), [items]);

  const goHome = useCallback(() => { seen.current = ""; setDetail(null); setSel(null); }, []);
  const open = useCallback((id: number) => { setNotice(null); setSel(id); }, []);

  // follows the open petition from "reading" to "ready to verify"
  const selItem = items?.find((i) => i.id === sel) ?? null;
  const selStatus = selItem?.status ?? null;
  const fetchDetail = useCallback(async (id: number) => {
    try { setDetail(await call<Detail>(`/api/manu/petitions/${id}`)); } catch (e) { setErr((e as Error).message); }
  }, []);
  useEffect(() => {
    if (sel == null) { setDetail(null); return; }
    const key = `${sel}|${selStatus}`;
    if (seen.current === key) return;
    seen.current = key;
    void fetchDetail(sel);
  }, [sel, selStatus, fetchDetail]);

  const upload = async (list: FileList | null) => {
    if (!list?.length) return;
    setErr(null); setNotice(null); goHome();
    const files = [...list];
    const groups = together ? [files] : files.map((f) => [f]);
    setSending(groups.length);
    let first = true;
    for (const g of groups) {
      try {
        const fd = new FormData();
        for (const f of g) { const s = await shrinkForUpload(f); fd.append("pages", s, s.name); }
        const r = await fetch("/api/manu/petitions", { method: "POST", body: fd });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error || "That upload did not work.");
        // the first one opens, so its reading can be followed step by step
        if (first && j.id) { first = false; await load(); setSel(Number(j.id)); }
      } catch (e) { setErr((e as Error).message); }
      setSending((n) => n - 1);
    }
    if (pickRef.current) pickRef.current.value = "";
    if (camRef.current) camRef.current.value = "";
    await load();
  };

  // approved: back to the home screen, with the complaint number, ready for the next upload
  const onFiled = async (r: Approved) => {
    setNotice({ kind: "approved", approved: r });
    goHome();
    await load();
  };

  const removeUpload = async (id: number) => {
    if (!window.confirm("Delete this upload? The photo will be removed and cannot be brought back.")) return;
    setErr(null);
    try {
      await call(`/api/manu/petitions/${id}`, { action: "delete" });
      setItems((x) => x && x.filter((i) => i.id !== id));
      if (id === sel) { goHome(); setNotice({ kind: "deleted" }); }
      await load();
    } catch (e) { setErr((e as Error).message); }
  };
  const removePage = async (id: number, page: number) => {
    if (!window.confirm(`Delete page ${page + 1}? It cannot be brought back, and the remaining pages will be read again.`)) return;
    setErr(null);
    try {
      await call(`/api/manu/petitions/${id}`, { action: "delete_page", page });
      seen.current = "";
      await load();
    } catch (e) { setErr((e as Error).message); }
  };

  const row = (i: DeskItem) => (
    <li key={i.id} className="mn-row">
      {i.status !== "filed" && <button className="mn-x" title="Delete this upload" aria-label="Delete this upload" data-testid={`delete-${i.id}`} onClick={() => void removeUpload(i.id)}>×</button>}
      <button className={`mn-item${i.id === sel ? " on" : ""}`} data-testid={`petition-${i.id}`} onClick={() => open(i.id)}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {i.thumb ? <img src={i.thumb} alt="" /> : <span className="mn-noth" />}
        <span className="mn-item-t" data-no-i18n>
          <b>{i.status === "reading" ? "Being read" : i.name || `Petition ${i.id}`}</b>
          <small>{i.status === "read_failed" ? "Could not be read" : i.status === "reading" ? `${STAGE_SHORT[i.stage?.step ?? "queued"]}. ${i.pages} ${i.pages === 1 ? "page" : "pages"}.` : i.problem || ""}</small>
          <em>
            {i.urgent && <i className="u">Urgent</i>}
            {i.status === "needs_check" && i.unsure > 0 && <i className="w">{i.unsure} to check</i>}
            {i.code && <i>{i.code}</i>}
            <span>{clock(i.at)}</span>
          </em>
        </span>
      </button>
    </li>
  );

  return (
    <div className="mn">
      <aside className="mn-q">
        <div className="mn-up">
          <div className="mn-upb">
            <button className="mn-primary" onClick={() => camRef.current?.click()}>Take a photo</button>
            <button onClick={() => pickRef.current?.click()}>Choose files</button>
          </div>
          <input ref={camRef} type="file" hidden accept="image/*" capture="environment" onChange={(e) => void upload(e.target.files)} />
          <input ref={pickRef} type="file" hidden multiple accept="image/jpeg,image/png,application/pdf" onChange={(e) => void upload(e.target.files)} />
          <label className="mn-tog"><input type="checkbox" checked={together} onChange={(e) => setTogether(e.target.checked)} />These files are pages of one petition</label>
          {sending > 0 && <p className="mn-send">Uploading {sending === 1 ? "the petition" : `${sending} petitions`}. Please wait.</p>}
          {err && <p className="mn-err" role="alert">{err}</p>}
        </div>
        <div className="mn-lists">
          {inReader.length > 0 && <><h4>Being read <b>{inReader.length}</b></h4><ul>{inReader.map(row)}</ul></>}
          <h4>Awaiting verification <b>{toCheck.length}</b></h4>
          {toCheck.length ? <ul>{toCheck.map(row)}</ul> : <p className="mn-none">{items ? "No petitions are awaiting verification." : "Retrieving the petitions. Please wait."}</p>}
          {filed.length > 0 && <><h4>Approved this week <b>{filed.length}</b></h4><ul>{filed.map(row)}</ul></>}
        </div>
      </aside>

      <main className="mn-work">
        {!sel && <Home notice={notice} waiting={toCheck.length} sending={sending} onCamera={() => camRef.current?.click()} onFiles={() => pickRef.current?.click()} onNext={() => { if (toCheck[0]) open(toCheck[0].id); }} />}
        {sel && !detail && <div className="mn-empty" role="status"><span className="mn-spin" aria-hidden="true" /><p>Retrieving the petition. Please wait.</p></div>}
        {detail && detail.id === sel && (
          <div className="mn-split">
            <Photos pages={detail.pages} onDelete={detail.status === "needs_check" || detail.status === "read_failed" ? (p) => void (detail.pages.length > 1 ? removePage(detail.id, p) : removeUpload(detail.id)) : undefined} />
            {detail.status === "reading" && <ReadingSteps key={detail.id} stage={selItem?.stage ?? null} pages={detail.pages.length} />}
            {(detail.status === "needs_check" || detail.status === "read_failed") && (
              <Check key={`${detail.id}|${detail.status}|${detail.pages.length}`} d={detail} onFiled={onFiled} onDelete={() => void removeUpload(detail.id)} onReload={() => { seen.current = ""; void load(); }} onHome={goHome} />
            )}
            {detail.status === "filed" && detail.approved && (
              <div className="mn-done">
                <h3>{detail.approved.attached ? "Approved and added to the existing complaint" : "Approved and sent"}</h3>
                <p>Complaint number <strong>{detail.approved.code}</strong> is now with {detail.approved.dept} and the Collector.</p>
                <p className="mn-sms" data-sms={detail.approved.sms.state}>{smsLine(detail.approved.sms)}</p>
                <div className="mn-acts"><button className="mn-primary" onClick={goHome}>Back to home</button></div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
