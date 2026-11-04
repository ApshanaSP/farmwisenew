/**
 * The entity registry and its resolver: who or what a sentence is about (an agency, a department, the corporation as a whole,
 * a zone), however loosely it was said or misheard. In process, no network, no model.
 *
 * The registry is generated from the World (the console's own department list, zones and places), so it changes when the
 * data does. Each entry gets its aliases by rule, not by hand: its name, its code, the initials of its name ("GCP", "SWD"),
 * the name with its civic qualifiers folded away ("Greater Chennai Police" -> "police"), and the spoken names in lexicon.ts.
 * Hearing errors are left to the matching ladder, not to lists of mishearings:
 *   exact (0.97) -> initials (0.92) -> one edit (0.86) -> the same sound (phonetic key, 0.8) -> nothing.
 * The qualifiers (greater, chennai, city, madras ...) are optional on both sides, so "madras police", "city police" and
 * "greater chennai police" meet. A qualifier the district does not know ("Coimbatore", "Mumbai", "Avadi", "Tambaram", which is
 * outside the district in the taluk table) in front of an agency word makes the sentence about some other body: it is
 * reported as unknown, never forced onto ours.
 */
import { CAT_ALIASES, DEPT_ALIASES, DEPT_TA, ZONES } from "./lexicon";
import { editDistance } from "./normalise";
import { phonetic, romanise } from "./xlit";
import type { World } from "./types";
import { outsideIn } from "./outside";

export type EntityKind = "dept" | "org" | "zone";
export interface Entity { id: string; kind: EntityKind; name: string; ta: string | null; aliases: string[][]; noRecords?: boolean }
export interface Registry { entities: Entity[]; vocab: Set<string>; places: Set<string>; topics: Set<string>; seen: Map<string, string | null> }

export type Resolution =
  | { kind: "entity"; entity: Entity; conf: number; via: "exact" | "initials" | "edit" | "sound"; heard: string; brief: boolean; second: Entity | null }
  | { kind: "ambiguous"; options: Entity[]; heard: string; brief: boolean }
  | { kind: "unknown"; heard: string; brief: boolean; near: Entity | null; outside: boolean }
  | { kind: "none"; brief: boolean };

/** words that only say which city, or how grand: optional on both sides */
const QUAL = new Set(["greater", "chennai", "city", "madras", "metro", "metropolitan", "the", "our", "district", "local", "of"]);
/** words that name a kind of body: a qualifier nobody knows in front of one of these is another body */
const HEADS = new Set(["police", "corporation", "board", "department", "dept", "agency", "commission", "authority", "office", "ministry", "municipality", "council",
  "service", "services", "brigade", "commissionerate", "corp", "metrowater", "pwd"]);
/** posts that sit on a body ("police commissioner", "corporation commissioner"): about the body */
const POSTS = new Set(["commissioner", "commissioners", "officer", "officers", "chief", "head", "inspector", "engineer", "superintendent", "sp", "dcp", "ac", "dc"]);
/** asking for a brief: a report, a status, an update, what is going on */
const BRIEF_WORDS = new Set(["report", "reports", "brief", "briefing", "status", "update", "updates", "summary", "situation", "overview", "nilavaram", "nelavaram", "sitrep"]);
const BRIEF_PHRASE = /\b(what'?s|what is|whats) (happening|going on|new)\b|\bhow (is|are) .{0,40}\b(doing|going|getting on)\b|\bwhat does .{0,40}\b(report|say)\b|\b(any )?news (on|from|about)\b|\benna aachu\b|\bepdi irukku\b/;
/** the sentence's grammar, fillers and restarts: they say nothing about who */
const FILLER = new Set(("a an the this that these those is are was were be am do does did of in on at to for from by with about me my us our i you it its they them there here what whats which where when why how who please can could would will " +
  "give tell get show bring pull up out want need let just now current latest new recent so very sir madam ok okay um uh er hmm like actually sorry no yes yeah wait i mean say says said " +
  "la le ku kku lla ah nu oru enna ennaa epdi eppadi sollu sollunga kaattu kaatu pannu podu konjam inga anga da ma pa thaan than oda ode yoda " +
  "today week month weekly monthly daily quarterly this last yesterday morning evening all whole overall entire latest " +
  // commands and the nouns of the console: a verb or a word for cases in front of an agency word is not a place
  "filter only open list display find check put switch go set apply clear remove add pin save compare read explain map zoom sort send draft " +
  "complaints complaint cases case issues issue problems problem incidents incident pending open closed severe serious urgent critical new old top worst best most " +
  "brief briefing report status update summary numbers figures data records record details detail story stories alerts alert " +
  // greetings, the name, and the words that only say what kind of report
  "jarvis hey hello hi hai full detailed complete quick short annual tonight tonights tonight's general many nearest near some few one").split(" "));
/** Tamil terms in Tamil letters, by stem: matched as the start of a word, so case endings still find them */
const TA_TERMS: [string, string][] = [["போலீஸ்", "police"], ["போலிஸ்", "police"], ["காவல்துறை", "police"], ["காவல்", "police"], ["ரிப்போர்ட்", "report"], ["ரிப்போர்ட", "report"], ["அறிக்கை", "report"],
  ["நிலவரம்", "status"], ["சுருக்கம்", "brief"], ["அப்டேட்", "update"], ["கிரேட்டர்", "greater"], ["கிரேட்டர", "greater"], ["சென்னை", "chennai"], ["மெட்ராஸ்", "madras"], ["மாநகராட்சி", "corporation"], ["கார்ப்பரேஷன்", "corporation"],
  ["மாநகர", "city"], ["நகர", "city"], ["சிட்டி", "city"], ["குடிநீர் வாரியம்", "metrowater"], ["மெட்ரோ வாட்டர்", "metrowater"], ["பொதுப்பணித்துறை", "pwd"], ["பொதுப்பணி", "pwd"], ["மின்வாரியம்", "tangedco"], ["மின் வாரியம்", "tangedco"],
  ["துறை", "department"], ["வாரியம்", "board"], ["ஆணையர்", "commissioner"], ["கமிஷனர்", "commissioner"], ["என்ன", "enna"], ["சொல்லு", "sollu"], ["கோயம்புத்தூர்", "coimbatore"], ["கோவை", "coimbatore"], ["தாம்பரம்", "tambaram"], ["ஆவடி", "avadi"], ["மும்பை", "mumbai"]];
/** the bodies above the departments, by code prefix */
const ORGS: Record<string, { name: string; ta: string; aliases: string[] }> = {
  GCC: { name: "Greater Chennai Corporation", ta: "பெருநகர சென்னை மாநகராட்சி", aliases: ["corporation", "gcc", "corp", "municipal corporation", "chennai corporation", "municipality"] },
  PWD: { name: "Public Works Department", ta: "பொதுப்பணித்துறை", aliases: ["public works department", "pwd"] }
};

const words = (s: string) => s.toLowerCase().replace(/&/g, " and ").replace(/[^\p{L}\p{M}\p{N}' ]/gu, " ").replace(/'/g, "").split(/\s+/).filter(Boolean);
const core = (ws: string[]) => ws.filter((w) => !QUAL.has(w) && w !== "and");
/** initials of a name's own words, three letters or more ("Greater Chennai Police" -> gcp, "Storm Water Drain" -> swd) */
const initials = (name: string) => { const ws = words(name).filter((w) => w !== "and" && w !== "of" && !/^\(/.test(w)); return ws.length >= 2 ? ws.map((w) => w[0]).join("") : ""; };

const cache = new WeakMap<World, Registry>();

/** The registry for this World: built once per World object, so a new department list builds a new one. */
export function registry(w: World): Registry {
  const hit = cache.get(w);
  if (hit) return hit;
  const entities: Entity[] = [];
  const add = (id: string, kind: EntityKind, name: string, ta: string | null, raw: string[]) => {
    const seen = new Set<string>(), aliases: string[][] = [];
    for (const a of raw) {
      if (!a) continue;
      const ws = /[஀-௿]/.test(a) ? toRoman(a) : words(a);
      const c = core(ws);
      const key = c.join(" ");
      if (!c.length || seen.has(key)) continue;
      seen.add(key); aliases.push(c);
    }
    entities.push({ id, kind, name, ta, aliases });
  };
  const orgs = new Set<string>();
  for (const d of w.depts) {
    const prefix = d.code.split("-")[0];
    if (ORGS[prefix] && d.code.includes("-")) orgs.add(prefix);
    const suffix = d.code.includes("-") ? d.code.split("-")[1].toLowerCase() : d.code.toLowerCase();
    // a code suffix is an alias only when it is a word people say (SWD, SWM), not a filing code (ENG, REV)
    const said = (DEPT_ALIASES[d.code] ?? []).some((a) => a.toLowerCase() === suffix) || initials(d.name) === suffix;
    add(d.code, "dept", d.name, DEPT_TA[d.code] ?? null, [d.name, d.code.toLowerCase(), initials(d.name), said ? suffix : "", DEPT_TA[d.code] ?? "", ...(DEPT_ALIASES[d.code] ?? [])]);
  }
  // the bodies with no records in this build (TANGEDCO): known by name, so Jarvis can say it has nothing from them, not "who?"
  for (const b of w.bodies ?? []) {
    if (w.depts.some((d) => d.code === b.code) || !/^[A-Z][A-Z-]+$/.test(b.code)) continue;
    add(b.code, "dept", b.name, DEPT_TA[b.code] ?? null, [b.name, b.code.toLowerCase(), initials(b.name), DEPT_TA[b.code] ?? "", ...(DEPT_ALIASES[b.code] ?? [])]);
    entities[entities.length - 1].noRecords = true;
  }
  for (const o of orgs) add(o, "org", ORGS[o].name, ORGS[o].ta, [ORGS[o].name, ORGS[o].ta, ...ORGS[o].aliases]);
  for (const z of w.zones) add(`ZONE-${z.n}`, "zone", z.name, z.ta ?? null, [z.name, `zone ${z.n}`, ...(ZONES[z.n]?.en ?? []), ...(z.ta ? [z.ta] : []), ...(ZONES[z.n]?.ta ?? [])]);
  const vocab = new Set<string>();
  for (const e of entities) for (const a of e.aliases) for (const t of a) vocab.add(t);
  const places = new Set<string>();
  for (const p of w.places) for (const n of [p.name, ...p.aliases]) for (const t of /[஀-௿]/.test(n) ? toRoman(n) : words(n)) places.add(t);
  for (const t of w.taluks) for (const n of [t.name, t.ta ?? ""]) for (const x of /[஀-௿]/.test(n) ? toRoman(n) : words(n)) places.add(x);
  for (const z of w.zones) for (const x of words(z.name)) places.add(x);
  const topics = new Set<string>();
  for (const c of Object.values(CAT_ALIASES).flat()) for (const x of words(c)) { places.add(x); topics.add(x); } // topics explain a word too
  // a one-word alias that is also a topic ("water" for Metrowater) is too weak to name the body: "water level" is not Metrowater
  for (const e of entities) e.aliases = e.aliases.filter((a) => !(a.length === 1 && topics.has(a[0])));
  const reg = { entities, vocab, places, topics, seen: new Map<string, string | null>() };
  cache.set(w, reg);
  return reg;
}

/** Tamil words to the roman words the registry speaks: known terms by stem, others by sound. */
function toRoman(text: string): string[] {
  const out: string[] = [];
  for (const tok of text.normalize("NFC").split(/\s+/).filter(Boolean)) {
    if (!/[஀-௿]/.test(tok)) { out.push(...words(tok)); continue; }
    const term = TA_TERMS.find(([ta]) => !ta.includes(" ") && (tok === ta || tok.startsWith(ta.replace(/்$/, ""))));
    out.push(term ? term[1] : romanise(tok).replace(/\s+/g, ""));
  }
  return out;
}

/** The sentence as roman words (Tamil terms mapped first, two-word Tamil terms included). */
export function sentenceWords(text: string): string[] {
  let t = text.normalize("NFC");
  for (const [ta, en] of TA_TERMS) if (ta.includes(" ")) t = t.split(ta).join(` ${en} `);
  // letters spelled out one at a time ("C M W S S B", "P W D") are the one word they spell
  const out: string[] & { spelled?: string } = [];
  for (const w of toRoman(t)) {
    const prev = out[out.length - 1];
    if (w.length === 1 && /[a-z]/.test(w) && prev && /^[a-z]+$/.test(prev) && (prev.length === 1 || out.spelled === prev)) { out[out.length - 1] = prev + w; out.spelled = prev + w; }
    else out.push(w);
  }
  return out;
}

/** How close a heard word is to a registry word: 1 the same, 0.86 one edit (two on long words), 0.8 the same sound, 0 no. */
const scored = new Map<string, { s: number; via: "exact" | "edit" | "sound" } | null>();
function wordScore(heard: string, want: string): { s: number; via: "exact" | "edit" | "sound" } | null {
  if (heard === want) return { s: 1, via: "exact" };
  // the same pair comes up for every alias of every body in every sentence: worked out once
  const key = `${heard}|${want}`;
  if (scored.has(key)) return scored.get(key)!;
  if (scored.size > 50_000) scored.clear();
  const r = wordScoreRaw(heard, want);
  scored.set(key, r);
  return r;
}
function wordScoreRaw(heard: string, want: string): { s: number; via: "exact" | "edit" | "sound" } | null {
  if (heard.length >= 4 && want.length >= 4) {
    const d = editDistance(heard, want, 2);
    if (d <= 1 || (d === 2 && Math.min(heard.length, want.length) >= 7)) return { s: 0.86, via: "edit" };
    const a = phonetic(heard).replace(/ /g, ""), b = phonetic(want).replace(/ /g, "");
    const skel = (k: string) => k[0] + k.slice(1).replace(/[aeiou]/g, "");
    if (a.length >= 4 && (a === b || (skel(a) === skel(b) && skel(a).length >= 3))) return { s: 0.8, via: "sound" };
  }
  return null;
}

/** The registry word a heard word stands for, if any (spelling and sound folded). */
function vocabWord(w: string, reg: Registry): string | null {
  if (reg.vocab.has(w) || QUAL.has(w)) return w;
  if (reg.seen.has(w)) return reg.seen.get(w)!;
  let best: { w: string; s: number } | null = null;
  // the qualifiers match only as heard ("Madurai" is not "Madras"); the bodies' own words by spelling and sound
  for (const v of reg.vocab) { const r = wordScore(w, v); if (r && (!best || r.s > best.s)) best = { w: v, s: r.s }; }
  if (!best && w.length >= 6) for (const v of QUAL) if (v.length >= 6 && editDistance(w, v, 1) <= 1) best = { w: v, s: 0.86 };
  if (reg.seen.size > 5000) reg.seen.clear();
  reg.seen.set(w, best?.w ?? null);
  return best?.w ?? null;
}

/** Does the sentence ask for a brief (report, status, update, what is going on), in any of the three languages? */
export function asksBrief(text: string): boolean {
  const ws = sentenceWords(text);
  if (ws.some((w) => BRIEF_WORDS.has(w))) return true;
  return BRIEF_PHRASE.test(text.toLowerCase());
}

/**
 * Who the sentence is about. Agencies and departments first, then the corporation as a whole, then zones. The best match wins;
 * a second, different body within a hair of it makes the answer a question. A body named with a place the district does not know
 * is unknown, and so is an agency word with nothing of ours attached.
 */
export function resolveEntity(text: string, w: World): Resolution {
  const reg = registry(w);
  text = text.slice(0, 300);
  const brief = asksBrief(text);
  const all = sentenceWords(text);
  const content = all.filter((x) => !FILLER.has(x) && !BRIEF_WORDS.has(x));
  if (!content.length) return { kind: "none", brief };
  type Hit = { e: Entity; s: number; via: "exact" | "initials" | "edit" | "sound"; start: number; end: number; len: number };
  const hits: Hit[] = [];
  // the content words with the qualifiers taken out, remembering where each sat
  const idx = content.map((x, i) => ({ x, i })).filter(({ x }) => !QUAL.has(x) && !QUAL.has(vocabWord(x, reg) ?? ""));
  for (const e of reg.entities) {
    for (const a of e.aliases) {
      for (let k = 0; k + a.length <= idx.length; k++) {
        let s = 1, via: Hit["via"] = a.length === 1 && a[0].length <= 4 && a[0] === initials(e.name) ? "initials" : "exact";
        let ok = true, missed = 0;
        for (let j = 0; j < a.length && ok; j++) {
          const r = wordScore(idx[k + j].x, a[j]);
          // a one-word alias of three letters (an acronym) matches only exactly
          if (!r || (a[j].length <= 3 && r.via !== "exact")) {
            // a name of three words or more survives one word misheard inside it, the others heard right
            if (a.length >= 3 && missed === 0 && j > 0 && j < a.length - 1) { missed++; via = "sound"; continue; }
            ok = false; break;
          }
          s = Math.min(s, r.s);
          if (r.via !== "exact") via = r.via;
        }
        if (!ok) continue;
        const conf = via === "exact" ? 0.97 : via === "initials" ? 0.92 : via === "edit" ? 0.86 : 0.8;
        hits.push({ e, s: conf, via, start: idx[k].i, end: idx[k + a.length - 1].i, len: a.length });
      }
      // a one-word name heard as two or three short pieces ("tay nam pet", "tan ged co"): the pieces joined, by spelling or sound
      if (a.length === 1 && a[0].length >= 6) {
        for (let k = 0; k < idx.length; k++) for (const span of [2, 3]) {
          if (k + span > idx.length) continue;
          const parts = idx.slice(k, k + span);
          if (parts.some((p) => p.x.length > 5 || p.i !== parts[0].i + (parts.indexOf(p)))) continue;
          const r = wordScore(parts.map((p) => p.x).join(""), a[0]);
          if (r) hits.push({ e, s: r.via === "exact" ? 0.9 : r.via === "edit" ? 0.84 : 0.8, via: r.via === "exact" ? "edit" : r.via, start: parts[0].i, end: parts[span - 1].i, len: 1 });
        }
      }
    }
  }
  const covered = new Set<number>();
  for (const h of hits) for (let i = h.start; i <= h.end; i++) covered.add(i);
  // another place's body: a city, district, state or commissionerate outside Greater Chennai, anywhere in the sentence and not
  // inside a body's own name ("Tamil Nadu Pollution Control Board" is ours; "Tamil Nadu police" is the state's)
  const heads = content.map((x, i) => ({ x, i })).filter(({ x }) => HEADS.has(x) || HEADS.has(x.replace(/s$/, "")));
  // our own words (the qualifiers, the bodies' words, our places) are never someone else's place: "chennai" is one letter from "chengai"
  const outside = outsideIn(content.filter((_, i) => !covered.has(i)), true) ?? outsideIn(content.filter((x, i) => !covered.has(i) && !QUAL.has(x) && !reg.vocab.has(x) && !reg.places.has(x)));
  if (outside && (heads.length || hits.some((h) => h.e.kind !== "zone"))) {
    const near = hits.filter((x) => x.e.kind !== "zone").sort((a, b) => b.s - a.s)[0]?.e ?? null;
    const head = heads[0]?.x ?? (near ? near.aliases[0]?.[near.aliases[0].length - 1] ?? "" : "");
    return { kind: "unknown", heard: `${outside} ${head}`.trim(), brief, near, outside: true };
  }
  const agencyHits = hits.filter((h) => h.e.kind !== "zone");
  if (!agencyHits.length && heads.length && brief) {
    // "Zorblax agency report": an agency word with a name in front of it that is no body, place or topic of ours
    const i = heads[0].i, before = content[i - 1];
    if (before && !FILLER.has(before) && !POSTS.has(before) && (reg.topics.has(before) || (!reg.places.has(before) && !vocabWord(before, reg))))
      // a topic in front ("fire service") is a body we hold no records from, though its incidents may be on the console
      return { kind: "unknown", heard: `${before} ${heads[0].x}`, brief, near: null, outside: false };
    return { kind: "none", brief };
  }
  if (!hits.length) return { kind: "none", brief };
  // the longest, then the most certain; a body beats a zone when both were said ("Adyar police report" is police, in Adyar)
  const rank = (h: Hit) => (h.e.kind === "zone" ? 0 : 10) + h.len * 0.02 + h.s + (h.e.kind === "dept" ? 0.015 : 0);
  const byEntity = new Map<string, Hit>();
  for (const h of hits) { const b = byEntity.get(h.e.id); if (!b || rank(h) > rank(b)) byEntity.set(h.e.id, h); }
  const sorted = [...byEntity.values()].sort((a, b) => rank(b) - rank(a));
  let top = sorted[0];
  // the org and one of its departments: the department when its own words were said apart from the org's ("PWD water resources",
  // "corporation health department"), the org when the same words name both ("PWD")
  const apart = (a: Hit, b: Hit) => a.end < b.start || b.end < a.start;
  if (top.e.kind === "org") { const t0 = top; const own = hits.find((h) => h.e.kind === "dept" && h.e.id.startsWith(`${t0.e.id}-`) && h.s >= 0.8 && (apart(h, t0) || h.len > t0.len)); if (own) top = own; }
  else if (top.e.kind === "dept") { const org = sorted.find((h) => h.e.kind === "org" && top.e.id.startsWith(`${h.e.id}-`) && !apart(h, top) && h.len >= top.len); if (org) top = org; }
  // two different bodies named ("police and corporation"): not one brief; the planner decides
  const other = sorted.find((h) => h !== top && h.e.kind !== "zone" && !overlapsOrg(top.e, h.e) && h.via === "exact" && top.via === "exact" && h.start > top.end || (h !== top && h.e.kind !== "zone" && !overlapsOrg(top.e, h.e) && h.via === "exact" && top.via === "exact" && h.end < top.start));
  if (other && top.e.kind !== "zone" && /\b(and|or|with|vs|versus|matrum)\b|&|,|மற்றும்/i.test(text)) return { kind: "none", brief };
  // the corporation and one of its own departments, said together, are the department ("corporation health department")
  const rival = sorted.find((h) => h !== top && h.e.kind === top.e.kind && Math.abs(rank(top) - rank(h)) < 0.02 && !overlapsOrg(top.e, h.e));
  if (rival && top.via !== "exact" && rival.via !== "exact") return { kind: "ambiguous", options: [top.e, rival.e], heard: content.slice(top.start, top.end + 1).join(" "), brief };
  const second = sorted.find((h) => h.e.kind === "zone" && top.e.kind !== "zone")?.e ?? null;
  return { kind: "entity", entity: top.e, conf: Math.round(top.s * 100) / 100, via: top.via, heard: content.slice(top.start, top.end + 1).join(" "), brief, second };
}

const overlapsOrg = (a: Entity, b: Entity) => (a.kind === "org" && b.id.startsWith(`${a.id}-`)) || (b.kind === "org" && a.id.startsWith(`${b.id}-`));

/** The departments an org covers, in this World. */
export const orgDepts = (org: string, w: World) => w.depts.filter((d) => d.code.startsWith(`${org}-`)).map((d) => d.code);
export const orgName = (org: string) => ORGS[org]?.name ?? org;

export type BriefTurn =
  | { kind: "screen"; slots: Record<string, unknown>; conf: number; via: string }
  | { kind: "reply"; text: { en: string; ta: string }; conf: number; via: string; entity?: string }
  | { kind: "clarify"; text: { en: string; ta: string }; options: { label: string; request: string }[]; conf: number; via: string };

/** topics and readings: a zone named beside one of these is a question about that topic there, not a brief on the zone */
const TOPIC = /\b(rain|rainfall|air|aqi|pollution|lake|lakes|reservoir|reservoirs|news|price|prices|market|traffic|flood|flooding|garbage|waste|dengue|road|roads|accident|accidents|fire|crime|complaints?|cases?|incidents?)\b|மழை|காற்று|ஏரி|செய்தி|விலை|புகார்|வெள்ள|குப்பை/i;
const cap = (s: string) => s.replace(/\b\p{L}/gu, (c) => c.toUpperCase());

/**
 * The resolver's decision for one sentence, when it asks for a brief on a body: build the brief (acting, and saying what it took the
 * words to mean), say plainly that there is no data on that body (offering the nearest one), or ask one short question. null: not a
 * request for a brief on a body; the lanes after this one decide.
 */
export function briefTurn(text: string, w: World): BriefTurn | null {
  // not a request for a brief on a body, whatever words it shares with one: drafting or sending, an incident by number, a comparison,
  // the news, a reading, a place to find, the map, or "report a pothole" (reporting something, not asking for a report)
  if (NOT_A_BRIEF.test(` ${text.toLowerCase()} `)) return null;
  const r = resolveEntity(text, w);
  if (!r.brief || r.kind === "none") return null;
  if (r.kind === "unknown") {
    const heard = cap(r.heard);
    const near = r.near;
    return { kind: "reply", conf: 0, via: "unknown", text: {
      en: `I have no data on ${heard}. This console holds Chennai district's own records${near ? `; the nearest I have is ${near.name}, and I can brief you on that` : `; I can brief you on the corporation, the police, Metrowater, PWD or any zone`}.`,
      ta: `${heard} பற்றி என்னிடம் தரவு இல்லை. இதில் சென்னை மாவட்டத்தின் பதிவுகள் மட்டுமே உள்ளன${near ? `; அருகில் உள்ளது ${near.ta ?? near.name}, அதைப் பற்றிச் சொல்லலாம்` : `; மாநகராட்சி, காவல்துறை, குடிநீர் வாரியம், பொதுப்பணித்துறை அல்லது எந்த மண்டலத்தைப் பற்றியும் சொல்லலாம்`}.` } };
  }
  if (r.kind === "ambiguous") {
    const [a, b] = r.options;
    return { kind: "clarify", conf: 0.5, via: "ambiguous", options: [{ label: a.name, request: `brief me on ${a.name}` }, { label: b.name, request: `brief me on ${b.name}` }],
      text: { en: `Did you mean ${a.name} or ${b.name}?`, ta: `${a.ta ?? a.name} அல்லது ${b.ta ?? b.name}?` } };
  }
  const e = r.entity;
  // a zone with a topic beside it ("rain report for Adyar", "Adyar drainage status") is that topic's question
  if (e.kind === "zone" && (TOPIC.test(text) || sentenceWords(text).some((x) => registry(w).topics.has(x)))) return null;
  if (e.noRecords) return { kind: "reply", conf: r.conf, via: "no-records", entity: e.id, text: {
    en: `${e.name} has no records in this data yet, so I can't brief you on it. I can brief you on the corporation, the police, Metrowater, PWD or any zone.`,
    ta: `${e.ta ?? e.name} பற்றி இந்தத் தரவில் இன்னும் பதிவுகள் இல்லை. மாநகராட்சி, காவல்துறை, குடிநீர் வாரியம், பொதுப்பணித்துறை அல்லது எந்த மண்டலத்தைப் பற்றியும் சொல்லலாம்.` } };
  if (r.conf < 0.8) return { kind: "clarify", conf: r.conf, via: r.via, options: [{ label: e.name, request: `brief me on ${e.name}` }],
    text: { en: `I heard "${r.heard}". Did you mean ${e.name}?`, ta: `"${r.heard}" என்று கேட்டேன். ${e.ta ?? e.name} என்றா?` } };
  // a zone said beside a body narrows the body's brief to it ("Adyar police report"); so does a locality inside a zone ("Velachery")
  const loc = e.kind !== "zone" && r.second?.kind !== "zone" ? locality(text, w) : null;
  const zone = r.second?.kind === "zone" ? Number(r.second.id.slice(5)) : loc?.zone ?? null;
  const slots: Record<string, unknown> = e.kind === "dept" ? { dept: e.id, zones: zone ? [zone] : [] } : e.kind === "org" ? { org: e.id, zones: zone ? [zone] : [] } : { zones: [Number(e.id.slice(5))] };
  // a locality the data cannot place in a zone is said, not dropped: the brief says it covers the district
  if (loc && loc.zone == null) slots.name = loc.name;
  return { kind: "screen", conf: r.conf, via: r.via, slots: { ...slots, period: /\b(week|weekly|this week)\b|வாரம்|vaaram/i.test(text) ? "weekly" : /\bmonth|monthly\b|மாதம்|maasam/i.test(text) ? "monthly" : "daily", fresh: true } };
}

/** Words that make a sentence something other than a request for a brief on a body. */
const NOT_A_BRIEF = /\b(draft|write|letter|email|e-mail|mail|send|compose|forward|export|download|print|share|compare|versus|vs|against|news|headlines?|seithi|map|police station|police stations|reservoirs?|lakes?|rainfall|aqi|air quality|inc-\d+|complaint (no|number|#)?\s*\d+|case (no|number|#)?\s*\d+)\b| report (a|an) | update [^ ]+ (complaint|case) | as (resolved|closed|done) | rain (report|status|update)|செய்தி|வரைபட/i;

/** A locality in the sentence and its zone, if the data gives it one ("Velachery police report"), by name or alias. */
function locality(text: string, w: World): { name: string; zone: number | null } | null {
  const ws = sentenceWords(text);
  const flat = ` ${ws.join(" ")} `;
  for (const p of w.places) {
    for (const n of [p.name, ...p.aliases]) {
      const k = (/[஀-௿]/.test(n) ? toRoman(n) : words(n)).join(" ");
      if (k.length >= 4 && flat.includes(` ${k} `)) return { name: p.name, zone: p.zone };
    }
  }
  return null;
}
