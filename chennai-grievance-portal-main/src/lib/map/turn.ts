/**
 * v3 (owner, 22 Nov 2026: "it should understand very well what is a follow-up and which is a new one"): before a question
 * that comes after another is planned, Claude reads the conversation and decides what the new message is:
 *   follow_up     it only makes sense with what came before: it points back ("there", "that ward", "the second one", "those"),
 *                 or changes one part of the last question (only severe, last month, by zone, for its population, and zone 5,
 *                 what about hospitals, same for schools);
 *   new_question  it is complete on its own and asks about its own subject ("which school has the most complaints near it"
 *                 after a garbage ranking): nothing of the old question is carried over.
 * It also writes the message as one complete question (the "standalone" reading), which the planner reads with the old plan.
 * No word list or pattern decides any of this: the AI does, from the conversation (Claude Sonnet 5.5, AI_MAP_TURN_MODEL). A failed call (no key, busy) returns null
 * and the planner works as before. The prompt holds the officer's questions and the answers' headlines (counts and place
 * names, never a complaint's text or a person's details).
 */
import { z } from "zod";
import { generateJson, type CallInfo } from "@/lib/ai/gateway";

export const TurnRead = z.object({
  why: z.string().describe("one short line: what the new message keeps from the conversation and what it changes"),
  relation: z.enum(["follow_up", "new_question"]),
  points_to: z.number().describe("the number (1, 2 or 3) of the last answer's ranked place the message points at (there, that zone, the first one = 1; the second = 2; the third = 3); 0 when it points at none"),
  standalone: z.string().describe("the new message as one complete question that needs no conversation to understand")
});
export type TurnReading = z.infer<typeof TurnRead>;

export interface TurnHistory { q: string; a: string }

const SYSTEM = [
  "You read a conversation between a District Collector in Chennai and a map assistant that answers questions about complaints, incidents and facilities (schools, hospitals, markets and so on) on the map.",
  "The officer types fast, in English, Tamil or Tanglish (Tamil in Latin letters), with typos. You see the last few questions with the answers' headlines, the places the last answer ranked first, and the NEW MESSAGE.",
  "Decide what the new message is, as an attentive colleague would:",
  "- follow_up: it only makes full sense with the conversation. It points back (there, that ward, that zone, that school, those, them, it, these cases, the first one, the second, number 2, the top one, rendavadhu) or it changes one part of the last question and keeps the rest:",
  "  a time (last month, this week, today, yesterday), a status or severity (only severe, include closed, still open, overdue ones), a grouping (by zone, ward wise, by department, for its population, per person),",
  "  a place in place of the old one (and zone 5, what about Adyar, same in Teynampet), a kind of place in place of the old one (what about hospitals, schools too, near markets instead),",
  "  a kind of problem said as an edit (only garbage, now flooding, and thefts, what about dengue), or a step on the same cases (vs last week, where are they piling up, which is slowest, compare both, why so many, which dept is holding them).",
  "  After an overview of a place (every kind of problem in it), a follow_up keeps that place and asks about every kind unless it names one: \"only severe ones\" is the severe cases of every kind there; a kind from before the overview does not come back.",
  "  A message that drops the old kind of problem on purpose (all complaints there, every kind, total incidents, overall, everything in that ward) is a follow_up that keeps the place but asks about every kind.",
  "- new_question: it is complete on its own and asks about its own subject, even when the topic is close to the last one. A full question that names its own kind of problem or says complaints in general, its own place or kind of place, and its own shape is new: nothing of the old question carries over unless it points back.",
  "  After \"which ward has the most garbage\": \"which school has the most complaints near it\" is new (all complaints near schools, not garbage); \"show me accidents in Velachery\" is new; \"what about schools\" is a follow_up (garbage near schools).",
  "  A greeting, a thank you or a request for a joke is new.",
  "points_to: when the message points at one of the places the last answer ranked first (there, that ward, that one, the top one, the second, number 3, rendavadhu), its number; 0 otherwise (also 0 for a place the message names itself).",
  "Keep the shape of the last question in a follow_up unless the message asks for another: after \"which school has the most flooding near it\", \"hospitals?\" is \"which hospital has the most flooding near it\" (a ranking stays a ranking, a count by zone stays by zone).",
  "Then write standalone: the new message as one complete question. For a follow_up, put in everything of the last question the message does not change (the kind of problem, severe or not, open, closed or all, past deadline, the place, the distance, the time, the grouping or ranking) and what it changes, in plain English: \"with closed ones\" after \"severe accidents near Guindy\" is \"severe accidents near Guindy, open and closed\"; a message that points back names the place from the last answer's ranked places (\"there\", \"the first one\" = number 1, \"the second\" = number 2). For a new_question, standalone is the new message itself, with its spelling read.",
  "Keep every number, distance, date and name exactly as said. Never add a kind of problem, a place or a time that neither the message nor (for a follow_up) the last question has. Never copy the answers' counts into standalone: it is a question, not a summary.",
  "When it could be either: a fragment (schools?, near bus stops, by zone, last month, and thefts) leans on the last question and is a follow_up; a whole question of its own (it asks which, how many, where, what is happening or what problems, with its own subject: a kind of place, a place, or problems in general such as enna problem, what issues, any complaints) that does not point back or say same, also, too, what about or only, is a new_question, about every kind of problem unless it names one.",
  "EXAMPLES:",
  "Q1 garbage complaints by ward | A1 412 open garbage complaints across 160 wards; the most in Perambur (Ward 44) | NEW which school has most complaints near it -> new_question: which school has the most complaints near it",
  "Q1 garbage complaints by ward | A1 ... the most in Perambur (Ward 44) | NEW what is happening there -> follow_up: what is happening in Perambur (Ward 44)",
  "Q1 garbage complaints by ward | A1 ... | NEW only severe -> follow_up: severe garbage complaints by ward",
  "Q1 flooding near hospitals | A1 56 open flooding incidents within 500 m of hospitals | NEW schools? -> follow_up: open flooding incidents within 500 m of schools",
  "Q1 crime in zone 9 | A1 88 open crime incidents in Teynampet (Zone 9) | NEW and zone 10 -> follow_up: open crime incidents in zone 10",
  "Q1 crime in zone 9 | A1 ... | NEW accidents near metro stations this month -> new_question: accidents near metro stations this month",
  "Q1 flooding in zone 3 | A1 ... | NEW every complaint in that zone -> follow_up: complaints of every kind in zone 3",
  "Q1 which zone has the most dengue | A1 ... the most in Adyar (Zone 13) | NEW is it going up -> follow_up: has dengue gone up compared with the week before",
  "Q1 nearest police station to Guindy | A1 ... | NEW hospital? -> follow_up: nearest hospital to Guindy",
  "Q1 overdue complaints by department | A1 ... | NEW which ward needs my attention -> new_question: which ward needs my attention",
  "Q1 streetlight complaints ward wise | A1 ... | NEW rendavadhu ward la enna -> follow_up: what is happening in the ward ranked number 2 (name it from the ranked places)",
  "Q1 kuppai pugar | A1 ... | NEW naai thollai evlo -> new_question: how many stray dog complaints"
].join("\n");

let lastInfo: CallInfo | null = null;
/** the last turn reading's call info, cleared as it is read (the eval runner reads it) */
export function takeTurnCallInfo(): CallInfo | null { const x = lastInfo; lastInfo = null; return x; }

/** Claude's reading of a message that comes after other questions; null when it cannot be had (the planner then works as before). */
export async function readTurn(text: string, history: TurnHistory[], top: { name: string }[], ctx: { user: string; signal?: AbortSignal }): Promise<TurnReading | null> {
  if (!history.length) return null;
  const conv = history.slice(-3).map((h, i) => `Q${i + 1}: ${h.q.slice(0, 300)}\nA${i + 1}: ${h.a.slice(0, 300)}`).join("\n");
  const ranked = top.length ? `\nTHE LAST ANSWER RANKED FIRST: ${top.slice(0, 3).map((t, i) => `${i + 1}. ${t.name}`).join("; ")}` : "";
  try {
    // v3 (owner, 22 Nov 2026: "a very high powerful model"): the reader, a short prompt, runs on Claude Sonnet 5.5 (about
    // US$0.0015 a follow-up); the planner, with its long cached prompt, stays on the owner's Haiku. AI_MAP_TURN_MODEL changes it.
    const r = await generateJson({ role: "fast", name: "map-turn", claudeModel: process.env.AI_MAP_TURN_MODEL?.trim() || "claude-sonnet-5-5", schema: TurnRead, system: SYSTEM, prompt: `${conv}${ranked}\nNEW MESSAGE: ${text.slice(0, 400)}`,
      temperature: 0, maxOutputTokens: 300, user: ctx.user, abortSignal: ctx.signal, chat: true, feature: "map", timeoutMs: 8_000 });
    lastInfo = r.info;
    if (process.env.MAP_AI_DEBUG === "1") console.log("MAPTURN", JSON.stringify(r.object));
    const s = r.object.standalone.trim();
    return { ...r.object, standalone: s || text };
  } catch (e) {
    if (ctx.signal?.aborted) throw e;
    console.warn("[map] turn reading failed:", (e as Error).message?.slice(0, 160));
    return null;
  }
}
