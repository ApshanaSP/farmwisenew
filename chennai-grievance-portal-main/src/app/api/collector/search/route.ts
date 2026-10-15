import { NextRequest, NextResponse } from "next/server";
import { collectorSession, failed } from "@/lib/collector/guard";
import { search } from "@/lib/collector/intel";
import { uniqueDatasets } from "@/lib/assistant/studiolink";

export const dynamic = "force-dynamic";

/** The console's search box: zones, departments, incidents, news, connected sources, Data Studio datasets and complaint numbers. */
export async function GET(req: NextRequest) {
  const s = await collectorSession();
  if (s instanceof NextResponse) return s;
  const text = (req.nextUrl.searchParams.get("q") || "").trim().slice(0, 80);
  if (text.length < 2) return NextResponse.json({ zones: [], depts: [], incidents: [], news: [], sources: [], datasets: [], complaints: [] });
  try {
    const found = await search(text);
    const t = text.toLowerCase();
    const datasets = uniqueDatasets().filter((d) => d.name.toLowerCase().includes(t)).slice(0, 3).map((d) => ({ id: d.id, name: d.name, rows: d.rows }));
    return NextResponse.json({ ...found, datasets });
  } catch (err) {
    return failed(err, "search");
  }
}
