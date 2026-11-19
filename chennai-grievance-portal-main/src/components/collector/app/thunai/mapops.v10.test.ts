/**
 * v10: Ask the Map's operations run by Jarvis (mapops.ts), against a stand-in for the console's useMapAsk instance, the window event and the
 * network (mocked): each of the eleven features and the two new ones does what the panel's own controls do, says only the answer's own numbers,
 * and never sends, approves or saves without the Collector.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AskResponse } from "@/lib/map/ask";
import type { Plan } from "@/lib/map/plan";
import { mapCommand10, type MapCmd } from "@/lib/thunai/v10/map10";
import { briefAnswer, hotspotAnswer, withinAnswer } from "@/lib/thunai/v10/mapfix.testkit";
import type { BridgeOp, BridgeReply } from "../askmap/bridge";
import type { MapAsk } from "../askmap/useMapAsk";
import type { Console } from "../CollectorApp";
import { consoleMapDeps, deptCode, mapRisk, mapSnap10, resetMapOps, runMapCmd, tourNow, type MapLine, type MapOpsDeps } from "./mapops";

/** the console's Ask the Map, as far as Jarvis uses it: questions answered by `answers`, the rest recorded */
function fakeMap(first: AskResponse | null, answers: (q: string) => AskResponse | null = () => withinAnswer()) {
  let id = 0;
  const m = {
    grown: false, busy: false, error: null as string | null, resp: first, plan: first?.plan ?? null, history: [] as string[],
    turns: first ? [{ id: ++id, q: "open flooding within 500 m of hospitals", resp: first }] : [] as { id: number; q: string; resp: AskResponse | null }[],
    cue: { seq: 0, index: 0, move: true }, route: null as unknown,
    setGrown: vi.fn((v: boolean) => { m.grown = v; }),
    ask: vi.fn(async (q: string) => { const r = answers(q); if (r) { m.resp = r; m.turns.push({ id: ++id, q, resp: r }); } return r; }),
    run: vi.fn(async (p: Plan, label?: string) => { const r = withinAnswer(p); m.resp = r; m.turns.push({ id: ++id, q: label ?? "", resp: r }); return r; }),
    draw: vi.fn(async (d: { lat: number; lon: number; r: number }) => { void d; const r = briefAnswer(); m.resp = r; m.turns.push({ id: ++id, q: "What is inside the circle I drew?", resp: r }); return r; }),
    replay: vi.fn((i = 0) => { m.cue = { seq: m.cue.seq + 1, index: i, move: true }; }),
    restore: vi.fn((tid: number) => { const t = m.turns.find((x) => x.id === tid); if (t?.resp) m.resp = t.resp; }),
    setSpot: vi.fn(), setFocus: vi.fn(), setRoute: vi.fn((r: unknown) => { m.route = r; }), clear: vi.fn()
  };
  return m;
}
type Fake = ReturnType<typeof fakeMap>;
function deps(m: Fake, extra: Partial<MapOpsDeps> = {}) {
  const calls = { bridge: [] as { op: BridgeOp; args: Record<string, unknown> }[], fetch: [] as string[], rehearsal: [] as unknown[], shown: [] as unknown[], points: [] as unknown[] };
  const d: MapOpsDeps = {
    lang: "en", map: () => m as unknown as MapAsk, openMap: () => m.setGrown(true), settled: async () => undefined,
    bridge: (op, args = {}): BridgeReply | null => { calls.bridge.push({ op, args }); return { ok: true, state: {} }; },
    fetch: vi.fn(async (u: string | URL | Request) => { calls.fetch.push(String(u)); return new Response(JSON.stringify({ items: ["severe cases this week", "garbage near schools", "flooding by ward", "accidents near schools"] }), { status: 200 }); }) as unknown as typeof fetch,
    rehearsal: (x) => calls.rehearsal.push(x), show: (x) => calls.shown.push(x), point: (x) => calls.points.push(x),
    depts: () => [{ code: "GCC-SWD", name: "Storm Water Drains" }, { code: "CMWSSB", name: "Metro Water" }, { code: "GCC-SWM", name: "Solid Waste Management" }],
    ...extra
  };
  return { d, calls };
}
const run = (cmd: MapCmd, d: MapOpsDeps) => runMapCmd(cmd, d) as Promise<MapLine | null>;
/** every figure in the line is in its allowed set (the voice's number gate would let it through) */
const gated = (l: MapLine | null) => { for (const n of l?.en.match(/\d+(?:\.\d+)?/g) ?? []) expect(l?.allowed?.has(String(Number(n))) || l?.allowed?.has(n), `${n} in "${l?.en}"`).toBe(true); };

beforeEach(() => resetMapOps());

describe("Ask the Map's state, for the lanes", () => {
  it("open, an answer, its question, shots, chips and follow-ups", () => {
    const m = fakeMap(withinAnswer());
    m.grown = true;
    const s = mapSnap10(m as unknown as MapAsk, { rainOpen: false });
    expect(s).toMatchObject({ open: true, hasAnswer: true, kind: "answer", total: 12, question: "open flooding within 500 m of hospitals", shots: 1, shot: 0, rainOpen: false, tour: false });
    expect(s.chips).toContain("Within 500 m");
    expect(s.chipOpts?.find((c) => c.id === "d:near")?.options.find((o) => o.on)?.key).toBe("500");
    expect(s.suggest).toEqual(withinAnswer().followups);
    expect(mapSnap10(undefined)).toMatchObject({ open: false, hasAnswer: false });
    // the dev harness's stand-in has only setGrown
    expect(mapSnap10({ setGrown: () => undefined } as unknown as MapAsk)).toMatchObject({ open: false, hasAnswer: false, shots: 0 });
  });
  it("how sure Jarvis must be: save and export B, the drafts C, the rest A", () => {
    expect(mapRisk({ op: "save" })).toBe("B");
    expect(mapRisk({ op: "export", format: "csv" })).toBe("B");
    expect(mapRisk({ op: "send", dept: null })).toBe("C");
    expect(mapRisk({ op: "layer", layer: "schools", on: true })).toBe("A");
  });
});

describe("1-3. a question, a follow-up, a circle", () => {
  it("1. asks on the grown map and says the answer's gist, its own numbers only", async () => {
    const m = fakeMap(null);
    const { d } = deps(m);
    const l = await run({ op: "ask", question: "open flooding within 500 m of hospitals" }, d);
    expect(m.setGrown).toHaveBeenCalledWith(true);
    expect(m.ask).toHaveBeenCalledWith("open flooding within 500 m of hospitals");
    expect(l?.en).toBe("12 flooding incidents within 500 m of hospitals, last 7 days.");
    gated(l);
  });
  it("2. a follow-up edits the answer; with no answer it says so", async () => {
    const m = fakeMap(withinAnswer());
    const { d } = deps(m);
    expect((await run({ op: "followup", question: "only severe" }, d))?.en).toMatch(/^12 flooding incidents/);
    expect(m.ask).toHaveBeenCalledWith("only severe");
    const empty = fakeMap(null);
    expect((await run({ op: "followup", question: "only severe" }, deps(empty).d))?.en).toMatch(/no answer on the map/);
    expect(empty.ask).not.toHaveBeenCalled();
  });
  it("3. a circle: the radius said back, the default for 'near' with wider or closer, 5 km at most", async () => {
    const m = fakeMap(null, () => briefAnswer("Within 2 km of Kasimedu"));
    const { d } = deps(m);
    const l = await run({ op: "circle", place: "Kasimedu", km: 2, question: "what is happening within 2 km of Kasimedu" }, d);
    expect(m.ask).toHaveBeenCalledWith("what is happening within 2 km of Kasimedu");
    expect(l?.en).toBe("Within 2 km of Kasimedu: 7 open issues, most of them garbage (4); 2 past deadline.");
    gated(l);
    const near = await run({ op: "circle", place: "Koyambedu Bus Stand", km: 0.5, near: true, question: "what is happening within 500 m of Koyambedu Bus Stand" }, d);
    expect(near?.en).toMatch(/^Within 500 m of Koyambedu Bus Stand, the usual reach for a place like it\. Say wider or closer\./);
    await run({ op: "circle", place: "Adyar", km: 8, question: "what is happening within 8 km of Adyar" }, d);
    expect(m.ask).toHaveBeenLastCalledWith("what is happening within 5 km of Adyar");
    expect((await run({ op: "circle", place: "Adyar", km: 8, question: "what is happening within 8 km of Adyar" }, d))?.en).toMatch(/^The map's circles go up to 5 km, so within 5 km of Adyar\./);
  });
});

describe("2. chips", () => {
  it("wider doubles the distance with no AI (the chip's own edit), closer halves it", async () => {
    const m = fakeMap(withinAnswer());
    const { d } = deps(m);
    const l = await run({ op: "chip", chip: "d:near", scale: 2 }, d);
    const p = m.run.mock.calls[0][0] as Plan;
    expect(p.steps.find((s) => s.op === "within")).toMatchObject({ meters: 1000 });
    expect(l?.en).toMatch(/^Within 1 km now\. 12 flooding incidents within 1000 m/);
    await run({ op: "chip", chip: "d:near", scale: 0.5 }, d);
    expect((m.run.mock.calls[1][0] as Plan).steps.find((s) => s.op === "within")).toMatchObject({ meters: 500 });
  });
  it("a chip's option by its label; a part the answer lacks is said plainly", async () => {
    const m = fakeMap(withinAnswer());
    const { d } = deps(m);
    await run({ op: "chip", chip: "period", option: "30" }, d);
    const p = m.run.mock.calls[0][0] as Plan;
    expect(p.steps[0].op === "take" && p.steps[0].filter?.period).toEqual({ kind: "last_days", days: 30, offset: 0 });
    expect(m.run.mock.calls[0][1]).toBe("Last 30 days");
    expect((await run({ op: "chip", chip: "k:x", option: "3" }, d))?.en).toBe("That part isn't in this answer.");
  });
});

describe("4. layers and shots", () => {
  it("layers through the bridge; the map not on screen is said", async () => {
    const m = fakeMap(withinAnswer());
    const { d, calls } = deps(m);
    expect((await run({ op: "layer", layer: "schools", on: true }, d))?.en).toBe("Schools on the map.");
    expect(calls.bridge.at(-1)).toEqual({ op: "layer", args: { id: "schools", on: true } });
    expect((await run({ op: "layer", layer: "hospitals", on: false }, d))?.en).toBe("Hospitals off the map.");
    expect((await run({ op: "layer", layer: "satellite", on: true }, d))?.en).toBe("Satellite view.");
    expect(calls.bridge.at(-1)).toEqual({ op: "base", args: { base: "sat" } });
    await run({ op: "layer", layer: "heat", on: true }, d);
    expect(calls.bridge.at(-1)).toEqual({ op: "heat", args: { on: true } });
    const none = deps(m, { bridge: () => null }).d;
    expect((await run({ op: "layer", layer: "schools", on: true }, none))?.en).toMatch(/isn't on screen/);
  });
  it("next shot, previous, replay: the camera's cue, and a hotspot's cases spotted as the panel's tour does", async () => {
    const r = hotspotAnswer(4);
    const m = fakeMap(r);
    const { d } = deps(m);
    const l = await run({ op: "shot", shot: "next" }, d);
    expect(m.replay).toHaveBeenLastCalledWith(1);
    expect(m.setSpot).toHaveBeenLastCalledWith({ ids: r.extra.clusters![0].ids, label: "1. 10 reports near Kasimedu, Ward 40" });
    expect(l?.en).toBe("1. 10 reports near Kasimedu, Ward 40.");
    await run({ op: "shot", shot: "next" }, d);
    await run({ op: "shot", shot: "next" }, d);
    expect(m.replay).toHaveBeenLastCalledWith(3);
    expect((await run({ op: "shot", shot: "next" }, d))?.en).toBe("That's the last view of this answer.");
    await run({ op: "shot", shot: "previous" }, d);
    expect(m.replay).toHaveBeenLastCalledWith(2);
    expect((await run({ op: "shot", shot: "replay" }, d))?.en).toBe("Back to the answer's view.");
    expect(m.replay).toHaveBeenLastCalledWith(0);
    expect(m.setSpot).toHaveBeenLastCalledWith(null);
  });
});

describe("5-7. export, save, the visit order", () => {
  it("5. export: the file through the server, which asks for the password; no format opens the sheet", async () => {
    const m = fakeMap(withinAnswer());
    const download = vi.fn(async () => "ask-the-map-2026.csv: 12 rows.");
    const { d, calls } = deps(m, { download });
    const l = await run({ op: "export", format: "csv" }, d);
    expect(download).toHaveBeenCalledWith(m.resp, "csv", "open flooding within 500 m of hospitals");
    expect(l?.en).toBe("Exported 12 rows as CSV.");
    expect((await run({ op: "export", format: null }, d))?.en).toMatch(/^The Export sheet is open/);
    expect(calls.bridge.at(-1)?.op).toBe("exportSheet");
    const failing = deps(m, { download: vi.fn(async () => { throw new Error("Confirm it's you was cancelled."); }) }).d;
    expect((await run({ op: "export", format: "geojson" }, failing))?.en).toBe("Not exported: Confirm it's you was cancelled.");
    expect((await run({ op: "export", format: "csv" }, deps(fakeMap(null)).d))?.en).toMatch(/no answer on the map/);
  });
  it("6. save: nothing is saved until the Collector's yes (level B)", async () => {
    const m = fakeMap(withinAnswer());
    const save = vi.fn(async () => 'Saved as workspace "Map · open flooding". It re-runs on fresh data when opened.');
    let pending: (() => Promise<MapLine | null>) | null = null;
    const askYes = vi.fn((q: { en: string }, act: () => Promise<MapLine | null>) => { pending = act; });
    const { d } = deps(m, { save, askYes });
    expect(await run({ op: "save", name: "Kasimedu Flooding" }, d)).toBe(null);
    expect(askYes.mock.calls[0][0].en).toBe("Save this map view as a workspace called Kasimedu Flooding? It re-runs on fresh data when opened.");
    expect(save).not.toHaveBeenCalled();
    const said = await pending!();
    expect(save).toHaveBeenCalledWith(m.resp, "collector", "Kasimedu Flooding");
    expect(said?.en).toMatch(/^Saved as workspace/);
    // no way to ask: not saved
    const none = deps(m, { save }).d;
    expect((await run({ op: "save" }, none))?.en).toMatch(/needs your yes/);
    expect(save).toHaveBeenCalledTimes(1);
  });
  it("7. the visit order on the map, from the answer or from the cases named; the link stays the Collector's click", async () => {
    const open = vi.fn();
    vi.stubGlobal("open", open);
    const m = fakeMap(withinAnswer());
    const { d } = deps(m);
    const l = await run({ op: "visit", question: null }, d);
    expect(m.setRoute).toHaveBeenCalledTimes(1);
    const route = m.route as { stops: unknown[]; total_m: number };
    expect(route.stops).toHaveLength(9);
    expect(l?.en).toMatch(/^Visit order: 9 stops, [\d.]+ km in straight lines, starting near Kotturpuram\. Open in Google Maps is on the card; I won't send it anywhere without your yes\.$/);
    gated(l);
    // the field visit by voice: "plan my visit to the worst flooded spots tomorrow morning"
    const fresh = fakeMap(null);
    const fv = await run({ op: "visit", question: "open flooding", when: { en: "tomorrow morning", ta: "நாளை காலை" } }, deps(fresh).d);
    expect(fresh.ask).toHaveBeenCalledWith("open flooding");
    expect(fresh.setRoute).toHaveBeenCalledTimes(1);
    expect(fv?.en).toMatch(/^Visit order for tomorrow morning: 9 stops/);
    expect(open).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
  it("7. no open case with an exact place: said, no route", async () => {
    const r = withinAnswer();
    r.rows.forEach((x) => { x.open = false; });
    const m = fakeMap(r);
    expect((await run({ op: "visit", question: null }, deps(m).d))?.en).toBe("No open case in this answer has an exact place to visit.");
    expect(m.setRoute).not.toHaveBeenCalled();
  });
});

describe("8-10. the analyst, send, the suggestions", () => {
  it("8. the analyst's sentences are kept only when their numbers are the answer's; shown in Jarvis's own card", async () => {
    const m = fakeMap(withinAnswer());
    const body = { summary: "Storm Water Drains holds 6 of the 12. About 40 more are expected tomorrow.", actions: [{ text: "Clear the 3 past deadline first.", dept: "GCC-SWD" }, { text: "Send 25 pumps.", dept: null }], watch: "Watch the 9 still open.", model: "m", dropped: 0 };
    const f = vi.fn(async (u: string, init?: RequestInit) => { void u; void init; return new Response(JSON.stringify(body), { status: 200 }); });
    const { d, calls } = deps(m, { fetch: f as unknown as typeof fetch });
    const l = await run({ op: "insight" }, d);
    expect(f.mock.calls[0][0]).toBe("/api/map/insight");
    expect(JSON.parse(String((f.mock.calls[0] as unknown as [string, RequestInit])[1].body))).toEqual({ plan: m.resp!.plan });
    expect(l?.en).toBe("Storm Water Drains holds 6 of the 12. First: Clear the 3 past deadline first.");
    expect(l?.en).not.toMatch(/40|25/);
    expect(calls.shown[0]).toMatchObject({ id: "map-insight", title: "What stands out", takeaway: "Storm Water Drains holds 6 of the 12.\n• Clear the 3 past deadline first.\nWatch: Watch the 9 still open." });
    const none = deps(m, { fetch: vi.fn(async () => new Response(JSON.stringify({ none: true, reason: "ai" }), { status: 200 })) as unknown as typeof fetch }).d;
    expect((await run({ op: "insight" }, none))?.en).toBe("The AI analyst isn't answering right now.");
  });
  it("9. send: the drafts open for the department named; nothing is sent, nothing posted to the send route", async () => {
    const m = fakeMap(withinAnswer());
    const { d, calls } = deps(m);
    const l = await run({ op: "send", dept: "storm water drains" }, d);
    expect(calls.bridge.at(-1)).toEqual({ op: "send", args: { dept: "GCC-SWD" } });
    expect(l?.en).toBe("Drafts are open for Storm Water Drains, from the 9 open cases in this answer. Nothing is sent until you press Approve and confirm it's you.");
    expect(calls.fetch.some((u) => u.includes("/api/map/send"))).toBe(false);
    expect((await run({ op: "send", dept: "the moon office" }, d))?.en).toMatch(/^I don't know a department called the moon office/);
    const officer = deps(m, { bridge: () => ({ ok: false, why: "role" }) }).d;
    expect((await run({ op: "send", dept: null }, officer))?.en).toBe("Only the Collector's console sends to departments.");
  });
  it("9. the department said, in three languages, as the console's code", () => {
    const ds = [{ code: "GCC-SWD", name: "Storm Water Drains" }, { code: "CMWSSB", name: "Metro Water" }, { code: "GCC-SWM", name: "Solid Waste Management" }, { code: "TANGEDCO", name: "TANGEDCO" }];
    expect(deptCode("storm water drains", ds)?.code).toBe("GCC-SWD");
    expect(deptCode("SWD", ds)?.code).toBe("GCC-SWD");
    expect(deptCode("metro water", ds)?.code).toBe("CMWSSB");
    expect(deptCode("மெட்ரோ வாட்டர்", ds)?.code).toBe("CMWSSB");
    expect(deptCode("solid waste", ds)?.code).toBe("GCC-SWM");
    expect(deptCode("electricity board", ds)?.code).toBe("TANGEDCO");
    expect(deptCode("the moon office", ds)).toBe(null);
  });
  it("10. the suggestions read out (the answer's follow-ups, else today's), and the second one asked", async () => {
    const m = fakeMap(null);
    const { d, calls } = deps(m);
    const l = await run({ op: "suggest" }, d);
    expect(calls.fetch).toEqual(["/api/map/suggest"]);
    expect(l?.en).toBe("You could ask: 1, severe cases this week; 2, garbage near schools; 3, flooding by ward. Say ask the second one.");
    expect(calls.bridge.at(-1)).toEqual({ op: "tray", args: { open: true } });
    expect(mapSnap10(m as unknown as MapAsk).suggest?.[1]).toBe("garbage near schools");
    await run({ op: "suggest", n: 2 }, d);
    expect(m.ask).toHaveBeenLastCalledWith("garbage near schools");
    // a new answer on the map: "the second one" means its own follow-ups now, not the list read before it
    expect(mapSnap10(m as unknown as MapAsk).suggest).toEqual(withinAnswer().followups);
  });
});

describe("11. Rain & flooding", () => {
  it("opens, on a tab or a past rain; moves inside it while open; back and close", async () => {
    const m = fakeMap(null);
    let isOpen = false;
    const rain = { open: vi.fn(() => { isOpen = true; }), isOpen: () => isOpen, close: vi.fn(() => { isOpen = false; }), back: vi.fn(() => false) };
    const { d, calls } = deps(m, { rain });
    expect((await run({ op: "rain", act: "open", tab: "flooding" }, d))?.en).toBe("Rain and flooding is open on the Flooding tab.");
    expect(rain.open).toHaveBeenCalled();
    isOpen = false;
    await run({ op: "rain", act: "open", rain: "rain-2026-10-21" }, d);
    expect(calls.rehearsal.at(-1)).toEqual({ replay: "rain-2026-10-21", manual: false });
    await run({ op: "rain", act: "open", tab: "traffic" }, d);
    expect(calls.rehearsal.at(-1)).toEqual({ replay: null, manual: false, lens: "traffic" });
    await run({ op: "rain", act: "open", rain: "latest" }, d);
    expect(calls.rehearsal.at(-1)).toEqual({ replay: null, manual: false, stop: "check" });
    isOpen = true;
    expect((await run({ op: "rain", act: "open", tab: "power" }, d))?.en).toBe("The Power tab.");
    expect(calls.bridge.at(-1)).toEqual({ op: "rain", args: { tab: "power" } });
    expect((await run({ op: "rain", act: "back" }, d))?.en).toBe("Closed Rain and flooding.");
    expect(rain.close).toHaveBeenCalled();
  });
});

describe("the narrated district tour", () => {
  it("starts on today's hotspots: the camera to stop 1, its cases spotted, the reticle on it, the intro and the line said", async () => {
    const r = hotspotAnswer(5);
    const m = fakeMap(null, (q) => (/hotspots/.test(q) ? r : null));
    const { d, calls } = deps(m);
    const l = await run({ op: "tour", tour: "start", source: "hotspots" }, d);
    expect(m.ask).toHaveBeenCalledWith("hotspots of open incidents today");
    expect(m.replay).toHaveBeenLastCalledWith(1);
    expect(m.setSpot).toHaveBeenLastCalledWith({ ids: r.extra.clusters![0].ids, label: "near Kasimedu, Ward 40" });
    expect(calls.points.at(-1)).toEqual({ label: "Kasimedu", lat: 13, lon: 80.2 });
    expect(l?.en).toMatch(/^Hotspots today: 5 stops, .* 1\. Near Kasimedu, Ward 40: 10 reports, 9 still open, 2 severe; the biggest cluster\.$/);
    gated(l);
    expect(tourNow()?.i).toBe(0);
    expect(mapSnap10(m as unknown as MapAsk).tour).toBe(true);
  });
  it("next, the check-in after stop 3, stops past the camera's shots flown to by their first case, then the end", async () => {
    const r = hotspotAnswer(5);
    const m = fakeMap(null, () => r);
    const { d } = deps(m);
    await run({ op: "tour", tour: "start", source: "hotspots" }, d);
    await run({ op: "tour", tour: "next" }, d);
    expect(m.replay).toHaveBeenLastCalledWith(2);
    const third = await run({ op: "tour", tour: "next" }, d);
    expect(third?.en).toMatch(/Shall I go on\? 2 more: Adyar and Velachery\.$/);
    expect(mapSnap10(m as unknown as MapAsk).tourCheck).toBe(true);
    await run({ op: "tour", tour: "next" }, d);
    expect(m.setFocus).toHaveBeenLastCalledWith("I3-0");
    await run({ op: "tour", tour: "next" }, d);
    const end = await run({ op: "tour", tour: "next" }, d);
    expect(end?.en).toBe("That was the last of 5 stops. The tour is over.");
    expect(tourNow()).toBe(null);
  });
  it("go deeper asks the map about the stop (a 500 m circle there); next brings the tour's answer back first", async () => {
    const r = hotspotAnswer(5);
    const m = fakeMap(null, () => r);
    const { d } = deps(m);
    await run({ op: "tour", tour: "start", source: "hotspots" }, d);
    const deep = await run({ op: "tour", tour: "deeper" }, d);
    expect(m.draw).toHaveBeenCalledWith({ lat: 13, lon: 80.2, r: 500 });
    expect(deep?.en).toBe("Near Kasimedu, Ward 40, within 500 m: 7 open issues, most of them garbage (4); 2 past deadline. Say next to go on with the tour.");
    gated(deep);
    await run({ op: "tour", tour: "next" }, d);
    const tourTurn = m.turns.find((t) => t.resp === r)!;
    expect(m.restore).toHaveBeenCalledWith(tourTurn.id);
    expect(m.replay).toHaveBeenLastCalledWith(2);
  });
  it("stop ends it; the news and flood tours ask their own questions; nothing to tour is said", async () => {
    const m = fakeMap(null, () => hotspotAnswer(3));
    const { d, calls } = deps(m);
    await run({ op: "tour", tour: "start", source: "news" }, d);
    expect(m.ask).toHaveBeenCalledWith("hotspots of incidents in the news this week");
    expect((await run({ op: "tour", tour: "stop" }, d))?.en).toBe("Tour ended. The map stays where it is.");
    expect(calls.points.at(-1)).toBe(null);
    expect((await run({ op: "tour", tour: "next" }, d))?.en).toMatch(/^No tour is running/);
    const empty = fakeMap(null, () => hotspotAnswer(0));
    expect((await run({ op: "tour", tour: "start", source: "flood" }, deps(empty).d))?.en).toBe("Nothing clusters enough for a tour today or this week.");
    expect(empty.ask.mock.calls.map((c) => c[0])).toEqual(["hotspots of open flooding this week", "hotspots of flooding in the last 30 days"]);
  });
  it("a tour left when the map is shrunk ends there: 'go back' is the console's undo again, and the console is not pulled back to the map (v10 review 2, finding 14)", async () => {
    const r = hotspotAnswer(5);
    const m = fakeMap(null, () => r);
    const { d } = deps(m);
    await run({ op: "tour", tour: "start", source: "hotspots" }, d);
    // the Collector shrinks the map and moves on, without saying stop
    m.grown = false;
    m.setGrown.mockClear();
    const snap = mapSnap10(m as unknown as MapAsk);
    expect(snap).toMatchObject({ open: false, tour: false, tourCheck: false });
    expect(mapCommand10("go back", { ...snap, lang: "en" })).toBe(null);
    expect(tourNow()).toBe(null);
    // the map grown again for another question: the old tour does not come back
    m.grown = true;
    expect(mapSnap10(m as unknown as MapAsk).tour).toBe(false);
    expect(m.setGrown).not.toHaveBeenCalled();
  });
  it("stop ends a tour wherever the console is, without growing the map again (v10 review 2, finding 14)", async () => {
    const m = fakeMap(null, () => hotspotAnswer(5));
    const { d } = deps(m);
    await run({ op: "tour", tour: "start", source: "hotspots" }, d);
    m.grown = false;
    m.setGrown.mockClear();
    expect((await run({ op: "tour", tour: "stop" }, d))?.en).toBe("Tour ended. The map stays where it is.");
    expect(m.setGrown).not.toHaveBeenCalled();
    expect(tourNow()).toBe(null);
    expect((await run({ op: "tour", tour: "stop" }, d))?.en).toBe("No tour is running.");
  });
});

describe("never on its own", () => {
  it("no operation sends, approves or posts to the send or plan routes", async () => {
    const m = fakeMap(withinAnswer());
    const { d, calls } = deps(m, { askYes: () => undefined, download: vi.fn(async () => "x.csv: 12 rows.") });
    const cmds: MapCmd[] = [{ op: "send", dept: "metro water" }, { op: "send", dept: null }, { op: "save" }, { op: "visit", question: null }, { op: "export", format: null }, { op: "suggest" }, { op: "insight" }];
    for (const c of cmds) await run(c, d);
    expect(calls.fetch.filter((u) => /\/api\/map\/send|\/api\/rehearsal\/plan|workspaces/.test(u))).toEqual([]);
  });
  it("the dev harness (no mapAsk, or a stand-in with only setGrown): a question goes to askOnMap as in v9", async () => {
    const askOnMap = vi.fn();
    expect(await runMapCmd({ op: "ask", question: "garbage near schools" }, { lang: "en", askOnMap })).toBe(null);
    expect(askOnMap).toHaveBeenCalledWith("garbage near schools");
    const c = { askOnMap, mapAsk: { setGrown: () => undefined }, closeAll: () => undefined, depts: [] } as unknown as Console;
    const d = consoleMapDeps(() => ({ c }), { lang: "en" });
    expect(await runMapCmd({ op: "circle", place: "Adyar", km: 1, question: "what is happening within 1 km of Adyar" }, d)).toBe(null);
    expect(askOnMap).toHaveBeenLastCalledWith("what is happening within 1 km of Adyar");
    expect((await runMapCmd({ op: "layer", layer: "schools", on: true }, d))?.en).toBe("I can't do that on the map here.");
  });
});
