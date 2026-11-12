/**
 * The Studio browser's only way out (QA pass 7: redteam-gate-01, redteam-gate-04). The browser is started with this proxy as its
 * proxy server and no bypass, not even for this machine (`<-loopback>`), so every connection a page makes comes through here:
 * navigations, the redirects Chromium follows by itself, form POSTs answered 307 or 308, fetch / XHR / EventSource, WebSockets
 * (CONNECT), workers, iframes, prefetches. Each is decided by the Studio's one address policy (fetchurl.ts reachable(): public
 * addresses only, or a host in STUDIO_ALLOW_HOSTS), and the connection goes to exactly an address the policy returned: the proxy
 * looks the name up once, so a name that answers public to the check and private to the connection reaches nothing.
 *
 * Plain http arrives as an absolute-form request (GET http://host/path) and is forwarded as it is; anything else (https, ws, wss)
 * arrives as CONNECT host:port and becomes a byte tunnel. A refused request is answered 403 (X-Studio-Egress: refused) and no
 * connection is made. A request that comes to this port in origin-form came straight here, not through it as a proxy: the self-test
 * (selfTest) uses that to prove the browser really sends everything here, loopback included, before it reads any page.
 */
import http from "node:http";
import net from "node:net";
import { randomBytes } from "node:crypto";
import type { Duplex } from "node:stream";
import { reachable, type Lookup } from "@/lib/studio/fetchurl";

export interface Egress {
  /** the proxy's address, for the browser's --proxy-server */
  server: string;
  port: number;
  /** a one-time self-test address, and how it was reached ("proxied": through the proxy, as it must; "direct": the browser went round it) */
  probe(): { url: string; seen(): "proxied" | "direct" | null };
  /** what was refused, newest last (for tests and the server log) */
  refused: string[];
  close(): Promise<void>;
}

export interface EgressOpts {
  /** DNS (tests replace it) */
  lookup?: Lookup;
  /** connect to one checked address (tests watch it) */
  dial?: (address: string, port: number) => net.Socket;
}

export const REFUSED_HEADER = "x-studio-egress";
const IDLE_MS = 120_000;
const DIAL_MS = 15_000;
// hop-by-hop headers: about the connection to the proxy, never forwarded
const HOP = /^(connection|keep-alive|proxy-connection|proxy-authorization|proxy-authenticate|te|trailer|upgrade|transfer-encoding)$/i;

/** host:port of a CONNECT (authority-form only), or null. */
function authority(raw: string): { url: URL; port: number } | null {
  const m = raw.match(/^(\[[0-9a-fA-F:.%]+\]|[^\s/\\:@?#[\]]+):(\d{1,5})$/);
  if (!m) return null;
  const port = Number(m[2]);
  if (!(port >= 1 && port <= 65535)) return null;
  // https for the policy: a CONNECT carries TLS or a WebSocket, never the plain-http fixture
  try { return { url: new URL(`https://${m[1]}:${port}`), port }; } catch { return null; }
}

function dialOne(dial: NonNullable<EgressOpts["dial"]>, address: string, port: number): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    const s = dial(address, port);
    const t = setTimeout(() => { s.destroy(); reject(new Error("connect timeout")); }, DIAL_MS);
    s.once("connect", () => { clearTimeout(t); resolve(s); });
    s.once("error", (e) => { clearTimeout(t); s.destroy(); reject(e); });
  });
}

/** The first of the checked addresses that answers. Only these addresses, never the name. */
async function connectTo(dial: NonNullable<EgressOpts["dial"]>, addrs: string[], port: number): Promise<net.Socket> {
  let last: unknown = new Error("no address");
  for (const a of addrs) {
    try { return await dialOne(dial, a, port); } catch (e) { last = e; }
  }
  throw last;
}

export async function startEgress(o: EgressOpts = {}): Promise<Egress> {
  const dial = o.dial ?? ((address: string, port: number) => net.connect({ host: address, port }));
  const probes = new Map<string, "proxied" | "direct" | null>();
  const probeOf = (path: string) => { const m = path.match(/^\/__studio_egress\/([0-9a-f]{32})$/); return m && probes.has(m[1]) ? m[1] : null; };
  const refused: string[] = [];
  const refuse = (what: string, why: string) => {
    refused.push(what);
    if (refused.length > 200) refused.shift();
    console.warn(`[studio] browser request refused (${why}): ${what.slice(0, 200)}`);
  };
  let port = 0;

  const server = http.createServer(async (req, res) => {
    req.on("error", () => {});
    res.on("error", () => {});
    const raw = req.url ?? "";
    if (!/^http:\/\//i.test(raw)) {
      // origin-form: this port was asked as a web server, not as a proxy (the browser went round the proxy, or a stranger)
      const t = probeOf(raw);
      if (t) probes.set(t, "direct");
      res.writeHead(400, { "content-type": "text/plain", connection: "close" }).end("not a proxy request");
      return;
    }
    let u: URL;
    try { u = new URL(raw); } catch { res.writeHead(400, { connection: "close" }).end(); return; }
    // the self-test: this very port, asked through the proxy; answered here, never forwarded
    const t = u.hostname === "127.0.0.1" && Number(u.port) === port && !u.search ? probeOf(u.pathname) : null;
    if (t) {
      probes.set(t, "proxied");
      res.writeHead(200, { "content-type": "text/plain", "cache-control": "no-store" }).end("egress ok");
      return;
    }
    let addrs: string[];
    try { addrs = await reachable(u, o.lookup); } catch (e) {
      refuse(`${req.method} ${u.origin}${u.pathname}`, (e as Error).message);
      req.resume();
      res.writeHead(403, { "content-type": "text/plain", [REFUSED_HEADER]: "refused", connection: "close" }).end("The Studio does not open private network addresses.");
      return;
    }
    const port_ = Number(u.port) || 80;
    let sock: net.Socket;
    try { sock = await connectTo(dial, addrs, port_); } catch {
      req.resume();
      if (!res.headersSent) res.writeHead(502, { "content-type": "text/plain", connection: "close" }).end("The site could not be reached.");
      return;
    }
    const headers: string[] = [];
    for (let k = 0; k + 1 < req.rawHeaders.length; k += 2) if (!HOP.test(req.rawHeaders[k])) headers.push(req.rawHeaders[k], req.rawHeaders[k + 1]);
    if (req.headers["transfer-encoding"]) headers.push("Transfer-Encoding", String(req.headers["transfer-encoding"]));
    headers.push("Connection", "close");
    const up = http.request({ createConnection: () => sock, method: req.method, path: `${u.pathname}${u.search}`, headers, setHost: false });
    up.setTimeout(IDLE_MS, () => up.destroy(new Error("idle")));
    up.on("response", (r) => {
      const back: string[] = [];
      for (let k = 0; k + 1 < r.rawHeaders.length; k += 2) if (!HOP.test(r.rawHeaders[k])) back.push(r.rawHeaders[k], r.rawHeaders[k + 1]);
      try { res.writeHead(r.statusCode ?? 502, r.statusMessage, back); } catch { res.destroy(); r.destroy(); return; }
      r.pipe(res);
      r.on("error", () => res.destroy());
    });
    up.on("error", () => {
      if (!res.headersSent) res.writeHead(502, { "content-type": "text/plain", connection: "close" }).end("The site could not be reached.");
      else res.destroy();
    });
    res.on("close", () => { if (!up.writableEnded || !res.writableFinished) up.destroy(); });
    req.pipe(up);
  });

  server.on("connect", async (req: http.IncomingMessage, client: Duplex, head: Buffer) => {
    client.on("error", () => {});
    const deny = (status: string) => { try { client.end(`HTTP/1.1 ${status}\r\n${REFUSED_HEADER}: refused\r\nContent-Length: 0\r\nConnection: close\r\n\r\n`); } catch { client.destroy(); } };
    const a = authority(req.url ?? "");
    if (!a) { refuse(`CONNECT ${req.url}`, "not host:port"); return deny("400 Bad Request"); }
    let addrs: string[];
    try { addrs = await reachable(a.url, o.lookup); } catch (e) { refuse(`CONNECT ${req.url}`, (e as Error).message); return deny("403 Forbidden"); }
    let up: net.Socket;
    try { up = await connectTo(dial, addrs, a.port); } catch { return deny("502 Bad Gateway"); }
    up.on("error", () => client.destroy());
    client.on("close", () => up.destroy());
    up.on("close", () => client.destroy());
    up.setTimeout(IDLE_MS, () => up.destroy());
    client.write("HTTP/1.1 200 Connection Established\r\n\r\n");
    if (head?.length) up.write(head);
    up.pipe(client);
    client.pipe(up);
  });

  // an Upgrade in absolute-form (a WebSocket without CONNECT): Chromium never sends one; refused rather than half handled
  server.on("upgrade", (req: http.IncomingMessage, sock: Duplex) => {
    refuse(`UPGRADE ${req.url}`, "upgrade without CONNECT");
    try { sock.end(`HTTP/1.1 403 Forbidden\r\n${REFUSED_HEADER}: refused\r\nContent-Length: 0\r\nConnection: close\r\n\r\n`); } catch { sock.destroy(); }
  });
  server.on("clientError", (_e, sock: Duplex) => { try { sock.end("HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n"); } catch { sock.destroy(); } });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => { server.off("error", reject); resolve(); });
  });
  port = (server.address() as net.AddressInfo).port;
  server.unref();

  return {
    server: `http://127.0.0.1:${port}`,
    port,
    probe() {
      const t = randomBytes(16).toString("hex");
      probes.set(t, null);
      return { url: `http://127.0.0.1:${port}/__studio_egress/${t}`, seen: () => probes.get(t) ?? null };
    },
    refused,
    close: () => new Promise<void>((resolve) => { server.closeAllConnections?.(); server.close(() => resolve()); })
  };
}

declare global {
  // eslint-disable-next-line no-var
  var __studioEgress: Promise<Egress> | undefined;
}

/** The one proxy of this server process, started on first use and kept (it costs one idle listening port on 127.0.0.1). */
export function egress(): Promise<Egress> {
  if (!global.__studioEgress) {
    global.__studioEgress = startEgress().catch((e) => { global.__studioEgress = undefined; throw e; });
  }
  return global.__studioEgress;
}
