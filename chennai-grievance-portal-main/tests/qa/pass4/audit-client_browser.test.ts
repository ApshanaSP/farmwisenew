// QA pass 4: the fast reproductions behind the browser audit of BUG-012, BUG-014, BUG-015 and BUG-016. The real runs are in
// tests/e2e/pass4-client-fixes.spec.ts. Each it.fails is a bug still open: its name starts with the finding id, and the fixer changes it to it(...).
//   npx vitest run --config vitest.qa4.config.ts tests/qa/pass4/audit-client_browser.test.ts
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import * as dom from "@/components/collector/app/thunai/dom";
import { KEEP_BUTTON } from "@/components/collector/app/thunai/guards";
import { addressed } from "@/lib/thunai/addressed";
import { START, WORLD } from "@/lib/thunai/fixture";
import { isReflex } from "@/lib/thunai/plan";
import { quickScreen } from "@/lib/thunai/quick";
import { turn, turnStart } from "@/lib/thunai/turn";

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");
const THUNAI = read("src/components/collector/app/thunai/Thunai.tsx");
const CONDUCTOR = read("src/components/collector/app/thunai/conductor.ts");

/** exactly the string the click guard tests (Thunai.tsx, case "click"), for a button whose accessible name is its text */
const guarded = (label: string) => `${label} ${label}`.trim();

describe("the click guard, on the string it really sees", () => {
  it("the guard builds its test from the name and the text, each alone and together (keepsSomething)", () => {
    expect(THUNAI).toContain("keepsSomething(t.name, t.el.textContent)");
    expect(read("src/components/collector/app/thunai/guards.ts")).toContain("[n, t, `${n} ${t}`.trim()].some(");
  });
  it.each(["Save new version", "Pin"])("holds: %s", (b) => expect(KEEP_BUTTON.test(guarded(b))).toBe(true));
  it("holds: Unpin (a name with no text in the button)", () => expect(KEEP_BUTTON.test("Unpin")).toBe(true));

  it("audit-client_browser-1: a bare Yes button is caught by the guard (name and text together read 'Yes Yes')", () => {
    expect(KEEP_BUTTON.test(guarded("Yes"))).toBe(true);
  });
  it("audit-client_browser-1: the Tamil Yes on the Data card is caught by the guard", () => {
    expect(KEEP_BUTTON.test(guarded("ஆம்"))).toBe(true);
  });
  it("audit-client_browser-1: the Data card's Yes carries data-jarvis-never, as the guard's own comment says it must", () => {
    const line = read("src/components/collector/app/studio/DataCard.tsx").split("\n").find((l) => l.includes("{t.yes}"));
    expect(line).toContain("data-jarvis-never");
  });
  it("audit-client_browser-2: Add to dashboard, the Studio's own pin, is caught by the guard", () => {
    expect(KEEP_BUTTON.test("Add this chart to the dashboard (Environment page) Add to dashboard")).toBe(true);
  });
});

describe("the save card's yes list", () => {
  const list = /const yes = (\/\^.+?\/i)\.test\(said\)/.exec(THUNAI)?.[1];
  const yes = () => { const m = /^\/(.+)\/i$/.exec(String(list)); return new RegExp(m![1], "i"); };
  it("the list can be read from the code", () => expect(list).toBeTruthy());
  it.each(["yes", "Yes.", "ok", "ஆம்", "சரி", "aama", "seri"])("holds: %s", (w) => expect(yes().test(w)).toBe(true));
  it("audit-client_browser-3: ஆமாம், the everyday Tamil yes, counts as a yes", () => expect(yes().test("ஆமாம்")).toBe(true));
  it("audit-client_browser-3: 'yes please' counts as a yes", () => expect(yes().test("yes please")).toBe(true));
});

describe("Confirm it's you over Jarvis's screen", () => {
  const z = (file: string, re: RegExp) => Number(re.exec(read(file))?.[1]);
  it("audit-client_browser-4: the password box stands above Jarvis's screen and bar", () => {
    const box = z("src/components/security/confirm.css", /\.cfm-veil\{[^}]*z-index:(\d+)/);
    const screen = z("src/components/collector/app/thunai/stage.css", /\.st-root \{[\s\S]*?z-index: (\d+)/);
    expect(box).toBeGreaterThan(screen);
  });
});

describe("the rest of the audit's findings, as far as they can be read without a browser", () => {
  it("audit-client_browser-6: the tray does not tell the Collector to say a thing Jarvis refuses", () => {
    expect(THUNAI).not.toContain('Say "confirm ${tray.length}"');
  });
  it("audit-client_browser-8: stopping a turn clears the 'Counting it' line the turn put up", () => {
    const body = /const cancelTurn = \(\) => \{[\s\S]*?\r?\n {2}\};/.exec(THUNAI)?.[0] ?? "";
    expect(body).toContain("turnGen.current++");
    expect(body).toMatch(/setReply\(""\)/);
  });
  it("audit-client_browser-9: a spoken stop cancels the turn in flight, also when the question was typed", () => {
    // listening (a typed question is not known to the turn machine), then speech, then the words "stop"
    let m = turn(turnStart(), { type: "open" }).m;
    m = turn(m, { type: "vadStart", at: 0 }).m;
    m = turn(m, { type: "vadEnd", at: 900, ms: 900, short: false }).m;
    const r = turn(m, { type: "text", text: "stop" });
    expect(r.m.state).toBe("holding");
    expect(r.act.map((a) => a.a)).toContain("cancelTurn");
  });
  it("audit-client_browser-9: a bare stop while Jarvis is working passes the address gate", () => {
    const g = addressed({ text: "stop", lastTurnAt: null, now: Date.now(), rulesSure: true, districtNoun: false });
    expect(g.act).toBe(true);
  });
  it("audit-client_browser-9: நிறுத்து while Jarvis is working passes the address gate", () => {
    const g = addressed({ text: "நிறுத்து", lastTurnAt: null, now: Date.now(), rulesSure: true, districtNoun: false });
    expect(g.act).toBe(true);
  });
  it("audit-client_browser-10: show numbers counts as an instant control, so the dataset lane does not take it", () => {
    expect(isReflex([{ a: "numbers", show: true, names: false }], START)).toBe(true);
  });
  it("audit-client_browser-11: captions check for Jarvis's own voice, as Whisper's words do", () => {
    const body = /private fromCaptions\(text: string\) \{[\s\S]*?\r?\n {2}\}/.exec(CONDUCTOR)?.[0] ?? "";
    expect(body).toContain("gateFor");
    expect(body).toContain("selfHeard");
  });
  it("audit-client_browser-12: a sentence that starts with click is not read as a request for a screen", () => {
    expect(quickScreen("click trends", WORLD)).toBeNull();
  });
  it("audit-client_browser-15: each Confirm it's you box starts empty: it has a key of its own", () => {
    expect(read("src/components/security/Confirm.tsx")).toMatch(/<ConfirmBox key=/);
  });
  it("audit-client_browser-16: a control is found by the word on it, not only by its title", () => {
    const el = { getAttribute: (k: string) => (k === "title" ? "Export, workspaces, customize, theme and language" : null), innerText: "Menu", textContent: "Menu" } as unknown as Element;
    const { accessibleName } = dom;
    expect(accessibleName(el).toLowerCase()).toContain("menu");
  });
});
