/** A profile photo is checked by its bytes: a page renamed .png is refused before anything is written under public/. */
import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ written: [] as string[] }));
vi.mock("@/lib/auth", () => ({ getSessionFromCookies: async () => ({ userId: 5, role: "citizen" }) }));
vi.mock("@/lib/db", () => ({ default: { query: async () => [[{ id: 1 }]] } }));
vi.mock("fs/promises", () => ({ mkdir: async () => undefined, writeFile: async (p: string) => void h.written.push(p) }));

import { POST } from "./route";

const upload = (bytes: Uint8Array<ArrayBuffer>, type: string) => {
  const fd = new FormData();
  fd.append("photo", new File([bytes], "me.png", { type }));
  return POST(new NextRequest("http://localhost/api/profile/photo", { method: "POST", body: fd }));
};
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d]);

describe("profile photo upload", () => {
  it("refuses HTML that claims to be a PNG, and writes nothing", async () => {
    const r = await upload(new Uint8Array(new TextEncoder().encode("<html><script>alert(1)</script></html>")), "image/png");
    expect(r.status).toBe(400);
    expect(h.written).toEqual([]);
  });
  it("stores a real PNG under its real type", async () => {
    const r = await upload(PNG, "image/png");
    expect(r.status).toBe(200);
    expect(h.written[0]).toMatch(/user-5-\d+\.png$/);
  });
});
