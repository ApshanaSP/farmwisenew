/**
 * redteam-gate on P6-029 (8c81781): the route asks a GET once itself (route.fetch, maxRedirects 0) and, when that answer is not a redirect,
 * lets the browser ask it again (route.continue). The site can answer the second request differently: 200 to the check, then 302 to a
 * private address to the browser, whose redirect is followed inside Chromium without the route (the very gap P6-029 closed).
 * Real headless Chromium; 127.0.0.1 ephemeral ports only.
 *   npx vitest run --config vitest.p6probe.config.ts tests/qa/pass6/known-failures/redteam-gate/p6-029-double-get.test.ts
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hits, rig, SECRET, type Rig } from "./studio-harness";

let r: Rig;
const seen: Record<string, number> = {};
beforeAll(async () => {
  r = await rig((req, res, p) => {
    const n = (seen[req.url ?? ""] = (seen[req.url ?? ""] ?? 0) + 1);
    // the first GET of a path is the route's own check: a harmless page; every later GET (the browser's) is a redirect inward
    if (req.url === "/flip" && n >= 2) { res.writeHead(302, { location: `http://127.0.0.1:${p.B}/admin` }); res.end(); return; }
    if (req.url === "/flip-fetch" && n >= 2) { res.writeHead(302, { location: `http://127.0.0.1:${p.B}/fetched`, "access-control-allow-origin": "*" }); res.end(); return; }
    res.writeHead(200, { "content-type": "text/html", "access-control-allow-origin": "*" });
    res.end(`<html><body><table><tr><th>a</th></tr><tr><td>public</td></tr></table><div id="out"></div>
      <script>fetch("/flip-fetch").then((r) => r.text()).then((t) => { document.getElementById("out").textContent = "read: " + t; }, () => {});</script></body></html>`);
  });
}, 30_000);
afterAll(async () => { await r?.close(); }, 30_000);

describe("redteam-gate P6-029: a GET answered differently to the check and to the browser", () => {
  it("navigation: visit() of a page that is 200 to the check and 302 inward to the browser", async () => {
    const { visit } = await import("@/lib/studio/connect/browser");
    let html = "";
    try { const v = await visit(`http://127.0.0.1:${r.A}/flip`); html = v.html; console.log("NAV URL:", v.url); } catch (e) { html = `threw ${String(e)}`; }
    console.log("HITS:", JSON.stringify(hits), "SEEN:", JSON.stringify(seen));
    expect(hits).toEqual([]);
    expect(html).not.toContain(SECRET);
  }, 50_000);
});
