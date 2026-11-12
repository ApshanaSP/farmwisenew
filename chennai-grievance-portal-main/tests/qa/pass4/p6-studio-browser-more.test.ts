// QA pass 6, P6-029: reviewer 5's cases on c614e0d, copied from tests/qa/pass6/probes/reviewer5/studio-browser-more.test.ts (127.0.0.1 listeners only).
//   QA_PIN_PORT=3197 npx vitest run --config vitest.qa4.config.ts tests/qa/pass4/p6-studio-browser-more.test.ts
// reviewer5 probe on P6-017 (c614e0d), part 2: a SharedWorker's WebSocket, what a redirected navigation returns, and whether a WebSocket to
// an ALLOWED host still works after the fix (regression check). 127.0.0.1 only: 3158 = allowed site (+ its own WebSocket), 3159 = private.
//   npx vitest run --config vitest.p6probe.config.ts tests/qa/pass6/probes/reviewer5/studio-browser-more.test.ts
import http from "node:http";
import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const hits: string[] = [];
let site: http.Server, inner: http.Server;
const SHARED = `onconnect = (c) => { const port = c.ports[0];
  try { const ws = new WebSocket("ws://127.0.0.1:3159/shared-ws"); ws.onmessage = (e) => port.postMessage("shared ws said: " + e.data); ws.onerror = () => port.postMessage("shared ws error"); } catch (e) { port.postMessage("shared threw " + e); } };`;
const PAGE = `<!doctype html><html><head><title>open data</title></head><body><table><tr><th>a</th></tr><tr><td>1</td></tr></table><div id="out"></div>
<script>
  const out = (s) => { document.getElementById("out").textContent += s + " | "; };
  try { const sw = new SharedWorker(URL.createObjectURL(new Blob([${JSON.stringify(SHARED)}], { type: "text/javascript" }))); sw.port.onmessage = (e) => out(e.data); sw.port.start(); } catch (e) { out("sharedworker threw " + e); }
  try { const ok = new WebSocket("ws://127.0.0.1:3158/allowed-ws"); ok.onmessage = (e) => out("allowed ws said: " + e.data); ok.onerror = () => out("allowed ws error"); ok.onclose = (e) => out("allowed ws closed " + e.code); } catch (e) { out("allowed ws threw"); }
</script></body></html>`;
function upgrade(tag: string, msg: string) {
  return (req: http.IncomingMessage, socket: import("node:stream").Duplex) => {
    hits.push(`${tag} websocket ${req.url}`);
    const accept = createHash("sha1").update(String(req.headers["sec-websocket-key"]) + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").digest("base64");
    socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
    const b = Buffer.from(msg); socket.write(Buffer.concat([Buffer.from([0x81, b.length]), b]));
  };
}
beforeAll(async () => {
  process.env.STUDIO_ALLOW_HOSTS = "127.0.0.1:3158";
  process.env.STUDIO_BROWSER_PATH = path.join(process.env.LOCALAPPDATA ?? os.homedir(), "ms-playwright", "chromium_headless_shell-1243", "chrome-headless-shell-win64", "chrome-headless-shell.exe");
  site = http.createServer((req, res) => {
    if (req.url === "/redirect-nav") { res.writeHead(302, { location: "http://127.0.0.1:3159/admin" }); res.end(); return; }
    res.writeHead(200, { "content-type": "text/html" }); res.end(PAGE);
  });
  site.on("upgrade", upgrade("allowed", "public-hello"));
  inner = http.createServer((req, res) => { hits.push(`private http ${req.url}`); res.writeHead(200, { "content-type": "text/html" }); res.end("<html><body><table><tr><th>key</th></tr><tr><td>secret-from-internal-service</td></tr></table></body></html>"); });
  inner.on("upgrade", upgrade("private", "secret-from-internal-service"));
  await new Promise<void>((r) => site.listen(3158, "127.0.0.1", () => r()));
  await new Promise<void>((r) => inner.listen(3159, "127.0.0.1", () => r()));
});
afterAll(async () => {
  const g = (global as { __studioBrowser?: { browser: { close(): Promise<void> } } }).__studioBrowser;
  await g?.browser.close().catch(() => {});
  for (const s of [site, inner]) { s?.closeAllConnections?.(); s?.close(); }
}, 30_000);

describe("reviewer5 on P6-017, part 2", () => {
  it("SharedWorker WebSocket to a private address is blocked; a WebSocket to the allowed host still gets its message", async () => {
    const { visit } = await import("@/lib/studio/connect/browser");
    const v = await visit("http://127.0.0.1:3158/");
    await new Promise((r) => setTimeout(r, 2000));
    const said = v.html.match(/<div id="out">([\s\S]*?)<\/div>/)?.[1] ?? "";
    console.log("PAGE SAID:", said, "\nHITS:", JSON.stringify(hits));
    expect(said).toContain("allowed ws said: public-hello");
    expect(hits.filter((h) => h.startsWith("private"))).toEqual([]);
  }, 90_000);
  it("a navigation redirected to a private address: visit() must not return its page", async () => {
    const { visit } = await import("@/lib/studio/connect/browser");
    let html = "", url = "";
    try { const v = await visit("http://127.0.0.1:3158/redirect-nav"); html = v.html; url = v.url; } catch (e) { html = `threw ${String(e)}`; }
    console.log("NAV:", url, html.slice(0, 200));
    expect(html).not.toContain("secret-from-internal-service");
  }, 90_000);
});
