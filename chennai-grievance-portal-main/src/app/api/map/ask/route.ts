import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assistantSession } from "@/lib/assistant/access";
import { checkRateLimit } from "@/lib/rate-limit";
import { askMap } from "@/lib/map/ask";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const Body = z.object({
  text: z.string().trim().max(400).nullable().default(null),
  /** a plan edited by a chip: run as is (checked again on the server) */
  plan: z.unknown().nullable().default(null),
  /** the conversation's current plan, for follow-ups */
  prev: z.unknown().nullable().default(null),
  context: z.object({
    zone: z.number().int().min(1).max(15).nullable().catch(null),
    taluk: z.string().regex(/^TLK-[A-Z]{3}$/).nullable().catch(null),
    incidentId: z.string().max(80).nullable().catch(null),
    ward: z.number().int().min(1).max(200).nullable().catch(null),
    drawn: z.object({ lat: z.number().min(12.5).max(13.6), lon: z.number().min(79.9).max(80.6), r: z.number().min(50).max(5000) }).nullable().catch(null)
  }).default({ zone: null, taluk: null, incidentId: null, ward: null, drawn: null }),
  // the AI analyst (/api/map/insight) explains the answer, so the headline sentence is not reworded by default: the answer stays instant
  reword: z.boolean().default(false)
});

/**
 * Ask the Map: a question (or a chip's edit, or a drawn circle) in, a typed plan, its answer, chips, trace, list, map
 * features and camera out. The Collector asks about the whole district; a department officer is locked to their own
 * department by the server (the department comes from the database, never from the request).
 */
export async function POST(req: NextRequest) {
  const s = await assistantSession();
  if (s instanceof NextResponse) return s;
  const gate = checkRateLimit(`map:${s.userId}`, 40, 60);
  if (!gate.allowed) return NextResponse.json({ error: `Too many questions in a minute. Try again in ${gate.retryAfterSeconds} s.` }, { status: 429 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "That question could not be read. Please try again." }, { status: 400 });
  const b = parsed.data;
  if (!b.text && !b.plan && !b.context.drawn && !b.context.ward && !b.context.incidentId) return NextResponse.json({ error: "Type a question first." }, { status: 400 });
  try {
    const r = await askMap({ text: b.text, plan: (b.plan as never) ?? null, prev: (b.prev as never) ?? null, context: b.context, reword: b.reword && !b.plan,
      user: { email: s.email, role: s.role, lockDept: s.lockDept }, signal: req.signal });
    return NextResponse.json(r);
  } catch (e) {
    console.error("[map] ask failed", e);
    return NextResponse.json({ error: "The map could not answer that just now. Please try again." }, { status: 500 });
  }
}
