// QA fix-all round 3, SKG1-30 (pass 4's open P2): an order Ask District IQ never carries out is said not to be done, even when a Data Studio
// upload's name shares a word with it. In the pass 7 gate's run the worktree's Studio folder held uploads named "Rtf Export" (redteam-final-5's
// rtf-export.csv), and "export all complaints to excel" was answered with that upload's row count ("Street lights: 3 (rows after cleaning)").
// The real ask() on the pinned snapshot, no model key, a frozen clock, and a Studio folder of this file's own (removed after).
//   npx vitest run --config vitest.qa4.config.ts tests/qa/pass4/skg1-30-studio-order.test.ts
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { FROZEN_NOW } from "./lib/env.mjs";

// before any Studio module is loaded: store.ts reads STUDIO_DIR once
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), "qa4-skg1-30-"));
process.env.STUDIO_DIR = DIR;

const USER = "qa.skg1-30@example.test";
type Ask = typeof import("@/lib/assistant/pipeline").ask;
type Card = Awaited<ReturnType<Ask>>["card"];
let ask: Ask;
let named: (m: string) => { name: string } | null;
const askChat = async (message: string): Promise<Card> => (await ask({ user: USER, sessionId: null, message, inputMode: "text", language: "auto",
  scope: { period: "weekly", zone: null, dept: null, cat: null, taluk: null }, replyTo: null, pinId: null, insightKey: null, lockDept: null, stage: () => undefined } as never)).card;

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ["Date"], now: new Date(FROZEN_NOW) });
  const { ingest } = await import("@/lib/studio/pipeline");
  // the gate's upload, as redteam-final-5 sends it
  await ingest({ buf: Buffer.from("Ward,Issue\r\n1,Drain block\r\n2,Garbage\r\n3,Street light 1794593346929\r\n"), file: "rtf-export.csv", kind: "file", url: null,
    contentType: "text/csv", user: USER }, () => undefined);
  ({ ask } = await import("@/lib/assistant/pipeline"));
  ({ datasetNamed: named } = await import("@/lib/assistant/studiolink"));
}, 300_000);
afterAll(() => {
  vi.useRealTimers();
  fs.rmSync(DIR, { recursive: true, force: true });
});

describe("SKG1-30 with a Studio upload whose name shares a word with the order", () => {
  it("the upload is the dataset the order's words name (the precondition)", () => {
    expect(named("export all complaints to excel")?.name).toBe("Rtf Export");
  });
  it("'export all complaints to excel', and the same in Tanglish and Tamil, is said not to be done, not answered with the upload's figure", async () => {
    for (const p of ["export all complaints to excel", "ellam complaints-um excel-la export pannu", "எல்லா புகார்களையும் எக்செல்லில் ஏற்றுமதி செய்"]) {
      const c = await askChat(p);
      expect(c.kind, `${p}: ${c.kind} | ${c.headline} | ${c.scopeLine ?? ""}`).toMatch(/refusal|clarify/);
      expect(c.kpis ?? [], p).toEqual([]);
    }
  });
});
