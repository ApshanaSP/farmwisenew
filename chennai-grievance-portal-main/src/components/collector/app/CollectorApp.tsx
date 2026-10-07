"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Overview as OverviewData, Period } from "@/lib/collector/intel";
import type { Insights } from "@/lib/collector/insights";
import type { MapGeo } from "@/lib/collector/geo";
import Logo from "@/components/Logo";
import { I, type IconName } from "./icons";
import { BrandMark } from "./assistant/Brand";
import { EnvPage, HeroBody, Page1 } from "./Overview";
import { BriefingPage, GapsBody, PatternBody, TrendsPage, mdToHtml, type Pattern } from "./Insights";
import { IncidentView } from "./Detail";
import { BriefingBook } from "./BriefingBook";
import { ContactBody, DeptsBody, ExportBody, ListBody, Modal, NewsAllBody, ZonesBody } from "./Overlays";
import { SourcesBody } from "./Sources";
import { AddedAllBody, ItemBody } from "./Added";
import { StoriesBody } from "./Stories";
import { NewsView } from "./NewsPreview";
import type { Story } from "./Overview";
import { MarketsFull } from "./Insights";
import { CustomizeBody, DEFAULT_LAYOUT, WorkspaceBody, normalizeLayout, type Layout } from "./Workspace";
import { deptIcon, fmtDate, fmtDay, fmtShort, fmtTime, fmtWhen, fullTitle, ms, rel, type Row } from "./lib";
import { esc } from "./SatMap";
import "./tokens.css";
import "./collector.css";
import { MotionConfig } from "motion/react";
import { Bell, PageSwap, PageTabs, Palette, RollTitle, ToastStack, greeting, type Hit } from "./Shell";
import { SegmentedControl, FilterChip, LiveDot } from "@/components/ui";
import "./civic.css";
import "./marina.css";
import "./news.css";
import "./action.css";

// The assistant loads only when it is first opened, so the console stays fast.
const AssistantDialog = dynamic(() => import("./assistant/AssistantDialog"), { ssr: false });
// Page 5 (Data Studio) loads only when it is opened
const Studio = dynamic(() => import("./studio/Studio"), { ssr: false, loading: () => <div className="empty" style={{ margin: "auto" }}>Opening the Data Studio…</div> });

const PERIOD_KEYS: Period[] = ["daily", "weekly", "monthly", "quarterly"];
const PERIOD_WORD: Record<Period, string> = { daily: "Daily", weekly: "Weekly", monthly: "Monthly", quarterly: "Quarterly" };
const PERIOD_HINT: Record<Period, string> = {
  daily: "Daily: the last 24 hours, up to now", weekly: "Weekly: incidents reported in the last 7 days",
  monthly: "Monthly: incidents reported in the last 30 days", quarterly: "Quarterly: incidents reported in the last 90 days"
};
const FIT_W = 1366;
const FIT_H = 680;
export type PageKey = "overview" | "briefing" | "trends" | "environment" | "studio";
const PAGE_TITLE: Record<PageKey, string> = { overview: "Overview", briefing: "Briefing", trends: "Trends", environment: "Environment & markets", studio: "Data Studio" };

export type ListPreset = Partial<{ dept: string; sev: string; status: string; q: string; sort: string; dir: number; scope: string; cat: string; taluk: string;
  /** ignore the dashboard's zone filter (lists opened from the district-wide pages) */ anyZone: boolean }>;
export interface DeptNav { code: string; name: string; head?: string | null; open: number; n: number; severe: number; unverified: number }
type ModalState =
  | { kind: "list"; title: string; preset: ListPreset }
  | { kind: "zones" | "depts" | "export" | "news" | "workspace" | "customize"; title: string }
  | { kind: "sources"; title: string; tab?: "sources" | "add" | "ocr" | "audit" }
  | { kind: "contact"; title: string; dept: Row; contacts: Row[] }
  | { kind: "text"; title: string; md: string }
  | { kind: "item"; title: string; item: Row }
  | { kind: "story"; title: string; story: Story }
  | { kind: "added"; title: string }
  | { kind: "stories"; title: string; focus: string | null }
  | { kind: "markets"; title: string }
  | { kind: "pattern"; title: string; pattern: Pattern }
  | { kind: "gaps"; title: string };
interface Toast { id: number; msg: string; kind: "ok" | "alert"; act?: { label: string; run: () => void } }
export interface Archived { name: string; version: number; markdown: string; as_of: string; issued_at: string }

/** Everything the screens need from the shell: state, navigation and actions. */
export interface Console {
  dept: string | null;
  deptName: string | null;
  period: Period;
  periodLabel: string;
  zone: number | null;
  zoneName: string | null;
  /** category chosen from a chart; filters every panel */
  cat: string | null;
  setCat: (c: string | null) => void;
  /** taluk chosen from the map or the taluk ranking; filters every panel */
  taluk: string | null;
  setTaluk: (t: string | null) => void;
  now: string;
  depts: DeptNav[];
  geo: MapGeo | null;
  page: PageKey;
  setPage: (p: PageKey) => void;
  mapMode: "zones" | "taluks";
  setMapMode: (m: "zones" | "taluks") => void;
  /** incident highlighted on the map */
  focus: { id: string; lat: number; lon: number } | null;
  locate: (i: Row) => void;
  highlight: (i: Row) => void;
  layers: Record<string, boolean>;
  toggleLayer: (k: string) => void;
  sevTab: string | null;
  setSevTab: (s: string) => void;
  envSel: Record<string, string>;
  setEnvSel: (card: string, id: string) => void;
  busyIds: Set<string>;
  reloadKey: number;
  setAsk: (v: boolean) => void;
  setPeriod: (p: Period) => void;
  setDept: (code: string | null) => void;
  setZone: (z: number | null) => void;
  openInc: (id: string) => void;
  /** open a severe incident with Take action (the AI-drafted instruction to its department officer) */
  openAction: (id: string) => void;
  openList: (preset: ListPreset, title: string) => void;
  openNewsAll: () => void;
  /** a news story: its linked incident, or (news only) the story's reports in the news preview */
  openStory: (s: Story) => void;
  openZones: () => void;
  openDepts: () => void;
  openFeeds: () => void;
  openContact: (dept: Row, contacts: Row[]) => void;
  /** an item from a source the Collector added: its text, category, place and source link */
  openItem: (item: Row) => void;
  openAdded: () => void;
  openSources: (tab?: "sources" | "add" | "ocr" | "audit") => void;
  /** developing stories: reports about the same event, followed over time */
  openStories: (focus?: string | null) => void;
  openMarkets: () => void;
  /** an unusual spike or a recurring hotspot, with the incidents behind it */
  openPattern: (p: Pattern) => void;
  /** incidents seen only in the news, with no department record */
  openGaps: () => void;
  zoneTip: (z: number) => string;
  zoneNameOf: (z: number) => string | null;
  talukName: (code: string | null) => string | null;
  verify: (rows: Row[]) => Promise<boolean>;
  sendBack: (row: Row) => Promise<boolean>;
  toast: (msg: string, kind?: "ok" | "alert", act?: Toast["act"]) => void;
  closeAll: () => void;
  layout: Layout;
  setLayout: (l: Layout) => void;
  workspaceName: string | null;
  openWorkspace: () => void;
  saveWorkspace: (name: string) => Promise<number | null>;
  openSavedWorkspace: (id: number) => Promise<void>;
  archived: Archived | null;
  closeArchived: () => void;
  showText: (title: string, md: string) => void;
}

async function api(path: string, body?: unknown) {
  const r = await fetch(path, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : undefined);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || "Request failed.");
  return j;
}

function loadLayout(): Layout {
  try {
    const l = JSON.parse(localStorage.getItem("diq-layout") ?? "null");
    if (l?.pages && l?.panels && Array.isArray(l?.kpis)) return normalizeLayout(l);
  } catch { /* storage unavailable */ }
  return DEFAULT_LAYOUT;
}

export default function CollectorApp({ initial, allDepts, user }: {
  initial: OverviewData; allDepts: { code: string; name: string; head: string | null }[]; user: string;
}) {
  const [dept, setDeptState] = useState<string | null>(null);
  const [period, setPeriod] = useState<Period>("daily");
  const [zone, setZoneState] = useState<number | null>(null);
  const [cat, setCatState] = useState<string | null>(null);
  const [taluk, setTalukState] = useState<string | null>(null);
  const [page, setPageState] = useState<PageKey>("overview");
  const [ov, setOv] = useState<OverviewData>(initial);
  // the loaded part, with the query it answers: a page never shows another page's part while its own loads
  const [insState, setIns] = useState<{ key: string; d: Insights } | null>(null);
  const [geo, setGeo] = useState<MapGeo | null>(null);
  const [loading, setLoading] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [anim, setAnim] = useState(true);
  const [layers, setLayers] = useState<Record<string, boolean>>({ severe: true, complaint: true, other: true, added: true, stations: false });
  const [mapMode, setMapMode] = useState<"zones" | "taluks">("zones");
  const [focus, setFocus] = useState<Console["focus"]>(null);
  const [sevTab, setSevTab] = useState<string | null>(null);
  const [envSel, setEnvSelState] = useState<Record<string, string>>({ rain: "auto", aqi: "auto", lake: "auto" });
  const [inc, setInc] = useState<string | null>(null);
  /** the incident opened with Take action showing (from the By severity list) */
  const [actionFor, setActionFor] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalState | null>(null);
  const [pop, setPop] = useState<"bell" | "profile" | null>(null);
  const [bellRead, setBellRead] = useState(false);
  const [ask, setAskState] = useState(false);
  // once opened, the assistant stays mounted so the conversation survives closing it
  const [askMounted, setAskMounted] = useState(false);
  // today's insights count, for the launcher badge (loaded after the console, so it never slows it)
  const [insightCount, setInsightCount] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => {
      fetch("/api/collector/assistant/insights").then((r) => (r.ok ? r.json() : null)).then((j) => j && setInsightCount(j.items?.length ?? 0)).catch(() => {});
    }, 2500);
    return () => clearTimeout(t);
  }, []);
  const setAsk = useCallback((v: boolean | ((x: boolean) => boolean)) => {
    setAskState((x) => {
      const next = typeof v === "function" ? v(x) : v;
      if (next) setAskMounted(true);
      return next;
    });
  }, []);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [fit, setFit] = useState<{ on: boolean; z: number; w: number; h: number }>({ on: true, z: 1, w: 1366, h: 680 });
  const [layout, setLayoutState] = useState<Layout>(DEFAULT_LAYOUT);
  const [workspaceName, setWorkspaceName] = useState<string | null>(null);
  // light (Marina) by default; dark is the harbour at night. Remembered in this browser.
  // null until mounted: the first paint follows <html data-theme> (set before paint), so a dark-theme user never sees light
  const [theme, setTheme] = useState<"dark" | "light" | null>(null);
  useEffect(() => { try { setTheme(localStorage.getItem("diq-theme") === "dark" ? "dark" : "light"); } catch { setTheme("light"); } }, []);
  const toggleTheme = () => setTheme((t) => {
    const n = t === "dark" ? "light" : "dark";
    try { localStorage.setItem("diq-theme", n); } catch { /* not saved */ }
    document.documentElement.dataset.theme = n;
    return n;
  });
  const [palette, setPalette] = useState(false);
  /** direction of travel between pages (1 = next), so the new page slides in from that side */
  const [pageDir, setPageDir] = useState(1);
  /** the shell assembles once after sign-in: top bar, rail, then cards */
  const [boot, setBoot] = useState(true);
  useEffect(() => { const t = setTimeout(() => setBoot(false), 1400); return () => clearTimeout(t); }, []);
  const [archived, setArchived] = useState<Archived | null>(null);
  const firstLoad = useRef(true);
  const lastExport = useRef(initial.exportedAt);
  const dirty = useRef(false);

  // Fit to any screen: the console is laid out for a 1366 x 680 canvas and scaled to the
  // window (down on small laptops and tablets, up to 1.3x on large monitors), so nothing
  // ever scrolls. Phones in portrait are too narrow for four columns and stack instead.
  useLayoutEffect(() => {
    const f = () => {
      const w = window.innerWidth, h = window.innerHeight;
      const on = w >= 700 && h >= 380;
      const raw = Math.min(w / FIT_W, h / FIT_H);
      const z = on ? Math.max(0.5, Math.min(1.3, raw > 1 && raw < 1.08 ? 1 : raw)) : 1;
      setFit({ on, z: Math.round(z * 1000) / 1000, w, h });
    };
    f();
    setLayoutState(loadLayout());
    window.addEventListener("resize", f);
    return () => window.removeEventListener("resize", f);
  }, []);

  useEffect(() => {
    fetch("/api/collector/geo").then((r) => (r.ok ? r.json() : null)).then((g) => g && setGeo(g)).catch(() => {});
  }, []);

  const toast = useCallback((msg: string, kind: "ok" | "alert" = "ok", act?: Toast["act"]) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, msg, kind, act }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === "alert" ? 7000 : 3600);
  }, []);

  const qs = useMemo(() => {
    const p = new URLSearchParams({ period });
    if (zone) p.set("zone", String(zone));
    if (dept) p.set("dept", dept);
    if (cat) p.set("cat", cat);
    if (taluk) p.set("taluk", taluk);
    return p.toString();
  }, [period, zone, dept, cat, taluk]);

  // --------------------------------------------------------------- data --
  useEffect(() => {
    if (firstLoad.current && qs === "period=daily" && reloadKey === 0) {
      firstLoad.current = false;
      return;
    }
    let live = true;
    setLoading(true);
    api(`/api/collector/overview?${qs}`)
      .then((j) => live && setOv(j))
      .catch((e) => live && toast(e.message, "alert"))
      .finally(() => live && setLoading(false));
    return () => { live = false; };
  }, [qs, reloadKey, toast]);

  // briefing, trends and markets load when a page needs them, each only its own part (insights.ts InsightPart)
  // the news-only list opens from page 1's snapshot too, so it loads the briefing part when that modal is open
  const needIns = (page !== "overview" && page !== "studio") || modal?.kind === "gaps";
  const part = page === "trends" ? "trends" : page === "environment" ? "environment" : "briefing";
  // Trends and Environment & markets are district-wide: they ignore the zone, taluk and department filters
  const insQs = `${page === "trends" || page === "environment" ? `period=${period}` : qs}&part=${part}`;
  useEffect(() => {
    if (!needIns) return;
    let live = true;
    api(`/api/collector/insights?${insQs}`).then((j) => live && setIns({ key: insQs, d: j })).catch((e) => live && toast(e.message, "alert"));
    return () => { live = false; };
  }, [insQs, reloadKey, needIns, toast]);
  const ins = insState?.key === insQs ? insState.d : null;

  useEffect(() => {
    if (!anim) return;
    const t = setTimeout(() => setAnim(false), 1200);
    return () => clearTimeout(t);
  }, [anim, ov]);

  // New data from the pipeline: check every minute, refresh when nothing is open.
  const busy = () => !!(inc || modal || (document.activeElement && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)));
  useEffect(() => {
    const t = setInterval(async () => {
      try {
        const m = await api("/api/collector/overview?meta=1");
        if (m.exportedAt && m.exportedAt !== lastExport.current) {
          lastExport.current = m.exportedAt;
          setBellRead(false);
          toast(`New data from the pipeline (as of ${fmtTime(m.now)}).`, "alert", busy() ? { label: "Refresh", run: () => setReloadKey((k) => k + 1) } : undefined);
          if (busy()) dirty.current = true;
          else setReloadKey((k) => k + 1);
        }
      } catch { /* offline: try again next minute */ }
    }, 60_000);
    return () => clearInterval(t);
  });

  // --------------------------------------------------------- navigation --
  const closeAll = useCallback(() => {
    setInc(null);
    setModal(null);
    if (dirty.current) { dirty.current = false; setReloadKey((k) => k + 1); }
  }, []);
  const pages = (Object.keys(PAGE_TITLE) as PageKey[]).filter((k) => k === "overview" || layout.pages[k as keyof Layout["pages"]] !== false);
  const setPage = (p: PageKey) => {
    setPageDir(pages.indexOf(p) >= pages.indexOf(page) ? 1 : -1);
    setPageState(p);
    setAnim(true);
  };
  const setDept = (code: string | null) => {
    closeAll();
    setDeptState(code);
    const name = code ? allDepts.find((d) => d.code === code)?.name : null;
    if (name) toast(`Showing ${name} only. All panels filtered.`);
  };
  const setZone = (z: number | null) => {
    setZoneState(z);
    setEnvSelState({ rain: "auto", aqi: "auto", lake: "auto" });
    closeAll();
    const name = z ? ov.zoneTable.find((x) => x.zone === z)?.name : null;
    if (z && name) toast(`Showing ${name}. All panels filtered.`);
  };
  const talukName = (code: string | null) => (code ? geo?.taluks.find((t) => t.code === code)?.name ?? code : null);
  const catLabel = cat ? ins?.trends.weekly.lines.find((l) => l.cat === cat)?.label ?? cat.replace(/_/g, " ").toLowerCase() : null;
  const setCat = (c: string | null) => {
    setCatState(c);
    if (c) toast("Category filter applied to the map, lists, briefing and follow-ups.");
  };
  const setTaluk = (t: string | null) => {
    setTalukState(t);
    closeAll();
    if (t) toast(`Showing ${talukName(t)} taluk. All panels filtered.`);
  };

  const depts: DeptNav[] = useMemo(() => {
    const byCode = new Map(ov.deptNav.map((d) => [d.code, d]));
    return allDepts
      .map((d) => ({ code: d.code, name: d.name, head: d.head, open: 0, n: 0, severe: 0, unverified: 0, ...byCode.get(d.code) }))
      .sort((a, b) => b.open - a.open || a.name.localeCompare(b.name));
  }, [ov.deptNav, allDepts]);

  const zoneName = zone ? ov.zoneTable.find((z) => z.zone === zone)?.name ?? `Zone ${zone}` : null;
  const deptName = dept ? allDepts.find((d) => d.code === dept)?.name ?? dept : null;
  const scopeName = [zoneName, deptName, catLabel, taluk ? `${talukName(taluk)} taluk` : null].filter(Boolean).join(" · ") || "District-wide";

  // ------------------------------------------------------------ actions --
  const decide = async (rows: Row[], decision: string, note?: string) => {
    const ids = rows.map((r) => r.id);
    setBusyIds((s) => new Set([...s, ...ids]));
    try {
      await api("/api/collector/decisions", { incidentIds: ids, decision, note: note || null });
      const one = rows[0];
      const what = rows.length > 1 ? `${rows.length} complaints` : `${one.type}, ${one.zone_name ?? "Chennai"}`;
      toast(decision === "verify" ? `Verified: ${what}. The citizen will see it closed.` : `Sent back to ${one.dept_name ?? "the department"}: ${what}.`);
      setReloadKey((k) => k + 1);
      return true;
    } catch (e: any) {
      toast(e.message, "alert");
      return false;
    } finally {
      setBusyIds((s) => { const n = new Set(s); ids.forEach((x) => n.delete(x)); return n; });
    }
  };

  const setLayout = (l: Layout) => {
    setLayoutState(l);
    try { localStorage.setItem("diq-layout", JSON.stringify(l)); } catch { /* not saved in this browser */ }
    if (page !== "overview" && !l.pages[page as keyof Layout["pages"]]) setPage("overview");
  };

  const saveWorkspace = async (name: string) => {
    try {
      // the frozen copy is the briefing of the dashboard's filters (the loaded part may be trends or prices)
      const snap: Insights = ins?.book ? ins : await api(`/api/collector/insights?${qs}&part=briefing`);
      const r = await api("/api/collector/workspaces", {
        name,
        filters: { period, zone, dept, cat, taluk, page, zoneName, deptName, catLabel, talukName: talukName(taluk), layers, envSel },
        layout,
        briefing: { md: snap.briefing.md, facts: { headline: snap.briefing.headline, attention: snap.briefing.attention.map((a) => a.id), scope: snap.scope }, period, asOf: snap.now }
      });
      setWorkspaceName(name);
      toast(`Saved "${name}" as version ${r.version}, with a frozen copy of the briefing.`);
      return r.version as number;
    } catch (e: any) {
      toast(e.message, "alert");
      return null;
    }
  };

  const openSavedWorkspace = async (id: number) => {
    try {
      const w = await api(`/api/collector/workspaces/${id}`);
      const f = w.filters ?? {};
      setPeriod(f.period ?? "daily");
      setZoneState(f.zone ?? null);
      setDeptState(f.dept ?? null);
      setCatState(f.cat ?? null);
      setTalukState(f.taluk ?? null);
      if (f.layers) setLayers(f.layers);
      if (f.envSel) setEnvSelState(f.envSel);
      if (w.layout?.pages) setLayout(normalizeLayout(w.layout));
      setWorkspaceName(w.name);
      setArchived(w.briefing ? { name: w.name, version: w.version, markdown: w.briefing.markdown, as_of: w.briefing.as_of, issued_at: w.briefing.issued_at } : null);
      closeAll();
      setPage(w.briefing ? "briefing" : (f.page ?? "overview"));
      toast(`Opened "${w.name}" v${w.version} from ${fmtShort(w.created_at)}. Panels show live data; the Briefing shows the saved copy.`);
    } catch (e: any) {
      toast(e.message, "alert");
    }
  };

  const c: Console = {
    dept, deptName, period, periodLabel: ov.periodInfo.label, zone, zoneName, cat, setCat, taluk, setTaluk, now: ov.now, depts, geo, page, setPage,
    mapMode, setMapMode, focus,
    locate: (i) => {
      if (i.lat == null) { toast("This incident has no map location.", "alert"); return; }
      closeAll();
      setPage("overview");
      setFocus({ id: i.id, lat: Number(i.lat), lon: Number(i.lon) });
    },
    highlight: (i) => { if (i.lat != null) setFocus({ id: i.id, lat: Number(i.lat), lon: Number(i.lon) }); },
    layers, toggleLayer: (k) => setLayers((l) => ({ ...l, [k]: !l[k] })),
    sevTab, setSevTab,
    envSel, setEnvSel: (card, id) => setEnvSelState((m) => ({ ...m, [card]: id })),
    busyIds, reloadKey, setAsk,
    // a filter change does not replay entrances: the view cross-fades while loading and the numbers roll
    setPeriod: (p) => setPeriod(p),
    setDept, setZone,
    openInc: (id) => { setModal(null); setActionFor(null); setInc(id); },
    openAction: (id) => { setModal(null); setActionFor(id); setInc(id); },
    openList: (preset, title) => { setInc(null); setModal({ kind: "list", title: `${title} · ${scopeName}`, preset: { cat: cat ?? undefined, taluk: taluk ?? undefined, ...preset } }); },
    openNewsAll: () => setModal({ kind: "news", title: `Latest news · ${scopeName}` }),
    openStory: (s) => { if (s.incident) { setModal(null); setInc(s.incident); } else { setInc(null); setModal({ kind: "story", title: "In the news", story: s }); } },
    openZones: () => setModal({ kind: "zones", title: "Zones by open complaints" }),
    openDepts: () => setModal({ kind: "depts", title: "Departments" }),
    openFeeds: () => setModal({ kind: "sources", title: "Data sources" }),
    openContact: (d, contacts) => setModal({ kind: "contact", title: `${d.name} · official contacts`, dept: d, contacts }),
    openItem: (item) => { setInc(null); setModal({ kind: "item", title: `From an added source · ${item.source}`, item }); },
    openAdded: () => setModal({ kind: "added", title: `From added sources · ${scopeName}` }),
    openSources: (tab) => setModal({ kind: "sources", title: "Data sources", tab }),
    openStories: (focus = null) => setModal({ kind: "stories", title: `Developing stories · ${scopeName}`, focus }),
    openMarkets: () => setModal({ kind: "markets", title: "Mandi prices at Chennai markets" }),
    openPattern: (p) => setModal({ kind: "pattern", pattern: p,
      title: p.kind === "spike" ? "Unusual spike: what happened" : p.kind === "hotspot" ? "Recurring hotspot: what keeps happening" : "Is this problem rising?" }),
    openGaps: () => setModal({ kind: "gaps", title: `In the news, not in department records · ${scopeName}` }),
    zoneTip: (z) => {
      const r = ov.zoneTable.find((x) => x.zone === z);
      if (!r) return `<b>Zone ${z}</b>`;
      return `<b>${esc(r.name)}</b>${r.open} open · ${r.severe} severe · ${r.complaints} complaints<br><span style="opacity:.7">Click to ${zone === z ? "keep" : "filter to"} this zone</span><br>`;
    },
    talukName,
    zoneNameOf: (z) => ov.zoneTable.find((x) => x.zone === z)?.name ?? null,
    verify: (rows) => decide(rows, "verify"),
    sendBack: (row) => decide([row], "reopen", "Sent back to the department: the Collector did not accept the reported action."),
    toast, closeAll,
    layout, setLayout, workspaceName,
    openWorkspace: () => setModal({ kind: "workspace", title: "Workspaces" }),
    saveWorkspace, openSavedWorkspace, archived, closeArchived: () => setArchived(null),
    showText: (title, md) => setModal({ kind: "text", title, md })
  };

  // --------------------------------------------------------- keyboard --
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = /INPUT|TEXTAREA|SELECT/.test((document.activeElement as HTMLElement)?.tagName);
      // Ctrl+K opens the assistant
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setAsk(true);
        return;
      }
      if (e.key === "Escape") {
        // the assistant sits above everything else, so it closes first
        if (palette) setPalette(false);
        else if (ask) setAsk(false);
        else if (inc || modal) closeAll();
        setPop(null);
      }
      if (e.key === "/" && !typing) {
        e.preventDefault();
        setPalette(true);
      }
      if (!typing && !inc && !modal && (e.key === "PageDown" || e.key === "PageUp")) {
        e.preventDefault();
        const k = pages.indexOf(page) + (e.key === "PageDown" ? 1 : -1);
        if (pages[k]) setPage(pages[k]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [inc, modal, ask, palette, closeAll, page, pages]); // eslint-disable-line react-hooks/exhaustive-deps

  const bellN = bellRead ? 0 : ov.bell.length;
  // a degraded feed still delivered today's data (some of its endpoints are blocked), so it counts as live
  const feedsOk = ov.feeds.filter((f) => f.status === "ok" || f.status === "degraded").length;
  const feedsPartial = ov.feeds.filter((f) => f.status === "degraded").map((f) => String(f.source).toUpperCase());
  const districtWide = page === "environment" || page === "trends";
  const clearFilters = () => { setDept(null); setZone(null); setCatState(null); setTalukState(null); };
  const openExport = () => setModal({ kind: "export", title: "Export report" });
  const openCustomize = () => setModal({ kind: "customize", title: "Customize the dashboard" });
  const askWith = (q: string) => {
    setAsk(true);
    // the assistant loads on first open, so hand the question over once it is listening
    [60, 900].forEach((ms) => setTimeout(() => window.dispatchEvent(new CustomEvent("diq:ask", { detail: q })), ms));
  };

  const actions: Hit[] = [
    ...pages.map((p) => ({ g: "Go to", ic: PAGE_ICON[p], l: `Go to ${PAGE_TITLE[p]}`, s: `Page ${pages.indexOf(p) + 1}`, run: () => setPage(p) })),
    { g: "Actions", ic: "chat", l: "Ask District IQ", s: "The assistant, in English, Tamil or Tanglish", kbd: "Ctrl K", run: () => setAsk(true) },
    { g: "Actions", ic: "download", l: "Export report", s: "PDF report or CSV action list", run: openExport },
    { g: "Actions", ic: "sensor", l: "Open data sources", s: "Feeds, OCR upload, audit log", run: c.openFeeds },
    { g: "Actions", ic: "layers", l: "Workspaces", s: "Save or reopen a view", run: c.openWorkspace },
    { g: "Actions", ic: "sliders", l: "Customize the dashboard", run: openCustomize },
    { g: "Actions", ic: theme === "dark" ? "sun" : "moon", l: `Switch to ${theme === "dark" ? "light" : "dark"} theme`, run: toggleTheme },
    { g: "Actions", ic: "refresh", l: "Reload data", s: "Fetch the latest from the store", run: () => setReloadKey((k) => k + 1) },
    ...(zone || dept || cat || taluk ? [{ g: "Actions", ic: "x" as IconName, l: "Clear all filters", s: scopeName, run: clearFilters }] : [])
  ];
  const searchHits = async (q: string): Promise<Hit[]> => {
    const r = await api(`/api/collector/search?q=${encodeURIComponent(q)}`);
    const out: Hit[] = [];
    r.zones.forEach((z: Row) => out.push({ g: "Zones", ic: "pin", l: z.name, s: `${z.open} open incidents`, run: () => c.setZone(z.zone) }));
    r.depts.forEach((d: Row) => out.push({ g: "Departments", ic: deptIcon(d.code), l: d.name, s: d.org, run: () => c.setDept(d.code) }));
    r.incidents.forEach((i: Row) => out.push({ g: "Incidents", ic: deptIcon(i.dept), l: fullTitle(i), s: `${i.zone_name ?? "Chennai"} · ${rel(i.t, ov.now)}`, run: () => c.openInc(i.id) }));
    return out;
  };

  return (
    <MotionConfig reducedMotion="user">
    <div className={`dic${fit.on ? " fit" : ""}${boot ? " boot" : ""}`} data-theme={theme ?? undefined}
      onClick={(e) => { if (!(e.target as HTMLElement).closest(".pop") && !(e.target as HTMLElement).closest("[data-pop]")) setPop(null); }}>
      <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
        <defs><linearGradient id="gBar" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#0B7290" /><stop offset="1" stopColor="#7FD3E6" /></linearGradient></defs>
      </svg>
      {loading && <div className="loading-bar" />}
      <div className="app" style={fit.on ? { zoom: fit.z, width: fit.w / fit.z, height: fit.h / fit.z } : undefined}>
        <header className="top">
          <div className="tbrand"><Logo className="tlogo" /><span><b>District IQ</b><small>Chennai · Collector</small></span></div>
          <PageTabs items={pages.map((p) => ({ key: p, label: TAB_LABEL[p], icon: PAGE_ICON[p] }))} active={page} onPick={(p) => setPage(p as PageKey)} />
          <span className="tspace" />
          <button className="cmdk" onClick={() => setPalette(true)} aria-label="Search and commands (/)" aria-haspopup="dialog">
            <I n="search" /><span>Search</span><kbd>/</kbd>
          </button>
          <button className="tbtn icon" onClick={openExport} title="Export report: PDF or CSV action list" aria-label="Export report"><I n="download" /></button>
          <button className={`tbtn icon${workspaceName ? " on" : ""}`} onClick={c.openWorkspace} title={workspaceName ? `Workspace: ${workspaceName}` : "Save or reopen a workspace"} aria-label="Workspaces"><I n="layers" /></button>
          <button className="tbtn icon" onClick={openCustomize} title="Choose what the dashboard shows" aria-label="Customize"><I n="sliders" /></button>
          <button className="tbtn icon theme-t" onClick={toggleTheme} title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"} aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}>
            <span key={theme ?? "l"} className="theme-ic"><I n={theme === "dark" ? "sun" : "moon"} /></span>
          </button>
          <Bell open={pop === "bell"} onToggle={() => setPop((p) => (p === "bell" ? null : "bell"))} unread={bellN} nowMs={ms(ov.now)}
            onPick={(id) => { setPop(null); c.openInc(id); }} onMarkRead={() => { setBellRead(true); setPop(null); }}
            items={ov.bell.map((i) => ({ id: i.id, title: fullTitle(i), sub: `${i.zone_name ?? "Chennai"} · ${i.sev} · ${rel(i.t, ov.now)}`, sev: String(i.sev), t: ms(i.t), icon: deptIcon(i.dept) }))} />
          <div className="rel">
            <button className="me" data-pop onClick={() => setPop((p) => (p === "profile" ? null : "profile"))} aria-label="Account" aria-expanded={pop === "profile"}>
              <span className="avatar">CO</span><I n="chevd" />
            </button>
            {pop === "profile" && (
              <div className="pop" style={{ width: 300 }}>
                <div className="pop-me"><span className="avatar">CO</span><span><b>Collector&apos;s Office</b><small>District Collector, Chennai</small></span></div>
                <div style={{ padding: "0 10px 8px", color: "var(--text-3)", fontSize: 12.5 }}>
                  Logged in as <b style={{ color: "var(--text-2)" }}>{user}</b>. Figures come from the district intelligence store, as of {fmtTime(ov.now)}.
                </div>
                <button className="pop-i" onClick={() => { setPop(null); c.openFeeds(); }}><I n="sensor" /><span><b>Data sources</b><small>Feeds, added sources, OCR upload</small></span></button>
                <button className="pop-i" onClick={() => { setPop(null); setModal({ kind: "sources", title: "Data sources", tab: "audit" }); }}><I n="doc" /><span><b>Audit log</b><small>Every decision and change</small></span></button>
                <button className="pop-i" onClick={() => { setPop(null); setReloadKey((k) => k + 1); }}><I n="refresh" /><span><b>Reload data</b><small>Fetch the latest from the store</small></span></button>
                <button className="pop-i" onClick={() => { setPop(null); clearFilters(); }}><I n="home" /><span><b>Clear all filters</b><small>Whole district, every department</small></span></button>
                <button className="pop-i" onClick={async () => { await fetch("/api/auth/logout", { method: "POST" }); window.location.href = "/login"; }}>
                  <I n="user" /><span><b>Sign out</b></span>
                </button>
              </div>
            )}
          </div>
        </header>

        <div className="body">
          {/* the ocean band: when, which data, the page (on page 1 the greeting, key points and counts) and the filters */}
          <section className={`band${page === "overview" ? " hero" : ""}`}>
            <div className="band-row">
              <div className="band-t">
                <div className="band-eb">
                  <span>{fmtDay(ov.now)}</span>
                  <Collected ov={ov} onClick={c.openFeeds} live={feedsOk} partial={feedsPartial} />
                </div>
                <RollTitle text={page === "overview" ? `${greeting(ov.now)}, Collector` : PAGE_TITLE[page]} />
              </div>
              {page === "studio" ? (
                <span className="fnote" title="Your own files and links: AI reads, cleans, maps and links them with the district. Not affected by the dashboard filters.">
                  <I n="spark" />Your files · not filtered
                </span>
              ) : districtWide ? (
                <span className="fnote" title={page === "trends" ? "Whole district, not filtered. Click any row to see what is behind it." : "Whole district: choose a station on each card. Prices are shown per Chennai market."}>
                  <I n="map" />District-wide · not filtered
                </span>
              ) : (
                // every filter in one group, in the order the Collector narrows down: when, where, which department
                <div className="filters" role="group" aria-label="Filters">
                  <SegmentedControl label="Period" size="sm" value={period} onChange={(p) => setPeriod(p)}
                    options={PERIOD_KEYS.map((p) => ({ value: p, label: PERIOD_WORD[p], title: PERIOD_HINT[p] }))} />
                  <label className="fsel" title="Zone (Greater Chennai Corporation)"><I n="pin" />
                    <select value={zone ?? ""} onChange={(e) => setZone(e.target.value ? Number(e.target.value) : null)} aria-label="Zone">
                      <option value="">All 15 zones</option>
                      {ov.zoneTable.map((z) => <option key={z.zone} value={z.zone}>{z.name}</option>)}
                    </select>
                  </label>
                  <label className="fsel" title="Revenue taluk"><I n="map" />
                    <select value={taluk ?? ""} onChange={(e) => setTaluk(e.target.value || null)} aria-label="Taluk">
                      <option value="">All taluks</option>
                      {[...(geo?.taluks ?? [])].sort((a, b) => a.name.localeCompare(b.name)).map((t) => <option key={t.code} value={t.code}>{t.name}</option>)}
                    </select>
                  </label>
                  <label className="fsel" title="Department"><I n="gov" />
                    <select value={dept ?? ""} onChange={(e) => setDept(e.target.value || null)} aria-label="Department">
                      <option value="">All departments</option>
                      {depts.map((d) => <option key={d.code} value={d.code}>{d.name}{d.open && d.code !== dept ? ` (${d.open} open)` : ""}</option>)}
                    </select>
                  </label>
                  {cat && <FilterChip onRemove={() => setCat(null)} removeLabel="Clear category">{catLabel}</FilterChip>}
                  {(zone || dept || cat || taluk) && <button className="fclear" onClick={clearFilters}>Clear</button>}
                </div>
              )}
            </div>
            {page === "overview" && <HeroBody d={ov} c={c} />}
          </section>
          <PageSwap k={page} dir={pageDir} className={`${anim ? "anim" : ""}${loading ? " busy" : ""}`}>
            {page === "overview" ? <Page1 d={ov} c={c} />
              : page === "briefing" ? (archived || !ins?.book ? <BriefingPage ins={ins} d={ov} c={c} /> : <BriefingBook ins={ins} d={ov} c={c} />)
                : page === "trends" ? <TrendsPage ins={ins} c={c} />
                  : page === "studio" ? <Studio c={c} />
                    : <EnvPage d={ov} ins={ins} c={c} />}
          </PageSwap>
        </div>

        {(inc || modal) && <div className="scrim" onClick={closeAll} />}
        {inc && <IncidentView key={inc} id={inc} c={c} startAction={actionFor === inc} />}
        {modal?.kind === "story" && <NewsView key={modal.story.id} s={modal.story} c={c} />}
        {modal && modal.kind !== "story" && (
          <Modal title={modal.title} c={c} narrow={["depts", "zones", "customize", "item"].includes(modal.kind)} wide={["stories", "markets", "pattern", "story"].includes(modal.kind)}>
            {modal.kind === "list" ? <ListBody key={modal.title} preset={modal.preset} c={c} />
              : modal.kind === "zones" ? <ZonesBody d={ov} c={c} />
                : modal.kind === "depts" ? <DeptsBody c={c} />
                  : modal.kind === "sources" ? <SourcesBody c={c} initial={modal.tab} />
                    : modal.kind === "export" ? <ExportBody c={c} />
                      : modal.kind === "news" ? <NewsAllBody d={ov} c={c} />
                        : modal.kind === "workspace" ? <WorkspaceBody c={c} />
                          : modal.kind === "customize" ? <CustomizeBody c={c} />
                            : modal.kind === "contact" ? <ContactBody dept={modal.dept} contacts={modal.contacts} />
                              : modal.kind === "text" ? <div className="md" dangerouslySetInnerHTML={{ __html: mdToHtml(modal.md) }} />
                                : modal.kind === "item" ? <ItemBody item={modal.item} c={c} />
                                  : modal.kind === "added" ? <AddedAllBody d={ov} c={c} />
                                    : modal.kind === "stories" ? <StoriesBody d={ov} c={c} focus={modal.focus} />
                                      : modal.kind === "markets" ? <MarketsFull ins={ins} c={c} />
                                        : modal.kind === "pattern" ? <PatternBody key={JSON.stringify(modal.pattern)} p={modal.pattern} c={c} />
                                          : modal.kind === "gaps" ? <GapsBody ins={ins} c={c} /> : null}
          </Modal>
        )}
        <Palette open={palette} onClose={() => setPalette(false)} actions={actions} search={searchHits} ask={askWith} />
        <ToastStack toasts={toasts} dismiss={(id) => setToasts((x) => x.filter((y) => y.id !== id))} />
        <button className="ask-fab" onClick={() => setAsk((v) => !v)} aria-label="Ask District IQ (Ctrl+K)" title="Ask District IQ (Ctrl+K)" aria-expanded={ask}>
          <BrandMark size={30} className="ask-mark" /><span>Ask District IQ</span>
          {insightCount > 0 && !ask && <em className="ask-badge" aria-label={`${insightCount} insights for today`}>{insightCount}</em>}
        </button>
        {askMounted && <AssistantDialog c={c} open={ask} onClose={() => setAsk(false)} />}
      </div>
    </div>
    </MotionConfig>
  );
}

const PAGE_ICON: Record<PageKey, IconName> = { overview: "grid", briefing: "news", trends: "line", environment: "leaf", studio: "spark" };
const TAB_LABEL: Record<PageKey, string> = { overview: "Overview", briefing: "Briefing", trends: "Trends", environment: "Environment", studio: "Data Studio" };

/** Are the feeds current? The collection time always leads; a feed behind turns the chip orange. Pulses once on new data. */
function Collected({ ov, onClick, live, partial }: { ov: OverviewData; onClick: () => void; live: number; partial: string[] }) {
  const s = ov.collection;
  const all = !!s && s.total > 0 && s.missing.length === 0;
  // the time the data was collected always leads; how many feeds are current goes on the second line
  const head = s?.lastRun ? `Collected ${fmtWhen(s.lastRun, ov.now)}` : "Collected hourly";
  const sub = s && !all ? `${s.done.length} of ${s.total} feeds current · ${live}/${ov.feeds.length} live` : `Data as of ${fmtTime(ov.now)}, ${fmtDate(ov.now)}`;
  const tip = "Every source is collected hourly (CPCB air quality while the PC is on)." +
    (s?.lastRun ? ` Last collection: ${fmtTime(s.lastRun)}, ${fmtDate(s.lastRun)}.` : "") +
    (s ? (s.missing.length ? ` Behind: ${s.missing.join(", ")}.` : " All feeds current.") : "") +
    ` ${live} of ${ov.feeds.length} feeds live.` + (partial.length ? ` Partly available (some endpoints blocked): ${partial.join(", ")}.` : "") +
    " Click for the data sources: status, refresh, OCR, audit log.";
  return (
    <button key={ov.exportedAt} className={`daily${s && !all ? " pend" : ""}`} title={tip} onClick={onClick}>
      <LiveDot state={s && !all ? "warn" : "ok"} /><span>{head}<small>{sub}</small></span>
    </button>
  );
}
