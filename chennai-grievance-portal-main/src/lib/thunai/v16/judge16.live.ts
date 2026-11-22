/**
 * v16 live grader (22 Nov): a stronger model (Claude Sonnet 5.5) reads each of a probe run's turns (probe16.live.ts output): the sentence, the
 * two turns before it in the same conversation, what the reader understood, the screen built, the console moves and what Jarvis said, and
 * marks it right, partly right, wrong or not applicable, with the problem and what it should have done. Reads only the run file; writes
 * <run>.judged.json beside it. Spends from the shared Claude budget (about 0.5 USD for 230 turns).
 *   JUDGE_FILE=data/thunai/probe16/run-....json npx vitest run --config vitest.live.config.ts src/lib/thunai/v16/judge16.live.ts
 */
process.env.JARVIS_LIVE_CLAUDE = "1";
import fs from "node:fs";
import { it } from "vitest";
import { z } from "zod";
import { claudeJson } from "@/lib/ai/claude";

interface Row { session: string; said: string; reader: { ask: string; request: string } | null; lane: string; note: string | null; screen: string | null; title: string | null;
  says: string | null; kind?: string | null; actions?: string[]; stageOp?: string | null; options?: string[]; totalMs: number; firstSentenceMs: number | null }

const Verdicts = z.object({ items: z.array(z.object({
  i: z.number().int(),
  verdict: z.enum(["right", "partly", "wrong", "n/a"]),
  issue: z.string().describe("what is wrong or missing, one short sentence; empty when right"),
  should: z.string().describe("what Jarvis should have done, one short sentence; empty when right")
})) });

const SYSTEM = `You grade a voice assistant, Jarvis, the aide of the Chennai District Collector, on a dashboard of incidents (complaints, crime, flooding, garbage...) in 15 zones, news, live traffic, rain, air, reservoirs, market prices and departments. The Collector speaks English, Tamil or Tanglish; the words came from speech recognition and may be misheard. For each turn you get the sentence, the two turns before it in the same conversation, what Jarvis understood (its reader, may be missing), the screen it built (recipe and title), any console moves (steps, a move on the open screen, choices offered) and what it said.

Grade what a sharp human aide would expect:
- right: it understood the request (places, kind, time, "that one", follow-ups) and the screen, moves or words answer it. A page or panel move with no words is right for a command to move the console. A short friendly reply is right for small talk.
- partly: right topic but a part is missing or off (wrong period, a named place dropped, generic where a specific answer was asked, a "why" not addressed, an answer padded with an irrelevant sentence, a figure that looks inconsistent).
- wrong: misunderstood (wrong topic, place or kind), irrelevant, an error, nothing done for a real request, or a refusal of an ordinary request.
- n/a: the sentence is not a request at all (garbled speech, a half word, side talk not meant for Jarvis); say what would be best (ignore, or ask to repeat).
Do not judge whether the dashboard's numbers are true; judge understanding and usefulness. Be strict and specific. Answer for every turn given, with its i.`;

const clip = (s: unknown, n: number) => String(s ?? "").replace(/\s+/g, " ").slice(0, n);

it("v16 judge", async () => {
  const file = process.env.JUDGE_FILE!;
  const rows: Row[] = JSON.parse(fs.readFileSync(file, "utf8"));
  const out: (Row & { verdict: string; issue: string; should: string })[] = [];
  const turnText = (r: Row) => `Jarvis understood: ${r.reader ? `${r.reader.ask}: ${clip(r.reader.request, 160)}` : "(no reading)"}; lane ${r.lane}${r.note ? ` (${r.note})` : ""}; screen ${r.screen ? `${r.screen}: ${clip(r.title, 100)}` : "none"}`
    + `${r.actions?.length ? `; console moves ${clip(r.actions.join(" "), 200)}` : ""}${r.stageOp ? `; move on the open screen ${clip(r.stageOp, 120)}` : ""}${r.options?.length ? `; choices offered ${clip(r.options.join(" | "), 200)}` : ""}`
    + `; said: ${r.says ? JSON.stringify(clip(r.says, 600)) : "(nothing)"}`;
  const BATCH = 8;
  for (let k = 0; k < rows.length; k += BATCH) {
    const part = rows.slice(k, k + BATCH);
    const prompt = part.map((r, j) => {
      const i = k + j;
      const before = rows.slice(Math.max(0, i - 2), i).filter((p) => p.session === r.session);
      return [`TURN i=${i}`, ...before.map((p) => `  earlier: ${JSON.stringify(clip(p.said, 200))} -> ${clip(p.says ?? p.title ?? p.screen ?? "", 160)}`), `  SENTENCE: ${JSON.stringify(r.said)}`, `  ${turnText(r)}`].join("\n");
    }).join("\n\n");
    const items: z.infer<typeof Verdicts>["items"] = [];
    // (a batch that leaves turns out is asked again for those alone)
    for (let tries = 0; tries < 3 && items.length < part.length; tries++) {
      const missing = part.map((_, j) => k + j).filter((i) => !items.some((x) => x.i === i));
      const ask = tries === 0 ? prompt : prompt.split("\n\n").filter((b) => missing.some((i) => b.startsWith(`TURN i=${i}\n`))).join("\n\n");
      try {
        const r = (await claudeJson({ name: "jarvis_judge", schema: Verdicts, system: SYSTEM, prompt: ask, model: "claude-sonnet-5-5", maxOutputTokens: 3000, timeoutMs: 90_000, think: false })).object;
        for (const x of r.items) if (missing.includes(x.i) && !items.some((y) => y.i === x.i)) items.push(x);
      } catch (e) { console.warn(`[judge] batch ${k}: ${(e as Error).message.slice(0, 160)}`); }
    }
    const got = { items };
    for (const [j, r] of part.entries()) {
      const v = got?.items.find((x) => x.i === k + j);
      out.push({ ...r, verdict: v?.verdict ?? "ungraded", issue: v?.issue ?? "", should: v?.should ?? "" });
    }
    fs.writeFileSync(file.replace(/\.json$/, ".judged.json"), JSON.stringify(out, null, 1));
  }
  const count = (v: string) => out.filter((x) => x.verdict === v).length;
  console.log(JSON.stringify({ n: out.length, right: count("right"), partly: count("partly"), wrong: count("wrong"), na: count("n/a"), ungraded: count("ungraded") }));
}, 3_600_000);
