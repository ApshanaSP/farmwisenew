import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { failed, fresh, officerSession } from "@/lib/officer/guard";
import { newsDone, newsForDept } from "@/lib/collector/newsaction";

export const dynamic = "force-dynamic";

/**
 * News the Collector sent this department that has no case (lib/collector/newsaction.ts): GET lists it; POST { key, email, note } is the
 * officer's answer (what was done), which closes its follow-up and shows on the Collector's story.
 */
export async function GET(req: NextRequest) {
  const ctx = await officerSession(req.nextUrl.searchParams);
  if (ctx instanceof NextResponse) return ctx;
  try { return fresh({ items: await newsForDept(ctx.dept.code) }); } catch (err) { return failed(err, "the news from the Collector"); }
}

const Done = z.object({ key: z.string().regex(/^NEWS-[A-Za-z0-9_-]{4,80}$/), email: z.number().int().positive(), note: z.string().trim().min(5).max(600) });

export async function POST(req: NextRequest) {
  const ctx = await officerSession(req.nextUrl.searchParams, { write: true });
  if (ctx instanceof NextResponse) return ctx;
  const p = Done.safeParse(await req.json().catch(() => null));
  if (!p.success) return NextResponse.json({ error: "Write in a line what was done (5 characters or more)." }, { status: 400 });
  try {
    const ok = await newsDone(p.data.key, p.data.email, ctx.dept.code, ctx.dept.name, p.data.note, String(ctx.session.email ?? ""));
    return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "That news item is not your department's." }, { status: 404 });
  } catch (err) { return failed(err, "the answer"); }
}
