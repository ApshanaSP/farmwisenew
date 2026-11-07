import { beforeAll, describe, expect, it } from "vitest";
import { accounts } from "../seed-local-users.mjs";
/** Skeptic re-run of hunt-askiq findings 1, 2, 5 on port 3191. Prints what the server really says. */
const BASE = "http://127.0.0.1:3191";
let cookie = "";
beforeAll(async () => {
  const a = (accounts() as { key: string; email: string; password: string }[]).find((x) => x.key === "collector")!;
  const r = await fetch(`${BASE}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: a.email, password: a.password }) });
  cookie = r.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
});
async function chat(message: string) {
  const r = await fetch(`${BASE}/api/collector/assistant/chat`, { method: "POST", headers: { "content-type": "application/json", cookie }, body: JSON.stringify({ message }) });
  const t = await r.text();
  const m = t.match(/event: answer\ndata: (.*)/);
  const a = m ? JSON.parse(m[1]) : { raw: t.slice(0, 300) };
  return { status: r.status, headline: a.headline, scope: a.scopeLine, md: String(a.answerMarkdown ?? "").slice(0, 300), raw: a.raw };
}
describe("skeptic askiq", () => {
  it("probe", async () => {
    const out: unknown[] = [];
    for (const q of ["zone 99 complaints", "complaints in Atlantis", "complaints from 2030", "how many complaints in Adyar in the last 0 days", "how many complaints in Adyar", "complaints in zone 5"]) out.push({ q, ...(await chat(q)) });
    const s = await fetch(`${BASE}/api/collector/search?q=a%00b`, { headers: { cookie } });
    out.push({ search: s.status, body: (await s.text()).slice(0, 200) });
    console.log(JSON.stringify(out, null, 1));
    expect(true).toBe(true);
  }, 120000);
});
