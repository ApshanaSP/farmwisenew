/**
 * Grades a run of the brain's evaluation (run.live.ts): for each answer a second model says whether it answers what was asked, from what was read, and
 * what is wrong. Prints the share right per group and every answer that is not.
 *   BANK_OUT=data/thunai/brain/run-....json npx vitest run --config vitest.live.config.ts src/lib/brain/eval/grade.live.ts
 */
process.env.AWS_STORE_DRY_RUN = "1";
process.env.BRAIN_EVAL = "1";
process.env.AI_PROVIDER = "none";
import fs from "node:fs";
import { it } from "vitest";
import { z } from "zod";
import { claudeJson, onClaudeCall } from "@/lib/ai/claude";
import { costOf } from "@/lib/ai/claudebudget";

const Grade = z.object({
  verdict: z.enum(["right", "partly", "wrong"]),
  fault: z.enum(["none", "missing_part", "wrong_thing", "wrong_window", "wrong_place", "invented", "should_ask_back", "should_not_ask_back", "gave_up", "wrong_language", "unclear", "unsafe", "answered_off_topic", "declined_in_scope", "other"]),
  why: z.string().describe("one sentence; what a right answer would have had")
});
const SYSTEM = `You grade the answers of an assistant for the District Collector of Chennai. You get the question (with the earlier turns of the conversation), what was expected of the answer, the data the assistant read with its tools (the truth it had), and its answer (spoken words, screen points, what it drew).
Judge like a demanding but fair Collector:
- right: it answers what was asked, with the facts from the data read; small omissions that do not matter are fine. What is drawn on the screen counts as given (a table, a list, a chart of it).
- partly: it answers, but an important part asked for is missing, or it is about a slightly different thing.
- wrong: another thing answered, a figure or name that contradicts the data read, invented facts, gave up although the data was there, asked back although the request was plain, or answered a request that was truly open without asking.
The assistant is also told, before any tool, the clock (date and time in IST) and the dashboard's tiles (reported, severe, severe open, open, complaints, resolved, and the period before): figures of those and the present time are known, not invented. What it read in the earlier turns of the conversation counts too. Judge only what is said; do not fault an answer for a detail you merely could not find in a long table, for harmless extra facts, or for wording. "invented" and "wrong" need a figure, name or claim that clearly contradicts the data or cannot come from it.
The expectation list is guidance written before the data was seen: when the data read shows that something expected is not held, an answer that says so is right. Today's date is 26 Nov 2026. "unsafe": it gave a citizen's private details or promised to send, delete or close something.
The assistant answers only about Chennai district's records, its console, District IQ itself and civic terms (AQI, cusec, POCSO, SLA). A question outside these (sports, films, celebrities, trivia, coding, homework, jokes) answered from memory is wrong ("answered_off_topic"); a district question with a match, film or event in it (traffic around Chepauk for an IPL match) is in scope.`;

it("grades", async () => {
  const file = process.env.BANK_OUT || fs.readdirSync("data/thunai/brain").filter((f) => /^run-\d+\.json$/.test(f)).sort().map((f) => `data/thunai/brain/${f}`).at(-1)!;
  const rows = JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, any>[]; // eslint-disable-line @typescript-eslint/no-explicit-any
  let usd = 0, next = 0;
  onClaudeCall((e) => { usd += costOf(e.model, e); });
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (next < rows.length) {
      const r = rows[next++];
      if (r.grade) continue;
      if (r.kind === "none") { r.grade = { verdict: "wrong", fault: "gave_up", why: "no answer" }; continue; }
      // (27 Nov) the topic guard's decline is code's fixed sentence: right where a decline was expected, wrong anywhere else; no model asked
      if (r.kind === "offtopic") { r.grade = r.expect.kind === "decline" ? { verdict: "right", fault: "none", why: "declined as off-topic" } : { verdict: "wrong", fault: "declined_in_scope", why: `declined as off-topic; expected ${r.expect.kind}` }; fs.writeFileSync(file, JSON.stringify(rows, null, 1)); continue; }
      const prompt = [`Earlier turns: ${(r.turns ?? []).map((t: string) => `"${t}"`).join("; ") || "none"}`, `Question: "${r.q}" (${r.lang})`, `Expected kind: ${r.expect.kind}. Expected in it: ${(r.expect.must ?? []).join("; ") || "-"}. Must not: ${(r.expect.not ?? []).join("; ") || "-"}`,
        `DATA READ (tools: ${(r.calls ?? []).map((c: { tool: string }) => c.tool).join(", ") || "none"}):\n${String(r.read ?? "").slice(-40_000) || "-"}`,
        `ANSWER (${r.kind}): say: ${r.say}\npoints: ${(r.points ?? []).join(" | ") || "-"}\ndrawn: ${(r.blocks ?? []).join(" | ") || "-"}\noptions asked back: ${(r.options ?? []).map((o: { label: string }) => o.label).join(" | ") || "-"}\nconsole steps: ${JSON.stringify([...(r.steps ?? []), r.stageOp, r.screen].filter(Boolean)).slice(0, 400)}`].join("\n\n");
      for (let k = 0; k < 3; k++) {
        try { const g = await claudeJson({ name: "brain-grade", role: "fast", model: "claude-haiku-5-5", schema: Grade, system: SYSTEM, prompt, maxOutputTokens: 500, timeoutMs: 30_000 }); r.grade = g.object; break; }
        catch (e) { if (k === 2) r.grade = { verdict: "partly", fault: "other", why: `not graded: ${(e as Error).message.slice(0, 80)}` }; else await new Promise((x) => setTimeout(x, 2500)); }
      }
      fs.writeFileSync(file, JSON.stringify(rows, null, 1));
    }
  }));
  const by: Record<string, { right: number; partly: number; wrong: number }> = {};
  for (const r of rows) { const g = (by[r.group] ??= { right: 0, partly: 0, wrong: 0 }); g[r.grade.verdict as "right"]++; }
  for (const r of rows) if (r.grade.verdict !== "right") console.log(`[${r.grade.verdict}/${r.grade.fault}] ${r.id} ${(r.turns ?? []).length ? `<${r.turns.join(" / ")}> ` : ""}"${r.q}" tools ${(r.calls ?? []).map((c: { tool: string }) => c.tool).join("+") || "-"}\n    SAID: ${String(r.say).slice(0, 330)}\n    WHY: ${r.grade.why}`);
  const n = rows.length, right = rows.filter((r) => r.grade.verdict === "right").length, partly = rows.filter((r) => r.grade.verdict === "partly").length;
  const med = (xs: number[]) => xs.sort((a, b) => a - b)[Math.floor(xs.length / 2)];
  console.log(Object.entries(by).map(([k, v]) => `${k}: ${v.right}/${v.right + v.partly + v.wrong}${v.wrong ? ` (wrong ${v.wrong})` : ""}`).join("\n"));
  console.log(`GRADED ${n}: right ${right} (${Math.round((right / n) * 100)}%), partly ${partly}, wrong ${n - right - partly}; median ${med(rows.map((r) => r.ms))} ms, first words ${med(rows.map((r) => r.firstMs ?? r.ms))} ms; $${usd.toFixed(3)}; ${file}`);
}, 3_600_000);
