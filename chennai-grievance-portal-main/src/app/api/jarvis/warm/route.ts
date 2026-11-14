/**
 * Jarvis's warm-up on mode-on (v4 Pillar 2): one tiny real Claude call whose prefix is the planner's own, so the first spoken turn
 * reads its system prompt from the prompt cache instead of writing it. Collector session required; rate-limited like the other
 * Jarvis routes; at most once in 4 minutes per user (the cache lives 5); counted in the ledger (lane warm); a no-op without a key
 * (or with a refused one, or with no room left in Claude's day). Never an error to the console: the answer says what happened.
 *
 * The prefix comes from round.ts (lane L2): plannerWarm(w) gives the first planner call's system and schema when it exists, so the
 * warm carries the same structured-output format (a format changes the cached prompt); else plannerSystems(w)[0], warmed with
 * max_tokens 0 and no format. Groq is not warmed: an idle connection is closed within seconds, so a warm on mode-on would not
 * reach the first turn, and the only free request (unauthenticated) proves nothing.
 */
import { NextResponse } from "next/server";
import type { z } from "zod";
import { claudeConfigured, claudeWarm } from "@/lib/ai/claude";
import { collectorSession } from "@/lib/collector/guard";
import { checkRateLimit } from "@/lib/rate-limit";
import * as round from "@/lib/thunai/round";
import type { World } from "@/lib/thunai/types";
import { serverWorld } from "@/lib/thunai/world";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** the cache keeps a prefix 5 minutes after its last use: one warm in 4 is enough (not exported: a route file exports only handlers) */
const WARM_EVERY_MS = 4 * 60_000;

declare global {
  // eslint-disable-next-line no-var
  var __jarvisWarm: Map<string, number> | undefined;
}
const last = () => (global.__jarvisWarm ??= new Map());

type Planner = { plannerWarm?: (w: World) => { system: string; schema: z.ZodTypeAny } | null; plannerSystems?: (w: World) => string[] };

export async function POST() {
  const s = await collectorSession();
  if (s instanceof NextResponse) return s;
  if (!checkRateLimit(`jarvis-warm:${s.email}`, 6, 60).allowed) return NextResponse.json({ warmed: false, why: "rate-limited" }, { status: 429 });
  if (!claudeConfigured()) return NextResponse.json({ warmed: false, why: "no-key" });
  const who = String(s.userId), now = Date.now(), at = last().get(who) ?? 0;
  if (now - at < WARM_EVERY_MS) return NextResponse.json({ warmed: false, why: "recent", nextInS: Math.ceil((at + WARM_EVERY_MS - now) / 1000) });
  const p = round as unknown as Planner;
  let prefix: { system: string; schema?: z.ZodTypeAny } | null = null;
  try {
    const world = await serverWorld();
    const pw = p.plannerWarm?.(world);
    prefix = pw ?? (p.plannerSystems ? { system: p.plannerSystems(world)[0] } : null);
  } catch (e) {
    console.warn("[jarvis] warm: no planner prefix:", (e as Error).message?.slice(0, 120));
  }
  if (!prefix?.system) return NextResponse.json({ warmed: false, why: "no-prefix" });
  last().set(who, now);
  const r = await claudeWarm(prefix);
  if (!r) return NextResponse.json({ warmed: false, why: "failed" });
  // exact: the warm carried the planner's schema too, so its prefix is the very one the first turn sends (structured outputs add
  // their own instructions to the prompt); without it, only the system text is warmed and the first turn's cacheRead says if it held
  return NextResponse.json({ warmed: true, exact: !!prefix.schema, model: r.model, ms: r.ms, path: r.path, maxTokens: r.maxTokens, cacheWrite: r.cacheWrite, cacheRead: r.cacheRead });
}
