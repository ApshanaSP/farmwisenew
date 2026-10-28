"use client";
/**
 * Thunai (துணை), the Collector console's voice pilot. Switch it on (Alt+T or the orb), hold Alt+Space (or the orb) and talk
 * in English, Tamil or Tanglish; the console moves by itself. The understanding is in lib/thunai (rules first, tested);
 * this file is the hands and the face: it presses the console's own controls (Console in CollectorApp), shows a ghost
 * pointer, step chips and subtitles, keeps an undo stack, an approval tray for anything that leaves the console, the
 * Collector's memory, a polite Watch, and two missions. Every number it speaks comes from the console's data through a
 * template (lib/thunai/say.ts); nothing goes out without "confirm" and the count.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Overview } from "@/lib/collector/intel";
import { chartFacts, type ChartFacts } from "@/lib/thunai/explain";
import { ZONE_NAMES, ZONE_TA_NAME } from "@/lib/thunai/lexicon";
import { confirmGate, planRisk } from "@/lib/thunai/risk";
import { say as line } from "@/lib/thunai/say";
import type { Lang, OutMode, PageKey, PeriodKey, ScreenState, Sev, Step, Understood, View, World } from "@/lib/thunai/types";
import { describe as describeStep, PAGE_EN, PAGE_TA, PERIOD_EN, PERIOD_TA, SUGGEST, understand } from "@/lib/thunai/understand";
import { band, canSpeak as watchMaySpeak, remember as watchRemember, type Signal, type WatchMemory } from "@/lib/thunai/watch";
import { canListen, listen, speak, stopSpeaking } from "../assistant/speech";
import type { Console } from "../CollectorApp";
import { byName, clickables, press, readChart, scroll, spotlight, targetFor, typeInto, type Clickable } from "./dom";
import "./thunai.css";

export interface Snap { page: PageKey; period: PeriodKey; zone: number | null; dept: string | null; cat: string | null; taluk: string | null;
  sev: string | null; mapMode: "zones" | "taluks"; layers: Record<string, boolean> }

/** What the console hands Thunai: its controls, its data, and a few shell actions that are not on Console. */
export interface ThunaiHost {
  c: Console;
  ov: Overview;
  /** the page insights (environment readings, trends), when loaded */
  ins: unknown;
  inc: string | null;
  modal: string | null;
  ask: boolean;
  theme: "dark" | "light" | null;
  toggleTheme: () => void;
  openExport: () => void;
  openCustomize: () => void;
  openPalette: () => void;
  askWith: (q: string) => void;
  /** set several filters in one transaction (one render, one undo) */
  applyView: (v: View) => void;
  snapshot: () => Snap;
  restore: (s: Snap) => void;
}

type Phase = "off" | "ready" | "listening" | "thinking" | "acting" | "speaking" | "asking" | "waiting" | "blocked";
interface Chip { id: number; label: string; state: "pending" | "running" | "done" | "failed" }
interface Draft { incidentId: string; title: string; subject: string; body: string; to: string | null; sandbox: boolean }
interface MemoryView { notes: { id: string; text: string; at: string }[]; habits: Record<string, string>; reminders: { id: string; text: string; at: string; done: boolean }[];
  recent: { text: string; at: string }[]; prefs: { lang?: Lang; mode?: OutMode; rate?: number } }
interface Station { id: string; name: string; zone: number | null; times: string[]; series: number[]; capacity?: number; storage?: number[] }
interface EnvData { rain?: { stations: Station[] }; aqi?: { stations: Station[] }; lakes?: { stations: Station[]; asOn: string | null } }

const SEVS: Sev[] = ["Severe", "High", "Medium", "Low"];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const reduced = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
const store = { get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* not saved */ } } };

async function post(path: string, body: unknown) {
  const r = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || "Request failed.");
  return j;
}

/** Earcons from the Web Audio API: no files. */
function earcon(kind: "open" | "done" | "need" | "blocked") {
  try {
    const W = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
    const AC = W.AudioContext ?? W.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    const notes = { open: [660], done: [523, 784], need: [330], blocked: [220] }[kind];
    notes.forEach((f, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = f; o.type = "sine";
      const t = ctx.currentTime + i * 0.09;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.06, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
      o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + 0.18);
    });
    setTimeout(() => ctx.close().catch(() => undefined), 600);
  } catch { /* no audio */ }
}

const pct = (st: Station) => {
  const s = st.storage?.[st.storage.length - 1];
  return st.capacity && s != null ? Math.round((s / st.capacity) * 100) : null;
};
const lastOf = (st: Station) => st.series?.[st.series.length - 1] ?? null;
const whenOf = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "the latest reading");

export default function Thunai({ host }: { host: ThunaiHost }) {
  const hostRef = useRef(host);
  hostRef.current = host;
  const [mounted, setMounted] = useState(false);
  const [on, setOn] = useState(false);
  const [phase, setPhase] = useState<Phase>("off");
  const [interim, setInterim] = useState("");
  const [heard, setHeard] = useState("");
  const [reply, setReply] = useState("");
  const [chips, setChips] = useState<Chip[]>([]);
  const [wrong, setWrong] = useState<string | null>(null);
  const [askOnce, setAskOnce] = useState<Extract<Understood, { kind: "ask" }> | null>(null);
  const [pendingB, setPendingB] = useState<{ text: string; steps: Step[]; heard: string; lang: Lang } | null>(null);
  const [tray, setTray] = useState<Draft[]>([]);
  const [trayShownAt, setTrayShownAt] = useState<number | null>(null);
  const [panel, setPanel] = useState<"memory" | "trail" | "help" | null>(null);
  const [memory, setMemory] = useState<MemoryView | null>(null);
  const [trail, setTrail] = useState<{ lines: { at: string; heard: string | null; outcome: string; risk: string }[]; intact: boolean } | null>(null);
  const [numbers, setNumbers] = useState<{ names: boolean; items: Clickable[] } | null>(null);
  const [pointer, setPointer] = useState<{ x: number; y: number; label: string; show: boolean; ripple: boolean }>({ x: 0, y: 0, label: "", show: false, ripple: false });
  const [outMode, setOutMode] = useState<OutMode>("voice");
  const [listenLang, setListenLang] = useState<Lang>("en");
  const [rate, setRate] = useState(1);
  const [handsfree, setHandsfree] = useState(false);
  const [typed, setTyped] = useState("");
  const [ref, setRef] = useState<Pick<World, "cats" | "taluks" | "places">>({ cats: [], taluks: [], places: [] });

  const orbRef = useRef<HTMLButtonElement>(null);
  const stopListen = useRef<(() => void) | null>(null);
  const undoStack = useRef<{ steps: Step[]; snap: Snap }[]>([]);
  const lastSteps = useRef<Step[]>([]);
  const lastSpoken = useRef<{ text: string; lang: Lang } | null>(null);
  const lastFilter = useRef<ScreenState["lastFilter"]>(null);
  const lastPlace = useRef<string | null>(null);
  const numbersRef = useRef(numbers);
  numbersRef.current = numbers;
  const abortMission = useRef(false);
  const handsfreeRef = useRef(handsfree);
  handsfreeRef.current = handsfree;
  const lastHeardAt = useRef<number>(0);
  const lastUserSpeech = useRef<number | null>(null);
  const pointerAt = useRef<{ x: number; y: number } | null>(null);
  const onRef = useRef(on);
  onRef.current = on;
  const memoryRef = useRef(memory);
  memoryRef.current = memory;
  const chipId = useRef(0);

  useEffect(() => { setMounted(true); }, []);
  useEffect(() => {
    const t = (e: PointerEvent) => { pointerAt.current = { x: e.clientX, y: e.clientY }; };
    window.addEventListener("pointermove", t, { passive: true });
    return () => window.removeEventListener("pointermove", t);
  }, []);

  // --------------------------------------------------------------- the world --
  const world: World = useMemo(() => {
    const zt = host.ov.zoneTable ?? [];
    const env = (host.ins as { env?: EnvData } | null)?.env;
    return {
      zones: ZONE_NAMES.map((name, i) => ({ n: i + 1, name: zt.find((z) => z.zone === i + 1)?.name ?? name, ta: ZONE_TA_NAME[i + 1] })),
      depts: host.c.depts.map((d) => ({ code: d.code, name: d.name })),
      ...ref,
      reservoirs: (env?.lakes?.stations ?? []).map((s) => ({ id: s.id, name: s.name })),
      zoneRank: [...zt].sort((a, b) => b.severe - a.severe || b.open - a.open).map((z) => z.zone),
      aliases: memory?.habits ?? {}
    };
  }, [host.ov.zoneTable, host.ins, host.c.depts, ref, memory?.habits]);
  const worldRef = useRef(world);
  worldRef.current = world;

  const buildState = useCallback((): ScreenState => {
    const h = hostRef.current, c = h.c;
    const counts = (h.ov.severity?.counts ?? {}) as Record<string, number>;
    const first = SEVS.find((s) => counts[s] > 0) ?? "Severe";
    const tab = c.sevTab && counts[c.sevTab] > 0 ? c.sevTab : first;
    const rows = (h.ov.severity?.rows ?? []) as { id: string; sev: string }[];
    return {
      page: c.page, period: c.period as PeriodKey, zone: c.zone, dept: c.dept, cat: c.cat, taluk: c.taluk, sev: (c.sevTab as Sev | null) ?? null,
      mapMode: c.mapMode, panel: h.modal ?? (h.inc ? "incident" : h.ask ? "assistant" : null), incident: h.inc ?? c.focus?.id ?? null,
      list: rows.filter((r) => r.sev === tab).map((r) => String(r.id)), lastFilter: lastFilter.current, lastPlace: lastPlace.current,
      numbers: !!numbersRef.current, now: Date.now()
    };
  }, []);

  // the Collector changing a filter by hand also counts as "touched last"
  const prevView = useRef<string>("");
  useEffect(() => {
    const c = host.c;
    const cur = { zone: c.zone, dept: c.dept, cat: c.cat, taluk: c.taluk, sev: c.sevTab, period: c.period };
    const prev = prevView.current ? JSON.parse(prevView.current) : null;
    if (prev) for (const k of Object.keys(cur) as (keyof typeof cur)[]) if (prev[k] !== cur[k]) lastFilter.current = { slot: k as never, at: Date.now() };
    prevView.current = JSON.stringify(cur);
  }, [host.c]);

  // --------------------------------------------------------------- speaking --
  const out = useCallback((text: string, lang: Lang, ph: Phase = "ready") => {
    setReply(text);
    lastSpoken.current = { text, lang };
    if (!text) { setPhase(ph); return; }
    if (outMode === "voice") {
      stopListen.current?.();
      setPhase("speaking");
      const ok = speak(text, lang === "ta" ? "ta-IN" : "en-IN", () => {
        setPhase(onRef.current ? ph : "off");
        if (handsfreeRef.current && onRef.current) setTimeout(() => startListening(), 250); // eslint-disable-line @typescript-eslint/no-use-before-define
      }, rate);
      if (!ok) setPhase(ph);
    } else setPhase(ph);
  }, [outMode, rate]); // eslint-disable-line react-hooks/exhaustive-deps

  const audit = (heardText: string | null, steps: Step[], outcome: string, approval: { how: "none" | "tap" | "spoken"; count?: number } | null = null) => {
    post("/api/collector/thunai/audit", { heard: heardText, plan: steps as unknown as Record<string, unknown>[], risk: planRisk(steps), approval, outcome }).catch(() => undefined);
  };

  // --------------------------------------------------------------- memory --
  const loadMemory = useCallback(async () => {
    try { const r = await fetch("/api/collector/thunai/memory"); if (r.ok) setMemory(await r.json()); } catch { /* offline */ }
  }, []);
  /** true when the server saved the change (a failure is never reported as "remembered") */
  const changeMemory = async (op: Record<string, unknown>): Promise<boolean> => {
    try { setMemory(await post("/api/collector/thunai/memory", op)); return true; } catch { return false; }
  };

  // --------------------------------------------------------------- the pointer --
  const glide = async (step: Step) => {
    const el = targetFor(step);
    const orb = orbRef.current?.getBoundingClientRect();
    if (!el || !orb) { if (orbRef.current) { orbRef.current.classList.add("pulse"); setTimeout(() => orbRef.current?.classList.remove("pulse"), 400); } return; }
    const r = el.getBoundingClientRect();
    const label = describeStep(step, worldRef.current, listenLang).split(" · ")[0];
    if (reduced()) { setPointer({ x: r.left + r.width / 2, y: r.top + r.height / 2, label, show: true, ripple: true }); await sleep(120); }
    else {
      setPointer({ x: orb.left + orb.width / 2, y: orb.top + orb.height / 2, label, show: true, ripple: false });
      await sleep(30);
      setPointer({ x: r.left + r.width / 2, y: r.top + r.height / 2, label, show: true, ripple: false });
      await sleep(320);
      setPointer((p) => ({ ...p, ripple: true }));
      await sleep(140);
    }
    setTimeout(() => setPointer((p) => ({ ...p, show: false, ripple: false })), 700);
  };

  // --------------------------------------------------------------- readings --
  const env = async (): Promise<EnvData | null> => {
    const h = hostRef.current;
    if (h.c.page !== "environment") h.c.setPage("environment");
    for (let k = 0; k < 30; k++) {
      const e = (hostRef.current.ins as { env?: EnvData } | null)?.env;
      if (e?.lakes || e?.rain) return e;
      await sleep(200);
    }
    return null;
  };

  const read = async (step: Extract<Step, { a: "read" }>, lang: Lang): Promise<string> => {
    const h = hostRef.current;
    if (step.what === "worstZone") {
      const z = [...(h.ov.zoneTable ?? [])].sort((a, b) => b.severe - a.severe || b.open - a.open)[0];
      if (!z) return line("noData", lang);
      lastPlace.current = z.name;
      return line("worstZone", lang, { name: lang === "ta" ? ZONE_TA_NAME[z.zone] ?? z.name : z.name, severe: z.severe, open: z.open });
    }
    const e = await env();
    if (!e) return line("noData", lang);
    await sleep(250);
    if (step.what === "reservoir") {
      const st = e.lakes?.stations ?? [];
      const named = step.name ? st.find((s) => s.name.toLowerCase().includes(step.name!.toLowerCase())) : null;
      const asOf = whenOf(e.lakes?.asOn ?? named?.times?.[named.times.length - 1]);
      if (named) {
        const p = pct(named);
        spotlight(named.name);
        return p == null ? line("noData", lang) : line("reservoir", lang, { name: named.name, pct: p, asOf });
      }
      const list = st.map((s) => ({ s, p: pct(s) })).filter((x) => x.p != null).slice(0, 4).map((x) => `${x.s.name} ${x.p}%`).join(", ");
      return list ? line("reservoirs", lang, { list, asOf }) : line("noData", lang);
    }
    if (step.what === "rain") {
      const st = (e.rain?.stations ?? []).filter((s) => lastOf(s) != null).sort((a, b) => (lastOf(b) ?? 0) - (lastOf(a) ?? 0))[0];
      if (!st) return line("noData", lang);
      spotlight(st.name);
      return line("rain", lang, { name: st.name, mm: Math.round((lastOf(st) ?? 0) * 10) / 10, asOf: whenOf(st.times?.[st.times.length - 1]) });
    }
    const aqi = e.aqi?.stations ?? [];
    const zoneN = step.name ? worldRef.current.zones.find((z) => z.name.toLowerCase() === step.name!.toLowerCase())?.n : null;
    const st = (zoneN ? aqi.find((s) => s.zone === zoneN) ?? aqi.find((s) => s.name.toLowerCase().includes(step.name!.toLowerCase())) : null)
      ?? aqi.filter((s) => lastOf(s) != null).sort((a, b) => (lastOf(b) ?? 0) - (lastOf(a) ?? 0))[0];
    if (!st || lastOf(st) == null) return line("noData", lang);
    spotlight(st.name);
    return line("air", lang, { name: st.name, aqi: Math.round(lastOf(st)!), asOf: whenOf(st.times?.[st.times.length - 1]) });
  };

  const explain = (lang: Lang): string => {
    const h = hostRef.current;
    let f: ChartFacts | null = readChart(pointerAt.current);
    if (!f && h.c.page === "trends") {
      const lines = ((h.ins as { trends?: Record<string, { lines?: { label: string; total: number }[] }> } | null)?.trends?.[h.c.period === "monthly" || h.c.period === "quarterly" ? "monthly" : "weekly"]?.lines ?? [])
        .filter((l) => l.label !== "All other categories");
      f = chartFacts(lang === "ta" ? "வகைவாரி நிகழ்வுகள்" : "Incidents by category", lines.map((l) => l.label), lines.map((l) => l.total));
    }
    if (!f) {
      const zt = h.ov.zoneTable ?? [];
      f = chartFacts(lang === "ta" ? "மண்டலவாரி திறந்த நிகழ்வுகள்" : "Open incidents by zone", zt.map((z) => z.name), zt.map((z) => z.open));
    }
    return f ? line("explainChart", lang, f as unknown as Record<string, string | number>) : line("noChart", lang);
  };

  // --------------------------------------------------------------- tray (level C) --
  const draftFor = async (incidentId: string): Promise<Draft | null> => {
    try {
      const r = await fetch(`/api/collector/incidents/${encodeURIComponent(incidentId)}/action`);
      const j = await r.json();
      if (!r.ok) return null;
      return { incidentId, title: String(j.subject ?? incidentId), subject: j.subject, body: j.body, to: j.to?.role ?? j.to?.name ?? null,
        sandbox: j.delivery?.mode === "sandbox" };
    } catch { return null; }
  };
  const addToTray = (ds: Draft[]) => {
    setTray((t) => [...t, ...ds.filter((d) => !t.some((x) => x.incidentId === d.incidentId))]);
    setTrayShownAt(Date.now());
    setPhase("waiting");
    earcon("need");
  };
  const sendTray = async (n: number | null, lang: Lang, how: "spoken" | "tap") => {
    const g = confirmGate(n, tray.length, trayShownAt, Date.now());
    if (!g.ok) {
      const k = g.why === "nothing" ? "trayEmpty" : g.why === "count" ? "confirmCount" : g.why === "mismatch" ? "confirmMismatch" : "confirmEarly";
      earcon("blocked");
      out(line(k, lang, { n: tray.length, said: n ?? "" }), lang, tray.length ? "waiting" : "ready");
      return;
    }
    let sent = 0;
    for (const d of tray) {
      if (!d.sandbox) { hostRef.current.c.openAction(d.incidentId); continue; }
      try { await post(`/api/collector/incidents/${encodeURIComponent(d.incidentId)}/action`, { subject: d.subject, body: d.body }); sent++; } catch { /* stays */ }
    }
    audit(null, [{ a: "confirm", n }], `sent ${sent} of ${tray.length} (sandbox only)`, { how, count: n ?? undefined });
    setTray([]); setTrayShownAt(null);
    earcon("done");
    out(sent === tray.length ? line("sent", lang, { n: sent }) : line("approvedOnly", lang), lang);
  };

  // --------------------------------------------------------------- one step --
  const runStep = async (step: Step, lang: Lang, heardText: string): Promise<string | null> => {
    const h = hostRef.current, c = h.c;
    switch (step.a) {
      case "page": c.setPage(step.page); return null;
      case "period": c.setPeriod(step.period); lastFilter.current = { slot: "period", at: Date.now() }; return null;
      case "view": {
        h.applyView(step.view);
        const slots = Object.keys(step.view) as (keyof View)[];
        if (slots.length) lastFilter.current = { slot: slots[slots.length - 1], at: Date.now() };
        if (step.view.zone) lastPlace.current = worldRef.current.zones.find((z) => z.n === step.view.zone)?.name ?? null;
        if (step.view.taluk) lastPlace.current = worldRef.current.taluks.find((t) => t.code === step.view.taluk)?.name ?? null;
        return null;
      }
      case "mapMode": c.setMapMode(step.mode); return null;
      case "layer": if (step.on == null || !!c.layers[step.layer] !== step.on) c.toggleLayer(step.layer); return null;
      case "panel": {
        const p = step.panel;
        if (p === "news") c.openNewsAll(); else if (p === "stories") c.openStories(); else if (p === "gaps") c.openGaps();
        else if (p === "nextdoor") c.openNextDoor(); else if (p === "markets") c.openMarkets(); else if (p === "zones") c.openZones();
        else if (p === "depts") c.openDepts(); else if (p === "sources") c.openFeeds(); else if (p === "review") c.openReview();
        else if (p === "workspace") c.openWorkspace(); else if (p === "export") h.openExport(); else if (p === "customize") h.openCustomize();
        else if (p === "palette") h.openPalette(); else if (p === "assistant") c.setAsk(true);
        else if (p === "map") { c.setPage("overview"); c.mapAsk?.setGrown(true); }
        else if (p === "trail") { await openTrail(); }
        else if (p === "memory") { await loadMemory(); setPanel("memory"); }
        else if (p === "conflicts") {
          const first = (c.conflicts as { stories?: unknown[] } | null)?.stories?.[0];
          if (first) c.openConflict(first as never); else { c.setPage("briefing"); }
        }
        return null;
      }
      case "close":
        if (step.all) { c.closeAll(); c.setAsk(false); c.mapAsk?.setGrown(false); setPanel(null); }
        else if (panel) setPanel(null);
        else window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
        return null;
      case "item": {
        const st = buildState();
        if (!st.list.length) return line("noItem", lang);
        let idx = typeof step.which === "number" ? step.which - 1 : st.list.indexOf(st.incident ?? "") + (step.which === "next" ? 1 : -1);
        idx = Math.max(0, Math.min(st.list.length - 1, idx));
        c.openInc(st.list[idx]);
        return null;
      }
      case "draft": {
        const id = buildState().incident;
        if (!id) return line("noIncident", lang);
        c.openAction(id);
        return line("draft", lang);
      }
      case "zoom": {
        const id = buildState().incident;
        if (id) { c.askOnMap?.({ incidentId: id }); return null; }
        if (step.target ?? lastPlace.current) { c.askOnMap?.(`incidents in ${step.target ?? lastPlace.current}`); return null; }
        return line("noIncident", lang);
      }
      case "ask": h.askWith(step.q); return null;
      case "map": c.askOnMap?.(step.q); return null;
      case "theme": if ((h.theme ?? "light") !== step.theme) h.toggleTheme(); return null;
      case "lang": setListenLang(step.lang); changeMemory({ op: "prefs", prefs: { lang: step.lang } }); return null;
      case "mode": setOutMode(step.mode); changeMemory({ op: "prefs", prefs: { mode: step.mode } }); return null;
      case "speed": { const r = Math.round(Math.max(0.7, Math.min(1.4, rate + (step.faster ? 0.15 : -0.15))) * 100) / 100; setRate(r); changeMemory({ op: "prefs", prefs: { rate: r } }); return null; }
      case "handsfree": setHandsfree(step.on); return null;
      case "workspace": {
        if (step.op === "save") { const id = await c.saveWorkspace(step.name ?? "Thunai view"); return id ? line("saved", lang, { name: step.name }) : null; }
        try {
          const r = await fetch("/api/collector/workspaces");
          const j = await r.json();
          const list: { id: number; name: string }[] = j.workspaces ?? j.items ?? j ?? [];
          const q = (step.name ?? "").toLowerCase();
          const w = list.find((x) => x.name.toLowerCase() === q) ?? list.find((x) => x.name.toLowerCase().includes(q) || q.includes(x.name.toLowerCase()));
          if (!w) return line("noWorkspace", lang, { name: step.name });
          await c.openSavedWorkspace(w.id);
          return null;
        } catch { return line("noWorkspace", lang, { name: step.name }); }
      }
      case "undo": {
        let snap: Snap | null = null; let undone: Step[] = [];
        for (let k = 0; k < step.n && undoStack.current.length; k++) { const u = undoStack.current.pop()!; snap = u.snap; undone = u.steps; }
        if (!snap) return line("nothingToUndo", lang);
        h.restore(snap);
        return line("undone", lang, { what: undone.map((s) => describeStep(s, worldRef.current, lang)).join(", ") });
      }
      case "stop": stopSpeaking(); abortMission.current = true; return null;
      case "off": switchOff(); return null; // eslint-disable-line @typescript-eslint/no-use-before-define
      case "repeat": { const l = lastSpoken.current; if (l) out(l.text, lang === l.lang ? l.lang : lang); return null; }
      case "whatDid": {
        const s = lastSteps.current;
        return s.length ? line("did", lang, { what: s.map((x) => describeStep(x, worldRef.current, lang)).join(", ") }) : line("didNothing", lang);
      }
      case "whereAmI": {
        const st = buildState();
        const w = worldRef.current;
        const scope = [st.zone ? `${lang === "ta" ? "மண்டலம்" : "Zone"} ${st.zone} ${w.zones.find((z) => z.n === st.zone)?.name ?? ""}` : null,
          st.taluk ? w.taluks.find((t) => t.code === st.taluk)?.name : null, st.dept ? w.depts.find((d) => d.code === st.dept)?.name : null,
          st.cat ? w.cats.find((x) => x.code === st.cat)?.label : null].filter(Boolean).join(", ") || (lang === "ta" ? "முழு மாவட்டம்" : "District-wide");
        return line("where", lang, { page: lang === "ta" ? PAGE_TA[st.page] : PAGE_EN[st.page], scope, period: lang === "ta" ? PERIOD_TA[st.period] : PERIOD_EN[st.period] });
      }
      case "explain": return explain(lang);
      case "numbers": if (step.show) setNumbers({ names: step.names, items: clickables() }); else setNumbers(null); return null;
      case "click": {
        const list = numbersRef.current?.items ?? clickables();
        const t = step.n != null ? list.find((x) => x.n === step.n) ?? null : byName(list, step.name ?? "");
        setNumbers(null);
        if (!t) return line("notUnderstood", lang, { heard: heardText, examples: "show numbers, click 3" });
        press(t.el);
        return null;
      }
      case "scroll": scroll(step.dir); return null;
      case "type": typeInto(step.text); return null;
      case "clearText": typeInto("", true); return null;
      case "remember": return (await changeMemory({ op: "note", text: step.text })) ? line("remembered", lang) : line("memoryFail", lang);
      case "recall": await loadMemory(); setPanel("memory"); return null;
      case "forget": return (await changeMemory(step.all ? { op: "forget", all: true } : { op: "forget" })) ? line(step.all ? "forgottenAll" : "forgotten", lang) : line("memoryFail", lang);
      case "remind": return (await changeMemory({ op: "remind", text: step.text, at: step.at })) ? line("reminder", lang, { when: whenOf(step.at) }) : line("memoryFail", lang);
      case "send": {
        if (tray.length) return line("sendGate", lang, { n: tray.length });
        const id = buildState().incident;
        if (!id) return line("noDraft", lang);
        const d = await draftFor(id);
        if (!d) return line("noDraft", lang);
        addToTray([d]);
        return line("sendGate", lang, { n: 1 });
      }
      case "confirm": await sendTray(step.n, lang, "spoken"); return null;
      case "mission": await mission(step.name, lang); return null; // eslint-disable-line @typescript-eslint/no-use-before-define
      case "read": return read(step, lang);
      case "help": setPanel("help"); return line("help", lang);
      default: return null;
    }
  };

  // --------------------------------------------------------------- a plan --
  const VIEW_CHANGING = new Set(["page", "period", "view", "mapMode", "layer", "panel", "item", "draft", "zoom", "map", "close", "mission", "read", "workspace"]);
  const run = async (steps: Step[], lang: Lang, heardText: string, by: "rules" | "ai", note?: string) => {
    if (!steps.length) { setPhase("ready"); return; }
    const changes = steps.some((s) => VIEW_CHANGING.has(s.a) && !(s.a === "workspace" && s.op === "save"));
    if (changes) {
      undoStack.current.push({ steps, snap: hostRef.current.snapshot() });
      if (undoStack.current.length > 20) undoStack.current.shift();
    }
    const ids = steps.map(() => ++chipId.current);
    setChips(steps.map((s, i) => ({ id: ids[i], label: describeStep(s, worldRef.current, lang), state: "pending" })));
    setPhase("acting");
    abortMission.current = false;
    const said: string[] = [];
    const t0 = performance.now();
    for (let i = 0; i < steps.length; i++) {
      if (abortMission.current && steps[i].a !== "stop") break;
      setChips((cs) => cs.map((c) => (c.id === ids[i] ? { ...c, state: "running" } : c)));
      try {
        await glide(steps[i]);
        const s = await runStep(steps[i], lang, heardText);
        if (s) said.push(s);
        setChips((cs) => cs.map((c) => (c.id === ids[i] ? { ...c, state: "done" } : c)));
      } catch (e) {
        console.error("thunai step failed", steps[i], e);
        setChips((cs) => cs.map((c) => (c.id === ids[i] ? { ...c, state: "failed" } : c)));
      }
    }
    const ms = Math.round(performance.now() - t0);
    setChips((cs) => cs.map((c, i) => (i === cs.length - 1 ? { ...c, label: `${c.label} (${(ms / 1000).toFixed(1)} s)` } : c)));
    if (!steps.some((s) => s.a === "whatDid" || s.a === "repeat" || s.a === "undo")) lastSteps.current = steps;
    audit(heardText, steps, `done by ${by}${note ? `; ${note}` : ""}`);
    changeMemory({ op: "recent", text: heardText });
    const speakLine = [note, ...said].filter(Boolean).join(" ");
    if (steps.some((s) => s.a === "off")) return;
    if (speakLine) out(speakLine, lang, tray.length ? "waiting" : "ready");
    else { earcon("done"); setReply(steps.map((s) => describeStep(s, worldRef.current, lang)).join(" · ")); setPhase(tray.length ? "waiting" : "ready"); }
  };

  const ask = (r: Extract<Understood, { kind: "ask" }>) => {
    setAskOnce(r);
    setPhase("asking");
    earcon("need");
    out(line("askOnce", r.lang, { question: r.question[r.lang] }), r.lang, "asking");
  };

  // --------------------------------------------------------------- a sentence --
  const handle = async (text: string, conf = 0.95) => {
    const said = text.trim();
    if (!said) return;
    lastUserSpeech.current = Date.now();
    lastHeardAt.current = Date.now();
    setHeard(said); setInterim(""); setWrong(null); setReply("");
    // an answer to the one question
    if (askOnce) {
      const t = said.toLowerCase();
      const pick = /^(1|first|one|முதலாவது|முதல்|onnu|mudhal)$/.test(t) ? 0 : /^(2|second|two|இரண்டாவது|ரெண்டாவது|rendu|second one)$/.test(t) ? 1
        : askOnce.choices.findIndex((c) => c.label.en.toLowerCase() === t || c.label.ta === said);
      const choice = pick >= 0 ? askOnce.choices[pick] : null;
      setAskOnce(null);
      if (choice) {
        if (choice.steps.length) changeMemory({ op: "habit", heard: askOnce.heard.toLowerCase(), meant: choice.label.en });
        await run(choice.steps, askOnce.lang, askOnce.heard, "rules");
        return;
      }
    }
    // a "yes" to a one-tap (level B) card
    if (pendingB) {
      if (/^(yes|ok|okay|save|do it|ஆமா|ஆம்|சரி|aama|sari|seri|confirm)$/i.test(said)) { const p = pendingB; setPendingB(null); await run(p.steps, p.lang, p.heard, "rules"); return; }
      if (/^(no|cancel|வேண்டாம்|illa|vendaam)$/i.test(said)) { setPendingB(null); setPhase("ready"); return; }
      setPendingB(null);
    }
    const st = buildState();
    let r = understand(said, st, worldRef.current, { speechConf: conf });
    if (r.kind === "unknown") {
      setPhase("thinking");
      setReply(line("aiThinking", r.lang));
      try {
        const j = await post("/api/collector/thunai/plan", { text: said, state: { page: st.page, period: st.period, zone: st.zone, dept: st.dept, cat: st.cat,
          taluk: st.taluk, sev: st.sev, mapMode: st.mapMode, panel: st.panel, incident: st.incident, listLength: st.list.length } });
        if (Array.isArray(j.steps) && j.steps.length) r = { kind: "do", steps: j.steps, confidence: 0.8, lang: r.lang, heard: said, by: "ai" };
      } catch { /* no model: say what was heard */ }
    }
    if (r.kind === "unknown") {
      earcon("blocked");
      audit(said, [], "not understood");
      out(line("notUnderstood", r.lang, { heard: said, examples: SUGGEST.slice(0, 3).join(", ") }), r.lang, "ready");
      return;
    }
    if (r.kind === "refuse") { earcon("blocked"); audit(said, [], "refused"); out(r.why[r.lang], r.lang, "ready"); return; }
    if (r.kind === "ask") { ask(r); return; }
    const risk = planRisk(r.steps);
    const note = r.note?.[r.lang];
    // level B: one tap or "yes"
    if (risk === "B") {
      const s = r.steps.find((x) => x.a === "workspace" || x.a === "remember" || x.a === "forget" || x.a === "remind")!;
      const q = s.a === "workspace" ? line("saveAsk", r.lang, { name: s.name }) : s.a === "remember" ? line("rememberAsk", r.lang, { text: s.text })
        : s.a === "forget" ? line("forgetAsk", r.lang, { what: s.all ? (r.lang === "ta" ? "எல்லாவற்றையும்" : "everything") : (r.lang === "ta" ? "கடைசி குறிப்பை" : "the last note") })
          : line("remindAsk", r.lang, { when: whenOf((s as Extract<Step, { a: "remind" }>).at), text: (s as Extract<Step, { a: "remind" }>).text });
      setPendingB({ text: q, steps: r.steps, heard: said, lang: r.lang });
      earcon("need");
      out(q, r.lang, "asking");
      return;
    }
    // level A: act; below 0.6 ask once; 0.6-0.85 act and offer "wrong?"
    if (r.confidence < 0.6) {
      const what = r.steps.map((x) => describeStep(x, worldRef.current, r.lang)).join(", ");
      ask({ kind: "ask", lang: r.lang, heard: said, question: { en: line("lowConfidence", "en", { what }), ta: line("lowConfidence", "ta", { what }) },
        choices: [{ label: { en: "Yes", ta: "ஆம்" }, steps: r.steps }, { label: { en: "No", ta: "இல்லை" }, steps: [] }] });
      return;
    }
    if (r.confidence < 0.85) { setWrong(r.steps.map((x) => describeStep(x, worldRef.current, r.lang)).join(", ")); setTimeout(() => setWrong(null), 4000); }
    await run(r.steps, r.lang, said, r.by, note);
  };
  const handleRef = useRef(handle);
  handleRef.current = handle;

  // --------------------------------------------------------------- missions --
  const mission = async (name: "brief" | "rain", lang: Lang) => {
    const h = hostRef.current;
    abortMission.current = false;
    if (name === "brief") {
      h.c.setPage("briefing");
      let brief = null as null | { points: { text: string; ta: string | null }[] };
      for (let k = 0; k < 40 && !brief; k++) { brief = (hostRef.current.c.dayBrief?.brief as typeof brief) ?? null; if (!brief) await sleep(200); }
      if (!brief?.points?.length) { out(line("briefNone", lang), lang); return; }
      const pts = brief.points.slice(0, 5);
      setChips(pts.map((p, i) => ({ id: ++chipId.current, label: `${i + 1}. ${(lang === "ta" && p.ta ? p.ta : p.text).slice(0, 40)}…`, state: "pending" })));
      for (let i = 0; i < pts.length; i++) {
        if (abortMission.current) { out(line("missionStopped", lang), lang); return; }
        setChips((cs) => cs.map((c, j) => (j === i ? { ...c, state: "running" } : j < i ? { ...c, state: "done" } : c)));
        const text = line("briefPoint", lang, { text: lang === "ta" && pts[i].ta ? pts[i].ta : pts[i].text });
        setReply(text);
        if (outMode === "voice") await new Promise<void>((res) => { if (!speak(text, lang === "ta" ? "ta-IN" : "en-IN", () => res(), rate)) res(); });
        else await sleep(3500);
      }
      setChips((cs) => cs.map((c) => ({ ...c, state: "done" })));
      return;
    }
    // rain readiness: environment readings, the flooding view, the map's hotspots, then drafts into the tray
    const steps = lang === "ta"
      ? ["மழை, ஏரிகள்", "வெள்ள நிகழ்வுகள்", "வரைபட மையங்கள்", "வரைவுகள்", "ஒப்புதல்"]
      : ["Rain and reservoirs", "Flooding view", "Hotspots on the map", "Drafts", "Approval"];
    const ids = steps.map(() => ++chipId.current);
    const mark = (i: number, state: Chip["state"]) => setChips((cs) => cs.map((c) => (c.id === ids[i] ? { ...c, state } : c)));
    setChips(steps.map((label, i) => ({ id: ids[i], label, state: "pending" })));
    mark(0, "running");
    const lakes = await read({ a: "read", what: "reservoir", name: null }, lang);
    setReply(lakes);
    mark(0, "done");
    if (abortMission.current) return;
    mark(1, "running");
    h.c.setPage("overview");
    h.applyView({ cat: "FLOOD_WATERLOGGING" });
    h.c.setPeriod("daily");
    await sleep(1600);
    mark(1, "done");
    if (abortMission.current) return;
    mark(2, "running");
    h.c.askOnMap?.("hotspots of flooding and waterlogging");
    await sleep(1200);
    mark(2, "done");
    if (abortMission.current) return;
    mark(3, "running");
    const top = buildState().list.slice(0, 3);
    setReply(line("draftsMaking", lang, { n: top.length }));
    const drafts = (await Promise.all(top.map(draftFor))).filter((d): d is Draft => !!d);
    if (drafts.length) addToTray(drafts);
    mark(3, drafts.length ? "done" : "failed");
    mark(4, "running");
    out(`${lakes} ${drafts.length ? line("sendGate", lang, { n: drafts.length }) : line("noDraft", lang)}`, lang, drafts.length ? "waiting" : "ready");
  };

  // --------------------------------------------------------------- listening --
  const startListening = useCallback(() => {
    if (!canListen()) { setReply(line("noMic", listenLang)); return; }
    stopSpeaking();
    stopListen.current?.();
    setPhase("listening");
    earcon("open");
    setInterim("");
    stopListen.current = listen(listenLang === "ta" ? "ta-IN" : "en-IN", (t) => setInterim(t), (final) => {
      stopListen.current = null;
      if (final) { void handleRef.current(final, 0.9); return; }
      setPhase(onRef.current ? "ready" : "off");
      // hands-free: keep listening until 3 minutes pass with nothing heard
      if (handsfreeRef.current && onRef.current) {
        if (Date.now() - lastHeardAt.current > 180_000) { setHandsfree(false); return; }
        setTimeout(() => { if (handsfreeRef.current && onRef.current && !window.speechSynthesis?.speaking) startListening(); }, 300);
      }
    }, (err) => {
      stopListen.current = null;
      setPhase("blocked");
      setReply(err === "not-allowed" ? "The microphone is blocked for this site." : err === "network" ? line("offline", listenLang) : `Microphone: ${err}`);
    });
  }, [listenLang]);

  const switchOn = useCallback(() => {
    setOn(true);
    setPhase("ready");
    lastHeardAt.current = Date.now();
    void loadMemory();
    if (!ref.cats.length) fetch("/api/collector/thunai/world").then((r) => (r.ok ? r.json() : null)).then((j) => j && setRef(j)).catch(() => undefined);
    setReply(line("onLine", listenLang));
  }, [listenLang, loadMemory, ref.cats.length]);
  const switchOff = useCallback(() => {
    stopListen.current?.(); stopListen.current = null;
    stopSpeaking();
    abortMission.current = true;
    setHandsfree(false); setNumbers(null); setAskOnce(null); setPendingB(null); setPanel(null); setChips([]); setInterim("");
    setOn(false); setPhase("off");
    setReply("");
  }, []);

  // preferences remembered for this Collector
  useEffect(() => {
    if (memory?.prefs?.lang) setListenLang(memory.prefs.lang);
    if (memory?.prefs?.mode) setOutMode(memory.prefs.mode);
    if (memory?.prefs?.rate) setRate(memory.prefs.rate);
  }, [memory?.prefs?.lang, memory?.prefs?.mode, memory?.prefs?.rate]);
  useEffect(() => { if (handsfree && on && phase === "ready") startListening(); }, [handsfree]); // eslint-disable-line react-hooks/exhaustive-deps

  // keyboard: Alt+T on/off; hold Alt+Space to talk; Esc stops; Ctrl+Z undoes
  useEffect(() => {
    const typing = () => /INPUT|TEXTAREA|SELECT/.test((document.activeElement as HTMLElement)?.tagName ?? "");
    const down = (e: KeyboardEvent) => {
      if (e.altKey && (e.key === "t" || e.key === "T")) { e.preventDefault(); if (onRef.current) switchOff(); else switchOn(); return; }
      if (e.altKey && e.code === "Space") {
        e.preventDefault();
        if (e.repeat) return;
        if (!onRef.current) switchOn();
        startListening();
        return;
      }
      if (!onRef.current) return;
      if (e.key === "Escape" && (window.speechSynthesis?.speaking || phase === "acting")) { stopSpeaking(); abortMission.current = true; }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !typing()) { e.preventDefault(); void run([{ a: "undo", n: 1 }], listenLang, "Ctrl+Z", "rules"); }
    };
    const up = (e: KeyboardEvent) => { if (e.code === "Space" && stopListen.current && !handsfreeRef.current) stopListen.current(); };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
  }, [switchOn, switchOff, startListening, phase, listenLang]); // eslint-disable-line react-hooks/exhaustive-deps

  // the numbered badges follow the page while shown
  useEffect(() => {
    if (!numbers) return;
    const t = setInterval(() => setNumbers((n) => (n ? { ...n, items: clickables() } : n)), 1200);
    return () => clearInterval(t);
  }, [numbers?.names]); // eslint-disable-line react-hooks/exhaustive-deps

  // --------------------------------------------------------------- Watch --
  const seenBell = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!on) return;
    const tick = () => {
      const h = hostRef.current;
      const now = Date.now();
      let mem: WatchMemory = { spoken: [], last: {} };
      try { mem = JSON.parse(store.get("thunai-watch") ?? "") as WatchMemory; } catch { /* first run */ }
      const signals: Signal[] = [];
      const bell = (h.ov.bell ?? []) as { id: string; sev?: string; title?: string; type?: string; zone_name?: string | null }[];
      if (!seenBell.current) seenBell.current = new Set(bell.map((b) => String(b.id)));
      for (const b of bell) {
        const isNew = !seenBell.current.has(String(b.id));
        seenBell.current.add(String(b.id));
        if (!isNew || b.sev !== "Severe") continue;
        const where = b.zone_name ?? "Chennai";
        signals.push({ key: `bell:${b.id}`, kind: "severe", lifeSafety: false, impact: 1, urgency: 1, confidence: 0.9, novelty: 1, actionability: 0.8, level: 1,
          text: { en: `New severe incident: ${b.title ?? b.type ?? "incident"}, ${where}.`, ta: `புதிய கடுமையான நிகழ்வு: ${b.title ?? b.type ?? ""}, ${where}.` } });
      }
      for (const r of memoryRef.current?.reminders ?? []) {
        if (r.done || Date.parse(r.at) > now) continue;
        signals.push({ key: `rem:${r.id}`, kind: "reminder", lifeSafety: false, impact: 0.8, urgency: 1, confidence: 1, novelty: 1, actionability: 1, level: 1,
          text: { en: line("reminderDue", "en", { text: r.text }), ta: line("reminderDue", "ta", { text: r.text }) } });
        void changeMemory({ op: "reminderDone", id: r.id });
      }
      const today = new Date().toDateString();
      const hr = new Date().getHours();
      if (hr >= 7 && hr < 10 && store.get("thunai-greeted") !== today) {
        store.set("thunai-greeted", today);
        const counts = (h.ov.severity?.counts ?? {}) as Record<string, number>;
        const g = { severe: counts.Severe ?? 0, alerts: bell.length };
        signals.push({ key: `greet:${today}`, kind: "greeting", lifeSafety: false, impact: 0.8, urgency: 0.9, confidence: 1, novelty: 1, actionability: 0.9, level: 1,
          text: { en: line("greet", "en", g), ta: line("greet", "ta", g) } });
      }
      for (const s of signals.sort((a, b) => band(b).localeCompare(band(a)))) {
        if (watchMaySpeak(s, mem, now, { quiet: outMode === "quiet", lastUserSpeech: lastUserSpeech.current }) && phase !== "listening" && phase !== "acting") {
          mem = watchRemember(s, mem, now);
          store.set("thunai-watch", JSON.stringify(mem));
          earcon("need");
          out(s.text[listenLang], listenLang);
          break;
        }
      }
    };
    const first = setTimeout(tick, 1500);
    const t = setInterval(tick, 60_000);
    return () => { clearTimeout(first); clearInterval(t); };
  }, [on, outMode, listenLang]); // eslint-disable-line react-hooks/exhaustive-deps

  const openTrail = async () => {
    try { const r = await fetch("/api/collector/thunai/audit"); if (r.ok) { setTrail(await r.json()); setPanel("trail"); } } catch { /* offline */ }
  };

  // --------------------------------------------------------------- render --
  if (!mounted) return null;
  const ta = listenLang === "ta";
  const orbLabel = !on ? "Thunai: switch on (Alt+T)" : phase === "listening" ? "Listening: release to stop" : "Thunai: hold Alt+Space or click to talk";
  return createPortal(
    <div className={`thunai${on ? " on" : ""}`} data-thunai-ui data-phase={phase}>
      {pointer.show && (
        <div className={`th-pointer${pointer.ripple ? " ripple" : ""}`} style={{ transform: `translate(${pointer.x}px, ${pointer.y}px)` }} aria-hidden="true">
          <span className="ring" />{pointer.label && <b>{pointer.label}</b>}
        </div>
      )}
      {numbers && numbers.items.map((it) => (
        <span key={it.n} className="th-badge" style={{ left: Math.max(0, it.x - 6), top: Math.max(0, it.y - 8) }} aria-hidden="true">
          {it.n}{numbers.names && it.name ? ` ${it.name.slice(0, 18)}` : ""}
        </span>
      ))}

      {on && (chips.length > 0 || heard || interim || reply) && (
        <div className="th-dock" role="status" aria-live="polite">
          {chips.length > 0 && (
            <div className="th-chips">
              {chips.map((c, i) => (
                <span key={c.id} className={`th-chip ${c.state}`}>{c.state === "done" ? "✓ " : c.state === "failed" ? "✕ " : ""}{c.label}{i < chips.length - 1 ? <i>→</i> : null}</span>
              ))}
              {undoStack.current.length > 0 && <button className="th-undo" onClick={() => void run([{ a: "undo", n: 1 }], listenLang, "Go back", "rules")}>{ta ? "பின்" : "Go back"}</button>}
            </div>
          )}
          {(interim || heard) && <p className={`th-heard${interim ? " interim" : ""}`}>{interim || heard}</p>}
          {reply && <p className="th-reply">{reply}</p>}
          {wrong && <button className="th-wrong" onClick={() => { setWrong(null); void run([{ a: "undo", n: 1 }], listenLang, "wrong", "rules"); }}>{ta ? `கேட்டது: ${wrong} — தவறா?` : `Heard: ${wrong} — wrong?`}</button>}
        </div>
      )}

      {on && askOnce && (
        <div className="th-card" role="dialog" aria-label={askOnce.question[askOnce.lang]}>
          <p>{askOnce.question[askOnce.lang]}</p>
          <div className="row">
            {askOnce.choices.map((c, i) => (
              <button key={i} onClick={() => { setAskOnce(null); if (c.steps.length) { void changeMemory({ op: "habit", heard: askOnce.heard.toLowerCase(), meant: c.label.en }); void run(c.steps, askOnce.lang, askOnce.heard, "rules"); } else setPhase("ready"); }}>
                {i + 1}. {c.label[askOnce.lang]}
              </button>
            ))}
          </div>
        </div>
      )}
      {on && pendingB && (
        <div className="th-card amber" role="dialog" aria-label={pendingB.text}>
          <p>{pendingB.text}</p>
          <div className="row">
            <button className="primary" onClick={() => { const p = pendingB; setPendingB(null); void run(p.steps, p.lang, p.heard, "rules"); }}>{ta ? "ஆம்" : "Yes"}</button>
            <button onClick={() => { setPendingB(null); setPhase("ready"); }}>{ta ? "வேண்டாம்" : "No"}</button>
          </div>
        </div>
      )}
      {on && tray.length > 0 && (
        <div className="th-tray" role="region" aria-label="Approval tray">
          <header><b>{ta ? "ஒப்புதலுக்காக" : "Waiting for approval"}</b><span>{tray.length}</span></header>
          <ol>{tray.map((d) => <li key={d.incidentId}><b>{d.title}</b><small>{d.to ?? (ta ? "பெறுநர் இல்லை" : "no recipient")}{d.sandbox ? (ta ? " · சோதனை வழி" : " · sandbox") : (ta ? " · பலகையிலிருந்து அனுப்பவும்" : " · send from the panel")}</small></li>)}</ol>
          <p className="hint">{ta ? `"உறுதி ${tray.length}" என்று சொல்லுங்கள்` : `Say "confirm ${tray.length}"`}</p>
          <div className="row">
            <button className="primary" onClick={() => void sendTray(tray.length, listenLang, "tap")}>{ta ? `${tray.length} அனுப்பு` : `Approve and send ${tray.length}`}</button>
            <button onClick={() => { setTray([]); setTrayShownAt(null); setPhase("ready"); }}>{ta ? "நீக்கு" : "Discard"}</button>
          </div>
        </div>
      )}

      {on && panel && (
        <aside className="th-panel" aria-label={panel}>
          <header>
            <b>{panel === "memory" ? (ta ? "துணையின் நினைவு" : "What Thunai remembers") : panel === "trail" ? (ta ? "தணிக்கைப் பதிவு" : "Audit trail") : (ta ? "சொல்லக்கூடியவை" : "Things to say")}</b>
            <button aria-label="Close" onClick={() => setPanel(null)}>×</button>
          </header>
          {panel === "memory" && (
            <div className="body">
              {!memory?.notes.length && !memory?.reminders.length && !Object.keys(memory?.habits ?? {}).length && <p className="muted">{ta ? "இன்னும் எதுவும் இல்லை." : "Nothing yet."}</p>}
              {!!memory?.notes.length && <><h4>{ta ? "குறிப்புகள்" : "Notes"}</h4><ul>{memory.notes.map((n) => <li key={n.id}>{n.text}<button onClick={() => void changeMemory({ op: "forget", id: n.id })}>{ta ? "மற" : "Forget"}</button></li>)}</ul></>}
              {!!memory?.reminders.filter((r) => !r.done).length && <><h4>{ta ? "நினைவூட்டல்கள்" : "Reminders"}</h4><ul>{memory.reminders.filter((r) => !r.done).map((r) => <li key={r.id}>{whenOf(r.at)}: {r.text}<button onClick={() => void changeMemory({ op: "forget", id: r.id })}>{ta ? "மற" : "Forget"}</button></li>)}</ul></>}
              {!!Object.keys(memory?.habits ?? {}).length && <><h4>{ta ? "கற்றவை" : "Learned"}</h4><ul>{Object.entries(memory!.habits).map(([k, v]) => <li key={k}>“{k}” → {v} <em>{ta ? "கற்றது" : "learned"}</em><button onClick={() => void changeMemory({ op: "forget", id: k })}>{ta ? "மற" : "Forget"}</button></li>)}</ul></>}
              <button className="danger" onClick={() => void changeMemory({ op: "forget", all: true })}>{ta ? "எல்லாம் மற" : "Forget everything"}</button>
            </div>
          )}
          {panel === "trail" && trail && (
            <div className="body">
              <p className={trail.intact ? "ok" : "bad"}>{trail.intact ? (ta ? "சங்கிலி முழுமையாக உள்ளது." : "Chain intact: no line was changed.") : (ta ? "சங்கிலி உடைந்துள்ளது!" : "Chain broken: a line was changed.")}</p>
              <ol className="trail">{[...trail.lines].reverse().slice(0, 60).map((l, i) => <li key={i}><time>{whenOf(l.at)}</time><span className={`risk r${l.risk}`}>{l.risk}</span>{l.heard ?? "—"}<small>{l.outcome}</small></li>)}</ol>
            </div>
          )}
          {panel === "help" && (
            <div className="body help">
              {(ta ? ["ஏழாவது மண்டலம்", "இந்த வாரம்", "அவசரமானவை மட்டும்", "மோசமான வெள்ளம் காட்டு", "எண்களைக் காட்டு", "பழையபடி மாத்து", "இன்றைய சுருக்கம் சொல்லு", "நாளைக்கு கனமழை, தயார் பண்ணு"]
                : ["Zone 7", "Change filter to 7", "Adyar, weekly, critical only", "Show the worst flooding", "Schools within 1 km of flooding", "Explain this chart", "Show numbers", "Go back three steps", "Remember that …", "Brief me", "Prepare for heavy rain"]).map((x) => (
                <button key={x} onClick={() => void handle(x, 0.95)}>{x}</button>
              ))}
            </div>
          )}
        </aside>
      )}

      {on && (
        <form className="th-bar" onSubmit={(e) => { e.preventDefault(); const t = typed; setTyped(""); void handle(t, 0.95); }}>
          <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={ta ? "சொல்லுங்கள் அல்லது தட்டச்சு செய்யுங்கள்…" : "Say or type a command…"} aria-label="Thunai command" />
          <div className="th-tools">
            <button type="button" className={outMode === "voice" ? "on" : ""} onClick={() => setOutMode(outMode === "voice" ? "visual" : outMode === "visual" ? "quiet" : "voice")} title={outMode}>
              {outMode === "voice" ? (ta ? "குரல்" : "Voice") : outMode === "visual" ? (ta ? "எழுத்து" : "Visual") : (ta ? "அமைதி" : "Quiet")}
            </button>
            <button type="button" onClick={() => setListenLang(ta ? "en" : "ta")} title="Listening language">{ta ? "தமிழ்" : "EN"}</button>
            <button type="button" className={handsfree ? "on" : ""} onClick={() => setHandsfree((v) => !v)} title={ta ? "தொடர்ந்து கேள்" : "Stay listening"}>{ta ? "தொடர்" : "Hands-free"}</button>
            <button type="button" onClick={() => { void loadMemory(); setPanel(panel === "memory" ? null : "memory"); }}>{ta ? "நினைவு" : "Memory"}</button>
            <button type="button" onClick={() => (panel === "trail" ? setPanel(null) : void openTrail())}>{ta ? "பதிவு" : "Trail"}</button>
            <button type="button" onClick={() => setPanel(panel === "help" ? null : "help")}>?</button>
            <button type="button" onClick={switchOff} title="Thunai off" aria-label="Thunai off">⏻</button>
          </div>
        </form>
      )}

      <button ref={orbRef} className={`th-orb ${phase}`} aria-label={orbLabel} title={orbLabel} aria-pressed={on}
        onClick={() => { if (!on) switchOn(); else if (phase === "listening") stopListen.current?.(); else startListening(); }}>
        <span className="core" />
        {phase === "listening" && <span className="mic" aria-label="Microphone on" />}
        {tray.length > 0 && <em className="count">{tray.length}</em>}
      </button>
    </div>,
    document.body
  );
}
