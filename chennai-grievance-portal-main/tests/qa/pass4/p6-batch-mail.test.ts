// QA pass 6, P6-015 (found by the officer-day hunter): the Collector's "Send to department" email about several cases (Ask the Map's batch
// send) is stored once, keyed to the first case, so the officer's drawer showed the instruction on that case only; with mail off or in sandbox
// the console is the only place the officer reads it. Real sendBatchAction and grievanceDetail on the pinned snapshot (dry-run store, no mail).
//   QA_PIN_PORT=3197 npx vitest run --config vitest.qa4.config.ts tests/qa/pass4/p6-batch-mail.test.ts
import { beforeAll, describe, expect, it } from "vitest";
import pool from "@/lib/collector/db";
import { sendBatchAction } from "@/lib/collector/actionmail";
import { actionEmails } from "@/lib/collector/intel";
import { deptProfile, grievanceDetail } from "@/lib/officer/data";

let ids: string[] = [];
beforeAll(async () => {
  const [rows] = await pool.query(`SELECT incident_id FROM incidents WHERE lead_dept = 'GCC-SWM' AND is_open = 1 ORDER BY priority_score DESC LIMIT 3`) as unknown as [{ incident_id: string }[]];
  ids = rows.map((r) => r.incident_id);
}, 300_000);

describe("QA pass 6, P6-015: a batch instruction reaches every case it lists", () => {
  it("each of three cases shows the Collector's instruction in the officer's drawer", async () => {
    expect(ids).toHaveLength(3);
    const subject = `QA6 batch ${Date.now()}`;
    const r = await sendBatchAction({ dept: "GCC-SWM", ids, subject, body: "Please clear these three garbage points today and send a completion report with photos.", plan: null }, "qa.collector@example.test");
    expect(r.status, JSON.stringify(r.body)).toBeLessThan(300);
    const dept = (await deptProfile("GCC-SWM"))!;
    for (const id of ids) {
      const d = await grievanceDetail(dept, id) as unknown as { instructions?: { subject: string }[] } | null;
      expect(d?.instructions?.map((x) => x.subject) ?? [], id).toContain(subject);
      // and the Collector sees it on each case too
      expect((await actionEmails([id])).map((x) => x.subject), id).toContain(subject);
    }
  });
});
