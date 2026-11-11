/**
 * Runs before `npm run dev`: opens PaddleOCR (step one of reading a Manu) in its own small window if it is not already running.
 * It never stops the site from starting: on any trouble it does nothing, and the desk reads with the AI OCR alone. Test copies of the
 * site (AWS_STORE_DRY_RUN=1), a computer without manu_paddle_ocr\setup.bat done, and MANU_PADDLE_URL=off are all left alone.
 */
const { spawn } = require("child_process");
const fs = require("fs");
const net = require("net");
const path = require("path");

const PORT = 8867;
const folder = path.join(__dirname, "..", "..", "manu_paddle_ocr");

function switchedOff() {
  if (/^off$/i.test((process.env.MANU_PADDLE_URL || "").trim())) return true;
  try {
    return /^\s*MANU_PADDLE_URL\s*=\s*"?off"?\s*$/im.test(fs.readFileSync(path.join(__dirname, "..", ".env"), "utf8"));
  } catch {
    return false;
  }
}

function alreadyRunning() {
  return new Promise((resolve) => {
    const s = net.connect({ host: "127.0.0.1", port: PORT });
    const done = (yes) => { s.destroy(); resolve(yes); };
    s.setTimeout(800, () => done(false));
    s.once("connect", () => done(true));
    s.once("error", () => done(false));
  });
}

async function main() {
  if (process.platform !== "win32" || process.env.AWS_STORE_DRY_RUN === "1" || switchedOff()) return;
  if (!fs.existsSync(path.join(folder, ".venv", "Scripts", "python.exe"))) return;
  if (await alreadyRunning()) return;
  const child = spawn("cmd.exe", ["/c", `start "PaddleOCR" /min "${path.join(folder, "start.bat")}"`], { detached: true, stdio: "ignore", windowsVerbatimArguments: true });
  child.on("error", () => undefined);
  child.unref();
  console.log("PaddleOCR is starting in its own window.");
}

main().catch(() => undefined);
