import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Bell, bellGroups, type BellItem } from "./Shell";
import { ms } from "./lib";

// console-sync-11: the bell filed everything older than an hour under "Earlier today", weeks-old items too in a 90-day view, and its heading
// said "last 24 hours" whatever the period.
(globalThis as { React?: unknown }).React = React;

const item = (id: string, t: string): BellItem => ({ id, title: id, sub: "", sev: "High", t: ms(t), icon: "bell" as BellItem["icon"] });
const NOW = ms("2026-11-13 00:30:00"); // half past midnight, IST

describe("console-sync-11: the bell groups alerts by when they came, in IST", () => {
  it("the last hour is Now, the rest of today Earlier today, anything before today Earlier", () => {
    const g = bellGroups([item("a", "2026-11-13 00:10:00"), item("b", "2026-11-12 23:00:00"), item("c", "2026-10-20 09:00:00"),
      item("d", "2026-11-13 00:20:00")], NOW);
    expect(g.map((x) => [x.l, x.rows.map((r) => r.id)])).toEqual([["Now", ["a", "d"]], ["Earlier", ["b", "c"]]]);
    const noon = ms("2026-11-13 12:00:00");
    expect(bellGroups([item("a", "2026-11-13 09:00:00"), item("b", "2026-11-12 18:00:00")], noon).map((x) => [x.l, x.rows.map((r) => r.id)]))
      .toEqual([["Earlier today", ["a"]], ["Earlier", ["b"]]]);
  });
  it("the heading names the period the alerts are from", () => {
    const html = renderToStaticMarkup(createElement(Bell, { items: [item("c", "2026-10-20 09:00:00")], unread: 1, open: true, onToggle: () => undefined,
      onPick: () => undefined, onMarkRead: () => undefined, nowMs: NOW, period: "Last 90 days" }));
    expect(html).toContain("Severe and high · last 90 days");
    expect(html).not.toContain("Earlier today");
  });
});
