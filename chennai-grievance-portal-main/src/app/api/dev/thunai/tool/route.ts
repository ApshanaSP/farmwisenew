import { NextRequest, NextResponse } from "next/server";
import { ToolError } from "@/lib/assistant/tools";
import { serverHands } from "@/lib/thunai/data";
import type { ScopeT } from "@/lib/thunai/stage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DEV_USER = { email: "dev:thunai", role: "collector" as const, lockDept: null };
const scope = (a: Record<string, unknown>): ScopeT => ({ period: "daily", zone: null, dept: null, cat: null, taluk: null, sev: null, ...(a.scope as object) });

/** Dev only: run one of Thunai's data calls for the stand-in console's checks (no session). 404 in production. */
export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV === "production") return new NextResponse(null, { status: 404 });
  const body = (await req.json().catch(() => null)) as { tool?: string; args?: Record<string, unknown> } | null;
  if (!body?.tool || !/^[a-z_]{2,40}$/.test(body.tool)) return NextResponse.json({ error: "Send { tool, args }." }, { status: 400 });
  const h = serverHands(DEV_USER);
  const a = body.args ?? {};
  try {
    const t0 = Date.now();
    const result = body.tool === "console_severe" ? await h.severe(scope(a)) : body.tool === "console_news" ? await h.news(scope(a))
      : body.tool === "ask_map" ? await h.map(String(a.q ?? "")) : await h.tool(body.tool, a);
    return NextResponse.json({ ms: Date.now() - t0, result: body.tool.startsWith("console") || body.tool === "ask_map" ? { data: result, facts: [] } : result });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message.slice(0, 300) }, { status: e instanceof ToolError ? 400 : 500 });
  }
}
