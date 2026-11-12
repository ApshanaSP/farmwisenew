// QA pass 4: data invariants, as a permanent test. It loads the pinned snapshot with no app code (tests/qa/pass4/invariants.mjs) and runs:
//   1. every check that passes today (the list is frozen in invariants.guard.json), so none can regress without a red test;
//   2. the checks that fail today as it.fails, with the finding id first, so they stay visible and go red the day the data is fixed;
//   3. "the checks can see a bad row": a bad value is planted in the in-memory copy and the check must count it. A check that can never fire proves nothing.
//
//   npx vitest run --config vitest.qa4.config.ts tests/qa/pass4/invariants.test.ts
//
// No server, no model and no app code. The snapshot is only read: the database is in memory and every planted row is rolled back.
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { buildChecks, openPinned, readGuard, runCheck } from "./invariants.mjs";

type Check = { group: string; name: string; sql: string; on_fail: string; finding?: string; open?: string };
const guard = readGuard() as { build_id: string; passing: string[]; failing: { name: string; finding: string | null; open: string | null }[] };

let s: any;
let byName: Map<string, Check>;

const count = (name: string): number => {
  const c = byName.get(name);
  if (!c) throw new Error(`no check called ${name}`);
  return runCheck(s.db, c).count as number;
};

describe("data invariants on the pinned snapshot", () => {
  beforeAll(() => {
    s = openPinned();
    byName = new Map((buildChecks(s) as Check[]).map((c) => [c.name, c]));
  });
  afterAll(() => s?.db.close());
  // the checks are synchronous: without a real pause between tests the worker cannot answer vitest, and a slow, busy machine gets "Timeout calling onTaskUpdate"
  afterEach(() => new Promise<void>((r) => setImmediate(r)));

  it("runs on the build the guard was frozen on", () => {
    expect(s.info.build_id).toBe(guard.build_id);
  });

  it("nothing was dropped: every check in the guard still exists, and every check is in the guard", () => {
    const known = [...guard.passing, ...guard.failing.map((f) => f.name)].sort();
    expect([...byName.keys()].sort()).toEqual(known);
    expect(guard.passing.length).toBeGreaterThan(500);
  });

  describe("checks that pass today must keep passing", () => {
    for (const name of guard.passing) it(name, () => expect(count(name)).toBe(0));
  });

  describe("open findings (each goes red when the data is fixed: then move it to the passing list)", () => {
    for (const f of guard.failing) it.fails(`${f.finding ?? "unfiled"} ${f.name}${f.open ? ` (${f.open})` : ""}`, () => expect(count(f.name)).toBe(0));
  });

  describe("the checks can see a bad row", () => {
    /** Runs a change inside a transaction, counts, and rolls back, so the rest of the file sees the real snapshot. */
    const withChange = (sql: string, name: string): { before: number; after: number } => {
      const before = count(name);
      s.db.exec("BEGIN");
      try {
        s.db.exec(sql);
        return { before, after: count(name) };
      } finally {
        s.db.exec("ROLLBACK");
      }
    };
    const INC = `(SELECT incident_id FROM incidents WHERE is_open = 0 AND closed_at IS NOT NULL AND sla_breached = 0 AND closed_at <= sla_due_at ORDER BY incident_id LIMIT 1)`;
    const OPEN_INC = `(SELECT incident_id FROM incidents WHERE is_open = 1 ORDER BY incident_id LIMIT 1)`;
    const EV = `(SELECT event_id FROM events ORDER BY event_id LIMIT 1)`;
    const DOC = `(SELECT doc_id FROM documents ORDER BY doc_id LIMIT 1)`;
    const ACT = `(SELECT action_id FROM actions ORDER BY action_id LIMIT 1)`;
    const COMP = `(SELECT id FROM complaints ORDER BY id LIMIT 1)`;
    const planted: [string, string][] = [
      ["incident_closed_before_first_report", `UPDATE incidents SET closed_at = '2001-01-01 00:00:00' WHERE incident_id = ${INC}`],
      ["event_closed_before_reported", `UPDATE events SET closed_at = '2001-01-01 00:00:00' WHERE event_id = ${EV}`],
      ["incident_open_flag_with_closed_status", `UPDATE incidents SET is_open = 1 WHERE incident_id = ${INC}`],
      ["incident_closed_flag_with_open_status", `UPDATE incidents SET is_open = 0 WHERE incident_id = ${OPEN_INC}`],
      ["incident_resolved_or_rejected_without_closed_at", `UPDATE incidents SET closed_at = NULL WHERE incident_id = ${INC}`],
      ["incident_closed_on_time_marked_breached", `UPDATE incidents SET sla_breached = 1 WHERE incident_id = ${INC}`],
      ["incident_ward_vs_zone", `UPDATE incidents SET zone_no = CASE WHEN zone_no = 1 THEN 2 ELSE 1 END WHERE incident_id = (SELECT incident_id FROM incidents WHERE ward_no IS NOT NULL ORDER BY incident_id LIMIT 1)`],
      ["ref_ward_zone_vs_zone_wards", `UPDATE zone_wards SET zone_id = CASE WHEN zone_id = 1 THEN 2 ELSE 1 END WHERE ward_number = 5`],
      ["incident_department_unknown", `UPDATE incidents SET lead_dept = 'NO-SUCH-DEPT' WHERE incident_id = ${INC}`],
      ["incident_category_unknown", `UPDATE incidents SET category_code = 'NO_SUCH_CATEGORY' WHERE incident_id = ${INC}`],
      ["document_department_unknown", `UPDATE documents SET department = 'NO-SUCH-DEPT' WHERE doc_id = ${DOC}`],
      ["document_category_unknown", `UPDATE documents SET category_code = 'NO_SUCH_CATEGORY' WHERE doc_id = ${DOC}`],
      ["action_department_unknown", `UPDATE actions SET dept_code = 'NO-SUCH-DEPT' WHERE action_id = ${ACT}`],
      ["complaint_department_unknown", `UPDATE complaints SET department_id = 99999 WHERE id = ${COMP}`],
      ["duplicate_key:incidents", `INSERT INTO incidents SELECT * FROM incidents WHERE incident_id = ${INC}`],
      ["duplicate_key:documents", `INSERT INTO documents SELECT * FROM documents WHERE doc_id = ${DOC}`],
      ["date_invalid:incidents", `UPDATE incidents SET closed_at = '2026-13-45 99:00:00' WHERE incident_id = ${INC}`],
      ["date_before_2000:events", `UPDATE events SET reported_at = '1999-12-31 23:59:59' WHERE event_id = ${EV}`],
      ["date_future:actions", `UPDATE actions SET assigned_at = '2031-01-01 00:00:00' WHERE action_id = ${ACT}`],
      ["document_fetched_before_published", `UPDATE documents SET published_at = '2031-01-01 00:00:00' WHERE doc_id = ${DOC}`],
      ["incident_member_count", `UPDATE incidents SET member_count = member_count + 1 WHERE incident_id = ${INC}`],
      ["daily_counts_vs_events_after_those_rules", `UPDATE daily_counts SET count = count + 1 WHERE rowid = 1`],
      ["kpis_incidents", `UPDATE kpis SET incidents = incidents + 1 WHERE period = 'daily' AND zone_no IS NULL AND "offset" = 0`],
      ["metrics_vs_raw_counts", `DELETE FROM link_pairs WHERE decision = 'linked' AND rowid = (SELECT MIN(rowid) FROM link_pairs WHERE decision = 'linked')`],
      ["briefing_figures_vs_kpis", `UPDATE kpis SET open_incidents = open_incidents + 1 WHERE period = 'daily' AND zone_no IS NULL AND "offset" = 0`],
      ["orphan_member_without_incident", `DELETE FROM incidents WHERE incident_id = ${INC}`],
      ["orphan_action_without_incident", `UPDATE actions SET incident_id = 'INC-NOPE' WHERE action_id = ${ACT}`],
      ["orphan_timeline_without_incident", `UPDATE incident_timeline SET incident_id = 'INC-NOPE' WHERE rowid = 1`],
      ["orphan_history_without_complaint", `DELETE FROM complaints WHERE id = ${COMP}`],
      ["zone_out_of_range:incidents", `UPDATE incidents SET zone_no = 16 WHERE incident_id = ${INC}`],
      ["zone_out_of_range:events", `UPDATE events SET zone_no = 0 WHERE event_id = ${EV}`],
      ["position_outside_chennai:incidents", `UPDATE incidents SET lat = 28.6, lon = 77.2 WHERE incident_id = ${INC}`],
      ["position_outside_chennai:complaints", `UPDATE complaints SET latitude = 19.07, longitude = 72.87 WHERE id = ${COMP}`],
      ["severity_not_allowed:incidents", `UPDATE incidents SET severity_level = 'Critical' WHERE incident_id = ${INC}`],
      ["empty:incidents.title", `UPDATE incidents SET title = '   ' WHERE incident_id = ${INC}`],
      ["control_chars:incidents.title", `UPDATE incidents SET title = 'road' || char(7) || 'cut' WHERE incident_id = ${INC}`],
      ["personal_data:incidents.title", `UPDATE incidents SET title = 'Call 98765 43210 about the drain' WHERE incident_id = ${INC}`],
      ["personal_data:incidents.summary", `UPDATE incidents SET summary = 'Aadhaar 2345 6789 0123 was given' WHERE incident_id = ${INC}`],
      ["personal_data:complaints.title", `UPDATE complaints SET title = 'write to some.one@example.com' WHERE id = ${COMP}`],
      ["tamil_field_not_tamil:ref_taluks.name_ta", `UPDATE ref_taluks SET name_ta = 'Mylapore' WHERE taluk_code = (SELECT MIN(taluk_code) FROM ref_taluks)`],
      ["aadhaar_shaped_in_any_shown_field", `UPDATE incidents SET summary = 'Aadhaar 2345 6789 0123 was given' WHERE incident_id = ${INC}`],
      ["complaint_department_not_in_ref_departments", `UPDATE complaints SET department_id = 99999 WHERE id = ${COMP}`],
      ["sla_flag_is_the_pipeline_rule", `UPDATE incidents SET sla_breached = 1 - sla_breached WHERE incident_id = ${INC}`]
    ];
    for (const [name, sql] of planted) {
      it(`${name} counts a planted bad row`, () => {
        const { before, after } = withChange(sql, name);
        expect(after).toBeGreaterThan(before);
      });
    }

    it("a +91 helpline is not counted as an Aadhaar number", () => {
      const { before, after } = withChange(`UPDATE incidents SET summary = 'Sneha helpline +919999900000' WHERE incident_id = ${INC}`, "aadhaar_shaped_in_any_shown_field");
      expect(after).toBe(before);
    });
  });
});
