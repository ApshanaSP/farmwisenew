// hunt-citizen: reproductions. Open bugs are it.fails; the fixer turns them into it().
import { describe, it, expect, vi, afterEach } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

(globalThis as any).React = React;
vi.mock("next/link", () => ({ default: (p: any) => React.createElement("a", { href: p.href }, p.children) }));

describe("hunt-citizen", () => {
  afterEach(() => { vi.useRealTimers(); delete process.env.TZ; });

  // 01:30 IST on 7 Nov 2026 is 20:00 UTC on 6 Nov. The portal server runs in UTC, the citizen's browser in IST.
  // The server prints "Friday, 6 November", the browser "Saturday, 7 November": React hydration error 425 in the console,
  // and for a moment (or for good on a cached page) the wrong day.
  it.fails("hunt-citizen-1: the citizen home date is the Chennai date even when the server clock is UTC", async () => {
    process.env.TZ = "UTC";
    vi.useFakeTimers({ now: new Date("2026-11-06T20:00:00Z"), toFake: ["Date"] });
    const mod = await import("@/components/citizen/CitizenHome");
    const html = renderToStaticMarkup(React.createElement(mod.default as any, { name: "Qa", stats: { total: 0, open: 0, resolved: 0 }, recent: [] }));
    expect(html.match(/(Friday|Saturday),? [0-9]+ November/)?.[0]).toMatch(/^Saturday,? 7 November$/);
  });
});
