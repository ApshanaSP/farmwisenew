/**
 * Ask the Map speed round (23 Nov 2026): the resolver's patterns compiled once with a quick pre-check, its answers kept per place
 * list; "near X" lists in local-search order with each case's distance; and "schools within 300 m of flooding" measured from the
 * schools on every path, as the AI already read it. Pure, on the fixture world.
 */
import { describe, expect, it } from "vitest";
import { enRe, taRe } from "@/lib/collector/nlp";
import { localRank, runMapPlan, type Ctx, type Hit, type Place } from "./execute";
import { fixtureResolver, fixtureWorld, INCIDENTS } from "./fixture";
import { haversineM } from "./geom";
import { checkPlan, facingIncidents, type Filter, type Plan, type Step } from "./plan";
import { makeResolver, requiredRun } from "./resolve";

describe("the resolver's pre-check", () => {
  it("finds the run a pattern cannot match without", () => {
    expect(requiredRun(enRe("Velachery"))).toBe("Velachery");
    // "T. Nagar": the longer word, never the optional joiner between them
    expect(requiredRun(enRe("T. Nagar"))).toBe("Nagar");
    // a Tamil pattern: its stem after the word-start guard (a final pulli or -u is dropped by taRe, so case endings may follow)
    expect(requiredRun(taRe("வேளச்சேரி"))).toBe("வேளச்சேரி");
    expect(requiredRun(taRe("அடையாறு"))).toBe("அடையாற");
    // a character a quantifier may drop is left out; an alternation at the top level has no single run
    expect(requiredRun(/\bmylapore?\b/i)).toBe("mylapor");
    expect(requiredRun(/\badyar|adayar\b/i)).toBeNull();
    expect(requiredRun(/\b(adyar|adayar)\s+river\b/i)).toBe("river");
    expect(requiredRun(/ab{2}cde/)).toBe("cde");
    expect(requiredRun(/\bkk\b/i)).toBeNull();
    // a back-reference's name, a control character's letter and \u{...} are not text a match holds
    // (built from strings: the compile target refuses named groups and \u{...} in a literal)
    expect(requiredRun(new RegExp("(?<n>ab)\\k<n>xyz"))).toBe("xyz");
    expect(requiredRun(/abc\cJdef/)).toBe("abc");
    expect(requiredRun(new RegExp("ab\\u{63}def", "u"))).toBe("def");
    for (const [re, t] of [[new RegExp("(?<n>ab)\\k<n>qq"), "ababqq"], [/abc\cJdef/, "abc\ndef"], [new RegExp("xy\\u{63}de", "u"), "xycde"]] as const)
      if (requiredRun(re)) expect(t.includes(requiredRun(re)!), String(re)).toBe(true);
  });

  it("never skips a pattern that matches (every fixture pattern, every text)", () => {
    const data = fixtureResolver();
    const texts = ["garbage near adyar", "VELACHERY flooding", "t.nagar thefts", "T Nagar", "அடையாறு அருகே", "along mount road", "gst road accidents", "Lake View Road",
      "stanley medical college hospital", "near cmbt", "test salai junction", "டெஸ்ட் சாலை", "koyambedu bus stand"];
    for (const e of data.entries) for (const re of e.res) {
      const run = requiredRun(re);
      for (const t of texts) if (new RegExp(re.source, re.flags).test(t)) expect((re.flags.includes("i") ? t.toLowerCase() : t).includes(re.flags.includes("i") ? run?.toLowerCase() ?? "" : run ?? ""), `${re} on "${t}"`).toBe(true);
    }
  });

  it("keeps its answers: the same text and verb give the same list, another verb its own", () => {
    const resolve = makeResolver(fixtureResolver());
    const a = resolve("open complaints near Adyar", "near");
    expect(resolve("open complaints near Adyar", "near")).toBe(a);
    expect(resolve("open complaints near Adyar", "in")).not.toBe(a);
    expect(a[0].pick.entry.ref).toBe("loc:Adyar");
    expect(resolve("open complaints near Adyar", "in")[0].pick.entry.ref).toBe("zone:13");
  });
});

const w = fixtureWorld();
const PLACES: Record<string, Place> = { "loc:Testpet": { ref: "loc:Testpet", name: "Testpet", name_ta: null, lat: 13.005, lon: 80.215, kind: "locality" } };
const ctx: Ctx = { lang: "en", place: (r) => PLACES[r] ?? null };
const F = (f: Partial<Filter>): Filter => ({ category: null, family: null, severity: null, status: "any", dept: null, overdue: null, citizen: null, period: null, text: null, ...f });
const take = (f: Partial<Filter> = {}): Step => ({ op: "take", as: "a", layer: "incidents", filter: F(f), where: null });

describe("a near-X list in local-search order", () => {
  const near: Plan = { language: "en", show: "in", steps: [take(), { op: "inside", as: "in", of: "a", area: { kind: "point", ref: "loc:Testpet", radius_m: 1000 } }] };

  it("each case carries its distance from the place, and the order is priority times the fall with distance, then newest", () => {
    const r = runMapPlan(near, w, ctx);
    const p = PLACES["loc:Testpet"];
    expect(r.hits.length).toBeGreaterThan(3);
    for (const h of r.hits) expect(h.m).toBeCloseTo(haversineM(h.inc, p), 6);
    const top = Math.max(...r.hits.map((h) => h.inc.priority));
    const score = (h: Hit) => ((1 + h.inc.priority) / (1 + top)) / (1 + h.m! / 500);
    for (let i = 1; i < r.hits.length; i++) expect(score(r.hits[i - 1])).toBeGreaterThanOrEqual(score(r.hits[i]) - 1e-12);
    // the count is the same as before: only the order changed
    expect(r.hits.length).toBe(INCIDENTS.filter((i) => i.pinnable && haversineM(i, p) <= 1000).length);
  });

  it("a close case of lower priority comes before a far one of a little higher", () => {
    const inc = INCIDENTS[0];
    const at = (id: string, priority: number, m: number, first = inc.first): Hit => ({ inc: { ...inc, id, priority, first }, near: null, m });
    const order = localRank([at("far", 80, 900), at("close", 60, 50)], 1000).map((h) => h.inc.id);
    expect(order).toEqual(["close", "far"]);
    // the same score: the newest first, then the id
    expect(localRank([at("old", 50, 100, "2026-10-01 10:00:00"), at("new", 50, 100, "2026-10-20 10:00:00")], 1000).map((h) => h.inc.id)).toEqual(["new", "old"]);
  });

  it("counts by ward after it are unchanged", () => {
    const by: Plan = { ...near, show: "by", steps: [...near.steps, { op: "count_by", as: "by", of: "in", by: "ward" }] };
    const r = runMapPlan(by, w, ctx);
    if (r.show.type !== "groups") throw new Error("not groups");
    const want = new Map<number, number>();
    for (const i of INCIDENTS) if (i.pinnable && i.ward != null && haversineM(i, PLACES["loc:Testpet"]) <= 1000) want.set(i.ward, (want.get(i.ward) ?? 0) + 1);
    expect(Object.fromEntries(r.show.groups.map((g) => [g.key, g.n]))).toEqual(Object.fromEntries([...want].map(([k, n]) => [String(k), n])));
  });
});

describe("facilities within N m of incidents", () => {
  const backwards: Plan = { language: "en", show: "near", steps: [take({ category: ["FLOOD_WATERLOGGING"], status: "open", period: { kind: "last_days", days: 30, offset: 0 } }),
    { op: "take", as: "f1", layer: "schools", filter: null, where: null }, { op: "within", as: "near", of: "f1", near: ["a"], meters: 300 }] };
  const forwards: Plan = { ...backwards, steps: [backwards.steps[0], backwards.steps[1], { op: "within", as: "near", of: "a", near: ["f1"], meters: 300 }] };

  it("is turned round into the incidents near the facilities, as the AI path reads it", () => {
    expect(facingIncidents(backwards)).toEqual(forwards);
    const c = checkPlan(backwards);
    expect(c.ok && c.plan).toEqual(forwards);
    const r = runMapPlan(backwards, w, ctx);
    expect(r.hits.map((h) => h.inc.id).sort()).toEqual(runMapPlan(forwards, w, ctx).hits.map((h) => h.inc.id).sort());
    expect(r.hits.length).toBeGreaterThan(0);
  });

  it("leaves a rule check (facilities near facilities) and a forward plan as they are", () => {
    const rule: Plan = { language: "en", show: "rule", steps: [{ op: "take", as: "f1", layer: "liquor", filter: null, where: null }, { op: "take", as: "n1", layer: "schools", filter: null, where: null },
      { op: "within", as: "rule", of: "f1", near: ["n1"], meters: 100 }] };
    expect(facingIncidents(rule)).toBe(rule);
    expect(facingIncidents(forwards)).toBe(forwards);
  });
});
