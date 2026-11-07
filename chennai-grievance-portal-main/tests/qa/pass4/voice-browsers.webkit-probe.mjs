// WebKit citizen page stays on skeleton? waits 15 s, logs failed/slow requests and console
import { webkit, chromium } from "@playwright/test";
import { login } from "./lib/access-lib.mjs";
const base = process.argv[2] ?? "http://127.0.0.1:3187";
const { cookie } = await login(base, "citizenA");
for (const [n, t] of [["webkit", webkit], ["chromium", chromium]]) {
  const b = await t.launch({ args: n === "chromium" ? ["--mute-audio"] : [] });
  const ctx = await b.newContext({ baseURL: base });
  await ctx.addCookies(cookie.split("; ").map((kv) => { const i = kv.indexOf("="); return { name: kv.slice(0, i), value: kv.slice(i + 1), url: base }; }));
  const p = await ctx.newPage(); const log = [];
  p.on("console", (m) => log.push("console." + m.type() + " " + m.text().slice(0, 200)));
  p.on("pageerror", (e) => log.push("pageerror " + String(e).slice(0, 300)));
  p.on("requestfailed", (r) => log.push("reqfail " + r.url() + " " + r.failure()?.errorText));
  p.on("response", (r) => { if (r.url().includes("/api/")) log.push(r.status() + " " + r.url().replace(base, "")); });
  await p.goto("/citizen/file-complaint"); await p.waitForTimeout(15000);
  const t1 = await p.innerText("body");
  console.log(n, "textLen", t1.length, t1.includes("Your details") ? "FORM SHOWN" : "NO FORM");
  console.log(log.join("\n"));
  await p.screenshot({ path: `docs/qa/pass4/evidence/browsers/probe-${n}-file-complaint-15s.png` });
  await b.close();
}
