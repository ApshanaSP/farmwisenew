import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { collectorSession, failed } from "@/lib/collector/guard";
import { changeMemory, readMemory, type MemoryOp } from "@/lib/thunai/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const Op = z.discriminatedUnion("op", [
  z.object({ op: z.literal("note"), text: z.string().trim().min(1).max(300) }),
  z.object({ op: z.literal("forget"), id: z.string().max(80).optional(), all: z.boolean().optional() }),
  z.object({ op: z.literal("remind"), text: z.string().trim().min(1).max(200), at: z.string().datetime() }),
  z.object({ op: z.literal("reminderDone"), id: z.string().max(40) }),
  z.object({ op: z.literal("habit"), heard: z.string().trim().min(1).max(60), meant: z.string().trim().min(1).max(80) }),
  z.object({ op: z.literal("correction"), heard: z.string().trim().min(1).max(60), meant: z.string().trim().min(1).max(80) }),
  z.object({ op: z.literal("prefs"), prefs: z.object({ lang: z.enum(["en", "ta"]).optional(), mode: z.enum(["voice", "visual", "quiet"]).optional(),
    rate: z.number().min(0.6).max(1.6).optional() }) }),
  z.object({ op: z.literal("recent"), text: z.string().trim().min(1).max(200) })
]);

/** The signed-in Collector's own Thunai memory: notes, habits, preferences, reminders, recent commands. */
export async function GET() {
  const s = await collectorSession();
  if (s instanceof NextResponse) return s;
  try {
    return NextResponse.json(readMemory(s.userId));
  } catch (err) {
    return failed(err, "Thunai's memory");
  }
}

export async function POST(req: NextRequest) {
  const s = await collectorSession();
  if (s instanceof NextResponse) return s;
  const parsed = Op.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "That change could not be read." }, { status: 400 });
  try {
    return NextResponse.json(changeMemory(s.userId, parsed.data as MemoryOp));
  } catch (err) {
    return failed(err, "Thunai's memory");
  }
}
