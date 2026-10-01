/**
 * Parity check between the MySQL store and the AWS store (DATA_BACKEND=aws): the dashboard's own data functions,
 * run once per backend over the same district_intel build, their results written to a JSON file to compare.
 * Skipped unless PARITY_OUT is set; needs MySQL (for the mysql run) or the API key (for the aws run).
 *
 *   set DATA_BACKEND=mysql&& set PARITY_OUT=tmp/parity-mysql.json&& npx vitest run src/lib/aws/parity.test.ts
 *   set DATA_BACKEND=aws&& set PARITY_OUT=tmp/parity-aws.json&& npx vitest run src/lib/aws/parity.test.ts
 *   node scripts/compare-parity.js tmp/parity-mysql.json tmp/parity-aws.json
 */
import fs from "fs";
import path from "path";
import { describe, it } from "vitest";
import dotenv from "dotenv";

dotenv.config({ path: path.join(process.cwd(), ".env") });
const OUT = process.env.PARITY_OUT;

describe.skipIf(!OUT)("store parity", () => {
  it("runs the dashboard data functions", async () => {
    const intel = await import("@/lib/collector/intel");
    const ins = await import("@/lib/collector/insights");
    const geo = await import("@/lib/collector/geo");
    const threads = await import("@/lib/collector/threads");
    const now = await intel.asOf();
    const cases: Record<string, () => Promise<unknown>> = {
      asOf: async () => now,
      deptList: () => intel.deptList(),
      "overview weekly": () => intel.overview("weekly", null, null),
      "overview daily": () => intel.overview("daily", null, null),
      "overview monthly zone 9": () => intel.overview("monthly", 9, null),
      "overview quarterly dept": () => intel.overview("quarterly", null, "GCC-SWD"),
      "insights weekly": () => ins.insights("weekly", null, null),
      "insights monthly zone 5": () => ins.insights("monthly", 5, null),
      "list weekly": () => intel.list({ period: "weekly", zone: null, dept: null, sev: null, status: null, q: null, sort: "t", dir: -1, page: 1 } as any),
      "list severe by priority": () => intel.list({ period: "monthly", zone: null, dept: null, sev: "Severe", status: null, q: null, sort: "r", dir: -1, page: 1 } as any),
      "search flood": () => intel.search("flood"),
      "incident": () => intel.incident("INC-20260404-2CD2BE"),
      "report weekly": () => intel.report("weekly", null, null),
      "exportRows weekly": () => intel.exportRows("weekly", null, null),
      mapGeo: () => geo.mapGeo(),
      "threads 72h": () => threads.threads({ hours: 72, zone: null, dept: null, cat: null, taluk: null }, now),
    };
    const results: Record<string, unknown> = {};
    for (const [name, f] of Object.entries(cases)) {
      const t = Date.now();
      try {
        results[name] = { ok: await f(), ms: Date.now() - t };
      } catch (e: any) {
        results[name] = { error: String(e?.message ?? e).slice(0, 800), ms: Date.now() - t };
      }
    }
    fs.mkdirSync(path.dirname(OUT!), { recursive: true });
    fs.writeFileSync(OUT!, JSON.stringify({ backend: process.env.DATA_BACKEND || "mysql", results }, null, 1));
  }, 600_000);
});
