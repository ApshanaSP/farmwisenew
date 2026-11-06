// QA pass 4, lane c: class guards. Each one fails if its kind of bug comes back anywhere in the code.
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "../../..");
function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
}
const routes = walk(path.join(ROOT, "src/app/api")).filter((f) => /route\.ts$/.test(f));
const SIGNED = /getSession|getActivePortalSession|getActiveSession|collectorSession|assistantSession|officerSession|requireRole|localOnly|allowed\(req\)/;

describe("RC-17 class guard: no route without a sign-in reads its body unbounded", () => {
  it("every route that checks no session reads JSON through readJsonCapped", () => {
    const bad = routes.filter((f) => {
      const s = fs.readFileSync(f, "utf8");
      return !SIGNED.test(s) && /\b(req|request)\.(json|text|formData|arrayBuffer)\(\)/.test(s) && !/readJsonCapped/.test(s);
    }).map((f) => path.relative(ROOT, f));
    expect(bad).toEqual([]);
  });
});

describe("RC-17 readJsonCapped", () => {
  it("refuses a chunked body past the limit even with no Content-Length, and a small body still parses", async () => {
    const { readJsonCapped } = await import("@/lib/body-cap");
    const big = new Request("http://127.0.0.1/x", { method: "POST", body: new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode("[" + "0,".repeat(40_000) + "0]")); c.close(); } }), duplex: "half" } as RequestInit);
    expect((await readJsonCapped(big, 64 * 1024)).tooLarge).toBe(true);
    const ok = new Request("http://127.0.0.1/x", { method: "POST", body: '{"a":1}' });
    expect(await readJsonCapped(ok)).toEqual({ body: { a: 1 }, tooLarge: false });
    const bad = new Request("http://127.0.0.1/x", { method: "POST", body: "{nope" });
    expect(await readJsonCapped(bad)).toEqual({ body: null, tooLarge: false });
  });
});
