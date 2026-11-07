// QA pass 4 chaos: tests that fail today. Each is a finding in docs/qa/pass4/findings/chaos.json.
//   npx vitest run --config vitest.qa4.config.ts tests/qa/pass4/chaos-findings.test.ts   (CHAOS_PORT=3185 for the live-server ones)
import fs from "fs";
import os from "os";
import path from "path";
import { describe, expect, it, vi } from "vitest";
import { login } from "./lib/access-lib.mjs";

describe("CHAOS-1 a corrupt Thunai memory file is not silently erased", () => {
  it("the unreadable file is kept (or the read fails loudly) before the next write replaces it", async () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), "chaos-mem-"));
    vi.stubEnv("THUNAI_DIR", d);
    const { changeMemory } = await import("@/lib/thunai/store");
    const f = path.join(d, "memory-7.json");
    const original = '{"notes":[{"id":"a","text":"the real note","at":"2026-11-01T00:00:00Z"}],"reminders":[{"id":"r"'; // cut short by a crash or a full disk
    fs.writeFileSync(f, original);
    changeMemory(7, { op: "note", text: "new note" } as never);
    const survivors = fs.readdirSync(d).map((n) => fs.readFileSync(path.join(d, n), "utf8"));
    expect(survivors.some((s) => s.includes("the real note"))).toBe(true);
  });
});

const port = process.env.CHAOS_PORT;
describe.skipIf(!port)("CHAOS-2 no model key: a question the rules cannot answer is not answered with a different figure", () => {
  const ask = async (q: string) => {
    const { cookie } = await login(`http://127.0.0.1:${port}`, "collector");
    const r = await fetch(`http://127.0.0.1:${port}/api/collector/assistant/chat`, { method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify({ message: q }) });
    const t = await r.text();
    return JSON.parse(/event: answer\ndata: (.*)/.exec(t)![1]);
  };
  it.each(["predict how many complaints Adyar will get next week", "how many complaints will be resolved by Friday"])("'%s' says it cannot forecast, instead of giving a past count", async (q) => {
    const a = await ask(q);
    expect(`${a.headline} ${a.answerMarkdown} ${(a.caveats ?? []).join(" ")}`).toMatch(/cannot|can't|not forecast|don't predict|no forecast|past|so far/i);
    expect(a.kind).not.toBe("answer");
  });
  it("a request to draft a letter says drafting is unavailable, instead of listing incidents", async () => {
    const a = await ask("draft a polite letter to the Commissioner about repeated flooding in Adyar");
    expect(`${a.headline} ${a.answerMarkdown} ${(a.caveats ?? []).join(" ")}`).toMatch(/cannot|can't|unable|not available|don't write|draft/i);
  });
});
