/**
 * Thunai's understanding engine, rules first: a sentence (English, Tamil or Tanglish) plus what is on screen, in; a plan of
 * allowed steps, one short question, a refusal, or "not understood" out. No AI and no network: the console calls the
 * Nova Lite planner (/api/collector/thunai/plan) only when this returns "unknown".
 *
 * Narrowing, not guessing:
 *   1. normalise (normalise.ts): one token stream, numbers as digits;
 *   2. whole-sentence commands (stop, undo, show numbers, remember, confirm 3, missions, settings…);
 *   3. questions: spatial ones go to Ask the Map, readings (a reservoir, rain, air) to the Environment page, any other
 *      question to Ask District IQ (its own tools answer it; Thunai never computes the answer);
 *   4. a bag of slots (page, period, zone, department, category, taluk, severity, map mode, layer, panel, list item,
 *      draft) in any order, with self-repair ("Adyar, no, Perungudi"), filled from screen memory ("this", "the worst",
 *      "change filter to 7").
 * Every slot one sentence sets is one transaction (one render, one undo). Confidence follows the brief:
 * 0.30 speech + 0.30 match + 0.20 context agreement + 0.20 margin over the runner-up.
 */
import { CAT_ALIASES, DEPT_ALIASES, DESTRUCTIVE, LAYER_WORDS, PAGE_WORDS, PANEL_WORDS, PERIOD_WORDS, REPAIR, RESERVOIR_ALIASES, SEV_WORDS,
  ZONES } from "./lexicon";
import { detectLang, editDistance, normalise, skeleton, taMatch } from "./normalise";
import type { Bilingual, Lang, PageKey, Panel, PeriodKey, ScreenState, Sev, Step, Understood, View, World } from "./types";

const TA = /[஀-௿]/;

// ------------------------------------------------------------------ phrase matching --

interface Hit { start: number; end: number; score: number }

/** One phrase word against one token: 1 exact, 0.95 a Tamil stem (case endings), 0.8 a close Latin spelling. */
function wordScore(tok: string, w: string): number {
  if (tok === w) return 1;
  if (TA.test(w)) return taMatch(tok, w) ? 0.95 : 0;
  // near spellings only for longer words: "water" must not become "weather", nor "incident" "accident"
  if (/\d/.test(w) || w.length < 6 || tok.length < 6 || TA.test(tok) || tok[0] !== w[0]) return 0;
  if (skeleton(tok) === skeleton(w) && Math.abs(tok.length - w.length) <= 3) return 0.85;
  const d = editDistance(tok, w, 2);
  return d <= (w.length >= 10 ? 2 : 1) ? 0.8 : 0;
}

/** Every place a phrase occurs in the tokens (phrase words consecutive). */
function findAll(tokens: string[], phrase: string): Hit[] {
  const pw = phrase.split(" ");
  const out: Hit[] = [];
  for (let i = 0; i + pw.length <= tokens.length; i++) {
    let score = 1;
    for (let j = 0; j < pw.length && score > 0; j++) score = Math.min(score, wordScore(tokens[i + j], pw[j]));
    if (score > 0) out.push({ start: i, end: i + pw.length, score });
  }
  return out;
}

interface Mention<T> { value: T; start: number; end: number; score: number }

/** All mentions of a dictionary in the tokens, longest phrase first; a span already taken is not reused. */
function mentions<T>(tokens: string[], dict: [string, T][], taken: boolean[]): Mention<T>[] {
  const sorted = [...dict].sort((a, b) => b[0].split(" ").length - a[0].split(" ").length || b[0].length - a[0].length);
  const out: Mention<T>[] = [];
  for (const [phrase, value] of sorted) {
    for (const h of findAll(tokens, phrase)) {
      let free = true;
      for (let k = h.start; k < h.end; k++) if (taken[k]) free = false;
      if (!free) continue;
      out.push({ value, ...h });
      for (let k = h.start; k < h.end; k++) taken[k] = true;
    }
  }
  return out.sort((a, b) => a.start - b.start);
}

/** Self-repair: a mention followed (before the next of its kind) by "no / illa / வேண்டாம்" is dropped; the last stands. */
function lastStanding<T>(ms: Mention<T>[], tokens: string[]): Mention<T> | null {
  const keep = ms.filter((m, i) => {
    const until = i + 1 < ms.length ? ms[i + 1].start : tokens.length;
    for (let k = m.end; k < until; k++) if (REPAIR.has(tokens[k])) return false;
    // "I mean X": "mean" before it repairs the one before, which the loop above already drops
    return true;
  });
  return keep.length ? keep[keep.length - 1] : null;
}

// ------------------------------------------------------------------ dictionaries --

function zoneDict(world: World): [string, number][] {
  const out: [string, number][] = [];
  for (const z of world.zones) {
    out.push([z.name.toLowerCase().replace(/[^\p{L}\p{N} ]/gu, " ").replace(/\s+/g, " ").trim(), z.n]);
    if (z.ta) out.push([z.ta, z.n]);
  }
  for (const [n, z] of Object.entries(ZONES)) {
    for (const e of z.en) out.push([e, Number(n)]);
    for (const t of z.ta) out.push([t, Number(n)]);
  }
  return out;
}
function deptDict(world: World): [string, string][] {
  const out: [string, string][] = [];
  for (const d of world.depts) {
    out.push([d.name.toLowerCase().replace(/[^\p{L}\p{N} ]/gu, " ").replace(/\s+/g, " ").trim(), d.code]);
    for (const a of DEPT_ALIASES[d.code] ?? []) out.push([a, d.code]);
  }
  return out;
}
function catDict(world: World): [string, string][] {
  const out: [string, string][] = [];
  for (const c of world.cats) {
    out.push([c.label.toLowerCase().replace(/&/g, "and").replace(/[^\p{L}\p{N} ]/gu, " ").replace(/\s+/g, " ").trim(), c.code]);
    for (const a of CAT_ALIASES[c.code] ?? []) out.push([a, c.code]);
  }
  return out;
}
function talukDict(world: World): [string, string][] {
  const out: [string, string][] = [];
  for (const t of world.taluks) {
    out.push([t.name.toLowerCase(), t.code]);
    if (t.ta) out.push([t.ta, t.code]);
  }
  return out;
}
function reservoirDict(world: World): [string, string][] {
  return [...world.reservoirs.map((r) => [r.name.toLowerCase(), r.name] as [string, string]), ...RESERVOIR_ALIASES];
}

// ------------------------------------------------------------------ helpers --

const b = (en: string, ta: string): Bilingual => ({ en, ta });
const QUESTION = /^(how many|how much|which|why|what is|whats|what are|who|when|where|is there|are there|did|does|do we|has|have)\b|எத்தனை|ஏன்|யார்|எப்போது|evlo|evvalavu|ethana|yen\b|\?\s*$/;
const SPATIAL = /\b(within|near|nearest|nearby|around|km|kilometres?|kilometers?|metres?|meters?|along|hotspots?|on the map|map la|radius|distance|closest)\b|அருகில்|அருகே|அருகிலுள்ள|கிலோமீட்ட|கி\.மீ|வரைபடத்தில்|மேப்ல|சுற்றி/;
const WARD = /\bward (\d{1,3})\b|வார்டு (\d{1,3})|(\d{1,3}) வார்டு/;

function stateZoneName(world: World, n: number): string {
  return world.zones.find((z) => z.n === n)?.name ?? `Zone ${n}`;
}

/** "remind me friday at 10 to …": a local time from words, else null. */
export function parseWhen(text: string, now: number): Date | null {
  const t = text.toLowerCase();
  const d = new Date(now);
  let set = false;
  const rel = /\bin (\d+) (minute|minutes|min|mins|hour|hours|hr|hrs)\b/.exec(t);
  if (rel) return new Date(now + Number(rel[1]) * (rel[2].startsWith("h") ? 3_600_000 : 60_000));
  const days = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  const daysTa = ["ஞாயிறு", "திங்கள்", "செவ்வாய்", "புதன்", "வியாழன்", "வெள்ளி", "சனி"];
  const wd = days.findIndex((x) => t.includes(x));
  const wdTa = daysTa.findIndex((x) => text.includes(x));
  const w = wd >= 0 ? wd : wdTa;
  if (/\btomorrow\b|நாளை|naalaikku|nalaikku/.test(t)) { d.setDate(d.getDate() + 1); set = true; }
  else if (w >= 0) { const add = (w - d.getDay() + 7) % 7 || 7; d.setDate(d.getDate() + add); set = true; }
  else if (/\btoday\b|இன்று|innaiku/.test(t)) set = true;
  const hm = /\bat (\d{1,2})(?::(\d{2}))? ?(am|pm)?\b|(\d{1,2})(?::(\d{2}))? ?(am|pm)\b|(\d{1,2}) மணிக்கு/.exec(t);
  let h = 10, m = 0;
  if (hm) {
    h = Number(hm[1] ?? hm[4] ?? hm[7]);
    m = Number(hm[2] ?? hm[5] ?? 0);
    const ap = hm[3] ?? hm[6];
    if (ap === "pm" && h < 12) h += 12;
    if (ap === "am" && h === 12) h = 0;
    if (!ap && h >= 1 && h <= 7) h += 12; // "at 5": office hours, so 5 pm
    set = true;
  }
  if (!set) return null;
  d.setHours(h, m, 0, 0);
  if (d.getTime() <= now) d.setDate(d.getDate() + 1);
  return d;
}

/** The text after a leading command phrase, from the original words (keeps the Collector's own casing). */
function rest(heard: string, lead: RegExp): string {
  return heard.replace(lead, "").replace(/^[\s,:–-]+/, "").trim();
}

// ------------------------------------------------------------------ the engine --

export interface UnderstandOpts {
  /** the recogniser's confidence (0–1); typed text is 0.95 */
  speechConf?: number;
}

export function understand(input: string, state: ScreenState, world: World, opts: UnderstandOpts = {}): Understood {
  let heard = input.trim();
  for (const [from, to] of Object.entries(world.aliases ?? {})) {
    if (from && heard.toLowerCase().includes(from.toLowerCase())) heard = heard.replace(new RegExp(from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "ig"), to);
  }
  const lang: Lang = detectLang(heard);
  const n = normalise(heard);
  const s = n.text;
  const tk = n.tokens;
  const speech = opts.speechConf ?? 0.95;
  const done = (steps: Step[], match = 1, context = 1, margin = 1, note?: Bilingual): Understood =>
    ({ kind: "do", steps, confidence: round(0.3 * speech + 0.3 * match + 0.2 * context + 0.2 * margin), lang, heard, by: "rules", note });
  if (!tk.length) return { kind: "unknown", lang, heard, suggestions: SUGGEST };

  // ---------------------------------------------------- whole-sentence commands --
  if (/^(turn off|switch off|off|shut down|good ?bye|bye|off pannu|ஆஃப்|அணை)$/.test(s)) return done([{ a: "off" }]);
  if (/^(stop|wait|cancel|enough|hold on|pause|stop talking|stop it|be quiet|நிறுத்து|போதும்|nirutthu|niruthu|podhum|wait pannu)$/.test(s)) return done([{ a: "stop" }]);
  if (/^(stop listening)$/.test(s)) return done([{ a: "handsfree", on: false }]);
  if (/(stay|keep) listening|hands ?free|continuous listening/.test(s)) return done([{ a: "handsfree", on: true }]);
  if (/^(help|what can you do|commands|what can i say|உதவி|udhavi)$/.test(s)) return done([{ a: "help" }]);
  if (/what did you (just )?do|என்ன செஞ்ச|enna senja|what happened just now|what was that/.test(s)) return done([{ a: "whatDid" }]);
  if (/what am i (looking at|seeing)|where am i|what is on (the )?screen|whats on (the )?screen|என்ன பார்க்கிறேன்|enna paakuren|இந்தத் திரை என்ன/.test(s)) return done([{ a: "whereAmI" }]);
  if (/^(repeat|again|say (that |it )?again|once more|repeat that|marupadi|மறுபடி|மீண்டும் சொல்|thirumba sollu)$/.test(s)) return done([{ a: "repeat" }]);
  if (/^explain|explain (this|that|the) (chart|graph|card|number)|what does this (chart|graph|card) (show|mean)|விளக்கு|vilakku|vilakkam/.test(s)) return done([{ a: "explain" }]);

  // undo / go back (but "go back to the briefing" is navigation)
  const undo = /^(undo|go back|back|revert|previous view|pazhaya padi|பழையபடி மாத்து|பழையபடி|திரும்பிப் போ|go back pannu|undo pannu)(?=\s|$)/.exec(s);
  if (undo && !mentions(tk, PAGE_WORDS, new Array(tk.length).fill(false)).length) {
    const num = tk.map(Number).find((x) => Number.isInteger(x) && x > 0 && x <= 20);
    return done([{ a: "undo", n: num ?? 1 }]);
  }

  // show numbers / names, click, scroll, typing
  if (/(show|kaatu|display)( the)? numbers|numbers (kaatu|show)|எண்களைக் காட்டு|எண்கள் காட்டு|எண்களை காட்டு/.test(s)) return done([{ a: "numbers", show: true, names: false }]);
  if (/(hide|remove|clear)( the)? (numbers|names)|numbers (off|hide)|எண்களை மறை/.test(s)) return done([{ a: "numbers", show: false, names: false }]);
  if (/(show|kaatu)( the)? names|names kaatu|பெயர்களைக் காட்டு/.test(s)) return done([{ a: "numbers", show: true, names: true }]);
  const click = /^(click|press|tap|select|hit|அழுத்து|கிளிக்)( on)? (.+)$/.exec(s);
  if (click) {
    const target = click[3].trim();
    return /^\d{1,3}$/.test(target) ? done([{ a: "click", n: Number(target), name: null }]) : done([{ a: "click", n: null, name: rest(heard, /^\s*(click|press|tap|select|hit|அழுத்து|கிளிக்)(\s+on)?\s*/i) }]);
  }
  if (state.numbers && /^\d{1,3}$/.test(s)) return done([{ a: "click", n: Number(s), name: null }]);
  const scroll = /^(scroll|go|move|page)? ?(down|up)$|^scroll (down|up)( a bit| more)?$|^(scroll to (the )?)?(top|bottom)$|^(கீழே|மேலே)( போ| நகர்த்து)?$/.exec(s);
  if (scroll) {
    const dir = (scroll[2] ?? scroll[3] ?? scroll[7] ?? (scroll[8] === "கீழே" ? "down" : "up")) as "up" | "down" | "top" | "bottom";
    return done([{ a: "scroll", dir }]);
  }
  if (/^(type|write|டைப்|dictate)\s+/.test(s)) return done([{ a: "type", text: rest(heard, /^\s*(type|write|டைப்|dictate)\s+/i) }]);
  if (/^clear (that|text|the text|the box|it|this box)$/.test(s)) return done([{ a: "clearText" }]);

  // memory
  if (/what do you remember|show (my )?memory|memory kaatu|உனக்கு என்ன நினைவிருக்கு|என்ன நினைவிருக்கு|நினைவுகளைக் காட்டு/.test(s)) return done([{ a: "recall" }]);
  if (/^forget (everything|all|all of it)$|எல்லாத்தையும் மற|ellaam marandhudu/.test(s)) return done([{ a: "forget", all: true }]);
  if (/^forget (that|it|this|the last one)$|^மறந்துடு$|^மறந்துவிடு$|^marandhudu$/.test(s)) return done([{ a: "forget", all: false }]);
  if (/^(remember|note|make a note)( that)?\s+/.test(s)) {
    const text = rest(heard, /^\s*(remember|note|make a note)(\s+that)?\s*/i);
    return text ? done([{ a: "remember", text }]) : { kind: "unknown", lang, heard, suggestions: SUGGEST };
  }
  const nyabagam = /^(.+?)\s*(nu |என்று |என )?(நினைவில் வை|நினைவில் வச்சுக்க|ஞாபகம் வச்சுக்க|nyabagam vechuko|nyabagam vachuko)$/.exec(heard.trim());
  if (nyabagam) return done([{ a: "remember", text: nyabagam[1].trim() }]);
  if (/^remind me\b|நினைவூட்டு|nyabagapaduthu/.test(s)) {
    const m = /^remind me (?:(.+?) )?to (.+?)(?: (on .+|at .+|tomorrow.*|today.*|in \d+ .+))?$/i.exec(heard.trim());
    const what = (m?.[2] ?? rest(heard, /^\s*remind me\s*/i)).trim();
    const whenText = `${m?.[1] ?? ""} ${m?.[3] ?? ""} ${heard}`;
    const at = parseWhen(whenText, state.now);
    const when = at ?? (() => { const d = new Date(state.now); d.setDate(d.getDate() + 1); d.setHours(10, 0, 0, 0); return d; })();
    return done([{ a: "remind", text: what, at: when.toISOString() }], 1, at ? 1 : 0.8, 1,
      at ? undefined : b("No time heard: set for tomorrow at 10:00.", "நேரம் கேட்கவில்லை: நாளை காலை 10 மணிக்கு வைத்தேன்."));
  }

  // approvals
  const confirm = /^(yes )?(confirm|உறுதி|uruthi|உறுதிப்படுத்து)( send| pannu| செய்)?( (\d{1,2}))?( (pannu|செய்))?$/.exec(s);
  if (confirm) return done([{ a: "confirm", n: confirm[5] ? Number(confirm[5]) : null }]);
  if (/^(send|send it|send them|send all|send all of them|send pannu|send pannunga|anuppu|அனுப்பு|அனுப்புங்க)( (it|them|all))?$/.test(s)) return done([{ a: "send" }]);

  // missions
  if (/morning brief|brief me|today'?s brief|todays brief|read (me )?(the |todays |today'?s )?brief|இன்றைய சுருக்கம்|சுருக்கம் சொல்|brief sollu|innaiku brief/.test(s)) return done([{ a: "mission", name: "brief" }]);
  if (/(prepare|get ready|be ready|ready)( us)? for .*(rain|மழை)|rain readiness|rain check|heavy rain.*(ready|pannu|prepare)|(கனமழை|மழை).*(தயார்|ready)|mazhai.*ready|rain.*ready pannu/.test(s)) return done([{ a: "mission", name: "rain" }]);

  // settings
  if (/\b(dark (mode|theme)|night mode)\b|^dark$|டார்க் (மோட்|mode)|^dark mode on$/.test(s)) return done([{ a: "theme", theme: "dark" }]);
  if (/\b(light (mode|theme)|day mode)\b|^light$/.test(s)) return done([{ a: "theme", theme: "light" }]);
  const sayIn = /say (that|it) in (tamil|english)|(இதைத் )?தமிழில் சொல்|tamil la sollu|idha tamil la sollu/.exec(s);
  if (sayIn) return done([{ a: "lang", lang: sayIn[2] === "english" ? "en" : "ta" }, { a: "repeat" }]);
  if (/^(speak|talk|reply|answer)( in)? tamil$|^tamil$|^தமிழ்$|tamil (la )?pesu|தமிழில் பேசு/.test(s)) return done([{ a: "lang", lang: "ta" }]);
  if (/^(speak|talk|reply|answer)( in)? english$|^english$|ஆங்கிலத்தில் பேசு|english la pesu/.test(s)) return done([{ a: "lang", lang: "en" }]);
  if (/^(mute|silent|silence|visual only|text only|no voice|don'?t speak|dont speak|சத்தம் வேண்டாம்|பேச வேண்டாம்)$/.test(s)) return done([{ a: "mode", mode: "visual" }]);
  if (/^(unmute|voice on|speak|talk to me|voice mode|பேசு)$/.test(s)) return done([{ a: "mode", mode: "voice" }]);
  if (/quiet mode|do not disturb|^dnd$|disturb pannadhe/.test(s)) return done([{ a: "mode", mode: "quiet" }]);
  if (/\b(slower|slow down|speak slowly)\b|மெதுவா|methuva/.test(s)) return done([{ a: "speed", faster: false }]);
  if (/\b(faster|speed up|speak faster)\b|வேகமா|vegama/.test(s)) return done([{ a: "speed", faster: true }]);

  // workspaces
  const saveAs = /^save (this |the view |this view |the screen |it )?(as )?(.+)$/.exec(s);
  if (saveAs && saveAs[3] && !/^(it|this)$/.test(saveAs[3])) {
    return done([{ a: "workspace", op: "save", name: cleanName(rest(heard, /^\s*save\s+(this\s+view\s+|the\s+view\s+|this\s+|the\s+screen\s+|it\s+)?(as\s+)?/i)) }]);
  }
  const saveTa = /^(?:idha |இதை )?['‘]?(.+?)['’]?\s*(?:nu save pannu|என்று சேமி|ன்னு சேமி)$/i.exec(heard.trim());
  if (saveTa) return done([{ a: "workspace", op: "save", name: cleanName(saveTa[1]) }]);
  const openWs = /^open (my )?(workspace|saved view|view) (.+)$|^open (my )?(.+) (workspace|view)$/.exec(s);
  if (openWs) return done([{ a: "workspace", op: "open", name: cleanName(openWs[3] ?? openWs[5] ?? "") }]);

  // refusals: there is no such action, and nothing changes
  if (DESTRUCTIVE.test(s) && !/^clear/.test(s)) {
    return { kind: "refuse", lang, heard, why: b("I can't delete anything. Nothing was changed.", "என்னால் எதையும் நீக்க முடியாது. எதுவும் மாற்றப்படவில்லை.") };
  }

  // Ask District IQ, by name
  const askDiq = /^(ask|ask district iq|ask the assistant|ask the chatbot)( to| about| whether| if)?\s+(.+)$/.exec(s);
  if (askDiq && !/^(ask )?the map\b/.test(askDiq[3])) {
    return done([{ a: "ask", q: rest(heard, /^\s*(ask\s+district\s+iq|ask\s+the\s+assistant|ask\s+the\s+chatbot|ask)(\s+(to|about|whether|if))?\s*/i) }]);
  }
  const kelu = /(district iq|டிஸ்ட்ரிக்ட் ஐகியூ)[\w\s-]*?(kitta|கிட்ட|விடம்)?\s*(kelu|கேள்)/i.exec(heard);
  if (kelu) {
    const q = heard.replace(kelu[0], "").replace(/^[\s,.-]+|[\s,.-]+$/g, "");
    if (q) return done([{ a: "ask", q }]);
  }

  // ---------------------------------------------------- questions and readings --
  const resv = mentions(tk, reservoirDict(world), new Array(tk.length).fill(false));
  if (resv.length) return done([{ a: "read", what: "reservoir", name: resv[0].value }], resv[0].score);
  if (/\b(reservoirs?|lake levels?|water levels?|storage)\b|ஏரிகள்|நீர்மட்டம்|நீர் இருப்பு|eri level/.test(s) && !SPATIAL.test(s)) {
    return done([{ a: "read", what: "reservoir", name: null }]);
  }
  if (/how much rain|\brainfall\b|rain (today|in the last|last 24)|(evlo|evvalavu) (rain|mazhai)|எவ்வளவு மழை|மழை எவ்வளவு|மழை அளவு/.test(s)) return done([{ a: "read", what: "rain", name: null }]);
  if (/air quality|\baqi\b|காற்றின் தரம்|காற்று தரம்|air (epdi|eppadi)/.test(s)) {
    const z = lastStanding(mentions(tk, zoneDict(world), new Array(tk.length).fill(false)), tk);
    const steps: Step[] = [{ a: "read", what: "air", name: z ? stateZoneName(world, z.value) : null }];
    return done(steps);
  }
  const worstQ = /(which|எந்த|edhu|ethu).*(zone|மண்டலம்).*(worst|மோசம்|most|அதிகம்|adhigam)|worst zone (edhu|which|ethu)\??$|^worst zone\?$|எந்த மண்டலம் (ரொம்ப )?மோசம்/.test(s);
  if (worstQ) return done([{ a: "read", what: "worstZone", name: null }]);
  const ward = WARD.exec(s);
  if (SPATIAL.test(s) || ward || /what is (this|that) place|what'?s (here|there)/.test(s)) {
    return done([{ a: "map", q: heard }], 1, 1, 1);
  }
  if (/^(zoom|zoom in|zoom there|zoom in there|zoom here|idha zoom pannu|zoom pannu|அங்கே பெரிதாக்கு|பெரிதாக்கு)$|^zoom (in )?(there|here|to it|on it)$/.test(s)) {
    return done([{ a: "zoom", target: state.incident ? null : state.lastPlace }], 1, state.incident || state.lastPlace ? 0.9 : 0.6);
  }

  // ---------------------------------------------------- the bag of slots --
  const taken: boolean[] = new Array(tk.length).fill(false);
  const steps: Step[] = [];
  let match = 1;
  let context = 1;
  let margin = 1;
  let note: Bilingual | undefined;

  // clear filters (before the slots, which would read "all" as nothing)
  const clearAll = /clear (all )?(the )?filters?|^reset( filters)?$|show everything|district ?wide|all of chennai|எல்லா வடிகட்டிகளையும் நீக்கு|வடிகட்டிகளை நீக்கு|filters? ellaam clear|filters? clear pannu|^எல்லாம் காட்டு$|^clear all$|^clear$/.test(s);
  const view: View = {};
  if (clearAll) { view.zone = null; view.dept = null; view.cat = null; view.taluk = null; view.sev = null; }
  if (/\b(all|every) zones?\b|எல்லா மண்டலங்களும்/.test(s) && !/list/.test(s)) view.zone = null;
  if (/\b(all|every) departments?\b|எல்லா துறைகளும்/.test(s) && !/list/.test(s)) view.dept = null;
  if (/\b(all|every) categories\b|all types\b/.test(s)) view.cat = null;
  if (/\ball severities\b|any severity/.test(s)) view.sev = null;

  // pages
  const pageM = lastStanding(mentions(tk, PAGE_WORDS, taken), tk);
  // periods (words like "last month" carry the comparison: the console shows the change against the previous period)
  const perM = lastStanding(mentions(tk, PERIOD_WORDS, taken), tk);
  // zones by number: "zone 7", "7th zone", "மண்டலம் 7", "ஏழாவது மண்டலம்"
  const zoneNumMentions: Mention<number>[] = [];
  tk.forEach((tok, i) => {
    if (!/^(zone|zones|மண்டலம்|மண்டலத்துக்கு|மண்டலத்தை|மண்டலத்தில்|மண்டலத்தின்|ஜோன்)$/.test(tok) && !tok.startsWith("மண்டல")) return;
    for (const j of [i + 1, i - 1]) {
      if (j >= 0 && j < tk.length && /^\d{1,3}$/.test(tk[j]) && !taken[j]) {
        const v = Number(tk[j]);
        if (v >= 1 && v <= 15) { zoneNumMentions.push({ value: v, start: Math.min(i, j), end: Math.max(i, j) + 1, score: 1 }); taken[i] = taken[j] = true; }
        return;
      }
    }
  });
  // names: taluk words win where the sentence says "taluk" or the map is in taluk mode
  const talukWord = /\btaluks?\b|வட்டம்|வட்டத்தை|வட்டத்தைக்|தாலுகா/.test(s);
  const preferTaluk = talukWord || state.mapMode === "taluks";
  const zoneNames = mentions(tk, zoneDict(world), preferTaluk ? new Array(tk.length).fill(false) : taken);
  const talukNames = mentions(tk, talukDict(world), preferTaluk ? taken : new Array(tk.length).fill(false));
  let zoneMs = [...zoneNumMentions, ...zoneNames];
  let talukMs = talukNames;
  if (preferTaluk) {
    // a name both zone and taluk (Ambattur, Alandur…) goes to the taluk
    zoneMs = zoneMs.filter((z) => !talukMs.some((t) => t.start === z.start));
  } else {
    talukMs = talukMs.filter((t) => !zoneMs.some((z) => z.start === t.start));
  }
  for (const m of [...zoneMs, ...talukMs]) for (let k = m.start; k < m.end; k++) taken[k] = true;
  // departments and categories (one word may be both: ask once)
  const deptAll = mentions(tk, deptDict(world), [...taken]);
  const catAll = mentions(tk, catDict(world), [...taken]);
  // "Metro Water" (a department) holds the word "water" (a category): the longer phrase wins the overlap
  const overlaps = (a: Mention<string>, c: Mention<string>) => a.start < c.end && c.start < a.end;
  const len = (m: Mention<string>) => m.end - m.start;
  const deptMs = deptAll.filter((d) => !catAll.some((c) => overlaps(d, c) && len(c) > len(d)));
  const catMs = catAll.filter((c) => !deptAll.some((d) => overlaps(d, c) && len(d) > len(c)));
  const clash = deptMs.find((d) => catMs.some((c) => c.start === d.start && c.end === d.end));
  if (clash) {
    const c = catMs.find((x) => x.start === clash.start)!;
    const deptName = world.depts.find((d) => d.code === clash.value)?.name ?? clash.value;
    const catLabel = world.cats.find((x) => x.code === c.value)?.label ?? c.value;
    return {
      kind: "ask", lang, heard,
      question: b(`${deptName} or ${catLabel}?`, `${deptName} அல்லது ${catLabel}?`),
      choices: [
        { label: b(deptName, deptName), steps: [{ a: "view", view: { dept: clash.value } }] },
        { label: b(catLabel, catLabel), steps: [{ a: "view", view: { cat: c.value } }] }
      ]
    };
  }
  for (const m of [...deptMs, ...catMs]) for (let k = m.start; k < m.end; k++) taken[k] = true;
  // severity
  const sevM = lastStanding(mentions(tk, SEV_WORDS, taken), tk);

  const zoneM = lastStanding(zoneMs, tk);
  const talukM = lastStanding(talukMs, tk);
  const deptM = lastStanding(deptMs, tk);
  const catM = lastStanding(catMs, tk);
  if (zoneM) { view.zone = zoneM.value; match = Math.min(match, zoneM.score); }
  if (talukM) { view.taluk = talukM.value; match = Math.min(match, talukM.score); }
  if (deptM) { view.dept = deptM.value; match = Math.min(match, deptM.score); }
  if (catM) { view.cat = catM.value; match = Math.min(match, catM.score); }
  if (sevM) view.sev = sevM.value;

  // places that are neither zone nor taluk: show them on the map
  if (!zoneM && !talukM) {
    const placeDict: [string, string][] = world.places.flatMap((p) => [p.name, ...p.aliases].map((a) => [a.toLowerCase(), p.name] as [string, string]));
    const place = lastStanding(mentions(tk, placeDict, [...taken]), tk);
    if (place && !deptM && !catM && !pageM) {
      const pl = world.places.find((p) => p.name === place.value);
      if (pl?.zone) view.zone = pl.zone;
      else return done([{ a: "map", q: heard }], place.score);
    }
  }

  // the worst zone ("take me to the worst zone")
  if (/worst zone|மோசமான மண்டலம்|ரொம்ப மோசமான மண்டலத்துக்கு|worst zone ku/.test(s) && view.zone === undefined) {
    const top = world.zoneRank?.[0];
    if (top) { view.zone = top; context = 0.9; }
  }

  // "change filter to 7", or a bare number
  const bare = tk.map((t, i) => (/^\d{1,3}$/.test(t) && !taken[i] ? Number(t) : null)).filter((x): x is number => x != null);
  const filterWord = /\b(filter|filters)\b|வடிகட்டி/.test(s) || /^\d{1,3}$/.test(s);
  if (bare.length && filterWord && view.zone === undefined && !perM) {
    const v = bare[bare.length - 1];
    const recent = state.lastFilter && state.now - state.lastFilter.at <= 60_000 ? state.lastFilter.slot : null;
    if (v >= 1 && v <= 15) {
      view.zone = v;
      context = recent === "zone" ? 1 : 0.85;
      if (recent && recent !== "zone") {
        const what = recent === "sev" ? "a severity option" : recent === "period" ? "a period" : `a ${recent}`;
        note = b(`${v} is not ${what}, so I set Zone ${v}.`, `${v} ஒரு ${recent === "sev" ? "தீவிர நிலை" : "தேர்வு"} அல்ல; மண்டலம் ${v} அமைத்தேன்.`);
      }
    } else if (v <= 200) {
      return done([{ a: "map", q: `ward ${v}` }], 1, 0.7, 0.8, b(`There are 15 zones, so I looked for ward ${v} on the map.`, `15 மண்டலங்களே உள்ளன; வார்டு ${v} வரைபடத்தில் தேடினேன்.`));
    }
  }

  // map mode and layers
  let modeStep: Step | null = null;
  if (/(show|switch to|go to)?\s*taluks?( map| view| mode)?$|^taluk map|by taluks?|(^|\s)வட்டங்கள்|taluk wise/.test(s) && !talukM) modeStep = { a: "mapMode", mode: "taluks" };
  else if (/zone map|by zones|zones view|zone wise|^zones$|^show zones$/.test(s) && !zoneM) modeStep = { a: "mapMode", mode: "zones" };
  let layerStep: Step | null = null;
  if (/\blayers?\b|லேயர்|அடுக்கு|\bpins\b/.test(s)) {
    const lm = mentions(tk, LAYER_WORDS, new Array(tk.length).fill(false))[0];
    if (lm) {
      const off = /\b(off|hide|remove|turn off|switch off)\b|ஆஃப்|மறை/.test(s);
      const on = /\b(on|show|turn on|switch on|enable)\b|ஆன்|காட்டு/.test(s);
      layerStep = { a: "layer", layer: lm.value, on: off ? false : on ? true : null };
      // "severe" was a layer here, not a severity filter
      if (view.sev && lm.value === "severe") delete view.sev;
    }
  }

  // panels
  const panelM = lastStanding(mentions(tk, PANEL_WORDS, [...taken]), tk);

  // list items and drafts
  let itemStep: Step | null = null;
  if (/\b(next|adutha|aduthadhu)\b|அடுத்தது|அடுத்த/.test(s) && /\b(one|1|incident|item|thing)\b|அடுத்தது|adutha/.test(s)) itemStep = { a: "item", which: "next" };
  else if (/\b(previous|prev)\b|முந்தைய/.test(s) && /\b(one|1|incident|item)\b|முந்தைய/.test(s)) itemStep = { a: "item", which: "prev" };
  else if (/\b(the )?(worst|top|first)( one| incident| item| case| complaint)?\b|மோசமான|முதல் (நிகழ்வு|நிகழ்வைத்)|முதல்$/.test(s) && !/worst zone|மண்டல/.test(s)
    && (/\bopen\b|திற|kaatu|show|the worst|^worst|top incident|first incident|முதல்|மோசமான/.test(s))) itemStep = { a: "item", which: 1 };
  const ordinal = /\b(\d{1,2}) (one|incident|item|row)\b|number (\d{1,2})\b/.exec(s);
  if (!itemStep && ordinal) itemStep = { a: "item", which: Number(ordinal[1] ?? ordinal[3]) };
  const draft = /\bdraft\b|take action|\binstruction\b|உத்தரவு|நடவடிக்கை/.test(s);
  const closeAllM = /^close (all|everything)$|close all (panels|windows)|எல்லாவற்றையும் மூடு|ellaam close/.test(s);
  const closeOne = /^(close|close it|close this|close that|close the panel|close pannu|மூடு|இதை மூடு)$/.test(s);
  if (closeAllM || closeOne) return done([{ a: "close", all: closeAllM }]);

  // assemble: page first, then the filters as one transaction, then period, map, panel, item
  const hasView = Object.keys(view).length > 0;
  if (pageM) steps.push({ a: "page", page: pageM.value as PageKey });
  if (hasView) steps.push({ a: "view", view });
  if (perM) steps.push({ a: "period", period: perM.value as PeriodKey });
  if (modeStep) steps.push(modeStep);
  if (layerStep) steps.push(layerStep);
  if (panelM) steps.push({ a: "panel", panel: panelM.value as Panel });
  if (itemStep) steps.push(itemStep);
  if (draft) {
    if (!state.incident && !itemStep) {
      return { kind: "ask", lang, heard, question: b("Draft for which incident?", "எந்த நிகழ்வுக்கு?"),
        choices: [{ label: b("The top incident", "முதல் நிகழ்வு"), steps: [{ a: "item", which: 1 }, { a: "draft" }] },
          { label: b("Cancel", "வேண்டாம்"), steps: [] }] };
    }
    steps.push({ a: "draft" });
  }

  // a question nothing above could place goes to Ask District IQ, whose tools answer it
  if (QUESTION.test(s) && (!steps.length || (steps.length === 1 && steps[0].a === "view"))) {
    return done([{ a: "ask", q: heard }], 1, 1, 1);
  }
  if (!steps.length) return { kind: "unknown", lang, heard, suggestions: SUGGEST };
  // a filter word that matched only by a near spelling lowers the match score; ties lower the margin
  if (match < 1 && match >= 0.8) margin = 0.9;
  return done(steps, match, context, margin, note);
}

function cleanName(x: string): string {
  return x.replace(/^['"‘“]+|['"’”]+$/g, "").replace(/\s+/g, " ").trim().slice(0, 60);
}
const round = (x: number) => Math.round(x * 100) / 100;

export const SUGGEST = ["Zone 7", "Show the worst flooding", "This week", "Show numbers"];

/** What a step does, in a few words (the step chips and "what did you just do?"). */
export function describe(step: Step, world: World, lang: Lang = "en"): string {
  const ta = lang === "ta";
  switch (step.a) {
    case "page": return ta ? `பக்கம்: ${PAGE_TA[step.page]}` : PAGE_EN[step.page];
    case "period": return ta ? PERIOD_TA[step.period] : PERIOD_EN[step.period];
    case "view": {
      const v = step.view;
      const parts: string[] = [];
      if (v.zone !== undefined) parts.push(v.zone == null ? (ta ? "எல்லா மண்டலங்கள்" : "All zones") : `${ta ? "மண்டலம்" : "Zone"} ${v.zone} · ${stateZoneName(world, v.zone)}`);
      if (v.taluk !== undefined) parts.push(v.taluk == null ? (ta ? "எல்லா வட்டங்கள்" : "All taluks") : `${world.taluks.find((t) => t.code === v.taluk)?.name ?? v.taluk} ${ta ? "வட்டம்" : "taluk"}`);
      if (v.dept !== undefined) parts.push(v.dept == null ? (ta ? "எல்லா துறைகள்" : "All departments") : world.depts.find((d) => d.code === v.dept)?.name ?? v.dept);
      if (v.cat !== undefined) parts.push(v.cat == null ? (ta ? "எல்லா வகைகள்" : "All categories") : world.cats.find((c) => c.code === v.cat)?.label ?? v.cat);
      if (v.sev !== undefined) parts.push(v.sev == null ? (ta ? "எல்லா தீவிரங்கள்" : "All severities") : ta ? SEV_TA[v.sev] : v.sev);
      return parts.join(" · ");
    }
    case "mapMode": return step.mode === "taluks" ? (ta ? "வட்ட வரைபடம்" : "Taluk map") : (ta ? "மண்டல வரைபடம்" : "Zone map");
    case "layer": return `${ta ? "அடுக்கு" : "Layer"}: ${step.layer}${step.on === false ? (ta ? " அணைப்பு" : " off") : step.on ? (ta ? " இயக்கம்" : " on") : ""}`;
    case "panel": return ta ? PANEL_TA[step.panel] ?? step.panel : PANEL_EN[step.panel] ?? step.panel;
    case "close": return step.all ? (ta ? "எல்லாம் மூடு" : "Close all") : (ta ? "மூடு" : "Close");
    case "item": return step.which === "next" ? (ta ? "அடுத்தது" : "Next one") : step.which === "prev" ? (ta ? "முந்தையது" : "Previous one") : (ta ? `${step.which}-ஆவது` : step.which === 1 ? "Top incident" : `Item ${step.which}`);
    case "draft": return ta ? "உத்தரவு வரைவு" : "Draft action";
    case "zoom": return ta ? "அருகில் காட்டு" : "Zoom in";
    case "ask": return ta ? "District IQ-இடம் கேள்வி" : "Asked District IQ";
    case "map": return ta ? "வரைபடத்தில் கேள்வி" : "Asked the map";
    case "theme": return step.theme === "dark" ? (ta ? "இருண்ட தீம்" : "Dark theme") : (ta ? "வெளிர் தீம்" : "Light theme");
    case "lang": return step.lang === "ta" ? "தமிழ்" : "English";
    case "mode": return step.mode === "voice" ? (ta ? "குரல்" : "Voice") : step.mode === "visual" ? (ta ? "எழுத்து மட்டும்" : "Visual only") : (ta ? "அமைதி" : "Quiet");
    case "speed": return step.faster ? (ta ? "வேகமாக" : "Faster") : (ta ? "மெதுவாக" : "Slower");
    case "handsfree": return step.on ? (ta ? "தொடர்ந்து கேட்கிறேன்" : "Listening on") : (ta ? "கேட்பது நிறுத்தம்" : "Listening off");
    case "workspace": return step.op === "save" ? `${ta ? "சேமி" : "Save"}: ${step.name ?? ""}` : `${ta ? "திற" : "Open"}: ${step.name ?? ""}`;
    case "undo": return ta ? `${step.n} படி பின்` : step.n === 1 ? "Undo" : `Undo ${step.n}`;
    case "numbers": return step.show ? (step.names ? (ta ? "பெயர்கள்" : "Show names") : (ta ? "எண்கள்" : "Show numbers")) : (ta ? "எண்கள் மறை" : "Hide numbers");
    case "click": return `${ta ? "அழுத்து" : "Click"} ${step.n ?? step.name ?? ""}`;
    case "scroll": return `${ta ? "நகர்த்து" : "Scroll"} ${step.dir}`;
    case "type": return ta ? "தட்டச்சு" : "Type";
    case "clearText": return ta ? "அழி" : "Clear text";
    case "remember": return ta ? "நினைவில் வைத்தேன்" : "Remember";
    case "recall": return ta ? "நினைவுகள்" : "Memory";
    case "forget": return step.all ? (ta ? "எல்லாம் மற" : "Forget all") : (ta ? "மற" : "Forget");
    case "remind": return ta ? "நினைவூட்டல்" : "Reminder";
    case "send": return ta ? "அனுப்பு" : "Send";
    case "confirm": return `${ta ? "உறுதி" : "Confirm"} ${step.n ?? ""}`.trim();
    case "mission": return step.name === "brief" ? (ta ? "காலை சுருக்கம்" : "Morning brief") : (ta ? "மழை தயார்நிலை" : "Rain readiness");
    case "read": return step.what === "reservoir" ? (ta ? "ஏரி நிலவரம்" : "Reservoir level") : step.what === "rain" ? (ta ? "மழை அளவு" : "Rainfall") : step.what === "air" ? (ta ? "காற்றின் தரம்" : "Air quality") : (ta ? "மோசமான மண்டலம்" : "Worst zone");
    default: return step.a;
  }
}

export const PAGE_EN: Record<PageKey, string> = { overview: "Overview", briefing: "Briefing", trends: "Trends", environment: "Environment", studio: "Data Studio" };
export const PAGE_TA: Record<PageKey, string> = { overview: "முகப்பு", briefing: "சுருக்கம்", trends: "போக்குகள்", environment: "சுற்றுச்சூழல்", studio: "தரவு ஸ்டுடியோ" };
export const PERIOD_EN: Record<PeriodKey, string> = { daily: "Last 24 hours", weekly: "Last 7 days", monthly: "Last 30 days", quarterly: "Last 90 days" };
export const PERIOD_TA: Record<PeriodKey, string> = { daily: "கடந்த 24 மணி நேரம்", weekly: "கடந்த 7 நாட்கள்", monthly: "கடந்த 30 நாட்கள்", quarterly: "கடந்த 90 நாட்கள்" };
export const SEV_TA: Record<Sev, string> = { Severe: "கடுமையானவை", High: "அதிகம்", Medium: "நடுத்தரம்", Low: "குறைவு" };
const PANEL_EN: Partial<Record<Panel, string>> = { news: "Latest news", stories: "Developing stories", conflicts: "Reports that differ", gaps: "In the news, not in records",
  nextdoor: "Next door", markets: "Mandi prices", zones: "Zones", depts: "Departments", sources: "Data sources", review: "Locations to review",
  workspace: "Workspaces", export: "Export", customize: "Customize", palette: "Search", assistant: "Ask District IQ", map: "Ask the map", trail: "Audit trail", memory: "Memory" };
const PANEL_TA: Partial<Record<Panel, string>> = { news: "சமீபத்திய செய்திகள்", stories: "வளரும் செய்திகள்", conflicts: "முரண்படும் செய்திகள்", gaps: "செய்தியில் மட்டும்",
  nextdoor: "பக்கத்து மாவட்டங்கள்", markets: "சந்தை விலைகள்", zones: "மண்டலங்கள்", depts: "துறைகள்", sources: "தரவு மூலங்கள்", review: "சரிபார்க்க வேண்டிய இடங்கள்",
  workspace: "பணியிடங்கள்", export: "ஏற்றுமதி", customize: "தனிப்பயன்", palette: "தேடல்", assistant: "District IQ", map: "வரைபடக் கேள்வி", trail: "தணிக்கைப் பதிவு", memory: "நினைவு" };
