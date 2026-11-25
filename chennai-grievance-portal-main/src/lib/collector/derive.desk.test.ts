import { beforeEach, describe, expect, it, vi } from "vitest";

// the news desk's verdicts laid over a build (derive.applyDesk): what leaves it, and what never does
vi.mock("@/lib/aws/store", () => ({ onBuild: () => undefined }));
vi.mock("@/lib/collector/nlp", () => ({ placeResolver: async () => () => null }));
const { applyDesk } = await import("./derive");
const { clearDesk, deskKey, setVerdict } = await import("./deskbook");
const { DatabaseSync } = await import("node:sqlite");

function build() {
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE incidents (incident_id TEXT PRIMARY KEY, title TEXT, headline TEXT, media_only INTEGER);
    CREATE TABLE documents (doc_id TEXT, linked_incident_id TEXT, title TEXT, title_en TEXT, lang TEXT, source_kind TEXT, publisher TEXT, publisher_domain TEXT, publisher_tier TEXT, published_at TEXT);
    CREATE TABLE incident_members (incident_id TEXT, event_id TEXT);`);
  const add = (inc: string, title: string, en: string | null = null, media = 1) => {
    db.prepare(`INSERT OR IGNORE INTO incidents VALUES (?, ?, ?, ?)`).run(inc, title, title, media);
    db.prepare(`INSERT INTO documents VALUES (?, ?, ?, ?, ?, 'news', 'Dinamani', 'dinamani.com', 'established', '2026-11-24 10:00:00')`).run(`d-${inc}`, inc, title, en, en ? "ta" : "en");
  };
  return { db, add, ids: () => (db.prepare(`SELECT incident_id AS id FROM incidents ORDER BY id`).all() as { id: string }[]).map((r) => r.id) };
}
const off = (skip: string) => ({ v: "skip" as const, skip: skip as never, real: false });
beforeEach(() => clearDesk());

describe("news-only incidents the desk read", () => {
  it("a drawn match and an article on a video game leave; a petty theft, a fraud, a star's police case and a department's record stay", () => {
    const { db, add, ids } = build();
    add("MATCH", "Punjab FC - Chennaiyin FC draw"); setVerdict("Punjab FC - Chennaiyin FC draw", off("sport"));
    add("GAME", "Back to Vice City: Why GTA 6 is a big deal"); setVerdict("Back to Vice City: Why GTA 6 is a big deal", off("entertainment"));
    add("THEFT", "Rapido delivery agent steals phones, leaves sweets"); setVerdict("Rapido delivery agent steals phones, leaves sweets", off("petty crime"));
    add("STAR", "TV show winner booked on marriage fraud"); setVerdict("TV show winner booked on marriage fraud", off("entertainment"));
    add("RECORD", "Walkathon held on Marina", null, 0); setVerdict("Walkathon held on Marina", off("feature"));
    add("UNREAD", "Cricket fans queue at Chepauk");
    expect(applyDesk(db).dropped).toBe(2);
    expect(ids()).toEqual(["RECORD", "STAR", "THEFT", "UNREAD"]);
  });
  it("one article the desk kept, or has not read, keeps the incident", () => {
    const { db, add, ids } = build();
    add("A", "Film set collapses, crew safe"); setVerdict("Film set collapses, crew safe", off("entertainment"));
    db.prepare(`INSERT INTO documents VALUES ('d2', 'A', 'Set collapse at Poonamallee: inquiry begins', NULL, 'en', 'news', 'The Hindu', 'thehindu.com', 'established', '2026-11-24 11:00:00')`).run();
    applyDesk(db);
    expect(ids()).toEqual(["A"]);
  });
});

describe("a Tamil report's translation", () => {
  it("is the desk's own headline for that report, and the incident's headline follows", () => {
    const { db, add } = build();
    const ta = "அல்வா பாக்ஸ் பார்சல்! திருவிக நகரில் நூதன முறையில் செல்போன்கள் திருட்டு!";
    add("A", ta, "Alva Box parcel! Modern phone theft in Thiruviga town");
    setVerdict(ta, { v: "skip", skip: "petty crime", real: true, head: "Delivery worker arrested for swapping phones with halwa boxes in Thiru Vi Ka Nagar", of: deskKey(ta) });
    expect(applyDesk(db)).toEqual({ titles: 1, dropped: 0 });
    expect((db.prepare(`SELECT title_en AS t FROM documents`).get() as { t: string }).t).toMatch(/^Delivery worker arrested/);
    expect((db.prepare(`SELECT headline AS t FROM incidents`).get() as { t: string }).t).toMatch(/^Delivery worker arrested/);
    // laid over again (the next sweep): nothing left to do
    expect(applyDesk(db).titles).toBe(0);
  });
});
