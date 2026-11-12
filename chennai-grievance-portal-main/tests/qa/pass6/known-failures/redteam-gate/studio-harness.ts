// redteam-gate: shared harness for the P6-029 probes (copied from tests/qa/pass4/p6-studio-browser-bypass.test.ts). 127.0.0.1 listeners on
// ephemeral ports only: `site` is the allowed "public" site (STUDIO_ALLOW_HOSTS), `inner` the private service, `udp` a private STUN port.
import http from "node:http";
import dgram from "node:dgram";
import path from "node:path";
import os from "node:os";
import type { AddressInfo } from "node:net";
import { createHash } from "node:crypto";

export const hits: string[] = [];
export const SECRET = "secret-from-internal-service";

export function wsAccept(req: http.IncomingMessage, socket: import("node:stream").Duplex) {
  hits.push(`websocket ${req.url}`);
  const key = String(req.headers["sec-websocket-key"]);
  const accept = createHash("sha1").update(key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").digest("base64");
  socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
  const msg = Buffer.from(SECRET);
  socket.write(Buffer.concat([Buffer.from([0x81, msg.length]), msg]));
}

export interface Rig { site: http.Server; inner: http.Server; udp: dgram.Socket; A: number; B: number; U: number; close(): Promise<void> }

export async function rig(siteHandler: (req: http.IncomingMessage, res: http.ServerResponse, ports: { A: number; B: number; U: number }) => void): Promise<Rig> {
  process.env.STUDIO_BROWSER_PATH = path.join(process.env.LOCALAPPDATA ?? os.homedir(), "ms-playwright", "chromium_headless_shell-1243", "chrome-headless-shell-win64", "chrome-headless-shell.exe");
  const ports = { A: 0, B: 0, U: 0 };
  const inner = http.createServer((req, res) => {
    hits.push(`http ${req.method} ${req.url}`);
    res.writeHead(200, { "content-type": "text/html", "access-control-allow-origin": "*" });
    res.end(`<html><body><table><tr><th>k</th></tr><tr><td>${SECRET}</td></tr></table></body></html>`);
  });
  inner.on("upgrade", wsAccept);
  const site = http.createServer((req, res) => siteHandler(req, res, ports));
  const udp = dgram.createSocket("udp4");
  udp.on("message", () => { if (!hits.includes("udp (STUN)")) hits.push("udp (STUN)"); });
  await new Promise<void>((r) => inner.listen(0, "127.0.0.1", () => r()));
  await new Promise<void>((r) => site.listen(0, "127.0.0.1", () => r()));
  await new Promise<void>((r) => udp.bind(0, "127.0.0.1", () => r()));
  ports.A = (site.address() as AddressInfo).port; ports.B = (inner.address() as AddressInfo).port; ports.U = (udp.address() as AddressInfo).port;
  process.env.STUDIO_ALLOW_HOSTS = `127.0.0.1:${ports.A}`;
  return {
    site, inner, udp, ...ports,
    async close() {
      const g = (global as { __studioBrowser?: { browser: { close(): Promise<void> }; timer?: unknown } }).__studioBrowser;
      await g?.browser.close().catch(() => {});
      for (const s of [site, inner]) { s.closeAllConnections?.(); s.close(); }
      udp.close();
    }
  };
}
