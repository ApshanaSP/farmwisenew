"use client";
/**
 * The whole site in Tamil, by choice (lib/i18n/lang.ts). Rather than rewrite every screen, this watches the page and
 * puts the Tamil words in place of the English ones as React draws them: the hand-checked words first (lib/i18n/ta.ts),
 * then words the AI translated once (api/i18n, cached on the server and in this browser). Numbers never go to the AI:
 * they are taken out ("#"), and put back in the same order, so a count can never change in translation. Switching
 * back to English restores every original word. Anything marked translate="no" or data-no-i18n is left alone (Jarvis
 * speaks both languages itself; people's input stays as typed).
 */
import { useEffect } from "react";
import { getLang, type UiLang } from "@/lib/i18n/lang";
import { TA, TA_CTX } from "@/lib/i18n/ta";

const NUM = /\d+(?:[.,]\d+)*/g;
const LATIN = /[A-Za-z]{2,}/;
const ATTRS = ["placeholder", "title", "aria-label", "data-tip"] as const;
const SKIP = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA", "CODE", "PRE", "KBD"]);
const CACHE_KEY = "diq-i18n-ta";

/** the template of a text: trimmed, one space, numbers as "#" */
const keyOf = (s: string) => s.replace(/\s+/g, " ").trim().replace(NUM, "#");
const lower: Record<string, string> = Object.fromEntries(Object.entries(TA).map(([k, v]) => [k.toLowerCase(), v]));

const learned = new Map<string, string>();
const asked = new Set<string>();
const waiting = new Set<string>();
let loadedCache = false;
function loadCache() {
  if (loadedCache) return;
  loadedCache = true;
  try { for (const [k, v] of Object.entries(JSON.parse(localStorage.getItem(CACHE_KEY) ?? "{}") as Record<string, string>)) learned.set(k, v); } catch { /* none */ }
}
let saveT: ReturnType<typeof setTimeout> | null = null;
function saveCache() {
  if (saveT) return;
  saveT = setTimeout(() => {
    saveT = null;
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(Object.fromEntries([...learned].slice(-6000)))); } catch { /* full */ }
  }, 1500);
}

/** the Tamil for a text, numbers put back; null when not known yet */
export function translate(src: string): string | null {
  const k = keyOf(src);
  if (!k || !LATIN.test(k)) return null;
  const t = TA[k] ?? lower[k.toLowerCase()] ?? learned.get(k);
  if (t == null) return null;
  const nums = src.match(NUM) ?? [];
  let i = 0;
  const out = t.replace(/#/g, () => nums[i++] ?? "#");
  const lead = /^\s*/.exec(src)?.[0] ?? "", trail = /\s*$/.exec(src)?.[0] ?? "";
  return lead + out + trail;
}

/** worth asking the AI: has words, not a code, an address or a long paragraph */
const askable = (k: string) => k.length >= 2 && k.length <= 360 && LATIN.test(k) && !/^(https?:|www\.|[\w.+-]+@[\w-]+\.)/i.test(k) && !/^[A-Z0-9_-]{2,8}$/.test(k);

interface TextState { src: string; out: string }
const texts = new WeakMap<Text, TextState>();
const attrs = new WeakMap<Element, Record<string, TextState>>();

function skipped(el: Element | null): boolean {
  for (let e = el; e; e = e.parentElement) {
    if (SKIP.has(e.tagName)) return true;
    if (e.getAttribute("translate") === "no" || e.hasAttribute("data-no-i18n") || e.classList.contains("notranslate") || (e as HTMLElement).isContentEditable) return true;
  }
  return false;
}

export default function Translator() {
  useEffect(() => {
    let lang: UiLang = getLang();
    let obs: MutationObserver | null = null;
    let queued = new Set<Node>();
    let raf = 0;
    let askT: ReturnType<typeof setTimeout> | null = null;
    /** nodes whose words were not known yet, by template: done again when the AI answers */
    const pending = new Map<string, Set<WeakRef<Text | Element>>>();
    loadCache();

    const remember = (k: string, n: Text | Element) => {
      if (!askable(k)) return;
      let s = pending.get(k);
      if (!s) pending.set(k, (s = new Set()));
      if (s.size < 40) s.add(new WeakRef(n));
      if (!asked.has(k)) { waiting.add(k); scheduleAsk(); }
    };

    const doText = (n: Text) => {
      const v = n.nodeValue ?? "";
      const st = texts.get(n);
      if (st && v === st.out) return;
      if (!LATIN.test(v)) return;
      if (n.parentElement && skipped(n.parentElement)) return;
      // a word whose Tamil depends on where it stands (a status "Open" is not the button "Open"): the element's own table first (RC-15, PB-299)
      const ctx = n.parentElement?.closest("[data-i18n-ctx]")?.getAttribute("data-i18n-ctx");
      const own = ctx ? TA_CTX[ctx]?.[keyOf(v)] : undefined;
      const t = own != null ? (/^\s*/.exec(v)?.[0] ?? "") + own + (/\s*$/.exec(v)?.[0] ?? "") : translate(v);
      if (t != null && t !== v) { texts.set(n, { src: v, out: t }); n.nodeValue = t; }
      else if (t == null) { texts.set(n, { src: v, out: v }); remember(keyOf(v), n); }
    };
    const doAttrs = (el: Element) => {
      let rec = attrs.get(el);
      for (const a of ATTRS) {
        const v = el.getAttribute(a);
        if (!v || !LATIN.test(v)) continue;
        if (rec?.[a] && rec[a].out === v) continue;
        if (skipped(el)) return;
        const t = translate(v);
        if (!rec) attrs.set(el, (rec = {}));
        if (t != null && t !== v) { rec[a] = { src: v, out: t }; el.setAttribute(a, t); }
        else if (t == null) { rec[a] = { src: v, out: v }; remember(keyOf(v), el); }
      }
    };
    const walk = (root: Node) => {
      if (root.nodeType === Node.TEXT_NODE) { doText(root as Text); return; }
      if (root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_NODE) return;
      if (root.nodeType === Node.ELEMENT_NODE) {
        const el = root as Element;
        if (skipped(el)) return;
        doAttrs(el);
      }
      const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
        acceptNode: (n) => (n.nodeType === Node.ELEMENT_NODE && (SKIP.has((n as Element).tagName) || (n as Element).getAttribute("translate") === "no" || (n as Element).hasAttribute("data-no-i18n"))
          ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT)
      });
      for (let n = tw.nextNode(); n; n = tw.nextNode()) {
        if (n.nodeType === Node.TEXT_NODE) doText(n as Text); else doAttrs(n as Element);
      }
    };
    const flush = () => {
      raf = 0;
      const q = queued;
      queued = new Set();
      obs?.disconnect();
      q.forEach((n) => { if (n.isConnected) walk(n); });
      obs?.observe(document.body, OPTS);
    };
    const OPTS: MutationObserverInit = { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: [...ATTRS] };

    // up to three batches at once: a page's first visit in Tamil is translated in seconds, not one batch after another
    let inFlight = 0;
    const scheduleAsk = () => {
      if (askT || inFlight >= 3) return;
      askT = setTimeout(async () => {
        askT = null;
        const batch = [...waiting].slice(0, 45);
        batch.forEach((k) => { waiting.delete(k); asked.add(k); });
        if (!batch.length) return;
        inFlight++;
        if (waiting.size) scheduleAsk();
        try {
          const r = await fetch("/api/i18n", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lang: "ta", texts: batch }) });
          const j = r.ok ? ((await r.json()) as { out?: Record<string, string> }) : null;
          for (const [k, v] of Object.entries(j?.out ?? {})) if (v) learned.set(k, v);
          saveCache();
          if (lang === "ta") {
            obs?.disconnect();
            for (const k of batch) {
              for (const ref of pending.get(k) ?? []) {
                const n = ref.deref();
                if (!n || !n.isConnected) continue;
                if (n.nodeType === Node.TEXT_NODE) { texts.delete(n as Text); doText(n as Text); }
                else { attrs.delete(n as Element); doAttrs(n as Element); }
              }
              pending.delete(k);
            }
            obs?.observe(document.body, OPTS);
          }
        } catch { /* offline: the English stays */ }
        inFlight--;
        if (waiting.size) scheduleAsk();
      }, 350);
    };

    const start = () => {
      if (obs) return;
      obs = new MutationObserver((ms) => {
        for (const m of ms) {
          if (m.type === "childList") m.addedNodes.forEach((n) => queued.add(n));
          else queued.add(m.target);
        }
        if (!raf) raf = requestAnimationFrame(flush);
      });
      walk(document.body);
      obs.observe(document.body, OPTS);
    };
    const stop = () => {
      obs?.disconnect();
      obs = null;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      // every word back to the English it was
      const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
      for (let n = tw.nextNode(); n; n = tw.nextNode()) {
        if (n.nodeType === Node.TEXT_NODE) { const s = texts.get(n as Text); if (s && n.nodeValue === s.out) n.nodeValue = s.src; texts.delete(n as Text); }
        else {
          const rec = attrs.get(n as Element);
          if (rec) for (const [a, s] of Object.entries(rec)) if ((n as Element).getAttribute(a) === s.out) (n as Element).setAttribute(a, s.src);
          attrs.delete(n as Element);
        }
      }
    };
    // the first pass waits for React to finish attaching to the server's HTML (hydration): words changed before that
    // make React throw the page away and draw it again. After it, every change is React's own and is safe to follow.
    let ready = false;
    const begin = () => { if (ready) return; ready = true; if (lang === "ta") start(); };
    const readyT = document.readyState === "complete" ? setTimeout(begin, 500) : null;
    const onLoad = () => setTimeout(begin, 500);
    if (!readyT) window.addEventListener("load", onLoad, { once: true });
    const onLang = (e: Event) => {
      lang = (e as CustomEvent<UiLang>).detail === "ta" ? "ta" : "en";
      if (!ready) return;
      if (lang === "ta") start(); else stop();
    };
    window.addEventListener("diq:lang", onLang);
    return () => {
      window.removeEventListener("diq:lang", onLang); window.removeEventListener("load", onLoad);
      if (readyT) clearTimeout(readyT);
      obs?.disconnect(); if (askT) clearTimeout(askT);
    };
  }, []);
  return null;
}
