/**
 * QA pass 7, studio-egress: src/lib/studio/vocab.ts (the words the AI may read in a computed sentence, untrusted.ts forModel) must match
 * the sentence templates it is built from. A template changed without it does not leak anything (its new words reach the model as
 * tokens) but makes the brief worse, so the gate says so.
 *   npx vitest run --config vitest.p7.config.ts --maxWorkers=1 tests/qa/pass7/studio-egress/vocab.test.ts
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("the model's vocabulary matches the sentence templates", () => {
  it("node scripts/studio-vocab/build.mjs --check passes", () => {
    const out = execFileSync(process.execPath, [path.join("scripts", "studio-vocab", "build.mjs"), "--check"], { encoding: "utf8" });
    expect(out).toMatch(/up to date/);
  });

  it("no word an instruction to pass on personal data or reach someone needs is in it", async () => {
    const { TEMPLATE_WORDS } = await import("@/lib/studio/vocab");
    for (const w of ["phone", "mobile", "call", "ring", "whatsapp", "aadhaar", "otp", "password", "share", "send", "obtain", "submit", "link", "number", "citizens", "register", "nine", "seven"])
      expect(TEMPLATE_WORDS.has(w), w).toBe(false);
  });
});
