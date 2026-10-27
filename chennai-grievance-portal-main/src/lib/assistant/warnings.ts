/**
 * Questions about weather warnings and alerts (LT-15): "is there a cyclone warning?", "புயல் எச்சரிக்கை உள்ளதா?",
 * "cyclone warning irukka?". The router once called the first one out of scope. Such a question is answered from the
 * alerts lane (collector/alerts.ts): what IMD, NDMA SACHET and the news each say for Chennai, whether they agree, any hazard
 * feed that has gone quiet, and the district's playbook for weather and flood warnings (reference/categories.yaml,
 * FLOOD_RISK_SIGNAL). The question is recognised by the code, before and whatever the router decides.
 */
import { alertLane, LEVEL_NAME, type AlertLane } from "@/lib/collector/alerts";
import { categories } from "@/lib/collector/nlp";
import type { Fact } from "@/lib/assistant/types";
import type { AnswerCard } from "@/lib/assistant/answer";
import type { RowDataPacket } from "mysql2";
import intelPool, { TITLE } from "@/lib/collector/db";

/** A question about warnings or alerts for the weather (not "alerts" on the console, not a list of flooded streets). */
export const WARNING_Q = new RegExp([
  // "storm" but not the Storm Water Drain department ("how is the Storm Water Drain department doing?")
  String.raw`\b(cyclone|cyclonic|storm(?![- ]?water)|depression|low[- ]pressure)\b`,
  String.raw`\b(red|orange|yellow)\s+alert\b`,
  String.raw`\b(weather|rain|flood|heavy rain|imd|met(eorological)?|sachet|ndma|disaster)\s+(warnings?|alerts?|advisor(y|ies))\b`,
  String.raw`\b(warnings?|alerts?)\b.{0,30}\b(weather|rain|flood|cyclone|storm|imd|chennai)\b`,
  String.raw`\bany (warnings?|alerts?)\b`, String.raw`\b(is|are) there (a |any )?(warnings?|alerts?)\b`,
  // Tamil and Tanglish
  "புயல்", "எச்சரிக்கை", "ரெட் அலர்ட்", "ஆரஞ்சு அலர்ட்", "மஞ்சள் அலர்ட்", "கனமழை", String.raw`\bpuyal\b`, String.raw`\b(alert|warning)\s+(irukka|iruka|irukkaa|undaa|unda)\b`,
  String.raw`\bmazhai\s+(alert|warning|echarikkai)\b`, String.raw`\bencharikkai|echarikkai\b`
].join("|"), "i");

/** Asking for incidents, not warnings: "flooding incidents in Adyar", "how many cyclone damage complaints". */
const INCIDENTS_ASKED = /\b(incidents?|complaints?|grievances?|cases|reports? of|how many .{0,20}(flooded|waterlogg))\b|புகார்/i;

export const isWarningQuestion = (message: string) => WARNING_Q.test(message) && !INCIDENTS_ASKED.test(message);

/** "20 Oct, 06:30" from IST "2026-10-20 06:30:00". */
const when = (t: string) => `${Number(t.slice(8, 10))} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][Number(t.slice(5, 7)) - 1]}, ${t.slice(11, 16)}`;

const fact = (id: string, label: string, value: number, unit?: string): Fact => ({ id, label, value, ...(unit ? { unit } : {}) });

/** The answer's text and facts from the lane: pure, so the tests give it fixtures. */
export function warningAnswer(l: AlertLane, lang: "en" | "ta" | "tanglish" = "en"): { headline: string; markdown: string; facts: Fact[]; playbook: string[] } {
  const imd = l.sources.find((s) => s.key === "imd")!, sachet = l.sources.find((s) => s.key === "sachet")!, news = l.sources.find((s) => s.key === "news")!;
  const ev = l.event?.name ? `Cyclone ${l.event.name}` : null;
  const playbook = l.officialLevel >= 1 || l.agreement !== "none"
    ? (categories().find((c) => c.code === "FLOOD_RISK_SIGNAL")?.playbook ?? []) : [];
  const level = LEVEL_NAME[l.officialLevel];
  const levelTa = ["", "மஞ்சள்", "ஆரஞ்சு", "சிவப்பு"][l.officialLevel];
  const headline = lang === "ta"
    ? (l.officialLevel ? `சென்னைக்கு ${levelTa} எச்சரிக்கை (அதிகாரப்பூர்வம்)${ev ? `; ${ev} செய்திகளில்` : ""}` : ev ? `${ev}: செய்திகளில் உள்ளது; சென்னைக்கு அதிகாரப்பூர்வ எச்சரிக்கை இல்லை` : "சென்னைக்கு எச்சரிக்கை இல்லை")
    : lang === "tanglish"
      ? (l.officialLevel ? `Chennai-ku ${level} warning irukku (official)${ev ? `; ${ev} news-la` : ""}` : ev ? `${ev} news-la irukku; Chennai-ku official warning illa` : "Chennai-ku warning edhuvum illa")
      : (l.officialLevel ? `${level[0].toUpperCase()}${level.slice(1)} warning for Chennai${ev ? `; ${ev} in the news` : ""}` : ev ? `${ev} is in the news; no official warning for Chennai` : "No warning for Chennai");
  const lines = [
    `**${l.agreementText}**`, "",
    `- **IMD (Chennai district):** ${imd.says}`,
    `- **NDMA SACHET:** ${sachet.says}`,
    `- **News:** ${news.says}`,
    ...(l.stale.length ? [`- **Not reporting:** ${l.stale.map((s) => `${s.label}, last reported ${s.newest ? `${when(s.newest)} (${s.hours} hours ago)` : "never"}`).join("; ")}.`
      + (l.fallback ? ` Meanwhile IMD rain ${l.fallback.rain24hMm ?? "n/a"} mm in 24 hours${l.fallback.lakes.length ? `; lakes ${l.fallback.lakes.map((x) => `${x.name} ${x.pct}%`).join(", ")} full` : ""}.` : "")] : []),
    ...(playbook.length ? ["", `**Playbook for weather and flood warnings:** ${playbook.join("; ")}.`] : [])
  ];
  const facts = [
    fact("warn.official_level", "Official warning level for Chennai (0 none, 1 yellow, 2 orange, 3 red)", l.officialLevel),
    fact("warn.imd_level", "IMD warning level for Chennai today", imd.level),
    fact("warn.sachet_alerts", "NDMA SACHET alerts naming Chennai in force", sachet.chennai ? 1 : 0),
    fact("warn.news_outlets", "News outlets reporting the event", l.newsOutlets),
    fact("warn.news_chennai", "News reports that put Chennai under the warning", l.news.filter((n) => n.chennaiUnder).length),
    ...l.stale.map((s, k) => fact(`warn.stale.${k}`, `Hours since ${s.label} last reported`, s.hours ?? 0, "hours"))
  ];
  return { headline, markdown: lines.join("\n"), facts, playbook };
}

/** An open flood-family problem to clear before the weather arrives. */
export interface PrepItem { title: string; loc: string | null; zone: string | null; sev: string; overdue: boolean }

/**
 * "What should we prepare?" from the data (R-10: the answer was the generic five-step playbook, naming no ward, drain or bund):
 * the most serious open flood problems to clear first, and the zones that hold the most of them.
 */
export function prepLines(items: PrepItem[], zones: { name: string; n: number }[]): string[] {
  if (!items.length) return [];
  return ["", "**Clear first, before the weather arrives (open flood problems):**",
    ...items.map((x, k) => `${k + 1}. ${x.title}${[x.loc, x.zone].filter(Boolean).length ? ` (${[...new Set([x.loc, x.zone].filter(Boolean))].join(", ")})` : ""}: ` +
      `${x.sev.toLowerCase()}${x.overdue ? ", past its deadline" : ""}`),
    ...(zones.length ? ["", `**Most open flood problems:** ${zones.map((z) => `${z.name} ${z.n}`).join(", ")}.`] : [])];
}

async function prepNow(): Promise<{ items: PrepItem[]; zones: { name: string; n: number }[] }> {
  const codes = categories().filter((c) => c.family === "FLOOD").map((c) => c.code);
  if (!codes.length) return { items: [], zones: [] };
  const [rows] = await intelPool.query<RowDataPacket[]>(
    `SELECT ${TITLE} AS title, i.place_text AS loc, i.zone_name AS zone, i.severity_level AS sev, i.sla_breached AS overdue FROM incidents i
     WHERE i.is_open = 1 AND i.category_code IN (?) AND i.severity_level IN ('Severe', 'High') ORDER BY i.priority_score DESC LIMIT 5`, [codes]);
  const [zones] = await intelPool.query<RowDataPacket[]>(
    `SELECT i.zone_name AS name, COUNT(*) AS n FROM incidents i WHERE i.is_open = 1 AND i.category_code IN (?) AND i.zone_name IS NOT NULL
     GROUP BY i.zone_name ORDER BY n DESC LIMIT 3`, [codes]);
  return { items: rows.map((r) => ({ title: String(r.title), loc: r.loc ? String(r.loc) : null, zone: r.zone ? String(r.zone) : null, sev: String(r.sev), overdue: !!Number(r.overdue) })),
    zones: zones.map((z) => ({ name: String(z.name), n: Number(z.n) })) };
}

/** For the tool: the lane at the store's time, with the open flood problems to clear first when there is an alert. */
export async function warningsNow(now: string) {
  const l = await alertLane(now);
  const a = warningAnswer(l);
  const prep = a.playbook.length ? await prepNow().catch(() => ({ items: [], zones: [] })) : { items: [], zones: [] };
  return { lane: l, ...a, markdown: [a.markdown, ...prepLines(prep.items, prep.zones)].join("\n") };
}

/** The answer card: what each source says, the playbook, and the figures as KPIs. */
export function warningCard(base: AnswerCard, w: ReturnType<typeof warningAnswer> & { lane: AlertLane }): AnswerCard {
  const a = base.language === "en" ? w : { ...w, headline: warningAnswer(w.lane, base.language === "ta" ? "ta" : "tanglish").headline };
  const tone = (lv: number) => (lv >= 2 ? "sev" as const : lv === 1 ? "high" as const : "low" as const);
  return {
    ...base, display: "kpi", responseType: "kpi", intent: "warnings", headline: a.headline, answerMarkdown: w.markdown,
    voiceSummary: `${a.headline}. ${w.lane.agreementText}`,
    kpis: [
      { label: "Official level for Chennai", value: w.lane.officialLevel, tone: tone(w.lane.officialLevel) },
      { label: "News outlets", value: w.lane.newsOutlets, tone: "info" },
      { label: "News naming Chennai", value: w.lane.news.filter((n) => n.chennaiUnder).length },
      ...w.lane.stale.map((s) => ({ label: `${s.label}: hours silent`, value: s.hours ?? 0, tone: "sev" as const }))
    ],
    caveats: ["Official level: 0 none, 1 yellow, 2 orange, 3 red, the higher of IMD's Chennai district warning and NDMA SACHET alerts that name Chennai.",
      "Whether a news report puts Chennai under a warning is decided from its headline by fixed rules, not by the AI."],
    followUps: ["Which areas flood first in heavy rain?", "Show waterlogging complaints this week", "How full are the lakes?"],
    sources: { ...base.sources, tools: [{ name: "alerts_lane", args: {}, ms: 0 }],
      refs: [{ kind: "table", name: "observations", detail: "IMD warning level" }, { kind: "table", name: "documents", detail: "warning news" },
        { kind: "url", name: "NDMA SACHET CAP feed", detail: "https://sachet.ndma.gov.in/cap_public_website/rss/rss_india.xml" }] as AnswerCard["sources"]["refs"] }
  };
}
