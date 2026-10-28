"use client";

/**
 * Ask the Map's state on a console: the question, the plan (the conversation's state, kept per tab), the answer, the
 * camera's cue and what the panel is pointing at. One instance per console (the Collector's shell, the officer's
 * Board); the map and the panel both read it, so the answer survives "Back to overview" and a page change.
 */
import { useCallback, useRef, useState } from "react";
import type { AskResponse } from "@/lib/map/ask";
import type { Plan } from "@/lib/map/plan";
import type { Route } from "./actions";

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
  /** a new cue for the camera: the map plays the answer's shots when it changes */
  cue: { seq: number; index: number; move: boolean };
  replay: (index?: number) => void;
  tookOver: boolean;
  setTookOver: (v: boolean) => void;
  /** incident ids the panel points at on the map (a trace step, a brief count, a cluster) */
  spot: { ids: string[]; label: string } | null;
  setSpot: (s: { ids: string[]; label: string } | null) => void;
  hover: string | null;
  setHover: (id: string | null) => void;
  focus: string | null;
  setFocus: (id: string | null) => void;
  /** the Before · Now toggle of a change answer */
  showBefore: boolean;
  setShowBefore: (v: boolean) => void;
  /** the trace panel is open ("why these?") */
  traceOpen: boolean;
  setTraceOpen: (v: boolean) => void;
  ask: (text: string) => Promise<AskResponse | null>;
  run: (plan: Plan) => Promise<AskResponse | null>;
  draw: (d: { lat: number; lon: number; r: number } | { ward: number } | { incidentId: string }) => Promise<AskResponse | null>;
  clear: () => void;
  /** a UI follow-up ("send these to SWD", "export"): the panel acts on it */
  uiCue: { seq: number; ui: AskResponse["ui"]; dept: string | null } | null;
  /** the officer's visit order on the map (numbered stops, straight legs) */
  route: Route | null;
  setRoute: (r: Route | null) => void;
}

const HISTORY_KEY = "diq-map-history";
const PLAN_KEY = "diq-map-plan";

function load<T>(k: string, d: T): T {
  try { const v = sessionStorage.getItem(k); return v ? (JSON.parse(v) as T) : d; } catch { return d; }
}
function save(k: string, v: unknown) {
  try { sessionStorage.setItem(k, JSON.stringify(v)); } catch { /* not kept */ }
}

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
  const [hover, setHover] = useState<string | null>(null);
  const [focus, setFocus] = useState<string | null>(null);
  const [showBefore, setShowBefore] = useState(false);
  const [traceOpen, setTraceOpen] = useState(false);
  const [uiCue, setUiCue] = useState<MapAsk["uiCue"]>(null);
  const [route, setRoute] = useState<Route | null>(null);
  const seq = useRef(0);
  const planRef = useRef(plan);
  planRef.current = plan;
  const ctl = useRef<AbortController | null>(null);

  const post = useCallback(async (body: Record<string, unknown>): Promise<AskResponse | null> => {
    ctl.current?.abort();
    const ac = new AbortController();
    ctl.current = ac;
    setBusy(true);
    setError(null);
    try {
      const c = context();
      const r = await fetch("/api/map/ask", {
        method: "POST", headers: { "content-type": "application/json" }, signal: ac.signal,
        body: JSON.stringify({ ...body, context: { zone: c.zone, taluk: c.taluk, incidentId: null, ward: null, drawn: null, ...((body.context as object) ?? {}) } })
      });
      const j = await r.json().catch(() => null);
      // a newer question took over while this one was arriving
      if (ac.signal.aborted) return null;
      if (!r.ok || !j) { setError(j?.error ?? "The map could not answer that just now."); return null; }
      const a = j as AskResponse;
      if (a.kind === "ui") {
        if (a.ui === "clear") { clearAll(); return a; }
        if (a.ui === "open_trace") setTraceOpen(true);
        setUiCue({ seq: ++seq.current, ui: a.ui, dept: a.uiDept });
        return a;
      }
      setResp(a);
      setSpot(null);
      setFocus(null);
      setShowBefore(false);
      setRoute(null);
      if (a.kind === "answer" && a.plan) { setPlan(a.plan); save(PLAN_KEY, a.plan); }
      // a new question moves the camera; a small follow-up keeps the view (camera.ts followUpMoves)
      const small = a.edited === "distance" || a.edited === "severity" || a.edited === "period" || a.edited === "status" || a.edited === "facility" || a.edited === "group"
        || (a.edited === "chip" && !!planRef.current && sameShape(planRef.current, a.plan));
      setTookOver(false);
      setCue({ seq: ++seq.current, index: 0, move: !small });
      return a;
    } catch (e) {
      if ((e as Error).name !== "AbortError") setError("The map could not be reached. Please try again.");
      return null;
    } finally {
      if (ctl.current === ac) setBusy(false);
    }
  }, [context]); // eslint-disable-line react-hooks/exhaustive-deps

  const clearAll = useCallback(() => {
    ctl.current?.abort();
    setResp(null); setPlan(null); setSpot(null); setFocus(null); setHover(null); setError(null); setTraceOpen(false); setShowBefore(false); setRoute(null);
    save(PLAN_KEY, null);
  }, []);

  return {
    grown, setGrown, busy, error, resp, plan, history, cue, tookOver, setTookOver, spot, setSpot, hover, setHover, focus, setFocus,
    showBefore, setShowBefore, traceOpen, setTraceOpen, uiCue, route, setRoute,
    replay: (index = 0) => { setTookOver(false); setCue({ seq: ++seq.current, index, move: true }); },
    ask: async (text: string) => {
      const t = text.trim();
      if (!t) return null;
      setHistory((h) => { const n = [...h.filter((x) => x !== t), t].slice(-30); save(HISTORY_KEY, n); return n; });
      return post({ text: t, prev: planRef.current });
    },
    run: (p: Plan) => post({ plan: p, prev: planRef.current }),
    draw: (d) => post({ text: null, context: "lat" in d ? { drawn: d } : "ward" in d ? { ward: d.ward } : { incidentId: d.incidentId } }),
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
