import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { collectorSession } from "@/lib/collector/guard";
import { checkRateLimit } from "@/lib/rate-limit";
import { generateJson } from "@/lib/ai/gateway";
import { AiPlanSchema, checkAiPlan, stateCard, systemPrompt } from "@/lib/thunai/plan";
import { serverWorld } from "@/lib/thunai/world";
import type { ScreenState } from "@/lib/thunai/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const Body = z.object({
  text: z.string().trim().min(1).max(300),
  state: z.object({
    page: z.enum(["overview", "briefing", "trends", "environment", "studio"]),
    period: z.enum(["daily", "weekly", "monthly", "quarterly"]),
    zone: z.number().int().min(1).max(15).nullable(),
    dept: z.string().max(40).nullable(), cat: z.string().max(60).nullable(), taluk: z.string().max(20).nullable(),
    sev: z.enum(["Severe", "High", "Medium", "Low"]).nullable(),
    mapMode: z.enum(["zones", "taluks"]),
    panel: z.string().max(40).nullable(), incident: z.string().max(80).nullable(),
    listLength: z.number().int().min(0).max(1000)
  })
});

/** A sentence the rules could not place, planned by Nova Lite and checked by code; a plan of cached sentences is reused. */
const cache = new Map<string, { steps: unknown; at: number }>();

export async function POST(req: NextRequest) {
  const s = await collectorSession();
  if (s instanceof NextResponse) return s;
  const gate = checkRateLimit(`thunai:${s.userId}`, 30, 60);
  if (!gate.allowed) return NextResponse.json({ steps: null, why: "busy" }, { status: 429 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ steps: null, why: "bad request" }, { status: 400 });
  const { text, state } = parsed.data;
  const key = `${text.toLowerCase()}|${state.page}|${state.zone}|${state.incident ? 1 : 0}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 24 * 3_600_000) return NextResponse.json({ steps: hit.steps, cached: true });
  const world = await serverWorld();
  const screen = { ...state, list: new Array(state.listLength).fill(""), lastFilter: null, lastPlace: null, now: Date.now() } as ScreenState;
  const t0 = Date.now();
  try {
    const r = await generateJson({
      role: "fast", name: "thunai_plan", schema: AiPlanSchema, system: systemPrompt(world),
      prompt: `Screen now: ${stateCard(screen)}\nThe Collector said: ${JSON.stringify(text)}`,
      temperature: 0, maxOutputTokens: 600, user: `collector:${s.userId}`, prefer: "bedrock", timeoutMs: 2500
    });
    const steps = checkAiPlan(r.object, world, text);
    cache.set(key, { steps, at: Date.now() });
    if (cache.size > 500) cache.delete(cache.keys().next().value as string);
    return NextResponse.json({ steps, ms: Date.now() - t0, provider: r.info.provider, model: r.info.model });
  } catch (err) {
    console.error("thunai plan failed", err);
    return NextResponse.json({ steps: null, why: "no model answered", ms: Date.now() - t0 });
  }
}
