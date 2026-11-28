import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireConfirm } from "@/lib/security/stepup";
import { collectorSession, failed } from "@/lib/collector/guard";
import { CaseError, askDepartment, caseLifecycle, caseNow, reopenCase } from "@/lib/cases/lifecycle";
import { MAX_NOTE } from "@/lib/cases/rules";
import { resolutionsFor } from "@/lib/cases/resolution";

export const dynamic = "force-dynamic";

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

/** A case's lifecycle for the Collector's case page: can it be reopened or asked about, its reopens, closes, questions and answers. */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const s = await collectorSession();
  if (s instanceof NextResponse) return s;
  const { id } = await ctx.params;
  if (!ID_RE.test(id)) return NextResponse.json({ error: "Invalid incident id." }, { status: 400 });
  try {
    const c = await caseLifecycle(id);
    if (!c) return NextResponse.json({ error: "Incident not found." }, { status: 404 });
    // how a closed case was resolved: the completion report's photo and remark, who approved it (lib/cases/resolution.ts)
    const resolution = c.open ? null : (await resolutionsFor([id], { forCollector: true }))[id] ?? null;
    return NextResponse.json({ ...c, resolution }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return failed(err, "the case history");
  }
}

const Body = z.object({ action: z.enum(["reopen", "ask"]), note: z.string().max(MAX_NOTE) });

/**
 * reopen: a closed case goes back to its department as Reopened, with the Collector's remark (required), confirmed with the password
 * like every decision that changes a case. ask: a question to the department about a resolved case; the case stays closed (no password:
 * like a note, it changes nothing).
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const s = await collectorSession();
  if (s instanceof NextResponse) return s;
  const { id } = await ctx.params;
  if (!ID_RE.test(id)) return NextResponse.json({ error: "Invalid incident id." }, { status: 400 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Say what to do (reopen or ask) and add your remarks." }, { status: 400 });
  const { action, note } = parsed.data;
  const who = { email: s.email, role: s.role, userId: s.userId ?? null };
  try {
    if (action === "reopen") {
      // the case is checked before the password is asked (officer-day-16): an open case, or a remark too short, is refused first
      const c = await caseNow(id);
      if (!c) return NextResponse.json({ error: "Incident not found." }, { status: 404 });
      if (Number(c.open) === 1) return NextResponse.json({ error: "This case is still open, so there is nothing to reopen." }, { status: 409 });
      if (note.trim().length < 10) return NextResponse.json({ error: "Write what is still wrong, or what the department should check, before reopening the case." }, { status: 400 });
      const confirm = await requireConfirm(req, s, "decide", `Reopen case ${id} and send it back to ${c.dept_name ?? c.dept ?? "the department"}`,
        { ids: [id], decision: "reopen", note: note.trim() });
      if (!confirm.ok) return confirm.res;
      const r = await reopenCase(id, note, who);
      return NextResponse.json({ ok: true, ...r }, { status: 201 });
    }
    const r = await askDepartment(id, note, who);
    return NextResponse.json({ ok: true, ...r }, { status: r.again ? 200 : 201 });
  } catch (err) {
    if (err instanceof CaseError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("collector case action failed", err);
    return NextResponse.json({ error: "Could not save it. Try again." }, { status: 500 });
  }
}
