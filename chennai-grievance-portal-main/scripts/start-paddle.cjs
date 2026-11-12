/**
 * Runs before `npm run dev`: opens PaddleOCR (step one of reading a Manu) in its own small window if it is not already running.
 * It never stops the site from starting: on any trouble it does nothing, and the desk reads with the AI OCR alone. Test copies of the
 * site (AWS_STORE_DRY_RUN=1), a computer without manu_paddle_ocr\setup.bat done, and MANU_PADDLE_URL=off are all left alone.
 *
 * `npm run dev` does not load .env into this script, so every setting is read from the environment first, then from .env, the same
 * way for each (QA pass 5, sms-ocr-14: AWS_STORE_DRY_RUN in .env was not read, and port 8867 was checked whatever the app was set to).
 */
const { spawn } = require("child_process");
const fs = require("fs");
const net = require("net");
const path = require("path");

const DEFAULT_PORT = 8867;
const folder = path.join(__dirname, "..", "..", "manu_paddle_ocr");

/** KEY=value lines of a .env file (quotes taken off; comments and blank lines skipped). */
function parseEnv(text) {
  const out = {};
  for (const line of String(text || "").split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    let v = m[2];
    if (/^(["']).*\1$/.test(v)) v = v.slice(1, -1);
    else v = v.replace(/\s+#.*$/, "");
    out[m[1]] = v;
  }
  return out;
}

/**
 * What to do, from the environment and the .env text: start PaddleOCR on `port`, or not, and why not.
 * The app reads MANU_PADDLE_URL (default http://127.0.0.1:8867); the server reads MANU_PADDLE_PORT. A URL on another computer means
 * this one has nothing to start.
 */
function settings(env, envFileText) {
  const file = parseEnv(envFileText);
  const get = (k) => {
    const v = env[k] != null && String(env[k]).trim() !== "" ? env[k] : file[k];
    return v == null ? "" : String(v).trim();
  };
  if (get("AWS_STORE_DRY_RUN") === "1") return { start: false, why: "a test copy (AWS_STORE_DRY_RUN=1)" };
  const url = get("MANU_PADDLE_URL");
  if (/^off$/i.test(url)) return { start: false, why: "MANU_PADDLE_URL=off" };
  let port = Number(get("MANU_PADDLE_PORT")) || DEFAULT_PORT;
  if (url) {
    let u;
    try { u = new URL(url); } catch { return { start: false, why: "MANU_PADDLE_URL is not an address" }; }
    if (!["127.0.0.1", "localhost", "[::1]"].includes(u.hostname.toLowerCase())) return { start: false, why: "MANU_PADDLE_URL is another computer" };
    port = Number(u.port) || (u.protocol === "https:" ? 443 : 80);
  }
  return { start: true, port };
}

function alreadyRunning(port) {
  return new Promise((resolve) => {
    const s = net.connect({ host: "127.0.0.1", port });
    const done = (yes) => { s.destroy(); resolve(yes); };
    s.setTimeout(800, () => done(false));
    s.once("connect", () => done(true));
    s.once("error", () => done(false));
  });
}

async function main() {
  if (process.platform !== "win32") return;
  let envFile = "";
  try { envFile = fs.readFileSync(path.join(__dirname, "..", ".env"), "utf8"); } catch { /* no .env */ }
  const s = settings(process.env, envFile);
  if (!s.start) return;
  if (!fs.existsSync(path.join(folder, ".venv", "Scripts", "python.exe"))) return;
  if (await alreadyRunning(s.port)) return;
  // the server takes its port from MANU_PADDLE_PORT, so it listens where the app will look
  const child = spawn("cmd.exe", ["/c", `start "PaddleOCR" /min "${path.join(folder, "start.bat")}"`],
    { detached: true, stdio: "ignore", windowsVerbatimArguments: true, env: { ...process.env, MANU_PADDLE_PORT: String(s.port) } });
  child.on("error", () => undefined);
  child.unref();
  console.log(`PaddleOCR is starting in its own window (port ${s.port}).`);
}

module.exports = { parseEnv, settings };
if (require.main === module) main().catch(() => undefined);
