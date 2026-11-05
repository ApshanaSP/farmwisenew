/**
 * Explaining one issue the way a person would: code builds a fact sheet from the record (what kind of problem, where, how long,
 * how stuck, how many people, who holds it, what to do), then a short retelling in plain words, answer first:
 *   what is wrong, and where -> how long it has been stuck -> why it matters -> what I would do next.
 * Every figure comes from the fact sheet (and is on the Stage); no line repeats the record's own wording (speechcheck.ts).
 */
import type { Bilingual, CaseRowT } from "./stage";
import { speechProblem } from "./speechcheck";

export interface FactSheet {
  /** a plain noun phrase for the problem ("standing water"), or null */
  what: { en: string; ta: string } | null;
  place: string | null;
  placeTa: string | null;
  /** hours open, if known */
  hours: number | null;
  overdue: boolean;
  serious: boolean;
  complaints: number;
  /** who holds it, in plain words */
  who: { en: string; ta: string } | null;
  /** the next step, in plain words, from code */
  next: { en: string; ta: string } | null;
}

const PLAIN: [RegExp, string, string][] = [
  [/flood|waterlog|inundat|stagnat/i, "standing water", "தண்ணீர் தேக்கம்"],
  [/drain|sewage|sewer/i, "a sewage overflow", "கழிவுநீர் வழிதல்"],
  [/pothole|road damage|road/i, "a damaged road", "சேதமான சாலை"],
  [/garbage|waste|sanitat|debris/i, "uncleared garbage", "அகற்றப்படாத குப்பை"],
  [/street ?light|electrical/i, "street lights out", "எரியாத தெருவிளக்குகள்"],
  [/vector|dengue|mosquito|malaria|fever/i, "a mosquito and fever problem", "கொசு, காய்ச்சல் பிரச்சினை"],
  [/hospital|bed|health service/i, "a hospital under strain", "நெருக்கடியில் உள்ள மருத்துவமனை"],
  [/fire|explosion/i, "a fire", "தீ விபத்து"],
  [/water supply|drinking water/i, "a drinking-water problem", "குடிநீர்ப் பிரச்சினை"],
  [/accident/i, "a road accident", "சாலை விபத்து"],
  [/traffic|parking/i, "a traffic blockage", "போக்குவரத்து நெரிசல்"],
  [/wall|collapse|building/i, "a structure that has given way", "இடிந்த கட்டமைப்பு"],
  [/tree/i, "a fallen tree", "விழுந்த மரம்"],
  [/crime|theft|snatch|assault|murder/i, "a crime report", "குற்றப் புகார்"],
  [/air|pollution|smoke/i, "bad air", "காற்று மாசு"]
];

/** The problem in plain words, from its category (or, failing that, its own short label). */
export function plainWhat(cat: string | null, label: string | null): { en: string; ta: string } | null {
  for (const src of [cat, label]) {
    if (!src) continue;
    const hit = PLAIN.find(([re]) => re.test(src));
    if (hit) return { en: hit[1], ta: hit[2] };
  }
  return null;
}

/** Who holds it, as people say it ("the corporation's drains team", "the police", "Metrowater"). */
export function plainWho(code: string | null, name: string | null): { en: string; ta: string } | null {
  if (!code && !name) return null;
  const c = code ?? "";
  if (c.startsWith("POL")) return { en: "the police", ta: "காவல்துறை" };
  if (c === "CMWSSB") return { en: "Metrowater", ta: "குடிநீர் வாரியம்" };
  if (c.startsWith("PWD")) return { en: "the PWD", ta: "பொதுப்பணித்துறை" };
  if (c === "TANGEDCO") return { en: "the electricity board", ta: "மின் வாரியம்" };
  if (c === "HLT-DMS") return { en: "the health department", ta: "சுகாதாரத் துறை" };
  if (c === "GCC-SWD") return { en: "the corporation's drains team", ta: "மாநகராட்சியின் மழைநீர் வடிகால் பிரிவு" };
  if (c === "GCC-SWM") return { en: "the corporation's conservancy team", ta: "மாநகராட்சியின் துப்புரவுப் பிரிவு" };
  if (c.startsWith("GCC")) return { en: "the corporation", ta: "மாநகராட்சி" };
  return name ? { en: name, ta: name } : null;
}

/** "about four days", never a figure: the voice says time in words. */
export function ageWords(hours: number | null): { en: string; ta: string } | null {
  if (hours == null || !Number.isFinite(hours) || hours < 0) return null;
  if (hours < 3) return { en: "a couple of hours", ta: "இரண்டு மணி நேரமாக" };
  if (hours < 20) return { en: "several hours", ta: "சில மணி நேரமாக" };
  if (hours < 36) return { en: "about a day", ta: "ஏறக்குறைய ஒரு நாளாக" };
  if (hours < 72) return { en: "a couple of days", ta: "இரண்டு நாட்களாக" };
  if (hours < 24 * 6) return { en: "several days", ta: "பல நாட்களாக" };
  if (hours < 24 * 10) return { en: "about a week", ta: "ஏறக்குறைய ஒரு வாரமாக" };
  if (hours < 24 * 21) return { en: "a couple of weeks", ta: "இரண்டு வாரங்களாக" };
  return { en: "well over three weeks", ta: "மூன்று வாரங்களுக்கும் மேலாக" };
}

/** "6 hours", "4 days", "2 weeks" as the store writes open_for, in hours. */
export function hoursOf(openFor: unknown): number | null {
  const m = String(openFor ?? "").match(/(\d+(?:\.\d+)?)\s*(minute|min|hour|hr|h|day|d|week|wk|month)/i);
  if (!m) return null;
  const n = Number(m[1]), u = m[2].toLowerCase();
  return u.startsWith("min") ? n / 60 : u.startsWith("h") ? n : u.startsWith("d") ? n * 24 : u.startsWith("w") ? n * 168 : n * 720;
}

export function factSheet(row: CaseRowT, extra: { openFor?: unknown; firstAt?: string | null; now?: number; next?: { en: string; ta: string } | null; placeTa?: string | null } = {}): FactSheet {
  let hours = hoursOf(extra.openFor);
  if (hours == null && extra.firstAt) {
    const m = String(extra.firstAt).match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
    if (m) hours = ((extra.now ?? Date.now()) - Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]) - 5, Number(m[5]) - 30)) / 3_600_000;
  }
  return {
    what: plainWhat(row.cat, row.why ?? row.title), place: row.place ?? row.zoneName ?? null, placeTa: extra.placeTa ?? row.zoneName ?? row.place ?? null,
    hours, overdue: row.overdue, serious: row.sev === "Severe" || row.sev === "High", complaints: row.complaints, who: plainWho(row.dept, row.deptName), next: extra.next ?? null
  };
}

/** "to X" in Tamil, joined as the word ends: துறை -> துறையிடம், மாநகராட்சி -> மாநகராட்சியிடம், வாரியம் -> வாரியத்திடம், பிரிவு -> பிரிவிடம் */
export function idam(word: string): string {
  if (/[ைிீ]$/.test(word)) return `${word}யிடம்`;
  if (/ம்$/.test(word)) return `${word.slice(0, -2)}த்திடம்`;
  if (/ு$/.test(word)) return `${word.slice(0, -1)}ிடம்`;
  if (/்$/.test(word)) return `${word.slice(0, -1)}ிடம்`;
  return `${word}இடம்`;
}

const article = (s: string) => (/^(a|an|the|uncleared|standing|street|bad)\b/i.test(s) ? s : `${/^[aeiou]/i.test(s) ? "an" : "a"} ${s}`);

/** The retelling, in two to four short sentences. `label` is the record's own short name, used only when the kind is unknown. */
export function explainIssue(f: FactSheet, label: string, sources: string[] = []): Bilingual {
  const what = f.what ? article(f.what.en) : "an issue";
  const s1 = `There's ${what}${f.place ? ` at ${f.place}` : ""}${f.what ? "" : `, logged as ${label.toLowerCase()}`}.`;
  const age = ageWords(f.hours);
  const s2 = age ? `It's been open for ${age.en}${f.overdue ? ", and it's past its deadline" : ""}.` : f.overdue ? "It's past its deadline." : "";
  const s3 = f.complaints >= 2 ? `${f.complaints} people have complained about it, so it's hitting a lot of residents${f.serious ? ", and it's one of the serious ones" : ""}.`
    : f.serious ? "It's one of the serious ones." : "";
  const s4 = f.next ? `I'd ${f.next.en}${f.overdue ? " today" : ""}.` : f.who ? `I'd ask ${f.who.en} for an update${f.overdue ? " today" : ""}.` : "";
  const en = [s1, s2, s3, s4].filter(Boolean).join(" ");
  const whatTa = f.what ? f.what.ta : "ஒரு பிரச்சினை";
  const t1 = `${f.placeTa ? `${f.placeTa} பகுதியில் ` : ""}${whatTa} இருக்கிறது.`;
  const t2 = age ? `${age.ta} தீர்க்கப்படாமல் இருக்கிறது${f.overdue ? ", கெடுவும் தாண்டிவிட்டது" : ""}.` : f.overdue ? "கெடு தாண்டிவிட்டது." : "";
  const t3 = f.complaints >= 2 ? `${f.complaints} பேர் புகார் கொடுத்திருக்கிறார்கள், நிறைய பேரைப் பாதிக்கிறது${f.serious ? "; இது கடுமையானவற்றில் ஒன்று" : ""}.` : f.serious ? "இது கடுமையானவற்றில் ஒன்று." : "";
  const t4 = f.next ? `${f.next.ta}${f.overdue ? ", இன்றே" : ""}.` : f.who ? `${idam(f.who.ta)} ${f.overdue ? "இன்றே " : ""}நிலவரம் கேட்கலாம்.` : "";
  const ta = [t1, t2, t3, t4].filter(Boolean).join(" ");
  // the gates: a line that reads a record out, or carries a field, falls back to the plainest retelling
  const names = [f.place ?? "", f.placeTa ?? ""];
  if (speechProblem(en, sources, names)) return { en: [`There's ${what}${f.place ? ` at ${f.place}` : ""}.`, s2, s4].filter(Boolean).join(" "), ta };
  return { en, ta };
}
