// QA pass 4: checks on a running local test server that the scans could not settle by reading code. Only ever talks to 127.0.0.1.
//   node tests/qa/pass4/scan-runtime.mjs --port <p> [--out report.json] [--zod N,N,N] [--dev]
// Prints no code, password or token: only status numbers, JSON key names and yes/no answers.
//   otp      does a password-reset or mobile code reach the browser? (control: a second request gets the cooldown, so the first one did create a code)
//   image    is /_next/image really off (the claim in docs/SECURITY_AUDIT.md)?
//   devroute are the /dev pages gone?
//   upgrade  GHSA-c4j6-fc7j-m34r: does a crafted WebSocket upgrade make the server call another address? The target is a little listener this script opens itself.
//   zod      GHSA-mrhx-c7xc-m3w5: how much memory does one unsigned POST to /api/i18n cost? Only with --zod.
import { execSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import { accounts } from "../seed-local-users.mjs";

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const port = Number(opt("port"));
if (!port) { console.error("--port is required"); process.exit(2); }
const base = `http://127.0.0.1:${port}`;
const report = { base, at: new Date().toISOString() };
const SIX = /\b\d{6}\b/;
const acc = (k) => accounts().find((a) => a.key === k);

async function postJson(path, body, headers = {}) {
  const r = await fetch(base + path, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: typeof body === "string" ? body : JSON.stringify(body) });
  const text = await r.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not json */ }
  return { status: r.status, json, text, setCookie: r.headers.getSetCookie?.() ?? [] };
}
const shape = (r) => ({ status: r.status, keys: r.json ? Object.keys(r.json).sort() : null, hasDevOtp: !!r.json?.devOtp, bodyHasSixDigits: SIX.test(r.text) });

async function otp() {
  const email = acc("citizenA").email;
  const first = await postJson("/api/auth/forgot-password/request-otp", { email });
  const second = await postJson("/api/auth/forgot-password/request-otp", { email });
  const out = { forgotFirst: shape(first), forgotSecond: { ...shape(second), cooldown: second.json?.cooldownRemaining != null }, codeWasCreated: second.json?.cooldownRemaining != null };
  const a = acc("citizenB");
  const login = await postJson("/api/auth/login", { email: a.email, password: a.password });
  const cookie = login.setCookie.map((c) => c.split(";")[0]).join("; ");
  out.login = login.status;
  const mobile = await postJson("/api/profile/mobile-otp/request", { mobileNumber: `9${String(Date.now()).slice(-9)}` }, { cookie });
  out.mobileFirst = shape(mobile);
  out.malformedBodyOnMobileOtp = (await postJson("/api/profile/mobile-otp/request", "{not json", { cookie })).status;
  const page = await fetch(`${base}/forgot-password`);
  out.forgotPage = { status: page.status, htmlHasDevMode: (await page.text()).includes("[Dev mode]") };
  return out;
}

async function image() {
  const out = {};
  for (const url of ["/default-avatar.svg", "/brand/logo.png"]) {
    const r = await fetch(`${base}/_next/image?url=${encodeURIComponent(url)}&w=64&q=75`, { redirect: "manual" });
    out[url] = { status: r.status, contentType: r.headers.get("content-type") };
    await r.arrayBuffer().catch(() => {});
  }
  return out;
}

async function devroutes() {
  const out = {};
  for (const p of ["/dev/thunai", "/api/dev/thunai/hear", "/api/dev/thunai/agent/round"]) {
    const r = await fetch(base + p, { redirect: "manual", method: p.startsWith("/api") ? "POST" : "GET" });
    out[p] = r.status;
    await r.arrayBuffer().catch(() => {});
  }
  return out;
}

/** Sends one raw request and reads what comes back for a moment. Only the first line is kept. */
function raw(requestText, ms = 2500) {
  return new Promise((resolve) => {
    const s = net.connect(port, "127.0.0.1");
    let got = "";
    const done = () => { s.destroy(); resolve(got.split("\r\n")[0] || "(no answer, socket closed or idle)"); };
    s.setTimeout(ms, done);
    s.on("data", (d) => { got += d.toString("latin1"); });
    s.on("close", done);
    s.on("error", done);
    s.write(requestText);
  });
}

async function upgrade() {
  const seen = [];
  const canary = http.createServer((req, res) => { seen.push({ url: req.url, upgrade: req.headers.upgrade ?? null }); res.writeHead(200); res.end("canary"); });
  canary.on("upgrade", (req, socket) => { seen.push({ url: req.url, upgrade: req.headers.upgrade ?? null }); socket.end("HTTP/1.1 200 OK\r\nContent-Length: 6\r\n\r\ncanary"); });
  await new Promise((r) => canary.listen(0, "127.0.0.1", r));
  const cp = canary.address().port;
  const ws = "Connection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n\r\n";
  const tries = {
    absoluteFormUpgrade: `GET http://127.0.0.1:${cp}/absolute HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\n${ws}`,
    pathStartsDoubleSlash: `GET //127.0.0.1:${cp}/double HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\n${ws}`,
    hostHeaderOnly: `GET /hostonly HTTP/1.1\r\nHost: 127.0.0.1:${cp}\r\n${ws}`,
    forwardedHost: `GET /forwarded HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nX-Forwarded-Host: 127.0.0.1:${cp}\r\n${ws}`,
    absoluteFormPlainGet: `GET http://127.0.0.1:${cp}/plainget HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nConnection: close\r\n\r\n`,
  };
  const out = {};
  for (const [name, text] of Object.entries(tries)) {
    const before = seen.length;
    const first = await raw(text);
    await new Promise((r) => setTimeout(r, 300));
    out[name] = { answer: first, canaryCalled: seen.length > before };
  }
  canary.close();
  return { canaryPath: "own listener on 127.0.0.1, random port", tries: out, canaryCalledByAny: seen.length > 0 };
}

/** The memory in use by whichever process listens on the port. Windows only, like the machine it runs on. */
function serverPid() {
  const line = execSync("netstat -ano", { encoding: "utf8", maxBuffer: 1 << 26 }).split("\n").find((l) => new RegExp(`127\\.0\\.0\\.1:${port}\\s.*LISTENING`).test(l));
  return line ? Number(line.trim().split(/\s+/).pop()) : null;
}
function rssMb(pid) {
  try { const o = execSync(`tasklist /FI "PID eq ${pid}" /FO CSV /NH`, { encoding: "utf8" }); const m = o.match(/"([\d,.]+) K"/); return m ? Math.round(Number(m[1].replace(/[,.]/g, "")) / 1024) : null; } catch { return null; }
}
const up = async () => { try { return (await fetch(`${base}/login`, { signal: AbortSignal.timeout(20_000) })).status; } catch (e) { return `down (${e.cause?.code ?? e.name})`; } };

async function zod(sizes) {
  const out = [];
  const pid = serverPid();
  out.push({ pid, rssMbAtStart: rssMb(pid) });
  for (const n of sizes) {
    const now = serverPid();
    if (!now) { out.push({ elements: n, skipped: "server is down" }); break; }
    // numbers where the schema wants strings: each element makes one zod issue
    const head = '{"lang":"ta","texts":[', tail = "]}";
    const body = Buffer.concat([Buffer.from(head), Buffer.alloc(n * 2 - 1, "0,"), Buffer.from(tail)]);
    let peak = 0;
    const t = setInterval(() => { const v = rssMb(now); if (v && v > peak) peak = v; }, 400);
    const t0 = Date.now();
    let status;
    try {
      const r = await fetch(`${base}/api/i18n`, { method: "POST", headers: { "content-type": "application/json" }, body, signal: AbortSignal.timeout(240_000) });
      status = r.status;
      await r.arrayBuffer();
    } catch (e) { status = `no answer (${e.cause?.code ?? e.name})`; }
    clearInterval(t);
    const ms = Date.now() - t0;
    out.push({ elements: n, bodyMb: +(body.length / 1e6).toFixed(1), status, ms, peakRssMb: peak, serverAfter: await up() });
  }
  return out;
}

report.otp = await otp();
report.image = await image();
report.devRoutes = await devroutes();
if (!args.includes("--dev")) report.upgrade = await upgrade();
const z = opt("zod", null);
if (z) report.zod = await zod(z.split(",").map(Number));
const outFile = opt("out", null);
if (outFile) fs.writeFileSync(outFile, JSON.stringify(report, null, 1));
console.log(JSON.stringify(report, null, 1));
