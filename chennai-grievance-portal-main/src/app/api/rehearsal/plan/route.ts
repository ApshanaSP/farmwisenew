import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { collectorSession, failed } from "@/lib/collector/guard";
import { planFor, RehearsalUnavailable } from "@/lib/rehearsal/engine";
import { draftDept, sendDept } from "@/lib/rehearsal/tasks";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const Key = z.string().regex(/^[a-z]+:[A-Za-z0-9:_.|~-]{1,120}$/);
const Draft = z.object({ action: z.literal("draft"), manual: z.boolean().default(false), keys: z.array(Key).max(500).nullable().default(null) });
const Send = z.object({
  action: z.literal("send"), manual: z.boolean().default(false), dept: z.string().regex(/^[A-Z0-9-]{2,20}$/), keys: z.array(Key).min(1).max(500),
  subject: z.string().trim().min(5).max(160), body: z.string().trim().min(40).max(8000)
});

/**
 * Send tasks (the Collector only, live rehearsals only): "draft" makes one email per department from the server's own
 * plan (optionally only the ticked jobs); "send" sends one approved draft (sandbox by default) and creates its tasks.
 * Nothing is sent before Approve.
 */
export async function POST(req: NextRequest) {
  const s = await collectorSession();
  if (s instanceof NextResponse) return s;
  const raw = await req.json().catch(() => null);
  try {
    if (raw?.action === "send") {
      const b = Send.safeParse(raw);
      if (!b.success) return NextResponse.json({ error: "Write a subject and a message before sending." }, { status: 400 });
      const p = await planFor({ manual: b.data.manual });
      const r = await sendDept(p.rid, p.jobs, b.data.dept, b.data.keys, b.data.subject, b.data.body, s.email, { trigger: p.trigger, rehearsal: p.rid });
      return NextResponse.json(r.body, { status: r.status });
    }
    const b = Draft.safeParse(raw);
    if (!b.success) return NextResponse.json({ error: "Nothing to draft." }, { status: 400 });
    const p = await planFor({ manual: b.data.manual });
    const want = b.data.keys ? new Set(b.data.keys) : null;
    const jobs = p.jobs.filter((j) => !want || want.has(j.key));
    if (!jobs.length) return NextResponse.json({ error: "No jobs to send: every job is already a task, or none is ticked." }, { status: 409 });
    const depts = [...new Set(jobs.map((j) => j.dept))];
    const drafts = await Promise.all(depts.map((d) => draftDept(jobs, d, p.deptName(d), p.headline)));
    return NextResponse.json({ rehearsal: p.rid, drafts });
  } catch (e) {
    if (e instanceof RehearsalUnavailable) return NextResponse.json({ error: e.message }, { status: 503 });
    return failed(e, "the rehearsal plan");
  }
}
