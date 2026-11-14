import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { collectorSession, failed } from "@/lib/collector/guard";
import { checkRateLimit } from "@/lib/rate-limit";
import { followedNow, watchFor } from "@/lib/thunai/signals";
import { MemoryDamagedError, NoteRefusedError, changeMemory, readMemory } from "@/lib/thunai/store";
import { INTERJECT, emptyWatch, planWatch } from "@/lib/thunai/watch";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Jarvis's watch for the signed-in Collector (lib/thunai/signals.ts): the current signals, strongest first, redacted; the queue the
 * badge counts; and the one candidate the server's rules would let interrupt (the browser re-checks it with mayInterject and its
 * live state: never while the Collector speaks or a turn runs). Numbers in every line come from code. Each GET notes what was raised
 * (novelty) in the Collector's memory file. ?quiet=1: the Quiet output mode.
 */
export async function GET(req: NextRequest) {
  const s = await collectorSession();
  if (s instanceof NextResponse) return s;
  const gate = checkRateLimit(`thunai-watch:${s.userId}`, 30, 60);
  if (!gate.allowed) return NextResponse.json({ error: "busy" }, { status: 429 });
  try {
    const { signals, asOf } = await watchFor(s.userId);
    const watch = { ...emptyWatch(), ...(readMemory(s.userId).watch ?? {}) };
    const now = Date.now();
    const plan = planWatch(signals, { now, collectorSpeaking: false, turnInFlight: false, lastUserSpeech: null, quiet: req.nextUrl.searchParams.get("quiet") === "1", watch });
    try { if (signals.length) changeMemory(s.userId, { op: "watchSeen", items: signals.map((x) => ({ key: x.key, level: x.level })) }); } catch { /* a damaged or locked memory file: the watch still answers */ }
    return NextResponse.json({ asOf, signals, queue: plan.queue.map((x) => x.key), badge: plan.badge, candidate: plan.interject, why: plan.why, policy: INTERJECT });
  } catch (err) {
    return failed(err, "Jarvis's watch");
  }
}

const yes = z.literal(true);
const Op = z.discriminatedUnion("op", [
  /** the card or the badge list showed these (bookkeeping, no yes) */
  z.object({ op: z.literal("seen"), items: z.array(z.object({ key: z.string().min(1).max(120), level: z.number().int().min(0).max(10) })).max(50), told: z.boolean().optional() }),
  /** an interjection was said: it counts against the hourly budget */
  z.object({ op: z.literal("spoken"), key: z.string().min(1).max(120), level: z.number().int().min(0).max(10) }),
  /** a followed item was told: its state now becomes the one changes are measured from */
  z.object({ op: z.literal("followSeen"), id: z.string().min(1).max(40) }),
  /** "later" (a key), "not about this" / "tell me" / "unmute" (a topic): the Collector's choice, Level B */
  z.object({ op: z.literal("pref"), pref: z.enum(["later", "mute", "tell", "unmute"]), target: z.string().trim().min(1).max(120), minutes: z.number().int().min(5).max(1440).optional(), yes })
]);

export async function POST(req: NextRequest) {
  const s = await collectorSession();
  if (s instanceof NextResponse) return s;
  const gate = checkRateLimit(`thunai-watch-post:${s.userId}`, 60, 60);
  if (!gate.allowed) return NextResponse.json({ error: "busy" }, { status: 429 });
  const body = await req.json().catch(() => null);
  if (body && typeof body === "object" && (body as { op?: unknown }).op === "pref" && (body as { yes?: unknown }).yes !== true)
    return NextResponse.json({ error: "That needs your yes first.", needsYes: true, reply: { en: "That needs your yes first.", ta: "அதுக்கு முதல்ல உங்க சம்மதம் வேணும்." } }, { status: 403 });
  const parsed = Op.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "That could not be read." }, { status: 400 });
  const op = parsed.data;
  try {
    if (op.op === "seen") changeMemory(s.userId, { op: "watchSeen", items: op.items, told: op.told });
    else if (op.op === "spoken") changeMemory(s.userId, { op: "watchSpoken", key: op.key, level: op.level });
    else if (op.op === "pref") changeMemory(s.userId, { op: "watchPref", pref: op.pref, target: op.target, minutes: op.minutes, yes: true });
    else {
      const f = (readMemory(s.userId).follows ?? []).find((x) => x.id === op.id);
      if (!f) return NextResponse.json({ error: "Not followed." }, { status: 404 });
      const [snap] = await followedNow([f]);
      if (snap) changeMemory(s.userId, { op: "followSeen", id: f.id, snap });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof NoteRefusedError) return NextResponse.json({ error: err.reply.en, reply: err.reply }, { status: 403 });
    if (err instanceof MemoryDamagedError) return NextResponse.json({ error: "Thunai's saved notes file could not be read just now, so nothing was changed.", damaged: true }, { status: 503 });
    return failed(err, "Jarvis's watch");
  }
}
