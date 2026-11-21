/**
 * v15 (22 Nov): the focus questions, as the owner asked them on 21 Nov (data/thunai/audit.jsonl, 23:15-23:18) and in the request of 22 Nov,
 * and the analysis behind the focus screen.
 */
import { describe, expect, it } from "vitest";
import { analyseFocus, focusAsk, focusSay, slopePct, trendOf, windowOf, zOf, type FocusRows } from "./focus";

const W = { zones: [{ n: 9, name: "Teynampet", ta: "தேனாம்பேட்டை" }, { n: 5, name: "Royapuram", ta: "ராயபுரம்" }, { n: 13, name: "Adyar", ta: "அடையாறு" }, { n: 8, name: "Anna Nagar", ta: "அண்ணா நகர்" }] };

describe("focusAsk: the owner's own questions", () => {
  const cases: [string, string[]][] = [
    ["Which areas should I concentrate on the most?", ["attention"]],
    ["Which are all the areas I have to concentrate more, and which areas keep improving?", ["attention", "improving"]],
    ["Which areas are improving?", ["improving"]],
    ["Which zones are getting worse this month?", ["worsening"]],
    ["Where do problems keep coming back again and again?", ["repeat"]],
    ["எந்த area-ல நிறைய cases இருக்கு, நிறைய worst ஆகிட்டே வருது?", ["worsening"]],
    ["எந்த area-ல நிறைய cases வந்துகிட்டே இருக்கு, repeated-ஆ?", ["repeat"]],
    ["எந்த area-ல நிறைய cases வந்துட்டே இருக்கு?", ["repeat"]],
    ["இப்போ நான் எந்த area-ல ரொம்ப concentrate பண்ணனும்? எந்த area-ல நிறைய cases இருக்கு?", ["attention"]],
    ["எந்த area வந்து improve ஆகிட்டே வருது?", ["improving"]],
    ["எந்த ஏரியாலலாம் இப்போ நான் நிறையா கான்சென்ட்ரேட் பண்ணணும், எந்த ஏரியாலாம் இப்போ இம்ப்ரூவ் ஆகியிருக்கு", ["attention", "improving"]],
    ["What should I concentrate on now?", ["attention"]],
    ["Enga area-la cases kuraiyudhu?", ["improving"]],
    ["எந்தப் பகுதியில் புகார்கள் குறைந்து வருகிறது?", ["improving"]],
    ["எந்த மண்டலம் மோசமாகிட்டே வருது?", ["worsening"]]
  ];
  for (const [q, lenses] of cases) it(q, () => expect(focusAsk(q, W)?.lenses).toEqual(lenses));

  const not = ["Go to the trends page", "Show me live traffic", "Which department is improving the most?", "Is Adyar improving?", "Compare Adyar and Royapuram",
    "Tell me today's news", "How are you?", "Top three areas with the most rainfall", "எப்படி பேசுற?", "Show me the flooded streets"];
  for (const q of not) it(`not a focus question: ${q}`, () => expect(focusAsk(q, W)).toBeNull());

  it("the window the question names", () => {
    expect(windowOf("which areas are improving this week")).toBe(7);
    expect(windowOf("which areas improved this month")).toBe(28);
    expect(windowOf("over the last 3 months which zones got worse")).toBe(84);
    expect(windowOf("இந்த மாசம் எந்த area improve ஆகியிருக்கு")).toBe(28);
    expect(windowOf("which areas are improving")).toBe(28);
  });
});

describe("the analysis", () => {
  it("a move counts only beyond ordinary ups and downs", () => {
    expect(trendOf(120, 80)).toBe("worse"); // z = 40 / 14.1 = 2.8
    expect(trendOf(55, 50)).toBe("steady"); // z = 0.5
    expect(trendOf(40, 80)).toBe("better");
    expect(trendOf(4, 1)).toBe("steady"); // a tiny count is noise
    expect(zOf(0, 0)).toBe(0);
    expect(slopePct([1, 2, 3, 4, 5, 6, 7, 8])).toBeGreaterThan(0);
    expect(slopePct([8, 7, 6, 5, 4, 3, 2, 1])).toBeLessThan(0);
    expect(slopePct([0, 0, 0, 0])).toBeNull();
  });

  const now = "2026-11-22 10:00:00";
  const day = (back: number) => new Date(Date.parse("2026-11-22T00:00:00+05:30") - back * 86_400_000 + 330 * 60_000).toISOString().slice(0, 10);
  const rows: FocusRows = {
    days: [
      ...Array.from({ length: 56 }, (_, b) => ({ zone: 9, name: "Teynampet", d: day(b), n: b < 28 ? 6 : 3, severe: b < 28 ? 1 : 0, rep: 1 })),
      ...Array.from({ length: 56 }, (_, b) => ({ zone: 13, name: "Adyar", d: day(b), n: b < 28 ? 2 : 5, severe: 0, rep: 0 })),
      ...Array.from({ length: 56 }, (_, b) => ({ zone: 5, name: "Royapuram", d: day(b), n: 4, severe: 1, rep: 0 }))
    ],
    kinds: [
      { zone: 9, cat: "FLOOD_WATERLOGGING", label: "Flooding & waterlogging", now: 120, prev: 40 }, { zone: 9, cat: "SOLID_WASTE", label: "Garbage", now: 48, prev: 44 },
      { zone: 13, cat: "ROAD_DAMAGE", label: "Road damage", now: 30, prev: 100 }, { zone: 13, cat: "SOLID_WASTE", label: "Garbage", now: 26, prev: 40 },
      { zone: 5, cat: "SOLID_WASTE", label: "Garbage", now: 112, prev: 110 }
    ],
    backlog: [{ zone: 9, open: 150, overdue: 30, severeOpen: 5 }, { zone: 13, open: 20, overdue: 2, severeOpen: 0 }, { zone: 5, open: 130, overdue: 25, severeOpen: 6 }],
    repeats: [{ zone: 9, name: "Teynampet", place: "TTK Road", cat: "FLOOD_WATERLOGGING", label: "Flooding & waterlogging", n: 7, open: 3 }]
  };
  const a = analyseFocus(rows, now, 28, W);
  it("ranks where to concentrate, and finds the zone getting worse and the one improving", () => {
    expect(a.attention[0].zone).toBe(9);
    expect(a.worse.map((z) => z.zone)).toEqual([9]);
    expect(a.better.map((z) => z.zone)).toEqual([13]);
    const t = a.zones.find((z) => z.zone === 9)!;
    expect(t.now).toBe(168); expect(t.prev).toBe(84); expect(t.pct).toBe(100);
    expect(t.rise?.cat).toBe("FLOOD_WATERLOGGING");
    expect(t.weekly).toHaveLength(12);
    expect(t.weekly.slice(-4)).toEqual([42, 42, 42, 42]);
    expect(t.reasons[0].en).toMatch(/30 open past their deadline/);
    expect(a.zones.find((z) => z.zone === 5)!.trend).toBe("steady");
    expect(a.district.now).toBe(336);
  });
  it("says it in English and Tamil with the screen's figures", () => {
    const s = focusSay(a, ["attention", "improving"]);
    expect(s.en).toMatch(/^Concentrate first on Teynampet: 30 open past their deadline/);
    expect(s.en).toMatch(/Improving over the last 4 weeks: Adyar, down 60% \(140 to 56\)/);
    expect(s.ta).toMatch(/தேனாம்பேட்டை/);
    expect(s.ta).toMatch(/அடையாறு, 60% குறைஞ்சிருக்கு/);
    const r = focusSay(a, ["repeat"]);
    expect(r.en).toMatch(/TTK Road in Teynampet: 7 Flooding & waterlogging reports/);
    const w = focusSay(a, ["worsening"]);
    expect(w.en).toMatch(/Getting worse: Teynampet, up 100% \(84 to 168\), mostly Flooding & waterlogging/);
  });
});
