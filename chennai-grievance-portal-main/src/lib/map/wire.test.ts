import { describe, expect, it } from "vitest";
import { fixtureResolver } from "./fixture";
import { checkPlan } from "./plan";
import { makeResolver } from "./resolve";
import { rulesRoute } from "./route";
import { WirePlan, fromWire, toWire } from "./wire";

const resolve = makeResolver(fixtureResolver());
const QS = ["waterlogging within 300 m of schools", "garbage near schools and colleges", "open complaints near Adyar", "flooding in Zone 13 this week",
  "thefts along Anna Salai this month", "5 nearest police stations to Marina", "areas with no fire station within 3 km", "garbage complaints by ward",
  "where are garbage complaints clustering", "compare Adyar and Velachery flooding", "flooding this week vs last week in Zone 13", "Velachery taluk severe incidents",
  "waterlogging within half a km of government hospitals", "nearest hospital to each open severe flooding case"];

describe("the AI's flat form carries every plan exactly", () => {
  it.each(QS)("%s", (q) => {
    const r = rulesRoute(q, null, { resolve, dept: () => null });
    if (r?.kind !== "plan") throw new Error(`no plan for ${q}`);
    const w = toWire(r.plan);
    expect(WirePlan.safeParse(w).success).toBe(true);
    const back = fromWire(w);
    expect(checkPlan(back).ok).toBe(true);
    expect(back).toEqual(r.plan);
  });
});
