import React, { act, createElement } from "react";
import { parseHTML } from "linkedom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// journeys-02: once /track showed a status the form was gone for good: the result card had no control that cleared it, so checking a
// second slip meant reloading the page (and a page opened from a QR code reloaded straight back to the same result).
vi.mock("@/components/manu/manu.css", () => ({}));
// this vitest config compiles .tsx with the classic JSX runtime
(globalThis as { React?: unknown }).React = React;
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const VIEW = { code: "2026-111AAA", status: "In Progress", filedAt: "2026-11-01 10:00:00", department: "Solid Waste Management", dueBy: null,
  steps: [{ status: "Complaint Filed", stage: "filed", note: null, at: "2026-11-01 10:00:00" }] };

type G = Record<string, unknown>;
const saved: G = {};
let doc: Document, win: Window & typeof globalThis, replaced: string[];

beforeEach(() => {
  const { window, document } = parseHTML("<!doctype html><html><body><div id=root></div></body></html>");
  doc = document as unknown as Document;
  win = window as unknown as Window & typeof globalThis;
  replaced = [];
  Object.defineProperty(win, "location", { configurable: true, value: { search: "?code=2026-111AAA&k=abc", pathname: "/track", href: "http://x/track?code=2026-111AAA&k=abc" } });
  Object.defineProperty(win, "history", { configurable: true, value: { state: null, replaceState: (_s: unknown, _t: string, url: string) => replaced.push(url) } });
  for (const k of ["window", "document", "HTMLElement", "HTMLInputElement", "Node", "Event"]) saved[k] = (globalThis as G)[k];
  Object.assign(globalThis as G, { window: win, document: doc, HTMLElement: (win as unknown as G).HTMLElement, HTMLInputElement: (win as unknown as G).HTMLInputElement, Node: (win as unknown as G).Node, Event: (win as unknown as G).Event });
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(VIEW), { status: 200, headers: { "Content-Type": "application/json" } })));
});
afterEach(() => { Object.assign(globalThis as G, saved); vi.unstubAllGlobals(); });

const flush = async () => { for (let i = 0; i < 5; i++) await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); };
const button = (text: RegExp) => (Array.from(doc.querySelectorAll("button")) as HTMLButtonElement[]).find((b) => text.test(b.textContent ?? ""));

describe("journeys-02: /track can check another number after showing a status", () => {
  it("a QR link shows the status, and 'Check another number' brings back an empty form and drops the key from the address", async () => {
    const { createRoot } = await import("react-dom/client");
    const { default: TrackPage } = await import("./page");
    const root = createRoot(doc.getElementById("root")!);
    await act(async () => { root.render(createElement(TrackPage)); });
    await flush();
    expect(doc.body.textContent).toContain("In Progress");
    expect(doc.querySelector("form")).toBeNull();

    const again = button(/check another/i);
    expect(again, "a control on the result card that clears it").toBeTruthy();
    expect(again!.getAttribute("type")).toBe("button");
    await act(async () => { again!.dispatchEvent(new (win as unknown as { Event: typeof Event }).Event("click", { bubbles: true })); });
    await flush();

    expect(doc.body.textContent).not.toContain("In Progress");
    const inputs = Array.from(doc.querySelectorAll("form input")) as HTMLInputElement[];
    expect(inputs).toHaveLength(2);
    expect(inputs.map((i) => i.value)).toEqual(["", ""]);
    // the slip's key must not stay in the address: a reload would show the old result again
    expect(replaced.at(-1)).toBe("/track");
    await act(async () => { root.unmount(); });
  });
});
