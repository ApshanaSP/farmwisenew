/**
 * 28 Nov 2026 (the owner: "AI is not being used and we don't get an AI answer in the side panels of 'what happened' and 'why it needs
 * you'"): the Collector's AI panels on the real store (a dry-run copy: nothing is saved to AWS), each with its provider, its time and a
 * short sample of its answer. The caches of the write-ups are this probe's own (memory under vitest), never the site's files. Spend is
 * recorded in the real Claude budget record (data/thunai/claude-budget.sqlite), so the owner's ceiling counts these calls too.
 *   AIFIX_PHASE=baseline  the provider order .env gives, one analysis on it, one with Claude switched off (as when its ceiling is reached)
 *   AIFIX_PHASE=sizes     no model call: how big each background write-up's request is, and whose daily budget it is charged to
 *   AIFIX_PHASE=after     every panel through the shared chain, then again with Claude switched off (the free models must answer)
 *   AIFIX_PHASE=overlay   no model call: what the Briefing cards' AI look adds to a request (28 Nov: 280 ms the first time, then 4 ms)
 * 28 Nov 2026, AIFIX_PHASE=after: every panel answered (Claude in: Haiku 5.5, 2.4-29 s; Claude out: Groq 0.7-1.8 s, Gemini 3.0-3.3 s); 25 calls, $0.02.
 * Run (Avast intercepts TLS here):
 *   set NODE_EXTRA_CA_CERTS=C:\ProgramData\Avast Software\Avast\wscert.pem&& set AIFIX_PHASE=after&& npx vitest run --config vitest.live.config.ts src/lib/collector/aianswers.live.ts
 */
process.env.AWS_STORE_DRY_RUN = "1";
process.env.AWS_STORE_RELOAD_MINUTES = "100000";
process.env.AWS_DURABLE_FILE ??= "data/aws-cache/dryrun-aifix/durable.sqlite";
process.env.JARVIS_KEEPWARM = "0";
process.env.DISTRICT_IQ_JOBS = "off";
process.env.NEWS_DESK = "off";
import { expect, it, vi } from "vitest";
import intelPool from "@/lib/collector/db";
import { aiStatus, onAttempt, type AttemptEvent } from "@/lib/ai/gateway";
import { onClaudeCall, type ClaudeCallEvent } from "@/lib/ai/claude";
import { spentUsd } from "@/lib/ai/claudebudget";

const PHASE = (process.env.AIFIX_PHASE ?? "after").trim();
type Row = Record<string, unknown>;
const q = async (sql: string, p: unknown[] = []) => ((await intelPool.query(sql, p)) as unknown as [Row[]])[0];
const short = (s: unknown, n = 160) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, n);

/** every model attempt and every Claude request while `run` is out, and how long it took */
async function watched<T>(label: string, run: () => Promise<T>): Promise<{ v: T; ms: number; tries: string[] }> {
  const tries: string[] = [];
  const a = onAttempt((e: AttemptEvent) => tries.push(`${e.provider}/${e.model} ${e.outcome}${e.status ? ` ${e.status}` : ""} ${e.ms} ms`));
  const c = onClaudeCall((e: ClaudeCallEvent) => tries.push(`anthropic/${e.model} ${e.outcome} ${e.ms} ms (${e.input_tokens + e.cache_read_input_tokens + e.cache_creation_input_tokens}+${e.output_tokens} tokens)`));
  const t0 = Date.now();
  try {
    const v = await run();
    return { v, ms: Date.now() - t0, tries };
  } finally {
    a(); c();
    console.log(`  [${label}] ${Date.now() - t0} ms; attempts: ${tries.join(" | ") || "(none seen)"}`);
  }
}

async function cases(n: number): Promise<string[]> {
  const rows = await q(`SELECT incident_id AS id FROM incidents WHERE is_open = 1 AND severity_level IN ('Severe', 'High') AND member_count >= 2
    ORDER BY first_reported_at DESC LIMIT ?`, [n]);
  return rows.map((r) => String(r.id));
}

it.runIf(PHASE === "baseline")("baseline: the order .env gives, and an analysis with Claude out", async () => {
  const st = aiStatus();
  console.log(`providers: ${st.providers.map((p) => `${p.name} (${p.fast})`).join(", ") || "none"}; problem: ${st.problem ?? "none"}; Claude spent so far $${spentUsd().toFixed(2)}`);
  const { analyseIncident } = await import("@/lib/collector/analysis");
  const [a, b] = await cases(2);
  const r1 = await watched("analysis, Claude in", () => analyseIncident(a, "probe-baseline"));
  console.log(`  ${a}: ${r1.v ? `${r1.v.model}: ${short(r1.v.what)}` : "NO AI ANSWER (rules text shown)"}`);
  process.env.JARVIS_CLAUDE_OFF = "1";
  const r2 = await watched("analysis, Claude out", () => analyseIncident(b, "probe-baseline"));
  console.log(`  ${b}: ${r2.v ? `${r2.v.model}: ${short(r2.v.what)}` : "NO AI ANSWER (rules text shown)"}`);
  delete process.env.JARVIS_CLAUDE_OFF;
  expect(true).toBe(true);
});

interface Seen { feature: string; claude: "in" | "out"; provider: string; ms: number; sample: string; tries: string[] }
const results: Seen[] = [];
const put = (feature: string, claude: "in" | "out", r: { ms: number; tries: string[] }, provider: string, sample: string) => {
  results.push({ feature, claude, provider, ms: r.ms, sample: short(sample, 150), tries: r.tries });
  console.log(`  => ${feature} (Claude ${claude}): ${provider} in ${r.ms} ms: ${short(sample, 150)}`);
};
const by = (model: string | null | undefined) => (!model ? "NO AI ANSWER" : /claude/.test(model) ? `anthropic/${model}` : /gemini/.test(model) ? `gemini/${model}` : /nova/.test(model) ? `bedrock/${model}` : `groq/${model}`);

it.runIf(PHASE === "after")("after: every AI panel answers, with Claude in and with Claude out", async () => {
  process.env.STORY_EXPLAIN = "2";
  const st = aiStatus();
  console.log(`chain: ${st.providers.map((p) => `${p.name} (${p.fast})`).join(" > ") || "none"}; problem: ${st.problem ?? "none"}; Claude spent before: $${spentUsd().toFixed(4)}`);
  const { asOf, PERIODS, periodSince } = await import("@/lib/collector/intel");
  const now = await asOf();
  const { incidentAnalysis, storyAnalysis } = await import("@/lib/collector/analysis");
  const { dayBrief, trendBrief } = await import("@/lib/collector/aibrief");
  const { draftAction } = await import("@/lib/collector/actionmail");
  const { stories } = await import("@/lib/collector/storyai");
  const { judge, unjudged } = await import("@/lib/collector/newsdesk");
  const { insights, withAiAccounts } = await import("@/lib/collector/insights");
  const ids = await cases(4);
  const news = await q(`SELECT d.story_id AS s, GROUP_CONCAT(d.doc_id) AS ids, COUNT(DISTINCT d.publisher) AS n FROM documents d
    WHERE d.source_kind = 'news' AND d.is_district = 1 AND d.publisher_tier IN ('established', 'regional') AND d.published_at > (? - INTERVAL 2 DAY) AND d.story_id IS NOT NULL
    GROUP BY d.story_id HAVING COUNT(DISTINCT d.publisher) >= 2 ORDER BY MAX(d.published_at) DESC LIMIT 2`, [now]);
  const severe = (await q(`SELECT incident_id AS id FROM incidents WHERE is_open = 1 AND severity_level = 'Severe' ORDER BY first_reported_at DESC LIMIT 2`)).map((r) => String(r.id));
  const who = "probe-after";

  // ---- Claude in
  let r1 = await watched("incident panel", () => incidentAnalysis(ids[0], who));
  put("Incident panel: What happened / Why it needs you", "in", r1, by(r1.v.analysis?.model), r1.v.analysis?.what ?? r1.v.noAi ?? "");
  const n1 = await watched("news panel", () => storyAnalysis(String(news[0]?.ids ?? "").split(",").slice(0, 12), who));
  put("News panel: What happened / Why it matters", "in", n1, by(n1.v.analysis?.model), n1.v.analysis?.what ?? n1.v.noAi ?? "");
  const d1 = await watched("key points", () => dayBrief({ period: "daily", zone: null, dept: null, taluk: null }, who));
  put("Briefing key points (day3)", "in", d1, by(d1.v?.model), d1.v ? `${d1.v.headline} | ${d1.v.points[0]?.text ?? ""}` : "");
  const t1 = await watched("trends", () => trendBrief(who));
  put("Trends: what is behind the rises (trend3)", "in", t1, by(t1.v?.model), t1.v?.what ?? "(no rising problem: nothing to write)");
  const e1 = await watched("action email", () => draftAction(severe[0], who));
  const em = e1.v as { ai?: { provider: string; model: string } | null; subject?: string };
  put("Take action: AI email draft", "in", e1, em.ai ? `${em.ai.provider}/${em.ai.model}` : "NO AI ANSWER (template)", em.subject ?? JSON.stringify(e1.v).slice(0, 120));
  const s1 = await watched("stories", async () => {
    const scope = { hours: PERIODS.daily.hours, zone: null, dept: null, cat: null, taluk: null, since: periodSince("daily", now) };
    await stories(scope, now, who);
    // the model's work goes on in the background: ask again until it is done (at most 4 minutes)
    for (let k = 0; k < 48; k++) { const s = await stories(scope, now, who); if (!s.pending) return s; await new Promise((ok) => setTimeout(ok, 5000)); }
    return stories(scope, now, who);
  });
  const story = s1.v.threads.find((t) => t.ai) ?? s1.v.threads[0];
  put("Developing stories: AI timeline (story-pick2 + story-line6)", "in", s1, s1.v.ai ? (s1.tries.find((x) => /ok/.test(x))?.split(" ")[0] ?? "ai") : "NO AI ANSWER (rules)",
    story ? `${story.title}: ${story.ai?.now ?? story.events.map((e) => e.what).join(" / ")}` : "(no story)");
  const desk = await unjudged(2, now, 3);
  const j1 = await watched("news desk", () => judge(desk.slice(0, 3)));
  const v = [...j1.v.values()][0];
  put("News desk: act / know / skip", "in", j1, v ? by(v.by) : "NO AI ANSWER", v ? `${v.v}: ${v.head || v.gist || v.why}` : "");
  const b1 = await watched("briefing cards", async () => {
    const ins = await insights("daily", null, null, {}, "briefing");
    await withAiAccounts(ins);
    // the cards' analyses are written in the background: look again once they are done (at most 90 s)
    for (let k = 0; k < 30; k++) {
      await new Promise((ok) => setTimeout(ok, 3000));
      const again = await withAiAccounts(await insights("daily", null, null, {}, "briefing"));
      const list = again.briefing?.attention ?? [];
      if (list.slice(0, 3).every((a) => a.why.ai)) return again;
    }
    return withAiAccounts(await insights("daily", null, null, {}, "briefing"));
  });
  const cards = b1.v.briefing?.attention ?? [];
  put("Briefing: Decisions for you (What happened / Why it needs you)", "in", b1, `${cards.filter((a) => a.why.ai).length} of ${cards.length} cards in the AI's words`,
    cards[0] ? `${cards[0].title}: ${cards[0].why.summary} | ${cards[0].why.attention[0] ?? ""}` : "(no card)");

  // ---- Claude out (as when the owner's spend ceiling is reached): the free models must answer
  process.env.JARVIS_CLAUDE_OFF = "1";
  console.log(`chain with Claude out: ${aiStatus().providers.map((p) => p.name).join(" > ")}`);
  r1 = await watched("incident panel, Claude out", () => incidentAnalysis(ids[1], who));
  put("Incident panel: What happened / Why it needs you", "out", r1, by(r1.v.analysis?.model), r1.v.analysis?.what ?? r1.v.noAi ?? "");
  const n2 = await watched("news panel, Claude out", () => storyAnalysis(String(news[1]?.ids ?? news[0]?.ids ?? "").split(",").slice(0, 12).reverse(), who));
  put("News panel: What happened / Why it matters", "out", n2, by(n2.v.analysis?.model), n2.v.analysis?.what ?? n2.v.noAi ?? "");
  const d2 = await watched("key points, Claude out", () => dayBrief({ period: "weekly", zone: null, dept: null, taluk: null }, who));
  put("Briefing key points (day3, weekly)", "out", d2, by(d2.v?.model), d2.v ? `${d2.v.headline} | ${d2.v.points[0]?.text ?? ""}` : "");
  const e2 = await watched("action email, Claude out", () => draftAction(severe[1] ?? severe[0], `${who}-2`));
  const em2 = e2.v as { ai?: { provider: string; model: string } | null; subject?: string };
  put("Take action: AI email draft", "out", e2, em2.ai ? `${em2.ai.provider}/${em2.ai.model}` : "NO AI ANSWER (template)", em2.subject ?? "");
  delete process.env.JARVIS_CLAUDE_OFF;

  console.log(`Claude spent after: $${spentUsd().toFixed(4)}`);
  if (process.env.AIFIX_OUT) (await import("fs")).writeFileSync(process.env.AIFIX_OUT, JSON.stringify(results, null, 1));
  expect(results.filter((x) => /NO AI ANSWER/.test(x.provider)).map((x) => `${x.feature} (Claude ${x.claude})`)).toEqual([]);
});

it.runIf(PHASE === "overlay")("overlay: what the Briefing cards' AI look costs a request (no model call: AI off)", async () => {
  process.env.AI_PROVIDER = "none"; process.env.AI_FALLBACK_PROVIDER = "none"; process.env.JARVIS_CLAUDE_OFF = "1";
  const { insights, withAiAccounts } = await import("@/lib/collector/insights");
  const ins = await insights("daily", null, null, {}, "briefing");
  const times: number[] = [];
  for (let k = 0; k < 4; k++) { const t0 = Date.now(); await withAiAccounts(structuredClone(ins)); times.push(Date.now() - t0); }
  console.log(`  ${ins.briefing?.attention.length ?? 0} cards; withAiAccounts took ${times.join(", ")} ms (first includes the misses being noted)`);
  expect(times.length).toBe(4);
});

it.runIf(PHASE === "sizes")("sizes: each write-up's request, and whose budget pays for it (no model call)", async () => {
  const seen: { name: string; user: string; background: boolean; tokens: number; maxOut: number }[] = [];
  vi.resetModules();
  vi.doMock("@/lib/ai/gateway", async (orig) => ({
    ...(await orig<typeof import("@/lib/ai/gateway")>()),
    aiStatus: () => ({ available: true, problem: null, providers: [{ name: "anthropic", fast: "x", reasoning: "x" }], stt: "" }),
    generateJson: async (c: { name: string; user: string; background?: boolean; system: string; prompt: string; maxOutputTokens?: number }) => {
      seen.push({ name: c.name, user: c.user, background: !!c.background, tokens: Math.ceil((c.system.length + c.prompt.length) / 3.5), maxOut: c.maxOutputTokens ?? 1200 });
      throw new Error("probe: no model call");
    }
  }));
  const { asOf, PERIODS, periodSince } = await import("@/lib/collector/intel");
  const now = await asOf();
  const who = "collector@probe";
  const { stories } = await import("@/lib/collector/storyai");
  await stories({ hours: PERIODS.daily.hours, zone: null, dept: null, cat: null, taluk: null, since: periodSince("daily", now) }, now, who);
  await new Promise((r) => setTimeout(r, 3000));
  const { dayBrief, trendBrief } = await import("@/lib/collector/aibrief");
  await dayBrief({ period: "daily", zone: null, dept: null, taluk: null }, who);
  await trendBrief(who);
  const { analyseIncident } = await import("@/lib/collector/analysis");
  const [a] = await cases(1);
  await analyseIncident(a, who);
  for (const s of seen) console.log(`  ${s.name}: about ${s.tokens.toLocaleString("en-IN")} tokens in, up to ${s.maxOut} out; charged to "${s.user}"${s.background ? " (background)" : ""}`);
  vi.doUnmock("@/lib/ai/gateway");
  expect(seen.length).toBeGreaterThan(0);
});
