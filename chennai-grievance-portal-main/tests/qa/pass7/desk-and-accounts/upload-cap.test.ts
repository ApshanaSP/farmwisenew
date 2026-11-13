/**
 * QA pass 7 (desk-and-accounts), pass 6's reviewerA-02 for this session's two routes: /api/profile/photo and /api/manu/petitions called
 * req.formData() before any size check, so a body sent without a Content-Length (chunked) was read whole into memory and only then refused.
 * Each body below is streamed without a Content-Length and counts what the server pulls (the pattern of the pass 6 session's
 * src/app/api/rehearsal/upload-cap.fixall.test.ts). Only the session, the store and the file writers are replaced.
 *   npx vitest run --config vitest.p7.config.ts tests/qa/pass7/desk-and-accounts/upload-cap.test.ts
 */
import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

const H = vi.hoisted(() => ({ photos: 0, petitions: 0 }));
vi.mock("@/lib/auth", () => ({ getSessionFromCookies: async () => ({ userId: 5, email: "a@x", role: "citizen" }) }));
vi.mock("@/lib/db", () => ({ default: { query: async (sql: string) => (/^\s*SELECT/i.test(sql) ? [[]] : [{ affectedRows: 1, insertId: 1 }]) } }));
vi.mock("@/lib/profile-photo", () => ({ savePhoto: async () => { H.photos++; return "/api/profile/photo/p-00000000000000000000.png"; }, removePhoto: async () => undefined }));
vi.mock("@/lib/manu/guard", () => ({ manuStaff: async () => ({ session: { userId: 7, email: "petition@x", role: "department_officer" } }), manuFailed: () => new Response("failed", { status: 500 }) }));
vi.mock("@/lib/manu/files", () => ({ UploadError: class extends Error {}, savePages: async () => ["p-1.jpg"] }));
vi.mock("@/lib/manu/petitions", () => ({ createPetition: async () => { H.petitions++; return 1; }, deskList: async () => [] }));

const { POST: uploadPhoto } = await import("@/app/api/profile/photo/route");
const { POST: uploadPetition } = await import("@/app/api/manu/petitions/route");
const { MANU_LIMITS } = await import("@/lib/manu/constants");

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
const req = (url: string, body: ReadableStream<Uint8Array>) =>
  new NextRequest(url, { method: "POST", body, headers: { "content-type": "multipart/form-data; boundary=x" }, duplex: "half" } as never);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...new Array(64).fill(7)]);
const JPG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...new Array(64).fill(1)]);

describe("reviewerA-02 (p7 desk-and-accounts): the profile photo and petition uploads refuse a large body before reading it", () => {
  it("/api/profile/photo: a 30 MB body with no Content-Length is a 413 and pulls far less than 30 MB", async () => {
    const { body, pulled } = streamed(30 * 1024 * 1024);
    const r = await uploadPhoto(req("http://localhost/api/profile/photo", body));
    expect(r.status).toBe(413);
    expect(pulled.n).toBeLessThan(4 * 1024 * 1024);
    expect(H.photos).toBe(0);
  });

  it("/api/profile/photo: a normal photo is still saved", async () => {
    const form = new FormData();
    form.append("photo", new File([PNG], "me.png", { type: "image/png" }));
    const r = await uploadPhoto(new NextRequest("http://localhost/api/profile/photo", { method: "POST", body: form }));
    expect(r.status).toBe(200);
    expect(H.photos).toBe(1);
  });

  it("/api/manu/petitions: a body past the upload limit with no Content-Length is a 413 and pulls no more than the limit", async () => {
    const { body, pulled } = streamed(MANU_LIMITS.maxRequestBytes + 20 * 1024 * 1024);
    const r = await uploadPetition(req("http://localhost/api/manu/petitions", body));
    expect(r.status).toBe(413);
    expect(pulled.n).toBeLessThan(MANU_LIMITS.maxRequestBytes + 1024 * 1024);
    expect(H.petitions).toBe(0);
  });

  it("/api/manu/petitions: a normal petition photo is still taken", async () => {
    const form = new FormData();
    form.append("pages", new File([JPG], "p.jpg", { type: "image/jpeg" }));
    const r = await uploadPetition(new NextRequest("http://localhost/api/manu/petitions", { method: "POST", body: form }));
    expect(r.status).toBe(200);
    expect(H.petitions).toBe(1);
  });
});
