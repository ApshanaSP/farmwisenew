/**
 * The paper petitions behind a case, for the officer's drawer and the Collector's case page (the integration review, 27 Nov). They were
 * found only by the petition's own link (petitions.incident_id), which is the website's INC-W id until the next build hands it over, so a
 * petition the pipeline had imported into a case of its own never showed its scans there. They are now found by the complaint numbers the
 * build holds in the case too.
 */
import { DatabaseSync } from "node:sqlite";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { expand, registerFunctions, setDatabaseNames, translate } from "@/lib/aws/dialect";

const h = vi.hoisted(() => ({ db: null as unknown as DatabaseSync, staff: true }));
const run = (sql: string, params: unknown[] = []) => {
  const [s, p] = expand(translate(sql), params);
  return [h.db.prepare(s).all(...(p as never[]))];
};
const pool = { query: async (sql: string, params: unknown[] = []) => run(sql, params) };
vi.mock("@/lib/db", () => ({ default: pool }));
vi.mock("@/lib/collector/db", () => ({ default: pool, ops: (t: string) => t }));
vi.mock("@/lib/auth", () => ({ getActivePortalSession: async (portal: string) => (portal === "collector" ? { role: "collector", userId: 1 } : null) }));
vi.mock("@/lib/manu/guard", () => ({ seesEveryPetition: async () => h.staff }));
vi.mock("@/lib/officer/guard", () => ({ officerDeptCode: async () => "CMWSSB" }));

const { GET } = await import("./route");

beforeEach(() => {
  setDatabaseNames(["district_collector_dashboard", "district_intel", "district_intel_ops"]);
  h.db = new DatabaseSync(":memory:");
  registerFunctions(h.db);
  h.db.exec(`
    CREATE TABLE petitions (id INTEGER PRIMARY KEY, status TEXT, complaint_code TEXT, subject TEXT, pages TEXT, dept_code TEXT, incident_id TEXT, filed_at TEXT);
    CREATE TABLE incident_members (incident_id TEXT, event_id TEXT, source TEXT, source_record_id TEXT);
    CREATE TABLE complaints (complaint_code TEXT, title TEXT, media_path TEXT, department_id INT, created_at TEXT);
    INSERT INTO petitions VALUES (1, 'filed', '2026-559YXF', 'Sewage', '["p1.jpg"]', 'CMWSSB', 'INC-W-2026-559YXF', '2026-11-09 10:00:00'),
                                 (2, 'filed', '2026-000OTH', 'Other', '["p2.jpg"]', 'CMWSSB', 'INC-W-2026-000OTH', '2026-11-09 10:00:00'),
                                 (3, 'needs_check', '2026-559YXF', 'Draft', '["p3.jpg"]', 'CMWSSB', NULL, NULL);
    INSERT INTO incident_members VALUES ('INC-20261109-A6AD90', 'GRV-2026-559YXF', 'grievance', '2026-559YXF');`);
});

const get = (id: string) => GET(new NextRequest(`http://localhost/api/manu/case/${id}`), { params: Promise.resolve({ incident: id }) });

describe("a case's paper petitions are found by the complaint numbers in it", () => {
  it("the pipeline's case of a petition shows its scans, though the petition still names its INC-W case", async () => {
    const j = await (await get("INC-20261109-A6AD90")).json();
    expect(j.items).toEqual([{ code: "2026-559YXF", subject: "Sewage", filedAt: "2026-11-09 10:00:00", pages: ["/api/manu/photos/p1.jpg"] }]);
  });

  it("the website's own case still finds them by its id", async () => {
    const j = await (await get("INC-W-2026-000OTH")).json();
    expect(j.items.map((i: { code: string }) => i.code)).toEqual(["2026-000OTH"]);
  });
});
