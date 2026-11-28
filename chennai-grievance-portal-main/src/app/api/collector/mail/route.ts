import { NextRequest, NextResponse } from "next/server";
import { requireConfirm } from "@/lib/security/stepup";
import { collectorSession } from "@/lib/collector/guard";
import { draftComposed, mailDepts, mailPeople, sendComposed } from "@/lib/collector/composemail";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * The Collector's own mail to any department officer or staff member (lib/collector/composemail.ts).
 * GET: the departments; GET ?dept=CODE: who in it can receive mail. POST { action: "draft", dept, to, topic }: an AI draft (nothing sent).
 * POST { action: "send", dept, to, subject, body }: sends the approved mail (password confirm, sandbox by default).
 */
export async function GET(req: NextRequest) {
  const s = await collectorSession();
  if (s instanceof NextResponse) return s;
  const dept = req.nextUrl.searchParams.get("dept");
  try {
    if (dept) return /^[A-Z0-9-]{2,20}$/.test(dept) ? NextResponse.json({ people: await mailPeople(dept) }) : NextResponse.json({ error: "Which department?" }, { status: 400 });
    return NextResponse.json({ depts: await mailDepts() });
  } catch (e) {
    console.error("[mail] list failed", e);
    return NextResponse.json({ error: "Could not read the departments." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const s = await collectorSession();
  if (s instanceof NextResponse) return s;
  const b = await req.json().catch(() => null);
  try {
    if (b?.action === "draft") {
      const topic = String(b.topic ?? "").trim();
      if (topic.length < 5) return NextResponse.json({ error: "Say in a line what the mail is about." }, { status: 400 });
      const d = await draftComposed({ dept: String(b.dept ?? ""), to: String(b.to ?? "officer"), topic }, s.email);
      return "error" in d ? NextResponse.json({ error: d.error }, { status: d.status }) : NextResponse.json(d);
    }
    if (b?.action === "send") {
      const c = await requireConfirm(req, s, "send_email", `Send your mail to ${String(b.dept ?? "a department")}: "${String(b.subject ?? "").slice(0, 90)}"`,
        { dept: b.dept ?? null, to: b.to ?? null, subject: b.subject ?? null, body: b.body ?? null });
      if (!c.ok) return c.res;
      const r = await sendComposed(b, s.email, c.grant?.fac ?? null);
      return NextResponse.json(r.body, { status: r.status });
    }
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (e) {
    console.error("[mail] failed", e);
    return NextResponse.json({ error: "The mail could not be made just now." }, { status: 500 });
  }
}
