/**
 * Reviewer probe (QA pass 7, studio-parse): the pool's edges. A pasted link to a file the reader refuses as busy; a process started for a job
 * another process took; the memory message when the reader dies of V8's heap limit, several times over.
 *   timeout 300 npx vitest run --config vitest.p7.config.ts --maxWorkers=2 tests/qa/pass7/studio-parse/reviewer/pool.test.ts < /dev/null
 */
import { afterEach, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ url: "https://example.org/files/register.xlsx", body: Buffer.alloc(0) as Buffer }));
vi.mock("@/lib/studio/fetchurl", async (orig) => {
  const m = await orig<typeof import("@/lib/studio/fetchurl")>();
  return { ...m, fetchOnce: vi.fn(async (u: string) => {
    if (u === h.url) return { buf: h.body, name: "register.xlsx", contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", url: h.url, status: 200 };
    throw new m.LinkError("The link answered 404.", "http", 404);
  }) };
});
vi.mock("@/lib/studio/connect/robots", () => ({ robotsAllow: async () => true }));

import { resolveLink } from "@/lib/studio/connect/resolve";
import { parseAllAsync } from "@/lib/studio/parse";
import { ParseLimitError, readerState, stopReaders } from "@/lib/studio/parse-pool";
import { csv, unendedDeflate, workbook } from "../files";

const caught = (p: Promise<unknown>) => p.then(() => null, (e: Error) => e);
afterEach(() => { vi.unstubAllEnvs(); stopReaders(); });

it("a pasted link to a file, while the Studio is busy: the Collector is told it is busy, not that the file is damaged", async () => {
  stopReaders();
  vi.stubEnv("STUDIO_PARSE_PROCS", "1"); vi.stubEnv("STUDIO_PARSE_QUEUE", "1"); vi.stubEnv("STUDIO_PARSE_SECONDS", "4"); vi.stubEnv("STUDIO_BROWSER", "0");
  const hang = caught(parseAllAsync(unendedDeflate(), "a.xlsx"));
  h.body = workbook(20);
  const r = await resolveLink(h.url, { mode: "none" } as never, { log: () => {}, explore: false });
  console.log("busy link:", { kind: r.outcome.kind, reason: r.outcome.reason, why: r.outcome.why, checked: r.outcome.checked });
  await hang;
  expect(r.outcome.checked.join(" ")).not.toMatch(/damaged/);
}, 60_000);

it("a reader started for a job another reader took still leaves after its idle time (it has an idle timer)", async () => {
  stopReaders();
  vi.stubEnv("STUDIO_PARSE_PROCS", "2");
  await Promise.all([parseAllAsync(csv(2, 2), "a.csv"), parseAllAsync(csv(3, 2), "b.csv")]);
  // the case in production: a reader is started for a waiting job, and the job goes elsewhere (here: it waits past a short wait limit)
  stopReaders();
  vi.stubEnv("STUDIO_PARSE_WAIT_SECONDS", "0.05");
  const gone = await Promise.all([caught(parseAllAsync(csv(2, 2), "c.csv")), caught(parseAllAsync(csv(2, 2), "d.csv"))]);
  console.log("waited out:", gone.map((e) => (e as ParseLimitError)?.reason));
  await new Promise((r) => setTimeout(r, 1500));
  const pool = (globalThis as unknown as { __studioParse: { procs: { child: { pid: number }; ready: boolean; job: unknown; idle: unknown }[] } }).__studioParse;
  const procs = pool.procs.map((p) => ({ pid: p.child.pid, ready: p.ready, busy: !!p.job, idleTimer: !!p.idle }));
  console.log("procs after two small files:", procs, readerState());
  expect(procs.every((p) => p.idleTimer)).toBe(true);
}, 60_000);

it("a reader that dies of V8's heap limit is reported as 'memory' every time (stderr vs exit race), 5 runs", async () => {
  const reasons: string[] = [];
  for (let i = 0; i < 5; i++) {
    stopReaders();
    vi.stubEnv("STUDIO_PARSE_HEAP_MB", "48"); vi.stubEnv("STUDIO_PARSE_SECONDS", "30");
    const e = await caught(parseAllAsync(csv(200_000, 30), "big.csv"));
    reasons.push(e instanceof ParseLimitError ? e.reason : String(e));
  }
  console.log("heap-limit reasons:", reasons);
  expect(reasons.every((r) => r === "memory")).toBe(true);
}, 200_000);
