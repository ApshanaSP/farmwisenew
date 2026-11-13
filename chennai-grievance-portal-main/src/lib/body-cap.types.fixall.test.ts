import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";
import { readFormCapped } from "@/lib/body-cap";

// p7-studio-egress-20: readFormCapped handed any content type to the platform's form reader. A urlencoded body under the limit took
// time growing with the square of its size there (Node's URLSearchParams: 200k entries 2.4 s, a 15 MB body about an hour), on the
// server's one thread. Every route that reads a form takes multipart; urlencoded is read only where a route asks for it, by a
// linear reader.

/** a body that counts the bytes the server pulled from it, streamed in 64 KB pieces */
function streamed(body: Uint8Array, headers: Record<string, string>) {
  const box = { pulled: 0 };
  let at = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(c) {
      if (at >= body.length) return c.close();
      const piece = body.subarray(at, Math.min(body.length, at + 64 * 1024));
      at += piece.length; box.pulled += piece.length; c.enqueue(piece);
    }
  });
  return { req: new Request("http://x/upload", { method: "POST", body: stream, headers, duplex: "half" } as RequestInit), box };
}

const MB = 1024 * 1024;

describe("p7-studio-egress-20: a form is read only in the content types the route expects", () => {
  it("a urlencoded body is refused before it is read or parsed when the route did not ask for urlencoded", async () => {
    const body = Buffer.from("a&".repeat(500_000)); // 1 MB: about 14 s in the platform's reader
    const { req, box } = streamed(body, { "content-type": "application/x-www-form-urlencoded" });
    const t = Date.now();
    const r = await readFormCapped(req, 15 * MB);
    expect(Date.now() - t).toBeLessThan(1000);
    expect(r.form).toBeNull();
    expect(r.tooLarge).toBe(false);
    expect(r.wrongType).toBe(true);
    expect(box.pulled).toBeLessThanOrEqual(64 * 1024);
  }, 60_000);

  it("text, JSON, a missing type, and a type that only mentions multipart are refused", async () => {
    for (const ct of ["text/plain", "application/json", "", "application/x-www-form-urlencoded; multipart/form-data", "multipart/mixed; boundary=x"]) {
      const r = await readFormCapped(streamed(Buffer.from("a=1"), ct ? { "content-type": ct } : {}).req, MB);
      expect(r.form, ct).toBeNull();
      expect(r.wrongType, ct).toBe(true);
    }
  });

  it("a multipart form is read as before, whatever the case of its type", async () => {
    const fd = new FormData();
    fd.set("remarks", "Done");
    fd.append("photos", new File([new Uint8Array([1, 2, 3])], "a.jpg", { type: "image/jpeg" }));
    const sent = new Request("http://x/upload", { method: "POST", body: fd });
    const ct = sent.headers.get("content-type")!.replace("multipart/form-data", "Multipart/Form-Data");
    const bytes = new Uint8Array(await sent.arrayBuffer());
    const r = await readFormCapped(streamed(bytes, { "content-type": ct }).req, MB);
    expect(r.wrongType).toBeFalsy();
    expect(r.form?.get("remarks")).toBe("Done");
    expect((r.form?.get("photos") as File).size).toBe(3);
  });

  it("where a route asks for urlencoded, a large crafted body is read in linear time", async () => {
    const time = async (n: number) => {
      const body = Buffer.from("a&".repeat(n));
      const t = Date.now();
      const { form } = await readFormCapped(streamed(body, { "content-type": "application/x-www-form-urlencoded" }).req, 15 * MB, { urlencoded: true });
      const ms = Date.now() - t;
      expect(form ? [...form.keys()].length : 0).toBe(n);
      return ms;
    };
    // 500k entries: about 14 s in the platform's reader, and four times that for twice the body
    const ms = await time(500_000);
    expect(ms, "ms for 500k entries").toBeLessThan(3000);
  }, 120_000);

  it("where a route asks for urlencoded, names and values are decoded as the URL standard says", async () => {
    const cases = ["a=1&b=%20x+y&c=%zz&d=%E0%AE%A4%E0%AE%BF&=e&f&&g==h&%41=%", "x=%F0%9F%98%80%FF&y=caf%C3%A9&z=+%2B+", "", "&&&", "k=%e0%ae", "a=1;b=2"];
    for (const text of cases) {
      const { form } = await readFormCapped(streamed(Buffer.from(text), { "content-type": "application/x-www-form-urlencoded; charset=UTF-8" }).req, MB, { urlencoded: true });
      expect([...(form ?? new FormData()).entries()], text).toEqual([...new URLSearchParams(text)]);
    }
  });
});

vi.mock("@/lib/auth", () => ({ getActiveSession: async () => ({ userId: 5, role: "citizen" }) }));
vi.mock("@/lib/complaint-media", () => ({ MAX_MEDIA_BYTES: 10 * 1024 * 1024, saveMedia: async () => "x", sniffMedia: () => "jpg" }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: () => ({ allowed: true }) }));

describe("p7-studio-egress-20: a route that reads a form answers a urlencoded body with a 400 at once", () => {
  it("the citizen's media upload", async () => {
    const { POST } = await import("@/app/api/complaints/media/route");
    const { req, box } = streamed(Buffer.from("a&".repeat(500_000)), { "content-type": "application/x-www-form-urlencoded" });
    const t = Date.now();
    const r = await POST(new NextRequest(req));
    expect(r.status).toBe(400);
    expect(Date.now() - t).toBeLessThan(1000);
    // the request wrapper reads a piece or two ahead of the route; the 1 MB body itself is never read
    expect(box.pulled).toBeLessThanOrEqual(3 * 64 * 1024);
  }, 60_000);
});
