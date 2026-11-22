/**
 * v15 live measure (22 Nov): how long each keep-warm step and each cold read holds the one Node thread, on the dry-run copy of the store
 * (read only). The owner's 21 Nov session had two questions with no server event at all for 17-18 s (23:16:02, 23:17:55): a request
 * waits for the thread while a step holds it. An event-loop monitor ticks every 10 ms; the longest gap inside each step is its stall.
 *   npx vitest run --config vitest.live.config.ts src/lib/thunai/v15/stall15.live.ts
 */
process.env.AWS_STORE_DRY_RUN = "1";
process.env.AWS_STORE_RELOAD_MINUTES = "100000";
process.env.AWS_DURABLE_FILE ??= "data/aws-cache/dryrun-v11/durable.sqlite";
process.env.JARVIS_KEEPWARM = "0";
import { it } from "vitest";

function monitor() {
  let last = performance.now(), max = 0, over100 = 0, sum = 0;
  const t = setInterval(() => { const now = performance.now(), gap = now - last - 10; last = now; if (gap > max) max = gap; if (gap > 100) { over100++; sum += gap; } }, 10);
  return { stop: () => { clearInterval(t); return { maxStallMs: Math.round(max), stallsOver100ms: over100, stalledMs: Math.round(sum) }; } };
}
async function measure(name: string, f: () => Promise<unknown>) {
  const m = monitor(), t0 = performance.now();
  let err: string | null = null;
  try { await f(); } catch (e) { err = (e as Error).message.slice(0, 120); }
  const r = m.stop();
  console.log(JSON.stringify({ step: name, ms: Math.round(performance.now() - t0), ...r, ...(err ? { err } : {}) }));
}

it("v15 stall measure", async () => {
  const { serverWorld } = await import("../world");
  await measure("serverWorld (cold)", () => serverWorld());
  await measure("serverWorld (warm)", () => serverWorld());
  const eng = await import("@/lib/rehearsal/engine");
  await measure("rain rehearsalState", () => eng.rehearsalState());
  await measure("rain pastRains", () => eng.pastRains());
  const imp = await import("@/lib/rehearsal/impacts");
  for (const lens of ["traffic", "power", "metro"] as const) await measure(`impacts ${lens}`, () => imp.impacts(lens));
  const city = await import("@/lib/city/now");
  for (const topic of ["traffic", "rain"] as const) await measure(`cityNow ${topic}`, () => city.cityNow(topic));
  const tools = await import("@/lib/assistant/tools");
  await measure("warmInsights daily+weekly (cold)", () => tools.warmInsights(["daily", "weekly"]));
  await measure("warmInsights daily+weekly (again)", () => tools.warmInsights(["daily", "weekly"]));
  const snap = await import("../v11/snapshot");
  await measure("districtSnapshot (cold, 60 s)", () => snap.districtSnapshot(60_000));
  await measure("warmSnapshot", () => snap.warmSnapshot());
  await measure("rain refreshRain", () => eng.refreshRain());
}, 600_000);
