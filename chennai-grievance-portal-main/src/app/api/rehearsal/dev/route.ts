import { NextRequest, NextResponse } from "next/server";
import { facilityReach, pastRains, planFor, rehearsalState, routeBetween, RehearsalUnavailable } from "@/lib/rehearsal/engine";
import { draftDept, markDone, readTasks, sendDept } from "@/lib/rehearsal/tasks";
import { mapGeo } from "@/lib/collector/geo";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Development preview of Rain Rehearsal without a sign-in (/dev/rehearsal), in the style of /dev/assistant. Answers
 * only on a development server with a dry-run store (AWS_STORE_DRY_RUN=1: nothing reaches DynamoDB) and from this PC;
 * everywhere else it does not exist. Acts as the Collector, or as an officer of ?dept=.
 */
function allowed(req: NextRequest): boolean {
  if (process.env.NODE_ENV === "production" || process.env.AWS_STORE_DRY_RUN !== "1") return false;
  const host = (req.headers.get("host") ?? "").split(":")[0];
  return host === "localhost" || host === "127.0.0.1";
}
const DEV_USER = "dev-preview@localhost";

export async function GET(req: NextRequest) {
  if (!allowed(req)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const p = req.nextUrl.searchParams;
  const replay = p.get("replay");
  const o = { replay, manual: p.get("manual") === "1", tHelp: Number(p.get("t")) || undefined };
  try {
    switch (p.get("kind")) {
      case "reach": return NextResponse.json(await facilityReach(String(p.get("id")), o));
      case "tasks": return NextResponse.json({ dept: p.get("dept"), tasks: await readTasks({ dept: String(p.get("dept")) }) });
      case "geo": return NextResponse.json(await mapGeo());
      case "rains": return NextResponse.json(await pastRains());
      default: return NextResponse.json(await rehearsalState(o));
    }
  } catch (e) {
    if (e instanceof RehearsalUnavailable) return NextResponse.json({ error: e.message }, { status: 503 });
    console.error("rehearsal dev", e);
    return NextResponse.json({ error: String((e as Error).message) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!allowed(req)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const kind = req.nextUrl.searchParams.get("kind");
  try {
    if (kind === "done") {
      const form = await req.formData();
      const lat = Number(form.get("lat")), lon = Number(form.get("lon"));
      const r = await markDone(Number(form.get("id")), String(req.nextUrl.searchParams.get("dept")), DEV_USER, null,
        form.get("lat") !== null && Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null);
      return NextResponse.json(r.body, { status: r.status });
    }
    const b = await req.json();
    if (kind === "route") return NextResponse.json(await routeBetween(b.from, b.to, b.state ?? "rehearsal", { replay: b.replay ?? null }));
    const p = await planFor({ manual: !!b.manual });
    if (b.action === "send") {
      const r = await sendDept(p.rid, p.jobs, b.dept, b.keys, b.subject, b.body, DEV_USER, { trigger: p.trigger, rehearsal: p.rid, dev: true });
      return NextResponse.json(r.body, { status: r.status });
    }
    const want = b.keys ? new Set<string>(b.keys) : null;
    const jobs = p.jobs.filter((j) => !want || want.has(j.key));
    if (!jobs.length) return NextResponse.json({ error: "No jobs to send." }, { status: 409 });
    const drafts = await Promise.all([...new Set(jobs.map((j) => j.dept))].map((d) => draftDept(jobs, d, p.deptName(d), p.headline)));
    return NextResponse.json({ rehearsal: p.rid, drafts });
  } catch (e) {
    console.error("rehearsal dev", e);
    return NextResponse.json({ error: String((e as Error).message) }, { status: 500 });
  }
}
