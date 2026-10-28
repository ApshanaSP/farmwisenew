/**
 * The AI analyst on a map answer: a short reading of what the answer means for the Collector, up to three actions with
 * the department that owns each, and one thing to watch. It writes only from the fact pack the executor and the
 * insight engine computed (counts, zones, departments, deadlines, repeat spots, the change on the period before);
 * every sentence whose numbers are not in the facts is dropped before it is shown. It runs after the answer is on
 * the map (POST /api/map/insight), so the map never waits for it. Cached for 5 minutes per plan.
 */
import { z } from "zod";
import { generateJson } from "@/lib/ai/gateway";
import { extractNumbers } from "@/lib/assistant/verify";
import { askMap, type AskInput, type AskResponse } from "./ask";
import type { Plan } from "./plan";

const Analyst = z.object({
  summary: z.string().describe("Two or three plain sentences: what this answer means for the District Collector today"),
  actions: z.array(z.object({ text: z.string().describe("One concrete action, starting with a verb"), dept: z.string().nullable().describe("The department code that owns it, from the facts, or null") }))
    .describe("At most three actions, most important first"),
  watch: z.string().nullable().describe("One thing to watch over the next days, or null")
});

export interface AnalystOut {
  summary: string;
  actions: { text: string; dept: string | null }[];
  watch: string | null;
  model: string;
  /** sentences dropped because their numbers were not in the facts */
  dropped: number;
}

declare global {
  // eslint-disable-next-line no-var
  var __mapAnalyst: Map<string, { at: number; out: AnalystOut }> | undefined;
}

/** The facts the analyst may use: everything is a computed number or a name from the store. */
export function factPack(r: AskResponse): string[] {
  const a = r.answer!;
  const lines = [`Answer: ${a.headline.replace(/ · (map layer ready|வரைபட அடுக்கு தயார்)\.?$/, "")}`];
  if (a.meaning) lines.push(`Meaning: ${a.meaning}`);
  for (const d of a.depts.slice(0, 5)) lines.push(`Department ${d.code} (${d.name}) holds ${d.n}`);
  for (const i of r.insights) lines.push(`Finding: ${i.en}`);
  for (const t of r.trace) lines.push(`Method: ${t.note_en}`);
  if (r.unplaced.length) lines.push(`${r.unplaced.length} have no exact place (counted, not pinned)`);
  const top = r.rows.slice(0, 5).map((x) => `${x.title} (${x.sev}, ${x.status}${x.overdue ? ", past deadline" : ""}, ward ${x.ward ?? "?"}, ${x.deptName})`);
  if (top.length) lines.push(`Highest priority cases: ${top.join("; ")}`);
  return lines;
}

/** Keeps only sentences whose numbers all appear in the facts (a rewording may never add a figure). */
export function verified(text: string, allowed: Set<number>): { text: string; dropped: number } {
  const parts = text.split(/(?<=[.!?।])\s+/).filter(Boolean);
  const keep = parts.filter((s) => extractNumbers(s).every((x) => allowed.has(x.value)));
  return { text: keep.join(" ").trim(), dropped: parts.length - keep.length };
}

export async function analyse(input: { plan: Plan; user: AskInput["user"]; signal?: AbortSignal }): Promise<AnalystOut | null> {
  const key = `${input.user.role}|${input.user.lockDept ?? ""}|${JSON.stringify(input.plan)}`;
  const cache = (global.__mapAnalyst ??= new Map());
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 5 * 60_000) return hit.out;
  const r = await askMap({ text: null, plan: input.plan, prev: null, user: input.user, reword: false, signal: input.signal,
    context: { zone: null, taluk: null, incidentId: null, ward: null, drawn: null } });
  if (r.kind !== "answer" || !r.answer || !r.total) return null;
  const facts = factPack(r);
  const allowed = new Set(facts.flatMap((l) => extractNumbers(l).map((x) => x.value)));
  const lang = r.lang === "ta" ? "Tamil (Tamil script)" : r.lang === "tanglish" ? "Tanglish (Tamil in Latin letters)" : "plain Indian English";
  const res = await generateJson({
    role: "reasoning", name: "map-analyst", schema: Analyst, temperature: 0.2, maxOutputTokens: 600, user: input.user.email, abortSignal: input.signal, chat: true,
    system: [
      "You are the analyst beside the District Collector of Chennai, reading one answer from the district map.",
      "Write for a busy Collector: what this means today, what to do, and who should do it. Plain words, no jargon, no markdown.",
      "Use ONLY the facts given. Never invent a number, place, name, cause or date. Quote numbers exactly as given; if a number is not in the facts, do not write it.",
      "Do not repeat the headline. Prefer findings that change what the Collector does: deadlines missed, repeat spots, rising counts, concentration, vulnerable people mentioned.",
      "Actions are concrete and assignable (send, inspect, verify, schedule, escalate). The dept field is a department code from the facts or null.",
      `Write in ${lang}.`
    ].join("\n"),
    prompt: `FACTS:\n${facts.map((l) => `- ${l}`).join("\n")}`
  });
  const s = verified(res.object.summary, allowed);
  const depts = new Set(r.answer.depts.map((d) => d.code));
  const actions = res.object.actions.slice(0, 3).map((x) => ({ ...verified(x.text, allowed), dept: x.dept && depts.has(x.dept) ? x.dept : null }))
    .filter((x) => x.text).map((x) => ({ text: x.text, dept: x.dept }));
  const watch = res.object.watch ? verified(res.object.watch, allowed) : null;
  const out: AnalystOut = { summary: s.text, actions, watch: watch?.text || null, model: `${res.info.provider} · ${res.info.model}`,
    dropped: s.dropped + (watch?.dropped ?? 0) + res.object.actions.length - actions.length };
  if (!out.summary && !out.actions.length) return null;
  cache.set(key, { at: Date.now(), out });
  if (cache.size > 200) cache.delete(cache.keys().next().value!);
  return out;
}
