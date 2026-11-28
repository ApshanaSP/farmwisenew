import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ID_RE, fresh, officerSession } from "@/lib/officer/guard";
import { CaseError, answerInquiry } from "@/lib/cases/lifecycle";
import { MAX_NOTE } from "@/lib/cases/rules";

export const dynamic = "force-dynamic";

const Body = z.object({ inquiryId: z.number().int().positive(), text: z.string().max(MAX_NOTE) });

/** The officer's answer to the Collector's question about a case of the officer's department (the case stays as it is). */
export async function POST(req: NextRequest, routeCtx: { params: Promise<{ id: string }> }) {
  const { id } = await routeCtx.params;
  const ctx = await officerSession(req.nextUrl.searchParams, { write: true });
  if (ctx instanceof NextResponse) return ctx;
  if (!ID_RE.test(id)) return NextResponse.json({ error: "Invalid grievance id." }, { status: 400 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Write your answer to the Collector's question." }, { status: 400 });
  try {
    const r = await answerInquiry(ctx.dept.code, id, parsed.data.inquiryId, parsed.data.text,
      { email: ctx.session.email, role: "department_officer", userId: ctx.session.userId });
    return fresh({ ok: true, ...r }, 201);
  } catch (err) {
    if (err instanceof CaseError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("officer answer failed", err);
    return NextResponse.json({ error: "Could not send the answer. Try again." }, { status: 500 });
  }
}
