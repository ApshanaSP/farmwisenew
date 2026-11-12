// PB-316 real-browser guard. node tests/qa/pass4/stepup-console.mjs [port] -> docs/qa/pass4/evidence/stepup-console.json, exit 1 on a finding.
// A guarded action (the Collector's export, an officer's completion report) asks "confirm it's you" before it acts. The page must show the
// box WITHOUT the browser logging a failed request (HTTP 428 is logged by the browser itself, whatever the page does), the caller must still
// see a 428 with cancelled when the box is cancelled, and nothing is done. Cancelling means no action is taken, so this writes nothing.
import fs from "node:fs";
import { launch, open, go } from "./visual-lib.mjs";
import { accounts } from "../seed-local-users.mjs";
const L = await launch(Number(process.argv[2] || 3212));
const out = [];
const JPEG = Buffer.from("/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=", "base64");
for (const [who, path, call] of [
  ["collector", "/collector", async () => { const r = await fetch("/api/collector/export?period=daily"); return { status: r.status, body: await r.json().catch(() => null) }; }],
  ["officerA", "/officer", async (jpeg) => {
    const f = new FormData(); f.set("remarks", "Burning waste put out, area cleared and a fire watch posted at the dumping ground."); f.set("step", "close");
    f.append("photos", new Blob([Uint8Array.from(atob(jpeg), (c) => c.charCodeAt(0))], { type: "image/jpeg" }), "done.jpg");
    const r = await fetch("/api/officer/grievances/INC-20261104-EA19E3/report", { method: "POST", body: f }); return { status: r.status, body: await r.json().catch(() => null) };
  }],
]) {
  const { ctx, page, errs } = await open(L, who, "en", "light", { width: 1280, height: 800 });
  const failed = []; page.on("response", (r) => { if (r.status() >= 400) failed.push(`HTTP ${r.status()} ${new URL(r.url()).pathname}`); });
  await go(L, page, path);
  const before = errs.length;
  const pending = page.evaluate(call, JPEG.toString("base64"));
  const box = await page.locator('.cfm input[type="password"], [role=dialog] input[type="password"]').first().waitFor({ timeout: 15000 }).then(() => true).catch(() => false);
  await page.keyboard.press("Escape");
  const result = await pending;
  // an ordinary request still passes the wrapper untouched
  const plain = await page.evaluate(async () => (await fetch("/api/auth/me")).status).catch(() => null);
  // and with the password the same request goes through (the Collector's export only reads): the grant is sent, the 200 is the real answer
  let confirmed = null;
  if (who === "collector") {
    const again = page.evaluate(call, JPEG.toString("base64"));
    await page.locator('.cfm input[type="password"], [role=dialog] input[type="password"]').first().fill(accounts().find((x) => x.key === who).password, { timeout: 15000 });
    await page.locator('.cfm button:has-text("Confirm"), [role=dialog] button:has-text("Confirm")').first().click();
    const r2 = await again; confirmed = { status: r2.status, hasCsv: typeof r2.body?.csv === "string" };
  }
  out.push({ who, confirmed, confirmBoxShown: box, callerSaw: { status: result.status, cancelled: !!result.body?.cancelled }, consoleErrors: errs.slice(before), failedRequests: failed, plainRequestStatus: plain });
  await ctx.close();
}
await L.br.close();
const bad = out.filter((r) => !r.confirmBoxShown || r.callerSaw.status !== 428 || !r.callerSaw.cancelled || r.consoleErrors.length || r.failedRequests.length || (r.confirmed && (r.confirmed.status !== 200 || !r.confirmed.hasCsv)));
fs.mkdirSync("docs/qa/pass4/evidence", { recursive: true });
fs.writeFileSync("docs/qa/pass4/evidence/stepup-console.json", JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 1));
console.log(bad.length ? `${bad.length} problem(s)` : "no console error, box shown, cancel leaves a 428 for the caller");
process.exit(bad.length ? 1 : 0);
