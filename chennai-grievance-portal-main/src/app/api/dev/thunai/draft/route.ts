import { NextRequest, NextResponse } from "next/server";
import { draftAction } from "@/lib/collector/actionmail";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Dev only: the Take action draft for the stand-in console's approval tray (reads and drafts; there is no send here). 404 in production. */
export async function GET(req: NextRequest) {
  if (process.env.NODE_ENV === "production") return new NextResponse(null, { status: 404 });
  const id = req.nextUrl.searchParams.get("id") ?? "";
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) return NextResponse.json({ error: "Invalid incident id." }, { status: 400 });
  try {
    const d = await draftAction(id, "dev:thunai");
    return "error" in d ? NextResponse.json({ error: d.error }, { status: d.status }) : NextResponse.json(d);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message.slice(0, 200) }, { status: 500 });
  }
}
