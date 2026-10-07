/**
 * The connector against a mock department site run here: a sign-in form with a session cookie, a dashboard page that
 * loads its data with JavaScript, an API-key endpoint, a password pop-up (HTTP Basic) and a robots.txt. The browser
 * tests run when Edge, Chrome or Playwright's Chromium is on the machine.
 */
import http from "http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { allowedBy, parseRobots } from "@/lib/studio/connect/robots";
import { choose, scoreTable } from "@/lib/studio/connect/discover";
import { credentialsFor } from "@/lib/studio/connect/vault";
import { judge, keepChennai, stateWide } from "@/lib/studio/relevance";
import type { Table } from "@/lib/studio/parse";

describe("robots.txt", () => {
  const g = parseRobots("User-agent: *\nAllow: /web/\nDisallow: /\n\nUser-agent: BadBot\nDisallow: /");
  it("reads the longest matching rule", () => {
    expect(allowedBy(g, "/web/data.csv")).toBe(true);
    expect(allowedBy(g, "/catalog/rainfall")).toBe(false);
    expect(allowedBy(parseRobots("User-agent: *\nDisallow: /private\n"), "/public/x")).toBe(true);
    expect(allowedBy(parseRobots("User-agent: *\nDisallow:\n"), "/anything")).toBe(true);
    expect(allowedBy(parseRobots("User-agent: *\nDisallow: /*.pdf$\n"), "/a/b.pdf")).toBe(false);
  });
});

describe("choosing the table", () => {
  const t = (headers: string[], rows: (string | number | null)[][]): Table => ({ headers, rows, sheet: null, sheets: [], caption: null, format: "html", truncated: 0 });
  const menu = t(["Home", "About"], Array.from({ length: 30 }, (_, i) => [`Link ${i}`, "Go"]));
  const lakes = t(["Reservoir", "Level (ft)", "Storage (mcft)", "Date"], [["Poondi", 129.8, 817, "06-10-2026"], ["Chembarambakkam", 80.1, 2400, "06-10-2026"], ["Puzhal", 18.2, 2100, "06-10-2026"]]);
  it("prefers real data to a page's furniture", () => {
    expect(scoreTable(lakes, "table").score).toBeGreaterThan(scoreTable(menu, "table").score);
    expect(scoreTable(lakes, "table").why).toMatch(/numbers.*Chennai places/);
  });
  it("keeps the Collector's table across refreshes, by its headers", () => {
    const a = { cand: { id: "table-1", kind: "table" as const, label: "x", rows: 3, cols: 4, headers: lakes.headers, score: 50, why: "" }, table: lakes };
    const b = { cand: { id: "table-2", kind: "table" as const, label: "y", rows: 30, cols: 2, headers: menu.headers, score: 70, why: "" }, table: menu };
    expect(choose([b, a]).cand.id).toBe("table-2");
    expect(choose([b, { ...a, cand: { ...a.cand, id: "table-7" } }], { choice: "table-1", candidates: [a.cand] }).cand.id).toBe("table-7");
  });
});

describe("sign-in details", () => {
  it("are sent only as the mode says, to the link's own host", () => {
    expect(credentialsFor("https://api.data.gov.in/resource/x", { mode: "apikey", key: "K", keyName: "api-key", keyPlace: "query" })).toEqual({ host: "api.data.gov.in", query: { "api-key": "K" } });
    expect(credentialsFor("https://x.in/a", { mode: "apikey", key: "K", keyName: "Authorization", keyPlace: "header" })!.headers).toEqual({ Authorization: "Bearer K" });
    expect(credentialsFor("https://x.in/a", { mode: "basic", username: "u", password: "p" })!.headers!.Authorization).toBe("Basic " + Buffer.from("u:p").toString("base64"));
    expect(credentialsFor("https://x.in/a", { mode: "login", username: "u", password: "p" })).toBeNull();
  });
});

describe("relevance", () => {
  const spec = (over: Record<string, unknown> = {}) => ({ title: "x", summary: "", entity: "row", entityPlural: "rows", department: null, deptName: null, columns: [
    { key: "c0", header: "District", label: "District", role: "place", type: "text", unit: null, agg: null, conf: 1, why: "" },
    { key: "c1", header: "Cases", label: "Cases", role: "measure", type: "number", unit: null, agg: "sum", conf: 1, why: "" }],
    openValues: [], primary: "c1", linkCategories: [], questions: [], by: "ai", model: "m", ...over }) as any;
  const tn: Table = { headers: ["District", "Cases"], rows: [["Chennai", 40], ["Madurai", 12], ["Salem", 9], ["Erode", 3], ["Vellore", 5], ["Coimbatore", 20]], sheet: null, sheets: [], caption: null, format: "csv", truncated: 0 };
  it("keeps Chennai's rows of a Tamil Nadu table", () => {
    const sw = stateWide(tn, spec())!;
    expect(sw.key).toBe("c0");
    expect(keepChennai(tn, sw.index).rows).toEqual([["Chennai", 40]]);
  });
  it("stops only what the AI reads as unrelated and nothing in the rows contradicts", () => {
    const marks: Table = { headers: ["Student", "Marks"], rows: [["Asha", 90], ["Ravi", 81], ["Meena", 77]], sheet: null, sheets: [], caption: null, format: "csv", truncated: 0 };
    const rows = marks.rows.map(() => ({}));
    const unrelated = spec({ aiRelevance: { verdict: "unrelated", why: "A class's exam marks." } });
    const src = { url: null, file: "marks.xlsx", caption: null };
    expect(judge({ spec: unrelated, rows, table: marks, source: src, filtered: null, forced: false }).block).toBe(true);
    // the Collector said "Use anyway"
    expect(judge({ spec: unrelated, rows, table: marks, source: src, filtered: null, forced: true }).block).toBe(false);
    // the rows land in Chennai: the evidence wins over the AI
    expect(judge({ spec: unrelated, rows: rows.map(() => ({ _z: 13 })), table: marks, source: src, filtered: null, forced: false }).relevance.verdict).toBe("district");
    // no AI: the rules never stop a file on their own
    expect(judge({ spec: spec({ by: "rules", aiRelevance: null }), rows, table: marks, source: src, filtered: null, forced: false }).block).toBe(false);
  });
});

// ------------------------------------------------------------------ mock department site --

let server: http.Server;
let base = "";
const SESSIONS = new Set<string>();
const ROWS = [{ ward: 173, zone: "Adyar", locality: "Velachery", complaints: 41, pending: 12 }, { ward: 9, zone: "Tondiarpet", locality: "Tondiarpet", complaints: 28, pending: 9 },
  { ward: 112, zone: "Teynampet", locality: "T Nagar", complaints: 35, pending: 4 }, { ward: 88, zone: "Ambattur", locality: "Ambattur", complaints: 19, pending: 7 }];

beforeAll(async () => {
  server = http.createServer((req, res) => {
    const u = new URL(req.url ?? "/", "http://x");
    const cookie = /sid=(\w+)/.exec(req.headers.cookie ?? "")?.[1];
    const signed = !!cookie && SESSIONS.has(cookie);
    const send = (code: number, type: string, body: string, extra: Record<string, string> = {}) => { res.writeHead(code, { "Content-Type": type, ...extra }); res.end(body); };
    if (u.pathname === "/robots.txt") return send(200, "text/plain", "User-agent: *\nDisallow: /secret\n");
    if (u.pathname === "/login" && req.method === "POST") {
      let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => {
        const f = new URLSearchParams(b);
        if (f.get("email") === "officer@gcc.test" && f.get("password") === "Demo@123") {
          const sid = Math.random().toString(36).slice(2); SESSIONS.add(sid);
          return send(302, "text/html", "", { Location: "/dashboard", "Set-Cookie": `sid=${sid}; Path=/; HttpOnly` });
        }
        send(200, "text/html", `<html><body><form method="post" action="/login"><p role="alert">Wrong password</p><input type="email" name="email"><input type="password" name="password"><button type="submit">Sign in</button></form></body></html>`);
      });
      return;
    }
    if (u.pathname === "/login") return send(200, "text/html", `<html><head><title>Sign in</title></head><body><form method="post" action="/login"><input type="email" name="email"><input type="password" name="password"><button type="submit">Sign in</button></form></body></html>`);
    if (u.pathname === "/dashboard") {
      if (!signed) return send(302, "text/html", "", { Location: "/login" });
      // the data arrives by JavaScript, as on most dashboards
      return send(200, "text/html", `<html><head><title>Ward complaints</title></head><body><div id="root"></div><script>
        fetch('/api/rows').then(r => r.json()).then(d => { document.getElementById('root').innerHTML = '<table><tr><th>Ward</th><th>Zone</th><th>Complaints</th></tr>' +
          d.rows.map(x => '<tr><td>' + x.ward + '</td><td>' + x.zone + '</td><td>' + x.complaints + '</td></tr>').join('') + '</table>'; });
      </script></body></html>`);
    }
    if (u.pathname === "/api/rows") return signed ? send(200, "application/json", JSON.stringify({ updated: "2026-10-06", rows: ROWS })) : send(401, "application/json", "{}");
    if (u.pathname === "/open/rows.csv") return u.searchParams.get("api-key") === "K123" ? send(200, "text/csv", "ward,zone,complaints\n" + ROWS.map((r) => `${r.ward},${r.zone},${r.complaints}`).join("\n")) : send(401, "text/plain", "key needed");
    if (u.pathname === "/basic.csv") return req.headers.authorization === "Basic " + Buffer.from("u:p").toString("base64")
      ? send(200, "text/csv", "ward,zone,complaints\n9,Tondiarpet,28\n173,Adyar,41\n88,Ambattur,19") : send(401, "text/plain", "", { "WWW-Authenticate": "Basic" });
    if (u.pathname === "/secret") return send(200, "text/html", "<table><tr><td>a</td></tr></table>");
    send(404, "text/plain", "no");
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  const port = (server.address() as { port: number }).port;
  base = `http://127.0.0.1:${port}`;
  // the mock runs on this machine: allowed as a demo host (as STUDIO_ALLOW_HOSTS would allow a department app here)
  process.env.STUDIO_ALLOW_HOSTS = `127.0.0.1:${port}`;
});
afterAll(() => { server?.close(); delete process.env.STUDIO_ALLOW_HOSTS; });

const logs: string[] = [];
const log = (t: string) => logs.push(t);

describe("connecting to a department site", () => {
  it("reads a file behind an API key, and says so when the key is missing", async () => {
    const { connectLink } = await import("@/lib/studio/connect");
    const c = await connectLink(`${base}/open/rows.csv`, { mode: "apikey", key: "K123", keyName: "api-key", keyPlace: "query" }, { log });
    expect(c.method).toBe("http");
    expect(c.found[0].table.rows).toHaveLength(4);
    await expect(connectLink(`${base}/open/rows.csv`, { mode: "none" }, { log })).rejects.toThrow(/asks for a sign-in/);
  });
  it("reads a file behind a password pop-up (HTTP Basic)", async () => {
    const { connectLink } = await import("@/lib/studio/connect");
    const c = await connectLink(`${base}/basic.csv`, { mode: "basic", username: "u", password: "p" }, { log });
    expect(c.found[0].table.headers).toEqual(["ward", "zone", "complaints"]);
    await expect(connectLink(`${base}/basic.csv`, { mode: "basic", username: "u", password: "wrong" }, { log })).rejects.toThrow(/did not accept/);
  });
  it("keeps out of what robots.txt disallows", async () => {
    const { connectLink } = await import("@/lib/studio/connect");
    await expect(connectLink(`${base}/secret`, { mode: "none" }, { log })).rejects.toThrow(/robots\.txt/);
  });
  it("refuses private addresses that are not allowed", async () => {
    const { connectLink } = await import("@/lib/studio/connect");
    await expect(connectLink("http://192.168.1.10/data.csv", { mode: "none" }, { log })).rejects.toThrow(/private network/);
  });
});

const hasBrowser = await (async () => {
  try { const { chromium } = await import("playwright-core"); for (const channel of ["msedge", "chrome", undefined]) { try { const b = await chromium.launch(channel ? { channel } : {}); await b.close(); return true; } catch { /* next */ } } } catch { /* none */ }
  return false;
})();

describe.runIf(hasBrowser)("signing in with a browser", () => {
  let session: string | null = null;
  it("signs in on the site's own form, reads the data the page loads, and keeps the session", async () => {
    const { connectLink } = await import("@/lib/studio/connect");
    const c = await connectLink(`${base}/dashboard`, { mode: "login", username: "officer@gcc.test", password: "Demo@123" }, { log });
    expect(c.method).toBe("browser");
    expect(c.signedIn).toBe("fresh");
    // the JSON the dashboard loaded is the best candidate: five columns, all four wards
    expect(c.found[0].cand.kind).toBe("api");
    expect(c.found[0].table.rows).toHaveLength(4);
    expect(c.found.some((f) => f.cand.kind === "table")).toBe(true);
    session = c.session;
    expect(session).toBeTruthy();
  }, 90_000);
  it("reuses the kept session, and signs in again by itself when it has expired", async () => {
    const { connectLink } = await import("@/lib/studio/connect");
    const again = await connectLink(`${base}/dashboard`, { mode: "login", username: "officer@gcc.test", password: "Demo@123" }, { session, log });
    expect(again.signedIn).toBe("reused");
    SESSIONS.clear(); // the site forgets every session
    const fresh = await connectLink(`${base}/dashboard`, { mode: "login", username: "officer@gcc.test", password: "Demo@123" }, { session, log });
    expect(fresh.signedIn).toBe("fresh");
    expect(fresh.found[0].table.rows).toHaveLength(4);
  }, 90_000);
  it("says plainly when the password is wrong", async () => {
    const { connectLink } = await import("@/lib/studio/connect");
    await expect(connectLink(`${base}/dashboard`, { mode: "login", username: "officer@gcc.test", password: "nope" }, { log })).rejects.toThrow(/did not accept the sign-in: "Wrong password"/);
  }, 90_000);
});
