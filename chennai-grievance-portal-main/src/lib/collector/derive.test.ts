import { describe, expect, it, vi } from "vitest";

// derive.ts registers its steps with the store on import; the store is not needed to test the text rules
vi.mock("@/lib/aws/store", () => ({ onBuild: () => undefined }));
vi.mock("@/lib/collector/nlp", () => ({ placeResolver: async () => () => null }));
const { headlineOf } = await import("./derive");

describe("headlineOf", () => {
  it("skips who is writing and keeps the problem", () => {
    expect(headlineOf("I live at door no. 76, Srinivasapuram 1st Street. Vehicles are left on the footpath in our street every day; pedestrians have to walk on the road. Kindly send someone."))
      .toBe("Vehicles are left on the footpath in our street every day; pedestrians have to walk on the road");
    expect(headlineOf("I run a small shop on Indira Nagar 5th St. Deep pothole near Mariamman Kovil is filled with rain water and not visible to motorists. Please do the needful."))
      .toBe("Deep pothole near Mariamman Kovil is filled with rain water and not visible to motorists");
  });
  it("keeps a police report's sentence and fixes road-name capitals", () => {
    expect(headlineOf("A cab hit a two-wheeler on Vaidhyanathan 2Nd Cross Street, Korukkupet. 2 injured and taken to hospital."))
      .toBe("A cab hit a two-wheeler on Vaidhyanathan 2nd Cross Street, Korukkupet");
  });
  it("shortens a long text at a word", () => {
    const h = headlineOf("Garbage " + "is piled up near the bus stop and nobody has cleared it ".repeat(6));
    expect(h.length).toBeLessThanOrEqual(141);
    expect(h.endsWith("…")).toBe(true);
  });
});

describe("newsSanity on a build (the 13 Oct 2026 briefing: '101 deaths in 24 hours')", async () => {
  const { DatabaseSync } = await import("node:sqlite");
  const { newsSanity } = await import("./derive");
  const fresh = () => {
    const db = new DatabaseSync(":memory:");
    db.exec(`CREATE TABLE incidents (incident_id TEXT PRIMARY KEY, category_code TEXT, category_label TEXT, family TEXT, lead_dept TEXT,
      first_reported_at TEXT, last_update_at TEXT, zone_no INTEGER, title TEXT, media_only INTEGER, dead REAL, injured REAL,
      member_count INTEGER, outlet_count INTEGER, needs_review INTEGER, review_reason TEXT);
    CREATE TABLE documents (doc_id TEXT, linked_incident_id TEXT, story_id TEXT, title TEXT, title_en TEXT, published_at TEXT, publisher TEXT, is_incident INTEGER);
    CREATE TABLE incident_members (incident_id TEXT, event_id TEXT);
    CREATE TABLE alerts (alert_id TEXT PRIMARY KEY, incident_ids TEXT) WITHOUT ROWID;
    CREATE TABLE gaps (incident_id TEXT, note TEXT);
    INSERT INTO gaps VALUES ('INC-053966', 'news only'), ('INC-842A66', 'news only'), ('INC-CF4F34', 'news only');
    INSERT INTO alerts VALUES ('A1', 'INC-842A66|INC-OTHER');
    CREATE TABLE ref_categories (category_code TEXT, label TEXT, family TEXT, lead_dept TEXT);
    INSERT INTO ref_categories VALUES ('DRAIN_WORKS_SAFETY', 'Drain works site safety', 'DRAINAGE', 'GCC-SWD');`);
    const inc = db.prepare(`INSERT INTO incidents VALUES (?, ?, ?, 'X', 'X', ?, ?, ?, ?, ?, ?, NULL, 1, 1, 0, NULL)`);
    const doc = db.prepare(`INSERT INTO documents VALUES (?, ?, ?, ?, ?, ?, ?, 1)`);
    const gasTa = "கொடுங்கையூரில் விஷவாயு தாக்கி தொழிலாளர்கள் இருவர் உயிரிழப்பு";
    inc.run("INC-053966", "VECTOR_DISEASE", "Vector-borne disease", "2026-10-12 20:06:12", "2026-10-12 20:06:12", 4, gasTa, 1, 2);
    inc.run("INC-842A66", "VECTOR_DISEASE", "Vector-borne disease", "2026-10-12 20:06:12", "2026-10-12 20:06:12", 4, gasTa, 1, 2);
    inc.run("INC-CF4F34", "DRAINAGE_SEWAGE", "Drainage & sewage", "2026-10-12 17:47:42", "2026-10-12 17:47:42", 4, "Two workers die in a stormwater well", 1, 2);
    inc.run("INC-6FBD0E", "ROAD_ACCIDENT", "Road accident", "2026-10-13 07:15:00", "2026-10-13 07:15:00", null, "Air crash", 1, 95);
    inc.run("INC-DEPT", "ROAD_ACCIDENT", "Road accident", "2026-10-13 09:00:00", "2026-10-13 09:00:00", 9, "Lorry hit a bike", 0, 1);
    inc.run("INC-ONE", "FIRE_EXPLOSION", "Fire", "2026-10-13 10:00:00", "2026-10-13 10:00:00", 6, "Factory fire", 1, 12);
    doc.run("d1", "INC-053966", "STY-62832147b1", gasTa, "Two workers die in a chemical gas attack in Kodungaiyur", "2026-10-12 20:06:12", "ETV Bharat");
    doc.run("d2", "INC-842A66", "STY-62832147b1", gasTa, "Two workers die in a chemical gas attack in Kodungaiyur", "2026-10-12 20:06:12", "ETV Bharat");
    doc.run("d3", "INC-CF4F34", "STY-62832147b1", "Two workers die while working inside Chennai corporation's stormwater well", null, "2026-10-12 17:47:42", "The Times of India");
    doc.run("d4", "INC-6FBD0E", "STY-e41c604e23", "13.10.1976: பம்பாயில் விமான விபத்தில் 95 பேர் பலி", null, "2026-10-13 07:15:00", "Dinamani");
    doc.run("d5", "INC-ONE", "STY-fire", "12 killed in factory fire", null, "2026-10-13 10:00:00", "Dinakaran");
    db.prepare(`INSERT INTO incident_members VALUES ('INC-053966', 'e1'), ('INC-842A66', 'e2'), ('INC-CF4F34', 'e3')`).run();
    db.exec(`ALTER TABLE incidents ADD COLUMN place_text TEXT; UPDATE incidents SET place_text = CASE zone_no WHEN 4 THEN 'Kodungaiyur' WHEN 9 THEN 'Anna Salai' ELSE 'Chennai' END`);
    return db;
  };
  const deaths = (db: InstanceType<typeof DatabaseSync>) => Number((db.prepare(`SELECT SUM(COALESCE(dead, 0)) AS n FROM incidents`).get() as { n: number }).n);

  it("counts 1 death in a department record and 2 in the Kodungaiyur story, not 101 + 12", () => {
    const db = fresh();
    expect(deaths(db)).toBe(114);
    newsSanity(db);
    expect(deaths(db)).toBe(3);
  });
  it("leaves the 1976 history item out and unlinks its article", () => {
    const db = fresh();
    newsSanity(db);
    expect(db.prepare(`SELECT 1 FROM incidents WHERE incident_id = 'INC-6FBD0E'`).get()).toBeUndefined();
    expect(db.prepare(`SELECT linked_incident_id AS l, is_incident AS i FROM documents WHERE doc_id = 'd4'`).get()).toEqual({ l: null, i: 0 });
  });
  it("makes the Kodungaiyur story one incident with all three articles and members, two outlets", () => {
    const db = fresh();
    newsSanity(db);
    const left = db.prepare(`SELECT incident_id AS id, dead, outlet_count AS o, member_count AS m, first_reported_at AS t FROM incidents WHERE zone_no = 4`).all();
    expect(left).toEqual([{ id: "INC-CF4F34", dead: 2, o: 2, m: 3, t: "2026-10-12 17:47:42" }]);
    expect((db.prepare(`SELECT COUNT(*) AS n FROM documents WHERE linked_incident_id = 'INC-CF4F34'`).get() as { n: number }).n).toBe(3);
    expect((db.prepare(`SELECT COUNT(*) AS n FROM incident_members WHERE incident_id = 'INC-CF4F34'`).get() as { n: number }).n).toBe(3);
    expect(db.prepare(`SELECT incident_ids AS ids FROM alerts`).get()).toEqual({ ids: "INC-CF4F34|INC-OTHER" });
    expect(db.prepare(`SELECT incident_id AS id FROM gaps`).all()).toEqual([{ id: "INC-CF4F34" }]);
  });
  it("joins a later article on the same deaths filed under another story (the 12:20 build split the event over four stories)", () => {
    const db = fresh();
    db.prepare(`INSERT INTO incidents VALUES ('INC-66F8E3', 'PUBLIC_WORKS', 'Public works', 'X', 'X', '2026-10-13 11:28:06', '2026-10-13 11:28:06', 4,
      'Two workers die while repairing Chennai Corporation motor in Kodungaiyur', 1, 2, NULL, 1, 1, 0, NULL, 'Kodungaiyur')`).run();
    db.prepare(`INSERT INTO documents VALUES ('d6', 'INC-66F8E3', 'STY-f863764d1a', 'Two workers die while repairing Chennai Corporation motor in Kodungaiyur', NULL,
      '2026-10-13 11:28:06', 'The News Minute', 1)`).run();
    newsSanity(db);
    expect(deaths(db)).toBe(3);
    expect(db.prepare(`SELECT incident_id AS id, outlet_count AS o FROM incidents WHERE zone_no = 4`).all()).toEqual([{ id: "INC-CF4F34", o: 3 }]);
  });
  it("holds a death toll of 10 or more from one outlet for confirmation", () => {
    const db = fresh();
    newsSanity(db);
    expect(db.prepare(`SELECT dead, dead_reported AS r, needs_review AS n FROM incidents WHERE incident_id = 'INC-ONE'`).get()).toEqual({ dead: null, r: 12, n: 1 });
  });
  it("moves gas deaths read as disease to drain works safety, and is a no-op the second time", () => {
    const db = fresh();
    // its own story and place: not merged
    db.prepare(`UPDATE documents SET story_id = 'STY-solo' WHERE doc_id = 'd1'`).run();
    db.prepare(`UPDATE incidents SET place_text = 'Tondiarpet' WHERE incident_id = 'INC-053966'`).run();
    newsSanity(db);
    expect(db.prepare(`SELECT category_code AS c FROM incidents WHERE incident_id = 'INC-053966'`).get()).toEqual({ c: "DRAIN_WORKS_SAFETY" });
    const before = JSON.stringify(db.prepare(`SELECT * FROM incidents ORDER BY incident_id`).all());
    newsSanity(db);
    expect(JSON.stringify(db.prepare(`SELECT * FROM incidents ORDER BY incident_id`).all())).toBe(before);
  });
});
