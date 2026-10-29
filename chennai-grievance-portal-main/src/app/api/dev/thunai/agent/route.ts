import { NextRequest, NextResponse } from "next/server";
import { AgentBody, handleAgent } from "@/lib/thunai/agentServer";
import { serverHands } from "@/lib/thunai/data";
import { serverWorld } from "@/lib/thunai/world";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** The dev test console's agent (/dev/thunai): the same agent on the local store, no sign-in. 404 in production. */
export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV === "production") return new NextResponse(null, { status: 404 });
  const parsed = AgentBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ result: { kind: "none" }, why: parsed.error.issues[0]?.message ?? "bad request" }, { status: 400 });
  try {
    const result = await handleAgent(parsed.data, await serverWorld(), serverHands({ email: "dev:thunai", role: "collector", lockDept: null }, req.signal), "dev:thunai");
    return NextResponse.json({ result });
  } catch (e) {
    console.error("thunai dev agent failed", e);
    return NextResponse.json({ result: { kind: "none" }, why: (e as Error).message.slice(0, 200) }, { status: 500 });
  }
}
