// QA pass 6, P6-029: reviewer 5's cases on c614e0d, copied from tests/qa/pass6/probes/reviewer5/studio-browser-bypass.test.ts (127.0.0.1 listeners only).
//   QA_PIN_PORT=3197 npx vitest run --config vitest.qa4.config.ts tests/qa/pass4/p6-studio-browser-bypass.test.ts
// reviewer5 probe on P6-017 (c614e0d): other ways a page the Studio's headless browser opens reaches a private address.
// Real headless Chromium. 127.0.0.1 listeners only: 3154 = the allowed "public" site, 3155 = private HTTP/WS service,
// 3156 = private TCP port (TURN over TCP), 3157 = private UDP port (STUN).
//   npx vitest run --config vitest.p6probe.config.ts tests/qa/pass6/probes/reviewer5/studio-browser-bypass.test.ts
import http from "node:http";
import net from "node:net";
import dgram from "node:dgram";
import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const hits: string[] = [];
let site: http.Server, inner: http.Server, tcp: net.Server, udp: dgram.Socket;

const WORKER = `
  try { const ws = new WebSocket("ws://127.0.0.1:3155/worker-ws"); ws.onmessage = (e) => postMessage("worker ws said: " + e.data); ws.onerror = () => postMessage("worker ws error"); } catch (e) { postMessage("worker ws threw " + e); }
  fetch("http://127.0.0.1:3155/worker-fetch").then((r) => r.text()).then((t) => postMessage("worker fetch read: " + t), () => postMessage("worker fetch blocked"));
`;
const PAGE = `<!doctype html><html><head><title>open data</title>
<link rel="prefetch" href="http://127.0.0.1:3155/prefetch">
</head><body><table id="t"><tr><th>a</th></tr><tr><td>1</td></tr></table><div id="out"></div>
<script>
  const out = (s) => { document.getElementById("out").textContent += s + " | "; };
  // 1. a fetch to the allowed site that redirects to the private one
  fetch("/redirect-fetch").then((r) => r.text()).then((t) => out("redirected fetch read: " + t), () => out("redirected fetch blocked"));
  // 2. a dedicated Worker (blob:) that opens a WebSocket and a fetch
  try { const w = new Worker(URL.createObjectURL(new Blob([${JSON.stringify(WORKER)}], { type: "text/javascript" }))); w.onmessage = (e) => out(e.data); } catch (e) { out("worker threw " + e); }
  // 3. WebRTC: TURN over TCP and STUN over UDP to private ports
  try {
    const pc = new RTCPeerConnection({ iceServers: [{ urls: "turn:127.0.0.1:3156?transport=tcp", username: "u", credential: "p" }, { urls: "stun:127.0.0.1:3157" }] });
    pc.createDataChannel("x"); pc.createOffer().then((o) => pc.setLocalDescription(o)); out("rtc started");
  } catch (e) { out("rtc threw " + e); }
  // 4. EventSource
  try { const es = new EventSource("http://127.0.0.1:3155/sse"); es.onmessage = (e) => out("sse said: " + e.data); es.onerror = () => out("sse error"); } catch (e) { out("sse threw"); }
  // 5. iframe srcdoc with its own WebSocket
  const f = document.createElement("iframe");
  f.srcdoc = "<script>try{const ws=new WebSocket('ws://127.0.0.1:3155/srcdoc-ws');ws.onmessage=(e)=>parent.postMessage('srcdoc ws said: '+e.data,'*')}catch(e){}<\\/script>";
  window.addEventListener("message", (e) => out(String(e.data)));
  document.body.appendChild(f);
  // 6. IPv6 / numeric forms of loopback through fetch
  for (const h of ["[::1]", "[::ffff:127.0.0.1]", "2130706433", "0x7f.1", "0.0.0.0"]) fetch("http://" + h + ":3155/numeric-" + encodeURIComponent(h), { mode: "no-cors" }).then(() => out("numeric ok " + h), () => out("numeric blocked " + h));
</script></body></html>`;

function wsAccept(req: http.IncomingMessage, socket: import("node:stream").Duplex) {
  hits.push(`websocket ${req.url}`);
  const key = String(req.headers["sec-websocket-key"]);
  const accept = createHash("sha1").update(key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").digest("base64");
  socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
  const msg = Buffer.from("secret-from-internal-service");
  socket.write(Buffer.concat([Buffer.from([0x81, msg.length]), msg]));
}

beforeAll(async () => {
  process.env.STUDIO_ALLOW_HOSTS = "127.0.0.1:3154";
  process.env.STUDIO_BROWSER_PATH = path.join(process.env.LOCALAPPDATA ?? os.homedir(), "ms-playwright", "chromium_headless_shell-1243", "chrome-headless-shell-win64", "chrome-headless-shell.exe");
  site = http.createServer((req, res) => {
    if (req.url === "/redirect-fetch") { res.writeHead(302, { location: "http://127.0.0.1:3155/redirect-fetch-target", "access-control-allow-origin": "*" }); res.end(); return; }
    if (req.url === "/redirect-nav") { res.writeHead(302, { location: "http://127.0.0.1:3155/redirect-nav-target" }); res.end(); return; }
    res.writeHead(200, { "content-type": "text/html" }); res.end(PAGE);
  });
  inner = http.createServer((req, res) => {
    hits.push(`http ${req.url}`);
    if (req.url === "/sse") { res.writeHead(200, { "content-type": "text/event-stream", "access-control-allow-origin": "*" }); res.end("data: secret-from-internal-service\n\n"); return; }
    res.writeHead(200, { "content-type": "text/html", "access-control-allow-origin": "*" }); res.end("<html><body><table><tr><th>k</th></tr><tr><td>secret-from-internal-service</td></tr></table></body></html>");
  });
  inner.on("upgrade", wsAccept);
  tcp = net.createServer((s) => { hits.push("tcp 3156 (TURN)"); s.destroy(); });
  udp = dgram.createSocket("udp4");
  udp.on("message", () => { if (!hits.includes("udp 3157 (STUN)")) hits.push("udp 3157 (STUN)"); });
  await new Promise<void>((r) => site.listen(3154, "127.0.0.1", () => r()));
  await new Promise<void>((r) => inner.listen(3155, "127.0.0.1", () => r()));
  await new Promise<void>((r) => tcp.listen(3156, "127.0.0.1", () => r()));
  await new Promise<void>((r) => udp.bind(3157, "127.0.0.1", () => r()));
});
afterAll(async () => {
  const g = (global as { __studioBrowser?: { browser: { close(): Promise<void> } } }).__studioBrowser;
  await g?.browser.close().catch(() => {});
  for (const s of [site, inner]) { s?.closeAllConnections?.(); s?.close(); }
  tcp?.close(); udp?.close();
}, 30_000);

describe("reviewer5 on P6-017: other ways out of the Studio browser", () => {
  it("a page: redirect, worker, WebRTC, EventSource, srcdoc, numeric hosts", async () => {
    const { visit } = await import("@/lib/studio/connect/browser");
    const v = await visit("http://127.0.0.1:3154/");
    await new Promise((r) => setTimeout(r, 2500));
    const said = v.html.match(/<div id="out">([\s\S]*?)<\/div>/)?.[1] ?? "";
    console.log("PAGE SAID:", said);
    console.log("HITS:", JSON.stringify(hits));
    expect(v.html).toContain("<td>1</td>");
    expect(hits, JSON.stringify(hits)).toEqual([]);
    expect(said).not.toContain("secret-from-internal-service");
  }, 90_000);

  it("a navigation that redirects to a private address", async () => {
    const before = hits.length;
    const { visit } = await import("@/lib/studio/connect/browser");
    let html = "";
    try { const v = await visit("http://127.0.0.1:3154/redirect-nav"); html = v.html; console.log("NAV URL:", v.url); } catch (e) { console.log("NAV threw:", String(e)); }
    console.log("NAV HITS:", JSON.stringify(hits.slice(before)));
    expect(hits.slice(before)).toEqual([]);
    expect(html).not.toContain("secret-from-internal-service");
  }, 90_000);
});
