/**
 * p7-desk-and-accounts-10: a citizen's video was served whole for every request, with no Accept-Ranges, so Safari and iOS did not play it and
 * other browsers could not seek. A single byte range is answered with 206 and only those bytes, read from the file (never the whole file into
 * memory); a bad or unsatisfiable range is 416. Who may open the file is decided first, as before (SEC-002). The session and database are
 * stand-ins; the file is a real one in a temporary upload folder.
 */
import fs from "fs";
import os from "os";
import path from "path";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  session: null as null | { userId: number; role: string },
  /** every file the route read whole (fs/promises readFile) */
  readWhole: [] as string[]
}));
vi.mock("@/lib/auth", () => ({ getActiveSessions: async () => (h.session ? [h.session] : []) }));
vi.mock("@/lib/db", () => ({
  default: { query: async (sql: string) => (/FROM complaints/.test(sql) ? [[{ user_id: 11, department_id: 3 }]] : [[{ department_id: 5 }]]) }
}));
vi.mock("fs/promises", async (orig) => {
  const real = await orig<typeof import("fs/promises")>();
  const readFile = (async (p: Parameters<typeof real.readFile>[0], ...rest: unknown[]) => {
    h.readWhole.push(String(p));
    return (real.readFile as (...a: unknown[]) => unknown)(p, ...rest);
  }) as typeof real.readFile;
  return { ...real, default: { ...real, readFile }, readFile };
});

const { GET } = await import("./route");

const NAME = "c-20261112-bbbbbbbbbbbbbbbb.mp4";
const SIZE = 2000;
const MP4 = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from("ftypmp42"), Buffer.from(Array.from({ length: SIZE - 12 }, (_, i) => i % 251))]);
let dir = "";
const COLLECTOR = { userId: 1, role: "collector" };

const get = async (range?: string, session: typeof h.session = COLLECTOR, extra: Record<string, string> = {}) => {
  h.session = session;
  const headers: Record<string, string> = { ...extra };
  if (range !== undefined) headers.range = range;
  const res = await GET(new NextRequest(`http://localhost/api/complaints/media/${NAME}`, { headers }), { params: Promise.resolve({ name: NAME }) });
  const body = Buffer.from(await res.arrayBuffer());
  return { status: res.status, body, ranges: res.headers.get("accept-ranges"), contentRange: res.headers.get("content-range"),
    length: res.headers.get("content-length"), type: res.headers.get("content-type") };
};

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "media-range-"));
  process.env.COMPLAINT_UPLOAD_DIR = dir;
  fs.writeFileSync(path.join(dir, NAME), MP4);
  fs.writeFileSync(path.join(dir, `${NAME}.owner.json`), JSON.stringify({ userId: 10 }));
});
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));
beforeEach(() => { h.readWhole = []; h.session = null; });

describe("p7-desk-and-accounts-10: a citizen's video answers byte ranges", () => {
  it("no Range: 200, the whole file, and Accept-Ranges: bytes", async () => {
    const r = await get();
    expect({ status: r.status, ranges: r.ranges, length: r.length, type: r.type, contentRange: r.contentRange })
      .toEqual({ status: 200, ranges: "bytes", length: String(SIZE), type: "video/mp4", contentRange: null });
    expect(r.body.equals(MP4)).toBe(true);
  });
  it("bytes=0-1 (what Safari asks first): 206, Content-Range, and only those two bytes", async () => {
    const r = await get("bytes=0-1");
    expect({ status: r.status, ranges: r.ranges, contentRange: r.contentRange, length: r.length, type: r.type })
      .toEqual({ status: 206, ranges: "bytes", contentRange: `bytes 0-1/${SIZE}`, length: "2", type: "video/mp4" });
    expect([...r.body]).toEqual([0, 0]);
  });
  it("a middle range: only those bytes", async () => {
    const r = await get("bytes=100-199");
    expect({ status: r.status, contentRange: r.contentRange, length: r.length }).toEqual({ status: 206, contentRange: `bytes 100-199/${SIZE}`, length: "100" });
    expect(r.body.equals(MP4.subarray(100, 200))).toBe(true);
  });
  it("a suffix range (bytes=-500): the last 500 bytes", async () => {
    const r = await get("bytes=-500");
    expect({ status: r.status, contentRange: r.contentRange, length: r.length }).toEqual({ status: 206, contentRange: `bytes ${SIZE - 500}-${SIZE - 1}/${SIZE}`, length: "500" });
    expect(r.body.equals(MP4.subarray(SIZE - 500))).toBe(true);
  });
  it("open-ended (bytes=1500-, as Chrome asks) and an end past the file: up to the last byte", async () => {
    for (const range of ["bytes=1500-", "bytes=1500-999999"]) {
      const r = await get(range);
      expect({ status: r.status, contentRange: r.contentRange, length: r.length }, range).toEqual({ status: 206, contentRange: `bytes 1500-${SIZE - 1}/${SIZE}`, length: "500" });
      expect(r.body.equals(MP4.subarray(1500)), range).toBe(true);
    }
    const all = await get("bytes=-99999");
    expect({ status: all.status, contentRange: all.contentRange }).toEqual({ status: 206, contentRange: `bytes 0-${SIZE - 1}/${SIZE}` });
    expect(all.body.equals(MP4)).toBe(true);
  });
  it("past the end: 416 with the file's size, no bytes", async () => {
    for (const range of [`bytes=${SIZE}-`, `bytes=${SIZE + 10}-${SIZE + 20}`, "bytes=-0"]) {
      const r = await get(range);
      expect({ status: r.status, contentRange: r.contentRange, body: r.body.length }, range).toEqual({ status: 416, contentRange: `bytes */${SIZE}`, body: 0 });
    }
  });
  it("a bad range: 416", async () => {
    for (const range of ["bytes=abc", "bytes=5-2", "bytes=-", "bytes=1-2-3", "items=0-1", "bytes 0-1", "bytes=0x10-20", "bytes=99999999999999999999-"]) {
      const r = await get(range);
      expect({ status: r.status, contentRange: r.contentRange, body: r.body.length }, range).toEqual({ status: 416, contentRange: `bytes */${SIZE}`, body: 0 });
    }
  });
  it("several ranges at once are not served piecemeal: the whole file, 200 (a server may ignore Range)", async () => {
    const r = await get("bytes=0-1,4-5");
    expect({ status: r.status, ranges: r.ranges, length: r.length }).toEqual({ status: 200, ranges: "bytes", length: String(SIZE) });
    expect(r.body.equals(MP4)).toBe(true);
  });
  it("If-Range with a validator the route never gave: the whole file, 200", async () => {
    const r = await get("bytes=0-1", COLLECTOR, { "if-range": "\"abc\"" });
    expect({ status: r.status, length: r.length }).toEqual({ status: 200, length: String(SIZE) });
  });
  it("the file is never read whole, for any request", async () => {
    for (const range of [undefined, "bytes=0-1", "bytes=-500", "bytes=0-"]) await get(range);
    expect(h.readWhole.filter((p) => p.endsWith(".mp4"))).toEqual([]);
  });
  it("who may open it is decided first: another department's officer or no session gets no range answer and no size", async () => {
    for (const range of ["bytes=0-1", `bytes=${SIZE}-`, "bytes=abc"]) {
      const r = await get(range, { userId: 21, role: "department_officer" });
      expect({ status: r.status, contentRange: r.contentRange, ranges: r.ranges }, range).toEqual({ status: 404, contentRange: null, ranges: null });
      expect((await get(range, null)).status).toBe(401);
    }
  });
  it("a missing file is 404 whatever the range", async () => {
    h.session = COLLECTOR;
    const other = "c-20261112-cccccccccccccccc.mp4";
    const res = await GET(new NextRequest(`http://localhost/api/complaints/media/${other}`, { headers: { range: "bytes=0-1" } }), { params: Promise.resolve({ name: other }) });
    expect(res.status).toBe(404);
  });
});
