/**
 * Thunai's hands on the data (server only): Ask District IQ's own tools (assistant/tools.ts, `runTool`), plus three views
 * the console already computes and the tools do not return as such:
 * - console_severe: the console's severity panel (overview().severity), so "these 6 severe cases" is exactly its list;
 * - console_news: the console's latest news (overview().allNews), newest first;
 * - ask_map: Ask the Map's own engine (lib/map/ask.ts askMap), so place-and-distance questions are answered by the same
 *   code as the console's map. No second data layer, no second spatial engine.
 */
import { overview, asOf } from "@/lib/collector/intel";
import { askMap, type AskResponse } from "@/lib/map/ask";
import { runTool } from "@/lib/assistant/tools";
import type { ToolResult } from "@/lib/assistant/types";
import type { ScopeT } from "./stage";

type Row = Record<string, unknown>;
export interface MapUser { email: string; role: "collector" | "department_officer"; lockDept: string | null }

const memo = new Map<string, { at: number; p: Promise<unknown> }>();
function once<T>(key: string, run: () => Promise<T>, ttl = 45_000): Promise<T> {
  const now = Date.now();
  for (const [k, v] of memo) if (now - v.at > ttl) memo.delete(k);
  const hit = memo.get(key);
  if (hit) return hit.p as Promise<T>;
  const p = run();
  memo.set(key, { at: now, p });
  p.catch(() => memo.delete(key));
  return p;
}

async function consoleOverview(s: ScopeT) {
  const now = await asOf();
  return once(`ov|${now}|${s.period}|${s.zone ?? ""}|${s.dept ?? ""}|${s.cat ?? ""}|${s.taluk ?? ""}`, () => overview(s.period, s.zone, s.dept, { cat: s.cat, taluk: s.taluk }));
}

export async function consoleSevere(s: ScopeT): Promise<{ rows: Row[]; counts: Record<string, number>; asOf: string }> {
  const ov = await consoleOverview(s);
  return { rows: ov.severity.rows as Row[], counts: ov.severity.counts as Record<string, number>, asOf: await asOf() };
}

export async function consoleNews(s: ScopeT): Promise<{ rows: Row[]; total: number; asOf: string }> {
  const ov = await consoleOverview(s);
  return { rows: (ov.allNews ?? []) as Row[], total: ov.allNewsTotal ?? 0, asOf: await asOf() };
}

export async function mapAnswer(q: string, user: MapUser, signal?: AbortSignal): Promise<AskResponse> {
  return askMap({ text: q, plan: null, prev: null, context: { zone: null, taluk: null, incidentId: null, drawn: null, ward: null }, user, reword: false, signal });
}

export interface Hands {
  tool: (name: string, args: Record<string, unknown>) => Promise<ToolResult>;
  severe: (s: ScopeT) => ReturnType<typeof consoleSevere>;
  news: (s: ScopeT) => ReturnType<typeof consoleNews>;
  map: (q: string) => Promise<AskResponse>;
}

export function serverHands(user: MapUser, signal?: AbortSignal): Hands {
  return { tool: (n, a) => runTool(n, a), severe: consoleSevere, news: consoleNews, map: (q) => mapAnswer(q, user, signal) };
}
