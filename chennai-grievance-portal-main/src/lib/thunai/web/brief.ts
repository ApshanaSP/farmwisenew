/**
 * Jarvis v6, Phase 4: what Jarvis says about a report and its coverage. Server only, no network, no model.
 *
 * Two to four short sentences, in English and in Tamil, each fact with the outlet that reported it ("The Hindu reported this
 * morning: ...; DT Next adds: ..."), relative times in Chennai's time zone, never a URL read out (the links go to the screen),
 * plus the first line to say at once ("Reading The Hindu's report..."). Every quoted fact is verbatim from that outlet's own text
 * (compare.ts); the only words of Jarvis's own are the frames around them and the figures code compared.
 *
 * The Tamil frames below are MODEL-DRAFTED and have NOT been checked by a Tamil speaker. A quote stays in its report's own
 * language (an English report's sentence is read in English inside the Tamil frame): code never translates a fact.
 */
import type { Comparison, Fact, MeasureKey } from "./compare";

export interface BriefPrimary { outlet: string | null; outletTa?: string | null; url: string; title: string; publishedAt: string | null; status: string }
export interface BriefLinkIn { outlet: string; outletTa?: string | null; url: string; title: string; publishedAt: string | null }
export interface Link { outlet: string; title: string; url: string; publishedAt: string | null; when: string | null }
export interface SpokenBrief {
  /** say this at once, before anything is fetched */
  first: { en: string; ta: string };
  en: string[];
  ta: string[];
  /** for the screen only: never read out */
  links: Link[];
  facts: { outlet: string; quote: string; url: string }[];
  fromWeb: true;
}

const IST = 5.5 * 3600_000;
const DAY = 864e5;
const WEEKDAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const WEEKDAY_TA = ["ஞாயிற்றுக்கிழமை", "திங்கள்கிழமை", "செவ்வாய்க்கிழமை", "புதன்கிழமை", "வியாழக்கிழமை", "வெள்ளிக்கிழமை", "சனிக்கிழமை"];
const MONTH = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const MONTH_TA = ["ஜனவரி", "பிப்ரவரி", "மார்ச்", "ஏப்ரல்", "மே", "ஜூன்", "ஜூலை", "ஆகஸ்ட்", "செப்டம்பர்", "அக்டோபர்", "நவம்பர்", "டிசம்பர்"];

/** "this morning", "yesterday evening", "on Tuesday", "on 3 November" (Chennai time); null when the time is unknown. */
export function relativeTime(iso: string | null | undefined, now: number, lang: "en" | "ta" = "en"): string | null {
  const t = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(t)) return null;
  const mins = Math.round((now - t) / 60_000);
  if (mins < -10) return null; // a time in the future: a wrong clock, not said
  if (mins < 5) return lang === "ta" ? "இப்போதுதான்" : "just now";
  if (mins < 60) return lang === "ta" ? `${mins} நிமிடங்களுக்கு முன்` : `${mins} minutes ago`;
  const local = new Date(t + IST);
  const h = local.getUTCHours();
  const dayDiff = Math.floor((t + IST) / DAY) - Math.floor((now + IST) / DAY);
  const part = h < 5 ? 0 : h < 12 ? 1 : h < 17 ? 2 : h < 21 ? 3 : 4;
  if (dayDiff === 0) return lang === "ta" ? ["இன்று அதிகாலை", "இன்று காலை", "இன்று மதியம்", "இன்று மாலை", "இன்று இரவு"][part] : ["early this morning", "this morning", "this afternoon", "this evening", "tonight"][part];
  if (dayDiff === -1) return lang === "ta" ? ["நேற்று அதிகாலை", "நேற்று காலை", "நேற்று மதியம்", "நேற்று மாலை", "நேற்று இரவு"][part] : ["early yesterday", "yesterday morning", "yesterday afternoon", "yesterday evening", "last night"][part];
  if (dayDiff >= -6 && dayDiff < 0) return lang === "ta" ? `${WEEKDAY_TA[local.getUTCDay()]} அன்று` : `on ${WEEKDAY[local.getUTCDay()]}`;
  return lang === "ta" ? `${local.getUTCDate()} ${MONTH_TA[local.getUTCMonth()]} அன்று` : `on ${local.getUTCDate()} ${MONTH[local.getUTCMonth()]}`;
}

const possessive = (name: string) => `${name}'s`;
/** The line to say at once, before the page is fetched. */
export function firstLine(outlet: string | null | undefined, outletTa?: string | null): { en: string; ta: string } {
  return { en: outlet ? `Reading ${possessive(outlet)} report...` : "Reading the report...", ta: outletTa ? `${outletTa} செய்தியைப் படிக்கிறேன்...` : "செய்தியைப் படிக்கிறேன்..." };
}

/** No address is ever read out. */
export const noUrls = (s: string) => s.replace(/\bhttps?:\/\/\S+|\bwww\.\S+|\b[\w-]+\.(?:com|in|org|net|gov\.in)(?:\/\S*)?/gi, "").replace(/\s{2,}/g, " ").trim();
const end = (s: string) => (/[.!?…]["”’]?$/.test(s) ? s : `${s}.`);
const cap1 = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const LABEL: Record<MeasureKey, { agree: (n: number) => string; differ: string; ta: string }> = {
  dead: { agree: (n) => `${n} ${n === 1 ? "person" : "people"} died`, differ: "the number of dead", ta: "உயிரிழந்தோர்" },
  injured: { agree: (n) => `${n} ${n === 1 ? "person was" : "people were"} injured`, differ: "the number injured", ta: "காயமடைந்தோர்" },
  arrested: { agree: (n) => `${n} ${n === 1 ? "person was" : "people were"} arrested`, differ: "the number arrested", ta: "கைது செய்யப்பட்டோர்" },
  rescued: { agree: (n) => `${n} ${n === 1 ? "person was" : "people were"} rescued`, differ: "the number rescued", ta: "மீட்கப்பட்டோர்" },
  rain_mm: { agree: (n) => `${n} mm of rain fell`, differ: "the rainfall in millimetres", ta: "மழை அளவு (மில்லிமீட்டர்)" },
  houses: { agree: (n) => `${n} houses were affected`, differ: "the number of houses", ta: "பாதிக்கப்பட்ட வீடுகள்" },
  vehicles: { agree: (n) => `${n} vehicles were involved`, differ: "the number of vehicles", ta: "வாகனங்கள்" },
  camps: { agree: (n) => `${n} relief camps were opened`, differ: "the number of relief camps", ta: "நிவாரண முகாம்கள்" }
};
const list = (xs: string[], and: string) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} ${and} ${xs[xs.length - 1]}`);

/**
 * The spoken brief for a report and its coverage: 2-4 sentences in each language (fewer only when there is nothing more to say),
 * every fact with its outlet; the links for the screen.
 */
export function briefFromCoverage(input: { primary: BriefPrimary; related?: BriefLinkIn[]; comparison?: Comparison | null }, o: { now?: () => number } = {}): SpokenBrief {
  const now = (o.now ?? Date.now)();
  const p = input.primary, cmp = input.comparison ?? null;
  const pName = p.outlet ?? "The report", pTa = p.outletTa ?? p.outlet ?? "செய்தி";
  const taOf = new Map<string, string>([[pName, pTa], ...(input.related ?? []).map((r) => [r.outlet, r.outletTa ?? r.outlet] as [string, string])]);
  const whenOf = new Map<string, string | null>([[pName, p.publishedAt], ...(input.related ?? []).map((r) => [r.outlet, r.publishedAt] as [string, string | null])]);
  const en: string[] = [], ta: string[] = [];
  const add = (e: string, t: string) => { if (en.length < 4) { en.push(end(noUrls(e))); ta.push(end(noUrls(t))); } };
  const facts = cmp?.facts ?? [];
  const own = facts.filter((f) => f.outlet === pName);
  const spoken = new Set<Fact>();

  // 1. the report itself: its best fact, else its headline
  const when = relativeTime(p.publishedAt, now), whenTa = relativeTime(p.publishedAt, now, "ta");
  if (own[0]) {
    add(`${pName} reported${when ? ` ${when}` : ""}: ${own[0].say}`, `${pTa}${whenTa ? ` ${whenTa}` : ""} வெளியிட்ட செய்தி: ${own[0].say}`);
    spoken.add(own[0]);
  } else if (p.title) {
    add(`${possessive(pName)} headline${when ? `, ${when}` : ""}: ${p.title}`, `${pTa} தலைப்புச் செய்தி${whenTa ? `, ${whenTa}` : ""}: ${p.title}`);
    if (p.status !== "ok" && p.status !== "stored") add("I could not open the full report, so that is the headline only", "முழுச் செய்தியைத் திறக்க முடியவில்லை; இது தலைப்பு மட்டுமே");
  }
  // 2. where outlets disagree on a figure: both, named
  for (const d of (cmp?.differ ?? []).slice(0, 1)) {
    const parts = d.values.map((v) => `${v.outlet} says ${v.value}`);
    const partsTa = d.values.map((v) => `${v.outletTa} ${v.value} என்றும்`);
    add(`On ${LABEL[d.key].differ}, ${list(parts, "and")}`, `${LABEL[d.key].ta} எண்ணிக்கையில், ${partsTa.join(" ")} கூறுகின்றன`);
  }
  // 3. where they agree
  for (const a of (cmp?.agree ?? []).slice(0, 1)) {
    add(`${list(a.outlets, "and")} agree that ${LABEL[a.key].agree(a.value)}`, `${list(a.outlets.map((x) => taOf.get(x) ?? x), "மற்றும்")} ஆகியவை ${LABEL[a.key].ta} ${a.value} என ஒரே எண்ணிக்கையைத் தருகின்றன`);
  }
  // 4. what the other outlets add, one fact each, then the newest report's own fact
  const newest = (cmp?.newest ?? [])[0];
  const others = [...new Set(facts.filter((f) => f.outlet !== pName).map((f) => f.outlet))];
  for (const out of others) {
    if (newest && newest.outlet === out) continue;
    const f = facts.find((x) => x.outlet === out && !spoken.has(x));
    if (!f) continue;
    const t = taOf.get(out) ?? f.outletTa;
    add(`${out} adds: ${f.say}`, `${t} மேலும் கூறுவது: ${f.say}`);
    spoken.add(f);
  }
  if (newest && !spoken.has(newest)) {
    const w = relativeTime(newest.publishedAt ?? whenOf.get(newest.outlet) ?? null, now), wt = relativeTime(newest.publishedAt ?? whenOf.get(newest.outlet) ?? null, now, "ta");
    add(`The newest report, from ${newest.outlet}${w ? ` ${w}` : ""}, says: ${newest.say}`, `மிகச் சமீபத்திய செய்தி, ${taOf.get(newest.outlet) ?? newest.outletTa}${wt ? ` ${wt}` : ""}: ${newest.say}`);
    spoken.add(newest);
  }
  // 5. fewer than two sentences: the report's next fact
  if (en.length < 2 && own[1]) add(`It adds: ${own[1].say}`, `மேலும்: ${own[1].say}`);

  const links: Link[] = [
    { outlet: pName, title: p.title, url: p.url, publishedAt: p.publishedAt, when },
    ...(input.related ?? []).map((r) => ({ outlet: r.outlet, title: r.title, url: r.url, publishedAt: r.publishedAt, when: relativeTime(r.publishedAt, now) }))
  ].filter((l) => /^https?:\/\//i.test(l.url));
  return {
    first: firstLine(p.outlet, p.outletTa),
    en: en.map(cap1), ta,
    links,
    facts: [...spoken].map((f) => ({ outlet: f.outlet, quote: f.quote, url: f.url })),
    fromWeb: true
  };
}
