/**
 * v18 round 3 (24 Nov review): the prices and readings screens over a window say only what their data holds. An item the Collector names is
 * found however far down the report it is, and one the report does not hold is said to be missing, never swapped for Tomato; each price
 * carries its own day; what data.gov.in gave is said as it was; a window with no reading says so aloud instead of passing an older one off.
 */
import { describe, expect, it } from "vitest";
import { WORLD } from "../fixture";
import { buildScreen, emptySlots, type Hands, type Slots } from "../screens";
import { checkStage, figuresOf, figuresOk, type ScopeT } from "../stage";
import { fakeHands } from "../stagefake";
import type { WinHands, WinPrice, WinPrices, WinReading } from "./window";
import { holdsProduce } from "../recipes/window18";

const NOW = "2026-11-24 15:05:00";
const BASE: ScopeT = { period: "weekly", zone: null, dept: null, cat: null, taluk: null, sev: null };
const slotsOf = (o: Partial<Slots>): Slots => ({ ...emptySlots(), ...o });
const DAY22 = { kind: "days", from: { day: 22, month: 10, year: 2026 }, to: { day: 22, month: 10, year: 2026 } } as const;
const DAY20 = { kind: "days", from: { day: 20, month: 10, year: 2026 }, to: { day: 20, month: 10, year: 2026 } } as const;

const P = (commodity: string, perKg: number, date = "2026-11-22", o: Partial<WinPrice> = {}): WinPrice => ({ commodity, perKg, firstPerKg: perKg, lo: null, hi: null, markets: 1, date, firstDate: date, ...o });
// fourteen items: the one asked for is fourteenth
const REPORT = [P("Tomato", 28), P("Onion", 40), P("Potato", 35), P("Brinjal", 30), P("Beans", 60), P("Carrot", 50), P("Cabbage", 20), P("Bhindi(Ladies Finger)", 45),
  P("Green Chilli", 55), P("Drumstick", 80), P("Banana - Green", 25), P("Cauliflower", 30), P("Beetroot", 38), P("Zucchini", 90)];
const prices = (o: Partial<WinPrices> = {}): WinPrices => ({ market: "Anna Nagar", rows: REPORT, latest: "2026-11-22", inWindow: true, held: { from: "2026-09-15", to: "2026-11-22" },
  fetched: false, keyed: true, ogd: null, ...o });

function win(o: Partial<WinHands> = {}): WinHands {
  return {
    now: async () => NOW,
    incidents: async () => { throw new Error("not read here"); },
    news: async () => ({ rows: [], total: 0 }),
    readings: async () => ({ rows: [], nearest: null }),
    warning: async () => null,
    prices: async () => prices(),
    traffic: async () => null,
    ...o
  };
}
const hands = (w: WinHands): Hands => ({ ...fakeHands(), win: w });
const texts = (doc: { blocks: unknown[] }) => JSON.stringify(doc.blocks);

describe("prices: the item the Collector names", () => {
  it("finds an item fourteenth in the report", async () => {
    const { doc } = await buildScreen("prices", slotsOf({ zones: [8], span: DAY22, q: "zucchini" }), BASE, WORLD, hands(win()), "zucchini price at Anna Nagar on 22 November", "p1", "en");
    expect(checkStage(doc).ok).toBe(true);
    const r = doc.blocks.find((b) => b.id === "prices");
    expect(r?.kind === "Ranking" && r.items.map((x) => x.label)).toEqual(["Zucchini"]);
    expect(doc.say.en).toMatch(/Zucchini was 90 rupees a kilo on 22 Nov/);
    expect(figuresOk(doc.say.en, figuresOf(doc))).toBe(true);
  });

  it("says an item not in the report is missing, never another item's price", async () => {
    const { doc } = await buildScreen("prices", slotsOf({ zones: [8], span: DAY22, q: "avocado" }), BASE, WORLD, hands(win()), "avocado price at Anna Nagar on 22 November", "p2", "en");
    expect(checkStage(doc).ok).toBe(true);
    expect(doc.say.en).toBe("Avocado is not in Anna Nagar Uzhavar Sandhai's report for 22 Nov.");
    expect(doc.say.en).not.toMatch(/Tomato|rupees/);
    expect(doc.blocks.find((b) => b.id === "absent")).toMatchObject({ kind: "Note", text: "Avocado is not in Anna Nagar Uzhavar Sandhai's report for 22 Nov." });
    expect(figuresOk(doc.say.en, figuresOf(doc))).toBe(true);
    // in Tamil too
    const ta = await buildScreen("prices", slotsOf({ zones: [8], span: DAY22, q: "avocado" }), BASE, WORLD, hands(win()), "avocado price", "p2t", "ta");
    expect(ta.doc.say.ta).toMatch(/^Avocado: .* அறிக்கையில் இல்லை/);
    expect(figuresOk(ta.doc.say.ta, figuresOf(ta.doc))).toBe(true);
  });

  it("finds produce under the report's own name, and names only what is missing", async () => {
    // "chilli" is Green Chilli, "okra" is Bhindi; "avocado" is not held
    expect(holdsProduce("Green Chilli", "chilli")).toBe(true);
    expect(holdsProduce("Bhindi(Ladies Finger)", "okra")).toBe(true);
    expect(holdsProduce("Cucumbar(Kheera)", "cucumber")).toBe(true);
    expect(holdsProduce("Banana - Green", "avocado")).toBe(false);
    const { doc } = await buildScreen("prices", slotsOf({ zones: [8], span: DAY22, q: "chilli and avocado" }), BASE, WORLD, hands(win()), "chilli and avocado prices", "p3", "en");
    const r = doc.blocks.find((b) => b.id === "prices");
    expect(r?.kind === "Ranking" && r.items.map((x) => x.label)).toEqual(["Green Chilli"]);
    expect(doc.say.en).toBe("At Anna Nagar Uzhavar Sandhai, Green Chilli was 55 rupees a kilo on 22 Nov. Avocado is not in Anna Nagar Uzhavar Sandhai's report for 22 Nov.");
    expect(figuresOk(doc.say.en, figuresOf(doc))).toBe(true);
  });
});

describe("prices: each item's own day", () => {
  it("says each price is its item's latest report in the window, with the date beside it", async () => {
    const rows = [P("Tomato", 28, "2026-11-22", { firstPerKg: 32, firstDate: "2026-11-20" }), P("Onion", 40, "2026-11-21"), P("Potato", 35, "2026-11-22", { lo: 30, hi: 38 })];
    const { doc } = await buildScreen("prices", slotsOf({ zones: [8], span: { kind: "hours", hours: 96, n: 4, unit: "day" } }), BASE, WORLD, hands(win({ prices: async () => prices({ rows }) })), "prices at Anna Nagar for the last 4 days", "p4", "en");
    const r = doc.blocks.find((b) => b.id === "prices");
    if (r?.kind !== "Ranking") throw new Error("no ranking");
    expect(r.method).toMatch(/^Modal price a kilo: each item's latest report in this window; its date is beside it/);
    expect(r.method).not.toMatch(/on 22 Nov/);
    expect(r.items.map((x) => x.sub)).toEqual(["22 Nov · down from ₹32 on 20 Nov", "21 Nov", "22 Nov · ₹30 to ₹38"]);
  });
  it("names the day when every price shown is of one day", async () => {
    const { doc } = await buildScreen("prices", slotsOf({ zones: [8], span: DAY22 }), BASE, WORLD, hands(win()), "prices at Anna Nagar on 22 November", "p5", "en");
    const r = doc.blocks.find((b) => b.id === "prices");
    expect(r?.kind === "Ranking" && r.method).toMatch(/^Modal price a kilo on 22 Nov\./);
  });
});

describe("prices: what data.gov.in gave", () => {
  const missing = (ogd: WinPrices["ogd"], keyed = true) => win({ prices: async () => prices({ inWindow: false, latest: "2026-10-02", rows: [P("Tomato", 30, "2026-10-02")], held: { from: "2026-09-15", to: "2026-10-02" }, keyed, ogd }) });
  const ogd = (o: Partial<NonNullable<WinPrices["ogd"]>>) => ({ tried: ["2026-11-20"], none: [], failed: [], late: [], error: null, fetched: false, capped: false, ...o });

  it("names a failure and never says it had none", async () => {
    const { doc } = await buildScreen("prices", slotsOf({ zones: [8], span: DAY20 }), BASE, WORLD, hands(missing(ogd({ failed: ["2026-11-20"], error: "data.gov.in HTTP 500" }))), "prices on 20 November", "g1", "en");
    expect(doc.blocks.find((b) => b.id === "ogd")).toMatchObject({ text: "data.gov.in could not be read for 20 Nov: data.gov.in HTTP 500." });
    expect(texts(doc)).not.toMatch(/had no|had none/);
    expect(figuresOk(doc.say.en, figuresOf(doc))).toBe(true);
  });
  it("says it had none only for a day it answered with none", async () => {
    const { doc } = await buildScreen("prices", slotsOf({ zones: [8], span: DAY20 }), BASE, WORLD, hands(missing(ogd({ none: ["2026-11-20"] }))), "prices on 20 November", "g2", "en");
    expect(doc.blocks.find((b) => b.id === "ogd")).toMatchObject({ text: "data.gov.in, asked too, had no Chennai market report for 20 Nov." });
  });
  it("says a read still going on is still going on", async () => {
    const { doc } = await buildScreen("prices", slotsOf({ zones: [8], span: DAY20 }), BASE, WORLD, hands(missing(ogd({ late: ["2026-11-20"], error: "data.gov.in did not answer within 2.5 s" }))), "prices on 20 November", "g3", "en");
    expect(doc.blocks.find((b) => b.id === "ogd")).toMatchObject({ text: expect.stringMatching(/^data\.gov\.in had not answered for 20 Nov in time/) });
    expect(texts(doc)).not.toMatch(/had no Chennai|could not be read/);
  });
  it("claims nothing for days it was not asked about", async () => {
    const { doc } = await buildScreen("prices", slotsOf({ zones: [8], span: DAY20 }), BASE, WORLD, hands(missing(ogd({ tried: [] }))), "prices on 20 November", "g4", "en");
    expect(doc.blocks.find((b) => b.id === "ogd")).toBeUndefined();
    expect(texts(doc)).not.toMatch(/data\.gov\.in/);
  });
  it("without a key, says why newer days are not read", async () => {
    const { doc } = await buildScreen("prices", slotsOf({ zones: [8], span: DAY20 }), BASE, WORLD, hands(missing(null, false)), "prices on 20 November", "g5", "en");
    expect(texts(doc)).toMatch(/CAPTCHA/);
  });
});

describe("readings: a window with no reading", () => {
  const stale = (o: Partial<WinReading>): WinReading => ({ id: "S", name: "S", zone: 8, lat: null, lon: null, avg: 0, max: 0, min: 0, first: 0, last: 0, lastAt: "", count: 1, inWindow: false, ...o });
  const rows = [stale({ id: "A", name: "Arumbakkam, Chennai - TNPCB", avg: 85, max: 85, min: 85, last: 85, lastAt: "2026-11-18 16:00" }),
    stale({ id: "V", name: "Velachery, Chennai - CPCB", avg: 120, max: 120, min: 120, last: 120, lastAt: "2026-11-17 09:00" })];
  const w = win({ readings: async () => ({ rows, nearest: null }) });

  it("says aloud that no reading falls in it, and gives the latest before it with its date", async () => {
    const { doc } = await buildScreen("readings", slotsOf({ metric: "aqi", span: DAY20 }), BASE, WORLD, hands(w), "air quality on 20 November", "r1", "en");
    expect(checkStage(doc).ok).toBe(true);
    expect(doc.say.en).toBe("No air quality (aqi) reading falls on 20 Nov. The latest before it: Arumbakkam at 85, on 18 Nov, 4 PM.");
    expect(doc.say.en).not.toMatch(/the highest is/);
    expect(figuresOk(doc.say.en, figuresOf(doc))).toBe(true);
    const ta = await buildScreen("readings", slotsOf({ metric: "aqi", span: DAY20 }), BASE, WORLD, hands(w), "air quality on 20 November", "r1t", "ta");
    expect(ta.doc.say.ta).toMatch(/அளவு எதுவும் இல்லை\. அதற்கு முன் கடைசி அளவு: Arumbakkam, 85, 18 Nov, 4 PM\.$/);
    expect(figuresOk(ta.doc.say.ta, figuresOf(ta.doc))).toBe(true);
  });
  it("still says the window's highest when readings fall in it", async () => {
    const inside = [stale({ id: "A", name: "Arumbakkam, Chennai - TNPCB", avg: 85, max: 120, min: 40, lastAt: "2026-11-20 12:00", count: 3, inWindow: true })];
    const { doc } = await buildScreen("readings", slotsOf({ metric: "aqi", span: DAY20 }), BASE, WORLD, hands(win({ readings: async () => ({ rows: inside, nearest: null }) })), "air quality on 20 November", "r2", "en");
    expect(doc.say.en).toBe("Air quality (AQI) on 20 Nov: the highest is Arumbakkam at 85.");
  });
});
