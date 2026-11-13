/**
 * QA pass 7, studio-egress: POST /api/collector/studio read an upload of any size into memory (req.formData()) before the file's own
 * 15 MB check, and a link or sample body of any size (req.json()). Same mechanism as officer-day-25 (commit 47dc0b9, lib/body-cap.ts
 * readFormCapped, copied unchanged): the body is read with a limit before it is parsed.
 *   npx vitest run --config vitest.p7.config.ts --maxWorkers=1 tests/qa/pass7/studio-egress/studio-upload-cap.test.ts
 */
import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/collector/guard", () => ({ collectorSession: async () => ({ email: "c@x", userId: 1, role: "collector" }), failed: () => new Response(null, { status: 500 }) }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: () => ({ allowed: true }) }));
const calls: string[] = [];
vi.mock("@/lib/studio/pipeline", () => ({
  ingest: async (p: { buf: Buffer; file: string }) => { calls.push(`ingest ${p.file} ${p.buf.length}`); return "ds-1"; },
  ingestLink: async () => { calls.push("ingestLink"); return "ds-2"; },
  namesOf: () => ({})
}));

const MB = 1024 * 1024;
const CRLF = String.fromCharCode(13, 10);
const BOUNDARY = "----p7studioegress";
const enc = new TextEncoder();
const head = (name: string) => enc.encode(`--${BOUNDARY}${CRLF}Content-Disposition: form-data; name="file"; filename="${name}"${CRLF}Content-Type: text/csv${CRLF}${CRLF}`);
const tail = enc.encode(`${CRLF}--${BOUNDARY}--${CRLF}`);

/** a multipart upload whose file part is `size` bytes, streamed 1 MB at a time; `pulled` counts what the server read */
function upload(size: number, headers: Record<string, string> = {}) {
  const box = { pulled: 0 };
  let sent = -1;
  const stream = new ReadableStream<Uint8Array>({
    pull(ctrl) {
      let chunk: Uint8Array;
      if (sent < 0) { chunk = head("big.csv"); sent = 0; }
      else if (sent < size) { const n = Math.min(MB, size - sent); chunk = new Uint8Array(n).fill(97); sent += n; }
      else if (sent === size) { chunk = tail; sent = size + 1; }
      else { ctrl.close(); return; }
      box.pulled += chunk.byteLength;
      ctrl.enqueue(chunk);
    }
  });
  const req = new NextRequest("http://x/api/collector/studio", {
    method: "POST", body: stream, duplex: "half", headers: { "content-type": `multipart/form-data; boundary=${BOUNDARY}`, ...headers }
  } as RequestInit & { duplex: "half" });
  return { req, box };
}

describe("POST /api/collector/studio reads a body with a limit before parsing it", () => {
  it("a 40 MB upload is refused after at most the limit is read (it was read in full first)", async () => {
    const { POST } = await import("@/app/api/collector/studio/route");
    const { req, box } = upload(40 * MB);
    const res = await POST(req);
    expect(res.status).toBe(413);
    expect(box.pulled, `read ${box.pulled} bytes`).toBeLessThanOrEqual(15 * MB + 64 * 1024 + 2 * MB);
    expect(calls.filter((c) => c.startsWith("ingest "))).toEqual([]);
  }, 60_000);

  it("a declared length over the limit is refused before anything is read", async () => {
    const { POST } = await import("@/app/api/collector/studio/route");
    const { req, box } = upload(1024, { "content-length": String(50 * MB) });
    const res = await POST(req);
    expect(res.status).toBe(413);
    expect(box.pulled).toBeLessThanOrEqual(MB);
  });

  it("a link or sample body over 64 KB is refused (it was parsed whole)", async () => {
    const { POST } = await import("@/app/api/collector/studio/route");
    const req = new NextRequest("http://x/api/collector/studio", { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: "https://data.example.org/file.csv", pad: "x".repeat(100 * 1024) }) });
    const res = await POST(req);
    expect(res.status).toBe(413);
    expect(calls).not.toContain("ingestLink");
  });

  it("a normal upload is still read and handed to the pipeline", async () => {
    const { POST } = await import("@/app/api/collector/studio/route");
    const { req } = upload(2048);
    const res = await POST(req);
    expect(res.status).toBe(200);
    await res.text();
    expect(calls).toContain("ingest big.csv 2048");
  });
});
