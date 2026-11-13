import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ExportBody } from "./Overlays";
import { listScopeWords, scopeWords } from "./lib";
import type { Console } from "./CollectorApp";

// reviewerE-03 (on console-sync-02): scopeWords became the one rule for the scope in words, but two captions in Overlays.tsx kept their own:
// the incident list's caption said "District-wide" under a taluk or category filter, and the Export dialog left the category out while
// the PDF it builds is filtered by it.
(globalThis as { React?: unknown }).React = React;

const taluks: Record<string, string> = { "TLK-MYL": "Mylapore" };
const console_ = (over: Partial<Console> = {}) => ({
  period: "weekly", zone: null, zoneName: null, dept: null, deptName: null, cat: "SOLID_WASTE", catLabel: "Garbage & sanitation",
  taluk: "TLK-MYL", talukName: (code: string | null) => (code ? taluks[code] ?? code : null),
  depts: [{ code: "GCC-SWD", name: "Storm Water Drains" }],
  scopeName: scopeWords({ zoneName: null, deptName: null, catLabel: "Garbage & sanitation", talukName: "Mylapore" }),
  ...over
}) as unknown as Console;

describe("reviewerE-03: the list caption and the Export dialog name every filter", () => {
  it("the list's caption names the taluk and category its request carries, not 'District-wide'", () => {
    const c = console_();
    expect(listScopeWords(c, { cat: "SOLID_WASTE", taluk: "TLK-MYL" })).toBe("Garbage & sanitation · Mylapore taluk");
    expect(listScopeWords(c, { cat: "SOLID_WASTE", taluk: "TLK-MYL" })).toBe(c.scopeName); // the same words as the list's title
    expect(listScopeWords(c, {})).toBe("District-wide");
    // the list's own department filter, and a list that asks for any zone
    expect(listScopeWords(console_({ zoneName: "Teynampet" } as Partial<Console>), { dept: "GCC-SWD" })).toBe("Teynampet · Storm Water Drains");
    expect(listScopeWords(console_({ zoneName: "Teynampet" } as Partial<Console>), { anyZone: true })).toBe("District-wide");
  });

  it("the Export dialog's subtitle names the category the PDF is filtered by", () => {
    const html = renderToStaticMarkup(createElement(ExportBody, { c: console_() }));
    const small = /<small>([^<]*(?:<!-- -->[^<]*)*)<\/small>/.exec(html)?.[1]?.replace(/<!-- -->/g, "").replace(/&amp;/g, "&") ?? "";
    expect(small).toContain("Garbage & sanitation");
    expect(small).toContain("Mylapore taluk");
    expect(small).not.toMatch(/whole district/i);
  });
});
