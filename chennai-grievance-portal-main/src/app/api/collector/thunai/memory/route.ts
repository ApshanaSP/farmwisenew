import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { collectorSession, failed } from "@/lib/collector/guard";
import { checkRateLimit } from "@/lib/rate-limit";
import { MemoryDamagedError, NoteRefusedError, changeMemory, readMemoryStrict, rememberList, type Memory, type MemoryOp } from "@/lib/thunai/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const yes = z.literal(true);
const Op = z.discriminatedUnion("op", [
  // a note kept and everything forgotten wait for the Collector's yes too (needsYes, below); the yes is not passed on
  z.object({ op: z.literal("note"), text: z.string().trim().min(1).max(300) }),
  z.object({ op: z.literal("forget"), id: z.string().max(80).optional(), all: z.boolean().optional() }),
  z.object({ op: z.literal("remind"), text: z.string().trim().min(1).max(200), at: z.string().datetime() }),
  z.object({ op: z.literal("reminderDone"), id: z.string().max(40) }),
  z.object({ op: z.literal("habit"), heard: z.string().trim().min(1).max(60), meant: z.string().trim().min(1).max(80) }),
  z.object({ op: z.literal("correction"), heard: z.string().trim().min(1).max(60), meant: z.string().trim().min(1).max(80) }),
  z.object({ op: z.literal("prefs"), prefs: z.object({ lang: z.enum(["en", "ta"]).optional(), mode: z.enum(["voice", "visual", "quiet"]).optional(),
    rate: z.number().min(0.6).max(1.6).optional() }) }),
  z.object({ op: z.literal("recent"), text: z.string().trim().min(1).max(200) }),
  z.object({ op: z.literal("pin"), pin: z.object({ id: z.string().regex(/^[a-z0-9]{4,20}$/), title: z.string().trim().min(1).max(200), recipe: z.string().max(20),
    slots: z.record(z.unknown()).refine((x) => JSON.stringify(x).length < 2000, "too large"), at: z.string().max(40) }) }),
  z.object({ op: z.literal("unpin"), id: z.string().max(20) }),
  // v4, Level B: each needs the Collector's yes (a spoken or typed "yes", or a tap), sent as yes: true
  // v5 G3: the turn that asked (kept with the note) and the Stage's news or complaint text (for the copy check only, never kept)
  z.object({ op: z.literal("remember"), text: z.string().trim().min(1).max(300), said: z.string().max(600).optional(), turn: z.string().max(40).optional(),
    shown: z.array(z.string().max(300)).max(60).optional(), yes }),
  z.object({ op: z.literal("forgetLast"), yes }),
  z.object({ op: z.literal("reset"), yes }),
  z.object({ op: z.literal("watchPref"), pref: z.enum(["later", "mute", "tell", "unmute"]), target: z.string().trim().min(1).max(120),
    minutes: z.number().int().min(5).max(1440).optional(), yes })
]);
const LEVEL_B = new Set(["remember", "forgetLast", "reset", "watchPref"]);
/**
 * A change that keeps or wipes what Jarvis remembers needs the Collector's yes: the Level B ops, the legacy `note` (a note kept) and
 * `forget` with all: true (everything wiped). Forgetting one item by its own button in the memory panel is the Collector's own tap.
 */
const needsYes = (b: unknown): boolean => {
  if (!b || typeof b !== "object") return false;
  const x = b as { op?: unknown; all?: unknown; yes?: unknown };
  return x.yes !== true && (LEVEL_B.has(String(x.op)) || x.op === "note" || (x.op === "forget" && x.all === true));
};

/** The memory as the page shows it: the watch's own bookkeeping stays on the server. */
const shown = (m: Memory) => { const { watch: _w, ...rest } = m; return rest; };

/**
 * The signed-in Collector's own Thunai memory: notes, habits, preferences, reminders, recent commands, pins, follows.
 * ?view=list: "what do you remember about me?" as a list and one spoken line (counts only, built by code).
 */
export async function GET(req: NextRequest) {
  const s = await collectorSession();
  if (s instanceof NextResponse) return s;
  try {
    const m = readMemoryStrict(s.userId);
    if (req.nextUrl.searchParams.get("view") === "list") return NextResponse.json(rememberList(m));
    return NextResponse.json(shown(m));
  } catch (err) {
    if (err instanceof MemoryDamagedError) return NextResponse.json({ error: "Thunai's saved notes file is damaged, so it is not shown as empty. The next change keeps a copy of it aside.", damaged: true }, { status: 503 });
    return failed(err, "Thunai's memory");
  }
}

export async function POST(req: NextRequest) {
  const s = await collectorSession();
  if (s instanceof NextResponse) return s;
  const gate = checkRateLimit(`thunai-memory:${s.userId}`, 60, 60);
  if (!gate.allowed) return NextResponse.json({ error: "Too many changes at once; try again in a minute." }, { status: 429 });
  const body = await req.json().catch(() => null);
  // a Level B change (a note, forgetting everything) with no yes is refused with its reason, not as an unreadable body
  if (needsYes(body))
    return NextResponse.json({ error: "That needs your yes first.", needsYes: true, reply: { en: "That needs your yes first.", ta: "அதுக்கு முதல்ல உங்க சம்மதம் வேணும்." } }, { status: 403 });
  const parsed = Op.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "That change could not be read." }, { status: 400 });
  try {
    return NextResponse.json(shown(changeMemory(s.userId, parsed.data as MemoryOp)));
  } catch (err) {
    if (err instanceof NoteRefusedError) return NextResponse.json({ error: err.reply.en, refused: err.why, reply: err.reply }, { status: err.why === "no-yes" ? 403 : 422 });
    if (err instanceof MemoryDamagedError) return NextResponse.json({ error: "Thunai's saved notes file could not be read just now, so nothing was changed. Try again in a moment.", damaged: true }, { status: 503 });
    return failed(err, "Thunai's memory");
  }
}
