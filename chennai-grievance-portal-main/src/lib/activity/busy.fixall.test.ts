// P5-033 part click-layer-03: the second click of a fast double click passed through a busy button to whatever was under it (on
// /login it hit the form; in a clickable row or over a modal's backdrop it would open the row or close the modal). The stylesheet
// made a busy control pointer-events: none, so the browser's hit test skipped it. Now the control keeps its clicks and the
// activity layer drops them (and a key press that clicks it again).
import fs from "node:fs";
import path from "node:path";
import { parseHTML } from "linkedom";
import { afterAll, describe, expect, it } from "vitest";

type G = Record<string, unknown>;
const g = globalThis as unknown as G;
const saved: G = {};
const { window, document } = parseHTML(`<!doctype html><html><body><div id="row" role="link"><span>Case INC-1</span><button id="go">Verify</button></div></body></html>`);
for (const k of ["window", "document", "location", "history", "requestAnimationFrame", "__diqActivity"]) saved[k] = g[k];
Object.assign(g, {
  window, document, __diqActivity: undefined, requestAnimationFrame: (cb: () => void) => setTimeout(cb, 0),
  location: { href: "http://127.0.0.1:3000/officer", origin: "http://127.0.0.1:3000", pathname: "/officer", search: "" },
  history: { pushState() {}, replaceState() {} }
});
(window as unknown as G).fetch = async () => new Response("{}");
afterAll(() => Object.assign(g, saved));
// linkedom runs capture listeners at bubble time, so the browser's order is played here: the document's capture listeners first,
// then (unless one stopped it) the click goes to the button and bubbles to the row
const capture: ((e: unknown) => void)[] = [];
const realAdd = document.addEventListener.bind(document);
document.addEventListener = ((t: string, f: (e: unknown) => void, o?: boolean | AddEventListenerOptions) => {
  if (t === "click" && (o === true || (typeof o === "object" && o?.capture))) capture.push(f); else realAdd(t, f as never, o);
}) as typeof document.addEventListener;

describe("click-layer-03: a busy control keeps its clicks", () => {
  it("a click on a busy button never reaches the row under it, and its default (a form submit) is cancelled", async () => {
    const { installActivity } = await import("@/lib/activity/install");
    installActivity();
    const row = document.getElementById("row")!, btn = document.getElementById("go")!;
    const rowClicks: string[] = [];
    row.addEventListener("click", () => rowClicks.push("row"));
    btn.addEventListener("click", () => rowClicks.push("button"));

    const click = () => {
      const e = { target: btn, defaultPrevented: false, stopped: false, preventDefault() { this.defaultPrevented = true; }, stopImmediatePropagation() { this.stopped = true; }, stopPropagation() { this.stopped = true; } };
      for (const f of capture) { f(e); if (e.stopped) return e; }
      btn.dispatchEvent(new (window as unknown as { Event: typeof Event }).Event("click", { bubbles: true, cancelable: true }));
      return e;
    };
    click();
    expect(rowClicks).toEqual(["button", "row"]); // not busy: an ordinary click

    rowClicks.length = 0;
    btn.setAttribute("data-diq-busy", ""); // what the layer sets while the button's request runs
    const e = click();
    expect(rowClicks).toEqual([]);
    expect(e.defaultPrevented).toBe(true);

    btn.removeAttribute("data-diq-busy");
    click();
    expect(rowClicks).toEqual(["button", "row"]);
  });

  it("the stylesheet no longer lets the hit test skip a busy control (pointer-events: none)", () => {
    const css = fs.readFileSync(path.join(process.cwd(), "src", "components", "activity", "activity.css"), "utf8");
    const rule = css.match(/\[data-diq-busy\]\s*\{[^}]*\}/)?.[0] ?? "";
    expect(rule).toMatch(/opacity/);
    expect(rule).not.toMatch(/pointer-events\s*:\s*none/);
  });
});
