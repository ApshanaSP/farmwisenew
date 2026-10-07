"use client";

/**
 * Connect a source: a link, how the site signs in (where the Collector is allowed an account) and how often it
 * refreshes. The secrets go to the server once, are encrypted there and are never shown again or sent to an AI.
 */
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import type { AuthInput, AuthMode } from "@/lib/studio/types";
import { I, type IconName } from "../icons";

export interface ConnectRequest { url: string; name: string | null; auth: AuthInput | null; every: number | null }

const MODES: { mode: AuthMode; ic: IconName; title: string; sub: string }[] = [
  { mode: "none", ic: "gov", title: "Public", sub: "Anyone can open it" },
  { mode: "apikey", ic: "bolt", title: "API key", sub: "data.gov.in and most APIs" },
  { mode: "login", ic: "user", title: "Sign-in page", sub: "User name and password on the site" },
  { mode: "basic", ic: "shield", title: "Password pop-up", sub: "The browser asks for a password" },
  { mode: "manual", ic: "phone", title: "I'll sign in myself", sub: "OTP, CAPTCHA or single sign-on" }
];
const EVERY: { v: number | null; t: string }[] = [{ v: null, t: "By hand" }, { v: 60, t: "Every hour" }, { v: 360, t: "Every 6 hours" }, { v: 1440, t: "Daily" }];

export default function Connect({ initialUrl, onClose, onConnect }: { initialUrl: string; onClose: () => void; onConnect: (r: ConnectRequest) => void }) {
  const [url, setUrl] = useState(initialUrl);
  const [name, setName] = useState("");
  const [mode, setMode] = useState<AuthMode>("none");
  const [key, setKey] = useState("");
  const [keyName, setKeyName] = useState("api-key");
  const [keyPlace, setKeyPlace] = useState<"query" | "header">("query");
  const [user, setUser] = useState("");
  const [pass, setPass] = useState("");
  const [loginUrl, setLoginUrl] = useState("");
  const [show, setShow] = useState(false);
  const [every, setEvery] = useState<number | null>(null);
  const [ok, setOk] = useState(false);
  const first = useRef<HTMLInputElement>(null);
  useEffect(() => { first.current?.focus(); const k = (e: KeyboardEvent) => e.key === "Escape" && onClose(); window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose]);
  // data.gov.in: its API takes the key as ?api-key=
  useEffect(() => { if (/data\.gov\.in/i.test(url) && mode === "none") setMode("apikey"); }, [url, mode]);

  let valid = false;
  try { valid = /^https?:$/.test(new URL(url.trim()).protocol); } catch { valid = false; }
  const needsOk = mode !== "none";
  const filled = mode === "none" || mode === "manual" || (mode === "apikey" ? key.trim().length > 3 : user.trim().length > 0 && pass.length > 0);
  const ready = valid && filled && (!needsOk || ok);
  const submit = () => {
    if (!ready) return;
    const auth: AuthInput | null = mode === "none" ? null
      : mode === "apikey" ? { mode, key: key.trim(), keyName: keyName.trim() || "api-key", keyPlace }
      : mode === "manual" ? { mode, loginUrl: loginUrl.trim() || undefined }
      : { mode, username: user.trim(), password: pass, loginUrl: mode === "login" ? loginUrl.trim() || undefined : undefined };
    onConnect({ url: url.trim(), name: name.trim() || null, auth, every });
  };

  return (
    <motion.div className="ds-modal-veil" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <motion.form className="ds-connect" role="dialog" aria-label="Connect a source" onSubmit={(e) => { e.preventDefault(); submit(); }}
        initial={{ opacity: 0, y: 24, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 12, scale: 0.98 }} transition={{ type: "spring", stiffness: 300, damping: 28 }}>
        <header>
          <span className="ds-connect-ic"><I n="ext" /></span>
          <div><h3>Connect a source</h3><small>A file link, a web page, a dashboard or an API. The agents find the data, check it is Chennai&apos;s and keep it up to date.</small></div>
          <button type="button" className="ds-icon" onClick={onClose} aria-label="Close"><I n="x" /></button>
        </header>

        <div className="ds-connect-b">
          <label className="ds-field">
            <span>Link</span>
            <div className="ds-input"><I n="ext" /><input ref={first} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://… (a page, a CSV / Excel / JSON file, a feed, an API)" maxLength={1000} /></div>
          </label>
          <label className="ds-field">
            <span>Name <i>optional</i></span>
            <div className="ds-input"><I n="edit" /><input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Chennai lake levels" maxLength={100} /></div>
          </label>

          <div className="ds-field">
            <span>How does the site sign in?</span>
            <div className="ds-modes" role="radiogroup">
              {MODES.map((m) => (
                <button type="button" key={m.mode} role="radio" aria-checked={mode === m.mode} className={mode === m.mode ? "on" : ""} onClick={() => setMode(m.mode)}>
                  {mode === m.mode && <motion.span layoutId="ds-mode-hl" className="ds-mode-hl" transition={{ type: "spring", stiffness: 420, damping: 32 }} />}
                  <I n={m.ic} /><b>{m.title}</b><small>{m.sub}</small>
                </button>
              ))}
            </div>
          </div>

          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={mode} className="ds-auth" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.28 }}>
              {mode === "apikey" && (
                <div className="ds-grid2">
                  <label className="ds-field span2"><span>API key</span>
                    <div className="ds-input"><I n="bolt" /><input type={show ? "text" : "password"} value={key} onChange={(e) => setKey(e.target.value)} placeholder="Paste the key the site issued" autoComplete="off" />
                      <button type="button" className="ds-eye" onClick={() => setShow((x) => !x)} aria-label={show ? "Hide" : "Show"}>{show ? "Hide" : "Show"}</button></div></label>
                  <label className="ds-field"><span>Key name</span><div className="ds-input"><input value={keyName} onChange={(e) => setKeyName(e.target.value)} placeholder="api-key" /></div></label>
                  <div className="ds-field"><span>Sent</span>
                    <div className="ds-seg">{(["query", "header"] as const).map((p) => <button type="button" key={p} className={keyPlace === p ? "on" : ""} onClick={() => setKeyPlace(p)}>{p === "query" ? "In the link" : "As a header"}</button>)}</div></div>
                  <p className="ds-hint span2"><I n="info" />data.gov.in: name <code>api-key</code>, in the link. Use the dataset&apos;s API address (api.data.gov.in/resource/…).</p>
                </div>
              )}
              {(mode === "login" || mode === "basic") && (
                <div className="ds-grid2">
                  <label className="ds-field"><span>User name</span><div className="ds-input"><I n="user" /><input value={user} onChange={(e) => setUser(e.target.value)} autoComplete="off" placeholder="officer@…" /></div></label>
                  <label className="ds-field"><span>Password</span><div className="ds-input"><I n="shield" /><input type={show ? "text" : "password"} value={pass} onChange={(e) => setPass(e.target.value)} autoComplete="new-password" />
                    <button type="button" className="ds-eye" onClick={() => setShow((x) => !x)}>{show ? "Hide" : "Show"}</button></div></label>
                  {mode === "login" && <label className="ds-field span2"><span>Sign-in page <i>if it is not the link itself</i></span><div className="ds-input"><I n="ext" /><input value={loginUrl} onChange={(e) => setLoginUrl(e.target.value)} placeholder="https://…/login" /></div></label>}
                  <p className="ds-hint span2"><I n="info" />{mode === "login" ? "A browser on the server types these into the site's own sign-in form, keeps the session, and signs in again by itself when it expires." : "Sent only to this site, as the password pop-up expects."}</p>
                </div>
              )}
              {mode === "manual" && (
                <div className="ds-grid2">
                  <label className="ds-field span2"><span>Sign-in page <i>optional</i></span><div className="ds-input"><I n="ext" /><input value={loginUrl} onChange={(e) => setLoginUrl(e.target.value)} placeholder="https://…/login" /></div></label>
                  <p className="ds-hint span2"><I n="info" />A browser window opens on the computer running District IQ: sign in there (OTP and CAPTCHA included). The session is kept; when it expires, the window opens again. The Studio never answers an OTP or CAPTCHA itself.</p>
                </div>
              )}
              {mode === "none" && <p className="ds-hint"><I n="info" />Pages that build themselves with JavaScript are opened in a real browser automatically. Sites whose robots.txt asks automated readers to stay out are not read.</p>}
            </motion.div>
          </AnimatePresence>

          <div className="ds-field">
            <span>Keep it up to date</span>
            <div className="ds-seg wide">{EVERY.map((e) => <button type="button" key={String(e.v)} className={every === e.v ? "on" : ""} onClick={() => setEvery(e.v)}>{e.t}</button>)}</div>
          </div>

          {needsOk && (
            <label className="ds-consent">
              <input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} />
              <span>I am authorised to use this account to read this data for the Collectorate. <small>Encrypted on this server, never shown again and never sent to an AI model.</small></span>
            </label>
          )}
        </div>

        <footer>
          <span className="ds-connect-note"><I n="shield" />Every read is logged in the audit trail.</span>
          <button type="button" className="ds-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="ds-btn" disabled={!ready}><I n="bolt" />Connect</button>
        </footer>
      </motion.form>
    </motion.div>
  );
}
