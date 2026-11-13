// QA4 gate fix: redteam-final-11. A profile photo is written outside public/ (next start only serves what public/ held at build time)
// and is read back through a route, at the address the upload returns.
// QA pass 7 merge: pass 6's hunt2-sec-07 fix (desk-and-accounts, kept over pass 4's eec8c840 design) stores it under a random name,
// p-<20 hex>, behind /api/profile/photo/<name>, and the route checks the photo is the signed-in account's own (user_profiles.profile_photo).
import fs from "fs";
import os from "os";
import path from "path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082", "hex");
const h = vi.hoisted(() => ({ sessions: [{ userId: 7, role: "citizen" }] as { userId: number; role: string }[], rows: [] as unknown[][] }));
let dir = "";

vi.mock("@/lib/auth", () => ({ getSessionFromCookies: async () => h.sessions[0] ?? null, getActiveSessions: async () => h.sessions }));
const photos = vi.hoisted(() => new Map<number, string>());
vi.mock("@/lib/db", () => ({ default: { query: async (sql: string, a: unknown[]) => {
  h.rows.push([sql, a]);
  if (/^INSERT INTO user_profiles/.test(sql)) photos.set(Number(a[0]), String(a[1]));
  if (/^UPDATE user_profiles SET profile_photo/.test(sql)) photos.set(Number(a[1]), String(a[0]));
  if (/^SELECT user_id FROM user_profiles WHERE profile_photo/.test(sql)) return [[...photos].filter(([, p]) => p === a[0]).map(([user_id]) => ({ user_id }))];
  if (/^SELECT id, profile_photo FROM user_profiles WHERE user_id/.test(sql)) return [photos.has(Number(a[0])) ? [{ id: 1, profile_photo: photos.get(Number(a[0])) }] : []];
  return [/^SELECT/.test(sql) ? [] : { affectedRows: 1 }];
} } }));

beforeAll(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), "diq-profile-")); process.env.PROFILE_UPLOAD_DIR = dir; });
afterAll(() => { fs.rmSync(dir, { recursive: true, force: true }); delete process.env.PROFILE_UPLOAD_DIR; });

async function upload(): Promise<string> {
  const { POST } = await import("./route");
  const fd = new FormData();
  fd.append("photo", new Blob([PNG], { type: "image/png" }), "me.png");
  const res = await POST(new Request("http://x/api/profile/photo", { method: "POST", body: fd }) as never);
  expect(res.status).toBe(200);
  return ((await res.json()) as { profilePhoto: string }).profilePhoto;
}
const get = async (name: string) => {
  const { GET } = await import("./[name]/route");
  return GET(new Request("http://x/api/profile/photo/" + name) as never, { params: Promise.resolve({ name }) });
};

describe("profile photo storage", () => {
  it("redteam-final-11: the photo is saved outside public/, under the address the upload returns, and that address opens for its owner", async () => {
    const p = await upload();
    expect(p).toMatch(/^\/api\/profile\/photo\/p-[a-f0-9]{20}\.png$/);
    const name = p.split("/").pop()!;
    expect(fs.existsSync(path.join(dir, name))).toBe(true);
    expect(fs.existsSync(path.join(process.cwd(), "public", "uploads", "profile", name))).toBe(false);
    const r = await get(name);
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("image/png");
    expect(Buffer.from(await r.arrayBuffer()).equals(PNG)).toBe(true);
  });
  it("another signed-in user, a signed-out visitor and a bad name all get no photo", async () => {
    const name = (await upload()).split("/").pop()!;
    h.sessions = [{ userId: 8, role: "citizen" }];
    expect((await get(name)).status).toBe(404);
    h.sessions = [];
    expect((await get(name)).status).toBe(401);
    h.sessions = [{ userId: 7, role: "citizen" }];
    for (const bad of ["..%2F..%2Fetc", "user-7-1.png/../x", "user-7-1.svg", "x.png"]) expect((await get(bad)).status).toBe(404);
  });
});
