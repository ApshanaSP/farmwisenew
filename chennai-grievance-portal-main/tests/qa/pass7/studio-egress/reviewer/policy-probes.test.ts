/**
 * QA pass 7, studio-egress REVIEWER probes (unit level, no Chromium): attack the address policy (netsafe isPrivateIp,
 * fetchurl reachable/allowed/pinnedFetchWith) and the egress proxy directly, the way egress.test.ts does. 127.0.0.1
 * listeners on EPHEMERAL ports only; a recording dial stands in for any real connection so nothing private is touched.
 *   npx vitest run --config vitest.p7.config.ts --maxWorkers=1 tests/qa/pass7/studio-egress/reviewer/policy-probes.test.ts
 */
import http from "node:http";
import net from "node:net";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { startEgress, type Egress } from "@/lib/studio/connect/egress";
import { pinnedFetchWith, reachable, allowed, checkHost } from "@/lib/studio/fetchurl";
import { isPrivateIp } from "@/lib/netsafe";

const env = { ...process.env };
let inner: http.Server, I = 0;

async function recording(lookup: (h: string) => Promise<string[]>) {
  const dialed: string[] = [];
  const looked: string[] = [];
  const e = await startEgress({
    lookup: async (h) => { looked.push(h); return lookup(h); },
    dial: (address, port) => { dialed.push(`${address}:${port}`); const s = new net.Socket(); setImmediate(() => s.destroy(new Error("test: no route"))); return s; }
  });
  return { e, dialed, looked };
}
function viaHttp(p: Egress, url: string, method = "GET"): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port: p.port, method, path: url, headers: { host: (() => { try { return new URL(url).host; } catch { return "x"; } })() }, agent: false }, (res) => {
      let b = ""; res.setEncoding("utf8"); res.on("data", (c) => (b += c)); res.on("end", () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: b }));
    });
    req.on("error", reject); req.end();
  });
}
/** Send a raw request line + headers straight to the proxy port (for origin-form / HTTP-version / smuggling probes). */
function raw(port: number, bytes: string): Promise<string> {
  return new Promise((resolve) => {
    const s = net.connect({ host: "127.0.0.1", port }, () => s.write(bytes));
    let out = ""; s.setEncoding("utf8"); s.on("data", (c) => (out += c));
    s.on("close", () => resolve(out)); s.on("error", () => resolve(out));
    setTimeout(() => { s.destroy(); resolve(out); }, 2000);
  });
}
function viaConnect(p: Egress, authority: string): Promise<number> {
  return new Promise((resolve) => {
    const req = http.request({ host: "127.0.0.1", port: p.port, method: "CONNECT", path: authority, agent: false });
    req.on("connect", (res, sock) => { sock.destroy(); resolve(res.statusCode ?? 0); });
    req.on("error", () => resolve(-1)); req.end();
  });
}

beforeAll(async () => {
  inner = http.createServer((req, res) => { res.writeHead(200); res.end("PRIVATE-REPLY"); });
  await new Promise<void>((r) => inner.listen(0, "127.0.0.1", () => r()));
  I = (inner.address() as net.AddressInfo).port;
});
afterAll(() => { inner?.closeAllConnections?.(); inner?.close(); });
afterEach(() => { for (const k of ["STUDIO_ALLOW_HOSTS", "STUDIO_FIXTURES", "NODE_ENV"]) { if (env[k] === undefined) delete process.env[k]; else process.env[k] = env[k]; } });

// --- classifier: hunt for any private/embedded-private IPv6 or IPv4 form that is wrongly called PUBLIC -----------------
describe("classifier: every private form must be isPrivateIp===true", () => {
  const mustBePrivate = [
    "::ffff:169.254.169.254", "0:0:0:0:0:ffff:169.254.169.254", "::ffff:a9fe:a9fe", "::ffff:0:a9fe:a9fe",
    "2002:a9fe:a9fe::", "2002:7f00:0001::dead:beef", "2002:0a00:0001::", "[::ffff:169.254.169.254]",
    "64:ff9b::a9fe:a9fe", "64:ff9b::169.254.169.254", "64:ff9b:1::1", "100:0:0:0:dead::1",
    "::ffff:10.0.0.1", "::ffff:192.168.0.1", "::ffff:172.16.0.1", "::ffff:100.64.0.1",
    "fc00::1", "fd00:dead:beef::1", "fe80::1", "fec0::1", "ff02::1", "ff05::c3",
    "::1", "::", "::2", "::0.0.0.0", "2001:0:4136::1", "2001:db8::1",
    "169.254.169.254", "10.0.0.5", "127.0.0.1", "172.31.255.255", "192.168.1.1", "100.127.0.0", "0.0.0.0", "192.0.0.1", "198.18.0.1"
  ];
  it.each(mustBePrivate)("%s is private", (ip) => { expect(isPrivateIp(ip), ip).toBe(true); });

  const mustBePublic = ["8.8.8.8", "1.1.1.1", "198.51.100.20", "2606:4700::1111", "2002:808:808::1", "64:ff9b::808:808", "::ffff:8.8.8.8"];
  it.each(mustBePublic)("%s is public", (ip) => { expect(isPrivateIp(ip), ip).toBe(false); });
});

// --- allow-list semantics: host vs host:port, default port, case, trailing dot, brackets -------------------------------
describe("allow-list matching", () => {
  it("a bare-host allow entry opens EVERY port on that host (host vs host:port)", async () => {
    process.env.STUDIO_ALLOW_HOSTS = "127.0.0.1";
    // reachable() returns the loopback address for an arbitrary port the admin never named
    expect(await reachable(new URL(`http://127.0.0.1:${I}/admin`))).toEqual(["127.0.0.1"]);
    expect(allowed(new URL(`http://127.0.0.1:${I}/`))).toBe(true);
    expect(allowed(new URL("http://127.0.0.1:9999/"))).toBe(true);
  });
  it("a host:port allow entry does NOT open other ports on the same host", async () => {
    process.env.STUDIO_ALLOW_HOSTS = `127.0.0.1:${I}`;
    expect(allowed(new URL(`http://127.0.0.1:${I}/`))).toBe(true);
    expect(allowed(new URL(`http://127.0.0.1:${I + 1}/`))).toBe(false);
    await expect(reachable(new URL(`http://127.0.0.1:${I + 1}/`))).rejects.toThrow(/private/i);
  });
  it("trailing dot on an IP literal is normalised away by URL (no validator/connector drift)", async () => {
    process.env.STUDIO_ALLOW_HOSTS = `127.0.0.1:${I}`;
    // new URL() strips the trailing dot of an IPv4 literal -> hostname is exactly 127.0.0.1, same host as the allow entry,
    // and it classifies identically. No extra reach: it IS the allowed host, not a new one.
    expect(new URL(`http://127.0.0.1.:${I}/`).hostname).toBe("127.0.0.1");
    expect(allowed(new URL(`http://127.0.0.1.:${I}/`))).toBe(true);
    // a trailing dot on a *domain* is kept, so it does NOT silently match a bare-domain entry
    process.env.STUDIO_ALLOW_HOSTS = "data.example";
    expect(new URL("http://data.example./").hostname).toBe("data.example.");
    expect(allowed(new URL("http://data.example./"))).toBe(false);
  });
  it("case folding: an uppercase allow entry still matches (documented behaviour)", () => {
    process.env.STUDIO_ALLOW_HOSTS = "EXAMPLE.COM";
    expect(allowed(new URL("http://example.com/"))).toBe(true);
  });
});

// --- proxy: numeric/alternate host encodings and userinfo are refused and NOTHING is dialled -------------------------
describe("proxy refuses alternate encodings of a private host without dialling", () => {
  const forms = ["127.0.0.1", "127.1", "2130706433", "0x7f000001", "0177.0.0.1", "0", "[::1]", "[::ffff:127.0.0.1]", "[0:0:0:0:0:ffff:7f00:1]"];
  it.each(forms)("%s via absolute-form http + CONNECT", async (h) => {
    const { e, dialed } = await recording(async () => ["198.51.100.20"]);
    try {
      expect([400, 403]).toContain((await viaHttp(e, `http://${h}:${I}/x`)).status);
      expect([400, 403]).toContain(await viaConnect(e, `${h}:${I}`));
      expect(dialed).toEqual([]);
    } finally { await e.close(); }
  });
  it("userinfo in absolute-form is refused (never used as a disguise)", async () => {
    const { e, dialed } = await recording(async () => ["198.51.100.20"]);
    try {
      process.env.STUDIO_ALLOW_HOSTS = "evil.example";
      // user part is public-allowed host, but the real host is the private one
      const r = await viaHttp(e, `http://evil.example@127.0.0.1:${I}/x`);
      expect([400, 403]).toContain(r.status);
      expect(dialed).toEqual([]);
    } finally { await e.close(); }
  });
});

// --- proxy raw oddities: origin-form, HTTP/1.0, bad CONNECT ----------------------------------------------------------
describe("proxy raw request oddities", () => {
  it("an origin-form GET (asked as a web server, not a proxy) is 400 and never forwarded", async () => {
    const { e, dialed } = await recording(async () => ["198.51.100.20"]);
    try {
      const out = await raw(e.port, `GET /secret HTTP/1.1\r\nHost: 127.0.0.1:${I}\r\nConnection: close\r\n\r\n`);
      expect(out).toMatch(/400/);
      expect(dialed).toEqual([]);
    } finally { await e.close(); }
  });
  it("absolute-form over HTTP/1.0 to a private host is still policy-checked and refused", async () => {
    const { e, dialed } = await recording(async () => ["198.51.100.20"]);
    try {
      const out = await raw(e.port, `GET http://127.0.0.1:${I}/x HTTP/1.0\r\nHost: 127.0.0.1:${I}\r\n\r\n`);
      expect(out).toMatch(/403|400/);
      expect(out).not.toContain("PRIVATE-REPLY");
      expect(dialed).toEqual([]);
    } finally { await e.close(); }
  });
});

// --- scheme / name gate (checkHost, the early gate visit() uses before any browser starts) --------------------------
describe("scheme and name gate refuses non-http(s), userinfo, and localhost-like names", () => {
  it.each(["file:///etc/passwd", "chrome://net-internals", "view-source:http://127.0.0.1/", "data:text/html,<b>x", "gopher://127.0.0.1:70/", "ftp://127.0.0.1/"])(
    "%s is refused", async (raw) => { await expect(checkHost(new URL(raw))).rejects.toThrow(); });
  it.each(["http://user:pass@data.example/x", "https://admin@127.0.0.1/x"])(
    "userinfo in the link (%s) is refused", async (raw) => { await expect(checkHost(new URL(raw))).rejects.toThrow(/sign-in|user name/i); });
  it.each(["http://localhost:8080/", "http://x.localhost/", "http://printer.local/", "http://metadata.google.internal/", "http://svc.internal/"])(
    "localhost-like name (%s) is refused before any lookup", async (raw) => { await expect(checkHost(new URL(raw))).rejects.toThrow(/private/i); });
});

// --- server-side download: pinned fetch + DNS rebinding -------------------------------------------------------------
describe("plain download (pinnedFetchWith) pins to the checked address", () => {
  it("DNS rebinding public->private: only the public address is connected to, the private listener is never read", async () => {
    let n = 0;
    await expect(pinnedFetchWith(async () => (++n === 1 ? ["198.51.100.20"] : ["127.0.0.1"]), `http://rebind.example:${I}/x`, { signal: AbortSignal.timeout(1500) })).rejects.toThrow();
    expect(n).toBe(1);
  });
  it("a private literal is refused before any connection", async () => {
    await expect(pinnedFetchWith(async () => ["127.0.0.1"], `http://inside.example:${I}/x`)).rejects.toThrow(/private/i);
  });
});
