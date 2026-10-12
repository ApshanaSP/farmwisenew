import { describe, expect, it, vi } from "vitest";
import { UnsafeUrlError, assertPublicUrl, isPrivateIp, safeFetch } from "./netsafe";

const PUBLIC = "93.184.216.34";
const lookup = async (host: string) => (host === "evil-rebind.example" ? ["10.0.0.5"] : [PUBLIC]);
const ok = (body = "hello", init: ResponseInit = {}) => new Response(body, { status: 200, ...init });
const redirect = (to: string, status = 302) => new Response(null, { status, headers: { location: to } });

async function refused(p: Promise<unknown>, code: string) {
  const e = await p.then(() => null, (x) => x);
  expect(e).toBeInstanceOf(UnsafeUrlError);
  expect((e as UnsafeUrlError).code).toBe(code);
}

describe("safe fetching (SEC-003)", () => {
  it.each(["http://169.254.169.254", "http://127.0.0.1", "http://localhost", "http://[::ffff:a9fe:a9fe]",
    "http://[::ffff:169.254.169.254]/latest/meta-data", "http://[::1]:3000", "http://10.1.2.3", "http://[fd00::1]", "http://0.0.0.0",
    "http://2130706433", "http://0x7f.1", "http://[::a9fe:a9fe]", "http://[64:ff9b::a9fe:a9fe]", "http://[::ffff:ac10:1]", "http://app.internal"
  ])("refuses %s without fetching it", async (u) => {
    const f = vi.fn();
    await refused(safeFetch(u, { lookup, fetchImpl: f as unknown as typeof fetch }), "private");
    expect(f).not.toHaveBeenCalled();
  });

  it("refuses a public URL that redirects to a private address, before following it", async () => {
    const f = vi.fn().mockResolvedValueOnce(redirect("http://169.254.169.254/latest/meta-data/"));
    await refused(safeFetch("https://news.example/feed", { lookup, fetchImpl: f as unknown as typeof fetch }), "private");
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("refuses a name whose DNS answer is private", async () => {
    await refused(assertPublicUrl(new URL("https://evil-rebind.example/"), { lookup }), "private");
  });

  it("refuses non-http schemes and credentials in the link", async () => {
    await refused(assertPublicUrl(new URL("file:///etc/passwd"), { lookup }), "invalid");
    await refused(assertPublicUrl(new URL("https://user:pw@news.example/"), { lookup }), "invalid");
  });

  it("fetches public sources and follows public redirects", async () => {
    const f = vi.fn().mockResolvedValueOnce(redirect("/rss", 301)).mockResolvedValueOnce(ok("<rss/>"));
    const r = await safeFetch("https://news.example/feed", { lookup, fetchImpl: f as unknown as typeof fetch });
    expect(r.url).toBe("https://news.example/rss");
    expect(r.buf.toString()).toBe("<rss/>");
    expect(f).toHaveBeenCalledTimes(2);
  });

  it("does not carry a sign-in to another site", async () => {
    const f = vi.fn().mockResolvedValueOnce(redirect("https://cdn.other.example/file.csv")).mockResolvedValueOnce(ok("a,b"));
    await safeFetch("https://dept.example/data", { lookup, fetchImpl: f as unknown as typeof fetch,
      headers: { Authorization: "Bearer t", Cookie: "s=1", "User-Agent": "x" } });
    expect(f.mock.calls[0][1].headers).toMatchObject({ Authorization: "Bearer t", Cookie: "s=1" });
    expect(f.mock.calls[1][1].headers).toEqual({ "User-Agent": "x" });
  });

  it("caps the size and the number of redirects", async () => {
    const big = vi.fn().mockResolvedValue(ok("x".repeat(100)));
    expect((await safeFetch("https://news.example/", { lookup, fetchImpl: big as unknown as typeof fetch, maxBytes: 10 })).truncated).toBe(true);
    const loop = vi.fn().mockImplementation(async () => redirect("https://news.example/again"));
    await refused(safeFetch("https://news.example/", { lookup, fetchImpl: loop as unknown as typeof fetch, maxHops: 3 }), "redirects");
  });

  it("lets an allow-listed private host through (Data Studio's STUDIO_ALLOW_HOSTS)", async () => {
    const f = vi.fn().mockResolvedValue(ok("[]"));
    await safeFetch("http://localhost:4100/api/records", { lookup, fetchImpl: f as unknown as typeof fetch, allow: (u) => u.host === "localhost:4100" });
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("classifies addresses", () => {
    for (const ip of ["8.8.8.8", "93.184.216.34", "2606:4700:4700::1111", "2a00:1450:4001:80b::200e"]) expect(isPrivateIp(ip)).toBe(false);
    for (const ip of ["169.254.169.254", "172.31.255.255", "100.64.0.1", "::ffff:10.0.0.1", "::ffff:a9fe:a9fe", "fe80::1%eth0", "::", "not-an-ip"])
      expect(isPrivateIp(ip)).toBe(true);
  });
});
