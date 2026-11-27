/**
 * The decision record: every answer and every tray approval, kept on Thunai's hash-chained audit trail (store.ts, audit.ts), not a
 * new store. Each record holds the question (the Collector's own words, with phone and Aadhaar numbers, e-mails and quoted words
 * taken out; never a citizen's text), the data's snapshot time, the tools called, the model, the latency and, for an approval, who
 * approved (always the Collector: Jarvis never approves). "What did you do today?" is answered by code from today's records, in
 * English and spoken Tamil, with every figure in the summary's own values.
 */
import { z } from "zod";
import { appendAudit, readAudit } from "./store";
import { redactText } from "./privacy";
import type { AuditEvent, AuditLine } from "./audit";

export interface DecisionRecord {
  kind: "answer" | "approval";
  query: string;
  lang: "en" | "ta" | null;
  /** the data's as-of time the answer read (IST wall clock) */
  snapshot: string | null;
  tools: string[];
  /** the model id, or "rules" when code answered alone */
  model: string | null;
  /** declined: a question outside District IQ, declined in the fixed sentence (27 Nov, lib/topicguard) */
  lane: "rules" | "instant" | "planner" | "chat" | "declined" | null;
  ms: number | null;
  /** approvals only: the Collector, and how (a tap, or "confirm N" said) */
  approver: { by: string; how: "tap" | "spoken" } | null;
  /** approvals only: how many tray items */
  count: number | null;
}

/** What a client or a route sends; the approver is set from the session, never from the body. */
export const DecisionBody = z.object({
  kind: z.enum(["answer", "approval"]),
  query: z.string().max(400).default(""),
  lang: z.enum(["en", "ta"]).nullable().default(null),
  snapshot: z.string().max(40).nullable().default(null),
  tools: z.array(z.string().regex(/^[a-z_]{2,40}$/)).max(12).default([]),
  model: z.string().regex(/^[A-Za-z0-9._:/#-]{1,80}$/).nullable().default(null),
  lane: z.enum(["rules", "instant", "planner", "chat", "declined"]).nullable().default(null),
  ms: z.number().int().min(0).max(600_000).nullable().default(null),
  how: z.enum(["tap", "spoken"]).nullable().default(null),
  count: z.number().int().min(0).max(50).nullable().default(null)
});
export type DecisionInput = z.input<typeof DecisionBody>;

const QUOTED = /"[^"]*"|“[^”]*”|«[^»]*»|‘[^’]*’|(?<![\p{L}\p{N}])'[^']{2,}'(?![\p{L}\p{N}])/gu;

/** The question as the record keeps it: no phone, Aadhaar or e-mail, no quoted words, at most 200 characters. */
export function cleanQuery(q: string): string {
  return redactText(String(q ?? "").replace(QUOTED, " ")).replace(/\[hidden\]/g, " ").replace(/\s+/g, " ").trim().slice(0, 200);
}

/** The record as an audit event: an answer is Level A; an approval is the Collector's Level C act, recorded with its count. */
export function decisionEvent(input: DecisionInput, actor: string): Omit<AuditEvent, "id" | "at"> {
  const d = DecisionBody.parse(input);
  const rec: DecisionRecord = { kind: d.kind, query: cleanQuery(d.query), lang: d.lang, snapshot: d.snapshot, tools: [...new Set(d.tools)], model: d.model, lane: d.lane, ms: d.ms,
    approver: d.kind === "approval" ? { by: actor, how: d.how ?? "tap" } : null, count: d.kind === "approval" ? d.count ?? 0 : null };
  return { actor, heard: rec.query || null, plan: [], risk: d.kind === "approval" ? "C" : "A",
    approval: d.kind === "approval" ? { how: rec.approver?.how ?? "tap", count: rec.count ?? 0 } : null,
    outcome: d.kind === "approval" ? `approved ${rec.count ?? 0} in the tray` : rec.lane === "declined" ? "declined (off-topic)" : `answered${rec.lane ? ` (${rec.lane})` : ""}`, record: rec };
}

/** Server side: one decision on the trail. */
export function logDecision(actor: string, input: DecisionInput, now = new Date()): AuditLine {
  return appendAudit(decisionEvent(input, actor), now);
}

const istDay = (ms: number) => new Date(ms + 330 * 60_000).toISOString().slice(0, 10);

/** Today's records (Chennai's day), oldest first. */
export function todays(lines: AuditLine[], now: number): (DecisionRecord & { id: string; at: string })[] {
  const day = istDay(now);
  return lines.filter((l) => l.record && istDay(Date.parse(l.at)) === day).map((l) => ({ ...(l.record as DecisionRecord), id: l.id, at: l.at }));
}

export function readToday(now = Date.now()) {
  const { lines, intact } = readAudit(5000);
  return { records: todays(lines, now), intact };
}

const planned = (r: DecisionRecord) => r.lane === "planner" || r.lane === "chat" || (!!r.model && r.model !== "rules");

/** "What did you do today?": counts, lanes, data kinds, a typical latency and approvals, built by code. */
export function daySummary(records: DecisionRecord[], intact: boolean): { en: string; ta: string; values: Record<string, number> } {
  // (27 Nov: a question declined as outside District IQ is no answer: counted on its own line)
  const declined = records.filter((r) => r.kind === "answer" && r.lane === "declined").length;
  const answers = records.filter((r) => r.kind === "answer" && r.lane !== "declined"), approvals = records.filter((r) => r.kind === "approval");
  const a = answers.length, p = answers.filter(planned).length, rl = a - p;
  const tools = new Set(answers.flatMap((r) => r.tools)).size;
  const ms = answers.map((r) => r.ms).filter((x): x is number => x != null).sort((x, y) => x - y);
  const med = ms.length ? ms[Math.floor((ms.length - 1) / 2)] : null;
  const sec = med == null ? null : Math.round(med / 100) / 10;
  const ap = approvals.reduce((s, r) => s + (r.count ?? 0), 0);
  const values: Record<string, number> = { a, p, rl, tools, ap, one: 1, ...(sec != null ? { sec } : {}), ...(declined ? { dl: declined } : {}) };
  const chainEn = intact ? " The record's chain is intact." : " The record's chain is broken, so treat this with care.";
  const chainTa = intact ? " பதிவுச் சங்கிலி சரியா இருக்கு." : " பதிவுச் சங்கிலி உடைஞ்சிருக்கு, கவனமா பாருங்க.";
  const dlEn = declined ? `I declined ${declined} ${declined === 1 ? "question" : "questions"} outside what I cover.` : "";
  const dlTa = declined ? `என் பணிக்கு வெளியே இருந்த ${declined} கேள்விகளுக்கு பதில் சொல்லல.` : "";
  if (!a && !approvals.length) return { values, en: `I haven't answered anything today yet, and nothing was approved from the tray.${dlEn ? ` ${dlEn}` : ""}${chainEn}`, ta: `இன்னைக்கு இன்னும் எதுக்கும் பதில் சொல்லல; ட்ரேயில எதுவும் ஒப்புதல் ஆகல.${dlTa ? ` ${dlTa}` : ""}${chainTa}` };
  const en = [`Today I answered ${a} ${a === 1 ? "question" : "questions"}: ${rl} from the rules and ${p} with the planner.`,
    tools ? `I read ${tools} kinds of data.` : "",
    sec != null ? `A typical answer took about ${sec} seconds.` : "",
    dlEn,
    ap ? `You approved ${ap} ${ap === 1 ? "item" : "items"} in the tray; I never approve anything myself.` : "Nothing was approved from the tray."].filter(Boolean).join(" ") + chainEn;
  const ta = [`இன்னைக்கு ${a} கேள்விகளுக்கு பதில் சொன்னேன்: ${rl} விதிகள் மூலம், ${p} AI திட்டமிடல் மூலம்.`,
    tools ? `${tools} வகை தரவைப் படிச்சேன்.` : "",
    sec != null ? `வழக்கமா பதிலுக்கு சுமார் ${sec} வினாடி ஆச்சு.` : "",
    dlTa,
    ap ? `ட்ரேயில ${ap} விஷயங்களுக்கு நீங்க ஒப்புதல் கொடுத்தீங்க; நான் எதுக்கும் ஒப்புதல் கொடுக்கறதில்ல.` : "ட்ரேயில எதுவும் ஒப்புதல் ஆகல."].filter(Boolean).join(" ") + chainTa;
  return { en, ta, values };
}
