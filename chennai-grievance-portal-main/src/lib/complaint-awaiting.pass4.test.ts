/**
 * RC-47 (PB-315): a complaint a citizen has just filed is not in the department officer's queue until the pipeline's next refresh.
 * The officer must be told that complaints are on the way (a count), and the citizen must be told when it will show.
 */
import { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { expand, registerFunctions, setDatabaseNames, translate } from "@/lib/aws/dialect";

const h = vi.hoisted(() => ({ db: null as unknown as DatabaseSync }));
const pool = {
  query: async (sql: string, params: unknown[] = []) => {
    const [s, p] = expand(translate(sql), params);
    return [h.db.prepare(s).all(...(p as never[]))];
  }
};
vi.mock("@/lib/db", () => ({ default: pool }));
vi.mock("@/lib/collector/db", () => ({ default: pool, ops: (t: string) => t }));
const { awaitingQueue } = await import("./complaint-progress");
const { QUEUE_DELAY_NOTE, queueNoteFor } = await import("./officer/queue-note");

const NOW = new Date("2026-11-06T06:30:00Z");
beforeEach(() => {
  setDatabaseNames(["district_collector_dashboard", "district_intel", "district_intel_ops"]);
  h.db = new DatabaseSync(":memory:");
  registerFunctions(h.db);
  h.db.exec(`
    CREATE TABLE departments (id INTEGER PRIMARY KEY, name TEXT);
    CREATE TABLE complaints (id INTEGER PRIMARY KEY, complaint_code TEXT, department_id INTEGER, status TEXT, created_at TEXT);
    CREATE TABLE events (event_id TEXT PRIMARY KEY, source TEXT, source_record_id TEXT, incident_id TEXT);
    INSERT INTO departments VALUES (1, 'Solid Waste Management Department'), (2, 'Electrical Department');
    INSERT INTO complaints VALUES (1, 'A-NEW', 1, 'Complaint Filed', '2026-11-06 11:00:00'),
      (2, 'A-LOADED', 1, 'Pending Approval', '2026-11-05 09:00:00'),
      (3, 'A-OLD', 1, 'Pending Approval', '2026-10-01 09:00:00'),
      (4, 'A-DONE', 1, 'Verified by Collector', '2026-11-05 09:00:00'),
      (5, 'B-NEW', 2, 'Complaint Filed', '2026-11-06 11:00:00');
    INSERT INTO events VALUES ('GRV-A-LOADED', 'grievance', 'A-LOADED', 'INC-1');`);
});

describe("RC-47 the officer is told how many complaints are waiting for the next update", () => {
  it("PB-315: counts this department's new complaints that have no incident yet, and nothing else", async () => {
    expect(await awaitingQueue("Solid Waste Management Department", 7, NOW)).toBe(1);
    expect(await awaitingQueue("Electrical Department", 7, NOW)).toBe(1);
  });
  it("a complaint drops out of the count as soon as the pipeline has filed it", async () => {
    h.db.exec(`INSERT INTO events VALUES ('GRV-A-NEW', 'grievance', 'A-NEW', 'INC-9')`);
    expect(await awaitingQueue("Solid Waste Management Department", 7, NOW)).toBe(0);
  });
  it("a department with no portal name, or none waiting, counts zero", async () => {
    expect(await awaitingQueue(undefined, 7, NOW)).toBe(0);
    expect(await awaitingQueue("Nobody Department", 7, NOW)).toBe(0);
  });
});

describe("RC-47 both sides are told, in English and Tamil", () => {
  it("the citizen's note says when the officer will see it, in both languages", () => {
    expect(QUEUE_DELAY_NOTE.en).toMatch(/next update/i);
    expect(QUEUE_DELAY_NOTE.ta).toMatch(/[஀-௿]/);
    expect(QUEUE_DELAY_NOTE.ta).not.toMatch(/[A-Za-z]{4,}/);
  });
  it("the officer's note carries the count, says nothing at zero, and is singular for one", () => {
    expect(queueNoteFor(0)).toBeNull();
    expect(queueNoteFor(1)!.en).toMatch(/^1 new complaint is /);
    expect(queueNoteFor(3)!.en).toMatch(/^3 new complaints are /);
    expect(queueNoteFor(3)!.ta).toMatch(/3/);
    expect(queueNoteFor(3)!.ta).toMatch(/[஀-௿]/);
  });
});

describe("RC-47 class guard: the two ends of the hand-over keep carrying the note", () => {
  const read = (f: string) => require("node:fs").readFileSync(require("node:path").join(__dirname, f), "utf8") as string;
  it("filing a complaint returns the note, and the officer list returns the count and the note", () => {
    expect(read("../app/api/complaints/route.ts")).toMatch(/queueNote:/);
    expect(read("./officer/data.ts")).toMatch(/awaiting: waiting, awaitingNote:/);
  });
  it("RC-47 (review point 1) a screen shows each note: the citizen's step 5 page and the officer's New tab (a source guard; the real-run check is in docs/qa/pass4/lanes/e.md)", () => {
    expect(read("../app/citizen/file-complaint/page.tsx")).toMatch(/result\.queueNote[\s\S]{0,200}result\.queueNote\.en/);
    expect(read("../components/officer/Cards.tsx")).toMatch(/c\.tab === "new" && L\?\.awaitingNote[\s\S]{0,200}L\.awaitingNote\.en/);
  });
});
