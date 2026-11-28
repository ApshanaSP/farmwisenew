// 28 Nov, the owner: "while I sign in, in the password field I get two eye (show password) options. One is enough." Microsoft Edge draws its own
// eye inside every password input (::-ms-reveal); the sign-in page drew a second one beside it. Every password field of the sign-in, sign-up,
// reset and profile pages is now PasswordInput (one button of its own, Edge's hidden by globals.css), and no page draws a bare one.
import fs from "node:fs";
import path from "node:path";
import React, { act, createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { parseHTML } from "linkedom";
import { afterEach, describe, expect, it } from "vitest";
import PasswordInput from "@/components/auth/PasswordInput";

// this vitest config compiles .tsx with the classic JSX runtime
(globalThis as { React?: unknown }).React = React;

const SRC = path.resolve(__dirname, "../..");
const read = (p: string) => fs.readFileSync(path.join(SRC, p), "utf8");
const walk = (d: string, out: string[] = []) => {
  for (const e of fs.readdirSync(path.join(SRC, d), { withFileTypes: true })) {
    const rel = path.posix.join(d, e.name);
    if (e.isDirectory()) walk(rel, out);
    else if (/\.tsx$/.test(e.name) && !/\.test\./.test(e.name)) out.push(rel);
  }
  return out;
};
const buttons = (html: string) => html.match(/<button\b[^>]*>/g) ?? [];

describe("one show / hide control per password field", () => {
  it("PasswordInput draws one button, named for what it does, that names its field", () => {
    const html = renderToStaticMarkup(createElement(PasswordInput, { id: "pw", className: "auth-input", value: "", onChange: () => {} }));
    expect(buttons(html)).toHaveLength(1);
    const b = buttons(html)[0];
    expect(b).toMatch(/type="button"/);
    expect(b).toMatch(/aria-label="Show password"/);
    expect(b).toMatch(/aria-controls="pw"/);
    expect(html).toMatch(/<input[^>]*type="password"[^>]*id="pw"|<input[^>]*id="pw"[^>]*type="password"/);
    // the wrapper whose class hides Edge's own eye
    expect(html).toMatch(/^<div class="pw-field\b/);
  });

  it("the button's name follows the field (\"Show Aadhaar number\")", () => {
    const html = renderToStaticMarkup(createElement(PasswordInput, { id: "a", noun: "Aadhaar number", value: "", onChange: () => {} }));
    expect(buttons(html)[0]).toMatch(/aria-label="Show Aadhaar number"/);
  });

  describe("pressing it shows the password, and pressing again hides it", () => {
    const saved: Record<string, unknown> = {};
    afterEach(() => { Object.assign(globalThis, saved); });
    it("type password -> text -> password, the name says what the next press does, and there is still one button", async () => {
      const { window, document } = parseHTML("<!doctype html><html><body><div id=root></div></body></html>");
      for (const k of ["window", "document", "HTMLElement", "HTMLInputElement", "Node", "Event"]) saved[k] = (globalThis as Record<string, unknown>)[k];
      Object.assign(globalThis, { window, document, HTMLElement: window.HTMLElement, HTMLInputElement: (window as unknown as Record<string, unknown>).HTMLInputElement, Node: window.Node, Event: window.Event });
      (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
      const { createRoot } = await import("react-dom/client");
      const root = createRoot(document.getElementById("root") as unknown as Element);
      await act(async () => { root.render(createElement(PasswordInput, { id: "pw", defaultValue: "secret" })); });
      const input = () => document.querySelector("input")!;
      const btn = () => document.querySelector("button")!;
      expect(input().getAttribute("type")).toBe("password");
      await act(async () => { btn().dispatchEvent(new window.Event("click", { bubbles: true })); });
      expect(input().getAttribute("type")).toBe("text");
      expect(btn().getAttribute("aria-label")).toBe("Hide password");
      expect(document.querySelectorAll("button")).toHaveLength(1);
      await act(async () => { btn().dispatchEvent(new window.Event("click", { bubbles: true })); });
      expect(input().getAttribute("type")).toBe("password");
      expect(btn().getAttribute("aria-label")).toBe("Show password");
      await act(async () => { root.unmount(); });
    });
  });

  it("globals.css hides Edge's own eye (and clear button) wherever the site draws its own", () => {
    const css = read("app/globals.css");
    const rule = (pseudo: string) => css.match(new RegExp(`([^{}]*::${pseudo}[^{}]*)\\{\\s*display:\\s*none;?\\s*\\}`))?.[1] ?? "";
    for (const pseudo of ["-ms-reveal", "-ms-clear"]) {
      const sel = rule(pseudo);
      expect(sel, pseudo).toMatch(/\.pw-field input::/);
      expect(sel, pseudo).toMatch(/\.ds-input input::/);
      // one pseudo-element per rule: a browser that does not know one drops only that rule
      expect(sel.match(/::-ms-(reveal|clear)/g)?.every((m) => m === `::${pseudo}`)).toBe(true);
    }
  });

  it("the sign-in, sign-up, reset and profile pages draw no password field of their own: each one is PasswordInput", () => {
    const pages: Record<string, number> = { "app/login/page.tsx": 1, "app/register/page.tsx": 2, "app/forgot-password/page.tsx": 2, "app/profile/page.tsx": 4 };
    for (const [f, n] of Object.entries(pages)) {
      const s = read(f);
      expect(s, f).not.toMatch(/type="password"|"text" : "password"|"password" : "text"/);
      expect(s.match(/<PasswordInput\b/g)?.length ?? 0, f).toBe(n);
    }
  });

  it("anywhere else, a field with a show / hide button of its own sits in a wrapper whose Edge eye is hidden", () => {
    const css = read("app/globals.css");
    const own: string[] = [], bare: string[] = [];
    for (const f of walk(".").filter((p) => !p.startsWith("components/auth/PasswordInput"))) {
      const s = read(f);
      if (/\? "text" : "password"/.test(s)) own.push(f);
      else if (/type="password"/.test(s)) bare.push(f);
    }
    // the Data Studio's sign-in fields toggle their own type inside .ds-input
    for (const f of own) {
      const wrap = read(f).match(/className="([\w-]+)"[^\n]*\? "text" : "password"/)?.[1];
      expect(wrap, f).toBeTruthy();
      expect(css, `${f}: .${wrap} input::-ms-reveal`).toContain(`.${wrap} input::-ms-reveal`);
    }
    // a bare password input keeps the browser's own control (one); none is left on the pages above
    expect(bare.filter((f) => /^app\/(login|register|forgot-password|profile)\//.test(f))).toEqual([]);
  });
});
