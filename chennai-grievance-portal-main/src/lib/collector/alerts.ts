/**
 * The alerts lane (LT-01, LT-02): weather and disaster warnings for Chennai from every source that has one, side by side,
 * so the console says what each source says and whether they agree, instead of one source's "no warning".
 *
 *   IMD       the district warning level the IMD collector reads each hour (observations, imd_warning_level, 0-3),
 *             today and the next days.
 *   SACHET    NDMA's Common Alerting Protocol feed. There is no per-state feed (rss_tamil_nadu.xml is 404), so the
 *             all-India feed is read (https://sachet.ndma.gov.in/cap_public_website/rss/rss_india.xml), at most every
 *             15 minutes, and only alerts that name Chennai are kept; each one's CAP file gives its severity and expiry.
 *             The last copy is kept in data/aws-cache/ for when the site cannot be reached.
 *   News      articles of the last 48 hours typed as alerts (reporttype.ts: forecasts and warnings). From each headline: the hazard, its
 *             name (Cyclone Arnab), the colour level, the districts it is for and when. An AI reads the headlines when
 *             one is available (in the background; the rules' reading is used until it answers); either way the code,
 *             not the AI, decides whether Chennai is one of the districts the alert is for.
 *
 * The lane then says how the sources compare ("news: orange alert, 11 outlets; IMD: no warning for Chennai"), sets the
 * banner at the top of the console, and gives the Briefing its status. While an alert is active, a hazard feed that has
 * gone quiet (the CFM-DSS flood gauges) turns the banner red and the lane falls back to IMD rain and the lake levels.
 */
import fs from "fs";
import path from "path";
import { RowDataPacket } from "mysql2";
import { z } from "zod";
import intelPool from "@/lib/collector/db";
import { generateJson, aiStatus } from "@/lib/ai/gateway";

type Row = Record<string, any>;
async function q<T = Row>(sql: string, params: unknown[] = []): Promise<T[]> {
  const [r] = await intelPool.query<RowDataPacket[]>(sql, params);
  return r as unknown as T[];
}

export type Hazard = "cyclone" | "heavy_rain" | "thunderstorm" | "flood" | "heat" | "other";
/** 0 none, 1 yellow, 2 orange, 3 red (IMD's colour code) */
export type Level = 0 | 1 | 2 | 3;
export const LEVEL_NAME = ["no warning", "yellow", "orange", "red"] as const;
const HAZARD_NAME: Record<Hazard, string> = { cyclone: "Cyclone", heavy_rain: "Heavy rain", thunderstorm: "Thunderstorm", flood: "Flood", heat: "Heat", other: "Weather" };

// ------------------------------------------------------------- headlines --

/** Tamil Nadu's districts as headlines write them (plus Puducherry and Karaikal, which IMD Chennai also covers). */
const DISTRICTS = ["Chennai", "Tiruvallur", "Thiruvallur", "Kancheepuram", "Kanchipuram", "Chengalpattu", "Ranipet", "Vellore", "Tirupattur",
  "Tiruvannamalai", "Villupuram", "Viluppuram", "Kallakurichi", "Cuddalore", "Mayiladuthurai", "Nagapattinam", "Tiruvarur", "Thiruvarur",
  "Thanjavur", "Pudukkottai", "Ramanathapuram", "Sivaganga", "Madurai", "Theni", "Dindigul", "Virudhunagar", "Thoothukudi", "Thoothukkudi",
  "Tirunelveli", "Tenkasi", "Kanniyakumari", "Kanyakumari", "Coimbatore", "Tiruppur", "Erode", "Salem", "Namakkal", "Karur", "Tiruchirappalli",
  "Trichy", "Perambalur", "Ariyalur", "Krishnagiri", "Dharmapuri", "Nilgiris", "Puducherry", "Pondicherry", "Karaikal",
  "சென்னை", "திருவள்ளூர்", "காஞ்சிபுரம்", "செங்கல்பட்டு"];
const CHENNAI = /\bchennai\b|சென்னை/i;
const STOP_NAMES = new Set(["chennai", "tamil", "nadu", "bay", "bengal", "severe", "breaking", "arabian", "the", "a", "live", "approaching", "rains", "rain",
  "weather", "update", "latest", "very", "cyclonic", "storm", "cyclone", "super", "new", "big", "massive", "heavy", "imd", "red", "orange", "yellow", "alert"]);

export interface AlertRead {
  hazard: Hazard | null;
  /** the storm's name, "Arnab" */
  name: string | null;
  level: Level | null;
  /** districts the alert is for, as named */
  districts: string[];
  /** how many districts it is for, when the headline gives a count ("Orange alert for 3 districts") */
  districtCount: number | null;
  /** the headline names Chennai at all (also in a question: "Will Chennai be affected?") */
  chennaiNamed: boolean;
  when: string | null;
}

/** What a warning headline says, by rules. */
export function readHeadline(...texts: (string | null | undefined)[]): AlertRead {
  const t = texts.filter(Boolean).join(" \n ").replace(/[‘’]/g, "'");
  const hazard: Hazard | null = /cyclone|cyclonic|storm|புயல்/i.test(t) ? "cyclone" : /thunder|lightning|squall|இடி/i.test(t) ? "thunderstorm"
    : /flood|வெள்ள/i.test(t) ? "flood" : /heat ?wave|hot weather|வெப்ப/i.test(t) ? "heat" : /rain|downpour|மழை/i.test(t) ? "heavy_rain" : null;
  let name: string | null = null;
  // the name is capitalised; the word "cyclone" may be either case
  for (const m of t.matchAll(/(?:[Cc]yclone|CYCLONE|[Ss]torm)\s+'?([A-Z][a-z]{2,})'?|'([A-Z][a-z]{2,})'\s*(?:[Cc]yclone|[Ss]torm)?|\b([A-Z][a-z]{2,})\s+(?:[Cc]yclone|CYCLONE)\b/g)) {
    const n = m[1] ?? m[2] ?? m[3];
    if (n && !STOP_NAMES.has(n.toLowerCase())) { name = n; break; }
  }
  const lv = /\bred\b|சிவப்பு/i.test(t) && /alert|warning|எச்சரிக்கை/i.test(t) ? 3 : /\borange\b|ஆரஞ்சு/i.test(t) && /alert|warning|எச்சரிக்கை/i.test(t) ? 2
    : /\byellow\b|மஞ்சள்/i.test(t) && /alert|warning|எச்சரிக்கை/i.test(t) ? 1 : null;
  const named = DISTRICTS.map((d) => ({ d, at: t.search(new RegExp(`(^|[^\\w])${d}([^\\w]|$)`, "i")) })).filter((x) => x.at >= 0)
    .sort((a, b) => a.at - b.at).map((x) => x.d);
  const count = t.match(/\b(\d{1,2}|three|four|five|six|seven|eight|nine|ten)\s+districts\b/i);
  const words: Record<string, number> = { three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
  const when = t.match(/\b(today|tonight|tomorrow|next \d+ hours|day after tomorrow|this week)\b|இன்று|நாளை/i)?.[0] ?? null;
  // the districts the alert is FOR: those after "alert/warning for" or "in", not those in a question about the effect
  // each clause on its own: "Red alert for 3 districts today - How will the rain be in Chennai?" is two clauses, and the
  // second only asks about Chennai; a clause that is a question puts no district under the alert
  const clauses: { c: string; question: boolean }[] = [];
  for (const m of t.matchAll(/([^?!|\n:;–—]+?)(\?+|[!|\n:;–—]+|\.(?:\s|\.|$)|\s-\s|$)/g)) if (m[1].trim()) clauses.push({ c: m[1], question: m[2].includes("?") });
  const forClause = clauses.filter((x) => !x.question).flatMap((x) => [...x.c.matchAll(/(?:alert|warning|warned)\w*\s+(?:\w+\s+){0,2}?(?:for|in|over|to)\s+(.{0,120})/gi)].map((m) => m[1])).join(" | ");
  // Tamil: "சென்னைக்கு ... எச்சரிக்கை" (a warning for Chennai) in one clause that is not a question
  const forTa = clauses.filter((x) => !x.question && /எச்சரிக்கை|அலர்ட்/.test(x.c)).map((x) => x.c).join(" | ");
  const districts = named.filter((d) => new RegExp(`(^|[^\\w])${d}([^\\w]|$)`, "i").test(forClause) || (/[^\x00-\x7F]/.test(d) && forTa.includes(d))
    || clauses.some((x) => !x.question && new RegExp(`${d}[^,]{0,20}(?:on|under)\\s+(?:red|orange|yellow)\\s+alert`, "i").test(x.c)));
  return { hazard, name, level: lv as Level | null, districts: [...new Set(districts.map(canon))], districtCount: count ? Number(count[1]) || words[count[1].toLowerCase()] || null : null,
    chennaiNamed: CHENNAI.test(t), when };
}
const canon = (d: string) => (/^சென்னை$/.test(d) ? "Chennai" : d);

/** Is Chennai one of the districts this alert is for? Code, not the AI: the district list must name it. */
export const chennaiUnder = (r: Pick<AlertRead, "districts">) => r.districts.some((d) => CHENNAI.test(d));

// ------------------------------------------------------------------ SACHET --

export interface SachetItem {
  id: string; title: string; author: string; link: string;
  /** IST "YYYY-MM-DD HH:MM:SS" */
  t: string;
  chennai: boolean;
  severity: string | null; event: string | null; expires: string | null; area: string | null;
}

const decode = (s: string) => s.replace(/<!\[CDATA\[|\]\]>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
const tag = (xml: string, name: string) => { const m = xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i")); return m ? decode(m[1]) : null; };
export const ist = (d: Date) => new Date(d.getTime() + 330 * 60_000).toISOString().slice(0, 19).replace("T", " ");

/** The all-India RSS feed's items. */
export function parseSachetRss(xml: string): SachetItem[] {
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)].map((m) => {
    const x = m[1], title = tag(x, "title") ?? "", pub = tag(x, "pubDate");
    return { id: tag(x, "guid") ?? tag(x, "link") ?? title, title, author: tag(x, "author") ?? "", link: tag(x, "link") ?? "",
      t: pub ? ist(new Date(pub)) : "", chennai: CHENNAI.test(title), severity: null, event: null, expires: null, area: null };
  });
}

/** One CAP file's severity, event, expiry and area. */
export function parseCap(xml: string): { severity: string | null; event: string | null; expires: string | null; area: string | null } {
  const ns = (n: string) => tag(xml, `cap:${n}`) ?? tag(xml, n);
  const exp = ns("expires");
  return { severity: ns("severity"), event: ns("event"), expires: exp ? ist(new Date(exp)) : null, area: ns("areaDesc") };
}

/** CAP severity on IMD's colour scale. */
export const capLevel = (severity: string | null): Level => (/extreme/i.test(severity ?? "") ? 3 : /severe/i.test(severity ?? "") ? 2 : /moderate/i.test(severity ?? "") ? 1 : 0);

const SACHET_URL = "https://sachet.ndma.gov.in/cap_public_website/rss/rss_india.xml";
const SACHET_FILE = path.join(process.cwd(), "data", "aws-cache", "sachet-chennai.json");
const SACHET_EVERY_MS = 15 * 60_000;
declare global {
  // eslint-disable-next-line no-var
  var __sachet: { at: number; items: SachetItem[]; error: string | null; loading: Promise<void> | null } | undefined;
}

async function fetchText(url: string, ms: number): Promise<string> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctl.signal, headers: { "User-Agent": "DistrictIQ/1.0 (Chennai Collector dashboard; reads the public CAP feed every 15 minutes)" } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.text();
  } finally { clearTimeout(timer); }
}

/** SACHET alerts that name Chennai, from the last 48 hours: fetched at most every 15 minutes, the last copy when the site is down. */
export async function sachetChennai(): Promise<{ items: SachetItem[]; error: string | null; at: number | null }> {
  const g = (global.__sachet ??= (() => {
    try { const s = JSON.parse(fs.readFileSync(SACHET_FILE, "utf8")); return { at: Number(s.at) || 0, items: s.items ?? [], error: null, loading: null }; }
    catch { return { at: 0, items: [], error: null, loading: null }; }
  })());
  if (process.env.SACHET_OFF !== "1" && Date.now() - g.at > SACHET_EVERY_MS && !g.loading) {
    g.loading = (async () => {
      try {
        const items = parseSachetRss(await fetchText(SACHET_URL, 12_000));
        const since = ist(new Date(Date.now() - 48 * 3600_000));
        const mine = items.filter((i) => i.chennai && i.t >= since).slice(0, 12);
        // the CAP file of each: severity and expiry (a few small files)
        await Promise.all(mine.map(async (i) => {
          const old = g.items.find((o: SachetItem) => o.id === i.id && o.severity);
          if (old) return Object.assign(i, { severity: old.severity, event: old.event, expires: old.expires, area: old.area });
          try { Object.assign(i, parseCap(await fetchText(i.link, 10_000))); } catch { /* the RSS title is enough to show it */ }
        }));
        Object.assign(g, { at: Date.now(), items: mine, error: null });
        try { fs.writeFileSync(SACHET_FILE, JSON.stringify({ at: g.at, items: mine })); } catch { /* read-only disk: memory only */ }
      } catch (e) {
        Object.assign(g, { at: Date.now() - SACHET_EVERY_MS + 3 * 60_000, error: (e as Error).message }); // try again in 3 minutes
      } finally { g.loading = null; }
    })();
  }
  // the first call waits briefly for a fresh copy; later ones use what is there
  if (g.loading && !g.items.length) await Promise.race([g.loading, new Promise((ok) => setTimeout(ok, 4000))]);
  return { items: g.items, error: g.error, at: g.at || null };
}

// --------------------------------------------------------- AI extraction --

const AiRead = z.object({
  items: z.array(z.object({
    id: z.string(), hazard: z.enum(["cyclone", "heavy_rain", "thunderstorm", "flood", "heat", "other", "none"]),
    name: z.string(), level: z.enum(["red", "orange", "yellow", "none"]), districts: z.array(z.string()), when: z.string()
  }))
});
type AiReadT = z.infer<typeof AiRead>;
declare global {
  // eslint-disable-next-line no-var
  var __alertAi: { key: string; out: Map<string, AlertRead> | null; busy: Promise<void> | null } | undefined;
}

/**
 * The AI's reading of the headlines (hazard, name, level, the districts the alert is for, when), in the background: null
 * until it has answered for exactly these headlines. The districts are only what the headline lists; Chennai's
 * membership is still decided by chennaiUnder().
 */
function aiReads(docs: { id: string; text: string }[]): Map<string, AlertRead> | null {
  if (!docs.length || !aiStatus().available) return null;
  const key = docs.map((d) => d.id).sort().join(",");
  const g = (global.__alertAi ??= { key: "", out: null, busy: null });
  if (g.key === key && g.out) return g.out;
  if (g.key !== key && !g.busy) {
    g.key = key; g.out = null;
    g.busy = generateJson<AiReadT>({
      role: "fast", name: "alert-headlines", schema: AiRead, temperature: 0, maxOutputTokens: 2400, user: "system", background: true, timeoutMs: 40_000,
      system: "You read weather and disaster warning headlines from Tamil Nadu news. For each, give: hazard; the storm's own name if it has one " +
        "(e.g. Arnab), else empty; the alert colour level if the headline states one, else none; the districts the warning is FOR, exactly as named " +
        "(not districts only asked about, e.g. 'Will Chennai be affected?' does not put Chennai in the list); when it applies (today, tomorrow, a date) or empty. Never guess.",
      prompt: docs.map((d) => `${d.id}: ${d.text}`).join("\n")
    }).then((r) => {
      if (g.key !== key) return;
      g.out = new Map(r.object.items.map((x) => [x.id, {
        hazard: x.hazard === "none" ? null : x.hazard, name: x.name.trim() || null,
        level: (x.level === "red" ? 3 : x.level === "orange" ? 2 : x.level === "yellow" ? 1 : null) as Level | null,
        districts: x.districts.map((d) => d.trim()).filter(Boolean), districtCount: x.districts.length || null,
        chennaiNamed: false, when: x.when.trim() || null
      }]));
    }).catch((e) => console.warn(`[alerts] AI headline reading: ${(e as Error).message.slice(0, 160)}`))
      .finally(() => { g.busy = null; });
  }
  return null;
}

// -------------------------------------------------------------------- lane --

/** how far back warning news counts: a cyclone is reported for days before it arrives */
export const NEWS_HOURS = 48;
export interface NewsAlert { id: string; title: string; titleEn: string | null; publisher: string | null; t: string; url?: string | null }
export interface ImdDay { day: string; level: number; text: string }
export interface FeedState { source: string; label: string; metric: string; newest: string | null; maxHours: number }
export interface SourceSays { key: "imd" | "sachet" | "news"; label: string; level: Level; chennai: boolean; says: string; t: string | null; n?: number }
export interface StaleFeed { source: string; label: string; newest: string | null; hours: number | null }
export interface Fallback { rain24hMm: number | null; rainAt: string | null; lakes: { name: string; pct: number }[]; lakesAt: string | null }

export interface AlertLane {
  /** the banner: "red" (a hazard feed is stale during an alert, or an official red), else the strongest official level for Chennai, else "watch" for a news-only event */
  banner: { tone: "red" | "orange" | "yellow" | "watch"; title: string; line: string } | null;
  event: { hazard: Hazard | null; name: string | null } | null;
  sources: SourceSays[];
  /** agree: official and news say the same for Chennai; news_only; official_only; disagree */
  agreement: "agree" | "news_only" | "official_only" | "disagree" | "none";
  agreementText: string;
  officialLevel: Level;
  newsOutlets: number;
  stale: StaleFeed[];
  fallback: Fallback | null;
  /** for the Briefing's status, by fixed rules */
  status: { level: "alert" | "watchful" | null; reasons: string[] };
  /** the alert news itself, newest first */
  news: (NewsAlert & AlertRead & { chennaiUnder: boolean })[];
}

const hoursBetween = (a: string, b: string) => (Date.parse(b.replace(" ", "T") + "+05:30") - Date.parse(a.replace(" ", "T") + "+05:30")) / 3600_000;
const fmtWhen = (t: string) => {
  const d = new Date(Date.parse(t.replace(" ", "T") + "+05:30") + 330 * 60_000);
  return `${d.getUTCDate()} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getUTCMonth()]}`;
};

/** The lane from what each source says (pure: the tests give it fixtures). */
export function lane(i: { now: string; imd: ImdDay[]; sachet: SachetItem[]; news: NewsAlert[]; feeds: FeedState[]; fallback: Fallback | null;
  reads?: Map<string, AlertRead> | null }): AlertLane {
  const today = i.now.slice(0, 10);
  // ---- IMD: today and tomorrow
  const imdNext = i.imd.filter((d) => d.day >= today).sort((a, b) => a.day.localeCompare(b.day)).slice(0, 2);
  const imdToday = imdNext.find((d) => d.day === today) ?? null;
  const imdTop = imdNext.reduce<ImdDay | null>((a, d) => (!a || d.level > a.level ? d : a), null);
  const imdLevel = (imdToday?.level ?? 0) as Level;
  const imdSays = !imdNext.length ? "no reading" : imdNext.map((d) => `${d.day === today ? "today" : fmtWhen(d.day + " 00:00:00")}: ${d.level ? `${LEVEL_NAME[d.level]} (${d.text})` : "no warning"}`).join("; ");
  // ---- SACHET: alerts naming Chennai still in force
  const live = i.sachet.filter((s) => s.chennai && (!s.expires || s.expires >= i.now) && hoursBetween(s.t, i.now) <= 24);
  const sachetLevel = live.reduce<Level>((a, s) => Math.max(a, capLevel(s.severity)) as Level, 0);
  const sachetTop = [...live].sort((a, b) => capLevel(b.severity) - capLevel(a.severity) || b.t.localeCompare(a.t))[0];
  // ---- news: each alert article read (the AI's reading where it has one), grouped into the main event
  const news = i.news.filter((n) => hoursBetween(n.t, i.now) <= NEWS_HOURS).map((n) => {
    const r = readHeadline(n.titleEn, n.title), ai = i.reads?.get(n.id);
    const m: AlertRead = ai ? { ...r, hazard: ai.hazard ?? r.hazard, name: ai.name ?? r.name, level: ai.level ?? r.level,
      districts: ai.districts.length ? ai.districts : r.districts, districtCount: ai.districtCount ?? r.districtCount, when: ai.when ?? r.when } : r;
    // whether the alert is FOR Chennai is the code's reading of the headline, never the AI's: the AI put Chennai in the
    // list of "Chennai Weather LATEST Update: ... Red, Orange Alerts Issued", which names no district at all
    return { ...n, ...m, chennaiUnder: chennaiUnder(r) };
  }).sort((a, b) => b.t.localeCompare(a.t));
  // the main event: a named storm first (the most outlets), else the most-reported hazard
  const byKey = new Map<string, typeof news>();
  for (const n of news) {
    const k = n.name ? `name:${n.name.toLowerCase()}` : n.hazard ? `hazard:${n.hazard}` : "";
    if (k) (byKey.get(k) ?? byKey.set(k, []).get(k)!).push(n);
  }
  const outlets = (g: typeof news) => new Set(g.map((n) => (n.publisher ?? n.id).toLowerCase())).size;
  const main = [...byKey.entries()].sort((a, b) => Number(b[0].startsWith("name:")) - Number(a[0].startsWith("name:")) || outlets(b[1]) - outlets(a[1]))[0];
  // a named storm takes in the unnamed reports of the same hazard
  const group = main ? (main[0].startsWith("name:") ? news.filter((n) => main[1].includes(n) || (!n.name && n.hazard === main[1][0].hazard)) : main[1]) : [];
  const nOut = outlets(group);
  const newsChennai = group.filter((n) => n.chennaiUnder);
  const newsLevelChennai = newsChennai.reduce<Level>((a, n) => Math.max(a, n.level ?? 1) as Level, 0);
  const newsLevelAny = group.reduce<Level>((a, n) => Math.max(a, n.level ?? 0) as Level, 0);
  // a named storm is a cyclone when any of its reports says so: the newest one may be about its rain ("Heavy rain Arnab", 27 Oct)
  const named = group.find((n) => n.name)?.name ?? null;
  const event = main ? { hazard: named && group.some((n) => n.hazard === "cyclone") ? "cyclone" as Hazard : group[0]?.hazard ?? null, name: named } : null;
  const eventName = event ? (event.name ? `${event.hazard === "cyclone" || !event.hazard ? "Cyclone" : HAZARD_NAME[event.hazard]} ${event.name}` : HAZARD_NAME[event.hazard ?? "other"]) : null;
  const elsewhere = group.filter((n) => n.level && !n.chennaiUnder && (n.districts.length || n.districtCount));
  const newsSays = !group.length ? "nothing" : [
    `${eventName} in ${nOut} outlet${nOut === 1 ? "" : "s"}`,
    newsChennai.length ? `${newsChennai.length} report${newsChennai.length === 1 ? "" : "s"} put Chennai under ${newsLevelChennai >= 1 && newsChennai.some((n) => n.level) ? `a ${LEVEL_NAME[newsLevelChennai]} alert` : "a warning"}` : "none puts Chennai under an alert",
    ...(newsLevelAny > newsLevelChennai && elsewhere.length ? [`${LEVEL_NAME[newsLevelAny]} alert for ${describeElsewhere(elsewhere)}`] : [])
  ].join("; ");

  const officialLevel = Math.max(imdLevel, sachetLevel) as Level;
  const sources: SourceSays[] = [
    { key: "imd", label: "IMD (Chennai district)", level: imdLevel, chennai: true, says: imdSays, t: imdToday?.day ?? null },
    { key: "sachet", label: "NDMA SACHET", level: sachetLevel, chennai: live.length > 0,
      says: live.length ? `${live.length} alert${live.length === 1 ? "" : "s"} naming Chennai: ${sachetTop.event ?? sachetTop.title.slice(0, 90)}${sachetTop.severity ? ` (${sachetTop.severity.toLowerCase()})` : ""}${sachetTop.expires ? `, until ${sachetTop.expires.slice(11, 16)}` : ""}` : "no alert naming Chennai in force",
      t: sachetTop?.t ?? null },
    { key: "news", label: "News", level: newsLevelChennai, chennai: newsChennai.length > 0, says: newsSays, t: group[0]?.t ?? null, n: nOut }
  ];

  // ---- agreement, for Chennai
  const newsActive = nOut >= 3 || newsChennai.length >= 2;
  const agreement: AlertLane["agreement"] = !officialLevel && !newsActive ? "none"
    : officialLevel && newsActive ? (newsLevelChennai && Math.abs(newsLevelChennai - officialLevel) >= 1 && newsChennai.some((n) => n.level) ? "disagree" : "agree")
      : officialLevel ? "official_only" : "news_only";
  const agreementText = {
    none: "No warning for Chennai from any source.",
    agree: `The sources agree: ${LEVEL_NAME[officialLevel]} for Chennai (${imdLevel >= sachetLevel ? "IMD" : "NDMA SACHET"}), and ${nOut} news outlet${nOut === 1 ? "" : "s"} report ${eventName}${newsChennai.length ? `, ${newsChennai.length} naming Chennai` : ""}.`,
    disagree: `The sources differ: news reports a ${LEVEL_NAME[newsLevelChennai]} alert for Chennai, the official level is ${LEVEL_NAME[officialLevel]}.`,
    official_only: `${imdLevel >= sachetLevel ? "IMD" : "NDMA SACHET"} has a ${LEVEL_NAME[officialLevel]} warning for Chennai; the news has not reported it widely.`,
    news_only: `${eventName} is in ${nOut} news outlets${newsLevelAny ? ` (${LEVEL_NAME[newsLevelAny]} alert${elsewhere.length ? ` for ${describeElsewhere(elsewhere)}` : ""})` : ""}, but neither IMD nor NDMA has a warning for Chennai${imdTop && imdTop.level ? ` today (IMD: ${LEVEL_NAME[imdTop.level]} on ${imdTop.day === today ? "today" : fmtWhen(imdTop.day + " 00:00:00")})` : ""}.`
  }[agreement];

  // ---- hazard feeds that have gone quiet (LT-02): only matters while something is active
  const activeAlert = officialLevel >= 1 || newsActive;
  const stale: StaleFeed[] = i.feeds.map((f) => ({ source: f.source, label: f.label, newest: f.newest, hours: f.newest ? Math.round(hoursBetween(f.newest, i.now)) : null }))
    .filter((f, k) => f.hours == null || f.hours > i.feeds[k].maxHours);
  const staleNow = activeAlert ? stale : [];

  // ---- the banner
  let banner: AlertLane["banner"] = null;
  const lead = eventName ?? (officialLevel ? `${LEVEL_NAME[officialLevel][0].toUpperCase()}${LEVEL_NAME[officialLevel].slice(1)} warning for Chennai` : "Weather alert");
  if (staleNow.length) {
    const s = staleNow[0];
    banner = { tone: "red", title: `${lead} · ${s.label} not reporting`,
      line: `${s.label} last reported ${s.newest ? `${fmtWhen(s.newest)}, ${s.hours} hours ago` : "never"} during an active alert. Using IMD rain and lake levels instead. ${agreementText}` };
  } else if (officialLevel >= 1 || newsActive) {
    banner = { tone: officialLevel === 3 ? "red" : officialLevel === 2 ? "orange" : officialLevel === 1 ? "yellow" : "watch",
      title: officialLevel ? `${lead} · ${LEVEL_NAME[officialLevel]} for Chennai` : `${lead} · in the news, no official warning for Chennai`, line: agreementText };
  }

  // ---- the Briefing's status (fixed rules)
  const reasons: string[] = [];
  let level: "alert" | "watchful" | null = null;
  if (officialLevel >= 2) (level = "alert", reasons.push(`${imdLevel >= sachetLevel ? "IMD" : "NDMA SACHET"} ${LEVEL_NAME[officialLevel]} warning for Chennai`));
  else if (officialLevel === 1) (level = "watchful", reasons.push(`${imdLevel >= sachetLevel ? "IMD" : "NDMA SACHET"} yellow warning for Chennai`));
  if (newsActive) {
    level ??= "watchful";
    reasons.push(`${eventName} in ${nOut} news outlets${newsChennai.length ? `, ${newsChennai.length} naming Chennai` : ""}${officialLevel ? "" : " (no official warning for Chennai)"}`);
  }
  if (staleNow.length) (level ??= "watchful", reasons.push(`${staleNow.map((s) => s.label).join(", ")} not reporting during the alert`));

  return { banner, event: eventName ? event : null, sources, agreement, agreementText, officialLevel, newsOutlets: nOut, stale: staleNow,
    fallback: staleNow.length ? i.fallback : null, status: { level, reasons }, news: group };
}

function describeElsewhere(g: { districts: string[]; districtCount: number | null }[]): string {
  const ds = [...new Set(g.flatMap((n) => n.districts))].filter((d) => !CHENNAI.test(d));
  if (ds.length) return ds.length <= 3 ? ds.join(", ") : `${ds.length} districts`;
  const c = Math.max(...g.map((n) => n.districtCount ?? 0));
  return c ? `${c} other districts` : "other districts";
}

// -------------------------------------------------------------- the store --

/** Hazard feeds watched during an alert, and how old their newest reading may be. */
export const HAZARD_FEEDS: Omit<FeedState, "newest">[] = [
  { source: "cfm", label: "CFM-DSS flood gauges", metric: "gauge_level_m", maxHours: 6 },
  { source: "imd", label: "IMD rain gauges", metric: "rainfall_24h_mm", maxHours: 30 }
];

/** One IMD reading per day: the highest level of the day's readings, with that reading's own text. */
export function imdDays(rows: { day?: unknown; level?: unknown; text?: unknown }[]): ImdDay[] {
  const by = new Map<string, ImdDay>();
  for (const r of rows) {
    const d: ImdDay = { day: String(r.day), level: Number(r.level) || 0, text: String(r.text ?? "").split(",")[0].trim() };
    const o = by.get(d.day);
    if (!o || d.level > o.level) by.set(d.day, d);
  }
  return [...by.values()].sort((a, b) => a.day.localeCompare(b.day)).slice(0, 5);
}

/** The lane for the console, from the store, SACHET and (when ready) the AI's reading of the headlines. */
export async function alertLane(now: string): Promise<AlertLane> {
  const [imd, news, feeds, rain, lakes, sachet] = await Promise.all([
    q(`SELECT DATE_FORMAT(observed_at, '%Y-%m-%d') AS day, value AS level, detail AS text
       FROM observations WHERE source = 'imd' AND metric = 'imd_warning_level' AND observed_at >= DATE(?) ORDER BY observed_at LIMIT 60`, [now]).catch(() => [] as Row[]),
    q(`SELECT d.doc_id AS id, d.title, d.title_en, d.publisher, d.url, DATE_FORMAT(d.published_at, '%Y-%m-%d %H:%i:%s') AS t FROM documents d
       WHERE d.source_kind = 'news' AND d.report_type = 'alert' AND d.published_at > (? - INTERVAL 48 HOUR) AND d.published_at <= ?
       ORDER BY d.published_at DESC LIMIT 80`, [now, now]).catch(() => [] as Row[]),
    Promise.all(HAZARD_FEEDS.map(async (f) => {
      const [r] = await q(`SELECT DATE_FORMAT(MAX(observed_at), '%Y-%m-%d %H:%i:%s') AS t FROM observations WHERE source = ? AND metric = ? AND observed_at <= ?`, [f.source, f.metric, now]).catch(() => [] as Row[]);
      return { ...f, newest: r?.t ?? null };
    })),
    q(`SELECT value, DATE_FORMAT(observed_at, '%Y-%m-%d %H:%i:%s') AS t FROM observations WHERE source = 'imd' AND metric = 'rainfall_24h_mm' AND observed_at <= ?
       ORDER BY observed_at DESC LIMIT 1`, [now]).catch(() => [] as Row[]),
    q(`SELECT place_name AS name, value, DATE_FORMAT(observed_at, '%Y-%m-%d %H:%i:%s') AS t FROM observations WHERE metric = 'lake_pct_full'
       AND observed_at = (SELECT MAX(observed_at) FROM observations WHERE metric = 'lake_pct_full' AND observed_at <= ?) ORDER BY value DESC LIMIT 6`, [now]).catch(() => [] as Row[]),
    sachetChennai().catch(() => ({ items: [] as SachetItem[], error: "unreachable", at: null }))
  ]);
  const docs = (news as Row[]).map((n) => ({ id: String(n.id), title: String(n.title ?? ""), titleEn: n.title_en ? String(n.title_en) : null, publisher: n.publisher ?? null, t: String(n.t), url: n.url ?? null }));
  const reads = aiReads(docs.slice(0, 40).map((d) => ({ id: d.id, text: d.titleEn && d.titleEn !== d.title ? `${d.titleEn} (${d.title})` : d.title })));
  return lane({
    now, sachet: sachet.items, news: docs, reads,
    imd: imdDays(imd as Row[]),
    feeds: feeds as FeedState[],
    fallback: { rain24hMm: rain[0] ? Number(rain[0].value) : null, rainAt: rain[0]?.t ?? null,
      lakes: (lakes as Row[]).map((l) => ({ name: String(l.name), pct: Math.round(Number(l.value)) })), lakesAt: lakes[0]?.t ?? null }
  });
}
