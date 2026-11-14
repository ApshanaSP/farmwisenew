import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { collectorSession, failed } from "@/lib/collector/guard";
import { checkRateLimit } from "@/lib/rate-limit";
import { followedNow } from "@/lib/thunai/signals";
import { MemoryDamagedError, NoteRefusedError, changeMemory, readMemoryStrict } from "@/lib/thunai/store";
import { CATEGORY_LABELS, CAT_LABEL_TA } from "@/lib/thunai/narrate";
import { ZONE_NAMES, ZONE_TA_NAME } from "@/lib/thunai/lexicon";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const Body = z.discriminatedUnion("op", [
  z.object({ op: z.literal("follow"), kind: z.enum(["incident", "zone"]), id: z.union([z.string().regex(/^[A-Za-z0-9_-]{1,40}$/), z.number().int().min(1).max(15)]), yes: z.literal(true) }),
  z.object({ op: z.literal("unfollow"), id: z.string().min(1).max(40), yes: z.literal(true) })
]);

/** What the Collector follows (Level B standing watches). */
export async function GET() {
  const s = await collectorSession();
  if (s instanceof NextResponse) return s;
  try {
    return NextResponse.json({ follows: readMemoryStrict(s.userId).follows ?? [] });
  } catch (err) {
    if (err instanceof MemoryDamagedError) return NextResponse.json({ error: "Thunai's saved notes file is damaged.", damaged: true }, { status: 503 });
    return failed(err, "Jarvis's follows");
  }
}

/**
 * "Follow this incident / this zone" (Level B): a standing watch kept in the Collector's memory file that the watch reports back on
 * when its status, deadline or counts change. Refused without the Collector's yes. Body: {op: "follow", kind, id, yes: true}, or
 * {op: "unfollow", id, yes: true}. An op left out is "follow".
 */
export async function POST(req: NextRequest) {
  const s = await collectorSession();
  if (s instanceof NextResponse) return s;
  const gate = checkRateLimit(`thunai-follow:${s.userId}`, 20, 60);
  if (!gate.allowed) return NextResponse.json({ error: "busy" }, { status: 429 });
  const raw = await req.json().catch(() => null);
  const body = raw && typeof raw === "object" && !("op" in raw) ? { ...raw, op: "follow" } : raw;
  if (!body || (body as { yes?: unknown }).yes !== true)
    return NextResponse.json({ error: "That needs your yes first.", needsYes: true, reply: { en: "Shall I follow it? Say yes and I will.", ta: "இதைக் கவனிக்கட்டுமா? சரின்னு சொன்னா கவனிக்கிறேன்." } }, { status: 403 });
  const parsed = Body.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "That could not be read." }, { status: 400 });
  const b = parsed.data;
  try {
    if (b.op === "unfollow") {
      changeMemory(s.userId, { op: "unfollow", id: b.id, yes: true });
      return NextResponse.json({ ok: true, reply: { en: "I've stopped following it.", ta: "இனி அதைக் கவனிக்க மாட்டேன்." } });
    }
    const ref = String(b.id);
    if (b.kind === "zone" && !(Number(ref) >= 1 && Number(ref) <= 15)) return NextResponse.json({ error: "There is no such zone." }, { status: 400 });
    const [snap] = await followedNow([{ kind: b.kind, ref }]);
    if (!snap) return NextResponse.json({ error: "I can't find that in the records.", reply: { en: "I can't find that in the records.", ta: "அதைப் பதிவுகள்ல கண்டுபிடிக்க முடியல." } }, { status: 404 });
    const zone = b.kind === "zone" ? Number(ref) : snap.zone ?? null;
    const m = changeMemory(s.userId, { op: "follow", kind: b.kind, ref, cat: snap.cat ?? null, zone, snap, yes: true });
    const follow = (m.follows ?? []).find((f) => f.kind === b.kind && f.ref === ref);
    // which one, in words: the case by its kind and zone (never its title, which can be a citizen's words), the zone by its name
    const zn = zone ? { en: ZONE_NAMES[zone - 1], ta: ZONE_TA_NAME[zone] } : null;
    const label = CATEGORY_LABELS.find((c) => c.code === snap.cat)?.label.toLowerCase().replace(/&/g, "and");
    const reply = b.kind === "zone" && zn ? { en: `I'll tell you when ${zn.en}'s open or overdue cases move.`, ta: `${zn.ta} பகுதியில நிலுவை அல்லது கெடு தாண்டிய கேஸ்கள் மாறினா சொல்றேன்.` }
      : { en: `I'll tell you when the ${label ? `${label} ` : ""}case${zn ? ` in ${zn.en}` : ""} changes.`, ta: `${zn ? `${zn.ta} பகுதி ` : ""}${snap.cat && CAT_LABEL_TA[snap.cat] ? `${CAT_LABEL_TA[snap.cat]} ` : ""}கேஸ் மாறினா சொல்றேன்.` };
    return NextResponse.json({ ok: true, follow, reply });
  } catch (err) {
    if (err instanceof NoteRefusedError) return NextResponse.json({ error: err.reply.en, reply: err.reply }, { status: 403 });
    if (err instanceof MemoryDamagedError) return NextResponse.json({ error: "Thunai's saved notes file could not be read just now, so nothing was changed.", damaged: true }, { status: 503 });
    return failed(err, "Jarvis's follows");
  }
}
