// QA pass 6, P6-017 (redsec2-14): the Data Studio's headless browser guarded every request with context.route + checkHost, but Playwright's route
// never sees a WebSocket (nor a fetch from a Service Worker), so a page it opened reached a private address over one and the reply landed in the
// page the Studio reads. Copied from tests/qa/pass6/probes/redsec2/studio-browser-ssrf.test.ts, with the assertion turned round: nothing may
// reach the private listener. Real Chromium (Playwright's headless shell), 127.0.0.1 listeners only (ports 3152, 3153).
//   QA_PIN_PORT=3197 npx vitest run --config vitest.qa4.config.ts tests/qa/pass4/p6-studio-browser-ws.test.ts
import http from "node:http";
import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const hits: string[] = [];
let site: http.Server, inner: http.Server;
const PAGE = `<!doctype html><html><head><title>open data</title></head><body><table id="t"><tr><th>a</th></tr><tr><td>1</td></tr></table><div id="out"></div>
<script>
  const out = (s) => { document.getElementById("out").textContent += s + " | "; };
  try { const ws = new WebSocket("ws://127.0.0.1:3153/ws-probe"); ws.onopen = () => out("ws open"); ws.onmessage = (e) => out("ws said: " + e.data); ws.onerror = () => out("ws error"); } catch (e) { out("ws threw"); }
  fetch("http://127.0.0.1:3153/fetch-probe", { mode: "no-cors" }).then(() => out("fetch ok"), () => out("fetch blocked"));
  if (navigator.serviceWorker) navigator.serviceWorker.register("/sw.js").then(() => out("sw registered"), (e) => out("sw failed " + e));
</script></body></html>`;
const SW = `self.addEventListener("install", () => { self.skipWaiting(); fetch("http://127.0.0.1:3153/sw-probe", { mode: "no-cors" }).catch(() => {}); });`;

beforeAll(async () => {
  process.env.STUDIO_ALLOW_HOSTS = "127.0.0.1:3152";
  process.env.STUDIO_BROWSER_PATH = path.join(process.env.LOCALAPPDATA ?? os.homedir(), "ms-playwright", "chromium_headless_shell-1243", "chrome-headless-shell-win64", "chrome-headless-shell.exe");
  site = http.createServer((req, res) => {
    if (req.url === "/sw.js") { res.writeHead(200, { "content-type": "text/javascript" }); res.end(SW); return; }
    res.writeHead(200, { "content-type": "text/html" }); res.end(PAGE);
  });
  inner = http.createServer((req, res) => { hits.push(`http ${req.url}`); res.writeHead(200, { "content-type": "text/plain" }); res.end("internal"); });
  inner.on("upgrade", (req, socket) => {
    hits.push(`websocket ${req.url}`);
    const key = String(req.headers["sec-websocket-key"]);
    const accept = createHash("sha1").update(key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").digest("base64");
    socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
    const msg = Buffer.from("secret-from-internal-service");
    socket.write(Buffer.concat([Buffer.from([0x81, msg.length]), msg]));
  });
  await new Promise<void>((r) => site.listen(3152, "127.0.0.1", () => r()));
  await new Promise<void>((r) => inner.listen(3153, "127.0.0.1", () => r()));
});
afterAll(async () => {
  const g = (global as { __studioBrowser?: { browser: { close(): Promise<void> } } }).__studioBrowser;
  await g?.browser.close().catch(() => {});
  for (const s of [site, inner]) { s?.closeAllConnections?.(); s?.close(); }
}, 30_000);

describe("QA pass 6, P6-017: the Studio browser reaches no private address, over HTTP, a WebSocket or a Service Worker", () => {
  it("the page's WebSocket, fetch and Service Worker never reach 127.0.0.1:3153, and the table is still read", async () => {
    const { visit } = await import("@/lib/studio/connect/browser");
    const v = await visit("http://127.0.0.1:3152/");
    await new Promise((r) => setTimeout(r, 1500)); // a late Service Worker install would show by now
    expect(v.html).toContain("<td>1</td>");
    expect(hits, JSON.stringify(hits)).toEqual([]);
    expect(v.html).not.toContain("secret-from-internal-service");
  }, 90_000);
});
