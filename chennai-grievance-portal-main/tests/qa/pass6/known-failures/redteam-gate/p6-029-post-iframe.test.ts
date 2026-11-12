/**
 * redteam-gate on P6-029 (8c81781): two more ways round the fix.
 *  1. Only GETs are checked for a redirect ("other methods are not asked twice"): a form POST answered 303/307 to a private address is
 *     followed inside Chromium, so the page the Studio reads is the private one.
 *  2. Worker and RTCPeerConnection are removed from the top window by an init script; a fresh about:blank iframe's window may still have them.
 * Real headless Chromium; 127.0.0.1 ephemeral ports only.
 *   npx vitest run --config vitest.p6probe.config.ts tests/qa/pass6/known-failures/redteam-gate/p6-029-post-iframe.test.ts
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hits, rig, SECRET, type Rig } from "./studio-harness";

let r: Rig;
beforeAll(async () => {
  r = await rig((req, res, p) => {
    if (req.method === "POST" && req.url === "/go") { res.writeHead(307, { location: `http://127.0.0.1:${p.B}/post-admin` }); res.end(); return; }
    res.writeHead(200, { "content-type": "text/html" });
    if (req.url === "/form") {
      res.end(`<html><body><form id="f" method="post" action="/go"><input name="a" value="1"></form><script>document.getElementById("f").submit()</script></body></html>`);
      return;
    }
    // /frame: a Worker and an RTCPeerConnection taken from a blank iframe's window
    const W = `try{const ws=new WebSocket("ws://127.0.0.1:${p.B}/iframe-worker-ws");ws.onmessage=(e)=>postMessage("worker ws said: "+e.data)}catch(e){postMessage("worker ws threw "+e)}`;
    res.end(`<html><body><table><tr><th>a</th></tr><tr><td>1</td></tr></table><div id="out"></div><script>
      const out = (s) => { document.getElementById("out").textContent += s + " | "; };
      const f = document.createElement("iframe"); document.body.appendChild(f);
      const w = f.contentWindow;
      out("iframe Worker is " + typeof w.Worker + ", RTC is " + typeof w.RTCPeerConnection);
      try { const wk = new w.Worker(URL.createObjectURL(new Blob([${JSON.stringify(W)}], { type: "text/javascript" }))); wk.onmessage = (e) => out(e.data); } catch (e) { out("worker threw " + e); }
      try { const pc = new w.RTCPeerConnection({ iceServers: [{ urls: "stun:127.0.0.1:${p.U}" }] }); pc.createDataChannel("x"); pc.createOffer().then((o) => pc.setLocalDescription(o)); out("rtc started"); } catch (e) { out("rtc threw " + e); }
    </script></body></html>`);
  });
}, 30_000);
afterAll(async () => { await r?.close(); }, 30_000);

describe("redteam-gate P6-029: ways the fix does not cover", () => {
  it("a form POST answered 307 to a private address", async () => {
    const before = hits.length;
    const { visit } = await import("@/lib/studio/connect/browser");
    let html = "";
    try { const v = await visit(`http://127.0.0.1:${r.A}/form`); html = v.html; console.log("POST NAV URL:", v.url); } catch (e) { html = `threw ${String(e)}`; }
    console.log("POST HITS:", JSON.stringify(hits.slice(before)), "SECRET IN PAGE:", html.includes(SECRET));
    expect(hits.slice(before)).toEqual([]);
    expect(html).not.toContain(SECRET);
  }, 25_000);

  it("Worker and RTCPeerConnection from a blank iframe's window", async () => {
    const before = hits.length;
    const { visit } = await import("@/lib/studio/connect/browser");
    const v = await visit(`http://127.0.0.1:${r.A}/frame`);
    await new Promise((res) => setTimeout(res, 1500));
    const said = v.html.match(/<div id="out">([\s\S]*?)<\/div>/)?.[1] ?? "";
    console.log("FRAME SAID:", said, "FRAME HITS:", JSON.stringify(hits.slice(before)));
    expect(hits.slice(before)).toEqual([]);
  }, 25_000);
});
