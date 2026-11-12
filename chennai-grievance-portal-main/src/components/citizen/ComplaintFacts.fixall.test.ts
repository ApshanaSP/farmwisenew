import fs from "node:fs";
import path from "node:path";
import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { parseHTML } from "linkedom";
import { Building2, CalendarDays, MapPin, Tag } from "lucide-react";
import { describe, expect, it } from "vitest";
import { ComplaintFacts, ComplaintPlace } from "./ComplaintFacts";

// P6-031: axe (serious) on /citizen/track-complaints at 1280 px: definition-list and dlitem. Both <dl>s on the complaint view had
// wrappers inside them: the facts grid put an icon and a second <div> around each <dt>/<dd>, and the side panel put Ward and
// Anonymous in a flex <div> around two more <div>s. Screen readers then cannot pair a label with its value.
// this vitest config compiles .tsx with the classic JSX runtime
(globalThis as { React?: unknown }).React = React;

/** What axe's definition-list and dlitem rules check, on static HTML: each problem in a sentence, none when the lists are sound. */
function dlProblems(html: string): string[] {
  const { document } = parseHTML(`<!doctype html><html><body>${html}</body></html>`);
  const out: string[] = [];
  const tag = (e: Element) => e.tagName.toLowerCase();
  for (const dl of document.querySelectorAll("dl")) {
    for (const c of Array.from(dl.children) as Element[]) {
      if (tag(c) === "dt" || tag(c) === "dd") continue;
      if (tag(c) !== "div") { out.push(`<dl> holds a <${tag(c)}>`); continue; }
      const kids = (Array.from(c.children) as Element[]).map(tag);
      if (kids.some((k) => k !== "dt" && k !== "dd")) out.push(`a <div> in a <dl> holds ${kids.filter((k) => k !== "dt" && k !== "dd").map((k) => `<${k}>`).join(", ")}`);
      else if (!kids.includes("dt") || !kids.includes("dd") || kids.lastIndexOf("dt") > kids.indexOf("dd")) out.push(`a <div> in a <dl> is not <dt>s then <dd>s: ${kids.join(" ")}`);
      if (Array.from(c.childNodes).some((n) => n.nodeType === 3 && (n.textContent ?? "").trim())) out.push("a <div> in a <dl> holds bare text");
    }
    if (Array.from(dl.childNodes).some((n) => n.nodeType === 3 && (n.textContent ?? "").trim())) out.push("<dl> holds bare text");
  }
  for (const d of document.querySelectorAll("dt, dd")) {
    const p = d.parentElement;
    const ok = p && (tag(p) === "dl" || (tag(p) === "div" && p.parentElement && tag(p.parentElement) === "dl"));
    if (!ok) out.push(`<${tag(d)}> "${d.textContent}" is not inside a <dl> group`);
  }
  return out;
}

const facts = [
  { icon: Building2, label: "Department", value: "Solid Waste Management" },
  { icon: Tag, label: "Type", value: "Garbage not cleared" },
  { icon: MapPin, label: "Location", value: "Gandhi Street, Teynampet" },
  { icon: CalendarDays, label: "Filed on", value: "12 Nov 2026" }
];

describe("P6-031: the complaint view's label/value lists are sound definition lists", () => {
  it("the checker catches the markup axe flagged (an icon and a nested <div> inside a <dl> group, a flex <div> around two groups)", () => {
    const before = `<dl><div class="flex"><svg aria-hidden="true"></svg><div><dt>Department</dt><dd>SWM</dd></div></div></dl>
      <dl><div><dt>Street</dt><dd>x</dd></div><div class="flex gap-6"><div><dt>Ward</dt><dd>9</dd></div><div><dt>Anonymous</dt><dd>No</dd></div></div></dl>`;
    expect(dlProblems(before).length).toBeGreaterThanOrEqual(3);
  });

  it("the facts under the title: every group is a <div> of one <dt> and one <dd>, the icon inside the <dt>", () => {
    const html = renderToStaticMarkup(createElement(ComplaintFacts, { facts, className: "mt-4" }));
    expect(dlProblems(html)).toEqual([]);
    const { document } = parseHTML(`<html><body>${html}</body></html>`);
    const dts = Array.from(document.querySelectorAll("dl > div > dt")) as Element[];
    expect(dts.map((d) => d.textContent)).toEqual(facts.map((f) => f.label));
    expect(dts.every((d) => d.querySelector("svg[aria-hidden='true']"))).toBe(true);
    expect((Array.from(document.querySelectorAll("dl > div > dd")) as Element[]).map((d) => d.textContent)).toEqual(facts.map((f) => f.value));
  });

  it("the side panel: Street, Specific location, Ward, Anonymous and Description, each its own group", () => {
    const html = renderToStaticMarkup(createElement(ComplaintPlace, { street: "Gandhi Street", specificLocation: "", ward: 117, anonymous: false, description: "Bin overflowing" }));
    expect(dlProblems(html)).toEqual([]);
    const { document } = parseHTML(`<html><body>${html}</body></html>`);
    const pairs = (Array.from(document.querySelectorAll("dl > div")) as Element[]).map((g) => [g.querySelector("dt")?.textContent, g.querySelector("dd")?.textContent]);
    expect(pairs).toEqual([["Street", "Gandhi Street"], ["Specific location", "—"], ["Ward", "117"], ["Anonymous", "No"], ["Description", "Bin overflowing"]]);
  });

  it("the page draws its lists with these components, not with its own <dl> markup", () => {
    const page = fs.readFileSync(path.join(process.cwd(), "src", "app", "citizen", "track-complaints", "page.tsx"), "utf8");
    expect(page).not.toMatch(/<dl[\s>]/);
    expect(page).not.toMatch(/<d[td][\s>]/);
    expect(page).toMatch(/<ComplaintFacts\b/);
    expect(page).toMatch(/<ComplaintPlace\b/);
  });
});
