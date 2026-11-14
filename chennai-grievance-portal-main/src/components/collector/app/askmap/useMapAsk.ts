"use client";

/**
 * Ask the Map's state on a console: the question, the plan (the conversation's state, kept per tab), the answer, the
 * camera's cue and what the panel is pointing at. One instance per console (the Collector's shell, the officer's
 * Board); the map and the panel both read it, so the answer survives "Back to overview" and a page change.
 *
 * The conversation is a chat: a question joins it the moment it is asked (a pending turn), and keeps its place when
 * the answer fails or the question opens Rain & flooding instead. It is kept per tab (sessionStorage, without the
 * answers' rows); an earlier answer is asked again when it is opened after a reload.
 */
import { useCallback, useRef, useState } from "react";
import type { AskResponse } from "@/lib/map/ask";
import type { Plan } from "@/lib/map/plan";
import { followUpMoves } from "@/lib/map/camera";
import type { Route } from "./actions";
import { rehearsalIntent } from "@/lib/rehearsal/intent";

export interface MapAskContext { zone: number | null; taluk: string | null }

export interface MapAsk {
  /** the map card fills the page */
  grown: boolean;
  setGrown: (v: boolean) => void;
  busy: boolean;
  error: string | null;
  resp: AskResponse | null;
  /** the plan follow-ups edit */
  plan: Plan | null;
  /** questions asked in this tab, newest last (the Ask box's ↑) */
  history: string[];
  /** this conversation: each question and what came of it, oldest first (the panel shows them as a chat) */
  turns: Turn[];
  /** shows an earlier answer again (asking it again when it was kept without its rows), and makes it the one follow-ups edit */
  restore: (id: number) => void;
  /** asks a failed or stopped question again, in its own place in the chat */
  retry: (id: number) => void;
  /** a new cue for the camera: the map plays the answer's shots when it changes */
  cue: { seq: number; index: number; move: boolean };
  replay: (index?: number) => void;
  tookOver: boolean;
  setTookOver: (v: boolean) => void;
  /** incident ids the panel points at on the map (a trace step, a brief count, a cluster) */
  spot: { ids: string[]; label: string } | null;
  setSpot: (s: { ids: string[]; label: string } | null) => void;
  /** the row under the mouse: not React state (a hover would re-render the whole console); the map listens instead */
  hover: string | null;
  setHover: (id: string | null) => void;
  onHover: (f: (id: string | null) => void) => () => void;
  focus: string | null;
  setFocus: (id: string | null) => void;
  /** the Before · Now toggle of a change answer */
  showBefore: boolean;
  setShowBefore: (v: boolean) => void;
  /** the trace panel is open ("why these?") */
  traceOpen: boolean;
  setTraceOpen: (v: boolean) => void;
  ask: (text: string) => Promise<AskResponse | null>;
  run: (plan: Plan, label?: string) => Promise<AskResponse | null>;
  draw: (d: { lat: number; lon: number; r: number } | { ward: number } | { incidentId: string }) => Promise<AskResponse | null>;
  clear: () => void;
  /** a UI follow-up ("send these to SWD", "export"): the panel acts on it */
  uiCue: { seq: number; ui: AskResponse["ui"]; dept: string | null } | null;
  /** the officer's visit order on the map (numbered stops, straight legs) */
  route: Route | null;
  setRoute: (r: Route | null) => void;
}

/**
 * One exchange of the chat. `resp` is the answer (null while it is coming, when it failed, or when the turn was kept
 * without its rows); `note` is what happened instead of an answer ("Opened Rain & flooding"); `error` is why it failed.
 */
export interface Turn {
  id: number;
  q: string;
  resp: AskResponse | null;
  pending?: boolean;
  error?: string | null;
  note?: string | null;
  /** to ask it again: the plan it was answered with, else the request it was (a drawn circle, a ward), else its words */
  plan?: Plan | null;
  req?: Record<string, unknown> | null;
  /** the answer in a few words, kept when the rows are not */
  gist?: string | null;
}
const TURNS_MAX = 12;

const HISTORY_KEY = "diq-map-history";
const PLAN_KEY = "diq-map-plan";
const TURNS_KEY = "diq-map-turns";

function load<T>(k: string, d: T): T {
  try { const v = sessionStorage.getItem(k); return v ? (JSON.parse(v) as T) : d; } catch { return d; }
}
function save(k: string, v: unknown) {
  try { sessionStorage.setItem(k, JSON.stringify(v)); } catch { /* not kept */ }
}
/** the chat without the answers' rows (they can be large): enough to show it folded and to ask each again */
function keepTurns(turns: Turn[]) {
  save(TURNS_KEY, turns.filter((t) => !t.pending).map((t) => ({ id: t.id, q: t.q, resp: null, error: t.error ?? null, note: t.note ?? null, plan: t.resp?.plan ?? t.plan ?? null, req: t.req ?? null,
    gist: t.resp ? answerGist(t.resp, t.resp.lang === "ta" ? "ta" : "en") : t.gist ?? null })));
}

const READY = / · (map layer ready|வரைபட அடுக்கு தயார்)\.?$/;
/** "160 open flooding incidents (last 7 days)" -> big "160", then "open flooding incidents · last 7 days" */
export function splitHead(h: string): { big: string | null; rest: string } {
  // the period in brackets at the end may hold brackets of its own ("today (6 Nov, since midnight)", from the shared period reader)
  const clean = h.replace(READY, "").replace(/\.$/, "").replace(/ \(((?:[^()]|\([^()]*\))+)\)$/, " · $1");
  const m = clean.match(/^([\d,]+(?:\.\d+)?)\s+(.+)$/);
  return m ? { big: m[1], rest: m[2] } : { big: null, rest: clean };
}
/** The answer in a few words, for a folded turn: "160 open flooding incidents · last 7 days". */
export function answerGist(r: AskResponse, lang: "en" | "ta"): string {
  if (r.answer) { const { big, rest } = splitHead(r.answer.headline); return big ? `${big} ${rest}` : rest; }
  if (r.brief) return `${lang === "ta" ? "இங்கே என்ன நடக்கிறது" : "What is happening"}: ${lang === "ta" ? r.brief.label.ta : r.brief.label.en}`;
  if (r.say) return lang === "ta" ? r.say.ta : r.say.en;
  return "";
}

const UI_NOTE: Record<string, [string, string]> = {
  send: ["Opening Send to department for this answer.", "இந்தப் பதிலைத் துறைக்கு அனுப்பத் திறக்கிறது."],
  export: ["Opening Export for this answer.", "இந்தப் பதிலைப் பதிவிறக்கத் திறக்கிறது."],
  visits: ["Planning your visits from this answer.", "இந்தப் பதிலிலிருந்து வருகைகளைத் திட்டமிடுகிறது."],
  open_trace: ["Showing how this was worked out.", "இது எப்படிக் கணக்கிடப்பட்டது என்று காட்டுகிறது."]
};

export function useMapAsk(context: () => MapAskContext): MapAsk {
  const [grown, setGrown] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resp, setResp] = useState<AskResponse | null>(null);
  const [plan, setPlan] = useState<Plan | null>(() => (typeof window === "undefined" ? null : load<Plan | null>(PLAN_KEY, null)));
  const [history, setHistory] = useState<string[]>(() => (typeof window === "undefined" ? [] : load<string[]>(HISTORY_KEY, [])));
  const [cue, setCue] = useState({ seq: 0, index: 0, move: true });
  const [tookOver, setTookOver] = useState(false);
  const [spot, setSpot] = useState<MapAsk["spot"]>(null);
  const hoverRef = useRef<string | null>(null);
  const hoverSubs = useRef(new Set<(id: string | null) => void>());
  const setHover = useCallback((id: string | null) => {
    if (hoverRef.current === id) return;
    hoverRef.current = id;
    hoverSubs.current.forEach((f) => f(id));
  }, []);
  const onHover = useCallback((f: (id: string | null) => void) => { hoverSubs.current.add(f); return () => { hoverSubs.current.delete(f); }; }, []);
  const [focus, setFocus] = useState<string | null>(null);
  const [showBefore, setShowBefore] = useState(false);
  const [traceOpen, setTraceOpen] = useState(false);
  const [uiCue, setUiCue] = useState<MapAsk["uiCue"]>(null);
  const [route, setRoute] = useState<Route | null>(null);
  const [turns, setTurnsState] = useState<Turn[]>(() => (typeof window === "undefined" ? [] : load<Turn[]>(TURNS_KEY, [])));
  const turnsRef = useRef(turns);
  turnsRef.current = turns;
  const setTurns = useCallback((f: (t: Turn[]) => Turn[]) => {
    setTurnsState((t) => { const n = f(t).slice(-TURNS_MAX); keepTurns(n); return n; });
  }, []);
  // ids go on from the kept chat's, so a reload never gives two turns one id
  const seq = useRef(turns.reduce((m, t) => Math.max(m, t.id), 0));
  const planRef = useRef(plan);
  planRef.current = plan;
  const ctl = useRef<AbortController | null>(null);

  /**
   * Asks the server. The question joins the chat at once (`into`: a turn already in it, asked again in its place);
   * the answer, a note or the reason it failed fills that turn when it comes.
   */
  const post = useCallback(async (body: Record<string, unknown>, label: string, into?: number): Promise<AskResponse | null> => {
    ctl.current?.abort();
    const ac = new AbortController();
    ctl.current = ac;
    setBusy(true);
    setError(null);
    const id = into ?? ++seq.current;
    const set = (patch: Partial<Turn>) => setTurns((t) => t.map((x) => (x.id === id ? { ...x, ...patch } : x)));
    if (into != null) set({ pending: true, error: null, note: null });
    else {
      const { prev: _prev, ...req } = body;
      setTurns((t) => [...t, { id, q: label, resp: null, pending: true, plan: (body.plan as Plan | undefined) ?? null, req }]);
    }
    try {
      const c = context();
      const r = await fetch("/api/map/ask", {
        method: "POST", headers: { "content-type": "application/json" }, signal: ac.signal,
        body: JSON.stringify({ ...body, context: { zone: c.zone, taluk: c.taluk, incidentId: null, ward: null, drawn: null, ...((body.context as object) ?? {}) } })
      });
      const j = await r.json().catch(() => null);
      // a newer question took over while this one was arriving
      if (ac.signal.aborted) return null;
      if (!r.ok || !j) {
        const msg = j?.error ?? "The map could not answer that just now.";
        set({ pending: false, error: msg });
        setError(msg);
        return null;
      }
      const a = j as AskResponse;
      if (a.kind === "ui") {
        if (a.ui === "clear") { clearAll(); return a; }
        if (a.ui === "open_trace") setTraceOpen(true);
        const lang = a.lang === "ta" ? 1 : 0;
        set({ pending: false, note: a.ui ? UI_NOTE[a.ui]?.[lang] ?? null : null });
        setUiCue({ seq: ++seq.current, ui: a.ui, dept: a.uiDept });
        return a;
      }
      setResp(a);
      set({ pending: false, resp: a, plan: a.plan, error: null, note: null });
      setSpot(null);
      setFocus(null);
      setShowBefore(false);
      setRoute(null);
      if (a.kind === "answer" && a.plan) { setPlan(a.plan); save(PLAN_KEY, a.plan); }
      // a new question moves the camera; a small follow-up keeps the view (camera.ts followUpMoves)
      const moves = followUpMoves(a.edited ?? null, !!planRef.current && sameShape(planRef.current, a.plan));
      setTookOver(false);
      setCue({ seq: ++seq.current, index: 0, move: moves });
      return a;
    } catch (e) {
      if ((e as Error).name === "AbortError") set({ pending: false, error: "Stopped: you asked something else before the answer came." });
      else { set({ pending: false, error: "The map could not be reached. Please try again." }); setError("The map could not be reached. Please try again."); }
      return null;
    } finally {
      if (ctl.current === ac) setBusy(false);
    }
  }, [context, setTurns]); // eslint-disable-line react-hooks/exhaustive-deps

  const clearAll = useCallback(() => {
    ctl.current?.abort();
    setResp(null); setPlan(null); setTurnsState([]); setSpot(null); setFocus(null); setHover(null); setError(null); setTraceOpen(false); setShowBefore(false); setRoute(null);
    save(PLAN_KEY, null);
    save(TURNS_KEY, []);
  }, [setHover]);

  /** asks a turn again in its place: its plan when it has one (a chip change, a follow-up), else its request, else its words */
  const again = (t: Turn) => (t.plan ? post({ plan: t.plan, prev: planRef.current }, t.q, t.id)
    : t.req ? post({ ...t.req, prev: t.req.text ? planRef.current : null }, t.q, t.id) : post({ text: t.q, prev: null }, t.q, t.id));

  return {
    grown, setGrown, busy, error, resp, plan, history, turns,
    restore: (id: number) => {
      const t = turnsRef.current.find((x) => x.id === id);
      if (!t) return;
      if (!t.resp) { if (!t.pending && !t.note) void again(t); return; }
      setResp(t.resp); setSpot(null); setFocus(null); setShowBefore(false);
      if (t.resp.plan) { setPlan(t.resp.plan); save(PLAN_KEY, t.resp.plan); }
      setTookOver(false);
      setCue({ seq: ++seq.current, index: 0, move: true });
    },
    retry: (id: number) => { const t = turnsRef.current.find((x) => x.id === id); if (t && !t.pending) void again(t); },
    cue, tookOver, setTookOver, spot, setSpot, hover: hoverRef.current, setHover, onHover, focus, setFocus,
    showBefore, setShowBefore, traceOpen, setTraceOpen, uiCue, route, setRoute,
    replay: (index = 0) => { setTookOver(false); setCue({ seq: ++seq.current, index, move: true }); },
    ask: async (text: string) => {
      const t = text.trim();
      if (!t) return null;
      setHistory((h) => { const n = [...h.filter((x) => x !== t), t].slice(-30); save(HISTORY_KEY, n); return n; });
      // a question about the coming rain opens Rain & flooding where the Collector's console listens for it; it stays in the chat
      const rr = (window as Window & { __diqRehearsal?: boolean }).__diqRehearsal ? rehearsalIntent(t) : null;
      if (rr) {
        const ta = /[஀-௿]/.test(t);
        setTurns((x) => [...x, { id: ++seq.current, q: t, resp: null, note: ta ? "மழை & வெள்ளம் வரைபடத்தில் திறக்கப்பட்டது." : "Opened Rain & flooding on the map for this." }]);
        window.dispatchEvent(new CustomEvent("diq:rehearsal", { detail: rr }));
        return null;
      }
      return post({ text: t, prev: planRef.current }, t);
    },
    run: (p: Plan, label?: string) => post({ plan: p, prev: planRef.current }, label ?? "Changed the question"),
    draw: (d) => post({ text: null, context: "lat" in d ? { drawn: d } : "ward" in d ? { ward: d.ward } : { incidentId: d.incidentId } },
      "lat" in d ? "What is inside the circle I drew?" : "ward" in d ? `What is happening in Ward ${d.ward}?` : "What else is near this incident?"),
    clear: clearAll
  };
}

/** the same steps and places, only numbers or filters changed: the camera keeps its view */
function sameShape(a: Plan, b: Plan | null): boolean {
  if (!b || a.steps.length !== b.steps.length) return false;
  return a.steps.every((s, i) => {
    const t = b.steps[i];
    if (s.op !== t.op) return false;
    if (s.op === "inside" && t.op === "inside") return JSON.stringify({ ...s.area, radius_m: 0 }) === JSON.stringify({ ...t.area, radius_m: 0 });
    if (s.op === "along" && t.op === "along") return s.line === t.line;
    return true;
  });
}
