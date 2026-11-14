/**
 * Composable missions (Pillar 4): the three scripted missions of the acceptance gate (a board built and run with every step's real time,
 * a mission stopped mid-run, a mission redirected mid-run), and the rules around them: nothing runs before Start, Level C only into the
 * tray, a plan that would send / approve / delete is refused, a model's figure never survives in a label, Tamil and Tanglish phrases get
 * the templates, the spoken flood-risk tour. No live model call: every model is a fake.
 */
import { describe, expect, it } from "vitest";
import type { JsonCall, JsonResult } from "@/lib/ai/gateway";
import type { ToolResult } from "@/lib/assistant/types";
import { WORLD } from "./fixture";
import { Ledger, MemoryStore } from "./ledger";
import { ZONE_TA_NAME } from "./lexicon";
import { figuresIn, gateChunk } from "./numbergate";
import { referenceWorld } from "./world";
import { checkModelPlan, planMission, templatePlan, tourPlan, type ModelPlanT, type Planned } from "./missions";
import { checkRunnable, cleanLabel, labelClean, type MissionPlanT, type MissionStepT } from "./missions.schema";
import { missionCommand, missionIntent, screenLabel, secondsOf } from "./missions.words";
import { missionControl, runMission, type MissionCard, type MissionHooks, type StepState } from "./missions.run";
import { RECIPES } from "./stage";
import type { Step, World } from "./types";

const world: World = { ...WORLD, ...referenceWorld(), zones: WORLD.zones.map((z) => ({ ...z, ta: ZONE_TA_NAME[z.n] ?? null })), depts: WORLD.depts };

/** a model that must not be asked (templates and the fast lane need none), or one that answers with a given plan */
function fakeModel(answer?: unknown) {
  const asked: string[] = [];
  const generate = async <U,>(c: JsonCall<U>): Promise<JsonResult<U>> => {
    asked.push(c.name);
    if (answer === undefined) throw new Error("no model in this test");
    return { object: answer as U, info: { step: c.name, provider: c.only!.provider, model: c.only!.models[0] ?? "fake", ms: 5, inputTokens: 100, outputTokens: 50, attempts: 1 } };
  };
  return { asked, llm: { generate: generate as never, ledger: new Ledger(new MemoryStore()), bedrockOk: () => false, claudeOk: () => false } };
}
const deps = (m = fakeModel(), tool?: (n: string, a: Record<string, unknown>) => Promise<ToolResult>) => ({ user: "test", llm: m.llm, tool });

const planOf = (r: Planned): MissionPlanT => { if (r.kind !== "plan") throw new Error(`no plan: ${r.kind} ${r.why}`); return r.plan; };
const tick = () => new Promise<void>((res) => setTimeout(res, 0));

interface Fake { hooks: MissionHooks; log: string[]; said: { text: string; lang: string; allowed: Set<string> }[]; progress: [number, StepState, number | null][]; moves: Step[]; cards: MissionCard[]; drafted: string[][] }
/** hooks on a fake clock: each hook call takes the next of `durations` (ms), so every step's real time is known */
function fake(durations: number[], o: { cases?: { id: string; overdue: boolean }[]; onCall?: (n: number, what: string) => Promise<void> | void; plan?: MissionHooks["plan"] } = {}): Fake {
  let t = 10_000, n = 0;
  const f: Fake = { hooks: null as never, log: [], said: [], progress: [], moves: [], cards: [], drafted: [] };
  const take = async (what: string) => {
    const k = n++;
    f.log.push(what);
    t += durations[k] ?? 1000;
    await o.onCall?.(k, what);
  };
  f.hooks = {
    now: () => t,
    showScreen: async (recipe) => { await take(`screen:${recipe}`); return { ok: true, cases: recipe === "cases" ? o.cases ?? [] : undefined }; },
    runStep: async (s) => { f.moves.push(s); await take(`move:${s.a}`); },
    focusMap: async (p, tour) => { await take(`focus:${p.name}${tour ? `#${tour.rank}` : ""}`); },
    draft: async (ids) => { f.drafted.push(ids); await take(`draft:${ids.join(",")}`); return ids; },
    say: (text, lang, allowed) => { f.said.push({ text, lang, allowed }); },
    progress: (i, s, ms) => { f.progress.push([i, s, ms]); },
    card: (c) => { f.cards.push(c); },
    plan: o.plan
  };
  return f;
}
const CASES = [{ id: "INC-2026-0001", overdue: true }, { id: "INC-2026-0002", overdue: false }, { id: "INC-2026-0003", overdue: true }];

describe("mission (a): a water-crisis board for Velachery, built and run", () => {
  it("plans 3-6 steps as data, waits for Start, narrates every step with its real time, and only drafts into the tray", async () => {
    const m = fakeModel();
    const plan = planOf(await planMission("build me a water-crisis board for Velachery", { world }, deps(m)));
    expect(m.asked).toEqual([]); // a template: no model
    expect(plan.source).toBe("rules");
    expect(plan.steps.length).toBeGreaterThanOrEqual(3);
    expect(plan.steps.length).toBeLessThanOrEqual(6);
    expect(plan.steps.map((s) => s.kind)).toEqual(["screen", "screen", "screen", "screen", "focus", "draft"]);
    const [cases, perf, lakes, rain, focus, draft] = plan.steps;
    expect(cases).toMatchObject({ recipe: "cases", slots: { cat: "FLOOD_WATERLOGGING", taluk: "TLK-VLC", status: "open" } });
    expect(perf).toMatchObject({ recipe: "performance", slots: { by: "dept", dept: "GCC-SWD" } });
    expect(lakes).toMatchObject({ recipe: "readings", slots: { metric: "lakes" } });
    expect(rain).toMatchObject({ recipe: "readings", slots: { metric: "rain" } });
    expect(focus).toMatchObject({ kind: "focus", place: { name: "Velachery", taluk: "TLK-VLC" } });
    expect(draft).toMatchObject({ kind: "draft", risk: "C", from: cases.id, only: "overdue" });
    expect(plan.steps.filter((s) => s.risk === "C").map((s) => s.kind)).toEqual(["draft"]);
    expect(plan.risk).toBe("C");
    expect(checkRunnable(plan).ok).toBe(true);
    expect(cases.label.en).toBe("Open flooding and waterlogging cases in Velachery");
    expect(perf.label.en).toBe("How the drains team is doing");

    const durations = [1200, 800, 450, 2600, 300, 1500];
    const f = fake(durations, { cases: CASES });
    const ctl = missionControl();
    const run = runMission(plan, f.hooks, ctl);
    await tick();
    // the plan card is up; nothing has run
    expect(f.log).toEqual([]);
    expect(ctl.phase()).toBe("card");
    expect(f.cards.at(-1)?.phase).toBe("card");
    expect(missionCommand("start")).toEqual({ kind: "start" });
    expect(ctl.start()).toBe(true);
    const out = await run;

    expect(out.phase).toBe("done");
    expect(f.log).toEqual(["screen:cases", "screen:performance", "screen:readings", "screen:readings", "focus:Velachery", "draft:INC-2026-0001,INC-2026-0003"]);
    // every step's measured time, on the card and in its sentence
    const done = f.progress.filter(([, s]) => s === "done");
    expect(done.map(([i, , ms]) => [i, ms])).toEqual(durations.map((d, i) => [i, d]));
    expect(f.said).toHaveLength(7);
    durations.forEach((d, i) => expect(f.said[i].text).toContain(`${secondsOf(d)} second`));
    expect(f.said[0].text).toBe("Open flooding and waterlogging cases in Velachery: on screen in 1.2 seconds.");
    expect(f.said[4].text).toBe("The map is on Velachery, in 0.3 seconds.");
    expect(f.said[5].text).toBe("2 drafts are in your tray in 1.5 seconds, nothing sent.");
    expect(f.said[6].text).toBe(`That's everything, ${secondsOf(durations.reduce((a, b) => a + b, 0))} seconds in all.`);
    // every figure said is one code put there, and the gate is told exactly those
    for (const s of f.said) expect(gateChunk(s.text, s.allowed).ok).toBe(true);
    // Level C: the drafts went to the tray hook and nowhere else; no console move, nothing sent
    expect(f.drafted).toEqual([["INC-2026-0001", "INC-2026-0003"]]);
    expect(out.drafted).toEqual(["INC-2026-0001", "INC-2026-0003"]);
    expect(f.moves).toEqual([]);
    expect(out.steps.every((s) => s.state === "done")).toBe(true);
  });

  it("a spoken start in Tamil or Tanglish is a start; a 'don't start' is not", () => {
    for (const s of ["தொடங்கு", "start pannu", "ok start", "Start.", "aarambinga", "go ahead"]) expect(missionCommand(s), s).toEqual({ kind: "start" });
    for (const s of ["don't start yet", "wait", "start a new flood board for Adyar with the rain"]) expect(missionCommand(s), s).toBeNull();
  });
});

describe("mission (b): stopped mid-run", () => {
  it("'stop' ends at once: the step in hand is abandoned, nothing after it runs, and it says it stopped", async () => {
    const plan = planOf(await planMission("build me a water-crisis board for Velachery", { world }, deps()));
    const ctl = missionControl();
    const f = fake([900, 700], {
      cases: CASES,
      // the Collector says "stop" while the second screen is being built (it never finishes)
      onCall: (k) => { if (k === 1) { const c = missionCommand("stop"); expect(c).toEqual({ kind: "stop" }); ctl.stop(); return new Promise<void>(() => undefined); } }
    });
    const run = runMission(plan, f.hooks, ctl);
    ctl.start();
    const out = await run;
    expect(out.phase).toBe("stopped");
    expect(f.log).toEqual(["screen:cases", "screen:performance"]);
    expect(out.steps.map((s) => s.state)).toEqual(["done", "stopped", "pending", "pending", "pending", "pending"]);
    expect(f.drafted).toEqual([]);
    expect(f.said.at(-1)?.text).toBe("Stopped. Nothing else will run.");
    expect(f.said.some((s) => /That's everything/.test(s.text))).toBe(false);
  });

  it("a stop between steps (while a line is being said) also ends it, in Tamil too", async () => {
    const plan = planOf(await planMission("வேளச்சேரிக்கு தண்ணீர் நெருக்கடி பலகை தயார் செய்", { world }, deps()));
    expect(plan.lang).toBe("ta");
    const ctl = missionControl();
    const f = fake([500, 500, 500], { cases: CASES });
    const say = f.hooks.say;
    f.hooks.say = (text, lang, allowed) => { say(text, lang, allowed); if (f.said.length === 1) { expect(missionCommand("நிறுத்து")).toEqual({ kind: "stop" }); ctl.stop(); } };
    const run = runMission(plan, f.hooks, ctl);
    ctl.start();
    const out = await run;
    expect(f.log).toEqual(["screen:cases"]);
    expect(out.phase).toBe("stopped");
    expect(f.said.at(-1)).toMatchObject({ text: "நிறுத்தினேன். இனி எதுவும் ஓடாது.", lang: "ta" });
  });

  it("a stop before Start drops the card: nothing runs, nothing is said", async () => {
    const plan = planOf(await planMission("monsoon readiness", { world }, deps()));
    const ctl = missionControl();
    const f = fake([]);
    const run = runMission(plan, f.hooks, ctl);
    await tick();
    ctl.stop();
    const out = await run;
    expect(out.phase).toBe("cancelled");
    expect(f.log).toEqual([]);
    expect(f.said).toEqual([]);
    expect(ctl.start()).toBe(false);
  });
});

describe("mission (c): redirected mid-run", () => {
  it("'instead show me Adyar's drains' replaces the steps not yet run; the finished ones stay", async () => {
    const m = fakeModel();
    const plan = planOf(await planMission("build me a water-crisis board for Velachery", { world }, deps(m)));
    const ctl = missionControl();
    const f = fake([1000, 600, 700, 400], {
      cases: CASES,
      plan: async (text) => { const r = await planMission(text, { world, redirect: true }, deps(m)); return r.kind === "plan" ? r.plan : null; },
      // said while the second step is being built
      onCall: (k) => { if (k === 1) { const c = missionCommand("instead show me Adyar's drains"); expect(c).toEqual({ kind: "instead", text: "show me Adyar's drains" }); if (c?.kind === "instead") ctl.instead(c.text); } }
    });
    const run = runMission(plan, f.hooks, ctl);
    ctl.start();
    const out = await run;
    expect(m.asked).toEqual([]); // the fast lane read it: no model
    expect(out.phase).toBe("done");
    expect(f.log).toEqual(["screen:cases", "screen:performance", "screen:cases", "focus:Adyar"]);
    // the finished steps kept with their own ids and times; the old rest (reservoirs, rain, Velachery's map, the drafts) gone
    expect(out.steps.map((s) => [s.id, s.state, s.ms])).toEqual([["s1", "done", 1000], ["s2", "done", 600], ["r1s1", "done", 700], ["r1s2", "done", 400]]);
    expect(out.steps[2].label.en).toMatch(/drainage and sewage cases in Adyar/i);
    expect(f.drafted).toEqual([]);
    expect(f.said.map((s) => s.text)).toContain(`Changing course: ${out.steps[2].label.en}.`);
    expect(f.cards.at(-1)?.steps.map((s) => s.id)).toEqual(["s1", "s2", "r1s1", "r1s2"]);
  });

  it("a redirect that cannot be planned says so and carries on", async () => {
    const plan = planOf(await planMission("monsoon readiness", { world }, deps()));
    const ctl = missionControl();
    const f = fake([100, 100, 100, 100, 100, 100, 100, 100], { plan: async () => null, onCall: (k) => { if (k === 0) ctl.instead("something unplannable"); } });
    const run = runMission(plan, f.hooks, ctl);
    ctl.start();
    const out = await run;
    expect(out.phase).toBe("done");
    expect(f.said.map((s) => s.text)).toContain("I couldn't plan that, so I'm carrying on.");
    expect(out.steps).toHaveLength(plan.steps.length);
  });

  it("'skip that' skips the step in hand and the mission goes on", async () => {
    const plan = planOf(await planMission("monsoon readiness", { world }, deps()));
    const ctl = missionControl();
    const f = fake([300, 300, 300, 300, 300, 300, 300, 300], { onCall: (k) => { if (k === 1) { expect(missionCommand("skip that")).toEqual({ kind: "skip" }); ctl.skip(); return new Promise<void>(() => undefined); } } });
    const run = runMission(plan, f.hooks, ctl);
    ctl.start();
    const out = await run;
    expect(out.phase).toBe("done");
    expect(out.steps[1].state).toBe("skipped");
    expect(out.steps.filter((s) => s.state === "done").length).toBe(plan.steps.length - 1);
    expect(f.said[1].text).toBe(`Skipped: ${plan.steps[1].label.en}.`);
  });

  it("a draft whose list was skipped does not claim nothing is overdue: it says it did not come through, and drafts nothing", async () => {
    const plan = planOf(await planMission("build me a water-crisis board for Velachery", { world }, deps()));
    const ctl = missionControl();
    const f = fake([300, 300, 300, 300, 300, 300], { cases: CASES, onCall: (k) => { if (k === 0) { ctl.skip(); return new Promise<void>(() => undefined); } } });
    const run = runMission(plan, f.hooks, ctl);
    ctl.start();
    const out = await run;
    expect(out.steps.map((s) => s.state)).toEqual(["skipped", "done", "done", "done", "done", "failed"]);
    expect(f.drafted).toEqual([]);
    expect(f.said[5].text).toBe("Drafts for the overdue ones didn't come through, so I moved on.");
  });
});

describe("what a mission may never do", () => {
  const screen = { kind: "screen", label: null, screen: { recipe: "cases", cat: "FLOOD_WATERLOGGING", zones: [13] }, moves: [], place: null, draftOf: null, only: null };
  const focus = { kind: "focus", label: null, screen: null, moves: [], place: "Adyar", draftOf: null, only: null };
  it("a model plan holding a send, approve or delete step is refused whole", () => {
    for (const bad of [
      { kind: "send", label: "Send the drafts", screen: null, moves: [], place: null, draftOf: null, only: null },
      { kind: "approve_all", label: null, screen: null, moves: [], place: null, draftOf: null, only: null },
      { kind: "console", label: null, screen: null, moves: [{ action: "send" }], place: null, draftOf: null, only: null },
      { kind: "delete", label: "Delete the old complaints", screen: null, moves: [], place: null, draftOf: null, only: null },
      { kind: "draft", label: "Send all drafts to the officers now", screen: null, moves: [], place: null, draftOf: 1, only: "all" }
    ]) {
      const r = checkModelPlan({ kind: "plan", title: "Board", steps: [screen, focus, bad] } as unknown as ModelPlanT, world, "en", "make me a board for Adyar");
      expect(r.kind, JSON.stringify(bad)).toBe("refuse");
    }
    expect(checkModelPlan({ kind: "refuse", title: null, steps: [] }, world, "en", "approve everything").kind).toBe("refuse");
  });

  it("a sentence that asks to send, approve or delete is refused in code before any planning", async () => {
    const m = fakeModel({ kind: "plan", title: "x", steps: [screen, focus, screen] });
    for (const s of ["build a flood board for Velachery and send the drafts to the officers", "approve all the drafts in the tray", "delete the old flood complaints"]) {
      const r = await planMission(s, { world }, deps(m));
      expect(r.kind, s).toBe("refuse");
    }
    expect(m.asked).toEqual([]);
  });

  it("the executor refuses a plan that is not one of its four kinds, and runs nothing", async () => {
    const plan = templatePlan("flood", null, world, "en") as MissionPlanT;
    const bad = { ...plan, steps: [...plan.steps.slice(0, 2), { kind: "send", id: "s9", label: { en: "Send", ta: "அனுப்பு" }, risk: "C" }] };
    const f = fake([]);
    const out = await runMission(bad, f.hooks, missionControl());
    expect(out.phase).toBe("refused");
    expect(f.log).toEqual([]);
    // a draft marked Level A, or a screen marked C, is not its own level
    const lying = { ...plan, steps: plan.steps.map((s) => (s.kind === "draft" ? { ...s, risk: "A" } : s)) };
    expect(checkRunnable(lying).ok).toBe(false);
  });

  it("console moves from a model keep only Level-A moves of the mission kinds", () => {
    const r = checkModelPlan({ kind: "plan", title: "Flood watch", steps: [
      screen as never,
      { kind: "console", label: null, screen: null, moves: [{ action: "page", page: "environment" }, { action: "remember", text: "x" }, { action: "theme", option: "dark" }], place: null, draftOf: null, only: null } as never,
      focus as never
    ] }, world, "en", "a flood watch for Adyar");
    const plan = planOf(r);
    const c = plan.steps.find((s) => s.kind === "console");
    expect(c?.kind === "console" && c.moves).toEqual([{ a: "page", page: "environment" }]);
  });
});

describe("figures never survive in a label", () => {
  it("a model plan with a figure in a label has it removed (digits, words, Tamil, lakh), and a bare figure gives way to the code's label", async () => {
    const m = fakeModel({ kind: "plan", title: "Top 5 flood zones", steps: [
      { kind: "screen", label: "Flood deaths 300 in Adyar", screen: { recipe: "cases", cat: "FLOOD_WATERLOGGING", zones: [13] }, moves: [], place: null, draftOf: null, only: null },
      { kind: "screen", label: "Two lakh people hit", screen: { recipe: "trend", cat: "FLOOD_WATERLOGGING", zones: [13], period: "monthly" }, moves: [], place: null, draftOf: null, only: null },
      { kind: "focus", label: "42", place: "Adyar", screen: null, moves: [], draftOf: null, only: null },
      { kind: "draft", label: "Drafts for twenty-one cases", screen: null, moves: [], place: null, draftOf: 1, only: "overdue" }
    ] });
    // not a template (a war room for dengue): the model plans it
    const plan = planOf(await planMission("set up a dengue war room for Adyar", { world }, deps(m)));
    expect(m.asked).toEqual(["jarvis_mission"]);
    expect(plan.source).toBe("model");
    const labels = [plan.title, ...plan.steps.map((s) => s.label)];
    for (const l of labels) {
      expect(labelClean(l), JSON.stringify(l)).toBe(true);
      expect(figuresIn(l.en)).toEqual([]);
      expect(figuresIn(l.ta)).toEqual([]);
    }
    expect(plan.title.en).toBe("Top flood zones");
    expect(plan.steps[0].label.en).toBe("Flood deaths in Adyar");
    expect(plan.steps[1].label.en).toBe("people hit");
    expect(plan.steps[2].label.en).toBe("The map on Adyar");
    expect(plan.steps[3].label.en).toBe("Drafts for cases");
  });

  it("cleanLabel takes out Tamil numerals, Tamil number words, percents and Tanglish numbers", () => {
    expect(cleanLabel("௫௦ புகார்கள்", "x")).toBe("புகார்கள்");
    expect(cleanLabel("இருபத்தைந்து புகார்கள்", "x")).toBe("புகார்கள்");
    expect(cleanLabel("rendu zones romba mosam", "x")).toBe("zones romba mosam");
    expect(cleanLabel("Up 40% this week", "x")).toBe("Up this week");
    expect(cleanLabel("1,20,000", "fallback")).toBe("fallback");
  });

  it("every code-written label of every recipe, zone and template holds no figure", () => {
    const zones = world.zones.map((z) => z.n);
    for (const r of RECIPES) for (const z of zones) {
      const slots = { zones: [z, (z % 15) + 1], cat: "FLOOD_WATERLOGGING", status: "overdue", sev: "Severe", metric: "rain", measure: "zone_attention", by: "dept", dept: "GCC-SWD", what: "hotspots" };
      expect(labelClean(screenLabel(r, slots, world)), `${r} ${z}`).toBe(true);
    }
    for (const t of ["flood", "monsoon", "brief"] as const) for (const z of [null, ...zones]) {
      const p = templatePlan(t, z ? { name: world.zones[z - 1].name, ta: world.zones[z - 1].ta ?? null, zone: z, taluk: null } : null, world, "ta");
      expect(p, `${t} ${z}`).not.toBeNull();
      expect(checkRunnable(p).ok, `${t} ${z}`).toBe(true);
    }
  });
});

describe("Tamil and Tanglish get the templates", () => {
  const cases: [string, string, string | null][] = [
    ["வேளச்சேரிக்கு தண்ணீர் நெருக்கடி பலகை தயார் செய்", "flood", "Velachery"],
    ["Velachery ku water crisis board ready pannu", "flood", "Velachery"],
    ["அடையாறு வெள்ள போர்டு போடு", "flood", "Adyar"],
    ["பருவமழைக்குத் தயார் ஆகணும்", "monsoon", null],
    ["mazhaikku ready pannu", "monsoon", null],
    ["இன்றைய சுருக்கம் சொல்லு", "brief", null],
    ["innaiku brief sollu", "brief", null],
    ["வெள்ள அபாயத்தை மண்டலவாரியாக சுற்றிக் காட்டு", "tour", null],
    ["flood risk tour podu", "tour", null],
    ["tour the flood risk", "tour", null]
  ];
  it.each(cases)("%s -> %s", (text, template, place) => {
    const i = missionIntent(text, world);
    expect(i?.template).toBe(template);
    expect(i?.place?.name ?? null).toBe(place);
  });
  it("a Tamil or Tanglish board is planned by the rules, in Tamil, with Tamil labels", async () => {
    const m = fakeModel();
    for (const s of ["வேளச்சேரிக்கு தண்ணீர் நெருக்கடி பலகை தயார் செய்", "Velachery ku water crisis board ready pannu"]) {
      const plan = planOf(await planMission(s, { world }, deps(m)));
      expect(plan.source).toBe("rules");
      expect(plan.lang).toBe("ta");
      expect(plan.title.ta).toBe("வேளச்சேரி: தண்ணீர் நெருக்கடி பலகை");
      expect(plan.steps[0].label.ta).toMatch(/^வேளச்சேரி பகுதியில் /);
    }
    expect(m.asked).toEqual([]);
  });
  it("single screens stay single screens: a dashboard is not a mission", () => {
    expect(missionIntent("make me a flooding dashboard for this week", world)).toBeNull();
    expect(missionIntent("show me the severe cases in Adyar", world)).toBeNull();
  });
});

describe("the spoken map tour", () => {
  const zonesTool = async (name: string, args: Record<string, unknown>): Promise<ToolResult> => {
    expect(name).toBe("zones");
    expect((args.scope as { cat: string }).cat).toBe("FLOOD_WATERLOGGING");
    const open: Record<number, number> = { 13: 12, 14: 9, 15: 9, 7: 4, 1: 1, 2: 0 };
    return { scope: null, asOf: "2026-11-15", data: { rows: world.zones.map((z) => ({ zone: z.n, name: z.name, open: open[z.n] ?? 0 })) }, facts: [], sources: [], incidentIds: [] } as unknown as ToolResult;
  };
  it("'tour the flood risk' visits the zones worst first, one code-counted sentence each, the map synced through focusMap", async () => {
    const plan = planOf(await planMission("tour the flood risk", { world }, deps(fakeModel(), zonesTool)));
    expect(plan.source).toBe("tour");
    expect(plan.steps.map((s) => (s.kind === "focus" ? [s.place.zone, s.tour?.n, s.tour?.rank] : null))).toEqual([[13, 12, 1], [14, 9, 2], [15, 9, 3], [7, 4, 4], [1, 1, 5]]);
    const f = fake([200, 200, 200, 200, 200]);
    const ctl = missionControl();
    const run = runMission(plan, f.hooks, ctl);
    ctl.start();
    await run;
    expect(f.log).toEqual(["focus:Adyar#1", "focus:Perungudi#2", "focus:Sholinganallur#3", "focus:Ambattur#4", "focus:Thiruvottiyur#5"]);
    expect(f.said[0].text).toBe("Worst first. Adyar: 12 open flooding cases this week.");
    expect(f.said[4].text).toBe("Thiruvottiyur: 1 open flooding case this week.");
    for (const s of f.said) expect(gateChunk(s.text, s.allowed).ok).toBe(true);
  });
  it("in Tamil, and with no data there is no tour", async () => {
    const plan = planOf(await planMission("வெள்ள அபாயத்தை மண்டலவாரியாக சுற்றிக் காட்டு", { world }, deps(fakeModel(), zonesTool)));
    expect(plan.lang).toBe("ta");
    expect(await tourPlan(world, "en", undefined)).toBeNull();
    const r = await planMission("tour the flood risk", { world }, deps(fakeModel(), async () => { throw new Error("db down"); }));
    expect(r.kind).toBe("none");
  });
});

describe("the plan card before Start", () => {
  it("edit takes the plan's own steps, fewer or reordered, never a new or changed one, and not after Start", async () => {
    const plan = planOf(await planMission("build me a water-crisis board for Velachery", { world }, deps()));
    const ctl = missionControl();
    const f = fake([100, 100, 100], { cases: CASES });
    const run = runMission(plan, f.hooks, ctl);
    await tick();
    const [cases, , lakes, , , draft] = plan.steps;
    expect(ctl.edit([{ ...cases, slots: { ...(cases as Extract<MissionStepT, { kind: "screen" }>).slots, cat: "VECTOR_DISEASE" } }])).toEqual({ ok: false, why: "a step was changed" });
    expect(ctl.edit([{ kind: "screen", id: "zz", label: { en: "x", ta: "x" }, risk: "A", recipe: "news", slots: {} }])).toEqual({ ok: false, why: "not one of the plan's steps" });
    expect(ctl.edit([draft.id, cases.id]).ok).toBe(false); // a draft before its list
    expect(ctl.edit([cases.id, lakes.id, draft.id])).toEqual({ ok: true });
    expect(f.cards.at(-1)?.steps.map((s) => s.id)).toEqual([cases.id, lakes.id, draft.id]);
    ctl.start();
    expect(ctl.edit([cases.id])).toEqual({ ok: false, why: "the mission has started" });
    const out = await run;
    expect(f.log).toEqual(["screen:cases", "screen:readings", "draft:INC-2026-0001,INC-2026-0003"]);
    expect(out.phase).toBe("done");
  });
  it("the spoken controls, in three languages", () => {
    expect(missionCommand("Stop")).toEqual({ kind: "stop" });
    expect(missionCommand("niruthu")).toEqual({ kind: "stop" });
    expect(missionCommand("don't stop")).toBeNull();
    expect(missionCommand("skip that")).toEqual({ kind: "skip" });
    expect(missionCommand("ஸ்கிப் பண்ணு")).toEqual({ kind: "skip" });
    expect(missionCommand("show the rain instead")).toEqual({ kind: "instead", text: "show the rain" });
    expect(missionCommand("instead do the reservoirs")).toEqual({ kind: "instead", text: "the reservoirs" });
    expect(missionCommand("அதுக்கு பதிலா அடையாறு வடிகால் காட்டு")).toEqual({ kind: "instead", text: "அடையாறு வடிகால் காட்டு" });
    expect(missionCommand("badhila Adyar drains kaattu")).toEqual({ kind: "instead", text: "Adyar drains kaattu" });
    expect(missionCommand("show me the severe cases in Adyar")).toBeNull();
  });
});
