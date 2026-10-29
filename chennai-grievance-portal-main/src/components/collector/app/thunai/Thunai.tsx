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
import { isReflex, type Checked, type Turn } from "@/lib/thunai/plan";
import { confirmGate, planRisk } from "@/lib/thunai/risk";
import { say as line } from "@/lib/thunai/say";
import type { Lang, OutMode, PageKey, PeriodKey, ScreenState, Sev, Step, Understood, View, World } from "@/lib/thunai/types";
import { describe as describeStep, PAGE_EN, PAGE_TA, PERIOD_EN, PERIOD_TA, SUGGEST, understand } from "@/lib/thunai/understand";
import { band, canSpeak as watchMaySpeak, remember as watchRemember, type Signal, type WatchMemory } from "@/lib/thunai/watch";
import type { MapGeo } from "@/lib/collector/geo";
import type { AgentResult, StageOp } from "@/lib/thunai/agent";
import { stageContext, type StageDocT } from "@/lib/thunai/stage";
import { ackFor, caseIds, filterStage, localStageCommand, narrationOf, sortStage, toCsv, type LocalCmd } from "@/lib/thunai/stagelocal";
import { canListen, listen } from "../assistant/speech";
import type { Console } from "../CollectorApp";
import { byName, clickables, press, readChart, scroll, spotlight, targetFor, typeInto, type Clickable } from "./dom";
import Stage, { type BlockView, type PinnedScreen } from "./Stage";
import { download, exportPng, fileName } from "./export";
import { hasVoice, speakLines, speakText, stopVoice, voicesFor, warmVoices } from "./voice";
import "./thunai.css";

const speak = (text: string, lang: string, onEnd?: () => void, rate = 1, voice?: string | null) => speakText(text, lang, { onEnd, rate, voice });
const stopSpeaking = () => stopVoice();

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
  /** where the brain lives (the dev test console uses its own) */
  planUrl?: string;
  /** where the agent lives (v2: screens built from the data) */
  agentUrl?: string;
  /** the ward and zone outlines for the Stage's maps */
  loadGeo?: () => Promise<MapGeo | null>;
  /** where a Take action draft is read (the dev test console uses its own, which cannot send) */
  draftUrl?: (incidentId: string) => string;
}

type Phase = "off" | "ready" | "listening" | "thinking" | "acting" | "speaking" | "asking" | "waiting" | "blocked";
interface AskCard { question: string; lang: Lang; heard: string; choices: { label: string; en: string; steps?: Step[]; request?: string }[] }
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

/** A soft heartbeat while the agent works (lane 1, after jarvis-v3): stops when the answer arrives. */
function heartbeat(): () => void {
  let ctx: AudioContext | null = null;
  try {
    const W = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
    const AC = W.AudioContext ?? W.webkitAudioContext;
    if (!AC) return () => undefined;
    ctx = new AC();
  } catch { return () => undefined; }
  const c = ctx;
  const beat = () => {
    [0, 0.16].forEach((dt, i) => {
      const o = c.createOscillator(), g = c.createGain();
      o.type = "sine"; o.frequency.value = i ? 98 : 110;
      const t = c.currentTime + dt;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.035, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
      o.connect(g).connect(c.destination); o.start(t); o.stop(t + 0.16);
    });
  };
  beat();
  const t = setInterval(beat, 1100);
  return () => { clearInterval(t); setTimeout(() => c.close().catch(() => undefined), 300); };
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
  const [askOnce, setAskOnce] = useState<AskCard | null>(null);
  /** who understood the last sentence: the model (and how fast), the built-in rules, or an instant control */
  const [brain, setBrain] = useState<{ by: "ai" | "rules" | "instant"; model: string | null; ms: number } | null>(null);
  const [pendingB, setPendingB] = useState<{ text: string; steps: Step[]; heard: string; lang: Lang } | null>(null);
  const [tray, setTray] = useState<Draft[]>([]);
  const [trayShownAt, setTrayShownAt] = useState<number | null>(null);
  const [panel, setPanel] = useState<"memory" | "trail" | "help" | "voice" | null>(null);
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
  // ---- the Stage (v2)
  const [stage, setStage] = useState<StageDocT | null>(null);
  const [stageBack, setStageBack] = useState<StageDocT[]>([]);
  const [stageViews, setStageViews] = useState<Record<string, BlockView>>({});
  const [stageBusy, setStageBusy] = useState<string | null>(null);
  const [stageBrain, setStageBrain] = useState<{ model: string | null; ms: number; rounds: number; calls: number } | null>(null);
  const [stageFilter, setStageFilter] = useState<string | null>(null);
  const [reading, setReading] = useState<{ key: string; char: number | null; lead?: string } | null>(null);
  const [narrating, setNarrating] = useState(false);
  const [pins, setPins] = useState<PinnedScreen[]>([]);
  const [geo, setGeo] = useState<MapGeo | null>(null);
  const [saveAsk, setSaveAsk] = useState<string | null>(null);
  const [voiceName, setVoiceName] = useState<string | null>(() => store.get("thunai-voice"));
  const stageRef = useRef<StageDocT | null>(null);
  stageRef.current = stage;
  const stageFocus = useRef<number | null>(null);
  const narration = useRef<{ key: string; text: string; lead: string }[]>([]);
  const narrIndex = useRef(0);

  const orbRef = useRef<HTMLButtonElement>(null);
  const stopListen = useRef<(() => void) | null>(null);
  const undoStack = useRef<{ steps: Step[]; snap: Snap }[]>([]);
  const lastSteps = useRef<Step[]>([]);
  /** the incident an "item" step opened in the plan now running */
  const justOpened = useRef<string | null>(null);
  /** the last few turns, so "same for Adyar" and "open that" make sense to the brain */
  const turns = useRef<Turn[]>([]);
  const remember = (heardText: string, did: string) => { turns.current = [...turns.current, { heard: heardText.slice(0, 300), did: did.slice(0, 300) }].slice(-4); };
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
      }, rate, voiceName);
      if (!ok) setPhase(ph);
    } else setPhase(ph);
  }, [outMode, rate, voiceName]); // eslint-disable-line react-hooks/exhaustive-deps

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
      const r = await fetch(hostRef.current.draftUrl?.(incidentId) ?? `/api/collector/incidents/${encodeURIComponent(incidentId)}/action`);
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
        justOpened.current = st.list[idx];
        return null;
      }
      case "draft": {
        // the incident a step just opened counts before the console has re-rendered
        const id = justOpened.current ?? buildState().incident;
        if (!id) return line("noIncident", lang);
        c.openAction(id);
        return line("draft", lang);
      }
      case "zoom": {
        const id = justOpened.current ?? buildState().incident;
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
  const run = async (steps: Step[], lang: Lang, heardText: string, by: "rules" | "ai", note?: string, quiet = false) => {
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
    justOpened.current = null;
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
    if (!steps.some((s) => s.a === "whatDid" || s.a === "repeat")) remember(heardText, steps.map((s) => describeStep(s, worldRef.current, "en")).join("; "));
    changeMemory({ op: "recent", text: heardText });
    const speakLine = [note, ...said].filter(Boolean).join(" ");
    if (steps.some((s) => s.a === "off")) return;
    // the Stage speaks for itself: the steps only made the console agree with it
    if (quiet) { setPhase(tray.length ? "waiting" : "ready"); return; }
    if (speakLine) out(speakLine, lang, tray.length ? "waiting" : "ready");
    else { earcon("done"); setReply(steps.map((s) => describeStep(s, worldRef.current, lang)).join(" · ")); setPhase(tray.length ? "waiting" : "ready"); }
  };

  const ask = (card: AskCard) => {
    setAskOnce(card);
    setPhase("asking");
    earcon("need");
    out(card.question, card.lang, "asking");
  };
  const fromRules = (r: Extract<Understood, { kind: "ask" }>): AskCard =>
    ({ question: r.question[r.lang], lang: r.lang, heard: r.heard, choices: r.choices.map((c) => ({ label: c.label[r.lang], en: c.label.en, steps: c.steps })) });
  const pickChoice = async (card: AskCard, c: AskCard["choices"][number]) => {
    setAskOnce(null);
    if (c.request) { await handle(c.request, 0.95, card.heard); return; } // eslint-disable-line @typescript-eslint/no-use-before-define
    if (!c.steps?.length) { setPhase("ready"); return; }
    void changeMemory({ op: "habit", heard: card.heard.toLowerCase(), meant: c.en });
    await run(c.steps, card.lang, card.heard, "rules");
  };

  /** Ask the brain (the model on the server); null when it cannot be reached. */
  const think = async (said: string, st: ScreenState): Promise<{ plan: Checked; model: string | null; ms: number } | null> => {
    try {
      const j = await post(hostRef.current.planUrl ?? "/api/collector/thunai/plan", {
        text: said, turns: turns.current.slice(-4),
        state: { page: st.page, period: st.period, zone: st.zone, dept: st.dept, cat: st.cat, taluk: st.taluk, sev: st.sev, mapMode: st.mapMode,
          panel: st.panel, incident: st.incident, listLength: st.list.length, lastPlace: st.lastPlace, numbers: !!st.numbers }
      });
      return j?.plan?.kind ? { plan: j.plan as Checked, model: j.model ?? null, ms: j.ms ?? 0 } : null;
    } catch { return null; }
  };

  /** Steps that change something saved wait for one tap or "yes" (level B). */
  const gateB = (steps: Step[], said: string, lang: Lang) => {
    const s = steps.find((x) => x.a === "workspace" || x.a === "remember" || x.a === "forget" || x.a === "remind")!;
    const q = s.a === "workspace" ? line("saveAsk", lang, { name: s.name }) : s.a === "remember" ? line("rememberAsk", lang, { text: s.text })
      : s.a === "forget" ? line("forgetAsk", lang, { what: s.all ? (lang === "ta" ? "எல்லாவற்றையும்" : "everything") : (lang === "ta" ? "கடைசி குறிப்பை" : "the last note") })
        : line("remindAsk", lang, { when: whenOf((s as Extract<Step, { a: "remind" }>).at), text: (s as Extract<Step, { a: "remind" }>).text });
    setPendingB({ text: q, steps, heard: said, lang });
    earcon("need");
    out(q, lang, "asking");
  };


  // --------------------------------------------------------------- the Stage (v2) --
  const loadPins = useCallback(() => {
    const fromMem = (memoryRef.current as unknown as { pins?: PinnedScreen[] } | null)?.pins;
    if (fromMem) { setPins(fromMem); return; }
    try { setPins(JSON.parse(store.get("thunai-pins") ?? "[]")); } catch { setPins([]); }
  }, []);
  useEffect(() => { loadPins(); }, [memory, loadPins]);
  const savePins = async (next: PinnedScreen[], op: Record<string, unknown>) => {
    setPins(next);
    store.set("thunai-pins", JSON.stringify(next));
    await changeMemory(op);
  };

  /** Ask the agent: a sentence (with the screen, the turns and the open Stage), or a Stage control's direct screen. */
  const callAgent = async (said: string, st: ScreenState, direct?: { recipe: StageDocT["recipe"]; slots: Record<string, unknown>; lang: Lang }): Promise<AgentResult | null> => {
    try {
      const doc = stageRef.current;
      const j = await post(hostRef.current.agentUrl ?? "/api/collector/thunai/agent", {
        text: said.slice(0, 300), turns: turns.current.slice(-4),
        state: { page: st.page, period: st.period, zone: st.zone, dept: st.dept, cat: st.cat, taluk: st.taluk, sev: st.sev, mapMode: st.mapMode,
          panel: st.panel, incident: st.incident, listLength: st.list.length, lastPlace: st.lastPlace, numbers: !!st.numbers },
        stage: doc ? stageContext(doc, stageFocus.current) : null,
        direct: direct ?? null
      });
      return (j?.result as AgentResult) ?? null;
    } catch { return null; }
  };

  const stopNarration = () => { stopVoice(); setNarrating(false); setReading(null); };

  /** Read the summary, then (for news and the brief) every item, the one being read highlighted; then listen again. */
  const narrate = (doc: StageDocT, say: string | null, lang: Lang, items: boolean) => {
    const list = items ? narrationOf(doc, lang) : [];
    narration.current = list;
    narrIndex.current = 0;
    const lines = [...(say ? [say] : []), ...list.map((x) => x.text)];
    const offset = say ? 1 : 0;
    if (say) { setReply(say); lastSpoken.current = { text: say, lang }; }
    const voiceLang = lang === "ta" && hasVoice("ta-IN") ? "ta-IN" : "en-IN";
    if (outMode !== "voice" || !lines.length || (lang === "ta" && voiceLang !== "ta-IN")) { setPhase(tray.length ? "waiting" : "ready"); return; }
    stopListen.current?.();
    setNarrating(true);
    setPhase("speaking");
    speakLines(lines, voiceLang, {
      rate, voice: voiceName,
      onLine: (i) => { const it = list[i - offset]; if (it) narrIndex.current = i - offset; setReading(it ? { key: it.key, char: null, lead: it.lead } : null); },
      onWord: (i, ch) => { const it = list[i - offset]; if (it) setReading({ key: it.key, char: ch, lead: it.lead }); },
      onEnd: () => {
        setNarrating(false); setReading(null);
        setPhase(onRef.current ? (tray.length ? "waiting" : "ready") : "off");
        // the follow-up listen (jarvis-v3): hands-free goes back to listening once the Stage has been read
        if (handsfreeRef.current && onRef.current) setTimeout(() => startListening(), 300); // eslint-disable-line @typescript-eslint/no-use-before-define
      }
    });
  };

  /** Read the items from item i onwards ("next", "again", "read them"). */
  const readFrom = (i: number, lang: Lang) => {
    const doc = stageRef.current;
    if (!doc) return;
    const list = narrationOf(doc, lang);
    if (!list.length) { out(doc.say[lang], lang); return; }
    const k = Math.max(0, Math.min(list.length - 1, i));
    narration.current = list;
    const voiceLang = lang === "ta" && hasVoice("ta-IN") ? "ta-IN" : "en-IN";
    narrIndex.current = k;
    setReading({ key: list[k].key, char: null, lead: list[k].lead });
    if (outMode !== "voice") { setReply(list[k].text); return; }
    setNarrating(true); setPhase("speaking");
    speakLines(list.slice(k).map((x) => x.text), voiceLang, {
      rate, voice: voiceName,
      onLine: (j) => { narrIndex.current = k + j; setReading({ key: list[k + j].key, char: null, lead: list[k + j].lead }); },
      onWord: (j, ch) => setReading({ key: list[k + j].key, char: ch, lead: list[k + j].lead }),
      onEnd: () => { setNarrating(false); setReading(null); setPhase("ready"); if (handsfreeRef.current && onRef.current) setTimeout(() => startListening(), 300); } // eslint-disable-line @typescript-eslint/no-use-before-define
    });
  };

  const ensureGeo = () => {
    if (geo) return;
    const h = hostRef.current;
    (h.loadGeo ? h.loadGeo() : fetch("/api/collector/geo").then((r) => (r.ok ? r.json() : null))).then((g) => g && setGeo(g as MapGeo)).catch(() => undefined);
  };

  const showStage = (doc: StageDocT, say: string | null, lang: Lang, brainInfo: { model: string | null; ms: number; rounds: number; calls: number } | null, opts: { push?: boolean; drafts?: boolean } = {}) => {
    stopNarration();
    ensureGeo();
    const withDrafts: StageDocT = opts.drafts && doc.blocks.length < 6 ? { ...doc, blocks: [...doc.blocks, { kind: "Drafts", id: "drafts", title: lang === "ta" ? "ஒப்புதலுக்காக" : "Waiting for your approval" }] } : doc;
    const apply = () => {
      if (stageRef.current && opts.push !== false) { const cur = stageRef.current; setStageBack((b) => [...b, cur].slice(-8)); }
      setStage(withDrafts); setStageViews({}); setStageFilter(null); setStageBrain(brainInfo); stageFocus.current = null;
    };
    // a shared-element style hand-over where the browser has it (the View Transitions API), a plain swap elsewhere
    const d = document as Document & { startViewTransition?: (cb: () => void) => unknown };
    if (d.startViewTransition && !reduced() && stageRef.current) d.startViewTransition(() => apply()); else apply();
    stageRef.current = withDrafts;
    remember(doc.title, `showed a ${doc.recipe} screen: ${doc.title}`);
    const auto = withDrafts.blocks.some((b) => b.kind === "NewsReader" || b.kind === "Brief");
    narrate(withDrafts, say, lang, auto);
  };

  const closeStage = () => { stopNarration(); setStage(null); stageRef.current = null; setStageBack([]); setStageBusy(null); setSaveAsk(null); setPhase(onRef.current ? (tray.length ? "waiting" : "ready") : "off"); };

  /** A screen from a Stage control or a local command: built by code from the data, no model. */
  const directStage = async (recipe: StageDocT["recipe"], slots: Record<string, unknown>, label: string, lang: Lang = listenLang, opts: { drafts?: boolean } = {}) => {
    setStageBusy(label);
    stopNarration();
    const t0 = performance.now();
    const r = await callAgent(label, buildState(), { recipe, slots, lang });
    setStageBusy(null);
    if (!r?.stage) { earcon("blocked"); setReply(lang === "ta" ? "அந்தத் திரையை உருவாக்க முடியவில்லை." : "I could not build that screen."); return; }
    if (r.steps.length) await run(r.steps, lang, label, "rules", undefined, true);
    showStage(r.stage, r.say, lang, { model: null, ms: Math.round(performance.now() - t0), rounds: 0, calls: r.calls.length }, opts);
  };

  const draftMany = async (ids: string[], lang: Lang) => {
    const uniq = [...new Set(ids)].slice(0, 10);
    if (!uniq.length) { out(line("noIncident", lang), lang); return; }
    setReply(line("draftsMaking", lang, { n: uniq.length }));
    const ds = (await Promise.all(uniq.map(draftFor))).filter((d): d is Draft => !!d);
    const total = new Set([...tray.map((t) => t.incidentId), ...ds.map((d) => d.incidentId)]).size;
    if (ds.length) { addToTray(ds); out(line("sendGate", lang, { n: total }), lang, "waiting"); }
    else out(line("noDraft", lang), lang);
    audit(`draft ${uniq.join(", ")}`, [{ a: "draft" }], `drafted ${ds.length} of ${uniq.length} into the tray (nothing sent)`);
  };

  const exportCsv = () => {
    const d = stageRef.current;
    if (!d) return;
    download(new Blob([toCsv(d)], { type: "text/csv;charset=utf-8" }), `${fileName(d.title)}.csv`);
  };

  /** Apply one Stage command (from the local parser or the agent's stage op). */
  const applyLocal = async (cmd: LocalCmd, lang: Lang) => {
    const doc = stageRef.current;
    if (!doc) return;
    switch (cmd.op) {
      case "stop": stopNarration(); setPhase("ready"); return;
      case "next": readFrom(narrIndex.current + 1, lang); return;
      case "prev": readFrom(narrIndex.current - 1, lang); return;
      case "again": readFrom(narrIndex.current, lang); return;
      case "read": readFrom(0, lang); return;
      case "close": closeStage(); return;
      case "back": {
        const prev = stageBack[stageBack.length - 1];
        if (!prev) { closeStage(); return; }
        setStageBack((b) => b.slice(0, -1)); stopNarration(); setStage(prev); stageRef.current = prev; setStageViews({}); setStageFilter(null);
        out(prev.say[lang], lang); return;
      }
      case "clear": await directStage(doc.recipe, doc.slots, doc.title, lang); return;
      case "pin": {
        const p: PinnedScreen = { id: Math.random().toString(36).slice(2, 10), title: doc.title.slice(0, 80), recipe: doc.recipe, slots: doc.slots, at: new Date().toISOString() };
        await savePins([...pins.filter((x) => x.title !== p.title), p].slice(-12), { op: "pin", pin: p });
        earcon("done"); out(lang === "ta" ? "இந்தத் திரையைப் பின் செய்தேன்." : "Pinned this screen.", lang); return;
      }
      case "export": {
        if (cmd.what === "png") { const root = document.querySelector<HTMLElement>(".st-root"); if (root) await exportPng(root, doc, lang); }
        else exportCsv();
        earcon("done"); out(lang === "ta" ? "ஏற்றுமதி செய்தேன்." : cmd.what === "png" ? "Saved a picture of this screen." : "Exported this screen's data as CSV.", lang); return;
      }
      case "view": {
        const b = doc.blocks.find((x) => (cmd.view === "map" ? x.kind === "Ranking" && x.items.some((i) => i.zone != null || i.lat != null) : ["Ranking", "Trend", "Chart", "Compare"].includes(x.kind)));
        if (b) setStageViews((v) => ({ ...v, [b.id]: cmd.view }));
        else if (cmd.view === "map") document.querySelector(".st-block.k-MapView")?.scrollIntoView({ behavior: reduced() ? "auto" : "smooth", block: "center" });
        earcon("done"); setReply(lang === "ta" ? "மாற்றினேன்." : `Showing it as a ${cmd.view}.`); return;
      }
      case "sort": { const d2 = sortStage(doc, cmd.by); setStage(d2); stageRef.current = d2; earcon("done"); setReply(lang === "ta" ? "வரிசைப்படுத்தினேன்." : `Sorted by ${cmd.by}.`); return; }
      case "filter": {
        const r = filterStage(doc, cmd.text);
        if (!r.kept) { out(lang === "ta" ? `"${cmd.text}" எதிலும் இல்லை.` : `None of these mention ${cmd.text}.`, lang); return; }
        setStage(r.doc); stageRef.current = r.doc; setStageFilter(cmd.text);
        out(lang === "ta" ? `${r.of}-இல் ${r.kept} மட்டும்.` : `${r.kept} of the ${r.of} shown are about ${cmd.text}.`, lang); return;
      }
      case "open": {
        const id = caseIds(doc)[cmd.n - 1];
        if (!id) { out(line("noItem", lang), lang); return; }
        stageFocus.current = cmd.n;
        await directStage("case", { id }, `#${cmd.n}`, lang); return;
      }
      case "draft": {
        const ids = caseIds(doc);
        const pick = cmd.first ? ids.slice(0, cmd.n) : doc.recipe === "case" ? ids.slice(0, 1) : ([ids[cmd.n - 1]].filter(Boolean) as string[]);
        await draftMany(pick, lang); return;
      }
      case "map": {
        const ids = caseIds(doc);
        const id = cmd.n ? ids[cmd.n - 1] : ids[0];
        closeStage();
        if (id) { hostRef.current.c.setPage("overview"); hostRef.current.c.askOnMap?.({ incidentId: id }); }
        return;
      }
      case "full": document.querySelector<HTMLElement>(".st-frame")?.requestFullscreen?.().catch(() => undefined); return;
    }
  };

  const applyStageOp = async (op: StageOp, lang: Lang) => {
    if (op.op === "save") { askSave(op.text ?? stageRef.current?.title ?? "Thunai screen", lang); return; }
    const sortBy = (["complaints", "time", "value", "name", "severity"].includes(op.text ?? "") ? op.text : "value") as "value";
    const cmd: LocalCmd | null =
      op.op === "open" ? { op: "open", n: op.n ?? 1 }
        : op.op === "draft" ? { op: "draft", n: op.n ?? 1, first: /first|top/i.test(op.text ?? "") }
          : op.op === "filter" ? (op.text ? { op: "filter", text: op.text } : null)
            : op.op === "sort" ? { op: "sort", by: sortBy }
              : op.op === "view" ? { op: "view", view: op.text === "table" ? "table" : op.text === "map" ? "map" : "chart" }
                : op.op === "export" ? { op: "export", what: /png|image|picture/i.test(op.text ?? "") ? "png" : /csv|data/i.test(op.text ?? "") ? "csv" : null }
                  : op.op === "map" ? { op: "map", n: op.n }
                    : op.op === "explain" ? { op: "again" }
                      : ({ op: op.op } as LocalCmd);
    if (cmd) await applyLocal(cmd, lang);
  };

  /** Saving a workspace changes something kept: one tap or "yes" first (level B). */
  const askSave = (name: string, lang: Lang) => {
    const q = line("saveAsk", lang, { name });
    setSaveAsk(q);
    setPendingB({ text: q, steps: [{ a: "workspace", op: "save", name }], heard: `save as ${name}`, lang });
    earcon("need");
    out(q, lang, "asking");
  };

  const stageActions = {
    close: () => { if (narrating) stopNarration(); else closeStage(); },
    back: stageBack.length ? () => void applyLocal({ op: "back" }, listenLang) : null,
    ask: (t: string) => void handleRef.current(t, 0.95), // eslint-disable-line @typescript-eslint/no-use-before-define
    mic: () => { if (phase === "listening") stopListen.current?.(); else startListening(); }, // eslint-disable-line @typescript-eslint/no-use-before-define
    listening: phase === "listening",
    direct: (recipe: StageDocT["recipe"], slots: Record<string, unknown>, label: string) => void directStage(recipe, slots, label),
    openCase: (id: string) => void directStage("case", { id }, id),
    openInConsole: (id: string) => { closeStage(); hostRef.current.c.openInc(id); },
    takeAction: (id: string) => { closeStage(); hostRef.current.c.openAction(id); audit(`take action ${id}`, [{ a: "draft" }], "opened Take action (nothing sent)"); },
    draft: (ids: string[]) => void draftMany(ids, listenLang),
    showOnMainMap: (q: { incidentId?: string; zone?: number; text?: string }) => {
      closeStage();
      const c = hostRef.current.c;
      c.setPage("overview");
      if (q.incidentId) c.askOnMap?.({ incidentId: q.incidentId }); else if (q.zone) hostRef.current.applyView({ zone: q.zone }); else if (q.text) c.askOnMap?.(q.text);
    },
    zone: (z: number) => void directStage("cases", { zones: [z], period: stageRef.current?.scope.period ?? null, cat: stageRef.current?.scope.cat ?? null, sort: "priority", n: 15 }, `${ZONE_NAMES[z - 1] ?? `Zone ${z}`}`),
    dept: (code: string, name: string) => void directStage("cases", { dept: code, status: "open", period: stageRef.current?.scope.period ?? null, sort: "priority", n: 15 }, name),
    station: (name: string, metric: string) => void directStage("readings", { metric: ["rain", "aqi", "lakes", "temp", "humidity"].includes(metric) ? metric : "rain", name }, name),
    read: () => readFrom(0, listenLang),
    stop: () => stopNarration(),
    pin: () => void applyLocal({ op: "pin" }, listenLang),
    openPin: (p: PinnedScreen) => void directStage(p.recipe as StageDocT["recipe"], p.slots, p.title),
    unpin: (id: string) => void savePins(pins.filter((x) => x.id !== id), { op: "unpin", id }),
    exportCsv,
    exportPng: (root: HTMLElement) => { if (stageRef.current) void exportPng(root, stageRef.current, listenLang); },
    save: (name: string) => askSave(name, listenLang),
    setView: (id: string, v: BlockView) => setStageViews((x) => ({ ...x, [id]: v })),
    confirmTray: () => void sendTray(tray.length, listenLang, "tap"),
    discardTray: () => { setTray([]); setTrayShownAt(null); }
  };

  // --------------------------------------------------------------- a sentence --
  /**
   * The brain understands every sentence; only instant controls (stop, undo, confirm 3, click 4 while numbers show) are
   * done on the spot. When the brain cannot be reached, the built-in rules answer instead and the dock says so.
   */
  const handle = async (text: string, conf = 0.95, original?: string) => {
    const said = text.trim();
    if (!said) return;
    lastUserSpeech.current = Date.now();
    lastHeardAt.current = Date.now();
    setHeard(original ?? said); setInterim(""); setWrong(null); setReply("");
    // an answer to the one question
    if (askOnce && !original) {
      const t = said.toLowerCase();
      const pick = /^(1|first|one|முதலாவது|முதல்|onnu|mudhal)$/.test(t) ? 0 : /^(2|second|two|இரண்டாவது|ரெண்டாவது|rendu|second one)$/.test(t) ? 1
        : /^(3|third|three|மூன்றாவது|moonu)$/.test(t) ? 2 : askOnce.choices.findIndex((c) => c.label.toLowerCase() === t || c.en.toLowerCase() === t);
      const card = askOnce;
      setAskOnce(null);
      if (pick >= 0 && card.choices[pick]) { await pickChoice(card, card.choices[pick]); return; }
    }
    // a "yes" to a one-tap (level B) card
    if (pendingB) {
      if (/^(yes|ok|okay|save|do it|ஆமா|ஆம்|சரி|aama|sari|seri|confirm)$/i.test(said)) { const p = pendingB; setPendingB(null); await run(p.steps, p.lang, p.heard, "rules"); return; }
      if (/^(no|cancel|வேண்டாம்|illa|vendaam)$/i.test(said)) { setPendingB(null); setPhase("ready"); return; }
      setPendingB(null);
    }
    // the open Stage: its own commands ("next", "only the Adyar ones", "open 3", "pin this") need no model
    if (stageRef.current && !original) {
      const lc = localStageCommand(said);
      if (lc) { setBrain({ by: "instant", model: null, ms: 0 }); remember(said, `on the Stage: ${lc.op}`); await applyLocal(lc, /[஀-௿]/.test(said) ? "ta" : listenLang); return; }
    }
    const st = buildState();
    const rules = understand(said, st, worldRef.current, { speechConf: conf });
    // instant controls never wait for the network; sending only ever happens here, from the Collector's own words
    if (rules.kind === "do" && isReflex(rules.steps, st)) { setBrain({ by: "instant", model: null, ms: 0 }); await run(rules.steps, rules.lang, said, "rules"); return; }

    setPhase("thinking");
    setChips([]);
    const heardAs = original ?? said;
    // lane 1: an acknowledgement at once and a soft heartbeat while the agent looks, then lane 2: its screen and its words
    const ack = ackFor(said, rules.lang);
    setReply(ack);
    if (stageRef.current) setStageBusy(ack);
    const stopBeat = outMode !== "quiet" ? heartbeat() : () => undefined;
    const ag = await callAgent(said, st).finally(stopBeat);
    setStageBusy(null);
    if (ag && ag.kind !== "none") {
      setBrain({ by: "ai", model: ag.model, ms: ag.ms });
      const lang = ag.lang;
      if (ag.kind === "chat") { earcon("done"); remember(heardAs, ag.reply ?? ""); out(ag.reply ?? "", lang, "ready"); return; }
      if (ag.kind === "refuse") { earcon("blocked"); audit(heardAs, [], "refused"); remember(heardAs, `refused: ${ag.reply}`); out(ag.reply ?? "", lang, "ready"); return; }
      if (ag.kind === "clarify") { ask({ question: ag.reply ?? "", lang, heard: heardAs, choices: ag.options.map((o) => ({ label: o.label, en: o.label, request: o.request })) }); return; }
      if (ag.steps.length && planRisk(ag.steps) === "B") { gateB(ag.steps, heardAs, lang); return; }
      if (ag.stage) {
        if (ag.steps.length) await run(ag.steps, lang, heardAs, "ai", undefined, true);
        audit(heardAs, ag.steps, `screen ${ag.stage.recipe} (${ag.calls.length} data calls, ${ag.rounds} model rounds)`);
        showStage(ag.stage, ag.say, lang, { model: ag.model, ms: ag.ms, rounds: ag.rounds, calls: ag.calls.length });
        return;
      }
      if (ag.stageOp) {
        if (ag.steps.length) await run(ag.steps, lang, heardAs, "ai", undefined, true);
        remember(heardAs, `on the Stage: ${ag.stageOp.op}${ag.stageOp.n ? ` ${ag.stageOp.n}` : ""}`);
        await applyStageOp(ag.stageOp, lang);
        return;
      }
      await run(ag.steps, lang, heardAs, "ai", ag.reply ?? undefined);
      return;
    }
    // the agent could not answer: the v1 planner, then the built-in rules
    setReply(line("aiThinking", rules.lang));
    const ai = await think(said, st);
    if (ai && ai.plan.kind !== "none") {
      setBrain({ by: "ai", model: ai.model, ms: ai.ms });
      const p = ai.plan;
      if (p.kind === "chat") { earcon("done"); remember(heardAs, p.reply); out(p.reply, p.lang, "ready"); return; }
      if (p.kind === "refuse") { earcon("blocked"); audit(heardAs, [], "refused"); remember(heardAs, `refused: ${p.reply}`); out(p.reply, p.lang, "ready"); return; }
      if (p.kind === "clarify") {
        ask({ question: p.question, lang: p.lang, heard: heardAs, choices: p.options.map((o) => ({ label: o.label, en: o.label, request: o.request })) });
        return;
      }
      if (planRisk(p.steps) === "B") { gateB(p.steps, heardAs, p.lang); return; }
      await run(p.steps, p.lang, heardAs, "ai", p.reply ?? undefined);
      return;
    }
    // the brain was unreachable or found nothing real: the built-in rules answer, and the dock says so
    setBrain({ by: "rules", model: null, ms: 0 });
    if (rules.kind === "unknown") {
      earcon("blocked");
      audit(said, [], "not understood");
      out(line("notUnderstood", rules.lang, { heard: said, examples: SUGGEST.slice(0, 3).join(", ") }), rules.lang, "ready");
      return;
    }
    if (rules.kind === "refuse") { earcon("blocked"); audit(said, [], "refused"); out(rules.why[rules.lang], rules.lang, "ready"); return; }
    if (rules.kind === "ask") { ask(fromRules(rules)); return; }
    if (planRisk(rules.steps) === "B") { gateB(rules.steps, said, rules.lang); return; }
    if (rules.confidence < 0.6) {
      const what = rules.steps.map((x) => describeStep(x, worldRef.current, rules.lang)).join(", ");
      ask({ question: line("lowConfidence", rules.lang, { what }), lang: rules.lang, heard: said,
        choices: [{ label: rules.lang === "ta" ? "ஆம்" : "Yes", en: "Yes", steps: rules.steps }, { label: rules.lang === "ta" ? "இல்லை" : "No", en: "No", steps: [] }] });
      return;
    }
    if (rules.confidence < 0.85) { setWrong(rules.steps.map((x) => describeStep(x, worldRef.current, rules.lang)).join(", ")); setTimeout(() => setWrong(null), 4000); }
    await run(rules.steps, rules.lang, said, rules.by, rules.note?.[rules.lang]);
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
        if (outMode === "voice") await new Promise<void>((res) => { if (!speak(text, lang === "ta" ? "ta-IN" : "en-IN", () => res(), rate, voiceName)) res(); });
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
    setReply(`${lakes} ${drafts.length ? line("sendGate", lang, { n: drafts.length }) : line("noDraft", lang)}`);
    // v2: the mission ends on a screen (the flooding picture today, with the drafts waiting under it)
    await directStage("dashboard", { cat: "FLOOD_WATERLOGGING", period: "daily" }, lang === "ta" ? "வெள்ள நிலவரம்" : "Flooding today", lang, { drafts: true });
    mark(4, "done");
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
    warmVoices();
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

      {on && !stage && (chips.length > 0 || heard || interim || reply) && (
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
          {phase === "thinking" ? <p className="th-reply th-thinking"><span className="dots" aria-hidden="true"><i /><i /><i /></span>{reply}</p> : reply && <p className="th-reply">{reply}</p>}
          {brain && phase !== "thinking" && phase !== "listening" && (
            <p className={`th-brain ${brain.by}`}>
              {brain.by === "ai" ? `${ta ? "AI புரிந்தது" : "Understood by AI"}${brain.model ? ` · ${brain.model.replace(/^.*\//, "").replace(/#\d+$/, "")}` : ""}${brain.ms ? ` · ${(brain.ms / 1000).toFixed(1)} s` : ""}`
                : brain.by === "instant" ? (ta ? "உடனடி கட்டளை" : "Instant control")
                  : (ta ? "AI கிடைக்கவில்லை: உள்ளமைந்த விதிகள்" : "AI unreachable: built-in rules answered")}
            </p>
          )}
          {wrong && <button className="th-wrong" onClick={() => { setWrong(null); void run([{ a: "undo", n: 1 }], listenLang, "wrong", "rules"); }}>{ta ? `கேட்டது: ${wrong} — தவறா?` : `Heard: ${wrong} — wrong?`}</button>}
        </div>
      )}

      {on && askOnce && (
        <div className="th-card" role="dialog" aria-label={askOnce.question}>
          <p>{askOnce.question}</p>
          <div className="row">
            {askOnce.choices.map((c, i) => (
              <button key={i} onClick={() => void pickChoice(askOnce, c)}>{i + 1}. {c.label}</button>
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
            <b>{panel === "memory" ? (ta ? "துணையின் நினைவு" : "What Thunai remembers") : panel === "trail" ? (ta ? "தணிக்கைப் பதிவு" : "Audit trail") : panel === "voice" ? (ta ? "குரல்" : "Thunai's voice") : (ta ? "சொல்லக்கூடியவை" : "Things to say")}</b>
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
          {panel === "voice" && (
            <div className="body voice">
              <p className="muted">{ta ? "இந்தக் கணினியில் உள்ள குரல்கள், இயல்பானவை முதலில்." : "The voices this device has, the most natural first. Edge and Windows \"Natural\" voices sound best."}</p>
              {(["en-IN", "ta-IN"] as const).map((lg) => (
                <div key={lg}>
                  <h4>{lg === "en-IN" ? "English" : "தமிழ்"}</h4>
                  {!voicesFor(lg).length && <p className="muted">{ta ? "குரல் இல்லை: எழுத்தில் காட்டுகிறேன்." : "No voice for this language on this device: Thunai shows the words instead."}</p>}
                  <ul>{voicesFor(lg).slice(0, 8).map((v) => (
                    <li key={v.name}>
                      <label><input type="radio" name={`voice-${lg}`} checked={(voiceName ?? voicesFor(lg)[0]?.name) === v.name} onChange={() => { setVoiceName(v.name); store.set("thunai-voice", v.name); }} />{v.name}{v.natural ? <em>{ta ? " இயல்பானது" : " natural"}</em> : null}</label>
                      <button onClick={() => speakText(lg === "ta-IN" ? "வணக்கம், நான் துணை." : "Good morning. Six severe cases need you today.", lg, { voice: v.name, rate })}>{ta ? "கேள்" : "Try"}</button>
                    </li>))}</ul>
                </div>
              ))}
            </div>
          )}
          {panel === "help" && (
            <div className="body help">
              <p className="muted">{ta ? "சாதாரணமாகப் பேசுங்கள்: AI புரிந்துகொள்ளும். உதாரணங்கள்:" : "Just talk normally: the AI understands. For example:"}</p>
              {(ta ? ["அம்பத்தூர்ல இந்த வாரம் என்ன நடக்குது காட்டு", "Adyar la police complaints mattum kaatu", "அவசரமானவை மட்டும்", "செம்பரம்பாக்கம் ஏரியில் எவ்வளவு தண்ணீர் இருக்கு", "முதல் சம்பவத்தைத் திற", "நாளைக்கு கனமழை, தயார் பண்ணு", "பழையபடி மாத்து"]
                : ["Show me the severe cases", "Read today's news", "Compare Adyar and Ambattur this week", "Top 3 areas with the most rainfall", "Department-wise performance",
                  "Make me a flooding dashboard for this week", "Schools within 1 km of flooding in Adyar", "How has dengue moved this quarter?",
                  "What's happening in Ambattur this week? Only the serious stuff", "Same for Adyar", "Why is Perungudi looking so bad lately?",
                  "Open the top one and draft something for the department", "How full is Chembarambakkam?", "Explain this chart", "We expect heavy rain tonight, get everything ready",
                  "Remind me at 6 to call the SWD engineer", "Go back"]).map((x) => (
                <button key={x} onClick={() => void handle(x, 0.95)}>{x}</button>
              ))}
            </div>
          )}
        </aside>
      )}

      {on && stage && (
        <Stage doc={stage} lang={listenLang} theme={host.theme ?? "dark"} busy={stageBusy} reading={reading} narrating={narrating} views={stageViews} pins={pins} geo={geo}
          tray={tray.map((d) => ({ incidentId: d.incidentId, title: d.title, to: d.to, sandbox: d.sandbox }))} brain={stageBrain} filtered={stageFilter} saveAsk={pendingB ? saveAsk : null}
          caption={{ heard: interim || heard, reply: phase === "listening" ? "" : reply, interim: !!interim,
            by: brain && phase !== "thinking" && phase !== "listening" ? (brain.by === "ai" ? `${ta ? "AI" : "Understood by AI"}${brain.model ? ` · ${brain.model.replace(/^.*\//, "").replace(/#\d+$/, "")}` : ""}${brain.ms ? ` · ${(brain.ms / 1000).toFixed(1)} s` : ""}` : brain.by === "instant" ? (ta ? "உடனடி" : "Instant, no model") : (ta ? "விதிகள்" : "Built-in rules")) : null }}
          a={stageActions} />
      )}

      {on && !stage && (
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
            <button type="button" onClick={() => { warmVoices(() => setPanel("voice")); setPanel(panel === "voice" ? null : "voice"); }} title={ta ? "குரலைத் தேர்ந்தெடு" : "Choose Thunai's voice"}>{ta ? "குரல் வகை" : "Voice"}</button>
            <button type="button" onClick={() => setPanel(panel === "help" ? null : "help")}>?</button>
            <button type="button" onClick={switchOff} title="Thunai off" aria-label="Thunai off">⏻</button>
          </div>
        </form>
      )}

      <button ref={orbRef} className={`th-orb ${phase}`} aria-label={orbLabel} title={orbLabel} aria-pressed={on}
        onClick={() => { if (!on) switchOn(); else if (narrating) stopNarration(); else if (phase === "listening") stopListen.current?.(); else startListening(); }}>
        <span className="core" />
        {phase === "listening" && <span className="mic" aria-label="Microphone on" />}
        {tray.length > 0 && <em className="count">{tray.length}</em>}
      </button>
    </div>,
    document.body
  );
}
