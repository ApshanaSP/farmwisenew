/**
 * QA pass 7, studio-egress REVIEWER probes (real Chromium, Playwright headless shell): page-driven egress vectors that the
 * existing browser-fence BARE test does not cover, plus a regression check that visit() still reads a normal allowed page.
 * The "public" site is an allowed 127.0.0.1 listener (STUDIO_ALLOW_HOSTS); `inner` is a NON-allowed private listener on a
 * different ephemeral port. A probe is BROKEN only if `inner` records a hit (a private service was reached) or the private
 * SECRET appears in what visit() returns.
 *   npx vitest run --config vitest.p7.config.ts --maxWorkers=1 tests/qa/pass7/studio-egress/reviewer/browser-probes.test.ts
 */
import http from "node:http";
import net from "node:net";
import path from "node:path";
import os from "node:os";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const SECRET = "secret-from-internal-service";
const hits: string[] = [];
let site: http.Server, inner: http.Server, A = 0, B = 0;

const shell = (body: string) =>
  `<!doctype html><html><head><title>open data</title></head><body><table><tr><th>a</th></tr><tr><td>1</td></tr></table><div id="out">start</div>${body}</body></html>`;

beforeAll(async () => {
  process.env.STUDIO_BROWSER_PATH = path.join(process.env.LOCALAPPDATA ?? os.homedir(), "ms-playwright", "chromium_headless_shell-1243", "chrome-headless-shell-win64", "chrome-headless-shell.exe");
  inner = http.createServer((req, res) => {
    hits.push(`http ${req.method} ${req.url}`);
    res.writeHead(200, { "content-type": "application/json", "access-control-allow-origin": "*" });
    res.end(JSON.stringify({ secret: SECRET, path: req.url }));
  });
  site = http.createServer((req, res) => {
    const u = req.url ?? "/";
    const base = (extra: Record<string, string> = {}) => ({ "content-type": "text/html", ...extra });
    // a page that pushes the browser at the private inner service in every page-driven way
    if (u === "/meta") { res.writeHead(200, base()); res.end(shell(`<meta http-equiv="refresh" content="0;url=http://127.0.0.1:${B}/meta-refresh">`)); return; }
    if (u === "/jsloc") { res.writeHead(200, base()); res.end(shell(`<script>location.href="http://127.0.0.1:${B}/js-location"</script>`)); return; }
    if (u === "/ping") { res.writeHead(200, base()); res.end(shell(`<a id="l" href="/here" ping="http://127.0.0.1:${B}/ping-beacon">x</a><script>document.getElementById("l").click()</script>`)); return; }
    if (u === "/spec") {
      res.writeHead(200, base());
      res.end(shell(`<script type="speculationrules">{"prefetch":[{"source":"list","urls":["http://127.0.0.1:${B}/prefetch-spec"]}],"prerender":[{"source":"list","urls":["http://127.0.0.1:${B}/prerender-spec"]}]}</script>
        <link rel="prerender" href="http://127.0.0.1:${B}/link-prerender">`)); return;
    }
    // CSP report-uri / Report-To + NEL: a violation and a network error are told to report to the private endpoint
    if (u === "/report") {
      res.writeHead(200, base({
        "content-security-policy": `img-src 'none'; report-uri http://127.0.0.1:${B}/csp-report`,
        "report-to": `{"group":"x","max_age":600,"endpoints":[{"url":"http://127.0.0.1:${B}/reporting"}]}`,
        "nel": `{"report_to":"x","max_age":600,"success_fraction":1.0,"failure_fraction":1.0}`
      }));
      res.end(shell(`<img src="http://127.0.0.1:${B}/blocked.png">`)); return;
    }
    // a normal allowed data page that loads JSON for itself (regression: visit() must still read it)
    if (u === "/data") { res.writeHead(200, base()); res.end(shell(`<script>fetch("/rows.json").then(r=>r.json()).then(j=>{document.getElementById("out").textContent="rows "+j.rows.length})</script>`)); return; }
    if (u === "/rows.json") {
      // >200 bytes so visit()'s JSON-capture threshold is exercised (the capture path, not just the HTML)
      const rows = Array.from({ length: 25 }, (_, k) => ({ ward: `Ward ${k + 1}`, open: (k * 7) % 31, closed: (k * 3) % 19 }));
      res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify({ rows, note: "public-data-ok" })); return;
    }
    res.writeHead(200, base()); res.end(shell(""));
  });
  await new Promise<void>((r) => inner.listen(0, "127.0.0.1", () => r()));
  await new Promise<void>((r) => site.listen(0, "127.0.0.1", () => r()));
  A = (site.address() as net.AddressInfo).port; B = (inner.address() as net.AddressInfo).port;
  process.env.STUDIO_ALLOW_HOSTS = `127.0.0.1:${A}`;
}, 30_000);

afterAll(async () => {
  const g = (global as { __studioBrowser?: { browser: { close(): Promise<void> } } }).__studioBrowser;
  await g?.browser.close().catch(() => {});
  for (const s of [site, inner]) { s?.closeAllConnections?.(); s?.close(); }
}, 30_000);

/** Open a page in a BARE context of the fenced shared browser (proxy only, no visit() route/init-script layer). */
async function bare(pagePath: string, waitMs = 3500): Promise<{ out: string; before: number }> {
  const { browserReady } = await import("@/lib/studio/connect/browser");
  expect(await browserReady()).toBe(true);
  const browser = (global as { __studioBrowser?: { browser: import("playwright-core").Browser } }).__studioBrowser!.browser;
  const ctx = await browser.newContext();
  const before = hits.length;
  try {
    const p = await ctx.newPage();
    await p.goto(`http://127.0.0.1:${A}${pagePath}`, { waitUntil: "domcontentloaded" }).catch(() => {});
    await p.waitForTimeout(waitMs);
    const out = (await p.locator("#out").textContent().catch(() => "")) ?? "";
    return { out, before };
  } finally { await ctx.close().catch(() => {}); }
}

describe("page-driven egress vectors that are not in the bare test: nothing reaches the private listener", () => {
  it("meta refresh to a private address", async () => {
    const { before } = await bare("/meta");
    console.log("META hits:", JSON.stringify(hits.slice(before)));
    expect(hits.slice(before)).toEqual([]);
  }, 60_000);
  it("JS location.href to a private address", async () => {
    const { before } = await bare("/jsloc");
    console.log("JSLOC hits:", JSON.stringify(hits.slice(before)));
    expect(hits.slice(before)).toEqual([]);
  }, 60_000);
  it("hyperlink auditing (<a ping>) to a private address", async () => {
    const { before } = await bare("/ping");
    console.log("PING hits:", JSON.stringify(hits.slice(before)));
    expect(hits.slice(before)).toEqual([]);
  }, 60_000);
  it("speculation rules prefetch/prerender and <link rel=prerender> to a private address", async () => {
    const { before } = await bare("/spec", 4500);
    console.log("SPEC hits:", JSON.stringify(hits.slice(before)));
    expect(hits.slice(before)).toEqual([]);
  }, 60_000);
  it("CSP report-uri + Report-To/NEL pointing at a private endpoint", async () => {
    const { before } = await bare("/report", 4500);
    console.log("REPORT hits:", JSON.stringify(hits.slice(before)));
    expect(hits.slice(before)).toEqual([]);
  }, 60_000);
});

describe("regression: visit() still reads a normal allowed page", () => {
  it("returns the page HTML and captures the JSON it loads for itself; no private hit", async () => {
    const { visit } = await import("@/lib/studio/connect/browser");
    const before = hits.length;
    const v = await visit(`http://127.0.0.1:${A}/data`);
    console.log("DATA json responses:", v.json.length, "| titles:", v.title, "| hits:", JSON.stringify(hits.slice(before)));
    expect(v.html).toContain("<td>1</td>");
    expect(v.json.some((j) => j.text.includes("public-data-ok"))).toBe(true);
    expect(v.html).not.toContain(SECRET);
    expect(hits.slice(before)).toEqual([]);
  }, 90_000);
});
