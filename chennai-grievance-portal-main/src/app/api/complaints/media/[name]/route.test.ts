/**
 * SEC-002: who may open a private complaint photo. The database and session are stand-ins (no portal data is read);
 * the file is a real one in a temporary upload folder.
 */
import fs from "fs";
import os from "os";
import path from "path";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  session: null as null | { userId: number; role: string },
  /** other sign-ins the same browser holds (another portal's cookie) */
  also: [] as { userId: number; role: string }[],
  complaints: [] as { media_path: string; user_id: number; department_id: number }[],
  users: [] as { id: number; department_id: number | null }[]
}));
vi.mock("@/lib/auth", () => ({ getActiveSessions: async () => [...h.also, ...(h.session ? [h.session] : [])] }));
vi.mock("@/lib/db", () => ({
  default: {
    query: async (sql: string, params: unknown[]) => {
      if (/FROM complaints/.test(sql)) return [h.complaints.filter((c) => c.media_path === params[0])];
      if (/FROM users/.test(sql)) return [h.users.filter((u) => u.id === params[0])];
      throw new Error("unexpected query " + sql);
    }
  }
}));

import { GET } from "./route";

const NAME = "c-20261012-00112233445566aa.png";
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d]);
let dir = "";
const as = async (s: typeof h.session, name = NAME) => {
  h.session = s;
  return (await GET(new NextRequest(`http://localhost/api/complaints/media/${name}`), { params: { name } })).status;
};

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "media-"));
  process.env.COMPLAINT_UPLOAD_DIR = dir;
  fs.writeFileSync(path.join(dir, NAME), PNG);
  fs.writeFileSync(path.join(dir, `${NAME}.owner.json`), JSON.stringify({ userId: 10 }));
  // attached to a complaint of department 3 filed by citizen 11 (e.g. a photo re-used after an account merge)
  h.complaints = [{ media_path: `/api/complaints/media/${NAME}`, user_id: 11, department_id: 3 }];
  h.users = [{ id: 20, department_id: 3 }, { id: 21, department_id: 5 }, { id: 22, department_id: null }];
});
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

describe("private complaint media access (SEC-002)", () => {
  it("lets the uploader, the complaint's citizen, its department's officer and the Collector open it", async () => {
    expect(await as({ userId: 10, role: "citizen" })).toBe(200);
    expect(await as({ userId: 11, role: "citizen" })).toBe(200);
    expect(await as({ userId: 20, role: "department_officer" })).toBe(200);
    expect(await as({ userId: 1, role: "collector" })).toBe(200);
  });
  it("hides it from other citizens and other departments' officers, and needs a session", async () => {
    expect(await as({ userId: 12, role: "citizen" })).toBe(404);
    expect(await as({ userId: 21, role: "department_officer" })).toBe(404);
    expect(await as({ userId: 22, role: "department_officer" })).toBe(404);
    expect(await as(null)).toBe(401);
  });
  it("lets the Collector in a browser also signed in as an unrelated citizen open it (no Referer in a new tab)", async () => {
    h.also = [{ userId: 12, role: "citizen" }];
    expect(await as({ userId: 1, role: "collector" })).toBe(200);
    expect(await as(null)).toBe(404);
    h.also = [];
  });
  it("refuses names that are not upload names", async () => {
    for (const n of ["../../.env", `${NAME}.owner.json`, "c-20261012-00112233445566aa.html", "x.png"]) {
      expect(await as({ userId: 1, role: "collector" }, n)).toBe(404);
    }
  });
});
