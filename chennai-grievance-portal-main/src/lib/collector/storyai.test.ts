import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/collector/db", () => ({ default: { query: vi.fn(async () => [[], []]) }, ops: (t: string) => t, TITLE: "i.title" }));
vi.mock("@/lib/ai/gateway", () => ({ generateJson: vi.fn(), aiStatus: () => ({ available: true }) }));

import { augment, checkedEvents, firstReported, fold, routine, sample, ruleEvents, soundLabel } from "./storyai";
import { stageOf, tokens, type Thread, type ThreadStep } from "./threads";

const step = (t: string, title: string, publisher = "The Hindu", stage = "Update"): ThreadStep =>
  ({ t, title, original: null, publisher, url: null, lang: "en", stage, incident: null, itemId: null, added: false, also: [] });
const thread = (title: string, steps: ThreadStep[]) =>
  ({ id: "THR-1", title, days: [{ day: steps[0].t.slice(0, 10), steps }] } as unknown as Thread);

describe("routine repeats", () => {
  it("drops daily prices and forecasts", () => {
    expect(routine(thread("Chennai gold price rises by Rs 760; check today's gold, silver rate", [step("2026-10-02 08:00:00", "Gold rate today")]))).toBe(true);
    expect(routine(thread("Chennai Weather Forecast & Update for Today", [step("2026-10-08 00:10:00", "Weather update")]))).toBe(true);
    expect(routine(thread("Chance of heavy rain tomorrow in 9 districts including Chennai", [step("2026-11-23 08:00:00", "Heavy rain likely in 9 districts"), step("2026-11-24 08:00:00", "Heavy rain expected today")]))).toBe(true);
  });
  it("keeps events", () => {
    expect(routine(thread("Car plunges into sinkhole on OMR", [step("2026-10-08 05:10:00", "Car plunges into sinkhole on OMR")]))).toBe(false);
  });
});

describe("folding repeated headlines", () => {
  it("folds the same headline from other outlets and keeps real changes", () => {
    const r = fold([
      step("2026-10-06 05:57:00", "Chennai Metro Phase II stretch set for October 11 inauguration", "Urban Acres", "First report"),
      step("2026-10-06 09:00:00", "Chennai Metro Phase II stretch set for October 11 inauguration", "DT Next", "First report"),
      step("2026-10-06 10:00:00", "Chennai Metro Phase II stretch set for 11 October inauguration", "News Today", "First report"),
      step("2026-10-11 13:51:00", "PM Modi launches first operational stretch of Chennai Metro Phase II", "The Times of India", "Update")
    ]);
    expect(r.steps.map((s) => s.publisher)).toEqual(["Urban Acres", "The Times of India"]);
    expect(r.steps[0].also).toEqual(["DT Next", "News Today"]);
    expect(r.steps[0].similar).toBe(2);
    expect(r.folded).toBe(2);
  });
});

// 24 Nov 2026: "Kolathur MLA dies of cardiac arrest" read as a police arrest in the story's timeline
describe("a step is read from what the headline means", () => {
  it.each([
    ["Kolathur MLA V S Babu dies at Chennai hospital after cardiac arrest", "Death"],
    ["TVK Kolathur MLA VS Babu who defeated MK Stalin dies of cardiac arrest", "Death"],
    ["Minister suffers cardiac arrest, under treatment", "Update"],
    ["School teacher arrested for misbehaving with college girl", "Arrest"],
    ["Bid to smuggle drugs into Puzhal jail, two held", "Arrest"],
    ["Chennai Woman held for murdering husband", "Arrest"],
    ["Consultation on mental healthcare held", "Update"],
    ["Camp to be held on November 28", "Update"],
    ["Public hearing held at Ripon Building", "Update"],
    ["Fishermen sit-in at Kasimedu harbour", "Protest"],
    ["Child rape case: SIT moves in", "Probe"],
    ["Civic body takes stock of drains", "Update"],
    ["Body of missing boy found in Adyar", "Death"],
    ["Retired officer loses Rs 2 crore to digital arrest", "Update"]
  ])("%s → %s", (title, want) => expect(stageOf(title)).toBe(want));
});

const KOLATHUR = [
  step("2026-11-19 15:31:00", "Kolathur MLA V S Babu dies at Chennai hospital after cardiac arrest", "The Times of India", "Death"),
  step("2026-11-19 16:40:00", "TVK MLA VS Babu, who defeated MK Stalin in Kolathur, dies at 75", "NDTV", "Death"),
  step("2026-11-20 10:45:00", "Complaint to police over Kolathur MLA's death", "Dinakaran", "Death"),
  step("2026-11-20 18:30:00", "CM Vijay turns pallbearer at Kolathur MLA V.S. Babu's funeral", "The Hindu", "Update"),
  step("2026-11-21 10:00:00", "Will Stalin contest the Kolathur by-election?", "Daily Thanthi", "Update"),
  step("2026-11-23 23:51:00", "T.N. Speaker declares Kolathur constituency vacant", "The Hindu", "Update"),
  step("2026-11-23 09:00:00", "Two men killed in separate hit-and-run cases", "DT Next", "Death")
];
const ALL = KOLATHUR.map((_, k) => k);

describe("the AI's timeline is checked against the reports", () => {
  it("an Arrested label over a cardiac arrest becomes what the reports say", () => {
    expect(soundLabel("Arrested", "Kolathur MLA V S Babu dies at Chennai hospital after cardiac arrest")).toBe("Death");
    expect(soundLabel("Arrest", "Teacher arrested in Kotturpuram")).toBe("Arrest");
    expect(soundLabel("Died", "Minister's convoy blocked")).toBe("Reported");
    expect(soundLabel("First report", "T.N. Speaker declares Kolathur constituency vacant")).toBe("Reported");
    expect(soundLabel("Seat vacant", "T.N. Speaker declares Kolathur constituency vacant")).toBe("Seat vacant");
  });
  it("each event once, in order, each report in one event, another event's report put out", () => {
    const ev = checkedEvents({ events: [
      { first: 1, also: [2, 2], label: "Arrested", what: "MLA V.S. Babu died at a Chennai hospital after a cardiac arrest." },
      { first: 2, also: [1], label: "Died", what: "MLA V.S. Babu died in Chennai." },
      { first: 6, also: [], label: "Seat vacant", what: "The Speaker declared the Kolathur seat vacant." },
      { first: 3, also: [], label: "Complaint filed", what: "A complaint about the death was given to the police." },
      { first: 4, also: [], label: "Funeral", what: "The Chief Minister carried the bier at the funeral." },
      { first: 7, also: [], label: "Death", what: "Two men were killed in hit-and-run cases." }
    ], unrelated: [7] }, KOLATHUR, ALL);
    expect(ev.map((e) => e.label)).toEqual(["Death", "Complaint filed", "Funeral", "Seat vacant"]);
    expect(ev[0].k).toEqual([0, 1]);
    // a report printed before the event's first one is not of it
    const late = checkedEvents({ events: [{ first: 4, also: [1, 2], label: "Funeral", what: "The funeral was held." }], unrelated: [] }, KOLATHUR, ALL);
    expect(late[0].k).toEqual([3]);
    expect(ev.map((e) => e.what).join(" ")).not.toMatch(/hit-and-run/);
  });
  it("two events that say the same thing are one", () => {
    const ev = checkedEvents({ events: [
      { first: 4, also: [], label: "Funeral", what: "CM Vijay carried the bier of MLA Babu at the funeral." },
      { first: 6, also: [], label: "Funeral", what: "CM Vijay carried the bier of MLA Babu at his funeral." }
    ], unrelated: [] }, KOLATHUR, ALL);
    expect(ev).toHaveLength(1);
    expect(ev[0].k).toEqual([3, 5]);
  });
  it("a figure none of the event's reports gives is never shown", () => {
    const ev = checkedEvents({ events: [{ first: 2, also: [], label: "Died", what: "The MLA, 82, died after 45 days in hospital." }], unrelated: [] }, KOLATHUR, ALL);
    expect(ev[0].what).toBe(KOLATHUR[1].title);
  });
  it("an event that points at no report is dropped", () => {
    expect(checkedEvents({ events: [{ first: 99, also: [], label: "Arrested", what: "Someone was arrested." }], unrelated: [] }, KOLATHUR, ALL)).toEqual([]);
  });
});

describe("the timeline by rules (until the AI has answered)", () => {
  it("never shows an arrest for a cardiac arrest, nor the same kind twice", () => {
    const ev = ruleEvents(fold(KOLATHUR.slice(0, 6)).steps);
    expect(ev[0].label).toBe("Death");
    expect(ev.some((e) => e.label === "Arrest")).toBe(false);
    expect(new Set(ev.filter((e) => e.label !== "Report").map((e) => e.label)).size).toBe(ev.filter((e) => e.label !== "Report").length);
  });
});

describe("one person dies once", () => {
  const two = [step("2026-11-19 15:22:00", "Kolathur TVK MLA V.S. Babu passed away", "Dinamani", "Death"), step("2026-11-19 15:31:00", "Babu, 75, dies at a Chennai hospital after cardiac arrest", "NDTV", "Death"),
    step("2026-11-20 10:00:00", "Second worker dies in hospital, toll rises to two", "The Hindu", "Death")];
  it("two entries are one, told in the AI's own sentence", () => {
    const ev = checkedEvents({ events: [{ first: 1, also: [], label: "Died", what: "The MLA died aged 79." }, { first: 2, also: [], label: "Died in hospital", what: "Babu died at a Chennai hospital after a cardiac arrest." }], unrelated: [] }, two, [0, 1, 2]);
    expect(ev).toHaveLength(1);
    expect(ev[0].what).toBe("Babu died at a Chennai hospital after a cardiac arrest.");
  });
  it("a second victim is another event", () => {
    const ev = checkedEvents({ events: [{ first: 1, also: [], label: "Died", what: "The MLA died in Chennai." }, { first: 3, also: [], label: "Died", what: "A second worker died in hospital." }], unrelated: [] }, two, [0, 1, 2]);
    expect(ev).toHaveLength(2);
  });
});

describe("reports the AI left out of a story", () => {
  it("are taken in when they carry the story's own words, and not when they only share common ones", () => {
    const u = (title: string, t: string) => ({ tk: new Set(tokens(title)), docs: [{ ms: Date.parse(`${t}T10:00:00+05:30`) }] as never });
    const units = [u("Kolathur MLA Babu dies in hospital", "2026-11-19"), u("Kolathur MLA Babu cremated", "2026-11-20"), u("Complaint over Kolathur MLA Babu death", "2026-11-20"), u("Kolathur MLA Babu cause of death explained", "2026-11-22"),
      u("T.N. Speaker declares Kolathur constituency vacant", "2026-11-23"), u("Man dies in hospital after fall in Adyar", "2026-11-20"), u("Kolathur lake desilting", "2026-09-01")];
    const df = new Map<string, number>();
    for (const x of units) for (const w of x.tk) df.set(w, (df.get(w) ?? 0) + 1);
    expect(augment([0, 1, 2, 3], units, new Set([0, 1, 2, 3]), df)).toEqual([4]);
  });
});

describe("what the AI reads of a long story", () => {
  it("leaves out no day and no kind of step", () => {
    const many = [...Array.from({ length: 70 }, (_, k) => step(`2026-11-19 ${String(10 + Math.floor(k / 6)).padStart(2, "0")}:${String((k % 6) * 10).padStart(2, "0")}:00`, `MLA dies, report ${k}`, "X", "Death")),
      step("2026-11-21 09:00:00", "Complaint on MLA's death: police inquiry begins"), step("2026-11-23 23:51:00", "Speaker declares seat vacant")];
    const s = sample(many);
    expect(s.length).toBeLessThanOrEqual(40);
    expect(s).toContain(0); expect(s).toContain(70); expect(s).toContain(71);
  });
});

describe("when an event was first reported", () => {
  it("one outlet's page dated the day before does not move it", () => {
    expect(firstReported(["2026-11-18 15:30:00", "2026-11-19 15:22:46", "2026-11-19 15:24:01", "2026-11-19 15:26:14", "2026-11-19 16:40:00"])).toBe("2026-11-19 15:22:46");
  });
  it("is the earliest report otherwise", () => {
    expect(firstReported(["2026-11-19 20:00:00", "2026-11-19 15:22:46"])).toBe("2026-11-19 15:22:46");
    expect(firstReported(["2026-11-18 22:00:00", "2026-11-18 23:30:00", "2026-11-19 07:00:00", "2026-11-19 09:00:00"])).toBe("2026-11-18 22:00:00");
  });
});

describe("the whole list", () => {
  beforeEach(() => { vi.resetModules(); });
  it("keeps every outlet of an event, each once with its own link", () => {
    const a = { ...step("2026-11-19 15:31:00", "Kolathur MLA V S Babu dies at Chennai hospital", "The Times of India", "Death"), url: "https://toi/1" };
    const b = { ...step("2026-11-19 15:45:00", "Kolathur MLA V S Babu dies at Chennai hospital", "NDTV", "Death"), url: "https://ndtv/2" };
    const c = { ...step("2026-11-19 17:00:00", "Kolathur MLA V S Babu dies at Chennai hospital", "NDTV", "Death"), url: "https://ndtv/3" };
    const [e] = ruleEvents(fold([a, b, c]).steps);
    expect(e.sources.map((s) => [s.publisher, s.url])).toEqual([["The Times of India", "https://toi/1"], ["NDTV", "https://ndtv/2"]]);
    expect(e.reports).toBe(3);
  });
});
