// QA pass 5, P5-010 regression test, from the seam hunter's probe (tests/qa/pass5/probes/seam/activity-confirm.test.ts), with its last two
// expectations turned round: a guarded action that is waiting for the password, or was cancelled, is never announced as done.
// QA pass 5, seam probe: main's click-feedback layer (src/lib/activity/install.ts) judges a request by r.ok. Pass 4 (da94e35, RC-48)
// made every guarded route answer the console's own fetch with a 200 plus "x-diq-confirm: required" instead of a 428, so the
// confirm box can ask for the password without the browser logging an error. On the merged tree the activity layer therefore
// announces the guarded action as DONE ("Your decision has been recorded.") while the password box is still open, and keeps that
// announcement when the Collector cancels and nothing was done.
//
// The console (CollectorApp / OfficerApp, which mount ConfirmHost) always mounts after the root layout's ActivityLayer on a
// client-side navigation from /login, and after the streamed loading.tsx on a reload, so ConfirmHost wraps the activity fetch.
import { afterAll, describe, expect, it, vi } from "vitest";

// ---------- a minimal DOM, enough for installActivity ----------
class El {
  tagName: string; id = ""; className = ""; textContent = ""; hidden = false;
  dataset: Record<string, string> = {}; children: El[] = []; attrs = new Map<string, string>();
  classList = { contains: () => false };
  constructor(tag: string) { this.tagName = tag.toUpperCase(); }
  setAttribute(k: string, v: string) { this.attrs.set(k, String(v)); }
  getAttribute(k: string) { return this.attrs.has(k) ? this.attrs.get(k)! : null; }
  removeAttribute(k: string) { this.attrs.delete(k); }
  hasAttribute(k: string) { return this.attrs.has(k); }
  append(...c: El[]) { this.children.push(...c); }
  querySelector() { return null; }
  closest() { return this; }
  get innerText() { return this.textContent; }
}
const listeners: Record<string, ((e: unknown) => void)[]> = {};
const g = globalThis as any;
g.window = g;
g.document = {
  createElement: (t: string) => new El(t), body: new El("body"), documentElement: { dataset: {} },
  addEventListener: (t: string, f: (e: unknown) => void) => { (listeners[t] ??= []).push(f); }
};
g.location = { href: "http://127.0.0.1:3000/collector", origin: "http://127.0.0.1:3000", pathname: "/collector", search: "" };
g.history = { pushState() {}, replaceState() {} };
g.addEventListener = () => {};
g.requestAnimationFrame = (cb: () => void) => setTimeout(cb, 0);

// ---------- the server: a guarded route that has not been confirmed ----------
const calls: { url: string; soft: string | null; grant: string | null }[] = [];
g.fetch = async (input: string, init?: RequestInit) => {
  const h = new Headers(init?.headers);
  calls.push({ url: String(input), soft: h.get("x-diq-confirm"), grant: h.get("x-diq-grant") });
  const body = JSON.stringify({ error: "Confirm it's you first.", confirm: { action: "decide", title: "Record a decision", summary: "Verify 1 case", scope: "abc" } });
  // exactly what lib/security/stepup.ts requireConfirm returns: soft (200 + header) for the console's own fetch, else 428
  return h.get("x-diq-confirm") === "json"
    ? new Response(body, { status: 200, headers: { "x-diq-confirm": "required", "content-type": "application/json" } })
    : new Response(body, { status: 428, headers: { "content-type": "application/json" } });
};

// ---------- ConfirmHost, run as its effect runs in the browser ----------
let ask: any = null;
vi.mock("react", async (orig) => ({
  ...(await orig<typeof import("react")>()),
  useState: (init: unknown) => [typeof init === "function" ? (init as () => unknown)() : init, (v: unknown) => { ask = v; }],
  useRef: (v: unknown) => ({ current: v }),
  useEffect: (fn: () => void) => { fn(); }
}));

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("seam: activity layer x pass-4 soft confirm answer", () => {
  afterAll(() => { delete g.window; delete g.document; });
  it("announces a guarded decision as recorded while the password box is open, and after it is cancelled", async () => {
    const { installActivity } = await import("@/lib/activity/install");
    installActivity(); // root layout's ActivityLayer
    const { default: ConfirmHost } = await import("@/components/security/Confirm");
    ConfirmHost(); // the console mounts later: its effect wraps the activity layer's fetch

    const pill = (g.document.body as El).children[1];
    const mainText = () => pill.children[1].children[0].textContent;

    // the Collector clicks "Verify" on a case
    const btn = new El("button"); btn.setAttribute("aria-label", "Verify");
    for (const f of listeners.pointerdown ?? []) f({ button: 0, target: btn });
    for (const f of listeners.click ?? []) f({ target: btn, detail: 1 });
    const done = (window as any).fetch("/api/collector/decisions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ incidentId: "INC-1", decision: "verify" }) });

    for (let i = 0; i < 50 && !ask; i++) await sleep(20);
    expect(ask?.summary).toBe("Verify 1 case"); // the password box is open
    await sleep(700); // the activity layer's minimum show time is 450 ms
    const shownWhileAsking = { state: pill.dataset.state, text: mainText() };

    ask.done(null); // the Collector cancels: nothing is done
    const r: Response = await done;
    const j = await r.json();
    await sleep(50);
    const shownAfterCancel = { state: pill.dataset.state, text: mainText() };

    expect(r.status).toBe(428);
    expect(j.cancelled).toBe(true);
    expect(calls.filter((c) => c.grant).length).toBe(0); // the route never ran with a grant: nothing was recorded
    // nothing was recorded, so nothing says it was
    expect(shownWhileAsking.text).not.toBe("Your decision has been recorded."); expect(shownWhileAsking.state).not.toBe("ok");
    expect(shownAfterCancel.text).not.toBe("Your decision has been recorded."); expect(shownAfterCancel.state).not.toBe("ok");
  });
});
