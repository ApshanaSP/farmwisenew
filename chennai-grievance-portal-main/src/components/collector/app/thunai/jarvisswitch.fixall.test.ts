import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

// P5-033's seam-06: pass 4 moved Jarvis's earlier-questions list above the phone's button row with ".dic:not(.fit) .jq", but the list is
// portalled to <body> (JarvisFab.tsx createPortal), outside .dic, so the rule never matched and the list sat at the desktop's 194 px.
const css = fs.readFileSync(path.join(__dirname, "jarvisswitch.css"), "utf8");
const portal = fs.readFileSync(path.join(__dirname, "JarvisFab.tsx"), "utf8");

describe("seam-06: the phone placement of Jarvis's questions list reaches the list where it is drawn", () => {
  it("the list is drawn in <body>, outside the console", () => {
    expect(portal).toMatch(/createPortal\(<JarvisQuestions[^]*document\.body\)/);
  });
  it("the phone rule for the list does not need it inside .dic, and sets it above the moved button row", () => {
    const phone = css.slice(css.indexOf("@media (max-width: 480px)"));
    const block = phone.slice(0, phone.indexOf("\n}") + 2);
    const rules = [...block.matchAll(/([^{}]+)\{([^}]*)\}/g)].map((m) => ({ sel: m[1].trim(), body: m[2] })).filter((r) => /\.jq\b/.test(r.sel));
    expect(rules.length).toBeGreaterThan(0);
    for (const r of rules) for (const s of r.sel.split(",")) expect(s.trim(), s).not.toMatch(/^\.dic\b[^,]*\s\.jq\b/);
    expect(rules.some((r) => /bottom:\s*calc\(132px/.test(r.body))).toBe(true);
  });
});
