/**
 * Immediate feedback for every click on the site, in one place rather than in the 680 click handlers.
 *
 * - The control pressed changes at once (on pointer-down, before the click's work can hold up the browser).
 * - Any request a click starts puts a notice at the top of the screen saying what is being done, and, when a record changed, what was done.
 * - A link or a page tab says it is opening, until the page has arrived.
 * - Something slow says so.
 *
 * Plain DOM rather than React, on purpose: the notice must appear even while React is busy drawing the very thing that was asked for.
 * Requests the site makes by itself (polling, typing suggestions) are never announced (messages.ts).
 */
import { getLang } from "@/lib/i18n/lang";
import { FAILED, NOTICE_TA, PAGE_NAMES, PLEASE_WAIT, SIGNING_OUT, SLOW, isBackground, noticeFor, type Notice } from "./messages";

/** lib/security/stepup.ts SOFT_ANSWER: the header a guarded route sets when it asks for confirmation instead of acting */
const CONFIRM_ASKED = "x-diq-confirm";

/** A request starting this soon after a click belongs to that click. */
const GESTURE_MS = 1200;
/** Choosing files is followed by shrinking the photos in the browser before anything is sent. */
const FILE_GESTURE_MS = 8000;
const MIN_SHOWN_MS = 450;
const SLOW_MS = 7000;
const DONE_MS = 2800;
const FAILED_MS = 4500;
/** A page that never arrives must not leave its notice up for ever. */
const NAV_GIVE_UP_MS = 90_000;

interface Item {
  id: number; text: string; full: boolean; at: number; el: HTMLElement | null; hold: boolean; nav: boolean;
  /** requests still running under this one notice */
  running: number;
  /** said what is being opened: the requests behind it do not reword it */
  worded: boolean;
  done: string | null;
  failed: boolean;
  /** its words have been written into the live notice once: a new notice is always written, even in the last one's words */
  said?: boolean;
}
interface Gesture { at: number; ttl: number; el: HTMLElement | null; early: number | null; group: number | null }

declare global {
  // eslint-disable-next-line no-var
  var __diqActivity: boolean | undefined;
}

const ta = () => { try { return getLang() === "ta"; } catch { return false; } };
const inTamil = (s: string) => NOTICE_TA[s] ?? s;
const doingText = (doing: string) => (ta() ? `${inTamil(doing)}. ${NOTICE_TA[PLEASE_WAIT]}` : `${doing}. ${PLEASE_WAIT}`);
const plain = (s: string) => (ta() ? inTamil(s) : s);
const openingText = (label: string) => (ta() ? `${label} திறக்கப்படுகிறது. ${NOTICE_TA[PLEASE_WAIT]}` : `Opening ${label}. ${PLEASE_WAIT}`);
/** A link is named by where it goes when that is known: the logo's own words are not the name of a page. */
const linkName = (path: string, label: string) => { const p = PAGE_NAMES[path]; return p ? (ta() ? p[1] : p[0]) : label; };

/** The name of a control as the person reads it. */
function labelOf(el: HTMLElement): string {
  const named = el.querySelector("b")?.textContent || el.getAttribute("aria-label") || (el as HTMLElement).innerText || el.getAttribute("title") || "";
  return named.split("\n").map((l) => l.trim()).filter(Boolean)[0]?.slice(0, 44) ?? "";
}

/** The whole name: "Sign out every other device" is a different action, and this one stays on the page. */
const SIGN_OUT = /^(sign out|log ?out|வெளியேறு)$/i;

export function installActivity(): void {
  if (globalThis.__diqActivity) return;
  globalThis.__diqActivity = true;

  const line = document.createElement("div"); line.id = "diq-line"; line.setAttribute("aria-hidden", "true");
  const pill = document.createElement("div"); pill.id = "diq-notice"; pill.setAttribute("role", "status"); pill.setAttribute("aria-live", "polite"); pill.setAttribute("data-no-i18n", "");
  const spin = document.createElement("span"); spin.className = "diq-ic";
  const words = document.createElement("span"); words.className = "diq-w";
  const main = document.createElement("span"); main.className = "diq-m";
  const sub = document.createElement("span"); sub.className = "diq-s";
  words.append(main, sub); pill.append(spin, words);
  const veil = document.createElement("div"); veil.id = "diq-veil"; veil.setAttribute("data-no-i18n", "");
  const veilBox = document.createElement("div"); veilBox.className = "diq-vb";
  const veilSpin = document.createElement("span"); veilSpin.className = "diq-ic";
  const veilText = document.createElement("span"); veilText.className = "diq-vt";
  veilBox.append(veilSpin, veilText); veil.append(veilBox);
  document.body.append(line, pill, veil);

  const root = document.documentElement;
  const open: Item[] = [];
  let seq = 0;
  let flash: { text: string; kind: "ok" | "err"; until: number; said?: boolean } | null = null;
  let flashT: ReturnType<typeof setTimeout> | null = null;
  let gesture: Gesture | null = null;

  /**
   * The notice is an aria-live region: some screen readers read any text written into it again, even the same words. So its text
   * is written when a notice is new or its words change, never again on the once-a-second redraw (QA pass 5, P5-032).
   */
  const put = (el: HTMLElement, text: string, fresh = false) => { if (fresh || el.textContent !== text) el.textContent = text; };
  const show = (el: HTMLElement, on: boolean) => { if (el.hidden === on) el.hidden = !on; };

  function draw(): void {
    const top = open[open.length - 1];
    const now = Date.now();
    if (top) {
      pill.dataset.state = "busy"; line.dataset.on = "1"; root.dataset.diqWorking = "1";
      put(main, top.text, !top.said);
      top.said = true;
      const slow = now - top.at > SLOW_MS;
      put(sub, slow ? plain(SLOW) : "");
      show(sub, slow);
      if (top.full) { put(veilText, top.text); veil.dataset.on = "1"; } else delete veil.dataset.on;
      return;
    }
    delete line.dataset.on; delete root.dataset.diqWorking; delete veil.dataset.on;
    if (flash && flash.until > now) {
      pill.dataset.state = flash.kind;
      put(main, flash.text, !flash.said);
      flash.said = true;
      put(sub, ""); show(sub, false);
      return;
    }
    pill.dataset.state = "off";
  }
  // the "longer than usual" line appears by itself
  setInterval(() => { if (open.length) draw(); }, 1000);

  function mark(el: HTMLElement | null, on: boolean): void {
    if (!el) return;
    if (on) { el.setAttribute("data-diq-busy", ""); el.setAttribute("aria-busy", "true"); }
    else { el.removeAttribute("data-diq-busy"); el.removeAttribute("aria-busy"); }
  }

  function begin(text: string, opts: { el?: HTMLElement | null; full?: boolean; hold?: boolean; nav?: boolean; worded?: boolean } = {}): number {
    const item: Item = { id: ++seq, text, full: !!opts.full, at: Date.now(), el: opts.el ?? null, hold: !!opts.hold, nav: !!opts.nav, running: 0, worded: !!opts.worded, done: null, failed: false };
    open.push(item);
    mark(item.el, true);
    flash = null;
    draw();
    return item.id;
  }

  function remove(id: number): void {
    const k = open.findIndex((i) => i.id === id);
    if (k < 0) return;
    mark(open[k].el, false);
    open.splice(k, 1);
    draw();
  }

  /** Long enough to be read: a notice that blinks is worse than none. */
  function finish(id: number, result: { text: string; kind: "ok" | "err" } | null): void {
    const item = open.find((i) => i.id === id);
    if (!item) return;
    const wait = Math.max(0, MIN_SHOWN_MS - (Date.now() - item.at));
    setTimeout(() => {
      if (item.running > 0) return; // another request joined this notice meanwhile: it finishes when that one does
      if (result) {
        flash = { ...result, until: Date.now() + (result.kind === "ok" ? DONE_MS : FAILED_MS) };
        if (flashT) clearTimeout(flashT);
        flashT = setTimeout(draw, (result.kind === "ok" ? DONE_MS : FAILED_MS) + 20);
      }
      remove(id);
    }, wait);
  }

  /** The next page has arrived, or this one is back from the browser's history. */
  function arrived(): void {
    for (const i of [...open]) if (i.hold || i.nav) remove(i.id);
  }

  const claimGesture = (): Gesture | null => {
    if (!gesture) return null;
    return Date.now() - gesture.at <= gesture.ttl ? gesture : null;
  };

  // ------------------------------------------------------------------ requests --
  const pageFetch = window.fetch.bind(window);
  /**
   * The loads in progress. A browser opens at most six connections to a site, so slow panels can leave signing out queueing behind them
   * for many seconds. Signing out abandons them first: nobody is going to read the answers.
   */
  const loads = new Set<AbortController>();
  window.fetch = function (input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    let notice: Notice | null = null;
    let nativeFetch = pageFetch;
    const g = claimGesture();
    try {
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, location.href);
      const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
      if (url.origin === location.origin && url.pathname.startsWith("/api/")) {
        if (g) notice = noticeFor(method, url.pathname, init?.body);
        if (url.pathname === "/api/auth/logout") { loads.forEach((c) => c.abort()); loads.clear(); }
        else if ((method === "GET" || isBackground(method, url.pathname)) && typeof AbortSignal.any === "function") {
          const c = new AbortController();
          const theirs = init?.signal ?? (input instanceof Request ? input.signal : null);
          const signal = theirs ? AbortSignal.any([theirs, c.signal]) : c.signal;
          loads.add(c);
          nativeFetch = (i, o) => pageFetch(i, { ...o, signal }).finally(() => loads.delete(c));
        }
      }
    } catch { /* an address that cannot be read is not announced */ }
    if (!g || !notice || !notice.doing) return nativeFetch(input, init);
    const n = notice;
    const byId = (id: number | null) => (id == null ? undefined : open.find((i) => i.id === id));

    // One click, one notice. A filter change starts several requests at once; they share a single notice, which stays until they are done.
    let item = byId(g.group);
    // a side panel filling in behind the main content does not hold the notice up
    if (item && n.secondary) return nativeFetch(input, init);
    if (!item && byId(g.early) && !n.hold && !byId(g.early)!.nav) { item = byId(g.early); g.group = g.early; g.early = null; } // "Opening Trends" carries on
    if (!item) {
      // the request takes over from whatever the click put up in the same instant
      if (g.early != null) { remove(g.early); g.early = null; }
      item = byId(begin(doingText(n.doing), { el: g.el, full: n.full, hold: n.hold }))!;
      g.group = item.id;
    } else if (n.primary && !item.worded) { item.text = doingText(n.doing); item.worded = true; draw(); }
    const it = item;
    it.running++;

    const nextLink = () => { if (gesture === g) g.at = Date.now(); }; // a second request that follows from the first
    const settle = () => {
      it.running--;
      if (it.running > 0) return;
      finish(it.id, it.failed ? { text: plain(FAILED), kind: "err" } : it.done ? { text: plain(it.done), kind: "ok" } : null);
    };
    return nativeFetch(input, init).then(
      (r) => {
        nextLink();
        if (!r.ok) {
          if (n.hold) { it.running--; remove(it.id); return r; } // the page is staying: do not leave it covered
          if (!n.quietFailure && r.status !== 401) it.failed = true;
          settle();
        } else if (r.headers.get(CONFIRM_ASKED) === "required") {
          // a guarded action answered "confirm it's you first" (lib/security/stepup.ts: a 200 with this header, for the console's own
          // fetch): nothing was done yet, so nothing is announced; the confirm box takes over, and its own request, if any, is announced
          // when it succeeds (QA pass 5, P5-010)
          if (n.hold) { it.running--; remove(it.id); return r; }
          settle();
        } else if (n.hold) { window.setTimeout(() => remove(it.id), NAV_GIVE_UP_MS); } // stays until the next page replaces this one
        else { if (n.done) it.done = n.done; settle(); }
        return r;
      },
      (e) => {
        if ((e as Error)?.name !== "AbortError") it.failed = true;
        if (n.hold) { it.running--; remove(it.id); } else settle();
        throw e;
      }
    );
  };

  // ------------------------------------------------------------------- clicks --
  const CONTROL = "a[href],button,[role=button],[role=tab],[role=menuitem],summary,input[type=submit],input[type=button]";

  /** A same-site link to another page, followed in this tab. */
  function pageLink(el: HTMLElement): boolean {
    if (el.tagName !== "A") return false;
    const a = el as HTMLAnchorElement;
    if ((a.target && a.target !== "_self") || a.hasAttribute("download") || !/^https?:$/.test(a.protocol)) return false;
    return a.origin === location.origin && a.pathname !== location.pathname;
  }
  /** A tab that opens a page of the console. A period switch or a pill inside a card also says role="tab", but opens nothing. */
  const isPageTab = (el: HTMLElement) => el.getAttribute("role") === "tab" && el.getAttribute("aria-selected") !== "true" && !el.classList.contains("ui-seg-o") && !!(el.closest("header") || el.closest(".ui-tabs"));

  /**
   * Shown while the button is still held down. It must not touch the button or cover it (no busy mark, no covering screen): the click
   * lands where the pointer comes back up, and anything in the way would swallow it.
   */
  function earlyNotice(el: HTMLElement): number | null {
    const label = labelOf(el);
    if (SIGN_OUT.test(label)) return begin(doingText(SIGNING_OUT.doing), { hold: true });
    if (!label) return null;
    if (pageLink(el)) return begin(openingText(linkName((el as HTMLAnchorElement).pathname, label)), { nav: true });
    if (isPageTab(el)) return begin(openingText(label), { worded: true });
    return null;
  }

  let pressed: HTMLElement | null = null;
  let pressedEarly: number | null = null;
  let cancelT: ReturnType<typeof setTimeout> | null = null;
  const release = () => { pressed?.removeAttribute("data-diq-press"); pressed = null; };

  document.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey) return;
    const el = (e.target as Element | null)?.closest?.(CONTROL) as HTMLElement | null;
    if (!el || (el as HTMLButtonElement).disabled) return;
    release();
    pressed = el; el.setAttribute("data-diq-press", "");
    pressedEarly = earlyNotice(el);
    // pressed, then dragged away: no click follows
    if (cancelT) clearTimeout(cancelT);
    cancelT = setTimeout(() => { if (pressedEarly != null) { remove(pressedEarly); pressedEarly = null; } }, 1500);
  }, true);
  ["pointerup", "pointercancel", "dragstart"].forEach((t) => document.addEventListener(t, release, true));

  /** Once the browser has painted what the click drew, a notice with no request behind it has done its job. */
  function afterPaint(g: Gesture, id: number): void {
    requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(() => {
      if (g.early === id) { g.early = null; finish(id, null); }
    }, 60)));
  }

  document.addEventListener("click", (e) => {
    if (cancelT) { clearTimeout(cancelT); cancelT = null; }
    const el = (e.target as Element | null)?.closest?.(CONTROL) as HTMLElement | null;
    if (!el || e.ctrlKey || e.metaKey || e.shiftKey) { if (pressedEarly != null) { remove(pressedEarly); pressedEarly = null; } return; }
    // a keyboard click has no pointer-down before it
    const early = pressedEarly ?? ((e as MouseEvent).detail === 0 ? earlyNotice(el) : null);
    pressedEarly = null;
    const g: Gesture = { at: Date.now(), ttl: GESTURE_MS, el, early, group: null };
    gesture = g;
    if (early == null) return;
    const item = open.find((i) => i.id === early);
    if (!item) { g.early = null; return; }
    if (item.nav) { g.early = null; window.setTimeout(() => remove(early), NAV_GIVE_UP_MS); return; }
    if (item.hold) { window.setTimeout(() => { if (g.early === early) remove(early); }, 4000); return; } // signing out: the request takes over
    afterPaint(g, early);
  }, true);

  document.addEventListener("change", (e) => {
    const el = e.target as HTMLInputElement;
    if (el.tagName === "SELECT") gesture = { at: Date.now(), ttl: GESTURE_MS, el, early: null, group: null };
    else if (el.tagName === "INPUT" && el.type === "file") gesture = { at: Date.now(), ttl: FILE_GESTURE_MS, el: null, early: null, group: null };
    else if (el.tagName === "INPUT" && (el.type === "checkbox" || el.type === "radio")) gesture = { at: Date.now(), ttl: GESTURE_MS, el: null, early: null, group: null };
  }, true);

  document.addEventListener("submit", (e) => {
    const submitter = (e as SubmitEvent).submitter as HTMLElement | null;
    gesture = { at: Date.now(), ttl: GESTURE_MS, el: submitter ?? gesture?.el ?? null, early: gesture?.early ?? null, group: null };
  }, true);

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    const el = e.target as HTMLElement;
    if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") gesture = { at: Date.now(), ttl: GESTURE_MS, el: null, early: null, group: null };
  }, true);

  // ------------------------------------------------------------- arriving pages --
  let path = location.pathname;
  const check = () => { if (location.pathname !== path) { path = location.pathname; arrived(); } };
  for (const m of ["pushState", "replaceState"] as const) {
    const orig = history[m].bind(history);
    history[m] = function (...a: Parameters<History["pushState"]>) { const r = orig(...a); check(); return r; };
  }
  window.addEventListener("popstate", check);
  window.addEventListener("pageshow", (e) => { if ((e as PageTransitionEvent).persisted) arrived(); });
}
