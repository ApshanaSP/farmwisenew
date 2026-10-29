/**
 * Thunai's eyes and fingers on the page: the visible controls (like an accessibility snapshot: role + accessible name),
 * the control a step changes (for the ghost pointer), scrolling, typing into a box, and reading a chart's data. Thunai
 * never reads pixels and never touches its own UI or a password field.
 */
import { getInstanceByDom } from "echarts/core";
import { chartFacts, type ChartFacts } from "@/lib/thunai/explain";
import type { Step } from "@/lib/thunai/types";

const OWN = "[data-thunai-ui]";
const CLICKABLE = "button, a[href], input:not([type=hidden]), select, textarea, summary, [role=button], [role=tab], [role=link], [role=menuitem], [role=checkbox], [role=switch], [tabindex]:not([tabindex='-1'])";

export function visible(el: Element): boolean {
  const r = el.getBoundingClientRect();
  if (r.width < 4 || r.height < 4) return false;
  if (r.bottom < 0 || r.right < 0 || r.top > window.innerHeight || r.left > window.innerWidth) return false;
  const st = getComputedStyle(el);
  if (st.visibility === "hidden" || st.display === "none" || Number(st.opacity) === 0) return false;
  // covered by the scrim of an open panel?
  const cx = Math.min(window.innerWidth - 1, Math.max(0, r.left + r.width / 2)), cy = Math.min(window.innerHeight - 1, Math.max(0, r.top + r.height / 2));
  const top = document.elementFromPoint(cx, cy);
  return !!top && (top === el || el.contains(top) || top.contains(el) || !!top.closest(OWN));
}

export function accessibleName(el: Element): string {
  const h = el as HTMLElement;
  const label = h.getAttribute("aria-label") || h.getAttribute("title") || (h as HTMLInputElement).placeholder || "";
  const lb = h.getAttribute("aria-labelledby");
  const by = lb ? lb.split(" ").map((id) => document.getElementById(id)?.textContent ?? "").join(" ") : "";
  return (label || by || h.innerText || h.textContent || "").replace(/\s+/g, " ").trim().slice(0, 60);
}

export interface Clickable { n: number; el: HTMLElement; name: string; x: number; y: number }

/** Every visible control in the console, numbered left to right, top to bottom (at most 99). */
export function clickables(): Clickable[] {
  const seen = new Set<Element>();
  const out: Clickable[] = [];
  document.querySelectorAll<HTMLElement>(CLICKABLE).forEach((el) => {
    if (el.closest(OWN) || seen.has(el)) return;
    if ((el as HTMLInputElement).disabled) return;
    if (!visible(el)) return;
    // a control inside another counts once (the outer one)
    if (el.parentElement?.closest(CLICKABLE) && seen.has(el.parentElement.closest(CLICKABLE)!)) return;
    seen.add(el);
    const r = el.getBoundingClientRect();
    out.push({ n: 0, el, name: accessibleName(el), x: r.left, y: r.top });
  });
  out.sort((a, b) => (Math.abs(a.y - b.y) < 12 ? a.x - b.x : a.y - b.y));
  return out.slice(0, 99).map((c, i) => ({ ...c, n: i + 1 }));
}

/** The control whose accessible name best matches the spoken name. */
export function byName(list: Clickable[], name: string): Clickable | null {
  const q = name.toLowerCase().replace(/[^\p{L}\p{N} ]/gu, "").trim();
  if (!q) return null;
  const scored = list.map((c) => {
    const n = c.name.toLowerCase();
    const s = n === q ? 3 : n.startsWith(q) ? 2 : n.includes(q) ? 1 : 0;
    return { c, s };
  }).filter((x) => x.s > 0).sort((a, b) => b.s - a.s || a.c.name.length - b.c.name.length);
  return scored[0]?.c ?? null;
}

export function press(el: HTMLElement) {
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) { el.focus(); return; }
  el.click();
}

/** The control a step changes, so the pointer can glide to it (null: the orb only pulses). */
export function targetFor(step: Step): HTMLElement | null {
  const q = (sel: string) => {
    const el = document.querySelector<HTMLElement>(sel);
    return el && !el.closest(OWN) && visible(el) ? el : null;
  };
  const withText = (sel: string, text: string) => {
    for (const el of document.querySelectorAll<HTMLElement>(sel)) if (!el.closest(OWN) && el.innerText?.toLowerCase().includes(text.toLowerCase()) && visible(el)) return el;
    return null;
  };
  switch (step.a) {
    case "page": return q(`.ptabs [data-key="${step.page}"]`);
    case "period": return withText(`[aria-label="Period"] button, [aria-label="Period"] [role=radio]`, { daily: "day", weekly: "week", monthly: "month", quarterly: "quarter" }[step.period]);
    case "view": {
      const v = step.view;
      if (v.zone !== undefined) return q(`select[aria-label="Zone"]`);
      if (v.dept !== undefined) return q(`select[aria-label="Department"]`);
      if (v.sev) return withText(".sevtab, .att-pills [role=tab]", v.sev);
      return null;
    }
    case "mapMode": return withText("button", step.mode === "taluks" ? "Taluks" : "Zones");
    case "theme": return q(".theme-t");
    case "panel":
      if (step.panel === "export") return q(`[aria-label="Export report"]`);
      if (step.panel === "workspace") return q(`[aria-label="Workspaces"]`);
      if (step.panel === "customize") return q(`[aria-label="Customize"]`);
      if (step.panel === "palette") return q(".cmdk");
      if (step.panel === "assistant") return q(".ask-fab");
      return null;
    case "ask": return q(".ask-fab");
    default: return null;
  }
}

/** Scroll the panel in front, else the largest scrollable area on screen. */
export function scroll(dir: "up" | "down" | "top" | "bottom") {
  const all = [...document.querySelectorAll<HTMLElement>("*")].filter((el) => {
    if (el.closest(OWN)) return false;
    const st = getComputedStyle(el);
    return /(auto|scroll)/.test(st.overflowY) && el.scrollHeight > el.clientHeight + 8 && visible(el);
  });
  const front = all.filter((el) => el.closest("[role=dialog], .modal, .drawer, .sheet")).sort((a, b) => b.clientHeight - a.clientHeight)[0];
  const el = front ?? all.sort((a, b) => b.clientHeight * b.clientWidth - a.clientHeight * a.clientWidth)[0] ?? document.scrollingElement as HTMLElement;
  if (!el) return;
  const h = el.clientHeight * 0.8;
  if (dir === "top") el.scrollTo({ top: 0, behavior: "smooth" });
  else if (dir === "bottom") el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  else el.scrollBy({ top: dir === "down" ? h : -h, behavior: "smooth" });
}

/** Type into the focused text box (a React-controlled one too). Never a password field. */
export function typeInto(text: string, clear = false): boolean {
  const el = document.activeElement as HTMLInputElement | HTMLTextAreaElement | null;
  if (!el || el.closest(OWN) || !(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return false;
  if (el instanceof HTMLInputElement && (el.type === "password" || /pass|otp|pin/i.test(el.name + el.id + el.autocomplete))) return false;
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  setter?.call(el, clear ? "" : `${el.value}${el.value && !el.value.endsWith(" ") ? " " : ""}${text}`);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  return true;
}

/** The chart nearest the pointer (or the first one in the panel in front, or on the page), read from ECharts. */
export function readChart(point: { x: number; y: number } | null): ChartFacts | null {
  const charts = [...document.querySelectorAll<HTMLElement>("[_echarts_instance_]")].filter((el) => !el.closest(OWN) && visible(el));
  if (!charts.length) return null;
  const dist = (el: HTMLElement) => {
    if (!point) return 0;
    const r = el.getBoundingClientRect();
    const dx = Math.max(r.left - point.x, 0, point.x - r.right), dy = Math.max(r.top - point.y, 0, point.y - r.bottom);
    return dx * dx + dy * dy;
  };
  const front = charts.filter((el) => el.closest("[role=dialog], .modal"));
  const pick = (front.length ? front : charts).sort((a, b) => dist(a) - dist(b))[0];
  const opt = getInstanceByDom(pick)?.getOption() as Record<string, unknown> | undefined;
  const card = pick.closest(".card, .bb-card, [role=dialog], .modal");
  const title = (card?.querySelector("h3, h2, .title")?.textContent ?? "").replace(/\s+/g, " ").trim();
  if (!opt) return null;
  const series = (opt.series as { data?: unknown[] }[] | undefined)?.[0];
  const axis = ((opt.xAxis as { data?: unknown[] }[] | undefined)?.[0]?.data?.length ? (opt.xAxis as { data?: unknown[] }[])[0].data
    : (opt.yAxis as { data?: unknown[] }[] | undefined)?.[0]?.data) ?? [];
  return series?.data ? chartFacts(title, axis, series.data) : null;
}

/** Outline the card that holds a text for 2 s and dim the rest (the spotlight). */
export function spotlight(text: string) {
  const cards = [...document.querySelectorAll<HTMLElement>(".card, .bb-card, .env-card, [class*='card']")].filter((el) => !el.closest(OWN) && visible(el));
  const card = cards.filter((c) => c.innerText?.toLowerCase().includes(text.toLowerCase())).sort((a, b) => a.innerText.length - b.innerText.length)[0];
  if (!card) return;
  card.classList.add("thunai-spot");
  document.body.classList.add("thunai-dim");
  setTimeout(() => { card.classList.remove("thunai-spot"); document.body.classList.remove("thunai-dim"); }, 2000);
}
