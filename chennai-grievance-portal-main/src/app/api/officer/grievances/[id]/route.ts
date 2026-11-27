import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ID_RE, failed, fresh, officerSession } from "@/lib/officer/guard";
import { WorkflowError, grievanceDetail, recordStep } from "@/lib/officer/data";

export const dynamic = "force-dynamic";

/** One grievance of the officer's department (404 for any other department's). */
export async function GET(req: NextRequest, routeCtx: { params: Promise<{ id: string }> }) {
  const params = await routeCtx.params;
  const ctx = await officerSession(req.nextUrl.searchParams);
  if (ctx instanceof NextResponse) return ctx;
  if (!ID_RE.test(params.id)) return NextResponse.json({ error: "Invalid grievance id." }, { status: 400 });
  try {
    const d = await grievanceDetail(ctx.dept, params.id);
    if (!d) return NextResponse.json({ error: "Grievance not found in your department." }, { status: 404 });
    return fresh(d);
  } catch (err) {
    return failed(err, "the grievance");
  }
}

// approve a new grievance; mark work started on an approved one (the progress update the citizen's tracker shows as In Progress)
const StepSchema = z.object({ step: z.enum(["approve", "action"]) });

/**
 * Approve a new grievance (it moves to In action), or say work has started on an approved one (`action`). Sending to the Collector and
 * closing as done carry a completion report: POST .../report.
 */
export async function POST(req: NextRequest, routeCtx: { params: Promise<{ id: string }> }) {
  const params = await routeCtx.params;
  const ctx = await officerSession(req.nextUrl.searchParams, { write: true });
  if (ctx instanceof NextResponse) return ctx;
  if (!ID_RE.test(params.id)) return NextResponse.json({ error: "Invalid grievance id." }, { status: 400 });
  const parsed = StepSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Unknown step." }, { status: 400 });
  try {
    const r = await recordStep(ctx.dept, params.id, parsed.data.step, { email: ctx.session.email, userId: ctx.session.userId });
    return fresh(r, 201);
  } catch (err) {
    if (err instanceof WorkflowError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("officer step failed", err);
    return NextResponse.json({ error: "Could not save the step." }, { status: 500 });
  }
}
