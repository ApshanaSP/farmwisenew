/**
 * v3: does the answer answer the question? A second check beside the plan scorer (evalcheck.misses), which only says
 * whether the plan is right. Claude Haiku reads each question with the answer's headline and meaning sentence (counts
 * and place names only: no complaint text, no personal data) and grades it: answers it / partly / no, how clear (1-5),
 * and the one thing wrong. The answers come from an askai run's output (JUDGE_IN, one JSON line per question).
 *   JUDGE_IN=...jsonl JUDGE_N=80 npx vitest run --config vitest.live.config.ts src/lib/map/judge.live.ts
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { z } from "zod";

const IN = process.env.JUDGE_IN ?? "";
const N = Number(process.env.JUDGE_N ?? 80);
const OUT = process.env.JUDGE_OUT || path.join(os.tmpdir(), `map-judge-${Date.now()}.jsonl`);

const Grade = z.object({
  answers: z.enum(["yes", "partly", "no"]).describe("does the answer give what the officer asked for"),
  clear: z.number().describe("1-5: how plainly an officer would understand it on a phone"),
  issue: z.string().describe("the one thing wrong or missing, in a few words; empty if none")
});

const SYSTEM = [
  "You check answers from a map assistant for a district Collector in Chennai. The officer typed a question (English, Tamil or Tanglish, often loosely);",
  "the assistant answered with a headline and one sentence, and drew the answer on a map. You see only the words.",
  "Grade whether the words answer what was asked (the right kind of problem, place, time and shape: a list, a count by area, a ranking, a comparison, the nearest).",
  "Do not check the numbers themselves (you cannot); check that they are the numbers the question needs. A short honest 'none found' answers the question.",
  "An area summary (brief) answers 'what is happening in X'. Be strict but fair; 'partly' when one part is missing or wrong."
].join(" ");

it.runIf(!!IN && fs.existsSync(IN))("Ask the Map answers, judged", async () => {
  const { claudeJson } = await import("@/lib/ai/claude");
  const { spentUsd } = await import("@/lib/ai/claudebudget");
  const usd0 = spentUsd();
  const rows = fs.readFileSync(IN, "utf8").trim().split("\n").filter((l) => l.startsWith("{")).map((l) => JSON.parse(l) as { set: string; id: string; q?: string; head?: string | null; meaning?: string | null; ok?: boolean })
    .filter((x) => x.q && x.head && /human3|holdout3|fresh3|collector|followups3|topics3/.test(x.set));
  // an even spread over the sets, in a fixed order (the same sample each run)
  const pick = rows.filter((_, i) => i % Math.max(1, Math.floor(rows.length / N)) === 0).slice(0, N);
  const tally = { yes: 0, partly: 0, no: 0, clear: 0, n: 0 };
  for (const x of pick) {
    try {
      const r = await claudeJson({ name: "map-judge", role: "fast", schema: Grade, system: SYSTEM, prompt: `QUESTION: ${x.q}\nANSWER: ${x.head}${x.meaning ? `\n${x.meaning}` : ""}\n(Beside it the map shows the places, and the panel a ranked list of the top places when the answer ranks.)`, maxOutputTokens: 300, timeoutMs: 20_000 });
      tally[r.object.answers]++; tally.clear += r.object.clear; tally.n++;
      fs.appendFileSync(OUT, JSON.stringify({ set: x.set, id: x.id, q: x.q, head: x.head, planOk: x.ok, ...r.object }) + "\n");
      console.log(`${r.object.answers.toUpperCase()} ${x.set} ${x.id} ${x.q} | ${r.object.issue}`);
    } catch (e) { console.log(`JUDGE ERROR ${x.id}: ${(e as Error).message}`); }
  }
  console.log(`JUDGE ${JSON.stringify({ ...tally, clearAvg: tally.n ? Math.round((tally.clear / tally.n) * 10) / 10 : 0, usd: Math.round((spentUsd() - usd0) * 1e5) / 1e5, out: OUT })}`);
  expect(tally.n).toBeGreaterThan(0);
}, 1_800_000);
