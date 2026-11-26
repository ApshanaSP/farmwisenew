/**
 * What was on the page today stays on it until the day rolls over (daynews.ts): two builds one after the other with other labels, ids and
 * grouping take nothing off Latest news, Left out or the developing stories; a correction does, and is seen.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { clearDayNews, keepDay, keepStories, type DayLook } from "./daynews";

type Row = Record<string, unknown>;
const NOW = "2026-11-26 14:00:00", DAY = "2026-11-26 00:00:00";
const doc = (n: number, t = "2026-11-26 09:00:00", more: Row = {}): Row => ({ doc_id: `D${n}`, url: `https://x.com/news/${n}`, title: `Report ${n}`, t, linked_incident_id: `INC-${n}`, ...more });
let store: Row[] = [], build = "b1", verdicts: Record<string, "act" | "know" | "skip"> = {}, asked = 0;
const look: DayLook = {
  find: async (ids, urls) => { asked++; return store.filter((r) => ids.includes(String(r.doc_id)) || urls.includes(String(r.url))); },
  verdict: (r) => verdicts[String(r.title)] ?? null,
  listing: (r) => /gold price/i.test(String(r.title)),
  build: async () => build
};
const run = async (kept: Row[], left: Row[] = [], now = NOW, from = DAY) => {
  const r = await keepDay({ kept: [...kept], left: [...left] }, now, from, look);
  return { kept: r.kept.map((x) => String(x.doc_id)).sort(), left: r.left.map((x) => String(x.doc_id)).sort(), rows: r };
};
beforeEach(() => { clearDayNews(); store = []; build = "b1"; verdicts = {}; asked = 0; });

describe("Latest news and Left out", () => {
  it("an article a build's labels drop (not district news, another category, its incident gone) stays where it was", async () => {
    store = [doc(1), doc(2), doc(3)];
    await run([doc(1), doc(2)], [doc(3)]);
    build = "b2";
    expect(await run([doc(1)], [])).toMatchObject({ kept: ["D1", "D2"], left: ["D3"] });
  });
  it("under another id in the next build it is the same article, once", async () => {
    store = [doc(1)];
    await run([doc(1)]);
    const again = { ...doc(1), doc_id: "Z9" };
    store = [again];
    expect((await run([again])).kept).toEqual(["Z9"]);
    expect((await run([])).kept).toEqual(["Z9"]);
  });
  it("read by the desk since as none of the Collector's business: it moves to Left out, never vanishes", async () => {
    store = [doc(1)];
    await run([doc(1)]);
    verdicts = { "Report 1": "skip" };
    expect(await run([])).toMatchObject({ kept: [], left: ["D1"] });
    verdicts = { "Report 1": "act" };
    expect(await run([])).toMatchObject({ kept: ["D1"], left: [] });
  });
  it("given an older date, or turned into a listing: let go", async () => {
    store = [doc(1), doc(2)];
    await run([doc(1), doc(2)]);
    store = [{ ...doc(1), t: "2026-11-24 10:00:00" }, { ...doc(2), title: "Gold price today" }];
    expect((await run([])).kept).toEqual([]);
  });
  it("missing from one build it stays (its incident is not linked); missing from the next too, it was withdrawn", async () => {
    store = [doc(1)];
    await run([doc(1)]);
    store = []; build = "b2";
    const a = await run([]);
    expect([a.kept, a.rows.kept[0].linked_incident_id]).toEqual([["D1"], null]);
    expect((await run([])).kept).toEqual(["D1"]); // the same build, asked again
    build = "b3";
    expect((await run([])).kept).toEqual([]);
    // and one that came back in between was never missing
    clearDayNews(); store = [doc(5)]; build = "b1";
    await run([doc(5)]);
    store = []; build = "b2"; await run([]);
    store = [doc(5)]; build = "b3"; await run([doc(5)]);
    store = []; build = "b4";
    expect((await run([])).kept).toEqual(["D5"]);
  });
  it("only until the day rolls over, and only today's reports", async () => {
    store = [doc(1), doc(2, "2026-11-25 22:00:00")];
    await run([doc(1), doc(2, "2026-11-25 22:00:00")], [], NOW, "2026-11-19 14:00:00"); // a week's list: yesterday's report is not written down
    expect((await run([])).kept).toEqual(["D1"]);
    expect((await run([], [], "2026-11-27 05:59:00")).kept).toEqual(["D1"]);
    expect((await run([], [], "2026-11-27 06:00:00")).kept).toEqual([]);
  });
  it("nothing missing: nothing is looked up", async () => {
    await run([doc(1)]);
    await run([doc(1), doc(2)]);
    expect(asked).toBe(0);
  });
});

describe("developing stories", () => {
  const s = (id: string, docs: string[], last = "2026-11-26 10:00:00") => ({ id, docs, last });
  const docs = (x: { docs: string[] }) => x.docs;
  it("one the model leaves out of its next list stays for the day; one joined with another does not come twice", () => {
    const a = keepStories(undefined, [s("A", ["1", "2"]), s("B", ["3", "4"])], docs, NOW);
    const b = keepStories(a.bag, [s("A2", ["1", "2", "9"])], docs, NOW);
    expect(b.list.map((x) => x.id)).toEqual(["A2", "B"]);
    const c = keepStories(b.bag, [s("C", ["9", "4"])], docs, NOW);
    expect(c.list.map((x) => x.id)).toEqual(["C"]); // both are in it now
    expect(keepStories(b.bag, [], docs, "2026-11-27 06:30:00").list).toEqual([]);
  });
  it("the rules' list, while no model answers, puts the day's back and writes none of its own down", () => {
    const a = keepStories(undefined, [s("A", ["1", "2"])], docs, NOW);
    const b = keepStories(a.bag, [s("R", ["7", "8"])], docs, NOW, false);
    expect(b.list.map((x) => x.id)).toEqual(["R", "A"]);
    expect(keepStories(b.bag, [], docs, NOW).list.map((x) => x.id)).toEqual(["A"]);
  });
  it("a story with nothing today is not kept", () => {
    const a = keepStories(undefined, [s("A", ["1"], "2026-11-25 20:00:00")], docs, NOW);
    expect(keepStories(a.bag, [], docs, NOW).list).toEqual([]);
  });
});
