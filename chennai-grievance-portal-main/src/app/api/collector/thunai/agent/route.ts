import { NextRequest, NextResponse } from "next/server";
import { collectorSession } from "@/lib/collector/guard";
import { checkRateLimit } from "@/lib/rate-limit";
import { AgentBody, handleAgent } from "@/lib/thunai/agentServer";
import { serverHands } from "@/lib/thunai/data";
import { readMemory } from "@/lib/thunai/store";
import { serverWorld } from "@/lib/thunai/world";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Thunai v2: a sentence (or a Stage control) in; console steps, a Stage screen built by code from the data, and a spoken
 * line whose figures are all on that screen, out. Read-only: drafts go to the approval tray on the console, and only the
 * Collector's own "confirm N" sends.
 */
export async function POST(req: NextRequest) {
  const s = await collectorSession();
  if (s instanceof NextResponse) return s;
  const gate = checkRateLimit(`thunai-agent:${s.userId}`, 30, 60);
  if (!gate.allowed) return NextResponse.json({ result: { kind: "none" }, why: "busy" }, { status: 429 });
  const parsed = AgentBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ result: { kind: "none" }, why: "bad request" }, { status: 400 });
  const mem = readMemory(s.userId);
  try {
    const result = await handleAgent(parsed.data, await serverWorld(), serverHands({ email: s.email, role: "collector", lockDept: null }, req.signal), `collector:${s.userId}`,
      { notes: mem.notes.map((n) => n.text), habits: mem.habits });
    return NextResponse.json({ result });
  } catch (e) {
    console.error("thunai agent failed", e);
    return NextResponse.json({ result: { kind: "none" }, why: "failed" }, { status: 500 });
  }
}
