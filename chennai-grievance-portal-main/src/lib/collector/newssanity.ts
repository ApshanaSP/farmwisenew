/**
 * Checks on incidents known only from the news, applied to each build once it is loaded (derive.ts). They keep a
 * news item from inflating the console's counts and casualty totals:
 *
 *   archival      a "this day in history" item ("13.10.1976: 95 killed in a Bombay air crash", Dinamani's daily slot)
 *                 is not an incident of today: an incident whose every article is dated years before it was
 *                 published, or is a history column, is taken out.
 *   one story     the pipeline groups articles about one event into a story (story_id), but can still file the
 *                 story's articles as several news-only incidents (13 incidents for one car accident, the same
 *                 Tamil headline twice). News-only incidents of one story, in a compatible zone and within
 *                 STORY_HOURS of the earliest, become one incident; its casualties count once (the largest
 *                 figure any of them reported, never the sum).
 *   gas deaths    workers killed by gas in a drain, sewer or well were read as "vector-borne disease" (the word
 *                 for poison in Tamil, விஷ, also appears in disease reports): moved to drain works site safety.
 *   unconfirmed   a death toll of MASS_DEATHS or more from a single news outlet, with no department record, is
 *                 kept on the incident as dead_reported but not counted until a second source or a person
 *                 confirms it (needs_review).
 */

export const STORY_HOURS = 72;
export const MASS_DEATHS = 10;

const HISTORY = /this day in history|on this day|years ago today|today in history|இதே நாளில்|அன்று இதே நாள்|வரலாற்றில் இன்று|இன்றைய வரலாறு/i;
/** a headline that opens with a date: "13.10.1976:", "13/10/1976 -" */
const DATED = /^\s*(\d{1,2})[./-](\d{1,2})[./-](\d{4})\s*[:：\-–—]/;
/** a headline that opens with a year: "1976:" */
const YEAR = /^\s*(1[5-9]\d\d|20\d\d)\s*[:：\-–—]/;

const wall = (t: string) => Date.parse(String(t).replace(" ", "T") + (/[zZ]|[+-]\d\d:?\d\d$/.test(t) ? "" : "+05:30"));

/** The article is about the past: a history column, or it opens with a date more than 30 days before publication. */
export function isArchival(title: string | null | undefined, publishedAt: string | null | undefined): boolean {
  const t = String(title ?? "");
  if (HISTORY.test(t)) return true;
  const pub = publishedAt ? wall(publishedAt) : NaN;
  const d = t.match(DATED);
  if (d) {
    const [day, month, year] = [Number(d[1]), Number(d[2]), Number(d[3])];
    if (month < 1 || month > 12 || day < 1 || day > 31) return false;
    const when = Date.UTC(year, month - 1, day);
    return Number.isFinite(pub) ? when < pub - 30 * 864e5 : year < new Date().getUTCFullYear() - 1;
  }
  const y = t.match(YEAR);
  if (y) {
    const pubYear = Number.isFinite(pub) ? new Date(pub).getUTCFullYear() : new Date().getUTCFullYear();
    return Number(y[1]) < pubYear - 1;
  }
  return false;
}

const GAS = /\b(gas|fumes?|toxic|asphyxia\w*|suffocat\w*|manhole|septic|sewer|sewage tank|stormwater well|poisonous)\b|விஷவாயு|விஷ வாயு|கழிவுநீர்த் ?தொட்டி|மூச்சுத் ?திணற/i;
const DISEASE = /\b(dengue|malaria|chikungunya|cholera|typhoid|fever|mosquito|diarr\w*|jaundice|hepatitis|leptospir\w*|outbreak|infection|virus|viral|cases)\b|டெங்கு|காய்ச்சல்|கொசு|மலேரியா/i;

/** Workers overcome by gas in a drain, sewer or tank, misread as disease. */
export function isGasNotDisease(...texts: (string | null | undefined)[]): boolean {
  const t = texts.filter(Boolean).join(" \n ");
  return GAS.test(t) && !DISEASE.test(t);
}

export interface NewsIncident {
  id: string;
  /** first reported, "YYYY-MM-DD HH:MM:SS" IST */
  t: string;
  zone: number | null;
  /** has a department record or citizen complaint: never merged here */
  mediaOnly: boolean;
}

export const CASUALTY_HOURS = 48;

export interface Casualty { id: string; t: string; zone: number | null; /** placeKey of the named place ("" when only the city) */ place: string; dead: number }

/**
 * News-only reports of the same deaths at the same place, filed under different stories (the pipeline put five articles on
 * two workers killed by gas in Kodungaiyur into four stories, and one counted the deaths in three categories): the same
 * named place in the same zone, the same death toll, within CASUALTY_HOURS of the first report. Each duplicate's id →
 * the first report's. Two separate fatal events at one locality with the same toll inside two days are rare enough that
 * counting them once is the safer mistake for a briefing's death total.
 */
export function casualtyMerges(list: Casualty[]): Map<string, string> {
  const into = new Map<string, string>();
  const groups = new Map<string, Casualty[]>();
  for (const c of list) {
    if (!(c.dead > 0) || !c.place || c.zone == null) continue;
    const k = `${c.zone}|${c.place}|${c.dead}`;
    (groups.get(k) ?? groups.set(k, []).get(k)!).push(c);
  }
  for (const g of groups.values()) {
    g.sort((a, b) => wall(a.t) - wall(b.t) || a.id.localeCompare(b.id));
    let lead = g[0];
    for (const c of g.slice(1)) {
      if (wall(c.t) - wall(lead.t) <= CASUALTY_HOURS * 36e5) into.set(c.id, lead.id);
      else lead = c;
    }
  }
  return into;
}

/**
 * News-only incidents that are the same story: each duplicate's id → the incident it joins. The group's anchor is its
 * earliest incident; an incident more than STORY_HOURS after it, or in another zone, stays on its own. The incident
 * kept is the earliest with a zone (it is on the map), else the earliest.
 */
export function storyMerges(stories: Map<string, NewsIncident[]>): Map<string, string> {
  const into = new Map<string, string>();
  for (const list of stories.values()) {
    const media = [...new Map(list.filter((i) => i.mediaOnly).map((i) => [i.id, i])).values()]
      .sort((a, b) => wall(a.t) - wall(b.t) || a.id.localeCompare(b.id));
    if (media.length < 2) continue;
    const first = wall(media[0].t);
    const group = media.filter((i) => wall(i.t) - first <= STORY_HOURS * 36e5);
    // articles placed in two different zones may be two events of one running story ("protests across the city"): leave them
    if (group.length < 2 || new Set(group.map((i) => i.zone).filter((z) => z != null)).size > 1) continue;
    const keep = group.find((i) => i.zone != null) ?? group[0];
    for (const i of group) if (i.id !== keep.id) into.set(i.id, keep.id);
  }
  return into;
}
