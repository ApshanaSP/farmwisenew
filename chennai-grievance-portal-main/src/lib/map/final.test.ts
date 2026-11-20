/**
 * Ask the Map final (20 Nov 2026): the new steps on the fixture world (a rule check, a gap per neighbourhood, a ranked change), each answer's
 * numbers checked by a brute-force count written here; the rules' readings of the new question shapes; the plan's wire for Claude (structured
 * outputs with a sentinel for none); and the map's own provider order, independent of AI_FORCE_PROVIDER.
 */
import { afterEach, describe, expect, it } from "vitest";
import { claudeReadBack, claudeWire } from "@/lib/ai/claude";
import { featureClaude, featureProviders } from "@/lib/ai/gateway";
import { compose } from "./answer";
import { mapSystemPrompt } from "./ai";
import { runMapPlan, rankRows, type Ctx, type Hit } from "./execute";
import { fixtureResolver, fixtureWorld, LIQUOR, NEIGHBOURHOODS, SCHOOLS, WORSHIP, BANKS } from "./fixture";
import { haversineM } from "./geom";
import { checkPlan, type Plan } from "./plan";
import { makeResolver } from "./resolve";
import { rulesRoute, type RouteEnv } from "./route";
import { COLLECTOR_LAYERS, LAYER_IDS } from "./types";
import { WirePlan, fromWire, toWire } from "./wire";
import { LAYER_WORD } from "./words";

const w = fixtureWorld();
const ctx: Ctx = { place: () => null, lang: "en" };
const run = (p: Plan) => {
  const c = checkPlan(p);
  if (!c.ok) throw new Error(c.problems.join("; "));
  return runMapPlan(c.plan, w, ctx);
};
const env: RouteEnv = { resolve: makeResolver(fixtureResolver()), dept: () => null, lang: "en", now: w.now };
const plan = (q: string) => {
  const r = rulesRoute(q, null, env);
  return r?.kind === "plan" ? r.plan : null;
};
const ops = (p: Plan | null) => p?.steps.map((s) => (s.op === "take" ? `take:${s.layer}${s.where?.kinds ? `[${s.where.kinds.join(",")}]` : ""}` : s.op === "within" ? `within:${s.meters}`
  : s.op === "farthest" ? `far:${s.areas}:${s.beyond_m}` : s.op === "rank" ? `rank:${s.by}:${s.order}` : s.op)).join(" ") ?? null;

describe("the Collector's layers", () => {
  it("every Collector layer has words in both languages and a place in the plan schema", () => {
    for (const l of COLLECTOR_LAYERS) {
      expect(LAYER_IDS).toContain(l);
      expect(LAYER_WORD[l].en.length).toBeGreaterThan(2);
      expect(/[஀-௿]/.test(LAYER_WORD[l].ta)).toBe(true);
    }
  });
});

describe("rule check: places within N m of other places", () => {
  const p: Plan = { language: "en", show: "rule", steps: [
    { op: "take", as: "f1", layer: "liquor", filter: null, where: null },
    { op: "take", as: "n1", layer: "schools", filter: null, where: null },
    { op: "take", as: "n2", layer: "worship", filter: null, where: null },
    { op: "within", as: "rule", of: "f1", near: ["n1", "n2"], meters: 100 }] };
  it("keeps exactly the shops an independent count finds, each with its nearest centre", () => {
    const r = run(p);
    const want = LIQUOR.filter((s) => [...SCHOOLS, ...WORSHIP].some((c) => haversineM(s, c) <= 100)).map((s) => s.id);
    expect(r.show.type).toBe("points");
    if (r.show.type !== "points") return;
    expect(r.show.items.map((x) => x.id)).toEqual(want);
    expect(want).toEqual(["osm:n11"]);
    const near = r.show.near!["osm:n11"];
    expect(near.id).toBe("osm:n1");
    expect(Math.round(near.m)).toBe(Math.round(haversineM(LIQUOR[0], SCHOOLS[0])));
  });
  it("the answer says how many of all, the closest, and that the legal distance is the Excise desk's", () => {
    const r = run(p);
    const a = compose(p, r, w, ctx);
    expect(a.count).toBe(1);
    expect(a.headline).toMatch(/^1 of 2 wine shops and bars is within 100 m of a school or place of worship/);
    expect(a.meaning).toMatch(/Excise desk/);
    // every number in the sentence is one of the facts
    const vals = new Set(a.facts.map((f) => f.value));
    for (const m of a.headline.match(/\d[\d,]*/g) ?? []) expect(vals.has(Number(m.replace(/,/g, "")))).toBe(true);
  });
  it("a place is never its own neighbour (schools within 100 m of schools)", () => {
    const r = run({ language: "en", show: "rule", steps: [{ op: "take", as: "f1", layer: "schools", filter: null, where: null }, { op: "take", as: "n1", layer: "schools", filter: null, where: null },
      { op: "within", as: "rule", of: "f1", near: ["n1"], meters: 5000 }] });
    if (r.show.type !== "points") throw new Error("not points");
    // S1 and S2 are about 1.5 km apart: each is the other's neighbour, neither its own
    expect(r.show.items.length).toBe(2);
    for (const it of r.show.items) expect(r.show.near![it.id].id).not.toBe(it.id);
  });
});

describe("gap per neighbourhood", () => {
  it("lists the neighbourhoods farther than the distance from a bank, by a brute-force distance", () => {
    const p: Plan = { language: "en", show: "far", steps: [{ op: "take", as: "f1", layer: "banks", filter: null, where: null }, { op: "farthest", as: "far", areas: "place", from: "f1", beyond_m: 1000 }] };
    const r = run(p);
    if (r.show.type !== "areas") throw new Error("not areas");
    const want = NEIGHBOURHOODS.filter((n) => Math.min(...BANKS.map((b) => haversineM(n, b))) > 1000).map((n) => n.id);
    expect(r.show.areas.map((a) => a.key)).toEqual(want);
    expect(r.show.total).toBe(2);
    const a = compose(p, r, w, ctx);
    expect(a.headline).toMatch(/^1 of 2 neighbourhoods are more than 1 km from a bank/);
    expect(a.meaning ?? "").not.toMatch(/best place/);
  });
});

describe("rank: the league table of a change", () => {
  const p: Plan = { language: "en", show: "rank", steps: [
    { op: "take", as: "a", layer: "incidents", filter: { category: null, family: null, severity: null, status: "any", dept: null, overdue: null, citizen: null, period: { kind: "last_days", days: 7, offset: 0 }, text: null }, where: null },
    { op: "change", as: "chg", of: "a", now: { kind: "last_days", days: 7, offset: 0 }, before: { kind: "last_days", days: 7, offset: 1 } },
    { op: "rank", as: "rank", of: "chg", by: "ward", order: "rise" }] };
  it("counts each ward in both windows as a plain loop does, the biggest rise first", () => {
    const r = run(p);
    if (r.show.type !== "ranked") throw new Error("not ranked");
    const day = (s: string) => (Date.parse(w.now.replace(" ", "T") + "Z") - Date.parse(s.replace(" ", "T") + "Z")) / 86_400_000;
    const cnt = (lo: number, hi: number) => {
      const m = new Map<number, number>();
      for (const i of w.incidents) { const d = day(i.first); if (d >= lo && d < hi && i.ward != null) m.set(i.ward, (m.get(i.ward) ?? 0) + 1); }
      return m;
    };
    const now = cnt(0, 7), before = cnt(7, 14);
    for (const row of r.show.rows) {
      expect(row.now).toBe(now.get(Number(row.key)) ?? 0);
      expect(row.before).toBe(before.get(Number(row.key)) ?? 0);
      expect(row.delta).toBe(row.now - row.before);
    }
    for (let i = 1; i < r.show.rows.length; i++) expect(r.show.rows[i - 1].delta).toBeGreaterThanOrEqual(r.show.rows[i].delta);
    const a = compose(p, r, w, ctx);
    const vals = new Set(a.facts.map((f) => f.value));
    for (const m of a.headline.match(/\d[\d,]*/g) ?? []) expect(vals.has(Number(m.replace(/,/g, ""))) || ["7"].includes(m)).toBe(true);
  });
  it("a rank of something that is not a change is refused by the plan check", () => {
    const bad = { ...p, steps: [p.steps[0], { op: "rank", as: "rank", of: "a", by: "ward", order: "rise" }], show: "rank" };
    expect(checkPlan(bad).ok).toBe(false);
  });
  it("rankRows gives a per cent only from 5 reports before", () => {
    const mk = (ward: number, n: number): Hit[] => Array.from({ length: n }, (_, k) => ({ inc: { ...w.incidents[0], id: `x${ward}-${n}-${k}`, ward }, near: null }));
    const { rows } = rankRows([...mk(1, 10), ...mk(2, 3)], [...mk(1, 5), ...mk(2, 1)], "ward", "rise", w);
    expect(rows.map((x) => [x.key, x.delta, x.pct])).toEqual([["1", 5, 100], ["2", 2, null]]);
  });
});

describe("the rules read the new question shapes", () => {
  const cases: [string, string][] = [
    ["wine shops within 100 m of schools", "take:liquor[wine_shop] take:schools within:100"],
    ["tasmac shops near temples", "take:liquor[wine_shop] take:worship[hindu] within:100"],
    ["places more than 2 km from a ration shop", "take:ration_shops far:place:2000"],
    ["wards with no ATM within 2 km", "take:atms far:ward:2000"],
    ["which wards got worse for flooding this month", "take:incidents change rank:ward:rise"],
    ["most improved zones for garbage", "take:incidents change rank:zone:fall"],
    ["banks", "take:banks"],
    ["courts", "take:gov_offices[court]"],
    ["மதுக்கடைகள்", "take:liquor[wine_shop]"]
  ];
  for (const [q, want] of cases) it(q, () => expect(ops(plan(q))).toBe(want));
  it("a mosque (பள்ளிவாசல்) is not also a school (பள்ளி)", () => expect(ops(plan("பள்ளிவாசல்கள்"))).toBe("take:worship[muslim]"));
  it("illegal parking stays a traffic topic, never parks", () => expect(ops(plan("illegal parking complaints this week"))).not.toMatch(/parks/));
});

describe("the plan's wire for Claude", () => {
  it("goes as structured outputs with no union and no optional field, and reads back to the same plan", () => {
    const x = claudeWire(WirePlan, true);
    expect(x.path).toBe("format");
    expect(x.unions).toBe(0);
    expect(x.optionals).toBe(0);
    const p: Plan = { language: "en", show: "near", steps: [
      { op: "take", as: "a", layer: "incidents", filter: { category: ["SOLID_WASTE"], family: null, severity: null, status: "open", dept: null, overdue: null, citizen: true, period: { kind: "last_days", days: 7, offset: 0 }, text: null }, where: null },
      { op: "take", as: "f1", layer: "markets", filter: null, where: null }, { op: "within", as: "near", of: "a", near: ["f1"], meters: 500 }] };
    // the wire form with sentinels, as Claude must write it: "" / -1 / [] / "true" for none and the booleans
    const sent = JSON.parse(JSON.stringify(toWire(p), (_k, v) => v));
    for (const st of sent.steps) for (const [k, v] of Object.entries(st)) {
      if (v === null) st[k] = ["category", "family", "severity", "dept", "kinds", "near"].includes(k) ? [] : ["overdue", "citizen", "news", "government"].includes(k) ? ""
        : ["period_days", "period_offset", "meters", "k", "beyond_m", "area_id", "area_radius_m", "b_id", "b_radius_m", "before_days", "before_offset"].includes(k) ? -1 : "";
      else if (typeof v === "boolean") st[k] = String(v);
    }
    const back = WirePlan.parse(claudeReadBack(WirePlan, sent, true));
    const c = checkPlan(fromWire(back));
    expect(c.ok && c.plan).toEqual(p);
  });
});

describe("Ask the Map's own provider and model", () => {
  const saved = { ...process.env };
  afterEach(() => { process.env = { ...saved }; });
  it("puts Claude first whatever AI_FORCE_PROVIDER says, on Haiku 5.5 at low effort without thinking", () => {
    process.env.AI_FORCE_PROVIDER = "bedrock";
    delete process.env.AI_MAP_PROVIDER; delete process.env.AI_MAP_CLAUDE_MODEL; delete process.env.AI_MAP_CLAUDE_EFFORT; delete process.env.AI_MAP_CLAUDE_THINK;
    expect(featureProviders("map")).toEqual(["anthropic", "bedrock", "groq", "gemini"]);
    expect(featureClaude("map")).toEqual({ model: "claude-haiku-5-5", effort: "low", think: false });
  });
  it("AI_MAP_PROVIDER=default puts the map back on the console's order", () => {
    process.env.AI_MAP_PROVIDER = "default";
    expect(featureProviders("map")).toBeNull();
  });
  it("the cached system block is byte-stable for a world and names every layer", () => {
    const c = { cats: [...w.cats.keys()], depts: [...w.depts.keys()], zones: w.zones };
    const a = mapSystemPrompt(c), b = mapSystemPrompt({ ...c });
    expect(a).toBe(b);
    for (const l of COLLECTOR_LAYERS) expect(a).toContain(`- ${l}:`);
    expect(a.length / 3.5).toBeGreaterThan(512);
  });
});
