import { beforeEach, describe, expect, it, vi } from "vitest";

const query = vi.fn(async (sql: string): Promise<[Record<string, unknown>[], unknown]> => [/FROM documents d/.test(sql) ? DOCS : [], undefined]);
let DOCS: Record<string, unknown>[] = [];
vi.mock("@/lib/collector/db", () => ({ default: { query: (s: string) => query(s) }, ops: (t: string) => t, TITLE: "i.title" }));
const generateJson = vi.fn();
vi.mock("@/lib/ai/gateway", () => ({ generateJson: (...a: unknown[]) => generateJson(...a), aiStatus: () => ({ available: true }) }));

import { clearDesk, deskKey, deskOf, deskOfDocs, deskSkips, headOf, isListing, setVerdict } from "./deskbook";
import { judge, offDeskIncidents, unjudged, type DeskStory } from "./newsdesk";
import { relevantNews } from "./newsrel";
import { reportKind } from "./reporttype";

const story = (title: string, extra: Partial<DeskStory> = {}): DeskStory =>
  ({ titles: [title], title, titleEn: null, lang: "en", t: "2026-11-24 10:00:00", outlets: ["DT Next"], text: "", tag: "announcement / CRIME_PROPERTY", inRecords: false, ...extra });
const item = (n: number, x: Record<string, unknown>) => ({ n, verdict: "know", skip_reason: "", area: "Health", category: "", real_event: true, head: "", gist: "", why: "", ...x });

beforeEach(() => { clearDesk(); generateJson.mockReset(); DOCS = []; });

describe("a verdict is kept under the headline, however it is written", () => {
  it("finds it by the outlet's headline, its translation, or the same words with the outlet's name", () => {
    setVerdict("Back to Vice City: Why GTA 6 is a big deal", { v: "skip", skip: "entertainment" });
    expect(deskSkips("Back to Vice City: Why GTA 6 is a big deal")).toBe(true);
    expect(deskSkips("BACK TO VICE CITY:  why GTA 6 is a big deal - DT Next")).toBe(true);
    expect(deskSkips(null, "Back to Vice City: Why GTA 6 is a big deal")).toBe(true);
    expect(deskOf("Another headline")).toBeNull();
    expect(deskKey("Metro work at Koyambedu - Alandur")).not.toBe(deskKey("Metro work at Koyambedu"));
  });
  it("a story's verdict is the strongest of its reports'", () => {
    setVerdict("A", { v: "know" }); setVerdict("B", { v: "act" }); setVerdict("C", { v: "skip" });
    expect(deskOfDocs([{ title: "C" }, { title: "A" }, { title: "B" }])?.v).toBe("act");
    expect(deskOfDocs([{ title: "unread" }])).toBeNull();
  });
});

describe("a headline the desk wrote is the translation of its own report only", () => {
  it("never of another report of the same story (a health petition headed 'MLA died', 24 Nov)", () => {
    const v = { v: "know" as const, head: "Kolathur MLA V.S. Babu dies at 75", of: deskKey("கொளத்தூர் எம்எல்ஏ காலமானார்") };
    setVerdict("கொளத்தூர் எம்எல்ஏ காலமானார்", v); setVerdict("கொளத்தூர் எம்எல்ஏ உடல்நிலை: தகவல் கேட்டு வழக்கு", v);
    expect(headOf("கொளத்தூர் எம்எல்ஏ காலமானார்")).toBe("Kolathur MLA V.S. Babu dies at 75");
    expect(headOf("கொளத்தூர் எம்எல்ஏ உடல்நிலை: தகவல் கேட்டு வழக்கு")).toBe("");
  });
});

describe("judging a batch", () => {
  it("keeps the verdict and leaves out a line whose figure the report does not give", async () => {
    generateJson.mockResolvedValue({ object: { items: [
      item(1, { verdict: "act", area: "health", category: "HEALTH_SERVICES", head: "Four dean posts vacant at Chennai government hospitals", gist: "Dean posts at 47 hospitals are vacant.", why: "Vacancies slow the hospitals." }),
      item(2, { verdict: "skip", skip_reason: "Entertainment", real_event: false, head: "GTA 6 launch", gist: "should not be kept", why: "nor this" }),
      item(9, { verdict: "act" })
    ] }, info: { model: "m" } });
    const r = await judge([story("Four key leadership posts vacant across Chennai GHs", { text: "Dean and director posts at RGGGH and Stanley remain vacant." }), story("Back to Vice City: Why GTA 6 is a big deal", { text: "The game" })]);
    expect(r.get(0)).toMatchObject({ v: "act", area: "Health", cat: "HEALTH_SERVICES", gist: "", why: "Vacancies slow the hospitals." });
    expect(r.get(1)).toMatchObject({ v: "skip", skip: "entertainment", gist: "", why: "", real: false });
    expect(r.size).toBe(2);
  });
  it("asks for the report's kind, required (Groq), and keeps it with the verdict", async () => {
    generateJson.mockResolvedValue({ object: { items: [item(1, { verdict: "act", area: "Law & order", kind: "incident" }), item(2, { verdict: "know", kind: "government_action" })] }, info: { model: "m" } });
    const r = await judge([story("Chennai: 5-year-old girl kidnapped after going to school - Police rescued her immediately"), story("Chief Minister inaugurates drinking water project")]);
    expect(r.get(0)?.kind).toBe("incident");
    expect(r.get(1)?.kind).toBe("government_action");
    const call = generateJson.mock.calls[0][0] as { schema: { safeParse: (x: unknown) => { success: boolean } }; system: string };
    expect(call.schema.safeParse({ items: [item(1, { kind: "alert" })] }).success).toBe(true);
    expect(call.schema.safeParse({ items: [item(1, {})] }).success).toBe(false);
    expect(call.schema.safeParse({ items: [item(1, { kind: "rescue" })] }).success).toBe(false);
    // the definitions, with a rescue after harm still an incident
    expect(call.system).toMatch(/\bkind: what the report is/);
    expect(call.system).toMatch(/kidnapped on her way to school, police rescue her" is an incident, not a resolution/);
    for (const k of ["incident", "alert", "government_action", "resolution", "roundup", "opinion", "other"]) expect(call.system).toMatch(new RegExp(`\\n ${k}\\s`));
  });
  it("a kind the model made up is not kept: the rules decide that story", async () => {
    generateJson.mockResolvedValue({ object: { items: [item(1, { kind: "rescue" })] }, info: { model: "m" } });
    expect((await judge([story("x")])).get(0)?.kind).toBeUndefined();
  });
  it("an unknown category, area or reason is not kept", async () => {
    generateJson.mockResolvedValue({ object: { items: [item(1, { verdict: "skip", skip_reason: "boring", category: "MADE_UP", area: "Nowhere" })] }, info: { model: "m" } });
    expect((await judge([story("x")])).get(0)).toMatchObject({ skip: "other", cat: "", area: "" });
  });
});

describe("what is asked about", () => {
  const doc = (doc_id: string, title: string, x: Record<string, unknown> = {}) => ({ doc_id, story_id: doc_id, title, title_en: null, lang: "en", publisher: "DT Next", publisher_domain: "dtnext.in",
    publisher_tier: "established", category_code: "OTHER", report_type: "other", linked_incident_id: null, lead: "", t: "2026-11-24 10:00:00", ...x });
  it("each story once, not the daily listings, not outlets that are not news media, not what is judged", async () => {
    setVerdict("Judged already", { v: "know" });
    DOCS = [doc("1", "Judged already"), doc("2", "Chennai gold price rises by Rs 920; check today's gold, silver rate"), doc("3", "Land deal", { publisher: "scanx.trade", publisher_domain: "scanx.trade", publisher_tier: "regional" }),
      doc("4", "Water cut in four zones", { story_id: "S" }), doc("5", "Metrowater to stop supply in four zones", { story_id: "S", publisher: "The Hindu", publisher_domain: "thehindu.com" })];
    const u = await unjudged(2, "2026-11-24 12:00:00");
    expect(u.map((x) => x.titles.length)).toEqual([2]);
    expect(u[0].outlets).toEqual(["DT Next", "The Hindu"]);
  });
  it("a later report of a judged story takes the story's verdict, and is not asked about", async () => {
    setVerdict("Water cut in four zones", { v: "act" });
    DOCS = [doc("4", "Water cut in four zones", { story_id: "S" }), doc("5", "Metrowater to stop supply in four zones", { story_id: "S" })];
    expect(await unjudged(2, "2026-11-24 12:00:00")).toEqual([]);
    expect(deskOf("Metrowater to stop supply in four zones")?.v).toBe("act");
  });
  it("a story left out is read again when it has a new report (a theft whose victim dies)", async () => {
    setVerdict("Phone snatched from pedestrian", { v: "skip", skip: "petty crime" });
    DOCS = [doc("8", "Pedestrian dies after phone snatching", { story_id: "T" }), doc("7", "Phone snatched from pedestrian", { story_id: "T" })];
    expect((await unjudged(2, "2026-11-24 12:00:00")).map((x) => x.title)).toEqual(["Pedestrian dies after phone snatching"]);
    expect(deskOf("Pedestrian dies after phone snatching")).toBeNull();
  });
  it("knows a listing", () => {
    expect(isListing("Check out petrol and diesel prices in Chennai on November 24, 2026")).toBe(true);
    expect(isListing("சென்னையில் ஆபரணத் தங்கம் விலை சவரனுக்கு ரூ.920 உயர்ந்து")).toBe(true);
    expect(isListing("Gold smuggling: 12 kg seized at Chennai airport")).toBe(false);
  });
});

describe("news-only incidents that are none of the administration's business", () => {
  it("are those whose every read article was left out", async () => {
    setVerdict("Phone thief leaves halwa box", { v: "skip", skip: "petty crime" });
    setVerdict("Power line falls in Manali", { v: "act" });
    query.mockResolvedValueOnce([[{ inc: "I1", title: "Phone thief leaves halwa box" }, { inc: "I2", title: "Power line falls in Manali" }, { inc: "I3", title: "not read" }], undefined]);
    expect([...(await offDeskIncidents(["I1", "I2", "I3"]))]).toEqual(["I1"]);
  });
});

// the rules, until the desk has read a story
describe("the rules no longer take a word for an event", () => {
  const d = (title: string, extra: Record<string, unknown> = {}) => ({ title, lang: "en", report_type: "announcement", category_code: "CRIME_PROPERTY", ...extra });
  it("a video game is not a theft, a drawn match not an incident, even when the monitor linked them to one", () => {
    for (const t of ["Back to Vice City: Why GTA 6 is a big deal", "‘It’s been 13 years’: Chennai company declares holiday for employees to mark GTA 6 release", "Punjab FC - Chennaiyin FC draw",
      "Chennai CEO declares holiday for employees to celebrate GTA 6 launch"])
      for (const inc of [null, "INC-1"]) expect(relevantNews(d(t, { linked_incident_id: inc }), t), t).toBe(false);
    expect(reportKind("Back to Vice City: Why GTA 6 is a big deal")).toBeNull();
  });
  it("a death by cardiac arrest is a death, never an arrest", () => {
    expect(reportKind("Minister recovers after cardiac arrest")).not.toBe("incident");
    expect(reportKind("TV debate moderator dies of cardiac arrest on GST Road")).toBe("incident");
  });
});
