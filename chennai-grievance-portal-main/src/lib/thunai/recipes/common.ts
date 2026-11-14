/**
 * What the analysis recipes (changed, explain, situation) share: the context a screen builder gets (the same shape as screens.ts's own
 * Ctx, so screens.ts can register these recipes as they are), names in both languages, the window in words, time in words with no figure,
 * the guard against causal words, and a runner that turns a recipe into a Stage document the way buildScreen does (for tests, and for a
 * caller that builds one directly).
 */
import type { ToolResult } from "@/lib/assistant/types";
import { CAT_LABEL_TA, ageWords, plainWho } from "../narrate";
import { DEPT_TA, ZONE_TA_NAME } from "../lexicon";
import { detectLang } from "../normalise";
import { actionForOne, fit, type Hands, type Slots } from "../screens";
import type { BlockT, Bilingual, NextStepT, ScopeT, StageDocT } from "../stage";
import type { PeriodKey, World } from "../types";
import type { Dim } from "./adtributor";

export type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
export type Lang = "en" | "ta";

/** The builder's context: structurally the one screens.ts gives every recipe (its Ctx), so a recipe here registers as it is. */
export interface RecipeCtx { w: World; h: Hands; s: ScopeT; slots: Slots; heard: string; runs: string[]; sources: Set<string>; notes: string[]; asOf: string | null }
/** What a recipe returns: screens.ts's Part. */
export interface RecipePart { title: string; takeaway: Bilingual | null; say: Bilingual; blocks: BlockT[]; next?: NextStepT[] }

export const bi = (en: string, ta: string): Bilingual => ({ en, ta });
export const clip = (s: unknown, n: number) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, n);
export const num = (v: unknown): number | null => (v == null || v === "" || typeof v === "boolean" || !Number.isFinite(Number(v)) ? null : Number(v));
/** The language the screen's own words are in: Tamil for Tamil script and for Tanglish (JARVIS_VOICE rule 10). */
export const langOf = (heard: string): Lang => (detectLang(heard) === "ta" ? "ta" : "en");
export const pick = (lang: Lang, b: Bilingual) => (lang === "ta" ? b.ta : b.en);

/** One read tool through the hands, recorded as screens.ts records it. */
export async function call(c: RecipeCtx, name: string, args: Record<string, unknown>): Promise<ToolResult> {
  c.runs.push(name);
  const r = await c.h.tool(name, args);
  c.sources.add(name);
  c.asOf ??= r.asOf ?? null;
  return r;
}
export const scopeArg = (s: ScopeT, extra: Partial<ScopeT> = {}) => {
  const x = { ...s, ...extra };
  return { period: x.period, zone: x.zone, dept: x.dept, cat: x.cat, taluk: x.taluk };
};

// ------------------------------------------------------------------ names --

export const zoneName = (w: World, n: number | null | undefined): Bilingual | null => {
  if (!n) return null;
  const en = w.zones.find((z) => z.n === n)?.name ?? `Zone ${n}`;
  return bi(en, w.zones.find((z) => z.n === n)?.ta ?? ZONE_TA_NAME[n] ?? en);
};
export const deptName = (w: World, code: string | null | undefined, name?: string | null): Bilingual | null => {
  if (!code && !name) return null;
  const en = (code ? w.depts.find((d) => d.code === code)?.name : null) ?? name ?? String(code);
  return bi(en.replace(/\s*\([^)]*\)\s*/g, " ").trim(), (code ? DEPT_TA[code] : null) ?? en);
};
export const catName = (w: World, code: string | null | undefined, label?: string | null): Bilingual | null => {
  if (!code && !label) return null;
  const en = (code ? w.cats.find((c) => c.code === code)?.label : null) ?? label ?? String(code);
  return bi(en, (code ? CAT_LABEL_TA[code] : null) ?? en);
};
/** A segment's name as the screen shows it. */
export function segName(w: World, dim: Dim, key: string, label?: string | null): Bilingual {
  if (dim === "zone") return zoneName(w, Number(key)) ?? bi(key, key);
  if (dim === "dept") return deptName(w, key, label) ?? bi(key, key);
  return catName(w, key, label) ?? bi(key, key);
}
/** A segment as speech says it: a department as people say it ("the corporation's drains team"), a kind in lower case. */
export function segSpoken(w: World, dim: Dim, key: string, label?: string | null): Bilingual {
  const n = segName(w, dim, key, label);
  if (dim === "dept") { const who = plainWho(key, n.en); return who ? bi(who.en, n.ta) : n; }
  if (dim === "cat") return bi(n.en.toLowerCase().replace(/&/g, "and"), n.ta);
  return n;
}
/**
 * "In <place>" in spoken Tamil, joined as the word ends: ராயபுரம் -> ராயபுரத்துல, அடையாறு -> அடையாறுல, பெருங்குடி -> பெருங்குடியில,
 * அம்பத்தூர் -> அம்பத்தூர்ல. A name with no Tamil in it takes the ending after a hyphen.
 */
export function inTa(word: string): string {
  const w = word.trim();
  if (/[A-Za-z0-9)]$/.test(w)) return `${w}-ல`;
  if (/ம்$/.test(w)) return `${w.slice(0, -2)}த்துல`;
  if (/[ிீைெே]$/.test(w)) return `${w}யில`;
  return `${w}ல`;
}
/** The segment with the Tamil case ending a sentence needs ("அடையாறுல", "காவல்துறை கிட்ட", "குப்பை புகார்கள்ல"). */
export function segIn(dim: Dim, ta: string): string {
  return dim === "zone" ? inTa(ta) : dim === "dept" ? `${ta} கிட்ட` : `${ta} புகார்கள்ல`;
}

// ------------------------------------------------------------------ the window in words --

const HOURS: Record<PeriodKey, string> = { daily: "24", weekly: "7", monthly: "30", quarterly: "90" };
/** "the last 24 hours" and "the 24 hours before", in both languages: the screen's tiles carry the same words, so their figures are on it. */
export function windowWords(p: PeriodKey): { now: Bilingual; before: Bilingual; inNow: Bilingual; label: Bilingual } {
  const n = HOURS[p];
  const unit = p === "daily" ? bi("hours", "மணி நேர") : bi("days", "நாள்");
  const now = bi(`the last ${n} ${unit.en}`, `கடந்த ${n} ${unit.ta}த்துல`.replace("நாள்த்துல", "நாள்ல"));
  return {
    now, inNow: bi(`in the last ${n} ${unit.en}`, now.ta),
    before: bi(`the ${n} ${unit.en} before`, `அதுக்கு முன்னாடி ${n} ${unit.ta}த்துல`.replace("நாள்த்துல", "நாள்ல")),
    label: bi(`last ${n} ${unit.en} against the ${n} before`, `கடந்த ${n} ${p === "daily" ? "மணி நேரம்" : "நாள்"}, அதற்கு முந்தைய ${n}-உடன்`)
  };
}

// ------------------------------------------------------------------ time in words --

/**
 * How long, in words with no figure in them: narrate.ts ageWords, with the phrases the number gate reads as figures swapped for
 * ones it does not ("three weeks" is a 3, "இரண்டு நாட்களாக" a 2: numbergate.ts figuresIn).
 */
const SAFE_AGE: Record<string, Bilingual> = {
  "a couple of hours": bi("a couple of hours", "ஓரிரு மணி நேரமாக"),
  "a couple of days": bi("a couple of days", "ஓரிரு நாட்களாக"),
  "a couple of weeks": bi("a couple of weeks", "ஓரிரு வாரங்களாக"),
  "well over three weeks": bi("several weeks", "பல வாரங்களாக")
};
export function timeWords(hours: number | null): Bilingual | null {
  const a = ageWords(hours);
  return a ? SAFE_AGE[a.en] ?? a : null;
}

// ------------------------------------------------------------------ no causal words --

/** A link said as a cause. Jarvis says "linked with" and "after", never "because", "due to" or "caused by" (the brief, Pillar 3). */
const CAUSAL_EN = /\b(caus(?:e|ed|es|ing)|because|due to|owing to|on account of|as a result|result(?:ed|s|ing)? (?:in|from)|led to|leads? to|leading to|driven by|drove|triggered|thanks to|attributable|blamed?)\b/i;
const CAUSAL_TA = /காரணமாக|காரணம்|ஏனெனில்|ஏனென்றால்|விளைவாக|ஆல் ஏற்பட்ட|தூண்டிய/;
export function causalIn(text: string): string | null {
  return CAUSAL_EN.exec(text)?.[0] ?? CAUSAL_TA.exec(text)?.[0] ?? null;
}

// ------------------------------------------------------------------ what I'd do --

/** Kinds of incident that rain is linked with: for these, rain and reservoirs are worth saying. */
export const RAIN_KINDS = new Set(["FLOOD_WATERLOGGING", "DRAINAGE_SEWAGE", "FLOOD_RELIEF", "WATERBODY_INFRA", "FLOOD_RISK_SIGNAL", "TREES_PARKS", "ROAD_DAMAGE", "VECTOR_DISEASE"]);
export const WATER_KINDS = new Set(["FLOOD_WATERLOGGING", "FLOOD_RELIEF", "WATERBODY_INFRA", "FLOOD_RISK_SIGNAL"]);

const STEP_BY_KIND: Record<string, Bilingual> = {
  FLOOD_WATERLOGGING: bi("ask the corporation's drains team for pumps and a desilting check on the worst streets", "மாநகராட்சியின் மழைநீர் வடிகால் பிரிவிடம் பம்பும் தூர்வாரலும் கேட்கலாம்"),
  DRAINAGE_SEWAGE: bi("ask the corporation's drains team for a desilting check on the worst streets", "மாநகராட்சியின் மழைநீர் வடிகால் பிரிவிடம் தூர்வாரல் கேட்கலாம்"),
  SOLID_WASTE: bi("ask the corporation's conservancy team for a clearance drive", "மாநகராட்சியின் துப்புரவுப் பிரிவிடம் சுத்தம் செய்யக் கேட்கலாம்"),
  VECTOR_DISEASE: bi("ask the health department for fogging and source reduction there", "சுகாதாரத் துறையிடம் புகை மருந்தும் கொசு ஒழிப்பும் கேட்கலாம்"),
  WATER_SUPPLY: bi("ask Metrowater for a status by this evening", "குடிநீர் வாரியத்திடம் இன்று மாலைக்குள் நிலவரம் கேட்கலாம்"),
  ROAD_DAMAGE: bi("ask the roads department for a repair date", "சாலைத் துறையிடம் சரிசெய்யும் தேதி கேட்கலாம்"),
  STREETLIGHT_ELECTRICAL: bi("ask the corporation's electrical team for a status today", "மாநகராட்சியின் மின் பிரிவிடம் இன்றே நிலவரம் கேட்கலாம்")
};
const ASK_HOLDER = bi("ask the department holding most of them for a status today", "அதிகம் வைத்திருக்கும் துறையிடம் இன்றே நிலவரம் கேட்கலாம்");

/** What I'd do about a kind of incident: one case's own holder when it is known (screens.ts actionForOne), else the kind's usual ask. */
export function stepFor(cat: string | null, dept: string | null = null, deptNameText: string | null = null): Bilingual {
  const one = dept ? actionForOne(cat, dept, deptNameText) : null;
  if (one) return one;
  if (cat && Object.hasOwn(STEP_BY_KIND, cat)) return STEP_BY_KIND[cat];
  const who = dept ? plainWho(dept, deptNameText) : null;
  return who ? bi(`ask ${who.en} for a status today`, `${who.ta}கிட்ட இன்றே நிலவரம் கேட்கலாம்`) : ASK_HOLDER;
}

// ------------------------------------------------------------------ running a recipe --

/** The scope a recipe covers, as buildScreen derives it from the slots and the console's scope. */
export function scopeFor(slots: Slots, base: ScopeT): ScopeT {
  const s: ScopeT = {
    period: slots.period ?? base.period, zone: slots.zones.length === 1 ? slots.zones[0] : slots.zones.length ? null : base.zone,
    dept: slots.dept ?? (slots.depts.length ? null : base.dept), cat: slots.cat ?? base.cat, taluk: slots.taluk ?? base.taluk, sev: slots.sev ?? null
  };
  const named = slots.zones.length > 0 || !!slots.dept || !!slots.cat || !!slots.taluk || slots.depts.length > 0;
  if (slots.fresh || named) { s.zone = slots.zones[0] ?? null; s.dept = slots.dept; s.cat = slots.cat; s.taluk = slots.taluk; }
  return s;
}

export function ctxFor(slots: Slots, base: ScopeT, w: World, h: Hands, heard: string): RecipeCtx {
  return { w, h, s: scopeFor(slots, base), slots, heard, runs: [], sources: new Set(), notes: [], asOf: null };
}

/**
 * A recipe's screen as buildScreen makes it: a tool failure becomes a Note that says so, the texts are cut to the catalog's limits.
 * `recipe` is the name it is registered under; until the coordinator adds it to RECIPES the document is typed loosely.
 */
export async function runRecipe(recipe: string, fn: (c: RecipeCtx) => Promise<RecipePart>, slots: Slots, base: ScopeT, w: World, h: Hands, heard: string,
  id = `st-${Date.now().toString(36)}`): Promise<{ doc: StageDocT; runs: string[] }> {
  const c = ctxFor(slots, base, w, h, heard);
  let part: RecipePart;
  try {
    part = await fn(c);
  } catch (e) {
    part = { title: heard, takeaway: null, say: bi("I could not get that data just now.", "அந்தத் தரவை இப்போது பெற முடியவில்லை."),
      blocks: [{ kind: "Note", id: "err", text: `The data could not be read: ${clip((e as Error).message, 200)}` }] };
  }
  if (!part.blocks.length) part.blocks.push({ kind: "Note", id: "empty", text: "Nothing in the data matches this, for this scope." });
  const fitBi = (b: Bilingual): Bilingual => ({ en: fit(b.en, 600), ta: fit(b.ta, 900) });
  const doc = { v: 1, id, recipe: recipe as StageDocT["recipe"], title: clip(part.title, 200), takeaway: part.takeaway && fitBi(part.takeaway), say: fitBi(part.say),
    blocks: part.blocks.slice(0, 6), scope: c.s, slots: slots as unknown as Record<string, unknown>, sources: [...c.sources].slice(0, 10).map((x) => clip(x, 80)),
    asOf: c.asOf, notes: c.notes.slice(0, 4).map((x) => clip(x, 300)), next: part.next ?? [] } as StageDocT;
  return { doc, runs: c.runs };
}
