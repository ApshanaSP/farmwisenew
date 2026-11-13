/**
 * QA pass 7, studio-egress: redteam-gate-01 and redteam-gate-04 (the Studio's headless browser reached a private address through a
 * redirect Chromium follows by itself: a second answer to the same GET, a form POST answered 307 or 308), and the mechanism that closes
 * them: the browser runs behind the egress proxy (connect/egress.ts) with no bypass. The last test opens pages in a bare context of
 * the fenced browser (no route, no init script) to show that the proxy alone holds: workers, WebRTC, WebTransport, beacons, Service
 * Workers, iframes, prefetches, numeric and IPv6 hosts.
 * Real Chromium (Playwright's headless shell); 127.0.0.1 listeners on ephemeral ports only.
 *   npx vitest run --config vitest.p7.config.ts tests/qa/pass7/studio-egress/browser-fence.test.ts
 */
import http from "node:http";
import net from "node:net";
import dgram from "node:dgram";
import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const SECRET = "secret-from-internal-service";
const hits: string[] = [];
const seen: Record<string, number> = {};
let site: http.Server, inner: http.Server, turn: net.Server, udp: dgram.Socket;
let A = 0, B = 0, T = 0, U = 0;

const allowedHits: string[] = [];
function wsAccept(tag: string, msg: string) {
  return (req: http.IncomingMessage, socket: import("node:stream").Duplex) => {
    (tag === "private" ? hits : allowedHits).push(`${tag} websocket ${req.url}`);
    const accept = createHash("sha1").update(String(req.headers["sec-websocket-key"]) + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").digest("base64");
    socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
    const b = Buffer.from(msg);
    socket.write(Buffer.concat([Buffer.from([0x81, b.length]), b]));
  };
}

const page = (body: string) => `<!doctype html><html><head><title>open data</title></head><body><table><tr><th>a</th></tr><tr><td>1</td></tr></table><div id="out"></div>${body}</body></html>`;

// everything a page can do to open a connection, with the in-page layers out of the way
const BARE = () => page(`
<link rel="prefetch" href="http://127.0.0.1:${B}/prefetch"><link rel="preconnect" href="http://127.0.0.1:${B}">
<img src="http://127.0.0.1:${B}/img.png"><iframe src="http://127.0.0.1:${B}/frame"></iframe>
<script>
  const out = (s) => { document.getElementById("out").textContent += s + " | "; };
  const W = ${JSON.stringify(`try{const ws=new WebSocket("ws://127.0.0.1:${B}/worker-ws");ws.onmessage=(e)=>postMessage("worker ws said: "+e.data)}catch(e){}
    fetch("http://127.0.0.1:${B}/worker-fetch").then((r)=>r.text()).then((t)=>postMessage("worker fetch read: "+t),()=>postMessage("worker fetch blocked"));`)};
  const S = ${JSON.stringify(`onconnect=(c)=>{const p=c.ports[0];try{const ws=new WebSocket("ws://127.0.0.1:${B}/shared-ws");ws.onmessage=(e)=>p.postMessage("shared ws said: "+e.data)}catch(e){}}`)};
  try { const w = new Worker(URL.createObjectURL(new Blob([W], { type: "text/javascript" }))); w.onmessage = (e) => out(e.data); } catch (e) { out("worker threw " + e); }
  try { const s = new SharedWorker(URL.createObjectURL(new Blob([S], { type: "text/javascript" }))); s.port.onmessage = (e) => out(e.data); s.port.start(); } catch (e) { out("shared threw " + e); }
  try { const ws = new WebSocket("ws://127.0.0.1:${B}/page-ws"); ws.onmessage = (e) => out("page ws said: " + e.data); } catch (e) {}
  try { const ok = new WebSocket("ws://127.0.0.1:${A}/allowed-ws"); ok.onmessage = (e) => out("allowed ws said: " + e.data); } catch (e) {}
  try {
    const pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:127.0.0.1:${U}" }, { urls: "turn:127.0.0.1:${T}?transport=tcp", username: "u", credential: "p" }] });
    pc.createDataChannel("x"); pc.createOffer().then((o) => pc.setLocalDescription(o)); out("rtc started");
  } catch (e) { out("rtc threw " + e); }
  try { const wt = new WebTransport("https://127.0.0.1:${U}/wt"); wt.ready.then(() => out("wt ready"), () => out("wt failed")); } catch (e) { out("wt threw " + e); }
  try { navigator.sendBeacon("http://127.0.0.1:${B}/beacon", "x"); } catch (e) {}
  try { const es = new EventSource("http://127.0.0.1:${B}/sse"); es.onmessage = (e) => out("sse said: " + e.data); } catch (e) {}
  fetch("/redirect-get").then((r) => r.text()).then((t) => out("redirected get read: " + t), () => out("redirected get blocked"));
  fetch("/redirect-post", { method: "POST", body: "a=1" }).then((r) => r.text()).then((t) => out("redirected post read: " + t), () => out("redirected post blocked"));
  for (const h of ["[::1]", "[::ffff:127.0.0.1]", "2130706433", "0x7f.1", "0177.0.0.1", "0.0.0.0", "localhost"])
    fetch("http://" + h + ":${B}/numeric-" + encodeURIComponent(h), { mode: "no-cors" }).then(() => out("numeric ok " + h), () => out("numeric blocked " + h));
  if (navigator.serviceWorker) navigator.serviceWorker.register("/sw.js").then(() => out("sw registered"), (e) => out("sw failed"));
</script>`);
const SW = () => `self.addEventListener("install", (e) => { self.skipWaiting(); e.waitUntil(fetch("http://127.0.0.1:${B}/sw-fetch", { mode: "no-cors" }).catch(() => {})); });`;

beforeAll(async () => {
  process.env.STUDIO_BROWSER_PATH = path.join(process.env.LOCALAPPDATA ?? os.homedir(), "ms-playwright", "chromium_headless_shell-1243", "chrome-headless-shell-win64", "chrome-headless-shell.exe");
  inner = http.createServer((req, res) => {
    hits.push(`http ${req.method} ${req.url}`);
    if (req.url === "/sse") { res.writeHead(200, { "content-type": "text/event-stream", "access-control-allow-origin": "*" }); res.end(`data: ${SECRET}\n\n`); return; }
    res.writeHead(200, { "content-type": "text/html", "access-control-allow-origin": "*" });
    res.end(`<html><body><table><tr><th>k</th></tr><tr><td>${SECRET}</td></tr></table></body></html>`);
  });
  inner.on("upgrade", wsAccept("private", SECRET));
  site = http.createServer((req, res) => {
    const n = (seen[req.url ?? ""] = (seen[req.url ?? ""] ?? 0) + 1);
    const inward = (code: number, p: string) => { res.writeHead(code, { location: `http://127.0.0.1:${B}${p}`, "access-control-allow-origin": "*" }); res.end(); };
    // redteam-gate-01: a page that is harmless the first time it is asked and redirects inward every later time; it asks for itself again
    if (req.url === "/flip") {
      if (n >= 2) return inward(302, "/admin");
      res.writeHead(200, { "content-type": "text/html" }); res.end(page(`<meta http-equiv="refresh" content="0;url=/flip">`)); return;
    }
    // redteam-gate-04: a form that posts itself to an address answering 307 or 308 inward; a fetch() POST the same
    if (req.url === "/form307" || req.url === "/form308") {
      res.writeHead(200, { "content-type": "text/html" });
      res.end(page(`<form id="f" method="post" action="/go${req.url.slice(5)}"><input name="a" value="1"></form><script>document.getElementById("f").submit()</script>`)); return;
    }
    if (req.method === "POST" && req.url === "/go307") return inward(307, "/post-admin");
    if (req.method === "POST" && req.url === "/go308") return inward(308, "/post-admin");
    if (req.url === "/redirect-get") return inward(302, "/redirect-get-target");
    if (req.url === "/redirect-post") return inward(307, "/redirect-post-target");
    if (req.url === "/fetch-post") {
      res.writeHead(200, { "content-type": "text/html" });
      res.end(page(`<script>fetch("/redirect-post", { method: "POST", body: "a=1" }).then((r) => r.text()).then((t) => { document.getElementById("out").textContent = "read: " + t; }, () => {});</script>`)); return;
    }
    if (req.url === "/bare") { res.writeHead(200, { "content-type": "text/html" }); res.end(BARE()); return; }
    if (req.url === "/sw.js") { res.writeHead(200, { "content-type": "text/javascript" }); res.end(SW()); return; }
    res.writeHead(200, { "content-type": "text/html" }); res.end(page(""));
  });
  site.on("upgrade", wsAccept("allowed", "public-hello"));
  turn = net.createServer((s) => { hits.push("tcp (TURN)"); s.destroy(); });
  udp = dgram.createSocket("udp4");
  udp.on("message", () => { if (!hits.includes("udp (STUN or QUIC)")) hits.push("udp (STUN or QUIC)"); });
  await new Promise<void>((r) => inner.listen(0, "::", () => r())); // both 127.0.0.1 and ::1
  await new Promise<void>((r) => site.listen(0, "127.0.0.1", () => r()));
  await new Promise<void>((r) => turn.listen(0, "127.0.0.1", () => r()));
  await new Promise<void>((r) => udp.bind(0, "127.0.0.1", () => r()));
  A = (site.address() as net.AddressInfo).port; B = (inner.address() as net.AddressInfo).port;
  T = (turn.address() as net.AddressInfo).port; U = (udp.address() as net.AddressInfo).port;
  process.env.STUDIO_ALLOW_HOSTS = `127.0.0.1:${A}`;
}, 30_000);

afterAll(async () => {
  const g = (global as { __studioBrowser?: { browser: { close(): Promise<void> } } }).__studioBrowser;
  await g?.browser.close().catch(() => {});
  for (const s of [site, inner]) { s?.closeAllConnections?.(); s?.close(); }
  turn?.close(); udp?.close();
}, 30_000);

async function read(url: string): Promise<{ html: string; error: string | null }> {
  const { visit } = await import("@/lib/studio/connect/browser");
  try { const v = await visit(url); return { html: v.html, error: null }; } catch (e) { return { html: "", error: String(e) }; }
}

describe("redteam-gate-01 and -04: redirects Chromium follows by itself go through the proxy", () => {
  it("a page that is 200 the first time and 302 inward the next (it asks for itself again): the inward hop is refused", async () => {
    const before = hits.length;
    const r = await read(`http://127.0.0.1:${A}/flip`);
    await new Promise((res) => setTimeout(res, 800));
    console.log("FLIP:", r.error ?? "read", "| seen", seen["/flip"], "| hits", JSON.stringify(hits.slice(before)));
    expect(seen["/flip"]).toBeGreaterThanOrEqual(2); // the inward answer was given
    expect(hits.slice(before)).toEqual([]);
    expect(r.html).not.toContain(SECRET);
  }, 60_000);

  it.each(["/form307", "/form308"])("a form POST answered %s inward is refused, and visit() says so", async (p) => {
    const before = hits.length;
    const r = await read(`http://127.0.0.1:${A}${p}`);
    console.log(p, r.error ?? "read", JSON.stringify(hits.slice(before)));
    expect(hits.slice(before)).toEqual([]);
    expect(r.html).not.toContain(SECRET);
    expect(r.error ?? "").toMatch(/private network address/);
  }, 60_000);

  it("a fetch() POST answered 307 inward is refused; the page itself is still read", async () => {
    const before = hits.length;
    const r = await read(`http://127.0.0.1:${A}/fetch-post`);
    expect(r.error).toBeNull();
    expect(r.html).toContain("<td>1</td>");
    expect(hits.slice(before)).toEqual([]);
    expect(r.html).not.toContain(SECRET);
  }, 60_000);
});

describe("the proxy alone holds: a bare context of the fenced browser (no route, no init script)", () => {
  it("workers, shared workers, WebSockets, WebRTC, WebTransport, beacons, EventSource, iframes, prefetch, redirects, numeric and IPv6 hosts, a Service Worker: nothing reaches the private listeners; the allowed WebSocket still works", async () => {
    const { browserReady } = await import("@/lib/studio/connect/browser");
    expect(await browserReady()).toBe(true);
    const browser = (global as { __studioBrowser?: { browser: import("playwright-core").Browser } }).__studioBrowser!.browser;
    const ctx = await browser.newContext();
    const before = hits.length;
    try {
      const p = await ctx.newPage();
      await p.goto(`http://127.0.0.1:${A}/bare`, { waitUntil: "domcontentloaded" });
      await p.waitForTimeout(4000);
      const said = (await p.locator("#out").textContent()) ?? "";
      console.log("BARE SAID:", said, "\nBARE HITS:", JSON.stringify(hits.slice(before)));
      expect(said).toContain("allowed ws said: public-hello"); // the fence is not a wall: the allowed host works, WebSocket included
      expect(said).not.toContain(SECRET);
      expect(hits.slice(before)).toEqual([]);
      expect(allowedHits).toContain("allowed websocket /allowed-ws");
    } finally { await ctx.close().catch(() => {}); }
  }, 90_000);
});
