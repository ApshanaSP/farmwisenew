"use client";

import { useEffect, useState, type RefObject } from "react";
import type { RunEvent } from "@/lib/studio/types";

export async function api<T = any>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  let r: Response;
  try {
    r = await fetch(path, init?.json !== undefined
      ? { ...init, method: init.method ?? "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(init.json) }
      : init);
  } catch { throw new Error(OFFLINE); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || "Request failed.");
  return j as T;
}

/** A streamed run: each NDJSON line is handed to `on` as it arrives. Throws the server's error for a refused request. */
const OFFLINE = "The District IQ server is not answering (it may have stopped or restarted). Start it again, reload the page and retry.";

export async function runStream(path: string, init: RequestInit, on: (e: RunEvent) => void): Promise<void> {
  let r: Response;
  try { r = await fetch(path, init); } catch { throw new Error(OFFLINE); }
  if (!r.ok || !r.body) {
    const j = await r.json().catch(() => ({}));
    throw new Error(j.error || `The request failed (HTTP ${r.status}).`);
  }
  const reader = r.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let got = false;
  for (;;) {
    let chunk: ReadableStreamReadResult<Uint8Array>;
    try { chunk = await reader.read(); } catch { throw new Error(got ? "The connection to the server dropped while the file was being processed. Retry." : OFFLINE); }
    const { done, value } = chunk;
    got = true;
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (line) try { on(JSON.parse(line)); } catch { /* a broken line */ }
    }
  }
  if (buf.trim()) try { on(JSON.parse(buf)); } catch { /* ignore */ }
}

export interface Ink {
  text: string; text2: string; text3: string; grid: string; axis: string; surface: string; elev: string; line: string;
  accent: string; signal: string; sev: string; high: string; low: string; violet: string; teal: string; dark: boolean;
  viz: string[];
}

function read(el: Element): Ink {
  const cs = getComputedStyle(el);
  const v = (k: string, d: string) => cs.getPropertyValue(k).trim() || d;
  const dark = (el.closest(".dic") as HTMLElement | null)?.dataset.theme !== "light";
  return {
    text: v("--text", "#F1F5F9"), text2: v("--text-2", "#B6C2D4"), text3: v("--text-3", "#8492A9"), grid: v("--viz-grid", "rgba(148,163,184,.08)"),
    axis: v("--viz-axis", "rgba(148,163,184,.18)"), surface: v("--surface", "#0D1322"), elev: v("--elev", "#0F1628"), line: v("--line-3", "rgba(148,163,184,.24)"),
    accent: v("--accent", "#818CF8"), signal: v("--signal", "#38BDF8"), sev: v("--sev", "#FB7185"), high: v("--high", "#FBBF24"), low: v("--low", "#34D399"),
    violet: v("--violet", "#A5B4FC"), teal: v("--teal", "#38BDF8"), dark,
    viz: [v("--viz-1", "#818CF8"), v("--viz-2", "#38BDF8"), v("--viz-3", "#A78BFA"), v("--viz-4", "#FBBF24"), v("--viz-5", "#34D399"), v("--viz-6", "#FB7185")]
  };
}

/** The console's colours, re-read when the theme switches, so charts follow light and dark. */
export function useInk(ref: RefObject<HTMLElement>): Ink | null {
  const [ink, setInk] = useState<Ink | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setInk(read(el));
    const root = el.closest(".dic");
    if (!root) return;
    const mo = new MutationObserver(() => setInk(read(el)));
    mo.observe(root, { attributes: true, attributeFilter: ["data-theme"] });
    return () => mo.disconnect();
  }, [ref]);
  return ink;
}

export const reduced = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
