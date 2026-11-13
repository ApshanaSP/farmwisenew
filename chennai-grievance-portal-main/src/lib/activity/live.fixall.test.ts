// P5-032 (click-layer-01): the click notice is a role="status" aria-live region, and its once-a-second redraw (which exists only to
// add the "taking longer than usual" line) reassigned the notice's text on every tick, the same words each time. Some screen readers
// treat each text write in a live region as a new announcement, so a slow request could be read out again every second.
// The notice's words must be written only when they change: once when the request starts, once when "slow" appears, once at the end.
import { afterAll, describe, expect, it, vi } from "vitest";

// ---------- a minimal DOM, enough for installActivity, that counts every text write ----------
class El {
  tagName: string; id = ""; className = ""; hidden = false; writes = 0; private text = "";
  dataset: Record<string, string> = {}; children: El[] = []; attrs = new Map<string, string>();
  classList = { contains: () => false };
  constructor(tag: string) { this.tagName = tag.toUpperCase(); }
  get textContent() { return this.text; }
  set textContent(v: string) { this.writes++; this.text = v; }
  setAttribute(k: string, v: string) { this.attrs.set(k, String(v)); }
  getAttribute(k: string) { return this.attrs.has(k) ? this.attrs.get(k)! : null; }
  removeAttribute(k: string) { this.attrs.delete(k); }
  hasAttribute(k: string) { return this.attrs.has(k); }
  append(...c: El[]) { this.children.push(...c); }
  querySelector() { return null; }
  closest() { return this; }
  get innerText() { return this.text; }
}
const listeners: Record<string, ((e: unknown) => void)[]> = {};
const g = globalThis as Record<string, unknown> & typeof globalThis;
const had = { window: g.window, document: g.document, location: g.location, history: g.history, addEventListener: g.addEventListener, fetch: g.fetch };

describe("P5-032: the live notice is not rewritten while nothing about it changes", () => {
  afterAll(() => { vi.useRealTimers(); Object.assign(g, had); });

  it("a request that runs 12 s writes the notice's words when they change, not every second", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"] });
    Object.assign(g, {
      window: g,
      document: { createElement: (t: string) => new El(t), body: new El("body"), documentElement: { dataset: {} },
        addEventListener: (t: string, f: (e: unknown) => void) => { (listeners[t] ??= []).push(f); } },
      location: { href: "http://127.0.0.1:3000/collector", origin: "http://127.0.0.1:3000", pathname: "/collector", search: "" },
      history: { pushState() {}, replaceState() {} },
      addEventListener: () => {},
      fetch: () => new Promise<Response>(() => undefined) // the server never answers within the test
    });
    const { installActivity } = await import("@/lib/activity/install");
    installActivity();
    const body = (g.document as unknown as { body: El }).body;
    const pill = body.children[1], veil = body.children[2];
    expect(pill.getAttribute("aria-live")).toBe("polite");
    const main = pill.children[1].children[0], sub = pill.children[1].children[1], veilText = veil.children[0].children[1];
    const writes = () => ({ main: main.writes, sub: sub.writes, veil: veilText.writes });

    const btn = new El("button"); btn.setAttribute("aria-label", "Verify");
    for (const f of listeners.pointerdown ?? []) f({ button: 0, target: btn });
    for (const f of listeners.click ?? []) f({ target: btn, detail: 1 });
    void (g.window as typeof globalThis).fetch("/api/collector/decisions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ incidentId: "INC-1", decision: "verify" }) });
    expect(pill.dataset.state).toBe("busy");
    const words = main.textContent;
    expect(words.length).toBeGreaterThan(0);

    const start = writes();
    vi.advanceTimersByTime(5000); // five ticks, nothing new to say
    expect(writes()).toEqual(start);
    vi.advanceTimersByTime(3000); // past 7 s: the "longer than usual" line appears, once
    expect(sub.hidden).toBe(false);
    expect(sub.textContent.length).toBeGreaterThan(0);
    expect(writes()).toEqual({ ...start, sub: start.sub + 1 });
    vi.advanceTimersByTime(4000); // four more ticks, still nothing new
    expect(writes()).toEqual({ ...start, sub: start.sub + 1 });
    expect(main.textContent).toBe(words);

    // a click on another control that starts a new notice in the same words is still written (announced) once, then left alone
    // (the first button is busy: its own clicks are dropped, click-layer-03)
    const btn2 = new El("button"); btn2.setAttribute("aria-label", "Verify");
    for (const f of listeners.pointerdown ?? []) f({ button: 0, target: btn2 });
    for (const f of listeners.click ?? []) f({ target: btn2, detail: 1 });
    void (g.window as typeof globalThis).fetch("/api/collector/decisions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ incidentId: "INC-2", decision: "verify" }) });
    expect(main.textContent).toBe(words);
    const second = main.writes;
    expect(second).toBeGreaterThan(start.main);
    vi.advanceTimersByTime(4000);
    expect(main.writes).toBe(second);
  });
});
