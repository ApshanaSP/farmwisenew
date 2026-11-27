/**
 * The brain's evaluation: the question bank (bank.json) asked on a dry-run copy of the store with the real models, each conversation in order; every
 * answer kept with its tool calls, its repairs and its times, and graded by a second model against what it read (grade.live.ts).
 *   npx vitest run --config vitest.live.config.ts src/lib/brain/eval/run.live.ts
 *   BANK_GROUPS=demo,hospitals  BANK_IDS=demo-001,...  BANK_LANG=en  BANK_N=100 (at most)  BANK_SKIP=0  BANK_FILE=path  BANK_OUT=path  BANK_PAR=3  BANK_CHANNEL=chat|voice
 *   BANK_USD=0.5  stop when this run has cost that much
 */
process.env.AWS_STORE_DRY_RUN = "1";
process.env.AWS_STORE_RELOAD_MINUTES = "100000";
process.env.AWS_DURABLE_FILE ??= "data/aws-cache/dryrun-v18/durable.sqlite";
process.env.JARVIS_KEEPWARM = "0";
process.env.DISTRICT_IQ_JOBS = "off";
process.env.AI_PROVIDER = "none";
process.env.BRAIN_EVAL = "1";
import fs from "node:fs";
import path from "node:path";
import { it } from "vitest";
import { onClaudeCall } from "@/lib/ai/claude";
import { costOf } from "@/lib/ai/claudebudget";
import { serverWorld } from "@/lib/thunai/world";
import { askBrain } from "..";
import { outText } from "../format";
import { forgetAll } from "../memory";
import { stageOf } from "../render";

interface Item { id: string; group: string; lang: string; text: string; turns?: string[]; expect: { kind: string; must?: string[]; not?: string[]; tables?: string[] } }

it("the brain, asked", async () => {
  const all: Item[] = JSON.parse(fs.readFileSync(process.env.BANK_FILE || path.join(process.cwd(), "src/lib/brain/eval/bank.json"), "utf8"));
  const groups = process.env.BANK_GROUPS?.split(","), ids = process.env.BANK_IDS?.split(","), lang = process.env.BANK_LANG;
  let items = all.filter((x) => (!groups || groups.includes(x.group)) && (!ids || ids.includes(x.id)) && (!lang || x.lang === lang));
  if (process.env.BANK_EVERY) items = items.filter((_, k) => k % Number(process.env.BANK_EVERY) === Number(process.env.BANK_OFFSET ?? 0));
  items = items.slice(Number(process.env.BANK_SKIP ?? 0), Number(process.env.BANK_SKIP ?? 0) + Number(process.env.BANK_N ?? 5000));
  const world = await serverWorld();
  const outFile = process.env.BANK_OUT || `data/thunai/brain/run-${Date.now()}.json`;
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  let usd = 0;
  const cap = Number(process.env.BANK_USD ?? 0.5);
  onClaudeCall((e) => { usd += costOf(e.model, e); });
  const rows: Record<string, unknown>[] = [];
  const ch = (process.env.BANK_CHANNEL as "chat" | "voice") || "voice";
  // BANK_DEPT=GCC-SWD asks as that department's officer (the lock is part of what is tested)
  const user = process.env.BANK_DEPT ? { email: "officer@example.test", role: "department_officer" as const, lockDept: process.env.BANK_DEPT } : { email: "collector@chennai.gov.in", role: "collector" as const, lockDept: null };
  let next = 0, stopped = false;
  forgetAll();
  const one = async (x: Item) => {
    const key = `eval-${x.id}`;
    const con = { page: "overview", period: "daily", zone: null, dept: null, cat: null, taluk: null, sev: null, panel: null, incident: null };
    const asked = [...(x.turns ?? []), x.text];
    const before: string[] = [];
    for (const [k, q] of asked.entries()) {
      const t0 = Date.now();
      let first: number | null = null;
      const spoken: string[] = [];
      const r = await askBrain({ text: q, channel: ch, user, world, console: con, key, until: Date.now() + (ch === "voice" ? 24_000 : 45_000), sentence: ch === "voice" ? (t) => { first ??= Date.now() - t0; spoken.push(t); } : undefined }).catch((e) => { console.log("ERR", x.id, (e as Error).message); return null; });
      const last = k === asked.length - 1;
      const doc = r ? stageOf(r, q, world, { period: "daily", zone: null, dept: null, cat: null, taluk: null }) : null;
      if (last || !r) rows.push({ id: x.id, group: x.group, lang: x.lang, q, turns: x.turns ?? [], expect: x.expect, kind: r?.answer.kind ?? "none", scope: r?.answer.scope ?? null, say: r?.answer.say ?? null, title: r?.answer.title, points: r?.answer.points, options: r?.answer.options, show: r?.answer.show, blocks: doc?.blocks.map((b) => `${b.kind}${"title" in b ? `: ${b.title}` : ""}`),
        calls: r?.evidence.map((e) => ({ id: e.id, tool: e.tool, input: e.input, ms: e.ms })), steps: r?.steps, screen: r?.screen, stageOp: r?.stageOp, repaired: r?.repaired, escalated: r?.escalated, model: r?.model, rounds: r?.rounds, ms: Date.now() - t0, firstMs: first, tokens: r?.tokens, trace: r?.trace, read: [...before, ...(r?.evidence.map((e) => outText(e.id, e.out, 40)) ?? [])].join("\n\n").slice(-44_000) });
      if (r) before.push(...r.evidence.map((e) => `(earlier turn) ${outText(e.id, e.out, 30)}`.slice(0, 7000)));
      if (last) console.log(`[${x.id}] ${q}\n   ${r ? `${r.answer.kind}${r.answer.scope ? `/${r.answer.scope}` : ""} ${r.model} tokens ${r.tokens.input + r.tokens.output} ${r.evidence.map((e) => e.tool).join("+") || "-"} | ${r.rounds} rounds ${Date.now() - t0} ms first ${first ?? "-"}${r.escalated ? ` ESC:${r.escalated}` : ""}${r.repaired.length ? ` REPAIRED:${r.repaired.join(" || ").slice(0, 160)}` : ""}` : "NONE"}\n   ${r?.trace.map((t) => `${t.tools || "-"} ${t.ms}ms out${t.out} r${t.read} w${t.write}`).join(" > ") ?? ""}
   SAY: ${r?.answer.say ?? "-"}${r?.answer.options.length ? `\n   OPTIONS: ${r.answer.options.map((o) => o.label).join(" | ")}` : ""}`);
    }
    fs.writeFileSync(outFile, JSON.stringify(rows, null, 1));
  };
  await Promise.all(Array.from({ length: Number(process.env.BANK_PAR ?? 2) }, async () => {
    while (next < items.length && !stopped) {
      if (fs.existsSync("data/thunai/brain/STOP")) { console.log("STOPPED by file"); break; }
      const x = items[next++];
      await one(x);
      if (usd > cap) { stopped = true; console.log(`STOPPED at $${usd.toFixed(3)} (cap ${cap})`); }
    }
  }));
  console.log(`DONE ${rows.length} answers, $${usd.toFixed(4)}, file ${outFile}`);
}, 3_600_000);
