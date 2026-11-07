// WebKit/Chromium: sign in through the login form (real path), then see whether the citizen page knows who is signed in
import { webkit, chromium } from "@playwright/test";
import { accounts } from "../seed-local-users.mjs";
const base = process.argv[2] ?? "http://localhost:3187";
const a = accounts().find((x) => x.key === "citizenA");
for (const [n, t] of [["webkit", webkit], ["chromium", chromium]]) {
  const b = await t.launch({ args: n === "chromium" ? ["--mute-audio"] : [] });
  const p = await (await b.newContext({ baseURL: base })).newPage(); const log = [];
  p.on("console", (m) => m.type() === "error" && log.push("console.error " + m.text().slice(0, 160)));
  p.on("response", (r) => { if (r.url().includes("/api/auth")) log.push(r.status() + " " + r.request().method() + " " + r.url().replace(base, "")); });
  await p.goto("/login"); await p.waitForLoadState("networkidle");
  await p.locator('input[type=email],input[name=email]').first().fill(a.email);
  await p.locator('input[type=password]').first().fill(a.password);
  await p.locator('button[type=submit]').first().click();
  await p.waitForTimeout(6000);
  console.log("== " + n, p.url().replace(base, ""), "authme:", await p.evaluate(async () => (await fetch("/api/auth/me")).status));
  console.log(log.join("\n"));
  const ck = await p.context().cookies(); console.log("cookies:", ck.map((c) => `${c.name} secure=${c.secure} sameSite=${c.sameSite} httpOnly=${c.httpOnly}`).join(" | "));
  await p.screenshot({ path: `docs/qa/pass4/evidence/browsers/uilogin-${n}.png` });
  await b.close();
}
