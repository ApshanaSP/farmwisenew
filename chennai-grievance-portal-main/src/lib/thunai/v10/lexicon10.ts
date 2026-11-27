/**
 * v10: the entity lexicon (docs/jarvis/JARVIS_V10.md 4.2): the names the Collector may say, built from the store's news of the week and the
 * district's own reference lists, refreshed with them. One entry a thing, every spelling the store and the district use for it (English,
 * Tamil script, the by-ear forms the headlines themselves carry), each with its sound key (phon10.ts).
 *
 *   buildLexicon(stories, world)   storms (the name next to "cyclone", "storm", "புயல்" in a headline: "Cyclone Akvan", "Akwan Cyclone",
 *                                   "Asuran cyclone", "Cyclone Murasu"), names in the news (people, bodies, events: words no English
 *                                   dictionary, place list or outlet holds, e.g. "Arlekar", "Veeramani", "IOCL"), the district's places,
 *                                   zones and taluks with their Tamil names, the outlets and the departments. Spellings that sound alike
 *                                   are one entry ("Akvan" and "Akwan").
 *   keytermsOf(lex, o)             the day's names for the speech-to-text's keyterms (Sarvam): storms first, then names in the news by
 *                                   how many stories carry them, then what is on screen, within the service's limit.
 *
 * Pure, no I/O: the server builds it from storeStories() and the world (lexroute.ts); the browser gets the small list for its lanes.
 */
import { isEnglishWord } from "../english";
import type { World } from "../types";
import { fold, looseKey, tokensOf } from "../v8/match";
import { placeWord } from "../v8/lang8";
import { classOf, earKey, earKeyJoined, earSim, type EntityClass } from "./phon10";

export type EntityKind = "storm" | "name" | "place" | "outlet" | "dept";
export interface Entity10 {
  /** stable within a build: kind and sound key */
  id: string;
  kind: EntityKind;
  /** how it is said back: the store's most frequent spelling, with its class word for a storm ("Cyclone Akvan") */
  name: string;
  /** the name's own words, no class word ("Akvan") */
  core: string;
  /** every spelling seen (English, Tamil script), the most frequent first */
  spellings: string[];
  /** the sound keys of the spellings, joined (phon10 earKeyJoined), unique */
  keys: string[];
  /** a storm's class ("storm"); a name's class when its headlines say it ("protest", "fire") */
  cls?: EntityClass | null;
  /** the stories that name it (their ids, the newest first, at most 12) */
  docs: string[];
  /** how many stories name it */
  n: number;
  /** the newest story's time ("2026-11-19 11:36") */
  t?: string | null;
}

export interface LexStory { id: string; title: string; titleEn?: string | null; t?: string | null }

/** words next to a class word that are not a storm's name ("Cyclone Update", "the cyclone effect", "Severe Cyclone") */
const NOT_STORM_NAME = new Set(("update updates effect effects impact warning warnings alert alerts news live latest severe super tropical cyclonic depression " +
  "deep low pressure storm storms cyclone cyclones bay bengal arabian sea coast coastal landfall chennai tamil nadu odisha andhra the a an this that its " +
  "monstrous major big new first next another threat fear relief rain rains heavy").split(/\s+/));
/** words of a headline that are no name: months, days, common shapes the dictionary misses */
const NOT_A_NAME = new Set(("january february march april may june july august september october november december monday tuesday wednesday thursday friday saturday sunday " +
  "chennai tamil nadu india indian govt crore lakh rs km kg sq ft cm mp mla mlas dmk aiadmk bjp tvk pmk cpi cpm vck congress gcc tn tnstc cmrl cmwssb tangedco " +
  "sit dvac fir pocso pds ac rwh swd mepz tnuhdb isro iit ias ips").split(/\s+/));
/** a storm named in a headline, English: "Cyclone Akvan", "Akwan Cyclone", "Asuran cyclone", "‘Asuran’ storm" */
const STORM_EN = /\b(?:[Cc]yclone|CYCLONE|[Ss]torm|STORM)\s+['‘’"]?([A-Z][a-z]{2,14})['‘’"]?|['‘’"]?\b([A-Z][a-z]{2,14})['‘’"]?\s+(?:[Cc]yclone|CYCLONE|[Ss]torm|STORM)\b/g;
/** Tamil: the word before புயல் ("அக்வான் புயல்", "மோந்தா புயலால்") */
const STORM_TA = /(?:^|\s)([஀-௿]{3,})\s+புயல்/gu;

const sid = (kind: string, key: string) => `${kind}:${key}`;

interface Acc { kind: EntityKind; cls: EntityClass | null; spell: Map<string, number>; docs: Map<string, string | null>; key: string; /** when it was made (the first-made of two that both sound alike wins) */ seq: number }

/** the two keys earSim compares first: v8's Tamil-loose key and the ear key. earSim(a, b) >= 0.97 only when one of them is equal (see sameThing) */
const looseOf = (k: string): string => looseKey(fold(k).replace(/\s+/g, ""));

type LexWorld = Pick<World, "zones" | "places" | "taluks" | "depts"> & Partial<Pick<World, "bodies">>;

/** Build the lexicon. `stories`: the store's week, newest first (newsfind.ts storeStories); `world`: the district's lists. */
export function buildLexicon(stories: LexStory[], world: LexWorld, o: { outlets?: string[] } = {}): Entity10[] {
  const steps = lexiconSteps(stories, world, o);
  for (;;) { const r = steps.next(); if (r.done) return r.value; }
}

/**
 * The same lexicon, built a slice at a time with the thread let go between slices (setImmediate), so a server request that comes meanwhile
 * is answered (the hosted copy's one core held 7-8 s while Jarvis opened: the report of 27 Nov, cause 2).
 */
export async function buildLexiconYielding(stories: LexStory[], world: LexWorld, o: { outlets?: string[] } = {}): Promise<Entity10[]> {
  const steps = lexiconSteps(stories, world, o);
  for (;;) {
    const r = steps.next();
    if (r.done) return r.value;
    await new Promise<void>((res) => setImmediate(res));
  }
}

/** how much work (spellings added or matched) between two yields of lexiconSteps */
const SLICE = 150;

/** buildLexicon's work, yielding every SLICE spellings; its return value is the lexicon */
function* lexiconSteps(stories: LexStory[], world: LexWorld, o: { outlets?: string[] }): Generator<void, Entity10[], void> {
  const acc = new Map<string, Acc>();
  // (27 Nov) the entries by kind and each of earSim's two first keys: the one-consonant-apart match below compared each spelling with every
  // entry made so far (20.9 s for 2,142 stories on the owner's PC); only an entry with one of these keys equal can reach 0.97
  const byKey = new Map<string, Acc[]>();
  const keep = (k: string, a: Acc) => { const l = byKey.get(k); if (l) l.push(a); else byKey.set(k, [a]); };
  let seq = 0, work = 0;
  const add = (kind: EntityKind, spelling: string, doc: LexStory | null, cls: EntityClass | null = null) => {
    work++;
    const sp = spelling.normalize("NFC").trim();
    const key = earKeyJoined(sp);
    if (!sp || key.replace(/^a/, "").length < 2) return;
    // one entry per thing: the same kind and a sound key equal, or one consonant apart in a long key with the spellings close ("Akvan"/"Akwan")
    let hit: Acc | undefined = acc.get(sid(kind, key));
    if (!hit) {
      const lk = looseOf(key), ek = earKey(key);
      // the first-made entry that sounds the same (as the scan over every entry in the order made found it)
      for (const a of [...(lk ? byKey.get(`${kind}|l|${lk}`) ?? [] : []), ...(ek ? byKey.get(`${kind}|e|${ek}`) ?? [] : [])]) {
        if (a.key.length >= 5 && (!hit || a.seq < hit.seq) && acc.get(sid(a.kind, a.key)) === a && earSim(a.key, key) >= 0.97) hit = a;
      }
    }
    const a = hit ?? { kind, cls, spell: new Map<string, number>(), docs: new Map<string, string | null>(), key, seq: seq++ };
    a.spell.set(sp, (a.spell.get(sp) ?? 0) + 1);
    if (doc && a.docs.size < 40) a.docs.set(doc.id, doc.t ?? null);
    if (cls && !a.cls) a.cls = cls;
    if (!hit) {
      acc.set(sid(kind, key), a);
      if (key.length >= 5) { const lk = looseOf(key), ek = earKey(key); if (lk) keep(`${kind}|l|${lk}`, a); if (ek) keep(`${kind}|e|${ek}`, a); }
    }
  };
  const due = (): boolean => { if (work < SLICE) return false; work = 0; return true; };
  // (27 Nov) a headline's class once per headline, each word's once per build: it was worked out again for every name run of the headline,
  // each word against every class word by ear, which was nine tenths of the 20.9 s (the profile of the owner's week of news)
  const wordClass = new Map<string, EntityClass | null>();
  const titleClass = new Map<string, EntityClass | null>();
  const classOfTitle = (title: string): EntityClass | null => {
    let c = titleClass.get(title);
    if (c === undefined) { c = headlineClass(title, wordClass); titleClass.set(title, c); }
    return c;
  };
  // 1. storms and names in the news. A name comes from Latin letters (an English headline or a story's English title); a Tamil-script word
  // only adds a spelling to a name already found that sounds the same ("அர்லேகர்" to "Arlekar"), else it is let go: a Tamil headline's
  // ordinary words are no names (the owner's "... கம்ப்பியன்ஸ் வந்திருக்கு" matched one in the dry replay, 19 Nov). A storm named before
  // புயல் is a storm whatever its letters (the class word is the evidence).
  const tamilRuns: { run: string; s: LexStory }[] = [];
  for (const s of stories) {
    if (due()) yield;
    for (const title of [s.title, s.titleEn].filter((x): x is string => !!x)) {
      for (const m of title.matchAll(STORM_EN)) {
        const w = (m[1] ?? m[2] ?? "").trim();
        if (w && !NOT_STORM_NAME.has(w.toLowerCase()) && !placeWord(w)) add("storm", w, s, "storm");
      }
      // (a Tamil word before புயல் is a storm's spelling only when it sounds as a storm found in Latin letters in the same story: "இன்று புயல்",
      // "தீவிர புயல்", "நாளை புயல்" are today, severe and tomorrow; the real store, 19 Nov)
      for (const m of title.matchAll(STORM_TA)) { const w = m[1]; if (w && !placeWord(w)) tamilRuns.push({ run: w, s }); }
      for (const run of nameRuns(title)) {
        if (/[஀-௿]/u.test(run)) tamilRuns.push({ run, s });
        else add("name", run, s, classOfTitle(title));
      }
    }
  }
  // a name in the news found in Latin letters that sounds as a storm joins it ("Aquan" in a Dinamalar headline is Cyclone Akvan)
  const storms = [...acc.values()].filter((a) => a.kind === "storm");
  for (const a of [...acc.values()]) {
    if (a.kind !== "name") continue;
    work += 1 + storms.length;
    if (due()) yield;
    const st = storms.find((x) => [...x.spell.keys()].some((sp) => [...a.spell.keys()].some((sa) => earSim(sp, sa) >= 0.9)));
    if (st) { for (const [sp, k] of a.spell) st.spell.set(sp, (st.spell.get(sp) ?? 0) + k); for (const [d, t] of a.docs) st.docs.set(d, t); acc.delete(sid("name", a.key)); }
  }
  // the Tamil-script spellings of the storms and names found: a Tamil word of the same story's Tamil headline that sounds as the name its English
  // title carries (a Tamil outlet's story has both); a sound alone across stories made "பெண்கள்" (women) Bengal and "கனமழை" (heavy rain)
  // Kanimozhi on the real store (19 Nov). The rest are let go.
  const known = [...acc.values()].filter((a) => a.kind === "storm" || a.kind === "name");
  for (const { run, s } of tamilRuns) {
    work++;
    if (due()) yield;
    const hit = known.find((a) => a.docs.has(s.id) && a.key.replace(/^a/, "").length >= 3 && [...a.spell.keys()].some((sp) => !/[஀-௿]/u.test(sp) && earSim(sp, run) >= 0.9));
    if (hit) hit.spell.set(run, (hit.spell.get(run) ?? 0) + 1);
  }
  // 2. the district's places, zones and taluks (English and Tamil), the departments and bodies, the outlets
  for (const z of world.zones) { add("place", z.name, null); if (z.ta) add("place", z.ta, null); }
  for (const t of world.taluks ?? []) { add("place", t.name, null); if (t.ta) add("place", t.ta, null); }
  for (const p of world.places) { if (due()) yield; add("place", p.name, null); for (const al of p.aliases ?? []) add("place", al, null); }
  for (const d of [...(world.depts ?? []), ...(world.bodies ?? [])]) add("dept", d.name, null);
  for (const n of o.outlets ?? []) add("outlet", n, null);
  // the entries, the most named first
  const out: Entity10[] = [];
  for (const a of acc.values()) {
    work++;
    if (due()) yield;
    const spellings = [...a.spell.entries()].sort((x, y) => y[1] - x[1] || x[0].length - y[0].length).map((x) => x[0]);
    const docs = [...a.docs.entries()].sort((x, y) => String(y[1] ?? "").localeCompare(String(x[1] ?? ""))).map((x) => x[0]);
    const core = spellings.find((x) => /^[\p{Script=Latin}\s.'-]+$/u.test(x)) ?? spellings[0];
    const name = a.kind === "storm" ? `Cyclone ${core}` : core;
    out.push({ id: sid(a.kind, a.key), kind: a.kind, name, core, spellings: spellings.slice(0, 12), keys: [...new Set(spellings.map(earKeyJoined))].slice(0, 12),
      cls: a.cls, docs: docs.slice(0, 12), n: a.docs.size, t: [...a.docs.values()].filter(Boolean).sort().at(-1) ?? null });
  }
  return out.sort((x, y) => KIND_ORDER[x.kind] - KIND_ORDER[y.kind] || y.n - x.n || x.name.localeCompare(y.name));
}
const KIND_ORDER: Record<EntityKind, number> = { storm: 0, name: 1, place: 2, dept: 3, outlet: 4 };

/** a headline's class word, if any ("protest", "fire"): the class its names may be said with */
const headlineClass = (title: string, memo?: Map<string, EntityClass | null>): EntityClass | null => {
  for (const w of title.split(/[^\p{L}\p{M}]+/u)) {
    let c = memo?.get(w);
    if (c === undefined) { c = classOf(w); memo?.set(w, c); }
    if (c && c !== "storm") return c;
  }
  return null;
};

/**
 * The runs of name words in a headline: Latin words (Title Case or not) that are no English word, no district place, no month, party or
 * acronym the console knows, at least four letters (an acronym of three or more capitals counts: "IOCL", "DRI"), joined while they follow
 * each other ("Rajendra Arlekar", "Mahesh Kumar Agrawal"). Tamil-script words are names when they are no Tamil grammar and no place: a Tamil
 * headline's "அர்லேகர்".
 */
export function nameRuns(title: string): string[] {
  const out: string[] = [];
  let run: string[] = [];
  const flush = () => { if (run.length) out.push(run.join(" ")); run = []; };
  // a headline in capitals ("RESIDENTS STAGE EMPTY-POT PROTEST") holds no acronym to tell apart and no capital to go by: read in title case
  const latin = title.replace(/[^A-Za-z]/g, "");
  const shouting = latin.length >= 12 && latin.replace(/[^A-Z]/g, "").length / latin.length > 0.7;
  const text = shouting ? title.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase()) : title;
  for (const raw of text.normalize("NFC").split(/[\s,;:!?|()"“”‘’]+/u)) {
    const w = raw.replace(/^['.-]+|['.\-]+$/g, "").replace(/['’]s$/u, "");
    if (!w) { flush(); continue; }
    if (/[஀-௿]/u.test(w)) {
      // a Tamil word: a name when it is not grammar (a case ending glued on is fine: "அக்வான்" and "அக்வானால்") and not a place
      const bare = w.replace(/(?:ால்|ில்|க்கு|ுக்கு|ின்|ை|ும்)$/u, "");
      // (each Tamil word a run of its own: Tamil headlines run common words together, and a Tamil word only ever adds a spelling by sound)
      flush();
      if (bare.length >= 3 && !TA_COMMON.test(bare) && !placeWord(w) && !placeWord(bare)) out.push(bare);
      continue;
    }
    if (!shouting && /^[A-Z]{3,6}$/.test(w) && !NOT_A_NAME.has(w.toLowerCase())) { flush(); out.push(w); continue; }
    const lw = w.toLowerCase();
    // (a name begins with a capital: a sentence-case headline's small words are no names, "dept", "desal")
    const nameish = /^[A-Z][a-z]+$/.test(w) && lw.length >= 4 && !isEnglishWord(lw) && !NOT_A_NAME.has(lw) && !placeWord(lw) && !GENERIC_NAME.has(lw);
    if (nameish) run.push(w); else flush();
  }
  flush();
  return [...new Set(out)].filter((x) => x.length >= 4);
}
/** Latin words of a headline the dictionary misses that are no names (a street's or a place's generic word, an adjective of a people) */
const GENERIC_NAME = new Set(("salai nagar puram pettai theru kuppam street road colony layout extension marxist muslim muslims hindu hindus christian christians " +
  "singaporean deepavali diwali pongal update updates breaking exclusive").split(/\s+/));
/** common Tamil words of a headline that are no names (verbs, nouns, particles); only for nameRuns */
const TA_COMMON = /^(?:சென்னை|சென்னையில்|தமிழக|தமிழ்நாடு|மாநகராட்சி|அரசு|போலீஸ்|போலீசார்|காவல்|மக்கள்|பொதுமக்கள்|கைது|மழை|புயல்|எச்சரிக்கை|செய்தி|இன்று|நாளை|நேற்று|மணி|கோடி|லட்சம்|ரூ|பேர்|பேரை|பேருக்கு|வீடு|சாலை|தெரு|நகர்|பகுதி|பகுதியில்|பகுதிகளில்|அருகே|மீது|உள்ள|உள்ளது|இருந்து|வரை|பற்றி|என்று|என|மற்றும்|ஒரு|இந்த|அந்த|முதல்|புதிய|தொடர்ந்து|காரணமாக|வேண்டும்|செய்த|செய்து|செய்ய|வந்த|போன|நடந்த|நடைபெற்ற|தொடங்கி|வருகிறது|உள்ளனர்|ஆய்வு|திட்ட|பணி|பணிகள்|முதல்வர்|அமைச்சர்|ஆட்சியர்|நீதிமன்ற|உயர்நீதிமன்ற|உச்சநீதிமன்ற)/u;

/**
 * The day's names for the speech-to-text's keyterms: storms first, then names in the news by how many stories carry them (two or more, or a
 * story on screen), then the extra names given (what is on screen, the zones), each once and in English letters, within `max` terms of at most
 * `maxChars` characters each. Sarvam spells a keyterm as given, so the store's own spelling goes in ("Akvan", "Kodungaiyur").
 */
export function keytermsOf(lex: Entity10[], o: { max?: number; maxChars?: number; extra?: string[]; onScreen?: Set<string> } = {}): string[] {
  const max = o.max ?? 50, maxChars = o.maxChars ?? 40;
  const out: string[] = [];
  const seen = new Set<string>();
  // (Latin letters, or Tamil script for a name a Tamil headline spells: codemix writes a Tamil name in Tamil script, and Sarvam's best result
  // came from terms in the script they appear in: v10-research/10-sarvam-catalogue.md 3.4; one phrase a term, no commas)
  const push = (s: string) => {
    const t = s.replace(/\s+/g, " ").replace(/,/g, " ").trim();
    if (!t || t.length > maxChars || !(/^[\p{Script=Latin}0-9\s.'&-]+$/u.test(t) || /^[஀-௿\s]+$/u.test(t))) return;
    const k = /[஀-௿]/u.test(t) ? t : fold(t);
    if (seen.has(k) || out.length >= max) return;
    seen.add(k); out.push(t);
  };
  for (const e of lex.filter((x) => x.kind === "storm")) {
    for (const s of e.spellings.filter((x) => /^[\p{Script=Latin}\s.'-]+$/u.test(x)).slice(0, 2)) push(s);
    for (const s of e.spellings.filter((x) => /^[஀-௿\s]+$/u.test(x)).slice(0, 1)) push(s);
  }
  const names = lex.filter((x) => x.kind === "name");
  // the names on screen, then those two or more stories carry, then the newest
  for (const e of names.filter((x) => x.docs.some((d) => o.onScreen?.has(d)))) push(e.core);
  for (const e of names.filter((x) => x.n >= 2)) push(e.core);
  for (const s of o.extra ?? []) push(s);
  for (const e of [...names].sort((a, b) => String(b.t ?? "").localeCompare(String(a.t ?? "")))) push(e.core);
  return out;
}

/** a name's spellings as heard words: its tokens folded (for the entity layer's index) */
export const spellTokens = (s: string): string[] => tokensOf(s).filter((w) => w.length >= 2);
/** re-exported for the callers that key a single word */
export { earKey };
