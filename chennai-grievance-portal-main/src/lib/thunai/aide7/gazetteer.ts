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
/** a Tamil name's stem: case endings attach to it (அடையாறு -> அடையாற்றில், அடையாறில்), so the last vowel sign or two may change */
const taStem = (s: string) => (s.length >= 5 ? s.replace(/[ா-ௌ்]?[஀-௿]?[ா-ௌ்]$/u, "") : s);

const cache = new WeakMap<Gazetteer, { re: RegExp; forms: Map<string, NameEntry>; ta: { stem: string; e: NameEntry; form: string }[] }>();
function index(g: Gazetteer) {
  let c = cache.get(g);
  if (c) return c;
  const forms = new Map<string, NameEntry>();
  for (const e of g.entries) for (const f of e.en) { const k = f.toLowerCase(); const prev = forms.get(k); if (!prev || (prev.kind === "place" && e.kind !== "place")) forms.set(k, e); }
  // the longest forms first, so "Anna Nagar" is one hit, not "Anna"
  const all = [...forms.keys()].sort((a, b) => b.length - a.length).map(esc);
  const re = new RegExp(`(?<![\\p{L}\\p{M}])(?:${all.join("|") || "(?!)"})(?![\\p{L}\\p{M}])`, "giu");
  const ta = g.entries.flatMap((e) => e.ta.map((form) => ({ stem: taStem(form), e, form }))).filter((x) => x.stem.length >= 2).sort((a, b) => b.stem.length - a.stem.length);
  c = { re, forms, ta };
  cache.set(g, c);
  return c;
}

/** Every district name in a text, in order, longest match first; English case-insensitive, Tamil by stem. */
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
    let from = 0;
    for (;;) {
      const i = t.indexOf(x.stem, from);
      if (i < 0) break;
      from = i + x.stem.length;
      // a Tamil stem starts a word
      if (i > 0 && /[\p{L}\p{M}]/u.test(t[i - 1])) continue;
      if (taken.some(([a, b]) => i < b && i + x.stem.length > a)) continue;
      out.push({ key: x.e.key, kind: x.e.kind, at: i, form: x.form });
      taken.push([i, i + x.stem.length]);
    }
  }
  return out.sort((a, b) => a.at - b.at);
}

/** The Tamil forms of the names in a text (for a fact's Tamil aliases). */
export function tamilFormsOf(text: string, g: Gazetteer): string[] {
  const keys = new Set(namesIn(text, g).map((h) => h.key));
  return g.entries.filter((e) => keys.has(e.key)).flatMap((e) => e.ta);
}
