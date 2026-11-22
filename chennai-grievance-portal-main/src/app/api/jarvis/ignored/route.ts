/**
 * v12 (21 Nov, the critic of the 06:30-06:45 report, "silent drops"): a line Jarvis let go, as one words-free telemetry row. Between
 * 06:32 and 06:43 there were 40 engaged clips and about 11 turns, and nothing said why the rest got no answer: the address gate's
 * verdict lives only in the browser (conductor.ts), shown as a faint line for two seconds. The console now posts each one here: why (the
 * gate's code, "over-turn" for a line that replaced nothing over a question in flight, "wait-*" for v10's wait lane, "self-heard"), the
 * language, the transcriber's confidence and whether the line was engaged. Never a word of the line: telemetry.ts keeps only its codes.
 * Collector session required; rate-limited; a failure here never reaches a turn.
 */
import { NextResponse } from "next/server";
import { collectorSession } from "@/lib/collector/guard";
import { checkRateLimit } from "@/lib/rate-limit";
import { telemetry } from "@/lib/thunai/telemetry";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** a reason is a short code ("side", "cut-off-held", "wait-one-word", "over-turn"), never a sentence */
const WHY = /^[a-z][a-z0-9-]{0,39}$/;

export async function POST(req: Request) {
  const s = await collectorSession();
  if (s instanceof NextResponse) return s;
  if (!checkRateLimit(`jarvis-ignored:${s.email}`, 60, 60).allowed) return NextResponse.json({ ok: false, why: "rate-limited" }, { status: 429 });
  let b: Record<string, unknown> = {};
  try { b = (await req.json()) as Record<string, unknown>; } catch { /* an empty body is counted as "other" */ }
  const why = typeof b.why === "string" && WHY.test(b.why) ? b.why : "other";
  const lang = b.lang === "ta" || b.lang === "en" ? b.lang : undefined;
  const conf = typeof b.conf === "number" && Number.isFinite(b.conf) ? Math.max(0, Math.min(1, Math.round(b.conf * 100) / 100)) : undefined;
  telemetry("ignored", { why, lang, conf, lane: b.engaged === true ? "engaged" : "ambient", act: false, ...(b.called === true ? { kind: "called" } : {}) });
  return NextResponse.json({ ok: true });
}
