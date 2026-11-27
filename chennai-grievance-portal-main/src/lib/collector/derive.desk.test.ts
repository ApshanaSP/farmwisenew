import { beforeEach, describe, expect, it, vi } from "vitest";

// the news desk's verdicts laid over a build (derive.applyDesk): what leaves it, and what never does
vi.mock("@/lib/aws/store", () => ({ onBuild: () => undefined }));
vi.mock("@/lib/collector/nlp", () => ({ placeResolver: async () => () => null }));
const { applyDesk, articleKind, reportKinds } = await import("./derive");
const { clearDesk, deskKey, setVerdict } = await import("./deskbook");
const { reportKind } = await import("./reporttype");
const { DatabaseSync } = await import("node:sqlite");

type Opt = { en?: string | null; media?: number; type?: string; inc?: number };
function build() {
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE incidents (incident_id TEXT PRIMARY KEY, title TEXT, headline TEXT, media_only INTEGER);
    CREATE TABLE documents (doc_id TEXT, linked_incident_id TEXT, title TEXT, title_en TEXT, lang TEXT, source_kind TEXT, publisher TEXT, publisher_domain TEXT, publisher_tier TEXT, published_at TEXT,
      report_type TEXT, is_incident INTEGER);
    CREATE TABLE incident_members (incident_id TEXT, event_id TEXT);`);
  const add = (inc: string, title: string, o: Opt = {}) => {
    db.prepare(`INSERT OR IGNORE INTO incidents VALUES (?, ?, ?, ?)`).run(inc, title, title, o.media ?? 1);
    const n = (db.prepare(`SELECT COUNT(*) AS n FROM documents`).get() as { n: number }).n;
    db.prepare(`INSERT INTO documents VALUES (?, ?, ?, ?, ?, 'news', 'Dinamani', 'dinamani.com', 'established', '2026-11-24 10:00:00', ?, ?)`)
      .run(`d${n}-${inc}`, inc, title, o.en ?? null, o.en ? "ta" : "en", o.type ?? "incident", o.inc ?? 1);
  };
  const ids = () => (db.prepare(`SELECT incident_id AS id FROM incidents ORDER BY id`).all() as { id: string }[]).map((r) => r.id);
  const doc = (inc: string) => db.prepare(`SELECT report_type AS type, is_incident AS inc FROM documents WHERE doc_id LIKE ?`).get(`%-${inc}`);
  const review = (inc: string) => db.prepare(`SELECT needs_review AS n, review_reason AS why FROM incidents WHERE incident_id = ?`).get(inc) as { n: number; why: string } | undefined;
  return { db, add, ids, doc, review };
}
const off = (skip: string) => ({ v: "skip" as const, skip: skip as never, real: false });
beforeEach(() => clearDesk());

describe("27 Nov 2026: the desk's kind decides which news-only incidents are incidents", () => {
  it("a forecast, government work and a match leave; a petty theft and a kidnapping the police ended stay", () => {
    const { db, add, ids } = build();
    add("ALERT", "Heavy rain likely in Chennai for the next three hours"); setVerdict("Heavy rain likely in Chennai for the next three hours", { v: "act", kind: "alert" });
    add("WORKS", "Chief Minister Vijay inaugurated the drinking water project in Chennai"); setVerdict("Chief Minister Vijay inaugurated the drinking water project in Chennai", { v: "know", kind: "government_action" });
    add("MATCH", "Punjab FC - Chennaiyin FC draw"); setVerdict("Punjab FC - Chennaiyin FC draw", { ...off("sport"), kind: "other" });
    add("THEFT", "Rapido delivery agent steals phones, leaves sweets"); setVerdict("Rapido delivery agent steals phones, leaves sweets", { ...off("petty crime"), real: true, kind: "incident" });
    const kidnap = "Chennai: 5-year-old girl kidnapped after going to school - Police rescued her immediately";
    // the rules read the rescue as the end of the event (16 Nov: the incident was taken out); the desk reads what happened
    expect(reportKind(kidnap)).toBe("resolution");
    add("KIDNAP", kidnap); setVerdict(kidnap, { v: "act", area: "Law & order", kind: "incident" });
    add("RECORD", "Walkathon held on Marina", { media: 0 }); setVerdict("Walkathon held on Marina", { ...off("feature"), kind: "other" });
    const r = applyDesk(db);
    expect(r.dropped).toBe(3);
    expect(ids()).toEqual(["KIDNAP", "RECORD", "THEFT"]);
  });

  it("a story the desk has not read is decided by the rules as before", () => {
    const { db, add, ids } = build();
    add("INSPECT", "Chennai Corporation starts inspection of dilapidated buildings to prevent collapse this Northeast Monsoon");
    add("QUEUE", "Cricket fans queue at Chepauk");
    add("SILVER", "Silver worth Rs 1 crore looted from a house in Sowcarpet");
    add("SILVER2", "Silver worth Rs 1 crore looted from a shop in Sowcarpet"); setVerdict("Silver worth Rs 1 crore looted from a shop in Sowcarpet", { v: "know", kind: "incident" });
    expect(applyDesk(db).dropped).toBe(2);
    // not read: the word rules' government work ("crore") still takes it out; read: the desk keeps it
    expect(ids()).toEqual(["QUEUE", "SILVER2"]);
  });

  it("the desk says not an incident, the headline names a police case: kept and flagged for review, once", () => {
    const { db, add, ids, review } = build();
    add("STAR", "TV show winner booked on marriage fraud"); setVerdict("TV show winner booked on marriage fraud", { ...off("entertainment"), kind: "other" });
    const r = applyDesk(db);
    expect(r).toMatchObject({ dropped: 0, review: 1 });
    expect(ids()).toEqual(["STAR"]);
    expect(review("STAR")?.n).toBe(1);
    expect(review("STAR")?.why).toBe("The news desk reads this report as a promotion, event or other news, but its headline names a police case or harm: check whether it is an incident");
    // laid over again after the next sweep: the reason is not written twice
    expect(applyDesk(db).review).toBe(0);
    expect(review("STAR")?.why.match(/news desk/g)?.length).toBe(1);
    expect(articleKind({ v: "skip", skip: "entertainment", real: false, kind: "other", area: "", head: "", gist: "", why: "", cat: "", at: 0, by: "m" }, null, "TV show winner booked on marriage fraud", null))
      .toEqual({ kind: null, by: "desk", held: "other" });
  });

  it("reads an article the same way after its translation was replaced by the desk's headline (the next sweep takes nothing more out)", () => {
    const { db, add, ids, review } = build();
    const ta = "மெரினா லூப் சாலை ஆக்கிரமிப்பு விவகாரம்: சென்னை மாநகராட்சி ஆணையர் நேரில் ஆஜராக உயர் நீதிமன்றம் உத்தரவு!";
    add("LOOP", ta, { en: "Marina Loop Road occupation case: Chennai municipal commissioner ordered to appear in court", type: "civic_complaint" });
    setVerdict(ta, { v: "act", area: "Courts", kind: "government_action", head: "High Court orders Corporation commissioner to appear over Marina Loop Road encroachments", of: deskKey(ta) });
    expect(applyDesk(db)).toMatchObject({ titles: 1, dropped: 0, review: 1 });
    expect(applyDesk(db)).toEqual({ titles: 0, dropped: 0, review: 0, relabelled: 0 });
    expect(ids()).toEqual(["LOOP"]);
    expect(review("LOOP")?.n).toBe(1);
  });

  it("one article the desk reads as an incident keeps the incident", () => {
    const { db, add, ids } = build();
    add("A", "Film set collapses, crew safe"); setVerdict("Film set collapses, crew safe", { ...off("entertainment"), kind: "other" });
    add("A", "Set collapse at Poonamallee: inquiry begins"); setVerdict("Set collapse at Poonamallee: inquiry begins", { v: "know", kind: "incident" });
    expect(applyDesk(db).dropped).toBe(0);
    expect(ids()).toEqual(["A"]);
  });
});

describe("the articles' labels follow the desk's kind", () => {
  it("a forecast is an alert whatever the pipeline said; sport keeps the pipeline's finer label; nothing changes the second time", () => {
    const { db, add, doc } = build();
    add("ALERT", "Chennai to get heavy rain tonight", { type: "incident", inc: 1 }); setVerdict("Chennai to get heavy rain tonight", { v: "act", kind: "alert" });
    add("MATCH", "Chennaiyin FC beat Goa 2-1", { type: "entertainment_sport", inc: 0, media: 0 }); setVerdict("Chennaiyin FC beat Goa 2-1", { ...off("sport"), kind: "other" });
    const r = applyDesk(db);
    expect(doc("ALERT")).toEqual({ type: "alert", inc: 0 });
    expect(doc("MATCH")).toEqual({ type: "entertainment_sport", inc: 0 });
    expect(r.relabelled).toBe(1);
    expect(applyDesk(db).relabelled).toBe(0);
  });

  it("a verdict that comes after the build puts back what the word rules took from an incident's article", () => {
    const { db, add, doc } = build();
    // a department's record, so it stays in the build whatever its article says
    add("REC", "Rs 8.84 crore salary money embezzled: gang hunt launched", { type: "crime", inc: 1, media: 0 });
    reportKinds(db);
    expect(doc("REC")).toEqual({ type: "government_action", inc: 0 });
    setVerdict("Rs 8.84 crore salary money embezzled: gang hunt launched", { v: "act", kind: "incident" });
    expect(applyDesk(db).relabelled).toBe(1);
    expect(doc("REC")).toEqual({ type: "crime", inc: 1 });
  });
});

describe("report kinds at build time take nothing out", () => {
  it("labels a forecast's article and leaves its incident to the news desk step", () => {
    const { db, add, ids, doc } = build();
    add("FC", "'Yellow' alert for Chennai today");
    reportKinds(db);
    expect(ids()).toEqual(["FC"]);
    expect(doc("FC")).toEqual({ type: "alert", inc: 0 });
    applyDesk(db);
    expect(ids()).toEqual([]);
  });
});

describe("a verdict from before the desk gave a kind", () => {
  it("a drawn match and an article on a video game leave; a petty theft, a fraud, a star's police case and a department's record stay", () => {
    const { db, add, ids } = build();
    add("MATCH", "Punjab FC - Chennaiyin FC draw"); setVerdict("Punjab FC - Chennaiyin FC draw", off("sport"));
    add("GAME", "Back to Vice City: Why GTA 6 is a big deal"); setVerdict("Back to Vice City: Why GTA 6 is a big deal", off("entertainment"));
    add("THEFT", "Rapido delivery agent steals phones, leaves sweets"); setVerdict("Rapido delivery agent steals phones, leaves sweets", off("petty crime"));
    add("STAR", "TV show winner booked on marriage fraud"); setVerdict("TV show winner booked on marriage fraud", off("entertainment"));
    add("RECORD", "Walkathon held on Marina", { media: 0 }); setVerdict("Walkathon held on Marina", off("feature"));
    add("UNREAD", "Cricket fans queue at Chepauk");
    // (the star's fraud is an incident by the rules too, so no verdict of the desk's was ever in doubt here)
    expect(applyDesk(db)).toMatchObject({ dropped: 2, review: 0 });
    expect(ids()).toEqual(["RECORD", "STAR", "THEFT", "UNREAD"]);
  });
});

describe("a Tamil report's translation", () => {
  it("is the desk's own headline for that report, and the incident's headline follows", () => {
    const { db, add } = build();
    const ta = "அல்வா பாக்ஸ் பார்சல்! திருவிக நகரில் நூதன முறையில் செல்போன்கள் திருட்டு!";
    add("A", ta, { en: "Alva Box parcel! Modern phone theft in Thiruviga town" });
    setVerdict(ta, { v: "skip", skip: "petty crime", real: true, kind: "incident", head: "Delivery worker arrested for swapping phones with halwa boxes in Thiru Vi Ka Nagar", of: deskKey(ta) });
    expect(applyDesk(db)).toEqual({ titles: 1, dropped: 0, review: 0, relabelled: 0 });
    expect((db.prepare(`SELECT title_en AS t FROM documents`).get() as { t: string }).t).toMatch(/^Delivery worker arrested/);
    expect((db.prepare(`SELECT headline AS t FROM incidents`).get() as { t: string }).t).toMatch(/^Delivery worker arrested/);
    // laid over again (the next sweep): nothing left to do
    expect(applyDesk(db).titles).toBe(0);
  });
});
