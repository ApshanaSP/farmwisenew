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
import { useLangNow } from "@/lib/i18n/lang";
import "./confirm.css";

interface Ask { action: string; title: string; summary: string; scope: string }
type Method = "email" | "password";
/** the box's own words, English and Tamil (the page translator does not know them, and a guarded action must read plainly) */
const WORDS = {
  en: { title: "Confirm it's you", cancel: "Cancel", labelEmail: "The 6-digit code from the email", labelPassword: "Your account password", confirm: "Confirm", checking: "Checking…", usePassword: "Use my password", another: "Send another code", emailMe: "Email me a code", why: "Being signed in is not enough for this. It is checked on the server for exactly this action, and recorded in the audit log.", failed: "That did not work. Try again.", notSent: "The code could not be sent.", sent: (to: string) => `A code was sent to ${to}.` },
  ta: { title: "இது நீங்கள்தான் என உறுதிசெய்யுங்கள்", cancel: "ரத்து", labelEmail: "மின்னஞ்சலில் வந்த 6 இலக்கக் குறியீடு", labelPassword: "உங்கள் கணக்கின் கடவுச்சொல்", confirm: "உறுதிசெய்", checking: "சரிபார்க்கிறது…", usePassword: "என் கடவுச்சொல்லைப் பயன்படுத்து", another: "இன்னொரு குறியீட்டை அனுப்பு", emailMe: "எனக்கு மின்னஞ்சலில் குறியீடு அனுப்பு", why: "உள்நுழைந்திருப்பது மட்டும் இதற்குப் போதாது. இந்தச் செயலுக்காகவே சர்வரில் சரிபார்க்கப்பட்டு, தணிக்கைப் பதிவில் பதியப்படும்.", failed: "அது வேலை செய்யவில்லை. மீண்டும் முயலுங்கள்.", notSent: "குறியீட்டை அனுப்ப முடியவில்லை.", sent: (to: string) => `${to} முகவரிக்குக் குறியீடு அனுப்பப்பட்டது.` }
};
const FOCUSABLE = "button:not([disabled]), input:not([disabled]), [href], select, textarea, [tabindex]:not([tabindex='-1'])";
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
  const uiLang = useLangNow();
  const w = WORDS[uiLang];

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
    setError(j.error ?? w.failed);
    setCode("");
  };
  const email = async () => {
    setBusy(true); setError(null);
    const { ok, j } = await post({ step: "email" });
    setBusy(false);
    if (ok) { setMethod("email"); setCode(""); setNote(w.sent(String(j.to))); } else setError(j.error ?? w.notSent);
  };

  const digits = method === "email";
  // the box is modal: Tab and Shift+Tab go round its own controls and never reach the console behind it (SK2-10)
  const trap = (e: React.KeyboardEvent<HTMLFormElement>) => {
    if (e.key !== "Tab") return;
    const items = Array.from(e.currentTarget.querySelectorAll<HTMLElement>(FOCUSABLE));
    if (!items.length) return;
    const first = items[0], last = items[items.length - 1], at = document.activeElement;
    if (e.shiftKey && (at === first || !e.currentTarget.contains(at))) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && (at === last || !e.currentTarget.contains(at))) { e.preventDefault(); first.focus(); }
  };
  return (
    <div className="cfm-veil" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onDone(null); }}>
      <form className="cfm" role="dialog" aria-modal="true" aria-labelledby="cfm-t" onSubmit={submit} onKeyDown={trap}>
        <header>
          <span className="cfm-ic"><I n="shield" /></span>
          <div><h3 id="cfm-t">{w.title}</h3><small>{ask.title}</small></div>
          <button type="button" className="cfm-x" onClick={() => onDone(null)} aria-label={w.cancel}><I n="x" /></button>
        </header>
        <p className="cfm-what">{ask.summary}</p>
        <label htmlFor="cfm-code">
          {method === "email" ? w.labelEmail : w.labelPassword}
        </label>
        <input id="cfm-code" ref={input} value={code} autoComplete={method === "password" ? "current-password" : "one-time-code"}
          type={method === "password" ? "password" : "text"} inputMode={digits ? "numeric" : "text"} maxLength={digits ? 6 : 200}
          className={digits ? "num" : ""} placeholder={digits ? "123456" : ""}
          onChange={(e) => setCode(digits ? e.target.value.replace(/\D/g, "") : e.target.value)} />
        {error && <div className="cfm-err" role="alert"><I n="alert" />{error}</div>}
        {note && !error && <div className="cfm-ok" role="status"><I n="checkc" />{note}</div>}
        <div className="cfm-acts">
          <button type="button" onClick={() => onDone(null)}>{w.cancel}</button>
          <button type="submit" className="pri" disabled={busy || (digits ? code.length !== 6 : !code.trim())}><I n="check" />{busy ? w.checking : w.confirm}</button>
        </div>
        <div className="cfm-alt">
          {method === "email" && <button type="button" onClick={() => { setMethod("password"); setCode(""); setNote(null); }}>{w.usePassword}</button>}
          <button type="button" onClick={email} disabled={busy}>{method === "email" ? w.another : w.emailMe}</button>
        </div>
        <p className="cfm-why"><I n="lock" />{w.why}</p>
      </form>
    </div>
  );
}
