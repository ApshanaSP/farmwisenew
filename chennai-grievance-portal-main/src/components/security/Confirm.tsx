"use client";

/**
 * "Confirm it's you", for every guarded action of a console (lib/security/stepup.ts): sending an email, closing or
 * verifying cases, an officer's report, deleting a dataset, approving a source, a bulk export.
 *
 * Mounted once per console, it watches the page's requests: a guarded route answers 428 with what it is about to do;
 * this box shows that, asks for the account's password (or a code sent by email), gets a grant from api/auth/confirm and sends the same request again
 * with it. No caller needs to know. Cancelled, nothing is done, and the caller sees "Not confirmed".
 * Jarvis and the voice commands go through the same requests, so a spoken "send it" still needs the typed password.
 */
import { useEffect, useRef, useState, type FormEvent } from "react";
import { I } from "@/components/collector/app/icons";
import "./confirm.css";
import { typedDigits } from "@/lib/typed-digits";

interface Ask { action: string; title: string; summary: string; scope: string }
type Method = "email" | "password";
const GRANT_HEADER = "x-diq-grant";
// the same two names as lib/security/stepup.ts (not imported: that file reads server-only code)
const SOFT_HEADER = "x-diq-confirm", SOFT_ANSWER = "x-diq-confirm";

export default function ConfirmHost() {
  const [ask, setAsk] = useState<(Ask & { id: number; done: (grant: string | null) => void; why: string | null }) | null>(null);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const seq = useRef(0); // one key per box, so a second box never starts with the first one's typed password (audit-client_browser-15)

  useEffect(() => {
    const prev = window.fetch;
    const open = (a: Ask, why: string | null) => new Promise<string | null>((done) => setAsk({ ...a, why, id: ++seq.current, done: (g) => { setAsk(null); done(g); } }));
    // The console says it reads a confirm answer as a 200 with a header (x-diq-confirm), so the browser logs no failed request for what is
    // the next step and not an error (PB-316). The server's check is the same either way: without a grant the route does nothing.
    const mine = (input: RequestInfo | URL) => {
      try { return new URL(input instanceof Request ? input.url : String(input), window.location.href).origin === window.location.origin; } catch { return false; }
    };
    const withHeaders = (input: RequestInfo | URL, init: RequestInit | undefined, set: Record<string, string>): [RequestInfo | URL, RequestInit | undefined] => {
      const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
      for (const [k, v] of Object.entries(set)) headers.set(k, v);
      return input instanceof Request ? [new Request(input, { headers }), init ? { ...init, headers: undefined } : undefined] : [input, { ...init, headers }];
    };
    /** the answer a caller expects: a confirm answer is a 428 for every caller above this wrapper, as it was before the header */
    const asCaller = async (r: Response) => (r.headers.get(SOFT_ANSWER) === "required"
      ? new Response(await r.text(), { status: 428, headers: { "content-type": "application/json" } }) : r);
    const wrapped: typeof window.fetch = async (input, init) => {
      const soft = mine(input);
      const [i0, n0] = soft ? withHeaders(input, init, { [SOFT_HEADER]: "json" }) : [input, init];
      const r = await prev(i0, n0);
      if (r.status !== 428 && r.headers.get(SOFT_ANSWER) !== "required") return r;
      const j = await r.clone().json().catch(() => null);
      if (!j?.confirm?.scope) return soft ? asCaller(r) : r;
      // one box at a time: a second guarded request waits for the first to be confirmed or cancelled
      const turn = queue.current.then(() => open(j.confirm as Ask, typeof j.error === "string" && j.error !== "Confirm it's you first." ? j.error : null));
      queue.current = turn.catch(() => null);
      const grant = await turn;
      if (!grant) return new Response(JSON.stringify({ error: "Not confirmed: nothing was done.", cancelled: true }), { status: 428, headers: { "content-type": "application/json" } });
      const [i1, n1] = withHeaders(input, init, { [GRANT_HEADER]: grant, ...(soft ? { [SOFT_HEADER]: "json" } : {}) });
      const again = await prev(i1, n1);
      return soft ? asCaller(again) : again;
    };
    window.fetch = wrapped;
    return () => { if (window.fetch === wrapped) window.fetch = prev; };
  }, []);

  return ask ? <ConfirmBox key={ask.id} ask={ask} why={ask.why} onDone={ask.done} /> : null;
}

function ConfirmBox({ ask, why, onDone }: { ask: Ask; why: string | null; onDone: (grant: string | null) => void }) {
  const [method, setMethod] = useState<Method>("password");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(why);
  const [note, setNote] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const post = async (body: Record<string, unknown>) => {
    const r = await fetch("/api/auth/confirm", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    return { ok: r.ok, j };
  };
  useEffect(() => { input.current?.focus(); }, [method]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); onDone(null); } };
    window.addEventListener("keydown", k, true);
    return () => window.removeEventListener("keydown", k, true);
  }, [onDone]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;
    setBusy(true); setError(null);
    const { ok, j } = await post({ step: "check", action: ask.action, scope: ask.scope, summary: ask.summary, method, code: code.trim() });
    setBusy(false);
    if (ok && j.grant) { onDone(j.grant); return; }
    setError(j.error ?? "That did not work. Try again.");
    setCode("");
  };
  const email = async () => {
    setBusy(true); setError(null);
    const { ok, j } = await post({ step: "email" });
    setBusy(false);
    if (ok) { setMethod("email"); setCode(""); setNote(`A code was sent to ${j.to}.`); } else setError(j.error ?? "The code could not be sent.");
  };

  const digits = method === "email";
  return (
    <div className="cfm-veil" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onDone(null); }}>
      <form className="cfm" role="dialog" aria-modal="true" aria-labelledby="cfm-t" onSubmit={submit}>
        <header>
          <span className="cfm-ic"><I n="shield" /></span>
          <div><h3 id="cfm-t">Confirm it&apos;s you</h3><small>{ask.title}</small></div>
          <button type="button" className="cfm-x" onClick={() => onDone(null)} aria-label="Cancel"><I n="x" /></button>
        </header>
        <p className="cfm-what">{ask.summary}</p>
        <label htmlFor="cfm-code">
          {method === "email" ? "The 6-digit code from the email" : "Your account password"}
        </label>
        <input id="cfm-code" ref={input} value={code} autoComplete={method === "password" ? "current-password" : "one-time-code"}
          type={method === "password" ? "password" : "text"} inputMode={digits ? "numeric" : "text"} maxLength={digits ? 6 : 200}
          className={digits ? "num" : ""} placeholder={digits ? "123456" : ""}
          onChange={(e) => setCode(digits ? typedDigits(e.target.value) : e.target.value)} />
        {error && <div className="cfm-err" role="alert"><I n="alert" />{error}</div>}
        {note && !error && <div className="cfm-ok" role="status"><I n="checkc" />{note}</div>}
        <div className="cfm-acts">
          <button type="button" onClick={() => onDone(null)}>Cancel</button>
          <button type="submit" className="pri" disabled={busy || (digits ? code.length !== 6 : !code.trim())}><I n="check" />{busy ? "Checking…" : "Confirm"}</button>
        </div>
        <div className="cfm-alt">
          {method === "email" && <button type="button" onClick={() => { setMethod("password"); setCode(""); setNote(null); }}>Use my password</button>}
          <button type="button" onClick={email} disabled={busy}>{method === "email" ? "Send another code" : "Email me a code"}</button>
        </div>
        <p className="cfm-why"><I n="lock" />Being signed in is not enough for this. It is checked on the server for exactly this action, and recorded in the audit log.</p>
      </form>
    </div>
  );
}
