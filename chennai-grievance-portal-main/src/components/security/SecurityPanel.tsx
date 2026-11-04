"use client";

/**
 * Menu → Security, in both consoles: how this account is protected and what happened to it.
 *   Check an email   is "DIQ-7F3A-K2QZ" (the reference at the foot of every email District IQ sends) genuine?
 *   This session     when it ends (12 hours), and signing out every other device
 *   Recent activity  sign-ins, wrong passwords, confirmed actions, checked emails, with time and address
 */
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { I, type IconName } from "@/components/collector/app/icons";
import "./security.css";

interface Ev { at: string; action: string; detail: Record<string, unknown> }
interface Sec { email: string; role: string; sessionEnds: string | null; hours: number; events: Ev[] }
interface RefCheck { genuine: boolean; email?: { from: string; to: string; subject: string; atText: string; mode: string; status: string } }

/** the older rows of the log keep their words (a code asked, recovery codes): sign-in had a second step until 4 Nov 2026 */
const EVENT: Record<string, [IconName, string, string]> = {
  "auth:signin": ["checkc", "Signed in", "ok"], "auth:password_ok": ["lock", "Password right, code asked", ""], "auth:password_wrong": ["alert", "Wrong password", "bad"],
  "auth:code_wrong": ["alert", "Wrong sign-in code", "bad"], "auth:mfa_on": ["shield", "2-step sign-in turned on", "ok"], "auth:signout_others": ["x", "Signed out other devices", ""],
  "auth:new_recovery": ["shield", "New recovery codes made", ""], "confirm:ok": ["check", "Confirmed", "ok"], "confirm:wrong": ["alert", "Wrong confirmation code", "bad"],
  "email:check_ref": ["search", "Checked an email", ""]
};
const FACTOR: Record<string, string> = { authenticator: "authenticator app", recovery: "recovery code", email: "emailed code", password: "password" };

const fmt = (s: string | null) => {
  if (!s) return "";
  const d = new Date(/Z$|[+-]\d\d:?\d\d$/.test(s) ? s : s.replace(" ", "T") + "+05:30");
  return Number.isNaN(d.getTime()) ? s : d.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });
};

export default function SecurityPanel({ onClose }: { onClose: () => void }) {
  const [d, setD] = useState<Sec | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [ref, setRef] = useState("");
  const [check, setCheck] = useState<RefCheck | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch("/api/auth/security").then((r) => r.json().then((j) => (r.ok ? setD(j) : setErr(j.error ?? "Could not load."))))
      .catch(() => setErr("Could not load."));
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape" && !document.querySelector(".cfm-veil")) onClose(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);

  const post = async (body: Record<string, unknown>) => {
    const r = await fetch("/api/auth/security", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    return { ok: r.ok, j: await r.json().catch(() => ({})) };
  };
  const checkRef = async (e: FormEvent) => {
    e.preventDefault();
    if (ref.trim().length < 8) return;
    setBusy("ref"); setCheck(null);
    const { ok, j } = await post({ action: "check_ref", ref: ref.trim() });
    setBusy(null);
    if (ok) setCheck(j); else setMsg(j.error ?? "Could not check.");
    load();
  };
  const others = async () => {
    setBusy("others");
    const { ok, j } = await post({ action: "signout_others" });
    setBusy(null);
    setMsg(ok ? "Every other device is signed out. This tab stays signed in." : j.error ?? "Could not sign out the others.");
    load();
  };

  return (
    <div className="sec-veil" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <section className="sec" role="dialog" aria-modal="true" aria-labelledby="sec-t">
        <header className="sec-h">
          <span className="sec-ic"><I n="shield" /></span>
          <div><h3 id="sec-t">Security</h3><small>{d?.email ?? "Your account"}</small></div>
          <button className="sec-x" onClick={onClose} aria-label="Close"><I n="x" /></button>
        </header>
        {err && <div className="sec-err" role="alert"><I n="alert" />{err}</div>}
        {msg && <div className="sec-ok" role="status"><I n="checkc" />{msg}</div>}
        <div className="sec-b">
          <div className="sec-col">
            <article className="sec-card">
              <h4><I n="news" />Check an email</h4>
              <p>Every email District IQ sends in the Collector&apos;s name ends with a reference. Type it to see if the email is genuine.</p>
              <form className="sec-ref" onSubmit={checkRef}>
                <input value={ref} onChange={(e) => setRef(e.target.value.toUpperCase())} placeholder="DIQ-7F3A-K2QZ" maxLength={24} aria-label="Email reference" translate="no" />
                <button className="pri" disabled={busy === "ref" || ref.trim().length < 8}><I n="search" />{busy === "ref" ? "Checking…" : "Check"}</button>
              </form>
              {check && (check.genuine && check.email ? (
                <div className="sec-res good">
                  <b><I n="checkc" />Genuine: District IQ sent this email</b>
                  <dl>
                    <dt>Approved by</dt><dd>{check.email.from}</dd>
                    <dt>To</dt><dd>{check.email.to}</dd>
                    <dt>When</dt><dd>{check.email.atText}</dd>
                    <dt>Subject</dt><dd>{check.email.subject}</dd>
                    <dt>Delivery</dt><dd>{check.email.mode === "sandbox" ? "Sandbox (team inbox)" : "Live"} · {check.email.status.replace("_", " ")}</dd>
                  </dl>
                  <small>The subject and text of the email you have must match these; if the wording differs, it was changed after it was sent.</small>
                </div>
              ) : (
                <div className="sec-res bad"><b><I n="alert" />Not found: District IQ did not send an email with this reference</b>
                  <small>Do not act on it. Report it to the Collector&apos;s office.</small></div>
              ))}
            </article>
            <article className="sec-card">
              <h4><I n="lock" />How this account is protected</h4>
              <ul className="sec-how">
                <li><b>Password.</b> Signing in needs the account&apos;s password; repeated wrong tries are slowed down.</li>
                <li><b>Confirm at the moment of action.</b> Sending an email, closing or verifying cases, deleting data and exports ask for your password again (or an emailed code), checked on the server for exactly that action.</li>
                <li><b>Signed emails.</b> Each email carries a reference only this server can make; the receiver can check it here.</li>
                <li><b>Short sessions.</b> A staff session ends after {d?.hours ?? 12} hours; each browser tab signs in and out on its own.</li>
                <li><b>Everything recorded.</b> Sign-ins, wrong passwords and confirmed actions go to the audit log, with the time and address.</li>
              </ul>
            </article>
          </div>
          <div className="sec-col">
            <article className="sec-card">
              <h4><I n="clock" />This session</h4>
              <p>{d?.sessionEnds ? `Ends ${fmt(d.sessionEnds)}; then sign in again.` : "…"}</p>
              <button className="sec-btn" onClick={others} disabled={busy === "others"}><I n="x" />Sign out every other device</button>
            </article>
            <article className="sec-card grow">
              <h4><I n="doc" />Recent activity</h4>
              {!d ? <div className="sec-skel" /> : d.events.length === 0 ? <p>Nothing recorded yet.</p> : (
                <ul className="sec-ev">
                  {d.events.map((e, k) => {
                    const [ic, label, tone] = EVENT[e.action] ?? ["info", e.action, ""];
                    const f = e.detail.factor ? ` · ${FACTOR[String(e.detail.factor)] ?? e.detail.factor}` : "";
                    const what = e.action.startsWith("confirm") && e.detail.summary ? `: ${String(e.detail.summary)}` : e.action === "email:check_ref" ? `: ${e.detail.ref} (${e.detail.genuine ? "genuine" : "not found"})` : "";
                    return (
                      <li key={k} className={tone}><I n={ic} /><span><b>{label}{what}</b><small>{fmt(e.at)}{f}{e.detail.ip && e.detail.ip !== "direct" ? ` · ${e.detail.ip}` : ""}</small></span></li>
                    );
                  })}
                </ul>
              )}
            </article>
          </div>
        </div>
      </section>
    </div>
  );
}
