/**
 * The golden questions with the real language models (Groq), in the mode AI_CHAT_MODE names ("agent", or the router when
 * unset), on the frozen store with the clock pinned. Each answer is scored twice: strict (every check, including how it was
 * reached: intent, tool, display) and on content (what the answer says: numbers recomputed by SQL, scope, kind, language).
 * A few harder questions (why, how, what to do) have no automatic check; their answers are written out to be read.
 *
 *   set AI_CHAT_MODE=agent&& set COMPARE_OUT=agent&& npx vitest run --config vitest.live.config.ts compare
 * CASE_IDS=a,b,c limits the run; COMPARE_GAP_MS paces it for the free tier (default 15 s).
 */
import { afterAll, beforeAll, it, vi } from "vitest";
import { forward, haveStore, holder, loadFrozen, STORE } from "./harness";

vi.mock("@/lib/db", async (orig) => ({ ...(await orig<object>()), default: (await import("./harness")).forward }));
vi.mock("@/lib/collector/db", async (orig) => ({ ...(await orig<object>()), default: (await import("./harness")).forward }));
vi.mock("@/lib/assistant/lance", () => ({ hybridSearch: async () => null, holdSync: () => () => undefined, lanceWarm: () => undefined,
  currentIncidentIds: async () => [], lanceReady: async () => false, lanceStatus: async () => ({}) }));
vi.mock("@/lib/assistant/embed", () => ({ ModelNotReady: class extends Error {}, warmUp: () => undefined, embed: async () => { throw new Error("no model"); },
  semanticSearch: async () => [], embedStatus: () => ({ ready: false }) }));

import fs from "fs";
import path from "path";
import type { AnswerCard } from "@/lib/assistant/answer";
import { ALWAYS, CASES, contentFailures, setNow, type Case } from "./cases";

/** Questions a data analyst would be asked, with no fixed answer to check: read by hand. */
const HARD: Case[] = [
  ["why-flood-adyar", "why is flooding high in Adyar this month"],
  ["why-complaints-up", "why did complaints go up this week compared to last week"],
  ["how-swd-doing", "how is the Storm Water Drain department doing on its pending work, and who is slowest"],
  ["worst-zone-why", "which zone is the worst right now and why"],
  ["focus-plan", "what are the three things I should act on today, and which department should I call for each"],
  ["compare-explain", "compare Royapuram and Teynampet this month and explain the difference"],
  ["trend-garbage", "is garbage getting better or worse over the last 3 months"],
  ["tanglish-why", "Adyar la yen ivlo complaints? enna reason?"],
  ["followup-why", ["top 5 zones by open incidents this week", "why is the first one so high?"]],
  ["followup-drill", ["what changed since last week", "show me the incidents behind the biggest rise"]]
].map(([id, q]) => ({ id: id as string, area: "hard (read by hand)", q: q as string | string[], check: () => null }));

const MODE = (process.env.AI_CHAT_MODE ?? "").trim() || "router";
const OUT = process.env.COMPARE_OUT || MODE;
const GAP = Number(process.env.COMPARE_GAP_MS ?? 15000);
const IDS = (process.env.CASE_IDS ?? "").split(",").map((x) => x.trim()).filter(Boolean);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Row { id: string; area: string; q: string; strict: boolean; content: boolean; why: string | null; ms: number; tokens: number; calls: number;
  template: boolean; offline: boolean; models: string; tools: string; headline: string }
const rows: Row[] = [];

beforeAll(async () => {
  if (!haveStore()) return;
  const f = await loadFrozen();
  // the clock starts at the freeze and keeps ticking: the gateway times rate-limit rests and per-minute token use with it,
  // and a stopped clock left the first rate-limited model resting for the whole run
  vi.useFakeTimers({ toFake: ["Date"], shouldAdvanceTime: true });
  vi.setSystemTime(f.frozenAt);
  setNow(await (await import("@/lib/collector/intel")).asOf());
});
afterAll(() => {
  vi.useRealTimers();
  if (!rows.length) return;
  const scored = rows.filter((r) => r.area !== "hard (read by hand)");
  const n = (f: (r: Row) => boolean) => scored.filter(f).length;
  const avg = (f: (r: Row) => number, xs = rows) => Math.round(xs.reduce((a, r) => a + f(r), 0) / Math.max(1, xs.length));
  const summary = { mode: MODE, at: new Date().toISOString(), total: scored.length, strict: n((r) => r.strict), content: n((r) => r.content),
    template: n((r) => r.template), offline: n((r) => r.offline), avgMs: avg((r) => r.ms), avgTokens: avg((r) => r.tokens), avgCalls: Math.round(avg((r) => r.calls * 10) / 10 * 10) / 10,
    hardAvgMs: avg((r) => r.ms, rows.filter((r) => r.area === "hard (read by hand)")), hardAvgTokens: avg((r) => r.tokens, rows.filter((r) => r.area === "hard (read by hand)")) };
  fs.writeFileSync(path.join(STORE, `compare-${OUT}.json`), JSON.stringify({ summary, rows }, null, 1));
  console.log(JSON.stringify(summary));
});

it("compare", async () => {
  if (!haveStore()) return;
  void forward;
  const { ask } = await import("@/lib/assistant/pipeline");
  const id = (holder.db!.prepare("SELECT incident_id AS id FROM incidents WHERE severity_level = 'Severe' AND is_open = 1 ORDER BY priority_score DESC LIMIT 1").get() as { id: string }).id;
  const text = path.join(STORE, `compare-${OUT}.txt`);
  fs.writeFileSync(text, "");
  let k = 0;
  for (const c of [...CASES, ...HARD].filter((x) => !IDS.length || IDS.includes(x.id))) {
    const chain = Array.isArray(c.q) ? c.q : [c.q];
    let sessionId: string | null = null, card: AnswerCard | null = null, why: string | null = null, tokens = 0, calls = 0;
    const t0 = performance.now();
    for (const raw of chain) {
      if (k++) await sleep(GAP);
      const q = raw.replace("__ID__", id).replace("__LONG__", "Please tell me about flooding in Adyar. ".repeat(130));
      try {
        const out = await ask({ user: "compare@test", sessionId, message: q, inputMode: "text", language: "auto", lockDept: c.lock ?? null,
          scope: { period: "daily", zone: null, dept: null, cat: null, taluk: null }, replyTo: null, stage: () => undefined });
        sessionId = out.sessionId;
        card = out.card;
        tokens += card.sources.models.reduce((a, m) => a + (m.tokens ?? 0), 0);
        calls += card.sources.models.length;
        why = why ?? ALWAYS(card);
      } catch (e) {
        why = `threw: ${(e as Error).message.slice(0, 200)}`;
        break;
      }
    }
    if (!why && card) why = c.check(card);
    const v = card?.sources.verifier as { template?: boolean } | null | undefined;
    const row: Row = { id: c.id, area: c.area, q: chain.join(" → "), strict: !why, content: !why || !contentFailures(why).length, why, ms: Math.round(performance.now() - t0),
      tokens, calls, template: !!v?.template, offline: !!card?.offline, models: card?.sources.models.map((m) => `${m.step}:${m.model}`).join(",") ?? "",
      tools: card?.sources.tools.map((t) => t.name).join(",") ?? "", headline: card?.headline ?? "" };
    rows.push(row);
    fs.appendFileSync(text, `=== ${c.id} [${row.strict ? "PASS" : row.content ? "CONTENT-PASS" : "FAIL"}] ${row.q.slice(0, 200)} (${row.ms} ms, ${tokens} tokens, ${calls} model calls)
kind=${card?.kind} intent=${card?.intent ?? ""} display=${card?.display} lang=${card?.language} template=${row.template} offline=${row.offline}
scope: ${card?.scopeLine ?? ""}
models: ${row.models}   tools: ${row.tools}
${why ? `why: ${why}\n` : ""}H: ${card?.headline ?? ""}
${(card?.answerMarkdown ?? "").slice(0, 1600)}
caveats: ${JSON.stringify(card?.caveats ?? []).slice(0, 300)}
limits: ${JSON.stringify(card?.sources.limits ?? []).slice(0, 300)}

`);
    console.log(`${c.id}: ${row.strict ? "pass" : row.content ? "content-pass" : "FAIL"} ${row.ms} ms ${tokens} tok${why ? ` — ${why.slice(0, 160)}` : ""}`);
  }
});
