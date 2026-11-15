/**
 * Jarvis v5 B3: the gazetteer corrector, JARVIS_GAZETTEER=1 (default off). Server only, in process, no package, no model.
 *
 * Whisper hears a place name it does not know as the nearest words it does ("Udyar", "Vela Cherry"). After the decode
 * (stt.ts), this puts back the name from the console's own lists, and changes nothing else:
 *   names    the 15 zones (lexicon ZONES: every English spelling and the Tamil script), the reservoirs (RESERVOIR_ALIASES), the
 *            prompt's other places (STT_NAMES), the departments' own names (DEPT_ALIASES, DEPT_TA, the prompt's acronyms) and the
 *            Corporation's 250 area names (areas.ts), less the words of them that are plain English or a person's or a common
 *            noun. The street-level words (areas.localities.ts) are never a target: they only protect a word from being changed.
 *   windows  each word, and each two words written with a space between them (a name Whisper split: "Vela Cherry", "Saida pet").
 *   a fix    needs ALL of:
 *            - the same consonant skeleton (normalise.ts `skeleton`, a leading vowel counted as any vowel), so only vowels,
 *              aspirates and doubled letters may differ, never a consonant;
 *            - the same number of vowel groups (syllables), so "manal" (sand) is never Manali and மணல் never மணலி;
 *            - a normalised edit distance (normalise.ts `editDistance` / the longer length) of at most MAX_NORM_DIST and at most
 *              MAX_EDITS edits for one word, MAX_SPLIT_EDITS for two (Tamil is compared in its romanised form, xlit.ts, so
 *              ல/ள/ழ, ண/ந/ன and ர/ற fold);
 *            - one place winning clearly: a second place as near (fewer than MARGIN edits further) refuses the fix;
 *            - the window is not a plain English word (english.ts) nor a Tanglish one (normalise.ts detectLang's lexicon), not
 *              already one of our names or locality words, and holds no digit and no number word (English, Tanglish or Tamil):
 *              a number is never touched or merged into a name. Two words with a Tanglish word among them join only exactly.
 * Telemetry: counts of fixed and unfixed windows (a window near a name but refused) only, never a word (rule 3).
 *
 * THE THRESHOLD (set 15 Nov 2026 on invented misspellings, gazetteer.test.ts): MAX_NORM_DIST = 0.2, MAX_EDITS = 2 (one word),
 * MAX_SPLIT_EDITS = 1 (two words), MARGIN = 1, names and windows of at least MIN_LETTERS = 5 letters, each part of a two-word window
 * at least MIN_PART = 3 letters. "Udyar" -> Adyar is 1 edit in 5 (0.2, the bar); "Vela Cherry" -> Velachery is 1 in 10 (0.1).
 * Tuning on the test's 474 ordinary English, Tanglish and Tamil words: with two edits allowed on a two-word window, "metro weather"
 * became Metrowater and "periya mother" Periyamathur (2 edits each), so a split name gets one; "kadai pakkam" (near the shop)
 * became Kadapakkam (1 edit), so a pair with a Tanglish word joins only exactly; "saalai" became Salai and கால்வாய் துறை (canal
 * department) கல்வித் துறை (education department), so common nouns and phrases of ordinary words are protected, never targets.
 * With these, the list gives zero fixes alone, as one sentence and in all 180,000 ordered Latin pairs but the brief's own "vela
 * cherry". Loosen nothing here without rerunning that list.
 */
import { AREA_WORDS } from "./areas";
import { LOCALITY_WORDS } from "./areas.localities";
import { isEnglishWord } from "./english";
import { DEPT_ALIASES, DEPT_TA, RESERVOIR_ALIASES, STT_NAMES, ZONE_NAMES, ZONES } from "./lexicon";
import { detectLang, editDistance, enNumber, skeleton, taMatch, taNumber } from "./normalise";
import { telemetry } from "./telemetry";
import { romanise } from "./xlit";

/** JARVIS_GAZETTEER=1 turns the corrector on; anything else (unset, 0) leaves every transcript exactly as Whisper wrote it. */
export const gazetteerOn = (): boolean => (process.env.JARVIS_GAZETTEER ?? "").trim() === "1";

/** the most a window may differ from a name: edits over the longer length (see THE THRESHOLD above) */
export const MAX_NORM_DIST = 0.2;
export const MAX_EDITS = 2;
/** a name Whisper split in two words gets fewer edits */
export const MAX_SPLIT_EDITS = 1;
/** the runner-up place must be at least this many edits further than the best, or nothing is fixed */
export const MARGIN = 1;
export const MIN_LETTERS = 5;
export const MIN_PART = 3;

type Script = "latin" | "tamil";
interface Target { flat: string; key: string; syl: number; id: string; out: string }

const TAMIL = /[஀-௿]/;
const hasTamil = (s: string) => TAMIL.test(s);
/** letters only, lower case, for comparing a Latin name ("Thiru-Vi-Ka Nagar" -> thiruvikanagar) */
const latinFlat = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");
/** a Tamil name as compared: its romanised letters (xlit.ts), so the letters Whisper confuses fold together */
const tamilFlat = (s: string) => romanise(s.replace(/[^஀-௿]/g, "")).replace(/[^a-z]/g, "");
const flatOf = (s: string, script: Script) => (script === "latin" ? latinFlat(s) : tamilFlat(s));
/** the spoken form of a phrase, for the exact-name check: lower case, hyphens and dots as spaces */
const phrase = (s: string) => s.toLowerCase().replace(/[-.]/g, " ").replace(/\s+/g, " ").trim();
const cap = (s: string) => s.replace(/(^|\s)(\p{L})/gu, (_m, a: string, b: string) => a + b.toUpperCase());

/** the consonant skeleton (normalise.ts), with a leading vowel standing for any vowel ("udyar" and "adyar" share "_dr") */
export function keyOf(flat: string): string {
  const s = skeleton(flat);
  return /^[aeiou]/.test(s) ? `_${s.slice(1)}` : s;
}
/** vowel groups; in English letters a silent final e is not one and a final y after a consonant is ("velachery" 4, "mylapore" 2) */
export function syllables(flat: string, script: Script): number {
  let s = flat;
  if (script === "latin" && /[^aeiouy]e$/.test(s) && /[aeiouy]/.test(s.slice(0, -1))) s = s.slice(0, -1);
  return (s.match(/[aeiou]+/g)?.length ?? 0) + (/[^aeiou]y$/.test(s) ? 1 : 0);
}

// ---- numbers: never touched ----

/** number words normalise.ts does not read (it stops at twenty, and at the tens in English) */
const MORE_NUMBERS = new Set(["hundred", "hundreds", "thousand", "thousands", "lakh", "lakhs", "lac", "lacs", "crore", "crores", "million", "millions", "billion",
  "dozen", "half", "nooru", "aayiram", "ayiram", "laksham", "latcham", "kodi", "irubadhu", "irupathu", "mupadhu", "muppathu", "naarpadhu", "narpathu", "aimbadhu", "ambadhu"]);
/** Tamil number words above twenty, as the start of a word (case endings follow) */
const TA_BIG = ["இருபத்", "முப்பது", "முப்பத்", "நாற்பது", "நாற்பத்", "ஐம்பது", "ஐம்பத்", "அம்பது", "அறுபது", "எழுபது", "எண்பது", "தொண்ணூறு", "நூறு", "நூற்று", "ஆயிரம்", "ஆயிரத்", "லட்சம்", "லட்ச", "கோடி"];
function numberWord(core: string, script: Script): boolean {
  if (script === "latin") { const w = core.toLowerCase(); return enNumber(w) != null || MORE_NUMBERS.has(w); }
  return taNumber(core) != null || TA_BIG.some((p) => core.startsWith(p));
}

// ---- the names ----

/**
 * Area-name words that are a person's name, a title or a common noun of a place name ("Gandhi Nagar", "Anna Salai", "Elephant
 * Gate"), not a place on their own: never a target (a word that IS one of them is still left alone, as every area word is).
 */
const NOT_A_PLACE = new Set(("alagappa annai annamalai assisi besant chinna dunlop gandhi ganesh gangai george hindu indira indra kuppam lenin madura mahathma " +
  "nagar palayam parrys puram raman salai sastri shenoy thangal thazhai thillai vivek washermen").split(" "));
/** the prompt's Tamil topic words: not names */
const TA_TOPICS = new Set(["வெள்ளம்", "மழை", "புகார்"]);

interface Index { by: Record<Script, Map<string, Target[]>>; known: Record<Script, Set<string>>; phrases: Set<string>; tamilNames: string[]; protect: Set<string> }
let index: Index | null = null;

function build(): Index {
  const by: Index["by"] = { latin: new Map(), tamil: new Map() };
  const known: Index["known"] = { latin: new Set(), tamil: new Set() };
  const phrases = new Set<string>(), tamilNames: string[] = [];
  const zoneLatin: { flat: string; key: string; id: string; out: string }[] = [];
  /** a name of ours that is never a target: left exactly as it is, alone or in a two-word window */
  const protectOnly = (spelling: string) => {
    const script: Script = hasTamil(spelling) ? "tamil" : "latin";
    known[script].add(script === "latin" ? latinFlat(spelling) : spelling.replace(/[^஀-௿]/g, ""));
    if (phrase(spelling).includes(" ")) phrases.add(script === "latin" ? phrase(spelling) : spelling.replace(/[.]/g, " ").replace(/\s+/g, " ").trim());
    if (script === "tamil") tamilNames.push(...spelling.replace(/[.]/g, " ").split(/\s+/).filter((w) => [...w].length >= 3));
  };
  const add = (spelling: string, id: string, out: string) => {
    protectOnly(spelling);
    const script: Script = hasTamil(spelling) ? "tamil" : "latin";
    const flat = flatOf(spelling, script);
    // a target is a name of one or two words with enough letters to weigh
    if (flat.length < MIN_LETTERS || phrase(spelling).split(" ").length > 2) return;
    const key = keyOf(flat), t: Target = { flat, key, syl: syllables(flat, script), id, out };
    const list = by[script].get(key) ?? [];
    if (!list.some((x) => x.flat === flat)) list.push(t);
    by[script].set(key, list);
    if (script === "latin" && id.startsWith("zone:")) zoneLatin.push({ flat, key, id, out });
  };

  // the zones first: their spellings name the zone (Adayar is Adyar), whatever list repeats them
  for (const [n, z] of Object.entries(ZONES)) {
    const id = `zone:${n}`;
    for (const v of z.en) add(v, id, ZONE_NAMES[Number(n) - 1]);
    for (const v of z.ta) add(v, id, z.ta[0]);
  }
  for (const [alias, canon] of RESERVOIR_ALIASES) add(alias, `res:${canon}`, hasTamil(alias) ? alias : cap(alias));
  // the prompt's own places and acronyms (Velachery, Mylapore, CMWSSB, TANGEDCO ...), less its topic words
  for (const n of STT_NAMES.en) if (!n.includes(" ") && (/^[A-Z]{5,}$/.test(n) || !isEnglishWord(n.toLowerCase()))) add(n, `name:${latinFlat(n)}`, n);
  for (const n of STT_NAMES.ta) if (hasTamil(n) && !TA_TOPICS.has(n)) add(n, `name:${n}`, n);
  // the departments: every spoken name is protected; a target only when it is a name of its own, not a phrase of ordinary words
  // ("storm water", மழைநீர் வடிகால்; கால்வாய் துறை, "canal department", must never become கல்வித் துறை, "education department")
  const tamilWord = (a: string, id: string) => { if (a.trim().includes(" ")) protectOnly(a); else add(a, id, a); };
  for (const [code, al] of Object.entries(DEPT_ALIASES)) for (const a of al) {
    if (hasTamil(a)) tamilWord(a, `dept:${code}`);
    // its acronym words in capitals as written ("CMWSSB", "PWD Buildings"), the rest capitalised ("Metrowater")
    else if (phrase(a).split(" ").some((w) => w.length >= 3 && !isEnglishWord(w))) add(a, `dept:${code}`, phrase(a).split(" ").map((w) => (w.length <= 6 && !isEnglishWord(w) ? w.toUpperCase() : cap(w))).join(" "));
    else protectOnly(a);
  }
  for (const [code, ta] of Object.entries(DEPT_TA)) tamilWord(ta, `dept:${code}`);
  // the Corporation's area names: an area spelt like a zone is that zone; two spellings of one area (Mugapair, Mugappair) are one place
  const areaId = new Map<string, string>();
  for (const w of [...AREA_WORDS].sort()) {
    if (w.length < MIN_LETTERS || NOT_A_PLACE.has(w) || isEnglishWord(w)) continue;
    const key = keyOf(w);
    const zone = zoneLatin.find((z) => z.key === key && editDistance(z.flat, w, MAX_EDITS) <= MAX_EDITS);
    if (zone) { add(w, zone.id, zone.out); continue; }
    const twin = [...areaId.entries()].find(([o]) => keyOf(o) === key && editDistance(o, w, MAX_EDITS) <= MAX_EDITS);
    const id = twin ? twin[1] : `area:${w}`;
    areaId.set(w, id);
    add(w, id, cap(w));
  }
  const protect = new Set<string>([...AREA_WORDS, ...LOCALITY_WORDS]);
  return { by, known, phrases, tamilNames, protect };
}
const idx = () => (index ??= build());

// ---- matching ----

interface Verdict { t: Target | null; near: boolean }

/** The one place this window clearly is, or null; `near`: some name shared its skeleton (a refused window, counted as unfixed). */
function match(flat: string, script: Script, maxEdits: number = MAX_EDITS): Verdict {
  const list = idx().by[script].get(keyOf(flat)) ?? [];
  if (!list.length) return { t: null, near: false };
  const syl = syllables(flat, script);
  const best = new Map<string, { t: Target; d: number }>();
  for (const t of list) {
    if (t.syl !== syl) continue;
    const d = editDistance(flat, t.flat, MAX_EDITS);
    if (d > maxEdits || d / Math.max(flat.length, t.flat.length) > MAX_NORM_DIST) continue;
    const b = best.get(t.id);
    if (!b || d < b.d) best.set(t.id, { t, d });
  }
  const ranked = [...best.values()].sort((a, b) => a.d - b.d);
  if (!ranked.length) return { t: null, near: true };
  if (ranked.length > 1 && ranked[1].d - ranked[0].d < MARGIN) return { t: null, near: true };
  return { t: ranked[0].t, near: true };
}

interface Tok { lead: string; core: string | null; trail: string; script: Script | null; number: boolean }
const TOKEN = /^([^\p{L}\p{M}]*)([\p{L}\p{M}]+)([^\p{L}\p{M}]*)$/u;
function tok(raw: string): Tok {
  const m = TOKEN.exec(raw);
  if (!m) return { lead: "", core: null, trail: "", script: null, number: /\p{N}/u.test(raw) };
  const [, lead, core, trail] = m;
  const script: Script | null = /^[A-Za-z]+$/.test(core) ? "latin" : /^[஀-௿]+$/.test(core) ? "tamil" : null;
  // a digit anywhere in the token (Adyar2, ௧௩) or a number word: never touched
  const number = /\p{N}/u.test(raw) || (script != null && numberWord(core, script));
  return { lead, core, trail, script, number };
}

/** the token is already one of ours: a name's spelling, an area or locality word, a Tamil name with a case ending */
function isKnown(t: Tok): boolean {
  if (!t.core || !t.script) return false;
  const i = idx();
  if (t.script === "latin") { const w = t.core.toLowerCase(); return i.known.latin.has(w) || i.protect.has(w); }
  return i.known.tamil.has(t.core) || i.tamilNames.some((n) => taMatch(t.core!, n));
}
/** the token alone is a name's own spelling (not only a locality word) */
const isName = (t: Tok) => !!t.core && !!t.script && (t.script === "latin" ? idx().known.latin.has(t.core.toLowerCase()) : idx().known.tamil.has(t.core));
const usable = (t: Tok) => !!t.core && !!t.script && !t.number;
/** a Tanglish word of the repo's own lexicon (normalise.ts detectLang: its Tanglish words and endings: pakkam, irukku, sollunga) */
const tanglish = (t: Tok) => t.script === "latin" && detectLang(t.core!.toLowerCase()) === "ta";
/** a plain English word (english.ts) or a Tanglish one: never changed on its own */
const ordinary = (t: Tok) => t.script === "latin" && (isEnglishWord(t.core!.toLowerCase()) || tanglish(t));

export interface Corrected { text: string; fixed: number; unfixed: number }

/** Put back the names Whisper misheard. Everything else (spacing, punctuation, case, every number) is left as it was. */
export function correctNames(text: string): Corrected {
  const parts = text.split(/(\s+)/);
  const toks = parts.map((p, n) => (n % 2 === 0 ? tok(p) : null));
  let fixed = 0, unfixed = 0;
  for (let n = 0; n < parts.length; n += 2) {
    const a = toks[n]!;
    if (!usable(a)) continue;
    let near = false;
    // two words with only a space between them: a name Whisper split in two. With a Tanglish word in it ("kadai pakkam", near the
    // shop) only an exact join is a name ("Thorai pakkam" -> Thoraipakkam); never Kadapakkam
    const b = n + 2 < parts.length ? toks[n + 2]! : null;
    if (b && usable(b) && b.script === a.script && !a.trail && !b.lead && !isName(a) && !isName(b) && !(isKnown(a) && isKnown(b))) {
      const fa = flatOf(a.core!, a.script!), fb = flatOf(b.core!, b.script!), joined = fa + fb;
      const spaced = a.script === "latin" ? `${a.core!.toLowerCase()} ${b.core!.toLowerCase()}` : `${a.core} ${b.core}`;
      if (fa.length >= MIN_PART && fb.length >= MIN_PART && !idx().phrases.has(spaced) && !(a.script === "latin" && isEnglishWord(joined))) {
        const v = match(joined, a.script!, tanglish(a) || tanglish(b) ? 0 : MAX_SPLIT_EDITS);
        near ||= v.near;
        if (v.t) {
          parts[n] = `${a.lead}${v.t.out}${b.trail}`;
          parts[n + 1] = ""; parts[n + 2] = "";
          fixed++; n += 2;
          continue;
        }
      }
    }
    // one word
    if (!isKnown(a) && !ordinary(a)) {
      const f = flatOf(a.core!, a.script!);
      if (f.length >= MIN_LETTERS) {
        const v = match(f, a.script!);
        near ||= v.near;
        if (v.t) { parts[n] = `${a.lead}${v.t.out}${a.trail}`; fixed++; continue; }
      }
    }
    if (near) unfixed++;
  }
  return { text: parts.join(""), fixed, unfixed };
}

/** stt.ts's call, after the decode: the corrected transcript, and the counts (never the words) to telemetry. */
export function correctTranscript(text: string, at: { lane: string; lang: string }): string {
  const r = correctNames(text);
  telemetry("gazetteer", { lane: at.lane, lang: at.lang, kind: "fixed", count: r.fixed });
  telemetry("gazetteer", { lane: at.lane, lang: at.lang, kind: "unfixed", count: r.unfixed });
  return r.text;
}
