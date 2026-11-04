import { NextRequest, NextResponse } from "next/server";
import { requireConfirm } from "@/lib/security/stepup";
import { z } from "zod";
import { collectorSession } from "@/lib/collector/guard";
import { draftBatchAction, sendBatchAction } from "@/lib/collector/actionmail";
import { answerRows } from "@/lib/map/ask";
import { PlanError } from "@/lib/map/execute";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const Draft = z.object({ action: z.literal("draft"), plan: z.unknown(), question: z.string().max(400).nullable().default(null), dept: z.string().regex(/^[A-Z0-9-]{2,20}$/).nullable().default(null) });

/**
 * Ask the Map's "Send to department" (the Collector only): "draft" re-runs the answer on the server and drafts one email
 * per responsible department; "send" sends one approved draft (sandbox by default), with a follow-up per case and an
 * audit row. Nothing is sent without the Collector pressing Approve.
 */
export async function POST(req: NextRequest) {
  const s = await collectorSession();
  if (s instanceof NextResponse) return s;
  const body = await req.json().catch(() => null);
  if (body?.action === "send") {
    // the email goes out in the Collector's name: confirmed for exactly this department, these cases and this text
    const ids = Array.isArray(body.ids) ? [...body.ids].map(String).sort() : [];
    const c = await requireConfirm(req, s, "send_email", `Send 1 email to ${String(body.dept ?? "the department")} about ${ids.length} ${ids.length === 1 ? "case" : "cases"}: "${String(body.subject ?? "").slice(0, 90)}"`,
      { dept: body.dept ?? null, ids, subject: body.subject ?? null, body: body.body ?? null });
    if (!c.ok) return c.res;
    const r = await sendBatchAction(body, s.email, c.grant?.fac ?? null);
    return NextResponse.json(r.body, { status: r.status });
  }
  const b = Draft.safeParse(body);
  if (!b.success) return NextResponse.json({ error: "Nothing to send." }, { status: 400 });
  try {
    const { rows } = await answerRows(b.data.plan as never, { email: s.email, role: "collector", lockDept: null });
    const open = rows.filter((r) => r.open);
    const byDept = new Map<string, { name: string; ids: string[] }>();
    for (const r of open) (byDept.get(r.dept) ?? byDept.set(r.dept, { name: r.deptName, ids: [] }).get(r.dept)!).ids.push(r.id);
    const depts = [...byDept.entries()].filter(([d]) => !b.data.dept || d === b.data.dept).sort((a, b) => b[1].ids.length - a[1].ids.length);
    const drafts = await Promise.all(depts.map(([d, v]) => draftBatchAction(v.ids, d, v.name, b.data.question ?? "the map's answer")));
    return NextResponse.json({ drafts, closed: rows.length - open.length });
  } catch (e) {
    if (e instanceof PlanError) return NextResponse.json({ error: e.message }, { status: 400 });
    console.error("[map] send draft failed", e);
    return NextResponse.json({ error: "The drafts could not be made." }, { status: 500 });
  }
}
