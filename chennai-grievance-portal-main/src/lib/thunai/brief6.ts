/**
 * v6, Phase 3: an incident told the way a sharp aide would brief the Collector, not read out. Two to four short spoken sentences, then an
 * offer of more:
 *   1. the headline: what, and where, and since when ("Standing water at Velachery since yesterday evening.");
 *   2. how serious, and why (marked severe, how many complained, in the news, past its deadline);
 *   3. what has been done and by whom, and what is stuck (who holds it, whether an officer is named, the deadline missed, nothing new);
 *   4. what I would do next;
 *   and "Want the details?".
 * Every fact comes from the record (the fact sheet narrate.ts builds, the incident's own deadline, officials and report times): no figure,
 * name or time is invented. Times are relative ("since this morning", "the deadline passed yesterday"), never a clock or a date; counts are
 * said as numbers (the voice puts them in words, v5 F1) and must be on the screen (speakable.ts). No field name, no id, no list.
 * The Tamil lines are model-drafted and NOT checked by a Tamil speaker (spoken register, Chennai usage).
 * JARVIS_BRIEF=v5 restores v4/v5's retelling (narrate.ts explainIssue).
 */
import { ageWords, explainIssue, idam, type FactSheet } from "./narrate";
import { speechProblem } from "./speechcheck";
import type { Bilingual } from "./stage";

export const briefStyle = (v: string | undefined = process.env.JARVIS_BRIEF): "v6" | "v5" => ((v ?? "").trim().toLowerCase() === "v5" ? "v5" : "v6");

/** a record's time ("2026-11-16 18:40", IST as the store writes it, or an ISO time) as epoch ms; null when it is not one */
export function timeOf(t: unknown): number | null {
  const s = String(t ?? "").trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
  if (!m) return null;
  // an explicit zone (Z or +hh:mm) is the time's own; a bare one is IST, as the store writes it
  if (/(Z|[+-]\d{2}:?\d{2})$/.test(s)) { const v = Date.parse(s); return Number.isFinite(v) ? v : null; }
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]) - 5, Number(m[5]) - 30);
}

const IST = 5.5 * 3_600_000;
const DAY = 86_400_000;
/** the IST calendar day number and hour of an epoch time */
const ist = (t: number) => { const d = new Date(t + IST); return { day: Math.floor((t + IST) / DAY), h: d.getUTCHours(), wd: d.getUTCDay() }; };
const PART_EN = (h: number) => (h < 5 ? "night" : h < 12 ? "morning" : h < 17 ? "afternoon" : h < 21 ? "evening" : "night");
const PART_TA: Record<string, string> = { night: "இரவு", morning: "காலை", afternoon: "மதியம்", evening: "மாலை" };
/** "இரவு" + "இலிருந்து" as Tamil joins it (இரவிலிருந்து, காலையிலிருந்து, மதியத்திலிருந்து, மாலையிலிருந்து) */
const FROM_TA: Record<string, string> = { night: "இரவிலிருந்து", morning: "காலையிலிருந்து", afternoon: "மதியத்திலிருந்து", evening: "மாலையிலிருந்து" };
const WEEKDAY_EN = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const WEEKDAY_TA = ["ஞாயிற்றுக்கிழமை", "திங்கட்கிழமை", "செவ்வாய்க்கிழமை", "புதன்கிழமை", "வியாழக்கிழமை", "வெள்ளிக்கிழமை", "சனிக்கிழமை"];

/** Since when, said as a person would: "since this morning", "since yesterday evening", "since Monday", else "for about a week". */
export function sinceWords(t: number | null, now: number): Bilingual | null {
  if (t == null || !Number.isFinite(t) || t > now + 5 * 60_000) return null;
  const a = ist(t), b = ist(now), days = b.day - a.day, part = PART_EN(a.h);
  if (days === 0) {
    if (a.h < 5) return { en: "since early this morning", ta: "இன்று அதிகாலையிலிருந்து" };
    if (now - t < 2 * 3_600_000) return { en: "for the last hour or two", ta: "கடந்த ஓரிரு மணி நேரமாக" };
    return { en: `since this ${part}`, ta: `இன்று ${FROM_TA[part]}` };
  }
  if (days === 1) return { en: part === "night" && a.h >= 21 ? "since last night" : `since yesterday ${part}`, ta: `நேற்று ${FROM_TA[part]}` };
  if (days < 7) return { en: `since ${WEEKDAY_EN[a.wd]}`, ta: `${WEEKDAY_TA[a.wd]}யிலிருந்து` };
  const age = ageWords((now - t) / 3_600_000);
  return age ? { en: `for ${age.en}`, ta: age.ta } : null;
}

/** When one thing happened (a report came out): "this morning", "yesterday evening", "on Friday", "about a week ago"; null when unknown. */
export function pointWords(t: number | null, now: number): string | null {
  const s = sinceWords(t, now)?.en;
  if (!s) return null;
  if (s === "for the last hour or two") return "in the last hour or two";
  if (/^since (Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)$/.test(s)) return s.replace(/^since /, "on ");
  if (s.startsWith("since ")) return s.slice(6);
  return `${s.replace(/^for /, "")} ago`;
}

/** When a deadline passed or falls: "passed this morning", "passed yesterday", "passed on Monday", "is due this evening", "is due tomorrow". */
export function deadlineWords(due: number | null, now: number): { passed: boolean; en: string; ta: string } | null {
  if (due == null || !Number.isFinite(due)) return null;
  const a = ist(due), b = ist(now), days = b.day - a.day, part = PART_EN(a.h);
  if (due <= now) {
    // the small hours are "early this morning", a late one "earlier tonight": never "this night" (the briefing set, 17 Nov)
    if (days === 0) return { passed: true, en: part !== "night" ? `passed this ${part}` : a.h < 5 ? "passed early this morning" : "passed earlier tonight",
      ta: `இன்று ${part === "night" && a.h < 5 ? "அதிகாலை" : PART_TA[part]} முடிந்துவிட்டது` };
    if (days === 1) return { passed: true, en: "passed yesterday", ta: "நேற்றே முடிந்துவிட்டது" };
    if (days < 7) return { passed: true, en: `passed on ${WEEKDAY_EN[a.wd]}`, ta: `${WEEKDAY_TA[a.wd]} அன்றே முடிந்துவிட்டது` };
    const age = ageWords((now - due) / 3_600_000);
    return { passed: true, en: age ? `passed ${age.en} ago` : "passed long ago", ta: age ? `${age.ta.replace(/ாக$/, "")} முன்பே முடிந்துவிட்டது` : "எப்போதோ முடிந்துவிட்டது" };
  }
  if (days === 0) return { passed: false, en: part === "night" ? "is due tonight" : `is due this ${part}`, ta: `இன்று ${PART_TA[part]} வரை நேரம் இருக்கிறது` };
  if (days === -1) return { passed: false, en: "is due tomorrow", ta: "நாளை வரை நேரம் இருக்கிறது" };
  return null;
}

export interface BriefFacts extends FactSheet {
  /** when it began (epoch ms), from the record's first time */
  since: number | null;
  /** its deadline (epoch ms), from the record */
  due: number | null;
  /** the first official named on it, by role only (a designation from the record, never a person's name or number) */
  role: string | null;
  /** how many officials the record names on it */
  officials: number;
  /** a news outlet that reported it, and when (from the record's own reports) */
  news: { outlet: string; at: number | null } | null;
  /** the latest report or update on it (epoch ms) */
  lastAt: number | null;
  now: number;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
/** an event, told by when it was reported (narrate.ts plainWhat's names: "a road accident", "a fire", "a crime report", "a structure that has given way") */
const EVENT = /(?:accident|fire|report|given way)$/;
/** a holder said with a plural verb */
const PLURAL_BODY = /\bpolice$/i;
/** a role as said: "the assistant engineer", from the record's designation (short, letters only); null for anything else */
export function roleWords(designation: unknown): string | null {
  const d = String(designation ?? "").replace(/\s+/g, " ").trim();
  if (!d || d.length > 40 || /[0-9@:/]/.test(d) || d.split(" ").length > 5) return null;
  return `the ${d.toLowerCase()}`;
}

/**
 * The briefing. `sources`: the record's own texts (its title, its reasons, its reports), so no line may read one of them out (speechcheck.ts),
 * as for explainIssue. A closed incident is told as narrate.ts tells it (nothing to chase).
 */
export function briefIssue(f: BriefFacts, label: string, sources: string[] = []): Bilingual {
  if (f.closed || briefStyle() === "v5") return explainIssue(f, label, sources);
  const what = f.what?.en ?? "an issue";
  const since = sinceWords(f.since, f.now);
  const due = deadlineWords(f.due, f.now);
  const place = f.place ? ` at ${f.place}` : "";
  // 1. the headline: a lasting problem "since" when it began; an event (an accident, a fire, a report) when it was reported, not "since"
  const event = EVENT.test(what);
  const point = event ? pointWords(f.since, f.now) : null;
  const when = event ? (point ? ` ${/report$/.test(what) ? "came in" : "reported"} ${point}` : "") : since ? ` ${since.en}` : "";
  const s1 = `${cap(what)}${place}${when}${f.what ? "" : `, logged as ${label.toLowerCase()}`}.`;
  // 2. how serious, and why (a deadline that passed at a known time is said once, in 3, with when)
  const why: string[] = [];
  if (f.complaints >= 2) why.push(`${f.complaints} people have complained`);
  if (f.news) { const w = pointWords(f.news.at, f.now); why.push(w ? `${f.news.outlet} reported it ${w}` : `${f.news.outlet} has reported it`); }
  if (f.overdue && !due?.passed) why.push("it's past its deadline");
  const s2 = f.serious ? `It's one of the serious ones${why.length ? `: ${joinAnd(why)}` : ""}.` : why.length ? `${cap(joinAnd(why))}.` : "";
  // 3. done and by whom, and what is stuck ("the police have it": a plural body)
  const holder = f.who ? `${cap(f.who.en)} ${PLURAL_BODY.test(f.who.en) ? "have" : "has"} it` : "No department has it yet";
  const officer = f.who ? (f.role ? `, with ${f.role} on it` : f.officials ? "" : ", but no officer is named") : "";
  const stuck = due?.passed ? `${officer.startsWith(", but") ? " and" : ", but"} the deadline ${due.en}` : due && !due.passed ? `; it ${due.en}` : "";
  const quiet = f.lastAt != null && f.now - f.lastAt > 2 * DAY ? ` Nothing new has come in ${(sinceWords(f.lastAt, f.now)?.en ?? "for a while")}.` : "";
  const s3 = `${holder}${officer}${stuck}.${quiet}`;
  // 4. what I would do
  const s4 = f.next ? `I'd ${f.next.en}${f.overdue ? " today" : ""}.` : f.who ? `I'd ask ${f.who.en} for an update${f.overdue ? " today" : ""}.` : "I'd assign it to a department today.";
  const en = [s1, s2, s3, s4, "Want the details?"].filter(Boolean).join(" ");

  const whatTa = f.what ? f.what.ta : "ஒரு பிரச்சினை";
  const t1 = `${f.placeTa ? `${f.placeTa} பகுதியில் ` : ""}${since ? `${since.ta} ` : ""}${whatTa} இருக்கிறது.`;
  const whyTa: string[] = [];
  if (f.complaints >= 2) whyTa.push(`${f.complaints} பேர் புகார் கொடுத்திருக்கிறார்கள்`);
  if (f.news) whyTa.push(`${f.news.outlet} செய்தியிலும் வந்திருக்கிறது`);
  if (f.overdue && !(f.who && due?.passed)) whyTa.push("கெடுவும் தாண்டிவிட்டது");
  const t2 = f.serious ? `இது கடுமையானவற்றில் ஒன்று${whyTa.length ? `: ${whyTa.join(", ")}` : ""}.` : whyTa.length ? `${whyTa.join(", ")}.` : "";
  const t3 = f.who ? `${f.who.ta} பொறுப்பில் இருக்கிறது${!f.role && !f.officials ? ", ஆனால் எந்த அதிகாரியும் குறிப்பிடப்படவில்லை" : ""}${due?.passed ? `; கெடு ${due.ta}` : due ? `; ${due.ta}` : ""}.` : "எந்தத் துறையிடமும் இன்னும் ஒப்படைக்கப்படவில்லை.";
  const t4 = f.next ? `${f.next.ta}${f.overdue ? ", இன்றே" : ""}.` : f.who ? `${idam(f.who.ta)} ${f.overdue ? "இன்றே " : ""}நிலவரம் கேட்கலாம்.` : "இன்றே ஒரு துறையிடம் ஒப்படைக்கலாம்.";
  const ta = [t1, t2, t3, t4, "மேலும் விவரம் வேண்டுமா?"].filter(Boolean).join(" ");
  // the gates: a line that reads a record out, or carries a field, falls back to v5's retelling
  if (speechProblem(en, sources, [f.place ?? "", f.placeTa ?? "", f.news?.outlet ?? "", f.role ?? ""])) return explainIssue(f, label, sources);
  return { en, ta };
}

function joinAnd(xs: string[]): string {
  if (xs.length <= 1) return xs.join("");
  return `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`;
}
