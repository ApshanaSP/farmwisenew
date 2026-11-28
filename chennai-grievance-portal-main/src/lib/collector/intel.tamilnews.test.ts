/**
 * Tamil headlines in Latest news (27 Nov 2026, the owner: Tamil news no longer showed). Since 6 Oct every story's headline was its English
 * translation and the Tamil text only a tooltip; a mixed story carried no Tamil at all. Now `title` stays English (Jarvis, the assistant,
 * Differ and the AI briefing read it) and `original` is the Tamil headline as published, cleaned of an outlet's English tags, for every
 * story with a Tamil report; `taLead` says the story is in Tamil only (or led by a Tamil report), so the screen shows the Tamil first.
 * And a desk headline written from another report is not borrowed: a Saturday power cut was shown as "coming Tuesday".
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const w = vi.hoisted(() => ({ docs: [] as Record<string, unknown>[] }));
const pool = {
  query: async (sql: string) => [/FROM documents d WHERE d\.is_district = 1/.test(sql) ? w.docs.map((d) => ({ ...d })) : []]
};
vi.mock("@/lib/collector/db", () => ({
  default: pool, ops: (t: string) => t, OPS_DB: "district_intel_ops", TITLE: "i.title", CLUSTER: "COALESCE(i.cluster_id, i.incident_id)"
}));
vi.mock("@/lib/db", () => ({ default: pool }));
// the day's list as built (no "what was listed today stays" book in a unit test)
vi.mock("@/lib/collector/daynews", () => ({ keepDay: async (lists: unknown) => lists }));

const { newsStories, newsLeftOut, tamilHeadline } = await import("./intel");
const { clearDesk, deskKey, setVerdict } = await import("./deskbook");

const NOW = "2026-11-27 10:00:00";
let n = 0;
const doc = (o: { title: string; title_en?: string | null; lang?: string; t?: string; story?: string; publisher?: string; domain?: string }) => ({
  doc_id: `D${++n}`, has_body: 1, story_id: o.story ?? `S${n}`, story_role: null, title: o.title, title_en: o.title_en ?? null, lang: o.lang ?? "ta",
  url: `https://example.test/${n}`, publisher: o.publisher ?? "Dinamani", publisher_domain: o.domain ?? "dinamani.com", publisher_tier: "established",
  place_text: null, ai_place: null, ai_orgs: null, category_code: "OTHER", report_type: null, linked_incident_id: null, t: o.t ?? "2026-11-27 08:00:00"
});

beforeEach(() => { clearDesk(); w.docs = []; n = 0; });

describe("tamilHeadline: the Tamil headline as published, for the screen", () => {
  it("keeps the Tamil pieces of a '|' headline and drops an outlet's English tags", () => {
    expect(tamilHeadline("Chennai | Lorry Accident | வந்த வேகத்தில் தடுப்பு சுவரில் மோதி நின்ற லாரி - ஓட்டுநரின் நிலை என்ன?"))
      .toBe("வந்த வேகத்தில் தடுப்பு சுவரில் மோதி நின்ற லாரி - ஓட்டுநரின் நிலை என்ன?");
    expect(tamilHeadline("சென்னை உள்ளிட்ட 31 மாவட்டங்களில் இன்று மிதமான மழை | Chennai rain forecast")).toBe("சென்னை உள்ளிட்ட 31 மாவட்டங்களில் இன்று மிதமான மழை");
  });
  it("drops hashtags and a 'ZEE Tamil News.' prefix, and writes '..' as '…'", () => {
    expect(tamilHeadline("ZEE Tamil News. . சென்னையில் கனமழை #ChennaiRains #ZeeTamilNews")).toBe("சென்னையில் கனமழை");
    expect(tamilHeadline("Rain Alert லிஸ்டில் சென்னை.. அடித்து நொறுக்க காத்திருக்கும் மழை")).toBe("Rain Alert லிஸ்டில் சென்னை… அடித்து நொறுக்க காத்திருக்கும் மழை");
    expect(tamilHeadline("சென்னையில் நாளை (27.11.2026) எந்தெந்த பகுதிகளில் மின்தடை தெரியுமா?...")).toBe("சென்னையில் நாளை (27.11.2026) எந்தெந்த பகுதிகளில் மின்தடை தெரியுமா?…");
  });
  it("puts no space between the '…' and a '!' or '?' after it ('..!' ends many Tamil headlines)", () => {
    expect(tamilHeadline("சென்னையில் பயங்கரம்..! கொடுங்கையூர் பேருந்து நிலையத்தில் நடத்துநருக்கு அரிவாள் வெட்டு..!"))
      .toBe("சென்னையில் பயங்கரம்…! கொடுங்கையூர் பேருந்து நிலையத்தில் நடத்துநருக்கு அரிவாள் வெட்டு…!");
    expect(tamilHeadline("“கொளத்தூரில் மு.க.ஸ்டாலின் போட்டியா....?” துரைமுருகன் பதில்")).toBe("“கொளத்தூரில் மு.க.ஸ்டாலின் போட்டியா…?” துரைமுருகன் பதில்");
  });
  it("leaves the Tamil words and figures as they are", () => {
    const t = "சென்னை காமராஜர் துறைமுகத்தில் ரூ.4,288 கோடியில் 2-வது முனையம்: மத்திய அமைச்சரவைக் குழு ஒப்புதல்";
    expect(tamilHeadline(t)).toBe(t);
  });
});

describe("newsStories: a Tamil story shows its Tamil headline", () => {
  it("a story in Tamil only: original is its cleaned Tamil headline, taLead, and title stays English", async () => {
    const ta = doc({ title: "Chennai | Lorry Accident | மகாலிங்கபுரம் மேம்பாலத்தில் டிப்பர் லாரி மோதி விபத்து", title_en: "Tipper lorry hits Mahalingapuram flyover wall" });
    w.docs = [ta];
    setVerdict(ta.title, { v: "know", area: "Roads & transport", head: "Tipper lorry hits the Mahalingapuram flyover wall", of: deskKey(ta.title), gist: "The driver escaped." });
    const [s] = await newsStories("daily", NOW);
    expect(s.title).toBe("Tipper lorry hits the Mahalingapuram flyover wall");
    expect(s.original).toBe("மகாலிங்கபுரம் மேம்பாலத்தில் டிப்பர் லாரி மோதி விபத்து");
    expect(s.taLead).toBe(true);
  });

  it("a story with English and Tamil reports: English leads, and the Tamil report's headline comes with it", async () => {
    const en = doc({ story: "S-NEHRU", lang: "en", title: "Anti-Corruption officials arrest aide of K.N. Nehru's brother", publisher: "The Indian Express", domain: "indianexpress.com" });
    const ta = doc({ story: "S-NEHRU", title: "கே.என்.நேரு சகோதரரின் உதவியாளர் சென்னை விமான நிலையத்தில் மடக்கிப் பிடிப்பு", title_en: "K.N. Nehru's brother's aide caught at Chennai airport", t: "2026-11-27 09:00:00" });
    w.docs = [ta, en];
    setVerdict(en.title, { v: "know", area: "Law & order", head: "", of: deskKey(en.title) });
    const [s] = await newsStories("daily", NOW);
    expect(s.title).toBe("Anti-Corruption officials arrest aide of K.N. Nehru's brother");
    expect(s.original).toBe("கே.என்.நேரு சகோதரரின் உதவியாளர் சென்னை விமான நிலையத்தில் மடக்கிப் பிடிப்பு");
    expect(s.taLead).toBe(false);
  });

  it("an English story has no Tamil line", async () => {
    w.docs = [doc({ lang: "en", title: "Toddler dies after diesel stored at home catches fire", publisher: "DT Next", domain: "dtnext.in" })];
    setVerdict(String(w.docs[0].title), { v: "act", area: "Accidents & fire" });
    const [s] = await newsStories("daily", NOW);
    expect([s.original, s.taLead]).toEqual([null, false]);
  });

  it("a Saturday power cut is not shown under the head the desk wrote for a Tuesday one", async () => {
    const tue = doc({ story: "S-TUE", title: "சென்னையில் வரும் செவ்வாய்க்கிழமை மின்தடை அறிவிப்பு.. எந்தெந்த ஏரியாக்கள் தெரியுமா?", title_en: "Power outage announced in Chennai for the coming Tuesday",
      t: "2026-11-24 19:00:00", publisher: "News18 Tamil", domain: "tamil.news18.com" });
    const sat = doc({ story: "S-SAT", title: "சென்னையில் வரும் சனிக்கிழமை மின்தடை அறிவிப்பு.. எந்தெந்த ஏரியாக்கள் தெரியுமா?", title_en: "Power outage announced in Chennai for the coming Saturday",
      t: "2026-11-27 07:00:00", publisher: "News18 Tamil", domain: "tamil.news18.com" });
    w.docs = [sat, tue];
    const tuesday = { v: "know" as const, area: "Power" as const, head: "Power outage announced for key areas of Chennai on coming Tuesday", gist: "Power will be cut on Tuesday.", of: deskKey(tue.title) };
    setVerdict(tue.title, tuesday);
    setVerdict(sat.title, tuesday); // the desk's verdict copied to the later report of the story (newsdesk.ts)
    const [s] = await newsStories("daily", NOW);
    expect(s.topic).toBe("power");
    expect(s.id).toBe(sat.doc_id);
    expect(s.title).toBe("Power outage announced in Chennai for the coming Saturday");
    expect(s.title).not.toMatch(/tuesday/i);
    expect(s.desk?.gist).toBe(""); // another day's account is not this notice's
    expect(s.original).toContain("சனிக்கிழமை");
    expect(s.taLead).toBe(true);
  });

  it("a routine notice led by an English report carries no Tamil line from another day's notice", async () => {
    // routine notices of one kind are one story for the whole period (newsrel.clusterNews): its Tamil reports may be other days' notices
    const sat = doc({ story: "S-PWR", lang: "en", title: "Power shutdown in parts of Chennai on Saturday for maintenance work", t: "2026-11-27 07:00:00",
      publisher: "DT Next", domain: "dtnext.in" });
    const tue = doc({ story: "S-PWR", title: "சென்னையில் வரும் செவ்வாய்க்கிழமை மின்தடை அறிவிப்பு.. எந்தெந்த ஏரியாக்கள் தெரியுமா?", title_en: "Power outage announced in Chennai for the coming Tuesday",
      t: "2026-11-26 19:00:00", publisher: "News18 Tamil", domain: "tamil.news18.com" });
    w.docs = [sat, tue];
    setVerdict(sat.title, { v: "know", area: "Power", head: "", gist: "Power will be cut on Saturday from 9 AM to 2 PM.", of: deskKey(sat.title) });
    const [s] = await newsStories("daily", NOW);
    expect(s.topic).toBe("power");
    expect(s.id).toBe(sat.doc_id);
    expect(s.original).toBeNull();
    expect(s.taLead).toBe(false);
  });

  it("a head written from another report of the same (non-routine) story is still used; one from a report outside it is not", async () => {
    const a = doc({ story: "S-A", title: "பெரம்பூரில் நவீன பேருந்து நிறுத்தங்கள் அமைக்கும் பணிகள் தீவிரம்", title_en: "Works on bus stops intensify in Perambur" });
    const b = doc({ story: "S-A", title: "பெரம்பூர் பேருந்து நிறுத்தப் பணிகள் விரைவு", title_en: "Perambur bus stop works speed up", t: "2026-11-27 07:00:00", publisher: "Dinakaran", domain: "dinakaran.com" });
    w.docs = [a, b];
    setVerdict(b.title, { v: "know", area: "Roads & transport", head: "Rs 41.66 crore bus stop works intensify in Perambur", of: deskKey(b.title) });
    setVerdict(a.title, { v: "know", area: "Roads & transport", head: "Rs 41.66 crore bus stop works intensify in Perambur", of: deskKey(b.title) });
    expect((await newsStories("daily", NOW))[0].title).toBe("Rs 41.66 crore bus stop works intensify in Perambur");

    clearDesk();
    setVerdict(a.title, { v: "know", area: "Roads & transport", head: "Metro works close a lane in Vadapalani", of: "some other report" });
    setVerdict(b.title, { v: "know", area: "Roads & transport", head: "Metro works close a lane in Vadapalani", of: "some other report" });
    const [s] = await newsStories("daily", NOW);
    expect(s.title).not.toMatch(/Vadapalani/);
    expect(["Works on bus stops intensify in Perambur", "Perambur bus stop works speed up"]).toContain(s.title);
  });
});

describe("newsLeftOut: a Tamil report left out shows its Tamil headline", () => {
  it("original is the cleaned Tamil headline; title the English line", async () => {
    const ta = doc({ title: "Cmvijai | Chennai High Court | CM விஜய் போட்ட Case ..நாளை தீர்ப்பு", title_en: "Chennai High Court: judgment tomorrow in CM Vijay's case" });
    w.docs = [ta];
    setVerdict(ta.title, { v: "skip", skip: "party politics" });
    const r = await newsLeftOut("daily", NOW);
    expect(r.items).toHaveLength(1);
    expect(r.items[0].original).toBe("CM விஜய் போட்ட Case… நாளை தீர்ப்பு");
    expect(r.items[0].title).toBe("Chennai High Court: judgment tomorrow in CM Vijay's case");
  });
});
