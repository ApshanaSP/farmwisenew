/** A profile photo is served to the account it belongs to only; anyone else, or a malformed name, gets "Not found". */
import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

const NAME = "p-0a1b2c3d4e5f60718293.png";
const h = vi.hoisted(() => ({ sessions: [] as { userId: number }[] }));
vi.mock("@/lib/auth", () => ({ getActiveSessions: async () => h.sessions }));
vi.mock("@/lib/db", () => ({
  default: { query: async (_sql: string, args: unknown[]) => [args[0] === "/api/profile/photo/p-0a1b2c3d4e5f60718293.png" ? [{ user_id: 5 }] : []] }
}));
vi.mock("fs/promises", () => ({ readFile: async () => Buffer.from([0x89, 0x50, 0x4e, 0x47]) }));

import { GET } from "./route";

const get = (name: string) => GET(new NextRequest(`http://localhost/api/profile/photo/${name}`), { params: Promise.resolve({ name }) });

describe("profile photo serving", () => {
  it("serves the owner", async () => {
    h.sessions = [{ userId: 5 }];
    const r = await get(NAME);
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("image/png");
  });
  it("hides it from another account, and asks nobody to sign in", async () => {
    h.sessions = [{ userId: 6 }];
    expect((await get(NAME)).status).toBe(404);
    h.sessions = [];
    expect((await get(NAME)).status).toBe(401);
  });
  it("refuses names that are not a photo's", async () => {
    h.sessions = [{ userId: 5 }];
    expect((await get("..%2F..%2F.env")).status).toBe(404);
    expect((await get("user-5-1.png")).status).toBe(404);
    expect((await get("p-ffffffffffffffffffff.png")).status).toBe(404);
  });
});
