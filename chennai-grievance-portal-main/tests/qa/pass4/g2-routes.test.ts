// QA pass 4, fixer G2, RC-43: a filter the request names but the console cannot apply is refused (a 400 that says which), never dropped and answered with the default.
// The route handlers are called in-process with the session helpers stubbed; the check runs before any store read, so no data is needed.
//   npx vitest run --config vitest.qa4.config.ts tests/qa/pass4/g2-routes.test.ts
// hunt-console-3 (zone 99), hunt-console-4 (tab=returned), PB-269, PB-270; hunt-citizen-2 (a corrupt Excel or CSV is called empty) is at the end.
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

vi.mock("@/lib/collector/guard", async (orig) => ({ ...(await orig<typeof import("@/lib/collector/guard")>()), collectorSession: vi.fn(async () => ({ userId: 1, email: "qa.g2@example.invalid", role: "collector" })) }));
vi.mock("@/lib/officer/guard", async (orig) => ({ ...(await orig<typeof import("@/lib/officer/guard")>()), officerSession: vi.fn(async () => ({ session: { userId: 2, email: "qa.g2.o@example.invalid", role: "department_officer" }, dept: { code: "GCC-SWM" } })) }));
vi.mock("@/lib/assistant/access", async (orig) => ({ ...(await orig<typeof import("@/lib/assistant/access")>()), assistantSession: vi.fn(async () => ({ userId: 1, email: "qa.g2@example.invalid", role: "collector", lockDept: null })) }));

const get = (url: string) => new NextRequest(`http://127.0.0.1:3211${url}`);
const COLLECTOR_ROUTES = ["overview", "list", "export", "insights", "report", "stories", "pattern", "brief"];
const OFFICER_ROUTES = ["overview", "insights", "grievances"];

describe("RC-43 console: a zone, period, department, category or taluk that does not exist is a 400", () => {
  const BAD = ["zone=99", "zone=0", "zone=-1", "zone=abc", "zone=16", "zone=1.5", "zone=9%3B", "period=yearly", "dept=nope", "cat=not-a-code", "taluk=TLK-1"];
  for (const r of COLLECTOR_ROUTES) {
    it.each(BAD)(`collector/${r}?%s`, async (q) => {
      const { GET } = await import(`@/app/api/collector/${r}/route`);
      const res: NextResponse = await GET(get(`/api/collector/${r}?${q}`));
      expect(res.status).toBe(400);
      expect(JSON.stringify(await res.json())).toMatch(/not (one of|a)/);
    });
  }
  for (const r of OFFICER_ROUTES) {
    it.each(BAD)(`officer/${r}?%s`, async (q) => {
      const { GET } = await import(`@/app/api/officer/${r}/route`);
      const res: NextResponse = await GET(get(`/api/officer/${r}?${q}`));
      expect(res.status).toBe(400);
    });
  }
  it.each(["returned", "NEW", "x", "all2"])("officer/grievances?tab=%s is refused, not shown as the New tab", async (tab) => {
    const { GET } = await import("@/app/api/officer/grievances/route");
    const res: NextResponse = await GET(get(`/api/officer/grievances?tab=${tab}`));
    expect(res.status).toBe(400);
    expect(JSON.stringify(await res.json())).toMatch(/Tab .* is not one of new, action, sent, verified, all/);
  });
  it("assistant/export refuses a zone that does not exist before it counts the download", async () => {
    const { GET } = await import("@/app/api/collector/assistant/export/route");
    const res: NextResponse = await GET(get("/api/collector/assistant/export?zone=99"));
    expect(res.status).toBe(400);
  });
});

describe("RC-43 class guard: every route that reads a zone, period, taluk or tab refuses a bad one", () => {
  const root = path.join(process.cwd(), "src", "app", "api");
  const files: string[] = [];
  (function walk(d: string) { for (const e of fs.readdirSync(d, { withFileTypes: true })) e.isDirectory() ? walk(path.join(d, e.name)) : /^route\.ts$/.test(e.name) && files.push(path.join(d, e.name)); })(root);
  it("finds the routes", () => expect(files.length).toBeGreaterThan(50));
  it("a route that calls parseZone, parseTaluk or parseScope also calls refuseBadFilter (or the filter check in the shared guard)", () => {
    const missing = files.filter((f) => { const s = fs.readFileSync(f, "utf8"); return /\b(parseZone|parseTaluk|parseScope)\(/.test(s) && !/refuseBadFilter\(/.test(s); }).map((f) => path.relative(root, f));
    expect(missing).toEqual([]);
  });
  it("a route that calls parseTab also calls refuseBadTab", () => {
    const missing = files.filter((f) => { const s = fs.readFileSync(f, "utf8"); return /\bparseTab\(/.test(s) && !/refuseBadTab\(/.test(s); }).map((f) => path.relative(root, f));
    expect(missing).toEqual([]);
  });
});

// hunt-citizen-2 (PB-265): a file that says it is Excel or CSV and is not one is called unreadable, not empty
describe("RC-43 Data Studio: a corrupt file is unreadable, not empty", () => {
  const text = (s: string) => Buffer.from(s);
  it.each([
    ["a.xlsx", text("this is not a zip")],
    ["a.xlsm", text("PK-not")],
    ["a.ods", text("plain words, not a zip")],
    ["b.csv", Buffer.from([0, 1, 2, 3, 255, 254, 0, 0, 7, 9, 0, 1])],
    ["c.tsv", Buffer.from([0, 255, 0, 255, 1, 2, 3, 0, 0, 0])]
  ])("%s", async (name, buf) => {
    const { parseAll } = await import("@/lib/studio/parse");
    let msg = "";
    try { const t = parseAll(buf, name); msg = `parsed ${t[0].rows.length} rows`; } catch (e) { msg = (e as Error).message; }
    expect(msg).toMatch(/could not be (opened|read)|does not (open|look)|not a .*(Excel|text|CSV)/i);
    expect(msg).not.toMatch(/no rows|is empty|no data/i);
  });
  it("a real, tiny CSV and an empty one are still read as before", async () => {
    const { parseAll } = await import("@/lib/studio/parse");
    expect(parseAll(text("ward,count\n1,2\n2,3\n"), "ok.csv")[0].rows.length).toBe(2);
    expect(() => parseAll(Buffer.alloc(0), "e.csv")).toThrow(/empty/);
  });
});
