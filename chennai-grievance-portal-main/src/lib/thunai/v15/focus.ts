/**
 * v15 (22 Nov): "Where should I concentrate, which areas are improving, which keep getting worse, where do problems keep coming back?"
 * The owner's session of 21 Nov asked it five ways in Tamil and Tanglish ("எந்த area-ல நிறைய cases இருக்கு, நிறைய worst ஆகிட்டே
 * வருது?", "எந்த area வந்து improve ஆகிட்டே வருது?") and got "I can't do that", a timeout, or "Nothing in the dashboard mentions
 * improving". No lane read the words for improving, getting worse, concentrating or repeating, and no tool compared a zone's past.
 *
 * This file is the pure part: which question it is (`focusAsk`, English, Tamil script, Tanglish and Tamil-script English), and the analysis
 * of the rows `focusRows` (assistant/incidents.ts) reads, all by code:
 *   - the window asked (a week, 4 weeks by default, 12 weeks) against the window of the same length just before it, zone by zone;
 *   - a zone is "getting worse" or "improving" only when its change is beyond the ordinary ups and downs of counts: the two counts differ by
 *     2 or more standard deviations of their difference (Poisson: sqrt(now + before)), by 3 or more reports and by 10% or more;
 *   - the weekly series of the last 12 weeks, and its slope over the last 8 (least squares, as a share of the zone's mean week);
 *   - where to concentrate: a score from the open backlog past its deadline (30%), severe reports in the window (20%), reports in the
 *     window (15%), a rise beyond the ordinary (20%) and repeat reports (15%), each as a share of the highest zone's; the reasons said are
 *     the parts that weigh most, each with its own count;
 *   - the kind of report behind each zone's move, and the places where one kind came 3 or more times in the window.
 * Every figure said is on the screen (recipes/focus.ts). A rise in reports is not proof that things are worse on the ground: the caveat says so.
 */
import { ZONES } from "../lexicon";
import type { World } from "../types";

export type Lens = "attention" | "improving" | "worsening" | "repeat";
export type Bi = { en: string; ta: string };
const bi = (en: string, ta: string): Bi => ({ en, ta });

// ------------------------------------------------------------------ the question --
const AREA = /\b(?:areas?|zones?|places?|regions?|wards?|localit(?:y|ies)|neighbou?rhoods?|where|parts? of|which part|spots?|locations?|district)\b|ஏரியா|ஏரியால|பகுதி|மண்டல|இடத்|இடங்|இடம்|எங்க|எங்கே|எந்தப் பகுதி|எந்த ஏரியா|\b(?:edathula|edam|enga|engha)\b/iu;
const ATTENTION = /\b(?:concentrat\w*|focus\w*|attention|priori\w*|where should i (?:go|look|start|act)|needs? (?:my |the most )?attention|worry about|look into first|act on first)\b|கான்சென்ட்ரேட்|கான்சன்ட்ரேட்|கான்சென்ட்ரேஷன்|ஃபோகஸ்|போகஸ்|கவனம்|கவனிக்க|கவனிக்கணும்|கவனிக்கனும்|முன்னுரிமை|அக்கறை|\b(?:kavanam|kavanikkanum|kavanikanum)\b/iu;
const IMPROVING = /\b(?:improv\w*|getting better|got better|better now|recover\w*|declin\w*|reduc\w*|decreas\w*|going down|coming down|fewer (?:cases|complaints|incidents)|less (?:cases|complaints|incidents)|calm(?:ed|ing) down)\b|இம்ப்ரூவ்|இம்ப்ரூ|மேம்ப|முன்னேற|குறைஞ்சிட்டே|குறைஞ்சுட்டே|குறைஞ்சிகிட்டே|குறைஞ்சுகிட்டே|குறைந்து வருது|குறைந்து வருகிறது|குறைஞ்சிருக்கு|குறைஞ்சு இருக்கு|குறையுது|குறைந்துள்ள|டிக்ரீஸ்|பெட்டர்|\b(?:kuraiy\w*|korainj\w*|kammi aag\w*|better aag\w*)\b/iu;
const WORSENING = /\b(?:wors\w*|deteriorat\w*|getting bad|going bad|rising|increas\w*|going up|shooting up|spik\w*|more and more|keeps? (?:rising|growing|increasing|going up))\b|worst\s*(?:ஆகி|ஆயி|aagi|aayi)|வொர்ஸ்ட்\s*ஆகி|மோசமாகி|மோசமாயி|மோசமாகிட்டே|மோசமாகிக்கிட்டே|மோசமா ஆகி|அதிகமாகி|அதிகமாயி|அதிகரிச்சுட்டே|அதிகரித்து வரு|கூடிட்டே|கூடிக்கிட்டே|கூடிகிட்டே|கூடுது|ஏறிட்டே|ஏறிக்கிட்டே|இன்க்ரீஸ்|\b(?:mosam\s*aag\w*|adhigam\s*aag\w*|athigam\s*aag\w*|jaasthi\s*aag\w*|koodit\w*|eerit\w*)\b/iu;
const REPEAT = /\b(?:repeat\w*|recurr\w*|again and again|over and over|keeps? (?:coming|happening|recurring|reporting)|same (?:place|spot|area)s?|chronic|hot ?spots? that keep)\b|ரிப்பீட்|திரும்பத் திரும்ப|திரும்ப திரும்ப|மறுபடி|மறுபடியும்|மீண்டும் மீண்டும்|வந்துகிட்டே|வந்துட்டே|வந்துக்கிட்டே|வந்துகொண்டே|வந்துக்கொண்டே|வந்துட்டு இருக்கு|\b(?:thirumba thirumba|marupadi\w*|vandhukitte|vanthukitte|vandhutte)\b/iu;
/** a question about departments, or two places to compare, is another screen's */
const DEPT = /\b(?:departments?|dept|depts|officers?|agenc(?:y|ies))\b|துறை|டிபார்ட்மென்ட்/iu;
/** "worst" alone ("the worst area") is where to concentrate; "worst ஆகிட்டே" (getting worse) is read by WORSENING first */
const WORST = /\b(?:worst|most (?:cases|complaints|incidents|problems)|highest|maximum|max)\b|நிறைய cases|நிறைய புகார்|அதிக(?:மா)? (?:cases|புகார்)|மோசமான|வொர்ஸ்ட்/iu;

/** The window the question names: a week, 12 weeks (a quarter, 3 months), else 4 weeks. */
export function windowOf(text: string): 7 | 28 | 84 {
  const t = text.toLowerCase();
  if (/\b(?:quarter|quarterly|3 months|three months|last few months|past few months)\b|காலாண்டு|மூணு மாச|மூன்று மாத/u.test(t)) return 84;
  if (/\b(?:month|monthly|4 weeks|four weeks|30 days)\b|மாச|மாத|மாதம்|மந்த்/u.test(t)) return 28;
  if (/\b(?:this week|weekly|last week|past week|7 days|seven days)\b|இந்த வார|வாரம்|வீக்/u.test(t)) return 7;
  return 28;
}

/**
 * Is this a focus question, and which lenses, in the order said? null: another lane's. One zone named is that zone's trend (the planner),
 * two or more are a comparison, a department question is the departments' screen.
 */
export function focusAsk(text: string, w?: Pick<World, "zones"> | null): { lenses: Lens[]; days: 7 | 28 | 84 } | null {
  const t = text.normalize("NFC");
  if (DEPT.test(t)) return null;
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // v16 (22 Nov): also the lexicon's spellings, so "அலந்தூர் and அடையார்" (the world's Tamil names are ஆலந்தூர், அடையாறு) counts as two zones
  // named: that sentence went to the district's list at 11:55 (the reader decides first now; this is the lane's own guard when it is off)
  const named = w ? w.zones.filter((z) => (z.name && new RegExp(`\\b${esc(z.name)}\\b`, "i").test(t)) || (!!z.ta && t.includes(z.ta))
    || (ZONES[z.n]?.ta ?? []).some((v) => t.includes(v)) || (ZONES[z.n]?.en ?? []).some((v) => new RegExp(`\\b${esc(v)}\\b`, "i").test(t))).length : 0;
  if (named >= 1) return null;
  const at = (re: RegExp) => { const m = re.exec(t); return m ? m.index : -1; };
  const found: { lens: Lens; at: number }[] = [];
  const area = AREA.test(t);
  const att = at(ATTENTION), imp = at(IMPROVING), wor = at(WORSENING), rep = at(REPEAT);
  // concentrating needs no area word ("what should I concentrate on now?"); the others are about areas
  if (att >= 0 && (area || /concentrat|கான்சென்ட்|கான்சன்ட்|focus|ஃபோகஸ்/iu.test(t))) found.push({ lens: "attention", at: att });
  if (imp >= 0 && area) found.push({ lens: "improving", at: imp });
  if (wor >= 0 && area) found.push({ lens: "worsening", at: wor });
  if (rep >= 0 && (area || /cases|complaints|incidents|problems|புகார்|சம்பவ|பிரச்சன/iu.test(t))) found.push({ lens: "repeat", at: rep });
  // "which area has the most cases, getting worse" without a worsening word: the worst areas are where to concentrate
  if (!found.length && area && WORST.test(t) && /\b(?:now|currently|these days|lately)\b|இப்போ|இப்ப|இப்போது|ஆகிட்டே|வருது/iu.test(t)) found.push({ lens: "attention", at: at(WORST) });
  if (!found.length) return null;
  found.sort((a, b) => a.at - b.at);
  return { lenses: [...new Set(found.map((x) => x.lens))], days: windowOf(t) };
}

// ------------------------------------------------------------------ the analysis --
export interface FocusRows {
  days: { zone: number; name: string; d: string; n: number; severe: number; rep: number }[];
  kinds: { zone: number; cat: string; label: string; now: number; prev: number }[];
  backlog: { zone: number; open: number; overdue: number; severeOpen: number }[];
  repeats: { zone: number; name: string; place: string; cat: string; label: string; n: number; open: number }[];
  /** v16: who holds each zone's cases past their deadline (department code, count) */
  owners?: { zone: number; dept: string; n: number }[];
}
export interface KindMove { cat: string; label: string; now: number; prev: number; delta: number }
export interface ZoneFocus {
  zone: number; name: Bi;
  now: number; prev: number; delta: number; pct: number | null; z: number;
  trend: "worse" | "better" | "steady";
  /** reports per week, the oldest first (12 weeks; the last is the 7 days to now) */
  weekly: number[];
  /** least-squares slope of the last 8 weeks, as a % of the zone's mean week (+ rising) */
  slopePct: number | null;
  severe: number; repeat: number; open: number; overdue: number; severeOpen: number;
  rise: KindMove | null; fall: KindMove | null;
  /** v16: the zone's kinds of report with the biggest moves (up to 5, by the size of the change) and its biggest kinds now (up to 3) */
  moves?: KindMove[]; top?: { cat: string; label: string; now: number }[];
  /** v16: the department holding most of the zone's cases past their deadline */
  owner?: { dept: string; n: number } | null;
  score: number;
  reasons: Bi[];
}
export interface FocusAnalysis {
  days: number;
  weekLabels: string[];
  zones: ZoneFocus[];
  /** the order to concentrate in (score, highest first) */
  attention: ZoneFocus[];
  worse: ZoneFocus[];
  better: ZoneFocus[];
  /** every zone with a count in either window, by its change, the biggest rise first */
  byChange: ZoneFocus[];
  district: { now: number; prev: number; delta: number; pct: number | null; weekly: number[]; overdue: number; open: number };
  spots: FocusRows["repeats"];
  /** v16: the kinds of report across the zones read, now against before, the biggest rise first */
  kinds?: (KindMove & { trend: "worse" | "better" | "steady"; pct: number | null })[];
}

const DAY = 86_400_000;
const istDay = (s: string) => Date.parse(`${s.slice(0, 10)}T00:00:00+05:30`);
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pctOf = (now: number, prev: number) => (prev > 0 ? Math.round(((now - prev) / prev) * 100) : null);

/** Least-squares slope of ys against 0..n-1, as a % of their mean; null with fewer than 4 points or a zero mean. */
export function slopePct(ys: number[]): number | null {
  const n = ys.length;
  if (n < 4) return null;
  const mx = (n - 1) / 2, my = ys.reduce((a, b) => a + b, 0) / n;
  if (my <= 0) return null;
  let sxy = 0, sxx = 0;
  ys.forEach((y, i) => { sxy += (i - mx) * (y - my); sxx += (i - mx) ** 2; });
  return Math.round((sxy / sxx / my) * 100);
}

/** The two counts' difference in standard deviations of it (Poisson counts: their variance is their sum). */
export const zOf = (now: number, prev: number) => (now + prev > 0 ? (now - prev) / Math.sqrt(now + prev) : 0);
/** A move beyond the ordinary: 2 or more standard deviations, 3 or more reports, 10% or more. */
export function trendOf(now: number, prev: number): "worse" | "better" | "steady" {
  const z = zOf(now, prev), d = now - prev, p = prev > 0 ? d / prev : d > 0 ? 1 : 0;
  if (z >= 2 && d >= 3 && p >= 0.1) return "worse";
  if (z <= -2 && d <= -3 && p <= -0.1) return "better";
  return "steady";
}

const WIN: Record<7 | 28 | 84, { now: Bi; before: Bi; short: Bi }> = {
  7: { now: bi("the last 7 days", "கடந்த 7 நாள்ல"), before: bi("the 7 days before", "அதுக்கு முந்தைய 7 நாள்"), short: bi("7 days", "7 நாள்") },
  28: { now: bi("the last 4 weeks", "கடந்த 4 வாரத்துல"), before: bi("the 4 weeks before", "அதுக்கு முந்தைய 4 வாரம்"), short: bi("4 weeks", "4 வாரம்") },
  84: { now: bi("the last 12 weeks", "கடந்த 12 வாரத்துல"), before: bi("the 12 weeks before", "அதுக்கு முந்தைய 12 வாரம்"), short: bi("12 weeks", "12 வாரம்") }
};
export const windowWords = (days: number) => WIN[(days === 7 || days === 84 ? days : 28) as 7 | 28 | 84];

/** v16: kinds of report summed over the zones given (all when `only` is empty), with the same test of a real move as the zones', the biggest rise first. */
export function kindsOf(kinds: FocusRows["kinds"], only: number[] = []): NonNullable<FocusAnalysis["kinds"]> {
  const by = new Map<string, { cat: string; label: string; now: number; prev: number }>();
  for (const k of kinds) {
    if (only.length && !only.includes(k.zone)) continue;
    const x = by.get(k.cat) ?? { cat: k.cat, label: k.label, now: 0, prev: 0 };
    x.now += k.now; x.prev += k.prev; by.set(k.cat, x);
  }
  return [...by.values()].filter((k) => k.now + k.prev > 0).map((k) => ({ ...k, delta: k.now - k.prev, trend: trendOf(k.now, k.prev), pct: pctOf(k.now, k.prev) }))
    .sort((a, b) => b.delta - a.delta || b.now - a.now).slice(0, 20);
}

/** The analysis, by code, from focusRows' rows. `now`: the data's time (IST "YYYY-MM-DD HH:MM:SS"). */
export function analyseFocus(rows: FocusRows, now: string, days: 7 | 28 | 84, w: Pick<World, "zones">): FocusAnalysis {
  const today = istDay(now);
  const nameOf = (z: number, fallback: string): Bi => {
    const x = w.zones.find((y) => y.n === z);
    return bi(x?.name || fallback || `Zone ${z}`, x?.ta || x?.name || fallback || `மண்டலம் ${z}`);
  };
  const zonesSeen = new Set<number>([...rows.days.map((r) => r.zone), ...rows.kinds.map((r) => r.zone), ...rows.backlog.map((r) => r.zone)].filter((z) => Number.isFinite(z) && z > 0));
  const WEEKS = 12;
  const weekLabels = Array.from({ length: WEEKS }, (_, k) => {
    // week k (0 = the oldest) starts (WEEKS - k) * 7 - 1 days before today
    const start = new Date(today - ((WEEKS - k) * 7 - 1) * DAY + 330 * 60_000);
    return `${start.getUTCDate()} ${MONTHS[start.getUTCMonth()]}`;
  });
  const zones: ZoneFocus[] = [...zonesSeen].sort((a, b) => a - b).map((zone) => {
    const dayRows = rows.days.filter((r) => r.zone === zone);
    const weekly = new Array<number>(WEEKS).fill(0);
    let severe = 0, repeat = 0;
    for (const r of dayRows) {
      const back = Math.round((today - istDay(r.d)) / DAY);
      if (back < 0) continue;
      const wk = Math.floor(back / 7);
      if (wk < WEEKS) weekly[WEEKS - 1 - wk] += r.n;
      if (back < days) { severe += r.severe; repeat += r.rep; }
    }
    const kinds = rows.kinds.filter((r) => r.zone === zone);
    const nowN = kinds.reduce((a, r) => a + r.now, 0), prevN = kinds.reduce((a, r) => a + r.prev, 0);
    const moves = kinds.map((k) => ({ cat: k.cat, label: k.label, now: k.now, prev: k.prev, delta: k.now - k.prev })).filter((k) => k.delta !== 0);
    const rise = [...moves].sort((a, b) => b.delta - a.delta)[0] ?? null;
    const fall = [...moves].sort((a, b) => a.delta - b.delta)[0] ?? null;
    const bl = rows.backlog.find((r) => r.zone === zone);
    const name = nameOf(zone, dayRows[0]?.name ?? "");
    return {
      zone, name, now: nowN, prev: prevN, delta: nowN - prevN, pct: pctOf(nowN, prevN), z: Math.round(zOf(nowN, prevN) * 10) / 10, trend: trendOf(nowN, prevN),
      weekly, slopePct: slopePct(weekly.slice(-8)), severe, repeat, open: bl?.open ?? 0, overdue: bl?.overdue ?? 0, severeOpen: bl?.severeOpen ?? 0,
      rise: rise && rise.delta > 0 ? rise : null, fall: fall && fall.delta < 0 ? fall : null,
      moves: [...moves].sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta) || b.now - a.now).slice(0, 5),
      top: kinds.filter((k) => k.now > 0).sort((a, b) => b.now - a.now).slice(0, 3).map((k) => ({ cat: k.cat, label: k.label, now: k.now })),
      owner: (rows.owners ?? []).filter((o) => o.zone === zone && o.n > 0).sort((a, b) => b.n - a.n).map((o) => ({ dept: o.dept, n: o.n }))[0] ?? null,
      score: 0, reasons: []
    };
  });
  // where to concentrate: each part as a share of the highest zone's, weighted
  const max = (f: (z: ZoneFocus) => number) => Math.max(1e-9, ...zones.map(f));
  const mO = max((z) => z.overdue), mS = max((z) => z.severe), mN = max((z) => z.now), mZ = max((z) => Math.max(0, z.z)), mR = max((z) => z.repeat);
  const win = windowWords(days);
  for (const z of zones) {
    const parts = [
      { w: 0.3 * (z.overdue / mO), why: z.overdue ? bi(`${z.overdue} open past their deadline`, `${z.overdue} காலக்கெடு தாண்டித் திறந்திருக்கு`) : null },
      { w: 0.2 * (z.severe / mS), why: z.severe ? bi(`${z.severe} severe in ${win.now.en}`, `${win.now.ta} ${z.severe} கடுமையானவை`) : null },
      { w: 0.15 * (z.now / mN), why: z.now ? bi(`${z.now} reported in ${win.now.en}`, `${win.now.ta} ${z.now} பதிவு`) : null },
      { w: 0.2 * (Math.max(0, z.z) / mZ), why: z.trend === "worse" && z.pct != null ? bi(`up ${z.pct}% on ${win.before.en}`, `${win.before.ta} விட ${z.pct}% கூடியிருக்கு`) : null },
      { w: 0.15 * (z.repeat / mR), why: z.repeat ? bi(`${z.repeat} repeat reports`, `${z.repeat} திரும்பத் திரும்ப வந்த புகார்கள்`) : null }
    ];
    z.score = Math.round(parts.reduce((a, p) => a + p.w, 0) * 100);
    z.reasons = parts.filter((p) => p.why && p.w > 0).sort((a, b) => b.w - a.w).slice(0, 3).map((p) => p.why as Bi);
    if (z.trend === "worse" && z.rise) z.reasons.push(bi(`mostly ${z.rise.label} (${z.rise.prev} to ${z.rise.now})`, `பெரும்பாலும் ${z.rise.label} (${z.rise.prev}லிருந்து ${z.rise.now})`));
  }
  const attention = [...zones].sort((a, b) => b.score - a.score || b.overdue - a.overdue);
  const byChange = zones.filter((z) => z.now + z.prev > 0).sort((a, b) => b.z - a.z || b.delta - a.delta);
  const worse = byChange.filter((z) => z.trend === "worse");
  const better = [...byChange].reverse().filter((z) => z.trend === "better");
  const dNow = zones.reduce((a, z) => a + z.now, 0), dPrev = zones.reduce((a, z) => a + z.prev, 0);
  const weekly = new Array<number>(WEEKS).fill(0);
  for (const z of zones) z.weekly.forEach((v, i) => { weekly[i] += v; });
  // v16: the kinds across every zone read (the district, or the zones a caller keeps: kindsOf)
  const kinds = kindsOf(rows.kinds);
  return {
    days, weekLabels, zones, attention, worse, better, byChange,
    district: { now: dNow, prev: dPrev, delta: dNow - dPrev, pct: pctOf(dNow, dPrev), weekly, overdue: zones.reduce((a, z) => a + z.overdue, 0), open: zones.reduce((a, z) => a + z.open, 0) },
    spots: rows.repeats.slice(0, 10), kinds
  };
}

// ------------------------------------------------------------------ the spoken answer --
const list = (xs: string[], and: string) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} ${and} ${xs[xs.length - 1]}`);
const reasonEn = (z: ZoneFocus) => z.reasons.slice(0, 2).map((r) => r.en).join(", ");
const reasonTa = (z: ZoneFocus) => z.reasons.slice(0, 2).map((r) => r.ta).join(", ");

/** What Jarvis says: 2 to 4 short sentences for the lenses asked, every figure on the screen. */
export function focusSay(a: FocusAnalysis, lenses: Lens[]): Bi {
  const win = windowWords(a.days);
  const en: string[] = [], ta: string[] = [];
  const said = new Set<number>();
  for (const lens of lenses.length ? lenses : ["attention" as Lens]) {
    if (lens === "attention") {
      const [z1, z2, z3] = a.attention;
      if (!z1) continue;
      en.push(`Concentrate first on ${z1.name.en}: ${reasonEn(z1)}.`);
      ta.push(`முதல்ல ${z1.name.ta}-ல கவனம் செலுத்தணும்: ${reasonTa(z1)}.`);
      const next = [z2, z3].filter(Boolean) as ZoneFocus[];
      if (next.length) { en.push(`Then ${list(next.map((z) => z.name.en), "and")}.`); ta.push(`அடுத்தது ${list(next.map((z) => z.name.ta), "மற்றும்")}.`); }
      [z1, ...next].forEach((z) => said.add(z.zone));
    } else if (lens === "improving") {
      const b = a.better.slice(0, 2);
      if (b.length) {
        en.push(`Improving over ${win.now.en}: ${list(b.map((z) => `${z.name.en}, down ${Math.abs(z.pct ?? 0)}% (${z.prev} to ${z.now})`), "and")}.`);
        ta.push(`${win.now.ta} முன்னேறியிருக்கும் பகுதிகள்: ${list(b.map((z) => `${z.name.ta}, ${Math.abs(z.pct ?? 0)}% குறைஞ்சிருக்கு (${z.prev}லிருந்து ${z.now})`), "மற்றும்")}.`);
      } else {
        const low = [...a.byChange].reverse().find((z) => z.delta < 0);
        en.push(`No area has improved beyond the usual ups and downs over ${win.now.en}${low ? `; the biggest fall is ${low.name.en}, ${low.prev} to ${low.now}` : ""}.`);
        ta.push(`${win.now.ta} வழக்கமான ஏற்ற இறக்கத்தைத் தாண்டி எந்தப் பகுதியும் முன்னேறலை${low ? `; அதிகம் குறைஞ்சது ${low.name.ta}, ${low.prev}லிருந்து ${low.now}` : ""}.`);
      }
    } else if (lens === "worsening") {
      const x = a.worse.slice(0, 2);
      if (x.length) {
        en.push(`Getting worse: ${list(x.map((z) => `${z.name.en}, up ${z.pct ?? 0}% (${z.prev} to ${z.now})${z.rise ? `, mostly ${z.rise.label}` : ""}`), "and")}.`);
        ta.push(`மோசமாகிட்டு வர்றது: ${list(x.map((z) => `${z.name.ta}, ${z.pct ?? 0}% கூடியிருக்கு (${z.prev}லிருந்து ${z.now})${z.rise ? `, பெரும்பாலும் ${z.rise.label}` : ""}`), "மற்றும்")}.`);
      } else {
        const hi = a.byChange.find((z) => z.delta > 0);
        en.push(`No area is getting worse beyond the usual ups and downs over ${win.now.en}${hi ? `; the biggest rise is ${hi.name.en}, ${hi.prev} to ${hi.now}` : ""}.`);
        ta.push(`${win.now.ta} வழக்கமான ஏற்ற இறக்கத்தைத் தாண்டி எந்தப் பகுதியும் மோசமாகலை${hi ? `; அதிகம் கூடினது ${hi.name.ta}, ${hi.prev}லிருந்து ${hi.now}` : ""}.`);
      }
    } else if (lens === "repeat") {
      const top = [...a.zones].sort((p, q) => q.repeat - p.repeat)[0];
      const spot = a.spots[0];
      if (top && top.repeat) { en.push(`Problems keep coming back most in ${top.name.en}: ${top.repeat} repeat reports in ${win.now.en}.`); ta.push(`திரும்பத் திரும்ப அதிகம் வர்றது ${top.name.ta}-ல: ${win.now.ta} ${top.repeat} புகார்கள்.`); }
      if (spot) {
        const zn = a.zones.find((z) => z.zone === spot.zone)?.name ?? bi(spot.name, spot.name);
        en.push(`The spot that keeps coming back is ${spot.place} in ${zn.en}: ${spot.n} ${spot.label} reports.`);
        ta.push(`அடிக்கடி வர்ற இடம் ${zn.ta}-ல ${spot.place}: ${spot.n} ${spot.label} புகார்கள்.`);
      }
      if (!en.length) { en.push(`No place had the same kind of problem 3 or more times in ${win.now.en}.`); ta.push(`${win.now.ta} ஒரே இடத்துல ஒரே பிரச்சனை 3 தடவைக்கு மேல வரலை.`); }
    }
  }
  // the one move the lenses asked did not cover: a worsening area outside the focus list is worth a sentence
  if (lenses.length === 1 && lenses[0] === "attention") {
    const w0 = a.worse.find((z) => !said.has(z.zone));
    if (w0) { en.push(`Watch ${w0.name.en} too: up ${w0.pct ?? 0}% on ${win.before.en}.`); ta.push(`${w0.name.ta}-யும் கவனிக்கணும்: ${win.before.ta} விட ${w0.pct ?? 0}% கூடியிருக்கு.`); }
    const b0 = a.better[0];
    if (b0) { en.push(`${b0.name.en} is improving, down ${Math.abs(b0.pct ?? 0)}%.`); ta.push(`${b0.name.ta} முன்னேறியிருக்கு, ${Math.abs(b0.pct ?? 0)}% குறைஞ்சிருக்கு.`); }
  }
  return bi(en.slice(0, 4).join(" "), ta.slice(0, 4).join(" "));
}
