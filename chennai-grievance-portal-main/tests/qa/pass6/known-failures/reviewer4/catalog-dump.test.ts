import { it } from "vitest";
import snapshot from "@/lib/assistant/schema.snapshot.json";
import { buildCatalog, type SchemaSnapshot } from "@/lib/assistant/catalog";
const cat = buildCatalog(snapshot as unknown as SchemaSnapshot);
it("dump", () => {
  for (const [n, t] of cat.tables) {
    const cols = [...t.columns.values()];
    const dept = cols.filter((c) => ["lead_dept", "dept_code", "department"].includes(c.name)).map((c) => c.name);
    const inc = t.columns.has("incident_id");
    const joins = cols.filter((c) => c.join).map((c) => `${c.name}->${c.join}`);
    const deptish = cols.filter((c) => /dept|department/i.test(c.name)).map((c) => c.name);
    console.log(`${n} | db=${(t as any).db ?? ""} | lockcol=${dept[0] ?? "-"} | incident_id=${inc} | deptish=${deptish.join(",")} | joins=${joins.join(",")} | cap=${t.cap ?? ""}`);
  }
});
