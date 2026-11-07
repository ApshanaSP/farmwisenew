// QA pass 4: access matrix and fuzz repro for the finding access-fuzz-2 (needs a server: node tests/qa/pass4/server.mjs start --port 3140 --frozen).
import { describe, it, expect } from "vitest";
import { login } from "./lib/access-lib.mjs";

const base = `http://127.0.0.1:${process.env.QA_ACCESS_FUZZ_PORT || 3140}`;
const up = await fetch(`${base}/login`).then((r) => r.status < 500).catch(() => false);
describe.skipIf(!up)("profile photo upload", () => {
  it.fails("access-fuzz-2: a request that is not multipart gets 400, not 500", async () => {
    const { cookie } = await login(base, "citizenA");
    const r = await fetch(`${base}/api/profile/photo`, { method: "POST", headers: { cookie, "content-type": "application/json" }, body: "{}" });
    expect(r.status).toBe(400);
  });
});
