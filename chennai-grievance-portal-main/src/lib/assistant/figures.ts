/**
 * The figures of Ask District IQ's written answer (QA pass 7, reviewer5-06 and its review). The writer may state a figure only when the
 * card carries it as a typed value: a KPI, a dataset's value cell, the number of incidents or stories shown, an incident's deaths,
 * injuries, complaints or sources. Rendered text is never a source of figures: the code's answer repeats titles, places and headlines in
 * changed forms (an outlet suffix cut, a title cut to 120 characters, a runner-up headline quoted in a caveat), and all of that is other
 * people's writing. Pass 6 took that writing out of the code's text by exact substring, so any changed copy left its digits in.
 *
 * Each typed figure carries what it counts, and each figure in a draft is bound to the words around it: "only 2 garbage cases are open"
 * needs a typed 2 that counts open cases, not the 2 stories shown, not last week's 2, not another zone's 2. A figure is read however it is
 * written (digits of any script, styled digits, digits glued to letters, number words in English, Tamil and Tanglish, "no cases"), and the
 * reading fails closed: a numeral it cannot read (a Roman numeral, a dingbat digit), a letter of another script, or a bidi control refuses
 * the draft. Dates, times, ids and ordinal street names are not figures; a ward or zone label and the window's own length ("last 7 days")
 * are taken out only when they are the card's own (its wards, its zone, its period).
 */
import type { AnswerCard, Period } from "@/lib/assistant/answer";
import { asciiDigits } from "@/lib/thunai/digits";

/** What a figure counts (a measure), or what else names it (items shown, stories, outlets, the period before, steps). */
export type Cue = "open" | "overdue" | "severe" | "resolved" | "death" | "injured" | "complaint" | "percent" | "shown" | "stories" | "outlets" | "prev" | "steps";
const MEASURES: Cue[] = ["open", "overdue", "severe", "resolved", "death", "injured", "complaint", "percent"];
const isMeasure = (c: Cue) => MEASURES.includes(c);

/** The words that say what a figure counts, in English, Tamil and Tanglish (the text is lower-cased and its negations turned first). */
const CUES: [Cue, RegExp][] = [
  ["open", /\b(open|pending|unresolved|outstanding|unattended|awaiting|waiting|active|remaining|uncleared|backlog)\b|நிலுவை|திறந்/],
  ["overdue", /\b(overdue|deadlines?|late|delayed|breach\w*)\b|காலக்கெடு|\bthaand/],
  ["severe", /\bsevere\b|கடுமை/],
  ["resolved", /\b(resolved?|closed|cleared|fixed|solved|disposed)\b|தீர்க்க|தீர்வு/],
  ["death", /\b(deaths?|dead|died|die|killed|fatal\w*|lives|life|toll)\b|உயிரிழ|இறந்|பலி|\buyir/],
  ["injured", /\b(injur\w*|hurt|wounded)\b|காய|\bkaayam/],
  ["complaint", /\b(complaints?|grievances?|petitions?)\b|புகார்|\bpugaar/],
  ["outlets", /\b(outlets?|sources?|newspapers?|papers|channels?|publications?|media|reports|records)\b|ஊடக|ஆதார|பத்திரிகை/],
  ["stories", /\b(stor(y|ies)|headlines?|articles?|news)\b|செய்தி|\bseidhi/],
  ["shown", /\b(listed|list|shown|below|above|these|those|following|newest|latest|oldest|highest|top)\b|பட்டியல்|புதிய|முக்கிய|சமீப|\b(pudhu|mukkiya\w*)\b/],
  ["prev", /\b(before|previous|prior|earlier|preceding|(?:up|down|rose|fell|risen|fallen|increased|decreased|dropped|climbed|grew)\s+from|compared|against)\b|முந்தைய|முன்பு|முன்னர்|\bmunnadi|\bmunbu/],
  ["steps", /\bsteps?\b|படிகள்|படி\b/]
];
/** a percentage: the sign or word right after the figure */
const PERCENT = /^[\s*_]*(%|per ?cents?\b|percentage\b|pct\b|pc\b|சதவீ|விழுக்காடு|sadhaveedh|sathaveeth)/;
/** a measure said in the negative is the other one: "no longer open" is resolved, "not yet resolved" is open */
const negationsTurned = (s: string) => s
  .replace(/\b(?:no longer|not|never|no more|isn't|aren't|wasn't|weren't|hasn't|haven't|n't)\s+(?:\w+\s+){0,2}?(?:open|pending|active|outstanding)\b/g, " resolved ")
  .replace(/\b(?:not|never|n't|yet to be)\s+(?:\w+\s+){0,2}?(?:resolved|closed|cleared|fixed|solved)\b/g, " open ")
  .replace(/தீர்க்கப்படா\S*|தீர்க்கப்படவில்லை|தீர்வு\s*காணப்படவில்லை|மூடப்படவில்லை/g, " நிலுவை ")
  .replace(/(?:நிலுவையில்|திறந்த\S*)\s*இல்லை/g, " தீர்க்க ");
const labelMeasures = (label: string): Cue[] => {
  const l = ` ${negationsTurned(label.toLowerCase())} `;
  const out = CUES.filter(([c, re]) => isMeasure(c) && re.test(l)).map(([c]) => c);
  if (/share|rate|%|per ?cent/.test(l)) out.push("percent");
  return out;
};

/**
 * A figure the card carries as a typed value. `must`: the measures it counts, one of which the words must name ("41 open", not a bare
 * "41 cases" for the open count); `may`: measures that hold for it and may be named (a list of open cases); `needs`: words that must name
 * it whatever it counts (the 5 newest, 2 stories, 3 outlets, last week's figure, a percentage); `row`: a dataset cell of several rows is
 * that row's figure only in a sentence that names its row (Teynampet's 2 is not Adyar's).
 */
export interface Typed { value: number; must: Cue[]; may: Cue[]; needs: Cue[]; row?: string[] }

/** Words of a row's label that name it ("Adyar", "Teynampet"), not the words every row shares. */
const GENERIC = new Set(["zone", "zones", "taluk", "ward", "nagar", "road", "street", "district", "area", "city", "place", "the", "and"]);
const rowWords = (label: unknown) => String(label ?? "").toLowerCase().split(/[^\p{L}\p{M}\p{N}]+/u).filter((w) => w.length >= 4 && !GENERIC.has(w));

/** Every typed figure of a card: from its structured data only, never from its text. */
export function cardFigures(card: AnswerCard): Typed[] {
  const out: Typed[] = [];
  const add = (v: unknown, t: Omit<Typed, "value">) => { if (typeof v === "number" && Number.isFinite(v)) out.push({ value: v, ...t }); };
  for (const k of card.kpis ?? []) {
    const must = [...labelMeasures(k.label), ...(k.format === "percent" && !/share|rate|%|per ?cent/i.test(k.label) ? ["percent" as Cue] : [])];
    const pct: Cue[] = must.includes("percent") ? ["percent"] : [];
    add(k.value, { must, may: [], needs: pct });
    add(k.prev, { must: [], may: must, needs: ["prev", ...pct] });
  }
  for (const d of card.datasets ?? []) {
    // a value field's cells (a score such as priority is not additive and never a figure the answer states)
    const fields = (d.fields ?? []).filter((f) => f.kind === "value" && f.additive !== false);
    const labelKey = (d.fields ?? []).find((f) => f.kind === "category" || f.kind === "geo")?.key;
    const several = (d.rows?.length ?? 0) >= 2;
    for (const r of d.rows ?? []) for (const f of fields) {
      const must = [...labelMeasures(f.label), ...(f.format === "percent" && !/share|rate|%|per ?cent/i.test(f.label) ? ["percent" as Cue] : [])];
      const prev = /_prev$/.test(f.key) || /period before|previous/i.test(f.label);
      const row = several && labelKey ? rowWords(r[labelKey]) : [];
      add(r[f.key], { must, may: [], needs: [...(prev ? ["prev" as Cue] : []), ...(must.includes("percent") ? ["percent" as Cue] : [])], ...(row.length ? { row } : {}) });
    }
    add(d.total, { must: [], may: [], needs: [] });
    add(d.rows?.length, { must: [], may: [], needs: ["shown"] });
  }
  if (card.chart?.threshold) add(card.chart.threshold.value, { must: [], may: [], needs: [] });
  // what the answer lists, and what holds for every item listed: the filters in force, or each item's own severity and status
  const f = card.context?.activeFilters;
  const items = card.incidents ?? [];
  const every = (p: (x: (typeof items)[number]) => boolean) => items.length > 0 && items.every(p);
  const holds: Cue[] = [...(f?.openOnly || f?.overdue || every((x) => !/resolved|closed|rejected|lapsed|verified|completed/i.test(x.status ?? "")) ? ["open" as Cue] : []),
    ...(f?.overdue ? ["overdue" as Cue] : []), ...(/severe/i.test(f?.sev ?? "") || every((x) => /^severe$/i.test(x.severity ?? "")) ? ["severe" as Cue] : [])];
  if (card.incidents) add(items.length, { must: [], may: holds, needs: ["shown"] });
  if (card.incident) add(1, { must: [], may: [], needs: ["shown"] });
  // (the previous answer's list, "of the three listed"; never the number asked for, which may be more than were found)
  add(card.context?.resultIds?.length, { must: [], may: holds, needs: ["shown"] });
  for (const x of [...items, ...(card.incident ? [card.incident] : [])]) {
    add(x.dead, { must: ["death"], may: [], needs: [] }); add(x.injured, { must: ["injured"], may: [], needs: [] });
    add(x.citizenComplaintCount, { must: ["complaint"], may: [], needs: [] });
    add(x.sourceCount, { must: [], may: [], needs: ["outlets"] }); add(x.newsOutletCount, { must: [], may: [], needs: ["outlets"] });
  }
  if (card.stories) {
    add(card.stories.length, { must: [], may: [], needs: ["stories"] });
    for (const s of card.stories) { add(s.sourceCount, { must: [], may: [], needs: ["outlets"] }); add(s.sources?.length, { must: [], may: [], needs: ["outlets"] }); }
  }
  if (card.actions) { add(card.actions.length, { must: [], may: [], needs: ["shown"] }); for (const g of card.actions) add(g.items?.length, { must: [], may: [], needs: ["steps"] }); }
  return out;
}

/** A window the card's period stands for: its length in hours, days, weeks or months. */
type Unit = "hour" | "day" | "week" | "month";
const PERIOD_WINDOWS: Record<Period, [number, Unit][]> = {
  daily: [[1, "day"], [24, "hour"], [36, "hour"]], weekly: [[7, "day"], [1, "week"], [168, "hour"]],
  monthly: [[30, "day"], [1, "month"], [4, "week"]], quarterly: [[90, "day"], [3, "month"], [12, "week"], [13, "week"]]
};
/** What a card's own labels and window are: its wards and zone (typed), its period. */
export interface CardContext { labels: Set<number>; windows: [number, Unit][] }
export function cardContext(card: AnswerCard): CardContext {
  const labels = new Set<number>();
  for (const x of [...(card.incidents ?? []), ...(card.incident ? [card.incident] : [])]) if (typeof x.ward === "number") labels.add(x.ward);
  for (const z of [card.scope?.zone, card.context?.activeFilters?.zone]) if (typeof z === "number") labels.add(z);
  const period = card.scope?.period ?? card.context?.activeFilters?.period ?? null;
  return { labels, windows: period ? PERIOD_WINDOWS[period] ?? [] : [] };
}

/** A figure read from a text: its value, how precisely it was written, what the words around it say it counts, and its sentence. */
export interface Read { raw: string; value: number; decimals: number; scale: number; said: Cue[]; sentence: string; base: boolean }

// ------------------------------------------------------------------ reading --

const INVISIBLE = /[­͏ᅟᅠ឴឵᠋-᠏​-‍⁠-⁤︀-️﻿]/g;
/** controls that reorder what is shown (a checked "41" shown as "14") */
const BIDI = /[؜‎‏‪-‮⁦-⁩]/;
/** a letter of a script the answer is never written in (Cyrillic З for 3, CJK 二 for 2) */
const FOREIGN = /(?![\p{Script=Latin}\p{Script=Tamil}])\p{L}/u;
/** As a reader sees it: compatibility forms folded (fullwidth, styled and superscript digits are digits), invisible characters gone,
 * every script's digits as 0-9, Tamil's numerals for 10, 100 and 1000 as digits. Lines stay. */
export function plain(s: string): string {
  return asciiDigits(String(s ?? "").normalize("NFKC").replace(INVISIBLE, "").replace(new RegExp(BIDI.source, "g"), ""))
    .replace(/௰/g, " 10 ").replace(/௱/g, " 100 ").replace(/௲/g, " 1000 ").replace(/[^\S\n]+/g, " ");
}
/** A numeral the reader cannot read as digits (a Roman numeral, a dingbat or circled form NFKC does not fold to digits), a foreign letter,
 * or a bidi control: the draft is refused. */
function unreadable(s: string): string | null {
  const raw = String(s ?? "");
  if (BIDI.test(raw)) return "a text-direction control";
  for (const ch of raw.match(/[\p{Nl}\p{No}]/gu) ?? []) if (!/[௰௱௲]/.test(ch) && !/^[0-9⁄/]+$/.test(ch.normalize("NFKC"))) return ch;
  const foreign = raw.normalize("NFKC").match(FOREIGN);
  return foreign ? foreign[0] : null;
}

const SMALL: Record<string, number> = { zero: 0, nil: 0, none: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11,
  twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fourty: 40,
  fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
const SCALE: Record<string, number> = { thousand: 1e3, lakh: 1e5, lakhs: 1e5, lac: 1e5, lacs: 1e5, crore: 1e7, crores: 1e7, million: 1e6, billion: 1e9 };
const EN_WORD = `${Object.keys(SMALL).join("|")}|hundred|${Object.keys(SCALE).join("|")}|dozen|couple`;
const EN_RUN = new RegExp(`\\b(?:an?\\s+)?(?:${EN_WORD})(?:(?:\\s+and\\s+|[\\s-]+)(?:${EN_WORD}))*\\b`, "gi");
/** "one" as a pronoun ("this one", "the worst one", "one of them"), not a count */
const ONE_PRONOUN_BEFORE = /^(the|this|that|which|each|every|any|no|another|other|same|serious|severe|important|urgent|big|recent|main|first|last|next|right|wrong|worst|best|most|least|\w+est)$/;
/** a number word in a name, not a count: a two-wheeler, a one-way street, a four-lane road */
const NAME_COMPOUND = /^-(?:wheelers?|way|lanes?|storey(?:ed)?|seaters?|tiers?)\b/i;
/** a count noun after "no": "no garbage cases" is 0 cases ("no action is needed" is no figure) */
const NO_COUNT = /\bno\s+(?:[\p{L}-]+\s+){0,2}?(?:cases?|incidents?|complaints?|grievances?|deaths?|people|persons?|injur\w*|stories|story|outlets?|accidents?|crimes?|fires?|floods?|items?|problems?|issues?)\b/giu;

/** English number words as one value: "twenty-one" 21, "one hundred and five" 105, "two lakh" 200000, "a dozen" 12; null when vague ("lakhs"). */
function enValue(run: string, next: string): number | null {
  let total = 0, cur = 0, seen = false, article = false;
  for (const t of run.toLowerCase().split(/[\s-]+/).filter((x) => x && x !== "and")) {
    if (t === "a" || t === "an") { article = true; continue; }
    if (t in SMALL) { cur += SMALL[t]; seen = true; }
    else if (t === "hundred") { if (!seen && !article) return null; cur = (cur || 1) * 100; seen = true; }
    else if (t in SCALE) { if (!seen && !article) return null; total += (cur || 1) * SCALE[t]; cur = 0; seen = true; }
    else if (t === "dozen") { cur = (cur || 1) * 12; seen = true; }
    else if (t === "couple") { if (!article && !/^\s+of\b/i.test(next)) return null; cur += 2; seen = true; }
  }
  return seen ? total + cur : null;
}

/** Tamil and Tanglish number words (Tamil inflects: "இரண்டே" only two, "இரண்டும்" both, so the stem is matched). "ஒரு" (a) is not one. */
const TA_WORDS: [RegExp, number][] = [
  [/^இருநூற/, 200], [/^(முந்நூற|முன்னூற)/, 300], [/^நானூற/, 400], [/^(ஐந்நூற|ஐநூற)/, 500], [/^அறுநூற/, 600], [/^எழுநூற/, 700], [/^எண்ணூற/, 800], [/^தொள்ளாயிர/, 900],
  [/^பதினொன்ற/, 11], [/^பன்னிரண்ட/, 12], [/^பதின்மூன்ற/, 13], [/^பதினான்க/, 14], [/^பதினைந்த/, 15], [/^பதினாற/, 16], [/^பதினேழ/, 17], [/^பதினெட்ட/, 18], [/^பத்தொன்பத/, 19],
  [/^இருபத/, 20], [/^முப்பத/, 30], [/^நாற்பத/, 40], [/^ஐம்பத/, 50], [/^அறுபத/, 60], [/^எழுபத/, 70], [/^எண்பத/, 80], [/^தொண்ணூற/, 90],
  [/^(ஒன்று|ஒன்றே|ஒன்றும்)$/, 1], [/^(இரு|இருவர்\S*)$/, 2], [/^இரண்ட/, 2], [/^(மூன்ற|மூவர்)/, 3], [/^(நான்க|நால்வர்)/, 4], [/^(ஐந்த|ஐவர்)/, 5], [/^(ஆறு|ஆறே|ஆறும்)$/, 6],
  [/^(ஏழு|ஏழே|ஏழும்)$/, 7], [/^(எட்டு|எட்டே|எட்டும்)$/, 8], [/^ஒன்பத/, 9], [/^(பத்து|பத்தே|பத்தும்)$/, 10], [/^(நூறு|நூறே)$/, 100], [/^ஆயிரம்/, 1000],
  [/^(எதுவும்|ஏதுமில்லை)$/, 0],
  [/^(padhinon|pathinon)/, 11], [/^(panirend|pannirend)/, 12], [/^(padhimoon|pathimoon)/, 13], [/^(padhinaal|pathinaal)/, 14], [/^(padhinanj|pathinanj|padhinainth)/, 15],
  [/^(padhinaar|pathinaar)/, 16], [/^(padhinezh|pathinezh)/, 17], [/^(padhinett|pathinett)/, 18], [/^(pathonb|patthonb|padhonb)/, 19],
  [/^(onnu|onnum)$/, 1], [/^(rendu|randu|rendum|randum|rende|iruvar\w*)$/, 2], [/^(moonu|munu|moonum|moone|moovar\w*)$/, 3], [/^(naalu|nalu|naalum|naalvar\w*)$/, 4],
  [/^(anju|anjum|ainthu|aindhu|anje)$/, 5], [/^(aaru|aarum)$/, 6], [/^(ezhu|ezhum|ezu)$/, 7], [/^(ettu|ettum)$/, 8], [/^(ombadhu|onbadhu|ombodhu|onbathu|ombathu)$/, 9],
  [/^(pathu|patthu|paththu|pathum)$/, 10], [/^(irubadhu|irupadhu|irubathu)$/, 20], [/^(muppadhu|muppathu)$/, 30], [/^(naarpadhu|narpadhu)$/, 40],
  [/^(aimbadhu|ambadhu)$/, 50], [/^(nooru|nuru)$/, 100], [/^(aayiram|ayiram)$/, 1000], [/^edhuvum$/, 0]
];
/** "the Cooum river" (கூவம் ஆறு) names a river, not six */
const RIVERS = /^(கூவம்|கொசஸ்தலை|பாலாறு|பாலார்|காவேரி|வைகை|cooum|kosasthalai)$/i;
/** "ஒரு ... தான்" / "oru ... dhaan" (only one): the article is a count when "only" follows it */
const ONLY_AFTER = /^(dhaan|thaan|mattum|maththum|mattume|தான்|மட்டும்|மட்டுமே)$|(தான்|மட்டும்|மட்டுமே)$/;

/** Number words written as digits, so the rest reads one form: "only two cases" -> "only 2 cases". */
function wordsAsDigits(t: string): string {
  let s = t.replace(/\bhalf\s+a\s+dozen\b/gi, " 6 ").replace(/\b(?:a\s+)?single\b(?!-)/gi, " 1 ").replace(/\b(?:a\s+)?pair\s+of\b/gi, " 2 of ").replace(/\bboth\b/gi, " 2 ")
    .replace(NO_COUNT, (m) => m.replace(/^no/i, " 0 "));
  s = s.replace(EN_RUN, (run: string, at: number, all: string) => {
    const next = all.slice(at + run.length);
    const v = enValue(run.trim(), next);
    if (v == null || NAME_COMPOUND.test(next)) return run;
    if (/^one$/i.test(run.trim())) {
      const before = (all.slice(0, at).match(/([\p{L}]+)[^\p{L}]*$/u)?.[1] ?? "").toLowerCase();
      if (ONE_PRONOUN_BEFORE.test(before) || /^\s+(of|another|by)\b/i.test(next)) return run;
    }
    return ` ${v} `;
  });
  // Tamil and Tanglish words, token by token: a tens word and a unit word side by side are one number ("நாற்பத்தி ஒன்று" 41)
  const toks = [...s.matchAll(/[\p{L}\p{M}]+/gu)].map((m) => ({ w: m[0], lw: m[0].toLowerCase(), at: m.index ?? 0 }));
  const spans: { from: number; to: number; v: number }[] = [];
  toks.forEach((tk, k) => {
    let v = TA_WORDS.find(([re]) => re.test(tk.lw))?.[1];
    if (v === 6 && k > 0 && RIVERS.test(toks[k - 1].lw)) v = undefined;
    if (v == null && /^(ஒரே)$/.test(tk.lw) && toks[k + 1]?.lw === "ஒரு") v = 1;
    if (v == null && /^(oru|ஒரு)$/.test(tk.lw) && toks.slice(k + 1, k + 4).some((x) => ONLY_AFTER.test(x.lw)) && !(k > 0 && toks[k - 1].lw === "ஒரே")) v = 1;
    if (v == null) return;
    const last = spans[spans.length - 1];
    const gap = last ? s.slice(last.to, tk.at) : "x";
    if (last && /^\s*$/.test(gap) && ((last.v % 10 === 0 && last.v >= 10 && last.v < 100 && v < 10) || (last.v % 100 === 0 && last.v >= 100 && v < 100)))
      Object.assign(last, { to: tk.at + tk.w.length, v: last.v + v });
    else spans.push({ from: tk.at, to: tk.at + tk.w.length, v });
  });
  for (const sp of spans.reverse()) s = `${s.slice(0, sp.from)} ${sp.v} ${s.slice(sp.to)}`;
  // Roman numerals of two or more capitals ("II", "XII"; not single letters, not DC or CM)
  return s.replace(/\b(?=[IVX]{2,}\b)(X{0,3})(IX|IV|V?I{0,3})\b/g, (m, x: string, r: string) =>
    ` ${x.length * 10 + (r === "IX" ? 9 : r === "IV" ? 4 : (r.startsWith("V") ? 5 : 0) + (r.match(/I/g)?.length ?? 0))} `);
}

const MON = "jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec|january|february|march|april|june|july|august|september|october|november|december";
const TA_MON = "ஜனவரி|பிப்ரவரி|மார்ச்|ஏப்ரல்|மே|ஜூன்|ஜூலை|ஆகஸ்ட்|செப்டம்பர்|அக்டோபர்|நவம்பர்|டிசம்பர்|ஜன\\.|பிப்\\.|மார்\\.|ஏப்\\.|ஆக\\.|செப்\\.|அக்\\.|நவ\\.|டிச\\.";
/** Not figures: ids, dates, times, ordinal street names, a year after "in" or "since". */
const NOT_FIGURES: RegExp[] = [
  /\b(?:INC|STY|THR|TLK|DOC|ACT|EVT)[-_][A-Za-z0-9_-]*\d[A-Za-z0-9_-]*/g, // INC-20260928-BF90AB
  /\b\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}(?::\d{2})?)?/g,
  new RegExp(`\\b\\d{1,2}(?:st|nd|rd|th)?\\s+(?:${MON})\\b\\.?(?:,?\\s+\\d{4})?`, "gi"), /\b\d{1,2}(?:st|nd|rd|th)?\s+May\b(?:,?\s+\d{4})?/g,
  new RegExp(`\\b(?:${MON})\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?\\b(?:,?\\s+\\d{4})?`, "gi"), /\bMay\s+\d{1,2}(?:st|nd|rd|th)?\b(?:,?\s+\d{4})?/g,
  new RegExp(`\\d{1,2}\\s*(?:${TA_MON})(?![\\p{L}\\p{M}])`, "gu"),
  /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g,
  /\b\d{1,2}:\d{2}(?::\d{2})?\s*(?:am|pm|a\.m\.|p\.m\.)?/gi,
  /\b\d{1,2}(?:\.\d{2})?\s*(?:am|pm|a\.m\.|p\.m\.)(?![\p{L}])/giu,
  /\b(?:in|since|during|year)\s+20[0-3]\d\b/gi,
  /\b\d{1,3}(?:st|nd|rd|th)\s+(?:street|st\.?|cross|main|road|rd\.?|lane|avenue|block|sector|floor|phase|stage)\b/gi
];
const UNIT_OF = (u: string): Unit | null => (/^(hours?|hrs?|மணி|mani)/i.test(u) ? "hour" : /^(days?|நாட்|நாள்|naal|naatkal)/i.test(u) ? "day"
  : /^(weeks?|வார|vaaram)/i.test(u) ? "week" : /^(months?|மாத|maasam)/i.test(u) ? "month" : null);
const WINDOW = /(\b(?:last|past|previous|preceding|this|kadandha|kadaisi)\b|கடந்த|கடைசி|முந்தைய)\s*(\d{1,3})\s*[- ]?(hours?|hrs?|days?|weeks?|months?|மணி\S*|நாட்\S*|நாள்\S*|வார\S*|மாத\S*|naal\S*|naatkal|vaaram|maasam|mani)/gi;
const WINDOW_ADJ = /\b(\d{1,3})-(hour|day|week|month)\s+(window|period|span)\b/gi;
const FIGURE = /([-−](?=\d))?(\d{1,3}(?:,\d{2,3})+|\d+)(?:\.(\d+))?(?:\s*(lakhs?|lacs?|crores?|k|million|thousand|hundred)\b)?/gi;
const AFTER_STOP = /[.;:!?\n,()·|–—]/;
const BEFORE_STOP = /[.;:!?\n,()·|–—]/g;
const SENTENCE_STOP = /[.;!?\n]/;

/** others' writing quoted word for word: the inner text is in a source at word boundaries (not "5 bins ... for 1" out of "25 ... 12 days") */
const inSource = (inner: string, sources: string[]) => sources.some((q) => {
  for (let i = q.indexOf(inner); i >= 0; i = q.indexOf(inner, i + 1))
    if (!/[\p{L}\p{N}]/u.test(q[i - 1] ?? " ") && !/[\p{L}\p{N}]/u.test(q[i + inner.length] ?? " ")) return true;
  return false;
});

export interface ReadOpts {
  /** others' writing: a word-for-word quote of it in quotation marks is that writing, attributed, and its numbers are not the answer's
   * figures (null: no quote counts, as in a headline or a spoken line) */
  quotable?: string[] | null;
  /** the card's own wards and zone, and its window */
  card?: CardContext;
  /** a markdown body: a numbered list's own numbers (1, 2, 3...) are not figures */
  list?: boolean;
}

/** Every figure in a text, read as a reader reads it; a numeral or letter it cannot read comes back as a figure that never fits. */
export function readFigures(text: string, opts: ReadOpts = {}): Read[] {
  const bad = unreadable(text);
  if (bad) return [{ raw: bad, value: Number.NaN, decimals: 0, scale: 1, said: [], sentence: "", base: false }];
  let t = ` ${plain(text)} `;
  const q = (opts.quotable ?? []).map((x) => plain(x).trim()).filter((x) => x.length >= 6);
  if (q.length) {
    // (an apostrophe inside a word, "The Hindu's", opens or closes no quote; inside double quotes it is part of the quote)
    const keep = (m: string, inner: string) => (inSource(inner.trim(), q) ? " " : m);
    t = t.replace(/(?<![\p{L}\p{N}])[“"«„「]([^“”"«»„「」]{6,240})[”"»“」](?![\p{L}\p{N}])/gu, (m, inner: string) => keep(m, inner))
      .replace(/(?<![\p{L}\p{N}])[‘']([^‘’'"“”]{6,240})[’'](?![\p{L}\p{N}])/gu, (m, inner: string) => keep(m, inner));
  }
  if (opts.list) {
    // a numbered list's own numbers, only when they run 1, 2, 3... in order ("2. That is all" alone is a figure)
    const marks = [...t.matchAll(/^(\s*)(\d+)[.)]\s+/gm)].map((m) => Number(m[2]));
    if (marks.length && marks.every((n, k) => n === k + 1)) t = t.replace(/^(\s*)\d+[.)]\s+/gm, "$1- ");
  }
  t = wordsAsDigits(t);
  for (const re of NOT_FIGURES) t = t.replace(re, " ");
  // a ward or zone label is the card's own ward or zone; any other number after "ward" is read (a plural lists several)
  const labels = opts.card?.labels ?? new Set<number>();
  t = t.replace(/\b(wards|zones)\s+(\d{1,3}(?:\s*(?:and|&|to|-|,)\s*\d{1,3})+)/giu, (m, _w, nums: string) => ((nums.match(/\d{1,3}/g) ?? []).every((n) => labels.has(Number(n))) ? " " : m))
    .replace(/(\b(?:ward|zone)|வார்டு|மண்டலம்|மண்டல)\s*(?:no\.?\s*)?(\d{1,3})\b/giu, (m, _w, n: string) => (labels.has(Number(n)) ? " " : m));
  // the window's own length, when it is the card's period ("last 7 days" on a 7-day card; "the past 2 days" is a claim)
  const windows = opts.card?.windows ?? [];
  const isWindow = (n: string, u: string) => { const unit = UNIT_OF(u); return windows.some(([wn, wu]) => wn === Number(n) && wu === unit); };
  t = t.replace(WINDOW, (m, word: string, n: string, u: string) => (isWindow(n, u) ? ` ${word} ` : m)).replace(WINDOW_ADJ, (m, n: string, u: string, w: string) => (isWindow(n, u) ? ` ${w} ` : m));
  const found = [...t.matchAll(FIGURE)];
  return found.map((m, k) => {
    const at = m.index ?? 0, end = at + m[0].length;
    const prevEnd = k ? (found[k - 1].index ?? 0) + found[k - 1][0].length : 0;
    const beforeAll = t.slice(prevEnd, at);
    // the words right before it: at most two, back to the last break (with no break since the figure before, these are that figure's)
    const lastBreak = Math.max(-1, ...[...beforeAll.matchAll(BEFORE_STOP)].map((x) => x.index ?? 0));
    const before = k && lastBreak < 0 ? "" : beforeAll.slice(lastBreak + 1).trim().split(/\s+/).slice(-2).join(" ");
    const afterAll = t.slice(end, found[k + 1]?.index ?? t.length);
    const stop = afterAll.search(AFTER_STOP);
    let after = (stop < 0 ? afterAll : afterAll.slice(0, stop)).slice(0, 80);
    // a base ("23% of the 51 cases reported are resolved", "12 of 51"): what the sentence says is the part's, not the base's
    const base = k > 0 && /^[\s*_]*(?:%|per ?cent)?[\s*_]*(?:of|of the|of all|out of)\s*$/i.test(beforeAll);
    if (base) after = after.split(/\b(?:are|is|were|was|have|has|had|remain\w*|stay\w*|still)\b/i)[0];
    const s0 = Math.max(-1, ...[...t.slice(0, at).matchAll(new RegExp(SENTENCE_STOP, "g"))].map((x) => x.index ?? 0));
    const s1 = t.slice(end).search(SENTENCE_STOP);
    const sentence = t.slice(s0 + 1, s1 < 0 ? t.length : end + s1).toLowerCase();
    const a = negationsTurned(` ${after.toLowerCase()} `), b = negationsTurned(` ${before.toLowerCase()} `);
    const said = CUES.filter(([, re]) => re.test(a) || re.test(b)).map(([c]) => c);
    if (PERCENT.test(after.toLowerCase())) said.push("percent");
    const sign = m[1] && /^$|[\s(]$/.test(t.slice(Math.max(0, at - 1), at)) ? -1 : 1;
    const digits = m[2].replace(/,/g, "");
    const unit = (m[4] ?? "").toLowerCase();
    const scale = unit.startsWith("lakh") || unit.startsWith("lac") ? 1e5 : unit.startsWith("crore") ? 1e7 : unit === "k" || unit === "thousand" ? 1e3
      : unit === "million" ? 1e6 : unit === "hundred" ? 100 : 1;
    const mantissa = Number(`${digits}${m[3] ? `.${m[3]}` : ""}`);
    // (a zero with a scale word is zero, not "anything under 500")
    return { raw: m[0].trim(), value: sign * mantissa * scale, decimals: (m[3] ?? "").length, scale: mantissa === 0 ? 0 : scale, said, sentence, base };
  });
}

/** The question's own numbers ("top 5 complaints", "above 85%"): the Collector's words, which the answer may repeat as what they counted. */
export const askedFigures = (question: string): Typed[] =>
  readFigures(question).filter((r) => Number.isFinite(r.value)).map((r) => ({ value: r.value, must: [], may: r.said.filter(isMeasure), needs: [] }));

/**
 * Whether a figure read from the draft is one of the card's typed figures: the same value at the precision written, counting what the
 * words say it counts. A measure the words name must be one the typed figure counts or holds; a typed figure that counts a measure must be
 * said with it; a count of the answer's own items, last period's figure or a percentage must be named as such; a cell of a table of
 * several rows must be said of its row.
 */
export function fits(r: Read, typed: Typed[]): boolean {
  if (!Number.isFinite(r.value)) return false;
  const tol = r.scale === 0 ? 1e-9 : 0.5 * 10 ** -r.decimals * r.scale + 1e-9;
  const measures = r.said.filter(isMeasure);
  return typed.some((t) => Math.abs(t.value - r.value) <= tol
    && measures.every((c) => t.must.includes(c) || t.may.includes(c))
    && (!t.must.length || t.must.some((c) => r.said.includes(c)))
    && t.needs.every((c) => r.said.includes(c))
    && (!t.row || t.row.some((w) => r.sentence.includes(w))));
}
