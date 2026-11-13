/**
 * QA pass 7, studio-egress: the Studio browser's egress proxy (src/lib/studio/connect/egress.ts) and the one address policy it shares
 * with plain downloads (fetchurl.ts reachable / pinnedFetchWith). Plain Node clients speak to the proxy as Chromium does (absolute-form
 * http, CONNECT for everything else). 127.0.0.1 listeners on ephemeral ports only; the fixture port 4599 is never connected to (a
 * recording dial stands in).
 *   npx vitest run --config vitest.p7.config.ts tests/qa/pass7/studio-egress/egress.test.ts
 */
import http from "node:http";
import net from "node:net";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { startEgress, type Egress } from "@/lib/studio/connect/egress";
import { pinnedFetchWith, reachable } from "@/lib/studio/fetchurl";
import { isPrivateIp } from "@/lib/netsafe";

const hits: string[] = [];
let inner: http.Server, site: http.Server, I = 0, S = 0;
let real: Egress;
const env = { ...process.env };
const setEnv = (k: string, v: string) => { (process.env as Record<string, string>)[k] = v; };

/** an egress whose DNS and connections are the test's: what it connected to is recorded, and every connection fails at once */
async function recording(lookup: (h: string) => Promise<string[]>) {
  const dialed: string[] = [];
  const looked: string[] = [];
  const e = await startEgress({
    lookup: async (h) => { looked.push(h); return lookup(h); },
    dial: (address, port) => { dialed.push(`${address}:${port}`); const s = new net.Socket(); setImmediate(() => s.destroy(new Error("test: no route"))); return s; }
  });
  return { e, dialed, looked };
}

/** an absolute-form request through the proxy, as Chromium sends plain http */
function viaHttp(p: Egress, url: string, method = "GET", body?: string): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port: p.port, method, path: url, headers: { host: (() => { try { return new URL(url).host; } catch { return "x"; } })(), ...(body ? { "content-type": "text/plain" } : {}) }, agent: false }, (res) => {
      let b = "";
      res.setEncoding("utf8");
      res.on("data", (c) => (b += c));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: b }));
    });
    req.on("error", reject);
    req.end(body);
  });
}

/** a CONNECT through the proxy (https, ws, wss); on 200 the tunnel is used for one plain request */
function viaConnect(p: Egress, authority: string, then?: string): Promise<{ status: number; reply: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port: p.port, method: "CONNECT", path: authority, agent: false });
    req.on("connect", (res, sock) => {
      if (res.statusCode !== 200 || !then) { sock.destroy(); resolve({ status: res.statusCode ?? 0, reply: "" }); return; }
      let b = "";
      sock.setEncoding("utf8");
      sock.on("data", (c) => (b += c));
      sock.on("end", () => resolve({ status: 200, reply: b }));
      sock.on("error", () => resolve({ status: 200, reply: b }));
      sock.write(then);
    });
    req.on("error", reject);
    req.end();
  });
}

beforeAll(async () => {
  inner = http.createServer((req, res) => { hits.push(`${req.method} ${req.url}`); res.writeHead(200, { "content-type": "text/plain" }); res.end("secret-from-internal-service"); });
  site = http.createServer((req, res) => {
    if (req.url === "/to-inner") { res.writeHead(307, { location: `http://127.0.0.1:${I}/after-307` }); res.end(); return; }
    let b = "";
    req.on("data", (c) => (b += c));
    req.on("end", () => { res.writeHead(200, { "content-type": "text/plain", "x-host-seen": String(req.headers.host) }); res.end(`public ${req.method} ${b}`); });
  });
  await new Promise<void>((r) => inner.listen(0, "127.0.0.1", () => r()));
  await new Promise<void>((r) => site.listen(0, "127.0.0.1", () => r()));
  I = (inner.address() as net.AddressInfo).port;
  S = (site.address() as net.AddressInfo).port;
  real = await startEgress();
});
afterAll(async () => {
  await real?.close();
  for (const s of [inner, site]) { s.closeAllConnections?.(); s.close(); }
});
afterEach(() => {
  for (const k of ["STUDIO_ALLOW_HOSTS", "STUDIO_FIXTURES", "NODE_ENV"]) { if (env[k] === undefined) delete process.env[k]; else process.env[k] = env[k]; }
  hits.length = 0;
});

describe("the egress proxy lets the allowed site through and refuses the private one", () => {
  it("plain http (absolute-form): the allowed host answers, the private one is refused with 403 and never reached", async () => {
    process.env.STUDIO_ALLOW_HOSTS = `127.0.0.1:${S}`;
    const ok = await viaHttp(real, `http://127.0.0.1:${S}/page`);
    expect(ok.status).toBe(200);
    expect(ok.body).toBe("public GET ");
    expect(ok.headers["x-host-seen"]).toBe(`127.0.0.1:${S}`);
    const no = await viaHttp(real, `http://127.0.0.1:${I}/admin`);
    expect(no.status).toBe(403);
    expect(no.headers["x-studio-egress"]).toBe("refused");
    expect(hits).toEqual([]);
  });

  it("POST: a body reaches the allowed host; a POST to the private one is refused; a 307 is handed back, never followed by the proxy", async () => {
    process.env.STUDIO_ALLOW_HOSTS = `127.0.0.1:${S}`;
    expect((await viaHttp(real, `http://127.0.0.1:${S}/form`, "POST", "a=1")).body).toBe("public POST a=1");
    expect((await viaHttp(real, `http://127.0.0.1:${I}/post-admin`, "POST", "a=1")).status).toBe(403);
    const r = await viaHttp(real, `http://127.0.0.1:${S}/to-inner`, "POST", "a=1");
    expect(r.status).toBe(307);
    // the browser's next request (to the Location) comes back through the proxy and is refused there
    expect((await viaHttp(real, String(r.headers.location), "POST", "a=1")).status).toBe(403);
    expect(hits).toEqual([]);
  });

  it("CONNECT (https, ws, wss): a tunnel to the allowed host carries bytes; one to the private host is refused before any connection", async () => {
    process.env.STUDIO_ALLOW_HOSTS = `127.0.0.1:${S}`;
    const ok = await viaConnect(real, `127.0.0.1:${S}`, `GET /tunnel HTTP/1.1\r\nHost: 127.0.0.1:${S}\r\nConnection: close\r\n\r\n`);
    expect(ok.status).toBe(200);
    expect(ok.reply).toContain("public GET");
    expect((await viaConnect(real, `127.0.0.1:${I}`, "GET / HTTP/1.1\r\n\r\n")).status).toBe(403);
    expect((await viaConnect(real, `localhost:${I}`)).status).toBe(403);
    expect(hits).toEqual([]);
  });

  it("an Upgrade without CONNECT and a request in origin-form (the proxy asked as a web server) are refused", async () => {
    process.env.STUDIO_ALLOW_HOSTS = `127.0.0.1:${S}`;
    const up = await new Promise<number>((resolve) => {
      const req = http.request({ host: "127.0.0.1", port: real.port, path: `http://127.0.0.1:${S}/ws`, headers: { connection: "upgrade", upgrade: "websocket", "sec-websocket-key": "x", "sec-websocket-version": "13" }, agent: false });
      req.on("upgrade", (res, sock) => { sock.destroy(); resolve(res.statusCode ?? 0); });
      req.on("response", (res) => { res.resume(); resolve(res.statusCode ?? 0); });
      req.on("error", () => resolve(-1));
      req.end();
    });
    expect(up).not.toBe(101);
    const plain = await new Promise<number>((resolve) => http.get({ host: "127.0.0.1", port: real.port, path: "/", agent: false }, (res) => { res.resume(); resolve(res.statusCode ?? 0); }).on("error", () => resolve(-1)));
    expect(plain).toBe(400);
  });
});

describe("addresses: every form of a private address is refused, and nothing is dialled", () => {
  const forms = [
    "127.0.0.1", "127.1", "2130706433", "0x7f000001", "0x7f.1", "0177.0.0.1", "017700000001", "0.0.0.0", "0", "10.0.0.5", "172.16.0.1", "192.168.1.10",
    "169.254.169.254", "100.64.0.1", "224.0.0.1", "255.255.255.255", "[::1]", "[::]", "[0:0:0:0:0:0:0:1]", "[::ffff:127.0.0.1]", "[::ffff:7f00:1]",
    "[0:0:0:0:0:ffff:127.0.0.1]", "[::127.0.0.1]", "[::ffff:0:127.0.0.1]", "[::ffff:a9fe:a9fe]", "[64:ff9b::7f00:1]", "[64:ff9b:1::a00:1]",
    "[2002:7f00:1::]", "[2002:c0a8:101::1]", "[2001:0:4136:e378:8000:63bf:3fff:fdd2]", "[fe80::1]", "[fc00::1]", "[fd12:3456::1]", "[fec0::1]", "[ff02::1]", "[100::1]"
  ];
  it.each(forms)("%s (absolute-form and CONNECT)", async (h) => {
    const { e, dialed } = await recording(async () => ["198.51.100.20"]);
    try {
      const a = await viaHttp(e, `http://${h}:${I}/x`);
      expect([400, 403]).toContain(a.status);
      const c = await viaConnect(e, `${h}:${I}`);
      expect([400, 403]).toContain(c.status);
      expect(dialed).toEqual([]);
    } finally { await e.close(); }
  });

  it("names for this machine or the inside network are refused before any lookup", async () => {
    const { e, dialed, looked } = await recording(async () => ["198.51.100.20"]);
    try {
      for (const h of ["localhost", "LOCALHOST", "x.localhost", "metadata.google.internal", "printer.local"]) {
        expect((await viaHttp(e, `http://${h}:${I}/x`)).status).toBe(403);
        expect((await viaConnect(e, `${h}:443`)).status).toBe(403);
      }
      expect(dialed).toEqual([]);
      expect(looked).toEqual([]);
    } finally { await e.close(); }
  });

  it("a name with any private answer among its addresses is refused", async () => {
    const { e, dialed } = await recording(async () => ["198.51.100.20", "127.0.0.1"]);
    try {
      expect((await viaHttp(e, `http://mixed.example:${I}/x`)).status).toBe(403);
      expect((await viaConnect(e, `mixed.example:443`)).status).toBe(403);
      expect(dialed).toEqual([]);
    } finally { await e.close(); }
  });

  it("DNS rebinding: the name is looked up once, and only the address that was checked is connected to", async () => {
    let n = 0;
    const { e, dialed, looked } = await recording(async () => (++n === 1 ? ["198.51.100.20"] : ["127.0.0.1"]));
    try {
      const r = await viaHttp(e, `http://rebind.example:${I}/x`);
      expect(r.status).toBe(502); // the checked public address does not answer here; the private one is never tried
      expect(looked).toEqual(["rebind.example"]);
      expect(dialed).toEqual([`198.51.100.20:${I}`]);
      n = 0;
      expect((await viaConnect(e, `rebind.example:${I}`)).status).toBe(502);
      expect(dialed).toEqual([`198.51.100.20:${I}`, `198.51.100.20:${I}`]);
      expect(hits).toEqual([]);
    } finally { await e.close(); }
  });

  it("the classifier: forms of IPv4 inside IPv6 that embed a private address", () => {
    for (const ip of ["::ffff:0:127.0.0.1", "2002:7f00:1::", "2002:a00:1::1", "2001:0:4136:e378:8000:63bf:3fff:fdd2", "64:ff9b:1::1", "100::1"]) expect(isPrivateIp(ip), ip).toBe(true);
    for (const ip of ["2002:808:808::1", "64:ff9b::808:808", "2606:4700::1111", "8.8.8.8"]) expect(isPrivateIp(ip), ip).toBe(false);
  });
});

describe("the test fixture host (127.0.0.1:4599) is never allowed in production", () => {
  const F = "http://127.0.0.1:4599/datasets/x.csv";
  it("refused without STUDIO_FIXTURES; allowed over http only with it, outside production; never by STUDIO_ALLOW_HOSTS", async () => {
    const { e, dialed } = await recording(async () => []);
    try {
      delete process.env.STUDIO_FIXTURES;
      expect((await viaHttp(e, F)).status).toBe(403);
      process.env.STUDIO_ALLOW_HOSTS = "127.0.0.1:4599,127.0.0.1";
      expect((await viaHttp(e, F)).status).toBe(403);
      expect(dialed).toEqual([]);
      process.env.STUDIO_FIXTURES = "1";
      setEnv("NODE_ENV", "test");
      expect((await viaHttp(e, F)).status).toBe(502); // allowed: the recording dial answers for the fixture server
      expect(dialed).toEqual(["127.0.0.1:4599"]);
      expect((await viaConnect(e, "127.0.0.1:4599")).status).toBe(403); // http only
      setEnv("NODE_ENV", "production");
      expect((await viaHttp(e, F)).status).toBe(403);
      expect((await viaConnect(e, "127.0.0.1:4599")).status).toBe(403);
      expect(dialed).toEqual(["127.0.0.1:4599"]);
    } finally { await e.close(); }
  });
  it("the shared policy says the same for a plain download", async () => {
    process.env.STUDIO_FIXTURES = "1";
    setEnv("NODE_ENV", "production");
    process.env.STUDIO_ALLOW_HOSTS = "127.0.0.1:4599";
    await expect(reachable(new URL(F))).rejects.toThrow(/private network/);
    setEnv("NODE_ENV", "test");
    await expect(reachable(new URL(F))).resolves.toEqual(["127.0.0.1"]);
  });
});

describe("a plain download (fetchurl.ts) connects to the address the policy checked", () => {
  it("an allowed name is looked up once by the policy, and the connection goes to that answer (the system DNS is never asked)", async () => {
    process.env.STUDIO_ALLOW_HOSTS = `data.example:${S}`;
    const looked: string[] = [];
    const res = await pinnedFetchWith(async (h) => { looked.push(h); return ["127.0.0.1"]; }, `http://data.example:${S}/file.csv`);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("public GET ");
    expect(res.headers.get("x-host-seen")).toBe(`data.example:${S}`);
    expect(looked).toEqual(["data.example"]);
  });
  it("DNS rebinding: checked public, then private; the private address is never connected to", async () => {
    let n = 0;
    const lookup = async () => (++n === 1 ? ["198.51.100.20"] : ["127.0.0.1"]);
    await expect(pinnedFetchWith(lookup, `http://rebind.example:${I}/x`, { signal: AbortSignal.timeout(1500) })).rejects.toThrow();
    expect(n).toBe(1);
    expect(hits).toEqual([]);
  });
  it("a private address is refused before any connection", async () => {
    await expect(pinnedFetchWith(async () => ["127.0.0.1"], `http://inside.example:${I}/x`)).rejects.toThrow(/private network/);
    await expect(pinnedFetchWith(async () => [], `http://[::ffff:7f00:1]:${I}/x`)).rejects.toThrow(/private network/);
    expect(hits).toEqual([]);
  });
});
