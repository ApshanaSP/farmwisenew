/**
 * QA pass 4, code-health scans: reproductions of what the strict TypeScript run and the dead-code scan pointed at.
 *   npx vitest run --config vitest.qa4.config.ts tests/qa/pass4/scans-code.test.ts
 * Open bugs are written with it.fails, named by finding id (docs/qa/pass4/findings/scans-code.json). No model, no server.
 * The Studio part runs in a temporary STUDIO_DIR with a made-up key, against the local fixture server only.
 */
import fs from "fs";
import path from "path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.STUDIO_DIR = `${process.env.TEMP || process.env.TMPDIR || "/tmp"}/qa4-scans-code-${process.pid}`;
  process.env.STUDIO_FIXTURES = "1";
  process.env.STUDIO_HOST_GAP_MS = "0";
  process.env.STUDIO_BROWSER = "0";
  process.env.STUDIO_FETCH_TIMEOUT_MS = "1500";
});

import { parsePeriod, periodSince } from "@/lib/collector/intel";
import { OutcomeStop } from "@/lib/studio/connect/resolve";
import { getVault } from "@/lib/studio/connect/vault";
import { deleteConnector } from "@/lib/studio/connectors";
import { ingestLink, ingestPick } from "@/lib/studio/pipeline";
import { deleteDataset } from "@/lib/studio/store";
import { START, WORLD } from "@/lib/thunai/fixture";
import { normalise } from "@/lib/thunai/normalise";
import { figuresIn, fillTemplate, gateChunk, allowedSet } from "@/lib/thunai/numbergate";
import { understand } from "@/lib/thunai/understand";

const SENTENCES = ["the constructor of the Adyar bridge has not finished", "show the constructor", "constructor report"];

describe("scans-code-1: Jarvis's rules on the English word \"constructor\"", () => {
  it("a plain word beside it works (control)", () => {
    expect(normalise("the contractor of the Adyar bridge").tokens).toContain("contractor");
    expect(() => understand("the contractor of the Adyar bridge has not finished", START, WORLD, { speechConf: 0.95 })).not.toThrow();
  });
  it.fails("scans-code-1 normalise keeps the word as it was said", () => {
    expect(normalise("show the constructor").tokens).toEqual(["show", "the", "constructor"]);
  });
  it.fails("scans-code-1 understand does not throw", () => {
    for (const s of SENTENCES) understand(s, START, WORLD, { speechConf: 0.95 });
  });
});

describe("scans-code-2: the number gate on the same word", () => {
  const line = "The constructor has not finished the drain.";
  it("a plain word beside it passes (control)", () => {
    expect(figuresIn("The contractor has not finished the drain.")).toEqual([]);
    expect(gateChunk("The contractor has not finished the drain.", allowedSet([])).ok).toBe(true);
  });
  it.fails("scans-code-2 \"constructor\" is not a figure", () => {
    expect(figuresIn(line)).toEqual([]);
  });
  it.fails("scans-code-2 the gate lets a line with no figure through", () => {
    expect(gateChunk(line, allowedSet([])).ok).toBe(true);
  });
  it.fails("scans-code-2 a template with no figure is not refused", () => {
    expect(fillTemplate(line, {})).toBe(line);
  });
});

describe("scans-code-3: a period from the address bar", () => {
  it("a word that is no period falls back to daily (control)", () => {
    expect(parsePeriod("nonsense")).toBe("daily");
  });
  for (const raw of ["constructor", "__proto__", "toString", "valueOf"]) {
    it.fails(`scans-code-3 ?period=${raw} falls back to daily`, () => {
      expect(parsePeriod(raw)).toBe("daily");
    });
    it.fails(`scans-code-3 ?period=${raw} does not throw in the routes' date code`, () => {
      periodSince(parsePeriod(raw), "2026-11-06 12:00:00");
    });
  }
});

describe("the two runtime import cycles madge lists (no finding: this holds them to it)", () => {
  // each module first, in a fresh module graph: the order that would show an undefined value at load time
  it("lib/map: ask, followups and suggest load in any order, with every binding defined", async () => {
    for (const first of ["ask", "followups", "suggest"]) {
      vi.resetModules();
      await import(/* @vite-ignore */ `@/lib/map/${first}`);
      const [ask, followups, suggest] = await Promise.all([import("@/lib/map/ask"), import("@/lib/map/followups"), import("@/lib/map/suggest")]);
      expect(typeof ask.placeLookup).toBe("function");
      expect(typeof followups.followUps).toBe("function");
      expect(typeof suggest.WORDS).toBe("object");
    }
  }, 120_000);
  it("studio: Dataset and Drill use each other only when drawing, never at load", () => {
    const top = (file: string, names: string[]) => fs.readFileSync(path.join(process.cwd(), "src/components/collector/app/studio", file), "utf8")
      .split("\n").filter((l) => /^\S/.test(l) && !/^(import|export (default )?function|function|\/|\s*\*|\})/.test(l) && names.some((n) => new RegExp(`\\b${n}\\b`).test(l)));
    expect(top("Drill.tsx", ["AnimatedNum", "DataTable"])).toEqual([]);
    expect(top("Dataset.tsx", ["Drill"])).toEqual([]);
  });
});

describe("scans-code-4: a link with a saved sign-in that went through the picker", () => {
  const dir = process.env.STUDIO_DIR!;
  const made: { token: string | null; id: string | null; before: string[]; after: string[] } = { token: null, id: null, before: [], after: [] };
  let stop: (() => Promise<void>) | null = null;

  beforeAll(async () => {
    fs.mkdirSync(dir, { recursive: true });
    const mod = await import("../../../scripts/studio-fixtures/server.mjs");
    // the fixture server may already be running for another test file: the same fixtures, so it is used as it is
    stop = await mod.start().catch((e: NodeJS.ErrnoException) => { if (e.code === "EADDRINUSE") return null; throw e; });
    const url = (mod.FIXTURES as { id: string; url: string }[]).find((f) => f.id === "c-portal")!.url;
    let pick: { token: string; cards: { id: string; group: string }[] } | null = null;
    try {
      await ingestLink({ url, auth: { mode: "apikey", key: "qa-made-up-key", keyName: "api-key", keyPlace: "header" }, every: null, name: null, user: "qa" }, () => undefined);
    } catch (e) {
      if (!(e instanceof OutcomeStop)) throw e;
      pick = (e as OutcomeStop & { outcome: { pick: typeof pick } }).outcome.pick;
    }
    if (!pick) throw new Error("the picker did not open");
    made.token = pick.token;
    made.before = fs.readdirSync(dir).filter((f) => f.startsWith(pick!.token));
    const card = pick.cards.find((c) => c.group !== "unreadable" && c.group !== "notchennai")!;
    made.id = await ingestPick(pick.token, { ids: [card.id], mode: "each" }, "qa", () => undefined);
    // the Collector deletes the dataset, as DELETE /api/collector/studio/[id] does
    deleteDataset(made.id);
    deleteConnector(made.id);
    made.after = fs.readdirSync(dir).filter((f) => f.startsWith(pick!.token));
  }, 170_000);
  afterAll(async () => { await stop?.(); fs.rmSync(dir, { recursive: true, force: true }); });

  it("the flow really ran: the picker saved a sign-in, the dataset was made and deleted (control)", () => {
    expect(made.before.some((f) => f.endsWith(".auth"))).toBe(true);
    expect(made.id).toBeTruthy();
    expect(fs.existsSync(path.join(dir, `${made.id}.auth`))).toBe(false);
    expect(fs.existsSync(path.join(dir, `${made.id}.json`))).toBe(false);
  });
  it("scans-code-4 no saved sign-in is left after the dataset is deleted", () => {
    expect(getVault(made.token!)).toBeNull();
  });
  it("scans-code-4 nothing the picker saved is left after the dataset is deleted", () => {
    expect(made.after).toEqual([]);
  });
});
