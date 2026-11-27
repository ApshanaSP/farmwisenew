/**
 * The Overview's rows (27 Nov 2026):
 *  - by severity: a line of title and ONE line of facts again (the 26 Nov rule put the reason on a line of its own, so a row took two or
 *    three lines and only three rows showed); the reason chip's words end in "…" and the row's tooltips hold the whole reason and facts;
 *    the map is narrower (1.6 : 1.2 : 1.2), so the severity rows and Latest news have room;
 *  - Latest news: a story in Tamil shows its Tamil headline as published, marked translate="no" (since 6 Oct it was only a tooltip).
 */
import React, { createElement } from "react";
import { readFileSync } from "fs";
import { join } from "path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { Console } from "./CollectorApp";

const L = vi.hoisted(() => ({ lang: "en" as "en" | "ta" }));
vi.mock("@/lib/i18n/lang", async (orig) => ({ ...(await orig<typeof import("@/lib/i18n/lang")>()), useLang: () => [L.lang, () => undefined] }));
(globalThis as { React?: unknown }).React = React;

const { NewsStory, NewsItem } = await import("./Overview");
const { AttentionCard } = await import("./Attention");
type Story = Parameters<typeof NewsStory>[0]["i"];

const NOW = "2026-11-27 10:00:00";
const c = { conflicts: null, openStory: () => undefined, openInc: () => undefined } as unknown as Console;
const story = (o: Partial<Story>): Story => ({
  id: "D1", title: "Accident as tipper lorry hits retaining wall of Mahalingapuram flyover", original: null, taLead: false, url: null, loc: "Nungambakkam", t: "2026-11-27 08:00:00",
  incident: null, sev: null, grievances: 0, complaints: 0, outletNames: ["Dinakaran"], docIds: ["D1"], headlines: 1, topic: null, sources: [],
  desk: { v: "know", area: "Roads & transport", gist: "The driver escaped with minor injuries.", why: "", cat: "" }, ...o
} as Story);
const TA = "சென்னை மகாலிங்கபுரம் மேம்பாலத்தின் தடுப்புச்சுவரில் டிப்பர் லாரி மோதி விபத்து";
const html = (i: Story) => renderToStaticMarkup(createElement(NewsStory, { i, now: NOW, c }));

describe("Latest news: Tamil headlines are shown", () => {
  it("a Tamil-led story: the Tamil headline first (translate=no), the English line under it", () => {
    L.lang = "en";
    const h = html(story({ original: TA, taLead: true }));
    expect(h).toMatch(new RegExp(`<b lang="ta" translate="no"[^>]*>${TA}</b><span class="nw-en"[^>]*>Accident as tipper lorry`));
    expect(h.indexOf(TA)).toBeLessThan(h.indexOf("Accident as tipper lorry"));
  });
  it("a story with English and Tamil reports: English first, the Tamil line under it (translate=no)", () => {
    L.lang = "en";
    const h = html(story({ original: TA, taLead: false }));
    expect(h).toMatch(new RegExp(`<b[^>]*>Accident as tipper lorry[^<]*</b><span class="nw-ta" lang="ta" translate="no"[^>]*>${TA}</span>`));
    expect(h).not.toContain("nw-en");
  });
  it("an English story: as before, no Tamil", () => {
    L.lang = "en";
    const h = html(story({}));
    expect(h).not.toContain('lang="ta"');
    expect(h).toContain("<b>Accident as tipper lorry");
  });
  it("the site in Tamil: the Tamil headline alone, for a Tamil-led and a mixed story (no English line to translate back)", () => {
    L.lang = "ta";
    for (const taLead of [true, false]) {
      const h = html(story({ original: TA, taLead }));
      expect(h).toMatch(new RegExp(`<b lang="ta" translate="no"[^>]*>${TA}</b>`));
      expect(h).not.toContain("Accident as tipper lorry");
    }
    L.lang = "en";
  });
  it("the filtered view's rows carry the Tamil headline too", () => {
    L.lang = "en";
    const row = { id: "INC-1", title: "Tipper lorry accident", news_title: "Accident as tipper lorry hits retaining wall", news_ta: TA, news_ta_lead: true, outletNames: ["Dinakaran"], zone_name: "Teynampet", t: "2026-11-27 08:00:00" };
    const h = renderToStaticMarkup(createElement(NewsItem, { i: row, now: NOW, c }));
    expect(h).toMatch(new RegExp(`<b lang="ta" translate="no"[^>]*>${TA}</b><span class="nw-en"`));
  });
  it("news.css clamps the extra lines and hides the English line with the site in Tamil", () => {
    const css = readFileSync(join(__dirname, "news.css"), "utf8");
    expect(css).toMatch(/\.dic \.brief \.nw-en,\.dic \.brief \.nw-ta\{display:-webkit-box;-webkit-line-clamp:1;/);
    expect(css).toMatch(/\.dic \.brief\.nw \.nw-en~\.nw-g,\.dic \.brief\.nw \.nw-ta~\.nw-g\{-webkit-line-clamp:1\}/);
    expect(css).toContain('html[data-lang="ta"] .dic .nw-en,html[data-lang="ta"] .dic .nw-left .nw-left-t .nw-en{display:none}');
  });
});

describe("by severity: one line of facts, the whole of it on hover", () => {
  const row = { id: "INC-7", sev: "Severe", title: "Tree falls across road at Pattalam", type: "Tree fall", zone_name: "Thiru-Vi-Ka-Nagar", dept_name: "PWD Water Resources", dept: "PWD",
    t: "2026-11-27 02:00:00", grouped: 2, why: { needsYou: true, attention: ["Needs several departments to act together", "Still open past its deadline"] } };
  const d = { severity: { counts: { Severe: 1, High: 0, Medium: 0, Low: 0 }, rows: [row] }, tasks: { count: 0, rows: [], leftToDepts: 0 }, now: NOW };
  const cc = { ...c, sevTab: null, focus: null, periodLabel: "Today", setSevTab: () => undefined, openList: () => undefined, highlight: () => undefined, openAction: () => undefined, busyIds: new Set() } as unknown as Console;
  const h = renderToStaticMarkup(createElement(AttentionCard, { d: d as never, c: cc, only: "sev" }));
  const facts = "Thiru-Vi-Ka-Nagar · PWD Water Resources · 8 hrs ago · 2 merged";

  it("the reason's words sit in a span (cut with an ellipsis), then the facts on the same line", () => {
    expect(h).toContain(`<em><svg`);
    expect(h).toMatch(/<\/svg><span>Needs several departments to act together<\/span><\/em>Thiru-Vi-Ka-Nagar · PWD Water Resources · 8 hrs ago · 2 merged<\/small>/);
  });
  it("the facts line's tooltip has every reason and the facts; the row's has the title too", () => {
    expect(h).toContain(`<small title="Needs several departments to act together\nStill open past its deadline\n${facts}">`);
    expect(h).toContain(`<button class="att-main" title="Tree falls across road at Pattalam\nNeeds several departments to act together\nStill open past its deadline\n${facts}">`);
  });
  it("clear.css no longer puts the reason and the facts on lines of their own; the grid is 1.6 : 1.2 : 1.2", () => {
    const clear = readFileSync(join(__dirname, "clear.css"), "utf8");
    expect(clear).not.toMatch(/\.att-row\.need \.att-txt small\s*,[^{]*\{white-space:normal/);
    expect(clear).not.toMatch(/\.att-row\.(need|task2) \.att-txt small em/);
    expect(readFileSync(join(__dirname, "attention.css"), "utf8")).toContain(".dic .att-txt em>span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}");
    const ov = readFileSync(join(__dirname, "Overview.tsx"), "utf8");
    expect(ov).toContain(`gridTemplateColumns: ["minmax(0,1.6fr)", ...r0.slice(1).map(() => "minmax(0,1.2fr)")].join(" ")`);
  });
});
