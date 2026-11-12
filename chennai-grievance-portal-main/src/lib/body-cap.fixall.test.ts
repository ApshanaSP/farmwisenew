import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";
import { readFormCapped } from "@/lib/body-cap";

// officer-day-25: the completion report and the citizen's media upload called req.formData(), which reads the whole body into
// memory, and only then checked each file's size: a 30 MB "photo" was read in full before it was refused, and nothing limited the
// request. Both routes now read the body with a byte limit (the largest valid request) before parsing it.

/** a body that counts how many bytes the server pulled from it, sent without a Content-Length (chunked) */
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

describe("officer-day-25: a form is read with a byte limit before it is parsed", () => {
  it("refuses a declared Content-Length over the limit without reading the body", async () => {
    const { body, pulled } = streamed(30 * 1024 * 1024);
    const req = new Request("http://x/upload", { method: "POST", body, headers: { "content-type": "multipart/form-data; boundary=x", "content-length": String(30 * 1024 * 1024) }, duplex: "half" } as RequestInit);
    const r = await readFormCapped(req, 1024 * 1024);
    expect(r.tooLarge).toBe(true);
    expect(pulled.n).toBeLessThanOrEqual(2 * 256 * 1024);
  });

  it("stops reading a chunked body as soon as it passes the limit", async () => {
    const { body, pulled } = streamed(30 * 1024 * 1024);
    const req = new Request("http://x/upload", { method: "POST", body, headers: { "content-type": "multipart/form-data; boundary=x" }, duplex: "half" } as RequestInit);
    const r = await readFormCapped(req, 1024 * 1024);
    expect(r.tooLarge).toBe(true);
    expect(pulled.n).toBeLessThan(2 * 1024 * 1024);
  });

  it("parses a form under the limit as before", async () => {
    const fd = new FormData();
    fd.set("remarks", "Done");
    fd.append("photos", new File([new Uint8Array([1, 2, 3])], "a.jpg", { type: "image/jpeg" }));
    const r = await readFormCapped(new Request("http://x/upload", { method: "POST", body: fd }), 1024 * 1024);
    expect(r.tooLarge).toBe(false);
    expect(r.form?.get("remarks")).toBe("Done");
    expect((r.form?.get("photos") as File).size).toBe(3);
  });
});

vi.mock("@/lib/auth", () => ({ getActiveSession: async () => ({ userId: 5, role: "citizen" }) }));
vi.mock("@/lib/complaint-media", () => ({ MAX_MEDIA_BYTES: 10 * 1024 * 1024, saveMedia: async () => "x", sniffMedia: () => "jpg" }));

describe("officer-day-25: the citizen's media upload refuses an oversized request before reading it", () => {
  it("a 30 MB request is a 413 and the body is not read in full", async () => {
    const { POST } = await import("@/app/api/complaints/media/route");
    const { body, pulled } = streamed(30 * 1024 * 1024);
    const r = await POST(new NextRequest("http://x/api/complaints/media", { method: "POST", body, headers: { "content-type": "multipart/form-data; boundary=x" }, duplex: "half" } as never));
    expect(r.status).toBe(413);
    expect(pulled.n).toBeLessThan(12 * 1024 * 1024);
  });
});
