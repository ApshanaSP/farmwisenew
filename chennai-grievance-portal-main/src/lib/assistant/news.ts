/**
 * Top news for the Collector: important stories, not totals. Chennai news articles are grouped into stories (the
 * pipeline's story clusters: one event reported by five outlets is one story with five sources), ranked by factual
 * signals only (severity and priority of the linked incident, independent outlets, recency, still open, citizen
 * complaints, no department record) and summarised from the store: the briefing's AI digest line when the pipeline
 * wrote one (number-checked), else the article's own summary. The chat model writes none of it.
 */
import { RowDataPacket } from "mysql2";
import intelPool from "@/lib/collector/db";
import { categories, resolvePlace } from "@/lib/collector/nlp";
import { hasPhrase, tokens, topicWords, type Topic } from "@/lib/assistant/intent";
import type { NewsStory } from "@/lib/assistant/answer";

type Row = Record<string, any>;
async function q<T = Row>(sql: string, params: unknown[] = []): Promise<T[]> {
  const [r] = await intelPool.query<RowDataPacket[]>(sql, params);
  return r as unknown as T[];
}
const num = (v: unknown) => Number(v ?? 0);
const SEV_W: Record<string, number> = { Severe: 40, High: 25, Medium: 10, Low: 3 };
/** Not news the Collector acts on. */
const SKIP_TYPES = ["entertainment_sport", "business", "service_notice"];

export interface NewsFilters {
  /** how far back */
  hours: number;
  topic?: Topic | null;
  zone?: number | null;
  /** only stories no department has a record of */
  gapsOnly?: boolean;
}

function firstSentences(s: string, max = 2): string {
  const clean = s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const parts = clean.match(/[^.!?।]+[.!?।]+/g) ?? [clean];
  return parts.slice(0, max).join(" ").trim().slice(0, 360);
}

/**
 * The current story of each article, in the order given. Story ids are re-drawn by each build's clustering while article ids
 * stay, so a search index synced before the latest build still finds the right story through its articles.
 */
export async function storiesOfDocs(docIds: string[]): Promise<string[]> {
  if (!docIds.length) return [];
  const rows = await q(`SELECT doc_id, story_id FROM documents WHERE doc_id IN (?)`, [docIds]);
  const by = new Map(rows.map((r) => [String(r.doc_id), r.story_id ? String(r.story_id) : `doc:${r.doc_id}`]));
  return [...new Set(docIds.map((id) => by.get(id)).filter(Boolean) as string[])];
}

/** Stories for the filters, best first; `storyIds` narrows to given stories (a follow-up on one). */
export async function topStories(f: NewsFilters, now: string, n = 6, storyIds?: string[]): Promise<{ stories: NewsStory[]; candidates: number }> {
  const docs = await q(
    `SELECT d.doc_id, d.story_id, d.title, d.summary, d.url, d.publisher, d.lang, d.report_type, d.is_incident, d.category_code, d.place_text,
            d.linked_incident_id, DATE_FORMAT(d.published_at, '%Y-%m-%d %H:%i:%s') AS t, TIMESTAMPDIFF(MINUTE, d.published_at, ?) AS age_min
     FROM documents d
     WHERE d.source_kind = 'news' AND d.is_district = 1 AND d.published_at > (? - INTERVAL ? HOUR) AND d.published_at <= ?
       AND (d.report_type IS NULL OR d.report_type NOT IN (?)) ${storyIds?.length ? "AND (d.story_id IN (?) OR d.doc_id IN (?))" : ""}
     ORDER BY d.published_at LIMIT 3000`,
    // an article in no story is its own story, keyed "doc:<doc_id>"
    [now, now, storyIds?.length ? 24 * 365 : f.hours, now, SKIP_TYPES,
      ...(storyIds?.length ? [storyIds, storyIds.map((k) => (k.startsWith("doc:") ? k.slice(4) : k))] : [])]);
  if (!docs.length) return { stories: [], candidates: 0 };

  // one row per story (an article without a story id is its own story)
  const groups = new Map<string, Row[]>();
  for (const d of docs) {
    const k = String(d.story_id ?? `doc:${d.doc_id}`);
    (groups.get(k) ?? groups.set(k, []).get(k)!).push(d);
  }
  const incIds = [...new Set(docs.map((d) => d.linked_incident_id).filter(Boolean))];
  const [incs, notes, depts] = await Promise.all([
    incIds.length ? q(`SELECT i.incident_id AS id, i.severity_level AS sev, i.priority_score AS priority, i.is_open AS open, i.media_only,
                              i.citizen_complaints AS complaints, i.dead, i.category_code AS cat, i.category_label AS label, i.zone_no AS zone,
                              i.zone_name, i.place_text AS loc, i.lead_dept AS dept, dp.name AS dept_name, i.status_std AS status, i.ai_summary
                       FROM incidents i LEFT JOIN ref_departments dp ON dp.code = i.lead_dept WHERE i.incident_id IN (?)`, [incIds]) : Promise.resolve([] as Row[]),
    q(`SELECT item_key, text_en, extra FROM briefing_notes WHERE section = 'news'`).catch(() => [] as Row[]),
    q(`SELECT code, name FROM ref_departments`)
  ]);
  const inc = new Map(incs.map((r) => [r.id, r]));
  const aiLine = new Map(notes.map((r) => [String(r.item_key), String(r.text_en)]));
  const deptName = new Map(depts.map((d) => [d.code, d.name]));
  const cat = new Map(categories().map((c) => [c.code, c]));

  const stories: (NewsStory & { score: number; zones: number[]; cats: string[] })[] = [];
  for (const [storyId, ds] of groups) {
    const linked = ds.map((d) => inc.get(d.linked_incident_id)).filter(Boolean) as Row[];
    const li = linked.sort((a, b) => num(b.priority) - num(a.priority))[0] ?? null;
    const lead = ds.find((d) => d.lang === "en") ?? ds[0];
    const publishers = [...new Set(ds.map((d) => String(d.publisher ?? "").trim()).filter(Boolean))];
    const sourceCount = Math.max(1, publishers.length);
    const cats = [...new Set([...ds.map((d) => d.category_code), li?.cat].filter(Boolean) as string[])];
    const ageH = Math.min(...ds.map((d) => num(d.age_min))) / 60;
    // the briefing's AI digest line, else the linked incident's AI summary (both written from facts, numbers checked)
    const ai = ds.map((d) => aiLine.get(String(d.doc_id))).find(Boolean) ?? (li?.ai_summary ? String(li.ai_summary) : null);
    const own = ds.map((d) => (d.summary ? firstSentences(String(d.summary)) : "")).find((s) => s && s.toLowerCase() !== String(d0(ds).title).toLowerCase()) ?? "";
    const newsOnly = li ? num(li.media_only) === 1 : true;
    const why: string[] = [];
    if (li?.sev === "Severe" || li?.sev === "High") why.push(`Linked to a ${String(li.sev).toLowerCase()}-severity incident`);
    if (num(li?.dead)) why.push(`${num(li.dead)} ${num(li.dead) === 1 ? "death" : "deaths"} reported`);
    if (sourceCount >= 2) why.push(`Carried by ${sourceCount} independent outlets`);
    if (li && num(li.open)) why.push("Still open");
    if (num(li?.complaints)) why.push(`${num(li.complaints)} citizen complaints`);
    if (li && newsOnly) why.push("No department has a record of it yet");
    if (!li && ds.some((d) => num(d.is_incident) === 1)) why.push("Reported incident, not yet linked to any department record");
    const score = (li ? SEV_W[li.sev] ?? 0 : 0) + Math.min(30, num(li?.priority) * 0.3) + 8 * Math.log2(1 + sourceCount)
      + Math.max(0, 20 - ageH / 2) + (li && num(li.open) ? 8 : 0) + Math.min(10, num(li?.complaints) * 2) + (newsOnly && ds.some((d) => num(d.is_incident)) ? 10 : 0)
      + (ds.some((d) => num(d.is_incident) === 1) ? 10 : 0) + num(li?.dead) * 10;
    const c = cat.get(li?.cat ?? cats[0]);
    stories.push({
      storyId, headline: String(lead.title), summary: ai ?? (own || `${sourceCount > 1 ? `${sourceCount} outlets` : String(lead.publisher ?? "One outlet")} reported this${li?.zone_name ? ` in ${li.zone_name}` : ""}.`),
      aiSummary: !!ai, publishedAt: d0(ds).t ?? null, location: li?.loc ?? lead.place_text ?? li?.zone_name ?? null,
      category: li?.label ?? c?.label ?? null, department: li?.dept_name ?? (c ? deptName.get(c.lead) ?? null : null), sourceCount,
      sources: ds.slice(0, 8).map((d) => ({ publisher: d.publisher ?? null, title: String(d.title), url: d.url ?? null, t: d.t ?? null })),
      matchedIncidentId: li?.id ?? null, departmentRecordFound: !!li && !newsOnly, whyRelevant: why.slice(0, 4),
      score, zones: linked.map((r) => r.zone).filter((z) => z != null).map(num), cats
    });
    // a story can be about a place no linked incident records (or link no incident at all): the articles' own places count
    if (f.zone && !stories[stories.length - 1].zones.includes(f.zone)) {
      for (const d of ds) {
        const placed = await resolvePlace(`${d.place_text ?? ""} ${d.title ?? ""}`);
        if (placed?.zone != null) stories[stories.length - 1].zones.push(placed.zone);
      }
    }
  }

  // topic: by the story's category or its headline's words (whole words, Tamil included); zone: any linked incident's, or an article's place
  const topicWords = f.topic ? topicPhrases(f.topic) : [];
  const keep = stories.filter((s) => (!f.topic || s.cats.some((x) => f.topic!.cats.includes(x)) || s.sources.some((x) => topicWords.some((w) => hasPhrase(tokens(x.title), w))))
    && (!f.zone || s.zones.includes(f.zone)) && (!f.gapsOnly || (!s.departmentRecordFound && s.matchedIncidentId != null)));
  keep.sort((a, b) => b.score - a.score);
  return { stories: keep.slice(0, n).map(({ score: _s, zones: _z, cats: _c, ...s }) => s), candidates: keep.length };
}

const d0 = (ds: Row[]) => ds[0];

/** Words for a topic's headline match: the topic's own words (English, Tamil, Tanglish) and its label. */
function topicPhrases(t: Topic): string[] {
  return [...new Set([...topicWords(t.key), t.label.toLowerCase()])];
}
