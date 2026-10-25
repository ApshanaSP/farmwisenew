"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import type { AssistantHost } from "@/components/collector/app/assistant/host";
import fixtures from "./fixtures.json";
import "@/components/collector/app/tokens.css";
import "@/components/collector/app/collector.css";
import "@/components/collector/app/civic.css";
import "@/components/collector/app/marina.css";
import "@/components/collector/app/news.css";
import "@/components/collector/app/action.css";
import "@/components/collector/app/analysis.css";
import "@/components/collector/app/nearby.css";
import "@/components/collector/app/motionfx.css";

const AssistantDialog = dynamic(() => import("@/components/collector/app/assistant/AssistantDialog"), { ssr: false });
const SESSION = "00000000-0000-4000-8000-000000000001";
const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } });

/** The panel's requests answered from the fixtures: the panel itself is the real one. */
function mockFetch(empty: boolean) {
  const real = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (!url.includes("/api/collector/assistant/")) return real(input, init);
    if (url.includes("/status")) return json({ asOf: "2026-10-15 07:57:00", feedsOk: 8, feedsTotal: 8, ai: { available: true } });
    if (url.includes("/insights")) return json({ items: [
      { key: "a", kind: "attention", title: "Anna Nagar needs attention", finding: "3 severe and 6 high incidents in the last 24 hours, the most of any zone.", question: "which zone needs my attention today and why?" },
      { key: "b", kind: "pattern", title: "Street lights up 41% in Teynampet", finding: "45 more reports than the period before; 82 linked to rain.", question: "why is Teynampet high?" }] });
    if (url.includes("/pins")) return json({ pins: [{ id: 1, title: "Severe incidents this week", question: "severe incidents this week" }] });
    if (url.match(/\/sessions\/[0-9a-f-]{36}/)) return json(empty ? { messages: [] } : fixtures);
    if (url.includes("/sessions")) return json({ sessions: [
      { id: SESSION, title: "Why is Teynampet high?", updated_at: "2026-10-15T07:57:00", questions: 8 },
      { id: "00000000-0000-4000-8000-000000000002", title: "Road accidents this week", updated_at: "2026-10-14T18:10:00", questions: 3 }] });
    return json({ ok: true });
  };
}

export default function Preview() {
  const [ready, setReady] = useState(false);
  // read after mounting: the server render has no query string
  const [theme, setTheme] = useState("light");
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    setTheme(q.get("theme") ?? "light");
  }, []);
  useEffect(() => {
    if (ready) return;
    const empty = new URLSearchParams(window.location.search).get("empty") === "1";
    mockFetch(empty);
    try { if (empty) localStorage.removeItem("diq-assistant-session"); else localStorage.setItem("diq-assistant-session", SESSION); } catch { /* storage blocked */ }
    setReady(true);
  }, [ready]);
  const host: AssistantHost = {
    period: "daily", periodLabel: "Today", zone: null, zoneName: null, dept: null, deptName: null, cat: null, taluk: null, talukName: () => null, geo: null,
    setZone: () => {}, setDept: () => {}, setTaluk: () => {}, setCat: () => {}, setPeriod: () => {}, openInc: () => {}, openStories: () => {}, setPage: () => {}
  };
  return (
    <div className="dic" data-theme={theme} style={{ minHeight: "100dvh", background: "var(--bg)" }} ref={(el) => { if (el) document.documentElement.setAttribute("data-theme", theme); }}>
      <div style={{ padding: 24, color: "var(--text-3)", font: "500 13px var(--dic-sans), sans-serif" }}>Console behind the panel (preview)</div>
      {ready && <AssistantDialog c={host} open onClose={() => {}} />}
    </div>
  );
}
