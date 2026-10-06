"use client";

/**
 * Source onboarding, in the top bar: paste a link into the dock and the agent drawer opens. The drawer shows the
 * agent's steps live (streamed from /api/collector/sources/onboard), then what the link is, the AI's field mapping
 * (editable), and sample items exactly as the dashboard will store them. Nothing is saved until the Collector
 * approves; after that the source runs on schedule with the stored mapping and no AI calls.
 *
 * Motion: motion (motion.dev) for presence, springs and staggered lists; anime.js for the timeline's progress rail,
 * scrambled step labels, counters and the drawn success mark. Both respect prefers-reduced-motion.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { animate, createDrawable, scrambleText, stagger } from "animejs";
import type { Draft, PreviewRow, StepId, Detected, Auth } from "@/lib/collector/onboard";
import type { Mapping, DateFormat } from "@/lib/collector/sourcemap";
import { I, type IconName } from "./icons";

const EASE = [0.32, 0.72, 0, 1] as const;
const calm = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const LOOKS_LIKE_LINK = (s: string) => /^(https?:\/\/)?([\w-]+\.)+[a-z]{2,}(:\d+)?([/?#]\S*)?$/i.test(s.trim());

// ------------------------------------------------------------------ dock --

const WORDS = ["RSS feed", "JSON API", "web page", "login portal"];

/** The top-bar field: paste (or type and press Enter) a link to start the agent. */
export function LinkDock({ onSubmit }: { onSubmit: (url: string) => void }) {
  const [v, setV] = useState("");
  const [focus, setFocus] = useState(false);
  const [k, setK] = useState(0);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (focus || v || calm()) return;
    const t = setInterval(() => setK((x) => (x + 1) % WORDS.length), 2800);
    return () => clearInterval(t);
  }, [focus, v]);
  const ok = LOOKS_LIKE_LINK(v);
  const go = (u: string) => {
    if (!LOOKS_LIKE_LINK(u)) return;
    onSubmit(u.trim());
    setV("");
    ref.current?.blur();
  };
  return (
    <form className={`ldock${focus ? " on" : ""}${ok ? " ok" : ""}`} onSubmit={(e) => { e.preventDefault(); go(v); }} aria-label="Add a source by its link">
      <div className="ldock-f">
      <span className="ldock-ring" aria-hidden="true" />
      <span className="ldock-ic"><I n="link" /></span>
      <input ref={ref} id="dic-src" value={v} onChange={(e) => setV(e.target.value)} onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
        onPaste={(e) => { const t = e.clipboardData.getData("text"); if (LOOKS_LIKE_LINK(t)) { e.preventDefault(); go(t); } }}
        aria-label="Paste a source link: feed, API, web page or login portal" autoComplete="off" spellCheck={false} />
      {!v && (
        <span className="ldock-hint" aria-hidden="true">
          {focus ? "Paste a link and the agent sets it up" : <>Add a source:&nbsp;
            <AnimatePresence mode="wait" initial={false}>
              <motion.b key={k} initial={{ y: 9, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -9, opacity: 0 }} transition={{ duration: 0.3, ease: EASE }}>{WORDS[k]}</motion.b>
            </AnimatePresence></>}
        </span>
      )}
      <AnimatePresence>
        {ok && (
          <motion.button type="submit" className="ldock-go" aria-label="Run the onboarding agent" title="Run the onboarding agent"
            initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.5, opacity: 0 }} transition={{ type: "spring", stiffness: 520, damping: 30 }}>
            <I n="arrowUR" />
          </motion.button>
        )}
      </AnimatePresence>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------- drawer --

type State = "wait" | "run" | "ok" | "warn" | "fail";
interface Step { id: StepId; state: State; label: string; detail?: string; ms?: number }
type Phase = "running" | "login" | "review" | "stopped" | "saving" | "done";
type Ev = { type: "step"; id: StepId; state: State; label: string; detail?: string; ms?: number } | { type: "draft"; draft: Draft } | { type: "stop" } | { type: "error"; message: string };

const ORDER: StepId[] = ["check", "fetch", "detect", "records", "map", "preview"];
const WAITING: Record<StepId, string> = {
  check: "Check the link", fetch: "Fetch it", detect: "Work out what it is", records: "Find the records", map: "Map fields with AI", preview: "Build a preview"
};
const fresh = (): Step[] => ORDER.map((id) => ({ id, state: "wait", label: WAITING[id] }));

const TYPE: Record<Detected, { l: string; ic: IconName; sub: string }> = {
  rss: { l: "RSS / Atom feed", ic: "rss", sub: "Standard feed" },
  api: { l: "JSON API", ic: "api", sub: "Structured data" },
  page: { l: "Web page", ic: "globe", sub: "Read from its layout" },
  login: { l: "Login portal", ic: "lock", sub: "Needs the source's own sign-in" }
};

const FIELDS: { k: keyof Mapping; l: string; ic: IconName; multi?: boolean; need?: boolean }[] = [
  { k: "title", l: "Headline", ic: "doc", need: true },
  { k: "published", l: "Date", ic: "clock" },
  { k: "place", l: "Place", ic: "pin", multi: true },
  { k: "body", l: "Details", ic: "scroll", multi: true },
  { k: "url", l: "Link", ic: "ext" },
  { k: "category", l: "Category", ic: "layers" },
  { k: "lat", l: "Latitude", ic: "target" },
  { k: "lon", l: "Longitude", ic: "target" },
  { k: "id", l: "Record ID", ic: "bookmark" }
];
const DATE_FMT: [DateFormat, string][] = [["auto", "Auto"], ["dmy", "Day first"], ["mdy", "Month first"], ["iso", "ISO"], ["rfc822", "RFC 822"], ["unix", "Unix s"], ["unix_ms", "Unix ms"]];
const REFRESH: [number, string][] = [[60, "Hourly"], [360, "Every 6 h"], [1440, "Daily, 6 AM"]];

export interface OnboardRun { url: string; key: number }

export function OnboardDrawer({ run, onClose, onDone, toast }: {
  run: OnboardRun; onClose: () => void; onDone: () => void; toast: (msg: string, kind?: "ok" | "alert") => void;
}) {
  const [steps, setSteps] = useState<Step[]>(fresh);
  const [phase, setPhase] = useState<Phase>("running");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [stopMsg, setStopMsg] = useState<string | null>(null);
  const [mapping, setMapping] = useState<Mapping | null>(null);
  const [preview, setPreview] = useState<PreviewRow[]>([]);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [tab, setTab] = useState<"preview" | "mapping" | "raw">("preview");
  const [name, setName] = useState("");
  const [refresh, setRefresh] = useState(1440);
  const [authorized, setAuthorized] = useState(false);
  const [auth, setAuth] = useState<Auth | null>(null);
  const [result, setResult] = useState<{ ok: boolean; items_new: number; seen: number; error: string | null } | null>(null);
  const abort = useRef<AbortController | null>(null);
  const queue = useRef<Ev[]>([]);
  const ticking = useRef(false);

  // events are shown one at a time, at least ~240 ms apart, so a fast run still reads as steps (nothing is invented)
  const apply = useCallback((e: Ev) => {
    if (e.type === "step") setSteps((s) => s.map((x) => (x.id === e.id ? { id: e.id, state: e.state, label: e.label, detail: e.detail, ms: e.ms } : x)));
    else if (e.type === "draft") {
      const d = e.draft;
      setDraft(d);
      setMapping(d.mapping);
      setPreview(d.preview);
      setName(d.name);
      setRefresh(d.refreshMinutes);
      setPhase(d.login ? "login" : "review");
      setTab(d.mapping.title ? "preview" : "mapping");
    } else if (e.type === "stop") setPhase("stopped");
    else { setStopMsg(e.message); setPhase("stopped"); }
  }, []);
  const pump = useCallback(() => {
    if (ticking.current) return;
    ticking.current = true;
    const next = () => {
      const e = queue.current.shift();
      if (!e) { ticking.current = false; return; }
      apply(e);
      setTimeout(next, calm() ? 0 : e.type === "step" && e.state === "run" ? 160 : 260);
    };
    next();
  }, [apply]);

  const start = useCallback(async (withAuth: Auth | null) => {
    abort.current?.abort();
    const ctl = new AbortController();
    abort.current = ctl;
    queue.current = [];
    setSteps(fresh());
    setPhase("running");
    setDraft(null);
    setStopMsg(null);
    setResult(null);
    setAuthorized(false);
    try {
      const r = await fetch("/api/collector/sources/onboard", {
        method: "POST", headers: { "Content-Type": "application/json" }, signal: ctl.signal,
        body: JSON.stringify({ url: run.url, auth: withAuth })
      });
      if (!r.ok || !r.body) {
        const j = await r.json().catch(() => ({}));
        queue.current.push({ type: "error", message: j.error ?? "The agent could not start." });
        return pump();
      }
      const rd = r.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { done, value } = await rd.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let i;
        while ((i = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, i).trim();
          buf = buf.slice(i + 1);
          if (line) { queue.current.push(JSON.parse(line)); pump(); }
        }
      }
    } catch (e: any) {
      if (ctl.signal.aborted) return;
      queue.current.push({ type: "error", message: "Lost the connection to the agent. Try again." });
      pump();
    }
  }, [run.url, pump]);

  useEffect(() => {
    setAuth(null);
    start(null);
    return () => abort.current?.abort();
  }, [run.key]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && phase !== "saving") { e.stopPropagation(); onClose(); } };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose, phase]);

  // the Collector changed the mapping: the samples again, through the same classifier and place resolver
  const first = useRef(true);
  useEffect(() => {
    if (!draft || !mapping) return;
    if (first.current) { first.current = false; return; }
    if (!mapping.title) { setPreview([]); return; }
    setPreviewBusy(true);
    const t = setTimeout(async () => {
      try {
        const r = await fetch("/api/collector/sources/onboard/preview", { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ records: draft.records, mapping }) });
        const j = await r.json();
        if (r.ok) setPreview(j.preview);
      } finally { setPreviewBusy(false); }
    }, 320);
    return () => clearTimeout(t);
  }, [mapping]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { first.current = true; }, [draft]);

  const approve = async () => {
    if (!draft || !mapping) return;
    setPhase("saving");
    try {
      const r = await fetch("/api/collector/sources/onboard/approve", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: draft.url, kind: draft.kind, detected: draft.detected, name, about: draft.about, recordPath: draft.recordPath,
          mapping, refreshMinutes: refresh, auth, authorized: true })
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error ?? "Could not save the source.");
      setResult({ ok: !!j.run?.ok, items_new: Number(j.run?.items_new ?? 0), seen: Number(j.run?.seen ?? 0), error: j.run?.error ?? null });
      setPhase("done");
      onDone();
    } catch (e: any) {
      toast(e.message, "alert");
      setPhase("review");
    }
  };

  const doneCount = steps.filter((s) => s.state === "ok" || s.state === "warn").length;
  const host = (() => { try { return new URL(/^https?:/i.test(run.url) ? run.url : `https://${run.url}`).hostname.replace(/^www\./, ""); } catch { return run.url; } })();

  return (
    <MotionConfig reducedMotion="user">
      <motion.div className="ob-scrim" onClick={() => phase !== "saving" && onClose()} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.22 }} />
      <motion.aside className="ob" role="dialog" aria-label="Source onboarding agent"
        initial={{ x: 56, opacity: 0, scale: 0.985 }} animate={{ x: 0, opacity: 1, scale: 1 }} exit={{ x: 40, opacity: 0, transition: { duration: 0.2, ease: EASE } }}
        transition={{ type: "spring", stiffness: 340, damping: 34, mass: 0.9 }}>
        <div className="ob-core">
          <header className="ob-h">
            <span className={`ob-mark${phase === "running" ? " live" : ""}`}><I n="scan" /></span>
            <div className="ob-ht">
              <b>Source onboarding agent</b>
              <span className="ob-url" title={run.url}><i className={`ob-dot ${phase === "stopped" ? "bad" : phase === "running" ? "run" : "good"}`} />{host}<em>{run.url.replace(/^https?:\/\/(www\.)?/i, "").replace(host, "").slice(0, 60)}</em></span>
            </div>
            {(phase === "review" || phase === "stopped") && <button className="ob-ib" onClick={() => start(auth)} title="Run the agent again" aria-label="Run the agent again"><I n="refresh" /></button>}
            <button className="ob-ib" onClick={onClose} disabled={phase === "saving"} aria-label="Close"><I n="x" /></button>
          </header>

          <div className="ob-main">
            <aside className="ob-rail">
              <div className="ob-cap">Agent run<span>{doneCount}/{ORDER.length}</span></div>
              <Timeline steps={steps} />
              <div className="ob-after">
                <div className="ob-cap">After you approve</div>
                <p><I n="cal" />Runs on schedule as a plain job</p>
                <p><I n="flow" />Uses the saved field mapping</p>
                <p><I n="shield" />No AI calls, no data leaves for an AI</p>
              </div>
            </aside>

            <section className="ob-pane">
              <AnimatePresence mode="wait" initial={false}>
                <motion.div key={phase === "saving" ? "review" : phase} className="ob-stage"
                  initial={{ opacity: 0, y: 10, filter: "blur(4px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} exit={{ opacity: 0, y: -6, filter: "blur(3px)" }}
                  transition={{ duration: 0.32, ease: EASE }}>
                  {phase === "running" ? <LiveView steps={steps} host={host} />
                    : phase === "stopped" ? <Stopped steps={steps} msg={stopMsg} retry={() => start(auth)} />
                      : phase === "login" && draft?.login ? <LoginStep draft={draft} onSubmit={(a) => { setAuth(a); start(a); }} />
                        : phase === "done" && result && draft ? <Done result={result} name={name} refresh={refresh} onClose={onClose} />
                          : draft && mapping ? (
                            <Review draft={draft} mapping={mapping} setMapping={setMapping} preview={preview} previewBusy={previewBusy} tab={tab} setTab={setTab} />
                          ) : null}
                </motion.div>
              </AnimatePresence>
            </section>
          </div>

          <AnimatePresence initial={false}>
            {(phase === "review" || phase === "saving") && draft && mapping && (
              <motion.footer className="ob-f" initial={{ y: 24, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 24, opacity: 0 }} transition={{ type: "spring", stiffness: 420, damping: 36 }}>
                <div className="ob-f1">
                  <label className="ob-name"><span>Name</span><input value={name} onChange={(e) => setName(e.target.value)} maxLength={128} /></label>
                  <div className="ob-seg" role="radiogroup" aria-label="Run every">
                    {REFRESH.map(([m, l]) => (
                      <button key={m} role="radio" aria-checked={refresh === m} className={refresh === m ? "on" : ""} onClick={() => setRefresh(m)}>
                        {refresh === m && <motion.span layoutId="ob-seg-pill" className="ob-seg-pill" transition={{ type: "spring", stiffness: 500, damping: 38 }} />}
                        <span>{l}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="ob-f2">
                  <label className="ob-chk"><input type="checkbox" checked={authorized} onChange={(e) => setAuthorized(e.target.checked)} />
                    <span>The office may use this source, and it allows automated reading. No CAPTCHA, paywall or robots rule is bypassed.</span></label>
                  <button className="ob-go" disabled={!authorized || !mapping.title || name.trim().length < 2 || phase === "saving"} onClick={approve}>
                    <span>{phase === "saving" ? "Connecting…" : "Approve and connect"}</span>
                    <span className="ob-go-i">{phase === "saving" ? <I n="refresh" className="spin" /> : <I n="arrowUR" />}</span>
                  </button>
                </div>
              </motion.footer>
            )}
          </AnimatePresence>
        </div>
      </motion.aside>
    </MotionConfig>
  );
}

// -------------------------------------------------------------- timeline --

function Timeline({ steps }: { steps: Step[] }) {
  const fill = useRef<HTMLSpanElement>(null);
  const last = steps.reduce((a, s, k) => (s.state === "ok" || s.state === "warn" || s.state === "fail" ? k : a), -1);
  const running = steps.findIndex((s) => s.state === "run");
  const to = Math.max(last, running - 0.5);
  useEffect(() => {
    if (!fill.current) return;
    const v = to < 0 ? 0 : Math.min(1, to / (steps.length - 1));
    if (calm()) { fill.current.style.transform = `scaleY(${v})`; return; }
    animate(fill.current, { scaleY: v, duration: 700, ease: "outExpo" });
  }, [to, steps.length]);
  const failed = steps.some((s) => s.state === "fail");
  return (
    <ol className="ob-tl">
      <span className="ob-tl-rail" aria-hidden="true"><span ref={fill} className={`ob-tl-fill${failed ? " bad" : ""}`} /></span>
      {steps.map((s) => (
        <li key={s.id} className={`ob-st ${s.state}`}>
          <span className="ob-node" aria-hidden="true">
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span key={s.state} className="ob-node-i" initial={{ scale: 0.3, opacity: 0, rotate: -40 }} animate={{ scale: 1, opacity: 1, rotate: 0 }}
                exit={{ scale: 0.3, opacity: 0 }} transition={{ type: "spring", stiffness: 600, damping: 26 }}>
                {s.state === "ok" ? <I n="check" /> : s.state === "warn" ? <I n="alert" /> : s.state === "fail" ? <I n="x" /> : s.state === "run" ? <span className="ob-spin" /> : <span className="ob-pip" />}
              </motion.span>
            </AnimatePresence>
          </span>
          <span className="ob-st-t">
            <Scramble text={s.label} live={s.state !== "wait" && s.state !== "run"} />
            {s.detail && <motion.small initial={{ opacity: 0, y: -3 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: EASE }}>{s.detail}</motion.small>}
          </span>
          {s.ms != null && s.state !== "run" && <em className="ob-ms">{s.ms < 1000 ? `${s.ms} ms` : `${(s.ms / 1000).toFixed(1)} s`}</em>}
        </li>
      ))}
    </ol>
  );
}

/** Text that decodes into its new value (anime.js scrambleText) when `live`; React never owns the node's text. */
function Scramble({ text, live, className = "ob-st-l" }: { text: string; live: boolean; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const prev = useRef<string | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (prev.current === null || !live || calm()) el.textContent = text;
    else if (prev.current !== text) animate(el, { innerHTML: scrambleText({ text, chars: "a-z0-9", revealRate: 110, settleDuration: 200 }) });
    prev.current = text;
  }, [text, live]);
  return <span ref={ref} className={className} />;
}

// ------------------------------------------------------------- the pane --

function LiveView({ steps, host }: { steps: Step[]; host: string }) {
  const cur = steps.find((s) => s.state === "run") ?? [...steps].reverse().find((s) => s.state !== "wait");
  return (
    <div className="ob-live">
      <div className="ob-live-h">
        <span className="ob-beam" aria-hidden="true" />
        <span className="ob-live-k">Reading <b>{host}</b></span>
        <Scramble text={cur?.label ?? "Starting"} live className="ob-live-t" />
        <span className="ob-live-d">{cur?.detail ?? "The agent works in the open: every step shows here as it happens."}</span>
      </div>
      <div className="ob-skel" aria-hidden="true">
        {[0, 1, 2, 3].map((k) => (
          <div key={k} className="ob-sk" style={{ animationDelay: `${k * 120}ms` }}><i /><b /><b className="s" /></div>
        ))}
      </div>
    </div>
  );
}

function Stopped({ steps, msg, retry }: { steps: Step[]; msg: string | null; retry: () => void }) {
  const f = steps.find((s) => s.state === "fail");
  return (
    <div className="ob-stop">
      <span className="ob-stop-i"><I n="alert" /></span>
      <h3>{f?.label ?? "The agent stopped"}</h3>
      <p>{msg ?? f?.detail ?? "Something went wrong."}</p>
      <ul>
        <li>Check the link opens in a normal browser.</li>
        <li>Many sites publish an RSS feed or a data API: those links work best.</li>
        <li>Pages drawn by JavaScript have no readable list; look for the site&apos;s feed instead.</li>
      </ul>
      <button className="ob-ghost" onClick={retry}><I n="refresh" />Try again</button>
    </div>
  );
}

function LoginStep({ draft, onSubmit }: { draft: Draft; onSubmit: (a: Auth) => void }) {
  const l = draft.login!;
  const [f, setF] = useState({ loginUrl: l.loginUrl ?? draft.url, userField: l.userField ?? "username", passField: l.passField ?? "password", username: "", secret: "" });
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));
  return (
    <form className="ob-login" onSubmit={(e) => { e.preventDefault(); onSubmit({ mode: l.mode, ...f }); }}>
      <TypeHero detected="login" draft={draft} />
      <p className="ob-note">The agent found a sign-in. Give the account the office holds for this source; it is stored encrypted and used only for this site&apos;s own sign-in.</p>
      {l.mode === "form" && (
        <div className="ob-grid3">
          <label>Sign-in form posts to<input type="url" value={f.loginUrl} onChange={(e) => set("loginUrl", e.target.value)} /></label>
          <label>User field<input value={f.userField} onChange={(e) => set("userField", e.target.value)} /></label>
          <label>Password field<input value={f.passField} onChange={(e) => set("passField", e.target.value)} /></label>
        </div>
      )}
      <div className="ob-grid2">
        {l.mode !== "token" && <label>User name<input value={f.username} onChange={(e) => set("username", e.target.value)} autoComplete="off" required /></label>}
        <label>{l.mode === "token" ? "Access key" : "Password"}<input type="password" value={f.secret} onChange={(e) => set("secret", e.target.value)} autoComplete="new-password" required /></label>
      </div>
      <button className="ob-go" disabled={!f.secret}><span>Sign in and continue</span><span className="ob-go-i"><I n="arrowUR" /></span></button>
    </form>
  );
}

function TypeHero({ detected, draft, about }: { detected: Detected; draft: Draft; about?: boolean }) {
  const t = TYPE[detected];
  const size = draft.bytes > 1e6 ? `${(draft.bytes / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(draft.bytes / 1024))} KB`;
  return (
    <div className="ob-hero">
      <motion.span className={`ob-glyph g-${detected}`} initial={{ scale: 0.6, rotate: -12, opacity: 0 }} animate={{ scale: 1, rotate: 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 380, damping: 22, delay: 0.05 }}><I n={t.ic} /></motion.span>
      <div className="ob-hero-t">
        <span className="ob-eyebrow">{t.sub}</span>
        <b>{t.l}</b>
        {about && draft.about && <p className="ob-hero-p">{draft.about}</p>}
        <span className="ob-chips">
          <i>{draft.site}</i><i>HTTP {draft.http}</i><i>{size}</i>
          {draft.total > 0 && <i>{draft.total} records</i>}
          {about && draft.about && (
            <span className={`ob-rel ${draft.relevant ? "yes" : "no"}`} title={draft.relevanceNote}>
              <I n={draft.relevant ? "checkc" : "info"} />{draft.relevant ? "Useful to the Collector" : "May not be useful"}
            </span>
          )}
        </span>
      </div>
    </div>
  );
}

function Review({ draft, mapping, setMapping, preview, previewBusy, tab, setTab }: {
  draft: Draft; mapping: Mapping; setMapping: (m: Mapping) => void; preview: PreviewRow[]; previewBusy: boolean;
  tab: "preview" | "mapping" | "raw"; setTab: (t: "preview" | "mapping" | "raw") => void;
}) {
  const dated = preview.filter((p) => p.published).length, placed = preview.filter((p) => p.inChennai).length, civic = preview.filter((p) => p.civic).length;
  return (
    <div className="ob-review">
      <TypeHero detected={draft.detected} draft={draft} about />
      {draft.feedNote && <p className="ob-tip"><I n="rss" />{draft.feedNote}</p>}
      {!draft.relevant && draft.relevanceNote && <p className="ob-tip warn"><I n="info" />{draft.relevanceNote}</p>}
      {!!draft.notes.length && <ul className="ob-warn">{draft.notes.map((n, k) => <li key={k}><I n="alert" />{n}</li>)}</ul>}
      <div className="ob-tabs" role="tablist">
        {([["preview", "Preview", preview.length], ["mapping", "Field mapping", FIELDS.filter((f) => { const v = mapping[f.k]; return Array.isArray(v) ? v.length : !!v; }).length], ["raw", "Raw records", draft.records.length]] as const).map(([k, l, n]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>
            {tab === k && <motion.span layoutId="ob-tab-pill" className="ob-tab-pill" transition={{ type: "spring", stiffness: 480, damping: 38 }} />}
            <span>{l}<em>{n}</em></span>
          </button>
        ))}
        <span className="ob-ai" title={draft.ai.used ? `Mapped by ${draft.ai.provider}/${draft.ai.model}` : draft.ai.note ?? ""}>
          {draft.ai.used ? <><i className="ob-ai-dot" />{draft.ai.provider === "gemini" ? "Gemini" : draft.ai.provider} · {((draft.ai.ms ?? 0) / 1000).toFixed(1)} s</> : <>Matched by field names</>}
        </span>
      </div>
      <div className="ob-tabbody">
        {tab === "preview" ? (
          <>
            <div className="ob-stats">
              <Stat n={preview.length} l="sample items" /><Stat n={dated} l="dated" /><Stat n={placed} l="placed in Chennai" /><Stat n={civic} l="civic issues" tone />
            </div>
            {previewBusy && <div className="ob-thin" aria-hidden="true" />}
            {preview.length ? (
              <motion.ul className="ob-cards" initial="h" animate="s" variants={{ s: { transition: { staggerChildren: 0.05 } } }} key={JSON.stringify(mapping)}>
                {preview.map((p, k) => (
                  <motion.li key={k} className="ob-card" variants={{ h: { opacity: 0, y: 12 }, s: { opacity: 1, y: 0, transition: { duration: 0.42, ease: EASE } } }}>
                    <span className={`ob-civ${p.civic ? " on" : ""}`} title={p.civic ? "Looks like a civic issue" : "Not a civic issue"} />
                    <div className="ob-card-b">
                      <b>{p.url ? <a href={p.url} target="_blank" rel="noreferrer noopener">{p.title}</a> : p.title}</b>
                      <span className="ob-meta">
                        <i><I n="clock" />{p.published ? new Date(p.published).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : p.rawDate ? `"${p.rawDate.slice(0, 24)}"` : "No date"}</i>
                        <i className={p.inChennai ? "" : "dim"} title={p.inChennai ? "Placed in Chennai district" : "Not placed in Chennai district"}><I n="pin" />{p.place ? `${p.place.slice(0, 48)}${p.ward ? ` · ward ${p.ward}` : ""}` : "No place"}</i>
                        {p.category && <i className={p.civic ? "acc" : ""}><I n="layers" />{p.category}</i>}
                      </span>
                    </div>
                  </motion.li>
                ))}
              </motion.ul>
            ) : <div className="ob-empty">{mapping.title ? "No sample record has a headline with this mapping." : "Choose the headline field under Field mapping."}</div>}
          </>
        ) : tab === "mapping" ? <MappingEditor draft={draft} mapping={mapping} setMapping={setMapping} /> : <Raw records={draft.records} />}
      </div>
    </div>
  );
}

function Stat({ n, l, tone }: { n: number; l: string; tone?: boolean }) {
  const ref = useRef<HTMLElement>(null);
  const shown = useRef(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (calm()) { el.textContent = String(n); shown.current = n; return; }
    const o = { v: shown.current };
    animate(o, { v: n, duration: 900, ease: "outExpo", onUpdate: () => { el.textContent = String(Math.round(o.v)); } });
    shown.current = n;
  }, [n]);
  return <span className={`ob-stat${tone ? " acc" : ""}`}><b ref={ref}>0</b><small>{l}</small></span>;
}

function MappingEditor({ draft, mapping, setMapping }: { draft: Draft; mapping: Mapping; setMapping: (m: Mapping) => void }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!box.current || calm()) return;
    animate(box.current.querySelectorAll(".ob-mrow"), { opacity: [0, 1], x: [-10, 0], delay: stagger(32), duration: 460, ease: "outCubic" });
  }, []);
  const sample = (k: string | null) => (k ? draft.records.find((r) => r[k])?.[k] ?? "" : "");
  const opts = draft.fields.map((f) => f.key);
  const set = (k: keyof Mapping, v: unknown) => setMapping({ ...mapping, [k]: v } as Mapping);
  return (
    <div className="ob-map" ref={box}>
      {FIELDS.map((f) => {
        const v = mapping[f.k];
        const list = Array.isArray(v) ? v : [];
        return (
          <div key={f.k} className={`ob-mrow${f.need && !v ? " need" : ""}`}>
            <span className="ob-mk"><I n={f.ic} />{f.l}</span>
            <span className="ob-arrow" aria-hidden="true">←</span>
            <div className="ob-mv">
              {f.multi ? (
                <div className="ob-multi">
                  {list.map((x) => <span key={x} className="ob-tag">{x}<button onClick={() => set(f.k, list.filter((y) => y !== x))} aria-label={`Remove ${x}`}><I n="x" /></button></span>)}
                  {list.length < 3 && (
                    <select value="" onChange={(e) => e.target.value && set(f.k, [...list, e.target.value])} aria-label={`Add a ${f.l.toLowerCase()} field`}>
                      <option value="">{list.length ? "+ add" : "Not used"}</option>
                      {opts.filter((o) => !list.includes(o)).map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                  )}
                </div>
              ) : (
                <div className="ob-single">
                  <select value={(v as string | null) ?? ""} onChange={(e) => set(f.k, e.target.value || null)} aria-label={`${f.l} field`}>
                    <option value="">{f.need ? "Choose…" : "Not used"}</option>
                    {opts.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                  {f.k === "published" && v && (
                    <select className="ob-fmt" value={mapping.dateFormat} onChange={(e) => set("dateFormat", e.target.value)} aria-label="Date format">
                      {DATE_FMT.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                    </select>
                  )}
                </div>
              )}
              <small className="ob-sample">{(f.multi ? list.map(sample).filter(Boolean).join(" · ") : sample(v as string | null)).slice(0, 110) || "—"}</small>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Raw({ records }: { records: Draft["records"] }) {
  return (
    <div className="ob-raw">
      {records.slice(0, 4).map((r, k) => (
        <dl key={k}>
          {Object.entries(r).slice(0, 16).map(([a, b]) => <div key={a}><dt>{a}</dt><dd>{b.slice(0, 220)}</dd></div>)}
        </dl>
      ))}
    </div>
  );
}

function Done({ result, name, refresh, onClose }: { result: { ok: boolean; items_new: number; seen: number; error: string | null }; name: string; refresh: number; onClose: () => void }) {
  const svg = useRef<SVGSVGElement>(null);
  useEffect(() => {
    if (!svg.current || calm()) return;
    const d = createDrawable(svg.current.querySelectorAll("circle, path"));
    animate(d, { draw: ["0 0", "0 1"], duration: 720, delay: stagger(260), ease: "inOutQuad" });
  }, []);
  const when = refresh === 1440 ? "every day at 6:00 AM" : refresh === 360 ? "every 6 hours" : "every hour";
  return (
    <div className="ob-done">
      <svg ref={svg} viewBox="0 0 64 64" className={`ob-done-mark${result.ok ? "" : " warn"}`} aria-hidden="true">
        <circle cx="32" cy="32" r="28" /><path d={result.ok ? "M20 33 l8 8 l16 -18" : "M32 18 v18 M32 44 v1"} />
      </svg>
      <h3>{name} is connected</h3>
      <p>{result.ok ? <>First run: <Count n={result.items_new} /> new items of {result.seen} read, classified and placed.</> : <>Saved. The first run reported: {result.error}</>}</p>
      <div className="ob-done-k">
        <span><I n="cal" />Runs {when}</span><span><I n="flow" />Saved mapping</span><span><I n="shield" />No AI calls</span>
      </div>
      <button className="ob-ghost" onClick={onClose}>Done</button>
    </div>
  );
}

function Count({ n }: { n: number }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (calm()) { el.textContent = String(n); return; }
    const o = { v: 0 };
    animate(o, { v: n, duration: 1100, delay: 500, ease: "outExpo", onUpdate: () => { el.textContent = String(Math.round(o.v)); } });
  }, [n]);
  return <b ref={ref}>0</b>;
}

export function OnboardLayer({ run, ...rest }: { run: OnboardRun | null; onClose: () => void; onDone: () => void; toast: (msg: string, kind?: "ok" | "alert") => void }): ReactNode {
  return <AnimatePresence>{run && <OnboardDrawer key="ob" run={run} {...rest} />}</AnimatePresence>;
}
