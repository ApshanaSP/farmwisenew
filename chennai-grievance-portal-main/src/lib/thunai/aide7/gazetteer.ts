/**
 * v7: the names Jarvis may say, from the console's own reference data (zones, departments, taluks, places, reservoirs, the public bodies)
 * and the news outlets the owner allows, each with its English and Tamil forms. The checker (ground.ts) reads names off a sentence with
 * this list: a zone or a department said in a sentence must be one the facts it cites hold. Pure.
 */
import { isEnglishWord } from "../english";
import { DEPT_ALIASES, DEPT_TA, ZONES } from "../lexicon";
import type { World } from "../types";
import { DEFAULT_DOMAINS } from "../web/domains";

export type NameKind = "zone" | "dept" | "place" | "taluk" | "reservoir" | "outlet" | "body";
export interface NameEntry { key: string; kind: NameKind; en: string[]; ta: string[] }
export interface Gazetteer { entries: NameEntry[] }
export interface NameHit { key: string; kind: NameKind; at: number; form: string }

/** Tamil names of the reservoirs (as recipes/situation.ts says them) */
const LAKE_TA: [string, string][] = [["chembarambakkam", "செம்பரம்பாக்கம்"], ["puzhal", "புழல்"], ["red hills", "புழல்"], ["poondi", "பூண்டி"], ["cholavaram", "சோழவரம்"], ["veeranam", "வீராணம்"], ["kannankottai", "கண்ணன்கோட்டை"]];

/** single English words that name a body here all the same */
const PROPER = new Set(["police", "metrowater"]);
const clean = (s: string) => s.normalize("NFC").replace(/\s+/g, " ").trim();
const uniq = (xs: string[]) => [...new Set(xs.map(clean).filter(Boolean))];

/** The district's names, built once per world. Short or plain-English forms ("Central", "Red") are left out: they would match ordinary words. */
export function gazetteer(w: Pick<World, "zones" | "depts" | "taluks" | "places" | "reservoirs" | "bodies">, outlets = DEFAULT_DOMAINS.outlets): Gazetteer {
  const entries: NameEntry[] = [];
  for (const z of w.zones) {
    const lex = ZONES[z.n];
    entries.push({ key: `zone:${z.n}`, kind: "zone", en: uniq([z.name, ...(lex?.en ?? [])]).filter((x) => x.length >= 4 && !/^zone\b/i.test(x)), ta: uniq([...(z.ta ? [z.ta] : []), ...(lex?.ta ?? [])]) });
  }
  for (const d of w.depts) {
    const all = DEPT_ALIASES[d.code] ?? [];
    // an alias that is one plain English word ("water", "revenue", "parks") would match ordinary speech: only names, codes and phrases count
    const en = all.filter((x) => !/[஀-௿]/u.test(x) && x.length >= 3 && (/\s/.test(x) || !isEnglishWord(x.toLowerCase()) || PROPER.has(x.toLowerCase())));
    const ta = all.filter((x) => /[஀-௿]/u.test(x));
    entries.push({ key: `dept:${d.code}`, kind: "dept", en: uniq([d.name, ...en]).filter((x) => x.length >= 3), ta: uniq([...(DEPT_TA[d.code] ? [DEPT_TA[d.code]] : []), ...ta]) });
  }
  for (const b of w.bodies ?? []) if (!w.depts.some((d) => d.code === b.code)) entries.push({ key: `body:${b.code}`, kind: "body", en: uniq([b.name]).filter((x) => x.length >= 4), ta: [] });
  for (const t of w.taluks) entries.push({ key: `taluk:${t.code}`, kind: "taluk", en: uniq([t.name]).filter((x) => x.length >= 4), ta: uniq(t.ta ? [t.ta] : []) });
  // (a one-word place that is also an English word, "Mint", is left to the capitalised-name check: in lower case it is ordinary speech)
  for (const p of w.places) entries.push({ key: `place:${p.name.toLowerCase()}`, kind: "place", en: uniq([p.name, ...p.aliases]).filter((x) => x.length >= 4 && (/\s/.test(x) || !isEnglishWord(x.toLowerCase()))), ta: [] });
  for (const r of w.reservoirs) {
    const ta = LAKE_TA.find(([k]) => r.name.toLowerCase().includes(k))?.[1];
    entries.push({ key: `reservoir:${r.id}`, kind: "reservoir", en: uniq([r.name, r.name.replace(/\s*\(.*\)\s*/g, "")]).filter((x) => x.length >= 4), ta: ta ? [ta] : [] });
  }
  for (const o of outlets) entries.push({ key: `outlet:${o.id}`, kind: "outlet", en: uniq([o.name, o.name.replace(/^The /, "")]).filter((x) => x.length >= 3), ta: uniq([o.nameTa]) });
  return { entries: entries.filter((e) => e.en.length || e.ta.length) };
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/**
 * A Tamil name's spoken forms: the name with the case endings Tamil puts on a place (in, from, to, of, by; and the spoken -la, -ku), built from how
 * the name ends (அடையாறு -> அடையாறில், அடையாற்றில், அடையாறுக்கு; மாதவரம் -> மாதவரத்தில்; தேனாம்பேட்டை -> தேனாம்பேட்டையில்; ஆலந்தூர் ->
 * ஆலந்தூரில்). A word is a name only when it is one of these whole (an emphatic or "and" particle may follow): a bare stem would take ordinary
 * words that start the same way (அடையாளம், "identity", is not Adyar: the dev check, 17 Nov).
 */
const ENDS = ["இல்", "இலிருந்து", "இலும்", "இல", "ஐ", "இன்", "ஆல்", "ஓடு", "உடன்", "இடம்", "உக்கு", "க்கு", "ல", "ல்", "லே", "உக்குள்", "உல", "உலே"];
/** a vowel's sign after a consonant (இ -> ி) */
const SIGN: Record<string, string> = { "இ": "ி", "ஈ": "ீ", "உ": "ு", "ஊ": "ூ", "எ": "ெ", "ஏ": "ே", "ஐ": "ை", "ஒ": "ொ", "ஓ": "ோ", "ஆ": "ா" };
/** an ending joined to a stem that ends in a bare consonant (ர், ல், ண், ட், ன், ம் as த்த): its first vowel as a sign */
const joinSign = (stem: string, end: string) => (/^[இஈஉஊஎஏஐஒஓஆ]/u.test(end) ? stem + SIGN[end[0]] + end.slice(1) : stem + end);
function taForms(form: string): string[] {
  const out = new Set<string>([form]);
  const words = form.split(" ");
  const last = words.pop() as string, head = words.length ? `${words.join(" ")} ` : "";
  const add = (w: string) => out.add(head + w);
  if (/்$/u.test(last)) {
    // a consonant ending: ஆலந்தூர் -> ஆலந்தூரில்; ம் -> த்த (மாதவரம் -> மாதவரத்தில்)
    const bare = last.slice(0, -1);
    for (const e of ENDS) { add(joinSign(bare, e)); if (/ம்$/u.test(last)) add(joinSign(`${last.slice(0, -2)}த்த்`.slice(0, -1), e)); }
  } else if (/ு$/u.test(last)) {
    // -u: அடையாறு -> அடையாறில், and the doubled form அடையாற்றில்
    const bare = last.slice(0, -1);
    for (const e of ENDS) { add(joinSign(`${bare}்`.slice(0, -1), e)); add(joinSign(`${bare}்${bare.slice(-1)}`, e)); add(last + (/^[இஈஉஊஎஏஐஒஓஆ]/u.test(e) ? "" : e)); }
    add(`${last}க்கு`);
  } else {
    // a vowel ending: தேனாம்பேட்டை -> தேனாம்பேட்டையில், பெருங்குடி -> பெருங்குடியில்
    for (const e of ENDS) add(/^[இஈஉஊஎஏஐஒஓஆ]/u.test(e) ? `${last}ய${SIGN[e[0]] ?? ""}${e.slice(1)}` : last + e);
  }
  return [...out].filter((x) => x.length >= 3);
}

const cache = new WeakMap<Gazetteer, { re: RegExp; forms: Map<string, NameEntry>; ta: { re: RegExp; e: NameEntry; form: string }[] }>();
function index(g: Gazetteer) {
  let c = cache.get(g);
  if (c) return c;
  const forms = new Map<string, NameEntry>();
  for (const e of g.entries) for (const f of e.en) { const k = f.toLowerCase(); const prev = forms.get(k); if (!prev || (prev.kind === "place" && e.kind !== "place")) forms.set(k, e); }
  // the longest forms first, so "Anna Nagar" is one hit, not "Anna"
  const all = [...forms.keys()].sort((a, b) => b.length - a.length).map(esc);
  // (String.raw: in a plain template "\p{L}" is the letters "p{L}", and a name was found inside other words, "Tadyar": the regex guard, 18 Nov)
  const re = new RegExp(String.raw`(?<![\p{L}\p{M}\p{N}])(?:${all.join("|") || "(?!)"})(?![\p{L}\p{M}\p{N}])`, "giu");
  const ta = g.entries.flatMap((e) => e.ta.map((form) => ({ form, e, re: new RegExp(String.raw`(?<![\p{L}\p{M}])(?:${taForms(form).sort((a, b) => b.length - a.length).map(esc).join("|")})(?:உம்|ும்|ே|ா|யும்|வும்)?(?![\p{L}\p{M}])`, "gu") })))
    .sort((a, b) => b.form.length - a.form.length);
  c = { re, forms, ta };
  cache.set(g, c);
  return c;
}

/** Every district name in a text, in order, longest match first; English case-insensitive, Tamil by its whole inflected forms. */
export function namesIn(text: string, g: Gazetteer): NameHit[] {
  const { re, forms, ta } = index(g);
  const t = text.normalize("NFC");
  const out: NameHit[] = [];
  const taken: [number, number][] = [];
  for (const m of t.matchAll(re)) {
    const e = forms.get(m[0].toLowerCase());
    if (!e) continue;
    out.push({ key: e.key, kind: e.kind, at: m.index ?? 0, form: m[0] });
    taken.push([m.index ?? 0, (m.index ?? 0) + m[0].length]);
  }
  for (const x of ta) {
    for (const m of t.matchAll(x.re)) {
      const i = m.index ?? 0;
      if (taken.some(([a, b]) => i < b && i + m[0].length > a)) continue;
      out.push({ key: x.e.key, kind: x.e.kind, at: i, form: x.form });
      taken.push([i, i + m[0].length]);
    }
  }
  return out.sort((a, b) => a.at - b.at);
}

const aliasCache = new WeakMap<Gazetteer, Map<string, string[]>>();
/**
 * The entries that share a form with this one, itself first: a name two reference lists hold is one name (Thiruvottiyur is a zone and a taluk,
 * Alandur too), so a fact naming the taluk covers a sentence naming the zone (the live pilot, 17 Nov).
 */
export function aliasesOf(key: string, g: Gazetteer): string[] {
  let m = aliasCache.get(g);
  if (!m) {
    const byForm = new Map<string, Set<string>>();
    for (const e of g.entries) for (const f of [...e.en.map((x) => x.toLowerCase()), ...e.ta]) { const s = byForm.get(f) ?? new Set<string>(); s.add(e.key); byForm.set(f, s); }
    m = new Map();
    for (const e of g.entries) {
      const keys = new Set<string>([e.key]);
      for (const f of [...e.en.map((x) => x.toLowerCase()), ...e.ta]) for (const k of byForm.get(f) ?? []) keys.add(k);
      m.set(e.key, [...keys]);
    }
    aliasCache.set(g, m);
  }
  return m.get(key) ?? [key];
}

/** The Tamil forms of the names in a text (for a fact's Tamil aliases). */
export function tamilFormsOf(text: string, g: Gazetteer): string[] {
  const keys = new Set(namesIn(text, g).map((h) => h.key));
  return g.entries.filter((e) => keys.has(e.key)).flatMap((e) => e.ta);
}
