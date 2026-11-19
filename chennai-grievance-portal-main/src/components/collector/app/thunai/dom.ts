/**
 * Thunai's eyes and fingers on the page: the visible controls (like an accessibility snapshot: role + accessible name),
 * the control a step changes (for the ghost pointer), scrolling, typing into a box, and reading a chart's data. Thunai
 * never reads pixels and never touches its own UI or a password field.
 */
import { getInstanceByDom } from "echarts/core";
import { chartFacts, type ChartFacts } from "@/lib/thunai/explain";
import type { Step } from "@/lib/thunai/types";
import { ITEM_ROWS, PRESS_ALLOW, TARGETS, bestOption, parseSpec, pressKind, pressVerdict, type Verdict } from "./press10";

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
  // the word on the control as well as its title: "Menu" on a button titled "Export, workspaces, customize, ...", so "click menu" finds it
  const shown = (h.innerText || h.textContent || "").replace(/\s+/g, " ").trim();
  // v10: a box or a tick named only by the <label> around it (Take action's Subject, Customize's ticks) is named by that label's words
  const wrapped = !label && !by && !shown && /^(?:INPUT|TEXTAREA|SELECT)$/.test(h.tagName ?? "")
    ? (el.closest("label")?.textContent ?? "").replace(/\s+/g, " ").trim() : "";
  const named = (label || by || wrapped).replace(/\s+/g, " ").trim();
  const both = named && shown && !named.toLowerCase().includes(shown.toLowerCase()) ? `${shown} ${named}` : named || shown;
  return both.slice(0, 80);
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

/** Press a control: a button is clicked, a checkbox ticked (a click, so React sees it), a select or a text box focused (v10: chooseOption and
 * setTick change them; press() alone used to only focus a checkbox, so it could never be ticked by voice). */
export function press(el: HTMLElement) {
  const k = pressKind(el.tagName, (el as HTMLInputElement).type);
  if (k === "select" || k === "focus") { el.focus(); return; }
  el.click();
}

/** Set a select to the option a spoken value names (the native setter and a change event, so React's onChange runs). False: no such option. */
export function chooseOption(el: HTMLSelectElement, said: string): boolean {
  const v = bestOption([...el.options].map((o) => ({ text: o.text, value: o.value })), said);
  if (v == null) return false;
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
  setter?.call(el, v);
  el.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
}

/** Tick (true), untick (false) or flip (null) a checkbox, by a click as a hand would. */
export function setTick(el: HTMLInputElement, on: boolean | null): void {
  if (on == null || el.checked !== on) el.click();
}

/** Is this element one of the harmless controls a danger or keep word in its name would otherwise refuse (press10.ts PRESS_ALLOW)? */
const allowedEl = (el: HTMLElement) => PRESS_ALLOW.some((sel) => !!el.closest(sel));
/** The one guard for a spoken click and a registry press (press10.ts pressVerdict). */
export function verdictFor(el: HTMLElement, name: string, yes = false): Verdict {
  return pressVerdict({ name, text: el.textContent, never: !!el.closest("[data-jarvis-never]"), allowed: allowedEl(el), yes });
}

/** The element a registry press selector names (press10.ts parseSpec), visible; inside Jarvis's own UI only for a control marked own. */
export function findControl(spec: string, own = false): HTMLElement | null {
  const steps = parseSpec(spec);
  const last = steps[steps.length - 1];
  return findStep(last.css, last.words, own);
}
function findStep(css: string, words: string[], own: boolean): HTMLElement | null {
  let all: HTMLElement[];
  try { all = [...document.querySelectorAll<HTMLElement>(css)]; } catch { return null; }
  for (const el of all) {
    if ((!own && el.closest(OWN)) || (el as HTMLInputElement).disabled || !visible(el)) continue;
    if (words.length) {
      const n = `${accessibleName(el)} ${el.getAttribute("aria-label") ?? ""} ${el.getAttribute("title") ?? ""}`.toLowerCase();
      if (!words.some((w) => n.includes(w))) continue;
    }
    return el;
  }
  return null;
}

/** The registry's press controls that are on screen now, of those asked about (the sentence's candidates): what the console sees. */
export function visibleControls(cands: { id: string; press: string; own?: boolean }[]): string[] {
  return cands.filter((c) => {
    const steps = parseSpec(c.press);
    // a menu's item counts as there when its menu button is (pressing goes through the menu)
    return steps.some((s, i) => (i === steps.length - 1 || i === 0) && !!findStep(s.css, s.words, !!c.own));
  }).map((c) => c.id);
}

export type PressResult = { ok: true; el: HTMLElement } | { ok: false; why: "missing" | "never" | "keep" | "noOption" };
/**
 * Press a registry control (v10, controls10.ts): through its menu first when it lives in one ("a >> b"), then the guard (verdictFor), then by
 * its kind: a select set to the value said, a checkbox ticked or unticked, a text box focused and the value typed, anything else clicked.
 */
export async function pressControl(spec: string, o: { own?: boolean; value?: string | null; tick?: boolean | null; yes?: boolean } = {}): Promise<PressResult> {
  const steps = parseSpec(spec);
  const last = steps[steps.length - 1];
  let el = findStep(last.css, last.words, !!o.own);
  if (!el && steps.length > 1) {
    for (const s of steps.slice(0, -1)) {
      const m = findStep(s.css, s.words, !!o.own);
      if (!m) return { ok: false, why: "missing" };
      m.click();
      await new Promise((r) => setTimeout(r, 140));
    }
    el = findStep(last.css, last.words, !!o.own);
  }
  if (!el) return { ok: false, why: "missing" };
  const v = verdictFor(el, accessibleName(el), !!o.yes);
  if (v !== "ok") return { ok: false, why: v };
  const k = pressKind(el.tagName, (el as HTMLInputElement).type);
  if (k === "select") {
    if (o.value) { if (!chooseOption(el as HTMLSelectElement, o.value)) return { ok: false, why: "noOption" }; }
    else el.focus();
  } else if (k === "check") setTick(el as HTMLInputElement, o.tick ?? null);
  else if (k === "focus") { el.focus(); if (o.value) { typeInto("", true); typeInto(o.value); } }
  else el.click();
  return { ok: true, el };
}

/** v10: the rows of the list in the window open, in the order shown (press10.ts ITEM_ROWS); null: that window has no list (or none is open). */
export function frontRows(panel: string | null): HTMLElement[] | null {
  const sel = panel ? ITEM_ROWS[panel] : undefined;
  if (!sel) return null;
  return [...document.querySelectorAll<HTMLElement>(sel)].filter((el) => !el.closest(OWN) && el.getClientRects().length > 0 && !el.querySelector(".empty"));
}

/** The control a step changes, so the pointer can glide to it (null: the orb only pulses). */
export function targetFor(step: Step): HTMLElement | null {
  const q = (sel: string) => {
    const el = document.querySelector<HTMLElement>(sel);
    return el && !el.closest(OWN) && visible(el) ? el : null;
  };
  // the first of a target's selectors on screen: a menu's item while the menu is open, else the Menu button it lives in
  const first = (sels: string[]) => sels.reduce<HTMLElement | null>((f, s) => f ?? q(s), null);
  const withText = (sel: string, text: string) => {
    for (const el of document.querySelectorAll<HTMLElement>(sel)) if (!el.closest(OWN) && el.innerText?.toLowerCase().includes(text.toLowerCase()) && visible(el)) return el;
    return null;
  };
  switch (step.a) {
    case "page": return q(`.ptabs [data-key="${step.page}"]`);
    case "period": return q(`.band .filters [data-key="${step.period}"]`);
    case "view": {
      const v = step.view;
      if (v.zone !== undefined) return q(".band .filters label.fsel:nth-of-type(1) select");
      if (v.dept !== undefined) return q(".band .filters label.fsel:nth-of-type(3) select");
      if (v.sev) return withText(TARGETS.sev[0], v.sev);
      return null;
    }
    case "mapMode": return withText(".map-seg [role=tab]", step.mode === "taluks" ? "Taluks" : "Zones");
    case "theme": return first(TARGETS.theme);
    case "panel":
      if (step.panel === "export") return first(TARGETS.export);
      if (step.panel === "workspace") return first(TARGETS.workspace);
      if (step.panel === "customize") return first(TARGETS.customize);
      if (step.panel === "palette") return first(TARGETS.palette);
      if (step.panel === "assistant") return first(TARGETS.assistant);
      return null;
    case "ask": return first(TARGETS.assistant);
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
