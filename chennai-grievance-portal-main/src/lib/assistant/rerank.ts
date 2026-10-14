/**
 * The incident a question means, picked by a model from the search's best candidates. Words and embeddings alone match
 * "the Kodungaiyur gas deaths" to any Kodungaiyur record with a death in it (a road accident, an assault); the event's
 * own title says "two workers die while working inside a stormwater well". Reading the candidates side by side, a model
 * makes that connection the way a person would. One small call on the fast model; on any failure (no model, busy, too
 * slow) the search's own order stands.
 */
import { z } from "zod";
import { generateJson } from "@/lib/ai/gateway";

export interface Candidate { id: string; title: string; when: string; place: string; type: string; dead: number; severity: string }

const Pick = z.object({
  /** the candidate number (1-based) the question is about, or 0 when none of them is */
  pick: z.number().int().min(0).max(20),
  sure: z.boolean()
});

const SYSTEM = `You match a District Collector's question to the one incident it is about.
Read the question and the numbered candidates (title, date, place, type, deaths). Reply with the number of the candidate the question
means, judging by what happened, where, when and to whom: "gas deaths" can be workers who died in a sewer or stormwater well even when
the title does not say "gas"; a road accident or an assault is a different event. Reply 0 when none of them is the event asked about.
sure: true only when one candidate clearly fits.`;

export function rerankPrompt(question: string, c: Candidate[]): string {
  return [`QUESTION: ${question.slice(0, 300)}`, "CANDIDATES:",
    ...c.map((x, k) => `${k + 1}. ${x.title.slice(0, 160)} | ${x.when.slice(0, 10)} | ${x.place.slice(0, 60)} | ${x.type}${x.dead > 0 ? ` | ${x.dead} dead` : ""}${x.severity ? ` | ${x.severity}` : ""}`)
  ].join("\n");
}

/** The candidate's index the question is about (0-based), null for none, undefined when no model could say. */
export async function pickIncident(question: string, candidates: Candidate[], signal?: AbortSignal): Promise<{ index: number | null; sure: boolean } | undefined> {
  if (candidates.length < 2) return undefined;
  try {
    const r = await generateJson({ role: "fast", name: "incident-pick", schema: Pick, system: SYSTEM, prompt: rerankPrompt(question, candidates),
      temperature: 0, maxOutputTokens: 300, user: "assistant:rerank", timeoutMs: 6_000, abortSignal: signal });
    const n = r.object.pick;
    return { index: n >= 1 && n <= candidates.length ? n - 1 : null, sure: r.object.sure };
  } catch (e) {
    console.warn(`[assistant] incident pick skipped: ${(e as Error).message.slice(0, 120)}`);
    return undefined;
  }
}
