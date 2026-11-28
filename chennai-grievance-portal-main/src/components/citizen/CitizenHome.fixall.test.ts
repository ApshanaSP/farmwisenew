// 28 Nov: the citizen home in the consoles' layout (the green band with the day, the greeting, the two main actions and the three counts;
// then the cards). Rendered on the server's clock in UTC, as the portal runs, so the day is still Chennai's (hunt-citizen-1).
import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

(globalThis as { React?: unknown }).React = React;
vi.mock("next/link", () => ({ default: (p: { href: string; className?: string; children?: React.ReactNode }) => createElement("a", { href: p.href, className: p.className }, p.children) }));

const recent = [{ code: "2026-111AAA", title: "Garbage bin overflowing", status: "In Progress", createdAt: "2026-11-27T05:00:00.000Z", department: "Solid Waste Management" }];

describe("the citizen home, laid out as the consoles' Overview", () => {
  afterEach(() => { vi.useRealTimers(); delete process.env.TZ; });

  it("the band holds the Chennai day, the greeting (the page's one h1), both main actions and the three counts", async () => {
    process.env.TZ = "UTC";
    vi.useFakeTimers({ now: new Date("2026-11-06T20:00:00Z"), toFake: ["Date"] });
    const { default: CitizenHome } = await import("./CitizenHome");
    const html = renderToStaticMarkup(createElement(CitizenHome, { name: "Qa", stats: { total: 4, open: 3, resolved: 1 }, recent: recent as never }));
    const band = html.slice(html.indexOf('class="cz-band"'), html.indexOf('class="cz-card"'));
    expect(band).toMatch(/Saturday,? 7 November/);
    expect(html.match(/<h1\b/g)).toHaveLength(1);
    // 29 Nov: Vanakkam, வணக்கம், then the name, one under the other
    expect(band).toMatch(/<h1[^>]*><span class="cz-hi">Vanakkam<\/span><span class="cz-hi ta" lang="ta">வணக்கம்<\/span><span class="cz-hi-name" translate="no">Qa<\/span>/);
    expect(band).toContain('href="/citizen/file-complaint"');
    expect(band).toContain('href="/citizen/track-complaints"');
    for (const l of ["Total filed", "In progress", "Resolved"]) expect(band).toContain(l);
    expect(band).toContain("25% of yours");
  });

  it("then the cards, each headed by an h2 (no heading level skipped), the recent complaint linking to its journey", async () => {
    const { default: CitizenHome } = await import("./CitizenHome");
    const html = renderToStaticMarkup(createElement(CitizenHome, { name: null, stats: { total: 1, open: 1, resolved: 0 }, recent: recent as never }));
    expect([...html.matchAll(/<h2>([^<]+)<\/h2>/g)].map((m) => m[1])).toEqual(["Recent complaints", "Quick actions"]);
    expect(html).not.toMatch(/<h3\b/);
    expect(html).toContain('href="/citizen/track-complaints?code=2026-111AAA"');
    expect(html).toContain('href="tel:1913"');
  });

  it("no complaints yet: the empty card says so and offers to file one", async () => {
    const { default: CitizenHome } = await import("./CitizenHome");
    const html = renderToStaticMarkup(createElement(CitizenHome, { name: null, stats: { total: 0, open: 0, resolved: 0 }, recent: [] }));
    expect(html).toContain("You haven&#x27;t filed any complaints yet");
    expect(html).not.toContain("% of yours");
  });
});
