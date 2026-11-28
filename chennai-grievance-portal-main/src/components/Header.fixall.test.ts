// 28 Nov: the citizen top bar is the consoles' own (marina.css .top): the logo and the place, the pages as tabs (the page you are on marked),
// the helpline, English / தமிழ், the theme and the account. Under 1024 px the same pages as a bottom bar. Read from the rendered markup.
import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

(globalThis as { React?: unknown }).React = React;
vi.mock("next/link", () => ({
  default: (p: Record<string, unknown> & { href: string; children?: React.ReactNode }) => {
    const { href, children, ...rest } = p;
    return createElement("a", { href, ...rest }, children);
  }
}));
vi.mock("next/navigation", () => ({ usePathname: () => "/citizen/track-complaints", useRouter: () => ({ push: () => {}, refresh: () => {} }) }));
const { default: Header } = await import("./Header");
const { CITIZEN_NAV } = await import("@/lib/constants");

const render = (props: Record<string, unknown>) => renderToStaticMarkup(createElement(Header, props));
const navs = (html: string) => [...html.matchAll(/<nav\b[^>]*class="([^"]*)"[^>]*>([\s\S]*?)<\/nav>/g)].map((m) => ({ cls: m[1], body: m[2] }));

describe("the citizen top bar", () => {
  const html = render({ userName: "Arjun", homeHref: "/citizen", nav: CITIZEN_NAV });

  it("has the consoles' bar: the logo linking home, the place after it", () => {
    expect(html).toMatch(/<header class="cz-top has-tabs">/);
    expect(html).toMatch(/<a href="\/citizen"[^>]*class="cz-brand"/);
    expect(html).toContain("Citizen · Chennai");
  });

  it("shows the pages as tabs from 1024 px and as a bottom bar under it, the page you are on marked in both", () => {
    const [top, bottom] = navs(html);
    expect(top.cls).toBe("cz-tabs hidden lg:flex");
    expect(bottom.cls).toBe("cz-bbar lg:hidden");
    for (const n of [top, bottom]) {
      for (const { href, label } of CITIZEN_NAV) expect(n.body, label).toContain(`href="${href}"`);
      expect(n.body.match(/aria-current="page"/g)).toHaveLength(1);
      expect(n.body).toMatch(/<a href="\/citizen\/track-complaints"[^>]*aria-current="page"/);
    }
  });

  it("shows who is signed in on the account button (the name never sent to the translator), and the menu stays closed until it is pressed", () => {
    const me = html.match(/<button[^>]*class="cz-me"[^>]*>/)?.[0] ?? "";
    expect(me).toMatch(/aria-label="Account menu"/);
    expect(html).toMatch(/<small>Signed in as<\/small><b translate="no">Arjun<\/b>/);
    expect(me).toMatch(/aria-expanded="false"/);
    expect(html).not.toContain('id="cz-account"');
  });

  it("keeps the helpline, the language switch and the theme in the bar", () => {
    expect(html).toContain('href="tel:1913"');
    expect(html).toMatch(/aria-label="தமிழ்: switch the site to Tamil"/);
    expect(html).toMatch(/aria-label="Switch to dark mode"/);
  });

  it("signed out (no name given): no account button and, with no pages, no tabs", () => {
    const out = render({});
    expect(out).toMatch(/<header class="cz-top">/);
    expect(out).not.toContain("cz-me");
    expect(navs(out)).toEqual([]);
  });
});
