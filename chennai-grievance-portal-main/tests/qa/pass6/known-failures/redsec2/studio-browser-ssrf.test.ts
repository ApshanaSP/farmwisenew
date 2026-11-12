// QA pass 6, redsec2: the Data Studio's headless browser (studio/connect/browser.ts visit()) guards every request with
// context.route + checkHost, but a page it opens runs JavaScript, and Playwright's route does not see WebSocket connections
// (nor fetches made by a Service Worker). A page on an allowed host (stands in for any public site; STUDIO_ALLOW_HOSTS =
// 127.0.0.1:3152 here) reaches a "private" listener on 127.0.0.1:3153. Only 127.0.0.1 listeners of this test; Playwright's
// own headless shell (STUDIO_BROWSER_PATH), not Edge or Chrome, so nothing phones home.
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

describe("redsec2: Studio browser reaches a private address through a WebSocket", () => {
  it("the page's WebSocket to 127.0.0.1:3153 is not stopped by the route guard; its reply lands in the page the Studio reads", async () => {
    const { visit } = await import("@/lib/studio/connect/browser");
    const v = await visit("http://127.0.0.1:3152/");
    const out = v.html.match(/<div id="out">([^<]*)<\/div>/)?.[1] ?? "";
    console.log("[page out]", out);
    console.log("[private listener hits]", JSON.stringify(hits));
    expect(hits.some((h) => h.startsWith("http /fetch-probe"))).toBe(false); // the guard does stop a plain fetch
    expect(hits.some((h) => h.startsWith("websocket"))).toBe(true);
  }, 90_000);
});
