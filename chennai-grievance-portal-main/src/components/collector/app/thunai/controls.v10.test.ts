/**
 * v10: the whole dashboard by voice, the console's side (docs/jarvis/JARVIS_V10.md 4.7; the inventory's findings,
 * docs/jarvis/v10-research/60-controls-inventory.json summary.findings). Each was a failing test first:
 *   1. write controls a spoken "click …" pressed with no guard (Sign out, Sign out every other device, Data sources' Run now and Pause, …)
 *   2. harmless controls refused by a word in their name (the chatbot's Send, Ask the Map's "Remove <part>", the workspace delete's Keep, a
 *      dataset focus chip's Remove): let through by an explicit allow, never by weakening the danger words
 *   3. "open the third one" counted the Overview's By severity list whatever window was open
 *   4. selects and checkboxes were out of reach (press() only focused them)
 *   5. with a dataset open in the Data Studio, every sentence went to the dataset's engine
 *   6. Jarvis's own harmless controls had no voice path (the noticed-something card, the brief card)
 *   7. stale selectors in dom.ts targetFor (.theme-t, [aria-label="Export report"], [aria-label="Workspaces"], [aria-label="Customize"], .sevtab)
 * Source checks where the console has no DOM in this suite (vitest runs in node), pure functions everywhere else.
 */
import { readdirSync, readFileSync, statSync } from "fs";
import path from "path";
import { parseHTML } from "linkedom";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { isDangerButton } from "@/lib/thunai/skeleton";
import { CONTROLS10 } from "@/lib/thunai/v10/controls10.data";
import { itemPick, studioLetsThrough } from "@/lib/thunai/v10/controls10";
import { ITEM_ROWS, PRESS_ALLOW, TARGETS, bestOption, parseSpec, pressKind, pressVerdict } from "./press10";

const APP = path.join(__dirname, "..");
const SRC = path.join(APP, "..", "..", "..");
const read = (rel: string) => readFileSync(path.join(APP, rel), "utf8");
const walk = (dir: string): string[] => readdirSync(dir).flatMap((f) => {
  const p = path.join(dir, f);
  return statSync(p).isDirectory() ? walk(p) : /\.tsx?$/.test(f) && !/\.test\.ts$/.test(f) ? [p] : [];
});
const ALL = walk(path.join(SRC, "components")).map((p) => readFileSync(p, "utf8")).join("\n");
const thunai = read("thunai/Thunai.tsx");
const dom = read("thunai/dom.ts");

/** the element around `near` in a component's source: from its opening tag to its end */
function elementAt(src: string, near: string, tag = "<button"): string {
  const i = src.indexOf(near);
  if (i < 0) return "";
  const start = src.lastIndexOf(tag, i);
  const end = src.indexOf(tag === "<button" ? "</button>" : ">", i);
  return src.slice(start, end < 0 ? i + 300 : end);
}

describe("finding 1: the write controls a spoken 'click …' pressed with no guard carry data-jarvis-never", () => {
  // summary.writeControlsReachableByAnUnguardedGenericClick, each with where its element is
  const UNGUARDED: [string, string, string][] = [
    ["account.signOut", "CollectorApp.tsx", "fetch(\"/api/auth/logout\""],
    ["sec.signOutOthers", "../../security/SecurityPanel.tsx", "onClick={others}"],
    ["sources.run", "Sources.tsx", "onClick={() => run(s)}"],
    ["sources.pauseResume", "Sources.tsx", "onClick={() => toggle(s)}"],
    ["studio.add.linkGo", "studio/Studio.tsx", "aria-label=\"Read the link\""],
    ["studio.add.sample", "studio/Studio.tsx", "onClick={() => addSample(s.key)}"],
    ["studio.add.sample", "studio/Hero.tsx", "onClick={() => onSample(s.key)}"],
    ["ds.refetch", "studio/Dataset.tsx", "title=\"Fetch the link again\""],
    ["ds.enrich.findMore", "studio/Dataset.tsx", "onFindMore?.("],
    ["ds.brief.reanalyse", "studio/Insights.tsx", "onClick={onReanalyse}"],
    ["ds.alert.add", "studio/Analyst.tsx", "text.trim().length < 6"],
    ["ds.mapping.rebuild", "studio/Dataset.tsx", "onRemap(changed.map"],
    ["ds.card.familyPick", "studio/DataCard.tsx", "FAMILIES.map(([k, en, ta]) => <button"],
    ["src.useThis", "studio/Source.tsx", "onChoose(x.id)"],
    ["src.schedule", "studio/Source.tsx", "onClick={() => schedule(e.v)}"],
    ["src.fetchNow", "studio/Source.tsx", "onRefresh(); }}"],
    ["connect.mode", "studio/Connect.tsx", "onClick={() => setMode(m.mode)}"],
    ["connect.every", "studio/Connect.tsx", "onClick={() => setEvery(e.v)}"],
    ["connect.submit", "studio/Connect.tsx", "type=\"submit\" className=\"ds-btn\""],
    ["run.useAnyway", "studio/Pipeline.tsx", "onForce(run.blocked!.id)"],
    ["run.tryAgain", "studio/Pipeline.tsx", "onClick={onRetry}"],
    ["outcome.action", "studio/Outcome.tsx", "onClick={() => onAction(a, outcome)}"],
    ["picker.add", "studio/Outcome.tsx", "\"each\")}"],
    ["picker.add", "studio/Outcome.tsx", "\"combine\")}"],
    ["conn.run", "studio/Connectors.tsx", "act(k.id, \"run\")"],
    ["conn.pauseResume", "studio/Connectors.tsx", "k.paused ? \"resume\" : \"pause\")"],
    ["conn.backfill", "studio/Connectors.tsx", "act(k.id, \"backfill\""],
    ["answer.feedback", "assistant/AnswerCard.tsx", "onClick={() => feedback(1)}"],
    ["answer.feedback", "assistant/AnswerCard.tsx", "onClick={() => feedback(-1)}"]
  ];
  it.each(UNGUARDED)("%s (%s) carries data-jarvis-never", (id, file, near) => {
    const el = elementAt(read(file), near);
    expect(el, `${near} not found in ${file}`).not.toBe("");
    expect(el).toMatch(/data-jarvis-never/);
  });
  it("the pinned list is the inventory's, and every one of them is 'never' in the registry", () => {
    const ids = [...new Set(UNGUARDED.map((x) => x[0]))];
    expect(ids.length).toBe(26);
    for (const id of ids) expect(CONTROLS10.find((e) => e.id === id)?.level, id).toBe("never");
  });
  it("a harmless neighbour stays pressable (the failed run's Back, the picker's Cancel, an outcome's Close)", () => {
    expect(elementAt(read("studio/Pipeline.tsx"), "onClick={onBack}>Back")).not.toMatch(/data-jarvis-never/);
    expect(elementAt(read("studio/Outcome.tsx"), "onClick={onCancel}")).not.toMatch(/data-jarvis-never/);
    expect(read("studio/Outcome.tsx")).toMatch(/data-jarvis-never=\{[^}]*(?:retry|useAnyway)[^}]*\}/);
  });
});

describe("finding 2: harmless controls refused by a word in their name are let through by an explicit allow", () => {
  it("the danger and keep words stay as they were", () => {
    for (const w of ["Send", "Remove Adyar", "Delete", "Approve and send", "Discard"]) expect(isDangerButton(w), w).toBe(true);
  });
  it("a danger word refuses, unless the element is on the allow list; data-jarvis-never always refuses", () => {
    expect(pressVerdict({ name: "Send", text: "", never: false, allowed: false })).toBe("never");
    expect(pressVerdict({ name: "Send", text: "", never: false, allowed: true })).toBe("ok");
    expect(pressVerdict({ name: "Remove Adyar", text: "", never: false, allowed: true })).toBe("ok");
    expect(pressVerdict({ name: "Keep", text: "Keep", never: false, allowed: false })).toBe("keep");
    expect(pressVerdict({ name: "Keep", text: "Keep", never: false, allowed: true })).toBe("ok");
    expect(pressVerdict({ name: "Send", text: "", never: true, allowed: true })).toBe("never");
    expect(pressVerdict({ name: "Overview", text: "Overview", never: false, allowed: false })).toBe("ok");
    // a level-B control pressed after the Collector's yes: keeping is what it does
    expect(pressVerdict({ name: "Save new version", text: "", never: false, allowed: false, yes: true })).toBe("ok");
    expect(pressVerdict({ name: "Approve and send", text: "", never: false, allowed: false, yes: true })).toBe("never");
  });
  it("the allow list names the chatbot's Send, Ask the Map's chip Remove, the workspace delete's Keep and a focus chip's Remove, and nothing that sends", () => {
    expect(PRESS_ALLOW).toEqual(expect.arrayContaining([".aq-send", ".amp .rm[role=button]", ".wdel .btn.plain", ".ds-focus em button"]));
    expect(PRESS_ALLOW.length).toBe(4);
    for (const sel of PRESS_ALLOW) for (const cls of sel.match(/\.[a-z][\w-]*/gi) ?? []) expect(ALL, `${sel}: ${cls}`).toMatch(new RegExp(`["\` ]${cls.slice(1)}["\` }]`));
    expect(read("assistant/AssistantDialog.tsx")).toMatch(/type="submit" className="aq-send"/);
    expect(read("Workspace.tsx")).toMatch(/className="btn plain sm" onClick=\{\(\) => setDeleting\(null\)\}>Keep/);
  });
  it("Jarvis's click step and its control press use the one verdict, with the allow list", () => {
    expect(thunai).toMatch(/verdictFor\(t\.el/);
    expect(dom).toMatch(/pressVerdict\(\{[^}]*allowed: allowedEl\(el\)/);
    expect(dom).toMatch(/const v = verdictFor\(el, accessibleName\(el\), !!o\.yes\)/);
    expect(thunai).not.toMatch(/if \(t\.el\.closest\("\[data-jarvis-never\]"\) \|\| isDangerButton/);
  });
});

describe("finding 3: 'open the third one' counts the list in the window open", () => {
  it("every window with a list has its rows' selector", () => {
    for (const k of ["list", "zones", "depts", "news", "stories", "gaps", "review", "nextdoor", "added", "pattern"]) expect(ITEM_ROWS[k], k).toBeTruthy();
    expect(ITEM_ROWS.list).toMatch(/tbody tr/);
  });
  it("a position, next and previous; past the end said plainly", () => {
    expect(itemPick(3, 12, null)).toEqual({ idx: 2 });
    expect(itemPick(13, 12, null)).toEqual({ past: 12 });
    expect(itemPick("next", 12, 2)).toEqual({ idx: 3 });
    expect(itemPick("prev", 12, 2)).toEqual({ idx: 1 });
    expect(itemPick("next", 3, 2)).toEqual({ past: 3 });
    expect(itemPick(1, 0, null)).toEqual({ none: true });
  });
  it("the item step reads the window's own rows before the Overview's list", () => {
    const i = thunai.indexOf("case \"item\": {");
    const block = thunai.slice(i, thunai.indexOf("case \"draft\"", i));
    expect(block).toMatch(/frontRows\(/);
    expect(block.indexOf("frontRows(")).toBeLessThan(block.indexOf("buildState()"));
  });
});

describe("finding 4: a select is set and a checkbox ticked by name", () => {
  it("a checkbox is clicked (ticked), a select is set, a text box focused, a button clicked", () => {
    expect(pressKind("BUTTON", "")).toBe("click");
    expect(pressKind("INPUT", "checkbox")).toBe("check");
    expect(pressKind("INPUT", "radio")).toBe("check");
    expect(pressKind("SELECT", "")).toBe("select");
    expect(pressKind("INPUT", "text")).toBe("focus");
    expect(pressKind("TEXTAREA", "")).toBe("focus");
  });
  it("the option said, by its words (English or the console's own), close spellings too", () => {
    const st = [{ text: "All stations", value: "auto" }, { text: "Nungambakkam", value: "n1" }, { text: "Meenambakkam", value: "m1" }];
    expect(bestOption(st, "nungambakkam")).toBe("n1");
    expect(bestOption(st, "nungambakam")).toBe("n1");
    expect(bestOption(st, "all")).toBe("auto");
    expect(bestOption(st, "velachery")).toBeNull();
    const sev = [{ text: "All severities", value: "" }, { text: "Severe", value: "Severe" }, { text: "High", value: "High" }, { text: "Medium", value: "Medium" }, { text: "Low", value: "Low" }];
    expect(bestOption(sev, "high")).toBe("High");
    expect(bestOption(sev, "severe")).toBe("Severe");
  });
  it("dom.ts presses by the kind of control, never only focusing a checkbox or a select", () => {
    expect(dom).toMatch(/pressKind\(/);
    expect(dom).toMatch(/export function chooseOption/);
    expect(dom).toMatch(/export function setTick/);
  });
});

describe("finding 5: on the Data Studio with a dataset open, a plain console command still reaches the console", () => {
  it("a page, a panel, the theme, close and a named console filter go through; the dataset's own questions do not", () => {
    expect(studioLetsThrough("go to the trends page", [{ a: "page", page: "trends" }], 0.95)).toBe(true);
    expect(studioLetsThrough("open the news panel", [{ a: "panel", panel: "news" }], 0.95)).toBe(true);
    expect(studioLetsThrough("dark mode", [{ a: "theme", theme: "dark" }], 0.95)).toBe(true);
    expect(studioLetsThrough("close", [{ a: "close", all: false }], 0.95)).toBe(true);
    expect(studioLetsThrough("set the zone to 7", [{ a: "view", view: { zone: 7 } }], 0.95)).toBe(true);
    expect(studioLetsThrough("show only Adyar", [{ a: "view", view: { zone: 13 } }], 0.95)).toBe(false);
    expect(studioLetsThrough("how many rows are from Adyar", [{ a: "view", view: { zone: 13 } }], 0.95)).toBe(false);
    expect(studioLetsThrough("what is the average", [{ a: "ask", q: "what is the average" }], 0.95)).toBe(false);
    expect(studioLetsThrough("go to trends", [{ a: "page", page: "trends" }], 0.6)).toBe(false);
  });
  it("Thunai's dataset intercept lets them through", () => {
    const i = thunai.indexOf("const sd = studioRef.current;");
    expect(thunai.slice(i, i + 900)).toMatch(/studioLetsThrough\(/);
  });
});

describe("finding 6: Jarvis's own harmless controls have a voice path", () => {
  it("the cards the registry presses are where it looks", () => {
    expect(read("thunai/HudCards.tsx")).toMatch(/data-testid="interjection"[\s\S]{0,300}<div className="row">/);
    expect(thunai).toMatch(/data-testid="brief"[\s\S]{0,900}<div className="row">/);
    expect(read("thunai/HudCards.tsx")).toMatch(/data-testid="queue"/);
  });
  it("the control lane presses inside Jarvis's own UI only for a registry control marked own, and gates a level-B press on a yes", () => {
    const i = thunai.indexOf("f10.lane?.lane === \"control\"");
    const block = thunai.slice(i, i + 3200);
    expect(block).toMatch(/pressControl\(/);
    expect(block).toMatch(/own/);
    expect(block).toMatch(/setPendingB\(/);
  });
});

describe("finding 7: the pointer's targets are elements that exist", () => {
  it("dom.ts has none of the stale selectors", () => {
    for (const s of [".theme-t", "[aria-label=\"Export report\"]", "[aria-label=\"Workspaces\"]", "[aria-label=\"Customize\"]", ".sevtab"]) expect(dom.includes(s), s).toBe(false);
  });
  it("every target's classes and keys are in the console's components", () => {
    for (const [k, sels] of Object.entries(TARGETS)) for (const sel of sels) {
      for (const cls of sel.match(/\.[a-z][\w-]*/gi) ?? []) expect(ALL, `${k}: ${sel}`).toMatch(new RegExp(`["\` ]${cls.slice(1)}["\` }$]`));
      for (const key of sel.match(/data-key="([\w-]+)"/g) ?? []) expect(ALL, `${k}: ${key}`).toMatch(/data-key=\{/);
    }
    expect(TARGETS.theme[0]).toMatch(/data-key="theme"/);
  });
});

describe("v10 review 2: the console's side of the controls' findings", () => {
  it("the console tells the control lane a dataset is open, so the dataset's own sentences reach its intercept (v10 review 2, finding 30)", () => {
    const i = thunai.indexOf("const f10 = v10Front(said, {");
    expect(i).toBeGreaterThan(0);
    expect(thunai.slice(i, thunai.indexOf("});", i))).toMatch(/studio: !!studioRef\.current && hostRef\.current\.c\.page === "studio"/);
  });
});

describe("v10 review 2: a registry press on a page (linkedom)", () => {
  const HTML = `<html><body>
    <div class="ds-spot" role="dialog"><header><button class="ds-ghost" aria-label="Close">x</button></header>
      <footer><button class="ds-ghost">On the dashboard</button><button class="ds-btn">Add to this dashboard</button></footer></div>
    <div class="ta"><div class="ta-f grow"><textarea>Inspect the drain.</textarea></div></div>
    <div class="modal"><div class="filters"><input type="search" value="adyar"></div></div>
  </body></html>`;
  const clicked: string[] = [];
  const keep = new Map<string, unknown>();
  const GLOBALS = ["window", "document", "getComputedStyle", "HTMLInputElement", "HTMLTextAreaElement", "Event"] as const;
  let dom: typeof import("./dom");
  beforeAll(async () => {
    const { window, document } = parseHTML(HTML);
    Object.assign(window, { innerWidth: 1200, innerHeight: 900 });
    for (const k of GLOBALS) keep.set(k, (globalThis as Record<string, unknown>)[k]);
    Object.assign(globalThis, { window, document, getComputedStyle: () => ({ visibility: "visible", display: "block", opacity: "1" }),
      HTMLInputElement: window.HTMLInputElement, HTMLTextAreaElement: window.HTMLTextAreaElement, Event: window.Event });
    // what linkedom lacks: layout, and the focused element
    (window.Element.prototype as unknown as { getBoundingClientRect: () => object }).getBoundingClientRect = () => ({ left: 10, top: 10, right: 110, bottom: 40, width: 100, height: 30 });
    (document as unknown as { elementFromPoint: () => unknown }).elementFromPoint = () => document.body;
    let active: unknown = null;
    (window.HTMLElement.prototype as unknown as { focus: () => void }).focus = function (this: unknown) { active = this; };
    Object.defineProperty(document, "activeElement", { get: () => active, configurable: true });
    for (const b of document.querySelectorAll("button")) b.addEventListener("click", () => clicked.push(b.textContent ?? ""));
    dom = await import("./dom");
  });
  afterAll(() => { for (const [k, v] of keep) (globalThis as Record<string, unknown>)[k] = v; });
  const spec = (id: string) => { const e = CONTROLS10.find((x) => x.id === id)!; return "press" in e.act ? e.act.press : ""; };

  // v10 review 2, finding 31: the large chart's pin toggle was pressed in either state (a yes unpinned a chart on the dashboard); its "Add to this
  // dashboard" was looked for as a .ds-ghost, but it is a .ds-btn
  it("'Add the large chart to the dashboard' (yes said) never unpins a chart already on it", async () => {
    clicked.length = 0;
    await dom.pressControl(spec("ds.spot.toDashboard"), { yes: true });
    expect(clicked).not.toContain("On the dashboard");
  });
  it("the large chart's 'Add to this dashboard' is found and pressed", async () => {
    clicked.length = 0;
    const r = await dom.pressControl(spec("ds.spot.addHere"), { yes: true });
    expect(r.ok ? clicked : r.why).toEqual(["Add to this dashboard"]);
  });

  // v10 review 2, finding 28: a value typed into Take action's message cleared the draft first (the model's draft and the Collector's edits lost)
  it("a value typed into a box that holds a draft is added to it, never wiping it; a search box is replaced", async () => {
    const r = await dom.pressControl(spec("ta.message"), { value: "by Friday" });
    expect(r.ok).toBe(true);
    expect(document.querySelector("textarea")?.value).toBe("Inspect the drain. by Friday");
    await dom.pressControl(spec("list.filter"), { value: "velachery" });
    expect((document.querySelector("input[type=search]") as HTMLInputElement | null)?.value).toBe("velachery");
  });
});

describe("the registry's press selectors name elements the console has", () => {
  const specs = CONTROLS10.flatMap((e) => ("press" in e.act ? [[e.id, e.act.press] as const] : []));
  it.each(specs)("%s: %s", (id, spec) => {
    for (const step of parseSpec(spec)) {
      for (const cls of step.css.replace(/\[[^\]]*\]/g, "").match(/\.[a-z][\w-]*/gi) ?? []) expect(ALL, `${id}: ${cls}`).toMatch(new RegExp(`(?:["\` ]|className=\\{?\`?)${cls.slice(1)}(?:["\` }$]|\\$)`));
      for (const m of step.css.matchAll(/data-voice="([^"]+)"/g)) expect(ALL.includes(`data-voice="${m[1]}"`) || ALL.includes("data-voice={"), `${id}: data-voice ${m[1]}`).toBe(true);
      for (const m of step.css.matchAll(/data-(k|l|testid|key)/g)) expect(ALL, `${id}: data-${m[1]}`).toMatch(new RegExp(`data-${m[1]}=`));
    }
  });
});
