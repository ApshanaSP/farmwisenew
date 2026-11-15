import { expect, test } from "@playwright/test";
import { chat, clearMarks, durOf, marks, modeOn, pct, saveResult, say, setup, type Ctx } from "./helpers";

/**
 * Ack and first-audio latency with mocked providers at measured round trips: Whisper 450 ms (thunai/v3 measured p50 about 460 ms),
 * the planner 1,200 ms, the server's voice 400 ms. So these figures are the browser's own overhead plus those constants, not a
 * real-provider measurement: the one real local run is reported apart.
 */

async function oneTurn(page: Parameters<typeof setup>[0], ctx: Ctx, clip: string, text: string) {
  await clearMarks(page);
  // (a clip can split at a pause, and its second part is then posted with the first: both get the sentence)
  ctx.hear.push({ text, delay: 450 }, { text, delay: 450 });
  await say(page, clip);
  await page.waitForFunction(() => (window as unknown as { __jv: { marks: { name: string }[] } }).__jv.marks.some((m) => m.name === "finding"), null, { timeout: 15_000 })
    .catch(async (e) => { console.log("on failure, what the page had:", clip, JSON.stringify({ marks: (await marks(page)).map((x) => x.name), hear: ctx.hearCalls.slice(-4), agent: ctx.agentCalls.slice(-3), left: ctx.hear.length })); throw e; });
  const m = await marks(page);
  const at = (n: string) => m.find((x) => x.name === n)?.t ?? NaN;
  // SAPI leaves a variable tail of silence after the words, so the end of speech is taken as the VAD's end event less its
  // 300 ms of required quiet
  const end = at("vadEnd") - 300;
  const r = { ack: at("ack") - end, answer: at("answer") - end, firstAudio: at("firstAudio") - end, finding: at("finding") - end, vadEnd: at("vadEnd") - end };
  // the v5 per-stage trace (section 6.4): the turn's own trace, zero at the last voiced sample; only traces that took a lane count
  const tr = await page.evaluate(() => {
    const ts = ((window as unknown as { __jv: { trace?: { zero: number; at: Record<string, number>; lane: string | null }[] } }).__jv.trace ?? []).filter((t) => t.lane);
    const t = ts[ts.length - 1];
    return t ? { lane: t.lane, stages: Object.fromEntries(Object.entries(t.at).map(([k, v]) => [k, Math.round(v - t.zero)])) } : null;
  });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);
  return { ...r, trace: tr };
}

/** p50 and p90 of each trace stage, by lane, with n (timings only) */
function traceSummary(turns: { trace: { lane: string | null; stages: Record<string, number> } | null }[]) {
  const by = new Map<string, Map<string, number[]>>();
  for (const t of turns) {
    if (!t.trace?.lane) continue;
    const lane = by.get(t.trace.lane) ?? new Map<string, number[]>();
    by.set(t.trace.lane, lane);
    for (const [k, v] of Object.entries(t.trace.stages)) lane.set(k, [...(lane.get(k) ?? []), v]);
  }
  return Object.fromEntries([...by].map(([lane, m]) => [lane, Object.fromEntries([...m].map(([k, xs]) => [k, { n: xs.length, p50: Math.round(pct(xs, 0.5)), p90: Math.round(pct(xs, 0.9)) }]))]));
}

test("latency from the end of speech, mocked providers", async ({ page }) => {
  test.setTimeout(300_000);
  const ctx = await setup(page, { sayDelay: 400, agent: () => ({ result: chat("The drains near the bridge are blocked and the main roads are under water."), delay: 1200 }) });
  await modeOn(page);
  const planner: Awaited<ReturnType<typeof oneTurn>>[] = [];
  for (const c of ["b1", "b2", "b3", "b4", "b5", "b6"]) planner.push(await oneTurn(page, ctx, c, "Jarvis, what is going on near the bridge"));
  const sum = (xs: typeof planner) => Object.fromEntries((["ack", "answer", "firstAudio", "finding", "vadEnd"] as const).map((k) => [k, { p50: Math.round(pct(xs.map((x) => x[k]), 0.5)), p90: Math.round(pct(xs.map((x) => x[k]), 0.9)) }]));
  const out = { planner: sum(planner), trace: traceSummary(planner), traceNote: "v5 trace: ms from the last voiced sample (the detector's own speech end, not its decision); server stages placed on the page clock (same machine); mocked providers, so the planner and voice figures are the mocks'; n = turns with a trace", note: "from the end of speech (VAD end less 300 ms); mocked: hear 450 ms, planner 1,200 ms, voice 400 ms; Chromium has no natural voice here, so first audio is the PCM path and the ack is on screen, not spoken" };
  saveResult("latency-mocked", out);
  console.log(JSON.stringify(out));
  expect(out.planner.ack.p50).toBeLessThanOrEqual(1200);
  expect(out.planner.answer.p50).toBeLessThanOrEqual(3500);
});

test("the acknowledgement never delays or loses the answer: the answer is on screen when it exists, even with no voice at all", async ({ page }) => {
  const ctx = await setup(page, { sayDelay: 4000, agent: () => ({ result: chat("The drains near the bridge are blocked.") }) });
  await modeOn(page);
  ctx.hear.push({ text: "Jarvis, what is going on near the bridge" });
  await say(page, "cmd_adyar");
  await page.waitForFunction(() => (window as unknown as { __jv: { hud(): { answer: string } } }).__jv.hud().answer.includes("drains"), null, { timeout: 15_000 });
  expect(await page.evaluate(() => (window as unknown as { __jv: { speaking(): boolean } }).__jv.speaking())).toBe(true);
});

test("the number gate on spoken chunks: a figure the model wrote is on screen but never spoken", async ({ page }) => {
  const ctx = await setup(page, { agent: () => ({ result: chat("There are 47 severe cases. The list is on screen.") }) });
  await modeOn(page);
  ctx.hear.push({ text: "Jarvis, how many severe cases" });
  await say(page, "cmd_adyar");
  await expect.poll(() => ctx.sayCalls.some((t) => t.includes("list is on screen")), { timeout: 15_000 }).toBe(true);
  expect(ctx.sayCalls.some((t) => t.includes("47"))).toBe(false);
  await page.waitForFunction(() => (window as unknown as { __jv: { hud(): { answer: string } } }).__jv.hud().answer.includes("47"), null, { timeout: 5000 });
});
