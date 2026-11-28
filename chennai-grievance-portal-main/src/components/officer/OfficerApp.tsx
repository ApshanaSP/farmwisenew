"use client";

/*
 * Department Officer console: one template for every department, built from the Collector console's own shell and parts so every
 * login has the same look (28 Nov 2026, the owner: "every tile, layout, icons, colour, style according to the new Collector console").
 * One page that scrolls, read top to bottom:
 *
 *   top bar        brand, the page's sections (Overview, Briefing, Work & insights), search, language, Menu (export, data collected,
 *                  contacts, theme, security), alerts, and the signed-in officer
 *   band           the day, the alert chip, the greeting and when the data was collected; period, zone and taluk; the four count
 *                  tiles and the department snapshot (head of department with phone and e-mail, deadlines, where most work is)
 *   map            the Collector's map, large, with "What needs you" beside it: by severity, and My work (to approve, in action,
 *                  reopened by the Collector)
 *   briefing       today at a glance for the department, then its news, the Collector's decisions, and the officer's office
 *   insights       complaint types against before, grievances across the period, open work by area, the store's data that concerns
 *                  the department
 *
 * The department is decided on the server from the signed-in account; there is no way to open another department or the Collector
 * console from here (the Collector signs in separately). Every figure comes from the unified district intelligence store. Ask District
 * IQ and Jarvis answer for this department only (the server locks them: lib/assistant/access.ts lockDept).
 */
import { LangSwitch, TopMenu } from "@/components/collector/app/TopMenu";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Wordmark } from "@/components/Logo";
import { I, type IconName } from "@/components/collector/app/icons";
import { AskIcon } from "@/components/collector/app/assistant/Brand";
import type { AssistantHost } from "@/components/collector/app/assistant/host";
import { ContactBody } from "@/components/collector/app/Overlays";
import { AlertBar } from "@/components/collector/app/AlertBar";
import { deptIcon, fmtDate, fmtDay, fmtTime, fmtWhen, fullTitle, rel, type Row } from "@/components/collector/app/lib";
import { esc } from "@/components/collector/app/SatMap";
import type { MapGeo } from "@/lib/collector/geo";
import type { DeptProfile } from "@/lib/officer/data";
import type { DeptBriefing, InsightModule, OfficerConsole } from "@/lib/officer/insights";
import { OFFICER } from "@/lib/officer/departments";
import { FEEDBACK_LABEL, STAGE_LABEL, TAB_LABEL, type FeedbackKind, type Stage, type Tab } from "@/lib/officer/stages";
import { DeptSnap, HeroKpis, MapCard } from "./Board";
import { BeforeRainStrip } from "./BeforeRainTasks";
import { OfficerBriefing } from "./Briefing";
import { AreaCard, ContactsCard, FeedbackCard, NewsCard, TrendCard, type NewsTab } from "./Cards";
import { GrievanceDrawer } from "./Drawer";
import { InsightsSection, ModuleFull } from "./Insights";
import { OfficerAttention, type WorkTab } from "./OfficerAttention";
import { FeedsBody, ListBody, Modal, NewsAll, isTestFeed } from "./Overlays";
import { SendReport } from "./Report";
import { PERIOD_KEYS, type Period } from "./format";
import "@/components/collector/app/tokens.css";
import "@/components/collector/app/collector.css";
import "@/components/collector/app/civic.css";
import "@/components/collector/app/marina.css";
import "@/components/collector/app/action.css";
import "@/components/collector/app/motionfx.css";
import "@/components/collector/app/overview-map.css";
import "@/components/collector/app/shell2.css";
import "@/components/collector/app/briefing.css";
import "@/components/collector/app/clear.css";
import "@/components/collector/app/dock.css";
import "./officer.css";
import "@/components/collector/app/pagescroll.css";
import { MotionConfig } from "motion/react";
import { PageTabs, Palette, ToastStack, greeting, type Hit } from "@/components/collector/app/Shell";
import { officerHits } from "./SearchHits";
import { LiveDot, SegmentedControl } from "@/components/ui";
import ConfirmHost from "@/components/security/Confirm";
const SecurityPanel = dynamic(() => import("@/components/security/SecurityPanel"), { ssr: false });

// Ask District IQ loads only when it is first opened, so the console stays fast.
const AssistantDialog = dynamic(() => import("@/components/collector/app/assistant/AssistantDialog"), { ssr: false });

/** laid out for a canvas this wide and scaled to the window like the Collector console; the page scrolls, so only the width is fitted */
const FIT_W = 1366;
/** the narrowest canvas the top bar and the two columns fit on */
const MIN_W = 1180;
/** the top bar and the dock's strip (dock.css --dock-h), in canvas pixels: what is left is the page's own height */
const CHROME_H = 64 + 46;

type SectionKey = "overview" | "briefing" | "insights";
const SECTIONS: { key: SectionKey; label: string; icon: IconName; id: string | null }[] = [
  { key: "overview", label: "Overview", icon: "grid", id: null },
  { key: "briefing", label: "Briefing", icon: "news", id: "ofc-brief" },
  { key: "insights", label: "Work & insights", icon: "chart", id: "ofc-ins" }
];
const PERIOD_WORD: Record<Period, string> = { daily: "Daily", weekly: "Weekly", monthly: "Monthly", quarterly: "Quarterly" };
const PERIOD_HINT: Record<Period, string> = {
  daily: "Daily: today, from 12 AM to now", weekly: "Weekly: the last 7 days", monthly: "Monthly: the last 30 days", quarterly: "Quarterly: the last 90 days"
};

interface Toast { id: number; msg: string; kind: "ok" | "alert"; act?: { label: string; run: () => void } }
export type ListFlag = "open" | "serious" | "overdue" | "due";
type ModalState = { kind: "send"; row: Row }
  | { kind: "list"; cat: string | null; flag?: ListFlag; sev?: string | null; tab?: string; label: string }
  | { kind: "module"; key: string } | { kind: "contacts" } | { kind: "news" } | { kind: "feeds" };

/** What the cards, drawer and overlays need from the shell. */
export interface Ctx {
  ov: OfficerConsole;
  dept: DeptProfile;
  /** "now" for relative times: the later of the pipeline's as-of time and the wall clock (IST) */
  now: string;
  fit: boolean;
  geo: MapGeo | null;
  zone: number | null;
  taluk: string | null;
  zoneName: string | null;
  talukName: string | null;
  /** the zone and / or taluk in view, e.g. "Adyar · Velachery taluk"; null for the whole district */
  areaName: string | null;
  /** period, zone and taluk as a query string, for the APIs */
  scopeQs: string;
  setZone: (z: number | null) => void;
  setTaluk: (t: string | null) => void;
  zoneTip: (z: number) => string;
  /** the grievance list of one stage, in a window (the page has no board of its own: My work shows the first rows) */
  setTab: (t: Tab) => void;
  fresh: string | null;
  busy: Set<string>;
  reloadKey: number;
  openGrievance: (id: string, mode?: "off" | "news") => void;
  openSend: (r: Row) => void;
  openList: (cat: string | null, label: string, flag?: ListFlag, more?: { sev?: string | null; tab?: string }) => void;
  /** My work on the page, at one of its lists (scrolls to it) */
  openWork: (w: WorkTab) => void;
  openContacts: () => void;
  /** the page's news card at one of its tabs (scrolls to it) */
  openNews: (tab?: NewsTab) => void;
  /** every news report about the department, in a window */
  openNewsAll: () => void;
  approve: (r: Row) => Promise<void>;
  /** the progress update on an approved case: work has started (the citizen's tracker shows In Progress) */
  startWork: (r: Row) => Promise<void>;
  toast: (msg: string, kind?: "ok" | "alert", act?: Toast["act"]) => void;
  closeAll: () => void;
}

async function api(path: string, body?: unknown) {
  const r = await fetch(path, body
    ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), cache: "no-store" }
    : { cache: "no-store" });
  const j = await r.json().catch(() => ({}));
  // (the development preview at /dev/officer has no sign-in: it stays on the page)
  if (r.status === 401 && !window.location.pathname.startsWith("/dev/")) { window.location.href = "/login?redirect=/officer"; throw new Error("Your session has ended. Sign in again."); }
  if (!r.ok) throw new Error(j.error || "Request failed.");
  return j;
}

/** Current IST wall-clock time as "YYYY-MM-DD HH:MM:SS", the format the store uses. */
const istNow = () => new Date(Date.now() + 5.5 * 3_600_000).toISOString().slice(0, 19).replace("T", " ");
/** "officer.gcc-swm@chennai.gov.in" -> "officer.gcc-swm": the name the officer signs in with, shown on the console */
const loginName = (email: string) => email.split("@")[0];
/** the page's scrolling body: the main around the band (on a phone the console itself scrolls) */
const scrollerOf = (band: HTMLElement | null) => band?.closest<HTMLElement>("main.body") ?? null;
const smooth = (): ScrollBehavior => (typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth");

export default function OfficerApp({ initial, user }: { initial: OfficerConsole; user: string }) {
  const dept = initial.dept;
  const [ov, setOv] = useState<OfficerConsole>(initial);
  const [period, setPeriodState] = useState<Period>(initial.period);
  const [zone, setZoneState] = useState<number | null>(null);
  const [taluk, setTalukState] = useState<string | null>(null);
  const [insights, setInsights] = useState<InsightModule[] | null>(null);
  const [insightsError, setInsightsError] = useState<string | null>(null);
  const [insightsRetry, setInsightsRetry] = useState(0);
  /** today's briefing for the department, with the scope it answers (undefined while it loads, null when there is none) */
  const [brief, setBrief] = useState<{ key: string; d: DeptBriefing | null } | null>(null);
  const [briefFailed, setBriefFailed] = useState<string | null>(null);
  const [briefRetry, setBriefRetry] = useState(0);
  const [geo, setGeo] = useState<MapGeo | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [drawer, setDrawer] = useState<{ id: string; mode: "off" | "news" } | null>(null);
  const [modal, setModal] = useState<ModalState | null>(null);
  const [pop, setPop] = useState<"bell" | "profile" | "menu" | null>(null);
  /** Menu → Security: recent sign-ins, check an email's reference */
  const [secOpen, setSecOpen] = useState(false);
  const [ask, setAskState] = useState(false);
  // the Collector console's theme switch and saved choice (light by default)
  // null until mounted, so the first paint follows <html data-theme> (set before paint)
  const [theme, setTheme] = useState<"dark" | "light" | null>(null);
  useEffect(() => { try { setTheme(localStorage.getItem("diq-theme") === "dark" ? "dark" : "light"); } catch { setTheme("light"); } }, []);
  const toggleTheme = () => setTheme((t) => {
    const n = t === "dark" ? "light" : "dark";
    try { localStorage.setItem("diq-theme", n); } catch { /* not saved */ }
    document.documentElement.dataset.theme = n;
    return n;
  });
  const [palette, setPalette] = useState(false);
  const [boot, setBoot] = useState(true);
  useEffect(() => { const t = setTimeout(() => setBoot(false), 1400); return () => clearTimeout(t); }, []);
  // once opened, the assistant stays mounted so the conversation survives closing it
  const [askMounted, setAskMounted] = useState(false);
  const setAsk = useCallback((v: boolean | ((x: boolean) => boolean)) => {
    setAskState((x) => {
      const next = typeof v === "function" ? v(x) : v;
      if (next) setAskMounted(true);
      return next;
    });
  }, []);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [fresh, setFresh] = useState<string | null>(null);
  // starts at the store's as-of time so the server and browser render the same text; the wall clock takes over after mount
  const [clock, setClock] = useState(initial.now);
  const [seen, setSeen] = useState<string>("");
  const [fit, setFit] = useState<{ on: boolean; z: number; w: number; h: number }>({ on: true, z: 1, w: FIT_W, h: 680 });
  /** the section in view (the top bar's tabs follow the scroll) */
  const [section, setSection] = useState<SectionKey>("overview");
  /** My work's list asked for from outside the card (a count tile, a key point, the palette) */
  const [want, setWant] = useState<{ work: WorkTab; seq: number } | null>(null);
  const [newsTab, setNewsTab] = useState<NewsTab>("news");
  const firstOv = useRef(true);
  const dirty = useRef(false);
  /** the band; the page's scrolling body is the main around it (found from it, so the main keeps the Collector's own markup) */
  const bandRef = useRef<HTMLElement>(null);
  const pulse = useRef({ newCount: -1, exportedAt: initial.exportedAt, lastDecision: null as string | null, updatedAt: initial.updated.at });
  const seenKey = `diq-officer-seen:${user}:${dept.code}`;

  // Fit to the window like the Collector console: laid out for a 1366-wide canvas and scaled (never below 0.8, so words stay readable;
  // the canvas widens instead); the page scrolls, so the height is not fitted. Phones stack in one column instead.
  useLayoutEffect(() => {
    const f = () => {
      const w = window.innerWidth, h = window.innerHeight;
      const on = w >= 700 && h >= 380;
      const raw = w / FIT_W;
      // never below 0.8 (the words stay readable), unless the canvas would be narrower than MIN_W: then it is MIN_W wide
      const z = on ? Math.min(Math.max(0.8, Math.min(1.3, raw > 1 && raw < 1.08 ? 1 : raw)), w / MIN_W) : 1;
      setFit({ on, z: Math.round(z * 1000) / 1000, w, h });
    };
    f();
    try { setSeen(localStorage.getItem(seenKey) ?? ""); } catch { /* storage unavailable */ }
    window.addEventListener("resize", f);
    return () => window.removeEventListener("resize", f);
  }, [seenKey]);

  useEffect(() => {
    fetch("/api/officer/geo").then((r) => (r.ok ? r.json() : null)).then((g) => g && setGeo(g)).catch(() => {});
    setClock(istNow());
    const t = setInterval(() => setClock(istNow()), 30_000);
    return () => clearInterval(t);
  }, []);

  const toast = useCallback((msg: string, kind: "ok" | "alert" = "ok", act?: Toast["act"]) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, msg, kind, act }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === "alert" ? 7000 : 3600);
  }, []);

  const scopeQs = useMemo(() => {
    const p = new URLSearchParams({ period });
    if (zone) p.set("zone", String(zone));
    if (taluk) p.set("taluk", taluk);
    return p.toString();
  }, [period, zone, taluk]);

  // --------------------------------------------------------------- data --
  useEffect(() => {
    if (firstOv.current) { firstOv.current = false; return; }
    let live = true;
    setLoading(true);
    api(`/api/officer/overview?${scopeQs}`)
      .then((j) => live && setOv(j))
      .catch((e) => live && toast(e.message, "alert"))
      .finally(() => live && setLoading(false));
    return () => { live = false; };
  }, [scopeQs, reloadKey, toast]);

  // the department's data from the store (Work & insights)
  useEffect(() => {
    let live = true;
    setInsightsError(null);
    api(`/api/officer/insights?${scopeQs}`)
      .then((j) => live && setInsights(j.modules))
      .catch((e) => live && setInsightsError(e.message));
    return () => { live = false; };
  }, [scopeQs, reloadKey, insightsRetry]);

  // today's briefing (the Collector's figures for the department): after the page has drawn, so it never slows the first screen
  useEffect(() => {
    let live = true;
    setBriefFailed(null);
    const t = setTimeout(() => {
      api(`/api/officer/insights?part=briefing&${scopeQs}`)
        .then((j) => live && setBrief({ key: scopeQs, d: (j.briefing ?? null) as DeptBriefing | null }))
        .catch(() => live && setBriefFailed(scopeQs));
    }, 300);
    return () => { live = false; clearTimeout(t); };
  }, [scopeQs, reloadKey, briefRetry]);
  const briefing = brief?.key === scopeQs ? brief.d : undefined;
  const briefDown = briefing === undefined && briefFailed === scopeQs;

  // New grievances, Collector decisions, new pipeline builds and a changed IMD warning (read live every 10 minutes,
  // lib/live/imd.ts): checked every OFFICER.pollMs (20 s).
  const isBusy = () => !!(drawer || modal || (document.activeElement && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)));
  const lastWarn = useRef<number | null>(null);
  // The check reads this render's state through a ref and the timer is made once: with a timer re-made on every
  // render, the 30 s clock re-rendered the console before the check was due, so it never ran.
  const pollTick = useRef<() => Promise<void>>(async () => {});
  pollTick.current = async () => {
      try {
        const m = await api("/api/officer/overview?meta=1");
        const was = pulse.current;
        let changed = m.exportedAt !== was.exportedAt;
        const warn = typeof m.live?.imdV === "number" ? m.live.imdV as number : null;
        if (warn != null && lastWarn.current != null && warn !== lastWarn.current && !changed) {
          toast(`Live update: ${m.live.imdNote || "the IMD warning for Chennai changed"}.`, "alert");
          changed = true;
        }
        if (warn != null) lastWarn.current = warn;
        if (was.newCount >= 0 && m.newCount > was.newCount) {
          const k = m.newCount - was.newCount;
          toast(`${k} new grievance${k === 1 ? "" : "s"} for ${dept.short} waiting for your approval.`, "alert", { label: "View", run: () => openWork("new") });
          changed = true;
        }
        if (was.lastDecision && m.lastDecision && m.lastDecision !== was.lastDecision) {
          // a decision on a report, or an escalation of one of the department's cases (both are under the bell and "From the Collector")
          toast("The Collector has acted on one of your cases. See the alerts bell.", "alert");
          changed = true;
        }
        if (m.updatedAt && m.updatedAt !== was.updatedAt) {
          toast(`New data collected (${fmtTime(m.updatedAt)}).`);
          changed = true;
        }
        pulse.current = { newCount: m.newCount, exportedAt: m.exportedAt, lastDecision: m.lastDecision, updatedAt: m.updatedAt };
        if (changed) {
          if (isBusy()) dirty.current = true;
          else setReloadKey((k) => k + 1);
        }
      } catch { /* offline: try again at the next check */ }
  };
  useEffect(() => {
    void pollTick.current(); // learn the live version at once, so the first change after opening is shown
    const t = setInterval(() => { void pollTick.current(); }, OFFICER.pollMs);
    return () => clearInterval(t);
  }, []);

  // -------------------------------------------------- the page's sections --
  /** scroll to a section (the band for the Overview); on a phone the console itself scrolls, on a wider window its body does */
  const goSection = useCallback((k: SectionKey) => {
    const s = SECTIONS.find((x) => x.key === k);
    setSection(k);
    if (!s?.id) {
      const el = scrollerOf(bandRef.current);
      el?.scrollTo({ top: 0, behavior: smooth() });
      el?.closest(".dic")?.scrollTo({ top: 0, behavior: smooth() });
      return;
    }
    document.getElementById(s.id)?.scrollIntoView({ behavior: smooth(), block: "start" });
  }, []);
  // the tab of the section whose heading has passed the upper third of the view
  useEffect(() => {
    const el = scrollerOf(bandRef.current), root = el?.closest(".dic");
    if (!el || !root) return;
    let raf = 0;
    const f = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const box = (fit.on ? el : root).getBoundingClientRect();
        let at: SectionKey = "overview";
        for (const s of SECTIONS) {
          const h = s.id ? document.getElementById(s.id) : null;
          if (h && h.getBoundingClientRect().top - box.top < box.height * 0.35) at = s.key;
        }
        // scrolled to the end: the last section, even when its heading cannot reach the upper third
        const sc = fit.on ? el : (root as HTMLElement);
        if (sc.scrollTop > 0 && sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 4) at = SECTIONS[SECTIONS.length - 1].key;
        setSection(at);
      });
    };
    el.addEventListener("scroll", f, { passive: true });
    root.addEventListener("scroll", f, { passive: true });
    return () => { cancelAnimationFrame(raf); el.removeEventListener("scroll", f); root.removeEventListener("scroll", f); };
  }, [fit.on]);

  // ---------------------------------------------------------- navigation --
  const closeAll = useCallback(() => {
    setDrawer(null);
    setModal(null);
    if (dirty.current) { dirty.current = false; setReloadKey((k) => k + 1); }
  }, []);
  const openWork = useCallback((w: WorkTab) => {
    setDrawer(null); setModal(null);
    setWant((x) => ({ work: w, seq: (x?.seq ?? 0) + 1 }));
    setTimeout(() => document.getElementById("ofc-needs")?.scrollIntoView({ behavior: smooth(), block: "nearest" }), 30);
  }, []);
  const openNews = useCallback((tab: NewsTab = "news") => {
    setDrawer(null); setModal(null);
    setNewsTab(tab);
    setTimeout(() => document.getElementById("ofc-news")?.scrollIntoView({ behavior: smooth(), block: "nearest" }), 30);
  }, []);
  const zoneName = zone ? ov.zones.find((z) => z.zone === zone)?.name ?? `Zone ${zone}` : null;
  const talukName = taluk ? ov.taluks.find((t) => t.code === taluk)?.name ?? taluk : null;
  const areaName = [zoneName, talukName ? `${talukName} taluk` : null].filter(Boolean).join(" · ") || null;
  const talukOptions = zone ? ov.taluks.filter((t) => ov.zones.find((z) => z.zone === zone)?.taluks.includes(t.code)) : ov.taluks;
  const setPeriod = (p: Period) => setPeriodState(p);
  const setZone = (z: number | null) => {
    setZoneState(z);
    // keep the taluk only if it lies in the new zone
    if (z && taluk && !ov.zones.find((x) => x.zone === z)?.taluks.includes(taluk)) setTalukState(null);
    closeAll();
    const name = z ? ov.zones.find((x) => x.zone === z)?.name : null;
    if (z && name) toast(`Showing ${name} zone. All panels filtered.`);
  };
  const setTaluk = (t: string | null) => {
    setTalukState(t);
    closeAll();
    const name = t ? ov.taluks.find((x) => x.code === t)?.name : null;
    if (t && name) toast(`Showing ${name} taluk. All panels filtered.`);
  };

  // ------------------------------------------------------------- actions --
  const markBusy = (id: string, on: boolean) => setBusyIds((b) => { const n = new Set(b); if (on) n.add(id); else n.delete(id); return n; });
  const approve = async (r: Row) => {
    markBusy(r.id, true);
    try {
      await api(`/api/officer/grievances/${encodeURIComponent(r.id)}`, { step: "approve" });
      setFresh(r.id);
      toast(`Approved: ${r.type}${r.zone_name ? `, ${r.zone_name}` : ""}. It is now In action; complete and send it when the work is done.`);
      setReloadKey((k) => k + 1);
    } catch (e: any) {
      toast(e.message, "alert");
      setReloadKey((k) => k + 1);
    } finally {
      markBusy(r.id, false);
    }
  };

  const startWork = async (r: Row) => {
    markBusy(r.id, true);
    try {
      await api(`/api/officer/grievances/${encodeURIComponent(r.id)}`, { step: "action" });
      setFresh(r.id);
      toast(`Work started: ${r.type}${r.zone_name ? `, ${r.zone_name}` : ""}. The citizen's tracker now shows it In Progress.`);
      setReloadKey((k) => k + 1);
    } catch (e: any) {
      toast(e.message, "alert");
      setReloadKey((k) => k + 1);
    } finally {
      markBusy(r.id, false);
    }
  };

  /** The PDF report of what is on screen: this period, this area, with the department's insights. */
  const exportPdf = async () => {
    if (exporting) return;
    setExporting(true);
    toast("Preparing the PDF report…");
    try {
      const qs = (t: Tab) => { const p = new URLSearchParams(scopeQs); p.set("tab", t); p.set("per", "15"); return p.toString(); };
      // read everything afresh so the report matches the store at the moment of export
      const [latest, a, b, ins, { buildOfficerReport }] = await Promise.all([
        api(`/api/officer/overview?${scopeQs}`), api(`/api/officer/grievances?${qs("new")}`), api(`/api/officer/grievances?${qs("action")}`),
        api(`/api/officer/insights?${scopeQs}`), import("./reportPdf")
      ]);
      setOv(latest);
      const stamp = String(latest.now).slice(0, 10);
      buildOfficerReport({
        ov: latest, area: areaName, waiting: [...a.rows, ...b.rows].slice(0, 25), modules: ins.modules,
        file: `${dept.code.toLowerCase()}-officer-report-${period}-${stamp}.pdf`
      });
      toast("PDF report downloaded.");
    } catch (e: any) {
      toast(e.message || "Could not build the PDF.", "alert");
    } finally {
      setExporting(false);
    }
  };

  const openList: Ctx["openList"] = (cat, label, flag, more) => { setDrawer(null); setModal({ kind: "list", cat, label, flag, sev: more?.sev ?? null, tab: more?.tab }); };
  const c: Ctx = {
    ov, dept, now: clock > ov.now ? clock : ov.now, fit: fit.on, geo, zone, taluk, zoneName, talukName, areaName, scopeQs, setZone, setTaluk,
    zoneTip: (z) => {
      const name = ov.zones.find((x) => x.zone === z)?.name ?? `Zone ${z}`;
      const n = ov.board.map.zoneCounts[z] ?? 0;
      return `<b>${esc(name)}</b>${n} incident${n === 1 ? "" : "s"}<br><span style="opacity:.7">Click to ${zone === z ? "keep" : "filter to"} this zone</span><br>`;
    },
    setTab: (t) => openList(null, TAB_LABEL[t] ?? t, undefined, { tab: t }),
    fresh, busy: busyIds, reloadKey,
    openGrievance: (id, mode = "off") => { setModal(null); setDrawer({ id, mode }); },
    openSend: (r) => { setDrawer(null); setModal({ kind: "send", row: r }); },
    openList, openWork, openNews,
    openContacts: () => { setDrawer(null); setModal({ kind: "contacts" }); },
    openNewsAll: () => { setDrawer(null); setModal({ kind: "news" }); },
    approve, startWork, toast, closeAll
  };

  // ----------------------------------------------------------- keyboard --
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = /INPUT|TEXTAREA|SELECT/.test((document.activeElement as HTMLElement)?.tagName);
      // Ctrl+K opens the assistant, as on the Collector console
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setAsk(true);
        return;
      }
      if (e.key === "Escape") {
        // the palette and the assistant sit above everything else, so they close first
        if (palette) setPalette(false);
        else if (ask) setAsk(false);
        else if (drawer || modal) closeAll();
        setPop(null);
      }
      if (e.key === "/" && !typing) {
        e.preventDefault();
        setPalette(true);
      }
      // PageUp / PageDown move between the page's sections, as they turn the Collector's pages
      if (!typing && !drawer && !modal && !ask && (e.key === "PageDown" || e.key === "PageUp")) {
        e.preventDefault();
        const k = SECTIONS.findIndex((s) => s.key === section) + (e.key === "PageDown" ? 1 : -1);
        if (SECTIONS[k]) goSection(SECTIONS[k].key);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawer, modal, ask, palette, closeAll, setAsk, section, goSection]);

  const unreadDecisions = ov.feedback.filter((f) => !seen || String(f.at) > seen);
  const unreadAlerts = (ov.board.bell as Row[]).filter((i) => !seen || String(i.t) > seen);
  const markRead = () => {
    const latest = [String(ov.feedback[0]?.at ?? ""), ...(ov.board.bell as Row[]).map((i) => String(i.t)), istNow()].sort().slice(-1)[0];
    setSeen(latest);
    try { localStorage.setItem(seenKey, latest); } catch { /* not saved in this browser */ }
  };
  // generated departmental feeds (source_health.kind "synthetic") are test data, never live
  const feedsOk = ov.feeds.filter((f) => (f.status === "ok" || f.status === "degraded") && !isTestFeed(f)).length;
  const me = loginName(user);
  const initials = dept.short.replace(/[^A-Za-z]/g, "").slice(0, 2).toUpperCase();
  const openModule = (key: string) => { setDrawer(null); setModal({ kind: "module", key }); };
  const moduleOpen = modal?.kind === "module" ? insights?.find((m) => m.key === modal.key) ?? null : null;
  const snap = ov.board.snapshot as Row;

  // Ask District IQ over this console: the department is fixed (the server locks an officer's answers to it)
  const host: AssistantHost = {
    period, periodLabel: ov.periodInfo.label, zone, zoneName, dept: dept.code, deptName: dept.name, cat: null, taluk,
    talukName: (code) => (code ? ov.taluks.find((t) => t.code === code)?.name ?? code : null),
    geo, setZone, setTaluk, setPeriod,
    setDept: () => undefined, setCat: () => undefined, openStories: () => undefined, setPage: () => undefined,
    openInc: (id) => c.openGrievance(id),
    officer: {
      who: { en: `${dept.short} officer`, ta: `${dept.short} அலுவலர் அவர்களே`, tanglish: `${dept.short} officer` },
      examples: {
        en: ["Summarize this week", "Show open complaints this week", "Which areas have the most complaints?", "Severe incidents this week"],
        ta: ["இந்த வாரம் எத்தனை புகார்கள்?", "இந்த வாரம் கடுமையான சம்பவங்கள்", "எந்த மண்டலத்தில் அதிக சம்பவங்கள்?", "இந்த மாதம் எத்தனை சம்பவங்கள்?"],
        tanglish: ["Indha week summary", "Show open complaints this week", "Endha area la neraya complaints?", "Indha week severe incidents evlo?"]
      },
      labels: {
        en: ["This week", "Open grievances", "Where to send teams", "Severe incidents"],
        ta: ["இந்த வாரம்", "கடுமையான சம்பவங்கள்", "மண்டலங்கள்", "இந்த மாதம்"],
        tanglish: ["Indha week", "Open grievances", "Enga team anuppanum", "Severe incidents"]
      }
    }
  };

  const modalTitle = !modal ? "" : modal.kind === "send" ? (modal.row.sev === "Severe" ? "Completion report to the Collector" : "Completion report · close as done or send for approval")
    : modal.kind === "module" ? `${moduleOpen?.title ?? "Department data"} · ${areaName ?? dept.name}`
      : modal.kind === "contacts" ? `${dept.name} · contacts`
        : modal.kind === "news" ? `${dept.short} in the news · ${ov.periodInfo.label}`
          : modal.kind === "feeds" ? "Data collected"
            : `${modal.label} · ${areaName ?? dept.name}`;

  const menu = [
    { key: "export", icon: (exporting ? "refresh" : "download") as IconName, label: "Export PDF report", sub: "This period and area, with your department's insights", run: exportPdf },
    { key: "data", icon: "sensor" as IconName, label: "Data collected", sub: "When each feed was last collected", run: () => setModal({ kind: "feeds" }) },
    { key: "contacts", icon: "phone" as IconName, label: "Department contacts", sub: "Head of department and officials", run: c.openContacts },
    { key: "news", icon: "news" as IconName, label: `${dept.short} in the news`, sub: "Every news report of this period", run: c.openNewsAll },
    { key: "theme", icon: (theme === "dark" ? "sun" : "moon") as IconName, label: theme === "dark" ? "Light mode" : "Dark mode", sub: theme === "dark" ? "Bright, for daylight" : "Easy on the eyes at night", run: toggleTheme },
    { key: "sec", icon: "shield" as IconName, label: "Security", sub: "Sign-ins, sessions, check an email from the Collector", run: () => setSecOpen(true) },
    { key: "reload", icon: "refresh" as IconName, label: "Reload data", sub: "Fetch the latest from the store", run: () => setReloadKey((k) => k + 1) }
  ];
  const actions: Hit[] = [
    ...SECTIONS.map((s, k) => ({ g: "Go to", ic: s.icon, l: `Go to ${s.label}`, s: `Section ${k + 1}`, run: () => goSection(s.key) })),
    { g: "Go to", ic: "tasks", l: "New grievances: approve", s: "My work · To approve", run: () => openWork("new") },
    { g: "Go to", ic: "refresh", l: "Reopened by the Collector", s: "My work · Reopened", run: () => openWork("returned") },
    { g: "Go to", ic: "send", l: "Sent to the Collector", s: "The list of reports waiting for the Collector", run: () => c.setTab("sent") },
    { g: "Actions", ic: "chat", l: "Ask District IQ", s: `Answers about ${dept.short} only`, kbd: "Ctrl K", run: () => setAsk(true) },
    ...menu.map((m) => ({ g: "Actions", ic: m.icon, l: m.label, s: m.sub, run: m.run }))
  ];
  /** the department's grievances (the last 90 days, or the dates searched), its cases' news and its readings of any date (SearchHits.ts, 28 Nov) */
  const searchHits = (q: string): Promise<Hit[]> =>
    officerHits(q, { api, deptCode: dept.code, now: c.now, openGrievance: c.openGrievance, openModule, openNewsAll: c.openNewsAll });
  const askWith = (q: string) => {
    setAsk(true);
    [60, 900].forEach((ms) => setTimeout(() => window.dispatchEvent(new CustomEvent("diq:ask", { detail: q })), ms));
  };
  const appStyle = fit.on
    ? { zoom: fit.z, width: fit.w / fit.z, height: fit.h / fit.z, ["--z" as string]: fit.z, ["--ofc-vh" as string]: `${Math.round(fit.h / fit.z - CHROME_H)}px` }
    : undefined;

  return (
    <MotionConfig reducedMotion="user">
    <div className={`dic ofc${fit.on ? " fit" : ""}${fit.on && fit.w / fit.z < 1300 ? " narrow" : ""}${boot ? " boot" : ""}`} data-theme={theme ?? undefined}
      onClick={(e) => { if (!(e.target as HTMLElement).closest(".pop") && !(e.target as HTMLElement).closest("[data-pop]")) setPop(null); }}>
      <ConfirmHost />
      {secOpen && <SecurityPanel onClose={() => setSecOpen(false)} />}
      <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
        <defs><linearGradient id="gBar" x1="0" x2="0" y1="0" y2="1"><stop offset="0" style={{ stopColor: "var(--accent)" }} /><stop offset="1" style={{ stopColor: "var(--accent-line)" }} /></linearGradient></defs>
      </svg>
      {(loading || exporting) && <div className="loading-bar" />}
      <div className="app" style={appStyle}>
        <header className="top">
          <div className="tbrand"><Wordmark className="twm" /><small className="tsub">Officer · {dept.short}</small></div>
          <PageTabs items={SECTIONS.map((s) => ({ key: s.key, label: s.label, icon: s.icon }))} active={section} onPick={(k) => goSection(k as SectionKey)} />
          <span className="tspace" />
          <button className="cmdk" onClick={() => setPalette(true)} aria-label="Search and commands (/)" aria-haspopup="dialog">
            <I n="search" /><span>Search</span><kbd>/</kbd>
          </button>
          <LangSwitch />
          <TopMenu open={pop === "menu"} onToggle={() => setPop((p) => (p === "menu" ? null : "menu"))} dashboards={false}
            title="Export, data collected, contacts, theme, security and language" items={menu} />
          <OfficerBell open={pop === "bell"} onToggle={() => setPop((p) => (p === "bell" ? null : "bell"))} ov={ov} now={c.now} seen={seen}
            unread={unreadDecisions.length + unreadAlerts.length} onMarkRead={() => { markRead(); setPop(null); }}
            onPick={(id) => { setPop(null); c.openGrievance(id); }} />
          <div className="rel">
            <button className="me ome" data-pop onClick={() => setPop((p) => (p === "profile" ? null : "profile"))}
              title={`Signed in as ${user}`} aria-expanded={pop === "profile"}>
              <span className="avatar" aria-hidden="true">{initials}</span>
              <span className="who"><small>Logged in as</small><b>{me}</b></span><I n="chevd" />
            </button>
            {pop === "profile" && (
              <div className="pop" style={{ width: 320 }}>
                <div className="pop-me"><span className="avatar">{initials}</span><span><b>{me}</b><small>Department officer · {dept.short}</small></span></div>
                <div style={{ padding: "0 10px 8px", color: "var(--text-3)", fontSize: 12.5, lineHeight: 1.5 }}>
                  Logged in as <b style={{ color: "var(--text-2)" }}>{user}</b><br />{dept.name}{dept.org ? `, ${dept.org}` : ""}
                  {dept.route ? <><br />Department head / escalation: {dept.route}</> : null}
                </div>
                <button className="pop-i" onClick={() => { setPop(null); setSecOpen(true); }}><I n="shield" /><span><b>Security</b><small>Sign-ins, sessions, check an email from the Collector</small></span></button>
                <button className="pop-i" onClick={() => { setPop(null); c.openContacts(); }}><I n="phone" /><span><b>Department contacts</b><small>Head of department and officials</small></span></button>
                <button className="pop-i" onClick={() => { setPop(null); setReloadKey((k) => k + 1); }}><I n="refresh" /><span><b>Reload data</b><small>Fetch the latest from the store</small></span></button>
                {(zone || taluk) && <button className="pop-i" onClick={() => { setPop(null); setZone(null); setTaluk(null); }}><I n="home" /><span><b>Clear the area filter</b><small>Every zone and taluk</small></span></button>}
                <button className="pop-i" onClick={async () => { await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined); window.location.href = "/login"; }}>
                  <I n="user" /><span><b>Sign out</b></span>
                </button>
              </div>
            )}
          </div>
        </header>

        <main className="body">
          {/* the green band, as on the Collector's Overview: the day, alerts, the greeting and the data; the filters; the counts and the
              department snapshot. The department is fixed (the signed-in officer's) */}
          <section className="band hero" ref={bandRef}>
            <div className="band-row">
              <div className="band-t">
                <div className="band-eb">
                  <span>{fmtDay(ov.now)}</span>
                  <AlertBar now={ov.now} compact src="/api/officer/insights?part=alerts" />
                </div>
                <div className="band-h1">
                  <h1 className="roll ofc-hi"><span><span>{greeting(ov.now)}</span>, <span translate="no">{dept.short}</span> <span>officer</span></span></h1>
                  <Collected ov={ov} live={feedsOk} onClick={() => setModal({ kind: "feeds" })} />
                </div>
              </div>
              <div className="filters" role="group" aria-label="Filters">
                <SegmentedControl label="Period" size="sm" value={period} onChange={(p) => setPeriod(p)}
                  options={PERIOD_KEYS.map((p) => ({ value: p, label: PERIOD_WORD[p], title: PERIOD_HINT[p] }))} />
                <label className="fsel" title="Zone (Greater Chennai Corporation)"><I n="pin" />
                  <select value={zone ?? ""} onChange={(e) => setZone(e.target.value ? Number(e.target.value) : null)} aria-label="Zone">
                    <option value="">All 15 zones</option>
                    {ov.zones.map((z) => <option key={z.zone} value={z.zone}>{z.name}</option>)}
                  </select>
                </label>
                <label className="fsel" title={zone ? `Revenue taluks in ${zoneName} zone` : "Revenue taluk"}><I n="map" />
                  <select value={taluk ?? ""} onChange={(e) => setTaluk(e.target.value || null)} aria-label="Taluk">
                    <option value="">{zone ? `All taluks in ${zoneName}` : "All taluks"}</option>
                    {talukOptions.map((t) => <option key={t.code} value={t.code}>{t.name}</option>)}
                  </select>
                </label>
                {(zone || taluk) && <button className="fclear" onClick={() => { setZone(null); setTaluk(null); }}>Clear</button>}
              </div>
              {/* the department is fixed: it is the signed-in officer's */}
              <span className="odept-badge" title={`${dept.name}: your department (fixed for this account)`}><I n={deptIcon(dept.code)} />{dept.short}</span>
            </div>
            <div className="hero-b">
              <HeroKpis c={c} />
              <div className="hsnap"><DeptSnap c={c} /></div>
            </div>
          </section>

          {/* Rain Rehearsal: the jobs the Collector sent before a heavy rain (only while there are some) */}
          <BeforeRainStrip />

          {/* the map leads, large; what needs the officer beside it, full height */}
          <section className="p1 ofc-main">
            <MapCard c={c} />
            <article className="card a-sev att" id="ofc-needs"><OfficerAttention c={c} want={want} /></article>
            {/* the news beside them, as on the Collector's Overview (map, what needs you, news in one screen) */}
            <NewsCard c={c} gaps={briefing} gapsFailed={briefDown} tab={newsTab} setTab={setNewsTab} />
          </section>

          <div className="ofc-h" id="ofc-brief">
            <I n="news" /><h2>Today&apos;s briefing</h2><small>{dept.short} · {ov.periodInfo.label}{areaName ? ` · ${areaName}` : ""}</small>
          </div>
          <OfficerBriefing c={c} b={briefing} failed={briefDown} retry={() => setBriefRetry((n) => n + 1)} />
          <section className="ofc-row ofc-brief2">
            <FeedbackCard c={c} unread={new Set(unreadDecisions.map((f) => f.did))} />
            <ContactsCard c={c} user={user} />
          </section>

          <InsightsSection c={c} modules={insights} failed={insightsError} retry={() => setInsightsRetry((n) => n + 1)} openModule={openModule}
            trend={<TrendCard c={c} />} area={<AreaCard c={c} />} />
        </main>

        {(drawer || modal) && <div className="scrim" onClick={closeAll} />}
        {drawer && <GrievanceDrawer id={drawer.id} mode={drawer.mode} c={c} onMode={(m) => setDrawer({ id: drawer.id, mode: m })} />}
        {modal && (
          <Modal narrow={modal.kind === "send" || modal.kind === "contacts" || modal.kind === "feeds"} title={modalTitle} onClose={closeAll}>
            {modal.kind === "send" ? (
              <SendReport row={modal.row} c={c} onSent={(step) => {
                const r = modal.row;
                toast(step === "send" ? `Sent to the Collector for ${r.sev === "Severe" ? "verification" : "approval"}: ${r.type}.` : `Closed as done by your department: ${r.type}.`);
                setFresh(r.id);
                setModal(null);
                setDrawer({ id: r.id, mode: "off" });
                setReloadKey((k) => k + 1);
              }} />
            ) : modal.kind === "module" ? (moduleOpen ? <ModuleFull m={moduleOpen} c={c} /> : <div className="o-state">This data is no longer in view.</div>)
              : modal.kind === "contacts" ? <ContactBody dept={{ ...(snap.dept as Row ?? {}), code: dept.code, name: dept.name }} contacts={(snap.contacts as Row[] | undefined) ?? []} />
                : modal.kind === "news" ? <NewsAll c={c} />
                  : modal.kind === "feeds" ? <FeedsBody c={c} />
                    : <ListBody c={c} cat={modal.cat} flag={modal.flag} sev={modal.sev} tab={modal.tab} />}
          </Modal>
        )}
        <Palette open={palette} onClose={() => setPalette(false)} actions={actions} search={searchHits} ask={askWith} />
        <ToastStack toasts={toasts} dismiss={(id) => setToasts((x) => x.filter((y) => y.id !== id))} />
        {/* the dock: Ask District IQ at the bottom right (dock.css). 28 Nov, the owner: no Jarvis on the department officer console */}
        <div className="cdock" role="group" aria-label="Ask District IQ">
          {!ask && (
            <button className="ask-fab ask-fab-v2" onClick={() => setAsk(true)} aria-keyshortcuts="Control+K" title={`Ask District IQ: type a question about ${dept.short} (Ctrl+K)`}>
              <i className="ask-ico"><AskIcon size={18} /></i>
              <span className="ask-label">Ask District IQ<kbd aria-hidden="true" data-t="Ctrl K" /></span>
            </button>
          )}
        </div>
        {askMounted && <AssistantDialog c={host} open={ask} onClose={() => setAsk(false)} />}
      </div>
    </div>
    </MotionConfig>
  );
}

/** Are the feeds current? The same chip as the Collector console's; it opens Data collected. */
function Collected({ ov, live, onClick }: { ov: OfficerConsole; live: number; onClick: () => void }) {
  const s = ov.board.collection;
  const all = !!s && s.total > 0 && s.missing.length === 0;
  const head = s?.lastRun ? `Collected ${fmtWhen(s.lastRun, ov.now)}` : "Collected hourly";
  const sub = s && !all ? `${s.done.length} of ${s.total} feeds current · ${live}/${ov.feeds.length} live` : `Data as of ${fmtTime(ov.now)}, ${fmtDate(ov.now)}`;
  const tip = "The district intelligence pipeline collects its real feeds hourly; generated department feeds are test data and are not counted live." +
    (s?.missing.length ? ` Behind: ${s.missing.join(", ")}.` : "") + " Click for the data collected.";
  return (
    <button key={ov.exportedAt} className={`daily${s && !all ? " pend" : ""}`} title={tip} onClick={onClick}>
      <LiveDot state={s && !all ? "warn" : "ok"} /><span>{head}<small>{sub}</small></span>
    </button>
  );
}

/**
 * The alerts bell, the Collector's bell for the officer: the Collector's decisions on the department's cases (verified, returned,
 * rejected, escalated), then the department's severe and high incidents of the period. A "new" mark until Mark all read.
 */
function OfficerBell({ open, onToggle, ov, now, seen, unread, onMarkRead, onPick }: {
  open: boolean; onToggle: () => void; ov: OfficerConsole; now: string; seen: string; unread: number; onMarkRead: () => void; onPick: (id: string) => void;
}) {
  const alerts = (ov.board.bell as Row[]).slice(0, 8);
  const isNew = (t: unknown) => !seen || String(t) > seen;
  return (
    <div className="rel">
      <button className="tbtn icon" data-pop onClick={onToggle} aria-label={unread > 0 ? `Alerts, ${unread} new` : "Alerts"} aria-expanded={open}>
        <I n="bell" />{unread > 0 && <span className="dot-n" aria-hidden="true">{unread > 99 ? "99+" : unread}</span>}
      </button>
      {open && (
        <div className="pop bellpop ofc-bell" data-pop>
          <div className="pop-h"><span>Alerts<small>{ov.dept.short} · {ov.periodInfo.label}</small></span><button className="lnk" onClick={onMarkRead}>Mark all read</button></div>
          <div className="pop-g">The Collector&apos;s decisions</div>
          {ov.feedback.length ? ov.feedback.slice(0, 6).map((f) => (
            <button key={f.did} className="pop-i" onClick={() => onPick(f.id)}>
              <span className={`bell-dot ${f.ok ? "" : "s-high"}`} style={f.ok ? { background: "var(--ok)" } : undefined} aria-hidden="true" />
              <span><b>{FEEDBACK_LABEL[f.kind as FeedbackKind] ?? f.decision}: {f.title ?? f.type}</b>
                <small>{rel(f.at, now)}{isNew(f.at) ? " · new" : ""}</small></span>
            </button>
          )) : <div className="empty">No decisions in this period.</div>}
          <div className="pop-g">Severe and high · {ov.periodInfo.label.toLowerCase()}</div>
          {alerts.length ? alerts.map((i) => (
            <button key={i.id} className="pop-i" onClick={() => onPick(String(i.id))}>
              <span className={`bell-dot s-${String(i.sev).toLowerCase()}`} aria-hidden="true" />
              <span><b>{fullTitle(i)}</b><small>{[i.zone_name ?? "Chennai", i.sev, rel(i.t, now)].join(" · ")}{isNew(i.t) ? " · new" : ""}</small></span>
            </button>
          )) : <div className="empty">No severe or high incidents.</div>}
        </div>
      )}
    </div>
  );
}
