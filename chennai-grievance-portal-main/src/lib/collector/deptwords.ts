/**
 * The department summary's arithmetic and its sentences (deptsummary.ts): pure, so the pop-up, the assistant and the tests share them.
 * No model writes a word of it: the sentences are made from the same figures the pop-up shows.
 */
import { nm, periodWords, prevWords, say, type Seg } from "@/lib/collector/glance";
import type { Period } from "@/lib/period/day";

/** Open cases by age in days, oldest bucket last. The buckets meet (3 days is the first, 4 the second), so they add up to every open case. */
export const AGE_BUCKETS: { key: string; label: string; upto: number }[] = [
  { key: "a", label: "0–3 days", upto: 3 }, { key: "b", label: "4–7 days", upto: 7 }, { key: "c", label: "8–15 days", upto: 15 },
  { key: "d", label: "16–30 days", upto: 30 }, { key: "e", label: "Over 30 days", upto: Infinity }
];
export function ageBuckets(rows: { d: unknown; n: unknown }[]): { key: string; label: string; n: number }[] {
  const out = AGE_BUCKETS.map((b) => ({ key: b.key, label: b.label, n: 0 }));
  for (const r of rows) {
    // a case filed a moment ago, or dated ahead of the clock, is 0 days old
    const d = Math.max(0, Number(r.d) || 0);
    out[AGE_BUCKETS.findIndex((b) => d <= b.upto)].n += Number(r.n) || 0;
  }
  return out;
}

/** The middle value (the mean of the two middle ones), or null for none. */
export function median(v: number[]): number | null {
  const a = v.filter((x) => Number.isFinite(x)).sort((x, y) => x - y);
  if (!a.length) return null;
  const m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}
export const average = (v: number[]): number | null => {
  const a = v.filter((x) => Number.isFinite(x));
  return a.length ? a.reduce((s, x) => s + x, 0) / a.length : null;
};

/** Minutes as people say them: "5 hours", "2.1 days". */
export function spanWords(minutes: number | null): { v: string; en: string; ta: string } | null {
  if (minutes == null || !Number.isFinite(minutes) || minutes < 0) return null;
  if (minutes < 60) { const m = Math.max(1, Math.round(minutes)); return { v: `${m} min`, en: `${m} minutes`, ta: `${m} நிமிடங்கள்` }; }
  const h = minutes / 60;
  // rounded first: 47.6 hours is "48 hours" in words and belongs to days
  if (Math.round(h) < 48) { const x = Math.round(h); return { v: `${x} h`, en: `${x} ${x === 1 ? "hour" : "hours"}`, ta: `${x} மணி நேரம்` }; }
  const d = Math.round((h / 24) * 10) / 10;
  return { v: `${d} days`, en: `${d} days`, ta: `${d} நாட்கள்` };
}

export interface DeptFacts {
  name: string; period: Period; now: string; where: string | null;
  reported: number; prevReported: number; open: number; overdue: number; severeOpen: number; resolved: number; onTime: number; timed: number; deaths: number;
  medianMinutes: number | null;
  kinds: { label: string; n: number }[]; areas: { name: string; n: number }[];
}
/** Two or three sentences on the department's period, in English and Tamil; names are their own pieces (glance.ts). */
export function deptSentences(f: DeptFacts): { en: Seg[][]; ta: Seg[][] } {
  const per = periodWords(f.period, f.now), prev = prevWords(f.period, f.now);
  const where = f.where ? { en: say` in ${nm(f.where)}`, ta: say`${nm(f.where)}: ` } : { en: [] as Seg[], ta: [] as Seg[] };
  if (!f.reported && !f.open && !f.resolved) return {
    en: [say`${nm(f.name)}${where.en} received no report and closed no case ${per.en}.`], ta: [say`${where.ta}${nm(f.name)} ${per.ta} எந்தப் பதிவும் பெறவில்லை; எதையும் முடிக்கவில்லை.`]
  };
  const d = f.reported - f.prevReported;
  const ch = d === 0 ? { en: `the same as ${prev.en}`, ta: "மாற்றமில்லை" } : { en: `${Math.abs(d).toLocaleString("en-IN")} ${d > 0 ? "more" : "fewer"} than ${prev.en}`, ta: `${prev.ta} விட ${Math.abs(d).toLocaleString("en-IN")} ${d > 0 ? "அதிகம்" : "குறைவு"}` };
  const en: Seg[][] = [], ta: Seg[][] = [];
  const k = f.kinds.filter((x) => x.n > 0).slice(0, 2), a = f.areas.filter((x) => x.n > 0)[0];
  if (f.reported) {
    en.push(say`${nm(f.name)}${where.en} received ${f.reported} ${f.reported === 1 ? "report" : "reports"} ${per.en}, ${ch.en}${k.length ? say`, mostly ${nm(k[0].label)} (${k[0].n})${k[1] ? say` and ${nm(k[1].label)} (${k[1].n})` : ""}` : ""}${a ? say`; most from ${nm(a.name)} (${a.n})` : ""}.`);
    ta.push(say`${where.ta}${nm(f.name)} ${per.ta} ${f.reported} பதிவுகளைப் பெற்றது (${ch.ta})${k.length ? say`; அதிகம்: ${nm(k[0].label)} (${k[0].n})${k[1] ? say`, ${nm(k[1].label)} (${k[1].n})` : ""}` : ""}${a ? say`; அதிகம் வந்த இடம் ${nm(a.name)} (${a.n})` : ""}.`);
  } else {
    en.push(say`${nm(f.name)}${where.en} received no report ${per.en}.`);
    ta.push(say`${where.ta}${nm(f.name)} ${per.ta} எந்தப் பதிவும் பெறவில்லை.`);
  }
  if (f.reported) en.push(f.open ? say`${f.open} of them ${f.open === 1 ? "is" : "are"} still open${f.overdue ? `, ${f.overdue.toLocaleString("en-IN")} past deadline` : ", none past deadline"}${f.severeOpen ? `, ${f.severeOpen.toLocaleString("en-IN")} severe` : ""}${f.deaths ? `; ${f.deaths.toLocaleString("en-IN")} ${f.deaths === 1 ? "person" : "people"} died` : ""}.`
    : say`None of them is still open${f.deaths ? `; ${f.deaths.toLocaleString("en-IN")} ${f.deaths === 1 ? "person" : "people"} died` : ""}.`);
  if (f.reported) ta.push(f.open ? say`அவற்றில் ${f.open} இன்னும் திறந்துள்ளன${f.overdue ? `; காலக்கெடு தாண்டியவை ${f.overdue.toLocaleString("en-IN")}` : "; காலக்கெடு தாண்டியவை இல்லை"}${f.severeOpen ? `; கடுமையானவை ${f.severeOpen.toLocaleString("en-IN")}` : ""}${f.deaths ? `; உயிரிழப்பு ${f.deaths.toLocaleString("en-IN")}` : ""}.`
    : say`எதுவும் திறந்த நிலையில் இல்லை${f.deaths ? `; உயிரிழப்பு ${f.deaths.toLocaleString("en-IN")}` : ""}.`);
  const span = spanWords(f.medianMinutes);
  if (f.resolved) {
    en.push(say`It resolved ${f.resolved} ${f.resolved === 1 ? "case" : "cases"} ${per.en}${span ? `, half of them within ${span.en}` : ""}${f.timed ? `; ${f.onTime.toLocaleString("en-IN")} of ${f.timed.toLocaleString("en-IN")} met the deadline` : ""}.`);
    ta.push(say`${per.ta} ${f.resolved} நிகழ்வுகள் தீர்க்கப்பட்டன${span ? `; பாதி ${span.ta} க்குள்` : ""}${f.timed ? `; காலக்கெடுவுக்குள் ${f.timed.toLocaleString("en-IN")} இல் ${f.onTime.toLocaleString("en-IN")}` : ""}.`);
  } else {
    en.push(say`It resolved no case ${per.en}.`);
    ta.push(say`${per.ta} எதுவும் தீர்க்கப்படவில்லை.`);
  }
  return { en, ta };
}

/** A follow-up's words without its machine header ("[RR] {...} Clear the drain", "... (map send to GCC-SWD)"). */
export function followupWords(summary: unknown): string {
  let s = String(summary ?? "");
  if (s.startsWith("[RR] ")) {
    const end = s.indexOf("} ");
    s = end > 0 ? s.slice(end + 2) : s.slice(5);
  }
  return s.replace(/\s*\(map send to [A-Za-z0-9-]{2,20}\)\s*$/, "").replace(/\s+/g, " ").trim();
}
