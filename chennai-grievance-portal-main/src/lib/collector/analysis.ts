/**
 * The analysis the Collector reads first in a pop-up: what happened (a few sentences that join every report into one
 * account) and why it needs the Collector (each reason with its evidence), written by AI from the incident's or the
 * story's own records, and checked: every number in the text must be one of the facts' numbers, else the rules'
 * wording stays. Cached per incident and state (it is written again when a report, the department or an
 * instruction changes it), in memory and on disk (data/aws-cache/analysis.json).
 */
import fs from "fs";
import path from "path";
import { z } from "zod";
import { generateJson } from "@/lib/ai/gateway";
import intelPool from "@/lib/collector/db";
import { incident, newsArticles, newsDoc, type Plain } from "@/lib/collector/intel";
import { fullText } from "@/lib/collector/fulltext";

type Row = Record<string, any>;

export interface Analysis {
  what: string;
  /** reasons the Collector should act, each with its evidence; empty when the department has it in hand */
  why: { title: string; detail: string }[];
  /** when nothing needs the Collector: why it is in hand */
  handled: string;
  next: string;
  model: string;
}

const Schema = z.object({
  what_happened: z.string().describe("3 to 5 sentences"),
  why: z.array(z.object({ title: z.string().describe("at most 10 words"), detail: z.string().describe("1 or 2 sentences with the evidence") }))
    .describe("0 to 4 reasons"),
  handled: z.string().describe("one sentence, only when the list of reasons is empty; else empty"),
  next_step: z.string().describe("one concrete step: who does what, by when")
});

const RULES = `Use only the facts given. Every number, name, place, date and time you write must appear in the facts; do not
estimate, round differently or add figures. Do not guess causes: when a cause is given, say who reported it ("residents say").
Write plain, formal Indian English for a senior officer: complete sentences, no markdown, no bullet symbols, no headings, no
"key facts" lists, no filler such as "it is important to note". Write dates and times the way the facts give them (e.g. "on 6 Oct at 07:42"); never as 2026-10-06. Do not repeat department codes such as GCC-ELE: use department names.`;

const INCIDENT_SYSTEM = `You are the senior analyst in the office of the District Collector of Chennai. From the records of ONE
incident, write the short analysis the Collector reads before deciding what to do.
${RULES}
what_happened: 3 to 5 sentences that join all the reports into one account: what the problem is and exactly where; when it was
first reported and how it developed across the reports (which sources, how many, over what time, whether it is spreading or
recurring); who is affected and how badly; what the department has done so far and where it stands now (status, deadline).
why: up to 4 reasons the Collector personally should step in, only those the facts support: a missed deadline, danger to life or
to many people, vulnerable people, a hospital or school affected, the problem recurring or spreading, several departments needed,
no response or no completion report from the department, public or media attention. Each: a title of at most 10 words and a
detail of 1 or 2 sentences giving the evidence from the facts. If the department has it in hand and nothing needs the Collector,
give no reasons and say why in "handled".
next_step: one concrete step: who should do what, and by when if the facts give a deadline.`;

const NEWS_SYSTEM = `You are the media analyst in the office of the District Collector of Chennai. From the news reports of ONE
story (several outlets may cover it), write the short analysis the Collector reads.
${RULES}
what_happened: 3 to 5 sentences joining every outlet's report into one account: what happened and exactly where in Chennai; when;
who was involved or affected and how badly (casualties, people affected); what the police, the Corporation or other officials
have said or done, as reported; whether the story is still developing.
why: up to 3 reasons the Collector should know or act, only those the reports support: danger to public safety, a duty of the
district administration or a department, public anger or protest, people still at risk, a follow-up the administration must do.
Each: a title of at most 10 words and a detail of 1 or 2 sentences with the evidence. If it is routine information (a notice or
schedule) that needs nothing from the Collector, give no reasons and say so in "handled".
next_step: one concrete step for the administration (which department, what to do), or "No action needed" for routine notices.`;

// ------------------------------------------------------------------ cache --

const FILE = path.join(process.cwd(), "data", "aws-cache", "analysis.json");
declare global {
  // eslint-disable-next-line no-var
  var __analysis: { cache: Map<string, Analysis> | null; busy: Map<string, Promise<Analysis | null>> } | undefined;
}
const g = (global.__analysis ??= { cache: null, busy: new Map() });
function cache(): Map<string, Analysis> {
  if (g.cache) return g.cache;
  try { g.cache = new Map(Object.entries(JSON.parse(fs.readFileSync(FILE, "utf8")))); } catch { g.cache = new Map(); }
  return g.cache!;
}
function remember(key: string, a: Analysis) {
  const c = cache();
  c.set(key, a);
  while (c.size > 3000) c.delete(c.keys().next().value!);
  try { fs.mkdirSync(path.dirname(FILE), { recursive: true }); fs.writeFileSync(FILE, JSON.stringify(Object.fromEntries(c))); } catch { /* read-only disk */ }
}

/** Every number in the text must be a number of the facts (small counts and clock times aside). */
function numbersHold(text: string, facts: string): boolean {
  const have = new Set((facts.match(/\d+(?:[.,]\d+)*/g) ?? []).map((n) => n.replace(/,/g, "")));
  for (const n of text.match(/\d+(?:[.,]\d+)*/g) ?? []) {
    const v = n.replace(/,/g, "");
    if (Number(v) <= 12 || have.has(v) || have.has(String(Number(v)))) continue;
    return false;
  }
  return true;
}

async function write(key: string, system: string, facts: string, user: string): Promise<Analysis | null> {
  const hit = cache().get(key);
  if (hit) return hit;
  if (g.busy.has(key)) return g.busy.get(key)!;
  const run = (async () => {
    for (let k = 0; k < 2; k++) {
      try {
        const r = await generateJson({ role: "fast", name: "analysis", schema: Schema, system, temperature: k ? 0 : 0.2, maxOutputTokens: 900, user,
          prompt: k ? `${facts}\n\nYour last answer used a number that is not in these facts. Use only numbers from the facts.` : facts });
        const o = r.object;
        const all = [o.what_happened, ...o.why.flatMap((w) => [w.title, w.detail]), o.handled, o.next_step].join(" ");
        if (o.what_happened.trim().length < 40 || !numbersHold(all, facts)) continue;
        const a: Analysis = { what: o.what_happened.trim(), why: o.why.filter((w) => w.title && w.detail).slice(0, 4),
          handled: o.why.length ? "" : o.handled.trim(), next: o.next_step.trim(), model: r.info.model };
        remember(key, a);
        return a;
      } catch (e) {
        console.warn(`[analysis] ${key}: ${(e as Error).message}`);
        return null;
      }
    }
    return null;
  })().finally(() => g.busy.delete(key));
  g.busy.set(key, run);
  return run;
}

// --------------------------------------------------------------- incident --

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "2026-10-06 04:32:55" -> "6 Oct, 04:32": the way the analysis should write it. */
const when = (t: unknown) => {
  const m = String(t ?? "").match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/);
  return m ? `${Number(m[3])} ${MON[Number(m[2]) - 1]}${m[4] && `${m[4]}:${m[5]}` !== "00:00" ? `, ${m[4]}:${m[5]}` : ""}` : String(t ?? "");
};

const SRC: Record<string, string> = { grievance: "citizen complaint", police: "police report", pwd: "PWD field record", hospital: "hospital report",
  news: "news report", imd: "IMD warning" };

export async function analyseIncident(id: string, user: string): Promise<Analysis | null> {
  const d = await incident(id);
  if (!d) return null;
  const i = d.incident as Row;
  const why = i.why as Plain;
  const reports = d.reports as Row[];
  const deptReports = d.deptReports as Row[];
  const emails = d.emails as Row[];
  const [cat] = await intelPool.query(`SELECT playbook FROM ref_categories WHERE category_code = ?`, [i.cat_code])
    .then((r) => r[0] as Row[]).catch(() => [] as Row[]);
  const facts = [
    `Incident ${i.id}: ${i.title}`,
    `Category: ${i.type}. Severity: ${i.sev} (${String(i.severity_reasons ?? "").replace(/\|/g, "; ")}). Status: ${i.status}.`,
    `Place: ${[i.loc, i.zone_name ? `${i.zone_name} zone` : null, i.ward ? `ward ${i.ward}` : null, i.taluk_name ? `${i.taluk_name} taluk` : null].filter(Boolean).join(", ") || "Chennai"}.`,
    `Lead department: ${i.dept_name ?? i.dept}${i.depts_involved ? `; departments involved: ${String(i.depts_involved).replace(/\|/g, ", ")}` : ""}. Field officer: ${i.officer ?? "not named"}.`,
    `First reported ${when(i.t)}; open for ${Math.round(Number(i.hours_open) || 0)} hours. Deadline ${i.sla_due ? when(i.sla_due) : "none"}${Number(i.breached) ? " (missed)" : ""}.`,
    [i.dead ? `${i.dead} dead` : "", i.injured ? `${i.injured} injured` : "", i.persons_affected ? `about ${i.persons_affected} people affected` : "",
      i.vulnerable ? `vulnerable: ${String(i.vulnerable).replace(/\|/g, ", ")}` : ""].filter(Boolean).join("; "),
    `Signals: ${[i.priority_reasons, i.attention_reason].filter(Boolean).join("; ").replace(/\|/g, "; ")}`,
    why.facts.length ? `Noted: ${why.facts.join("; ")}.` : "",
    `${Number(i.complaints) || 0} citizen complaints; ${reports.length} reports in all${d.group.length ? `, from ${d.group.length + 1} incidents merged as one problem` : ""}.`,
    "Reports, oldest first:",
    ...reports.slice(0, 18).map((r) => `- ${when(r.t)} · ${r.source === "news" ? `${r.publisher ?? "news"} (news)` : SRC[r.source] ?? r.source}: ${String(r.title_en || r.text || r.title || "").replace(/\s+/g, " ").slice(0, 220)}`),
    deptReports.length ? `Department's completion report (${when(deptReports[0].t)}): "${String(deptReports[0].remarks).slice(0, 240)}" with ${deptReports[0].photos.length} photos.`
      : "No completion report from the department.",
    emails.length ? `The Collector sent an instruction on ${when(emails[0].t)}: "${emails[0].subject}".` : "",
    cat?.playbook ? `Standard steps for this category: ${String(cat.playbook).replace(/\|/g, "; ")}.` : ""
  ].filter(Boolean).join("\n");
  const key = `inc2|${id}|${i.updated}|${reports.length}|${deptReports.length}|${emails.length}|${i.status}`;
  return write(key, INCIDENT_SYSTEM, facts, user);
}

// ------------------------------------------------------------------- news --

export async function analyseStory(ids: string[], user: string): Promise<Analysis | null> {
  const arts = (await newsArticles(ids)) as Row[];
  if (!arts.length) return null;
  let withBody: Row | undefined = arts.find((a) => a.body);
  if (!withBody) {
    // only headlines stored: read one article from its outlet (cached; at most 10 s here)
    const first = arts[0] as Row;
    const doc = await newsDoc(String(first.id));
    const t = doc ? await Promise.race([fullText(doc as Parameters<typeof fullText>[0]), new Promise<null>((r) => setTimeout(() => r(null), 10_000))]) : null;
    if (t?.text) withBody = { ...first, body: t.text };
  }
  const facts = [
    `${arts.length} reports from ${new Set(arts.map((a) => a.publisher)).size} outlets.`,
    ...arts.slice(0, 12).map((a: Row) => {
      const ai = a.ai ? Object.entries(a.ai).map(([k, v]) => `${k}: ${v}`).join("; ") : "";
      return `- ${when(a.t)} · ${a.publisher}: ${a.lang !== "en" && a.title_en ? `${a.title_en} (${a.title})` : a.title}${a.summary && a.summary !== a.title ? ` — ${String(a.summary).slice(0, 240)}` : ""}${ai ? ` [${ai}]` : ""}`;
    }),
    withBody ? `Full text of the ${withBody.publisher} report:\n${String(withBody.body).replace(/\s+/g, " ").slice(0, 3500)}` : ""
  ].filter(Boolean).join("\n");
  const key = `news2|${[...ids].sort().join(",").slice(0, 400)}|${arts.length}|${withBody ? 1 : 0}`;
  return write(key, NEWS_SYSTEM, facts, user);
}
