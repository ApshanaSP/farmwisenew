import { NextRequest, NextResponse } from "next/server";
import { describe, expect, it, vi } from "vitest";

// reviewerA-02 (officer-day-25 fix review): officer-day-25 capped the officer report and the citizen media routes, but other routes
// still called req.formData() (or req.json()) before any size check, so one large upload was read whole into memory. These are
// the two rehearsal routes this run owns; /api/profile/photo, /api/manu/petitions and /api/collector/studio belong to the p7
// sessions and are handed to them. Each body below is streamed without a Content-Length and counts what the server pulls.

const H = vi.hoisted(() => ({ marked: 0 }));
vi.mock("@/lib/officer/guard", () => ({
  officerSession: async () => ({ dept: { code: "GCC-SWM" }, session: { email: "officer@example.test" } }),
  failed: () => new Response("failed", { status: 500 }),
  fresh: (b: unknown) => Response.json(b)
}));
vi.mock("@/lib/rehearsal/tasks", () => ({
  markDone: async () => { H.marked++; return { status: 200, body: { ok: true } }; },
  readTasks: async () => [], draftDept: async () => ({}), sendDept: async () => ({ status: 200, body: {} })
}));
vi.mock("@/lib/officer/photos", () => ({ newPhotoDir: () => "d", removePhotoDir: async () => {}, savePhotos: async () => ["p.jpg"], sniff: () => "jpg" }));
vi.mock("@/lib/rehearsal/engine", () => ({
  facilityReach: async () => ({}), pastRains: async () => ({}), planFor: async () => ({ rid: 1, jobs: [], deptName: () => "", headline: "" }),
  rehearsalState: async () => ({}), routeBetween: async () => ({}), RehearsalUnavailable: class extends Error { status = 503; }
}));
vi.mock("@/lib/collector/geo", () => ({ mapGeo: async () => ({}) }));
vi.mock("@/lib/rehearsal/impacts", () => ({ impacts: async () => ({}), LENSES: ["traffic"] }));
vi.mock("@/lib/rehearsal/traffic", () => ({ liveIncidents: async () => ({}) }));

/** a body that counts the bytes the server pulled from it, sent without a Content-Length (chunked) */
function streamed(total: number, chunk = 256 * 1024) {
  const pulled = { n: 0 };
  let sent = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(c) {
      if (sent >= total) return c.close();
      const n = Math.min(chunk, total - sent);
      sent += n; pulled.n += n;
      c.enqueue(new Uint8Array(n));
    }
  });
  return { body, pulled };
}
const req = (url: string, body: ReadableStream<Uint8Array>, type: string) =>
  new NextRequest(url, { method: "POST", body, headers: { "content-type": type, host: "localhost:3110" }, duplex: "half" } as never);

// QA pass 7 gate: these tests run as a sequence over shared state (the task's done mark), so they keep their order when the suite is shuffled
describe("reviewerA-02: the rehearsal routes refuse a large body before reading it", { shuffle: false }, () => {
  it("/api/rehearsal/tasks: a 30 MB form is a 413, pulls far less than 30 MB, and marks nothing done", async () => {
    const { POST } = await import("./tasks/route");
    const { body, pulled } = streamed(30 * 1024 * 1024);
    const r = await POST(req("http://localhost:3110/api/rehearsal/tasks", body, "multipart/form-data; boundary=x"));
    expect(r.status).toBe(413);
    expect(pulled.n).toBeLessThan(8 * 1024 * 1024);
    expect(H.marked).toBe(0);
  });

  it("/api/rehearsal/tasks: a normal form still marks the task done", async () => {
    const { POST } = await import("./tasks/route");
    const form = new FormData(); form.set("id", "7");
    const r = await POST(new NextRequest("http://localhost:3110/api/rehearsal/tasks", { method: "POST", body: form }));
    expect(r.status).toBe(200);
    expect(H.marked).toBe(1);
  });

  it("/api/rehearsal/dev: a 30 MB form or JSON body is a 413 and pulls far less than 30 MB", async () => {
    vi.stubEnv("AWS_STORE_DRY_RUN", "1");
    const { POST } = await import("./dev/route");
    const a = streamed(30 * 1024 * 1024);
    const r1 = await POST(req("http://localhost:3110/api/rehearsal/dev?kind=done&dept=GCC-SWM", a.body, "multipart/form-data; boundary=x"));
    expect(r1.status).toBe(413);
    expect(a.pulled.n).toBeLessThan(2 * 1024 * 1024);
    const b = streamed(30 * 1024 * 1024);
    const r2 = await POST(req("http://localhost:3110/api/rehearsal/dev?kind=route", b.body, "application/json"));
    expect(r2.status).toBe(413);
    expect(b.pulled.n).toBeLessThan(2 * 1024 * 1024);
    vi.unstubAllEnvs();
  });
});

void NextResponse;
