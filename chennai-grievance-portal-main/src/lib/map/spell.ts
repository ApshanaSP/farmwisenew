/**
 * Ask the Map's speller: a hurried officer's question with its slips read the way a person would, before the rules
 * read it. "hospitls near adayar" is read as "hospitals near Adyar", "garbge in velacheri" as "garbage in Velachery",
 * "tasmak" as "tasmac", "tnagar" as "T. Nagar". Words are corrected only toward the map's own words (layers,
 * categories, shapes, Tanglish) and its place names, and only when one reading is clearly best; when two are equally
 * close the officer is asked ("Did you mean …?") instead of the map guessing. Every correction is returned so the
 * answer can say it.
 *
 * Two measures: edit distance (a swapped pair counts once) and a sound key for Tamil names written in English (zh/l,
 * th/t, dh/d, sh/s, ch/c/k, ee/i, oo/u, y/i, doubled letters, a final e), so "velacheri", "mylapur", "nungambakam"
 * reach their names. Guards: three letters or fewer never change; four-letter words only by one dropped, added or
 * swapped letter; real English words, Tanglish words, street-name words and words glued to numbers are left alone
 * (a place's sound-alike excepted); a different first letter is allowed only for a sound-alike; a tie between a map
 * word and a place part or keyword goes to the map word. Tamil script: a word whose start is one letter off a Tamil
 * place or layer word (6+ code units) has that start corrected and its ending kept. Pure: the caller passes the lists.
 */
import { allowedEdits, editDistance } from "@/lib/assistant/fuzzy";

export interface Fix { from: string; to: string; label: string }
export interface Spelled {
  /** the question as read */
  text: string;
  fixes: Fix[];
  /** two or more equally close readings of one word: the whole question with each, to ask "Did you mean …?" */
  ask: { word: string; options: { label: string; text: string }[] } | null;
}

export interface SpellWords {
  /** the map's own words (lower case, Latin) */
  words: string[];
  /** more words, read only when no map word or place is as close (the console's category keywords) */
  extra?: string[];
  /** place names as written ("Adyar", "Anna Nagar", "T. Nagar"): each word of them is a target, a one-word name its own label */
  places: string[];
  /** zone and taluk names: another one-word place one letter or a sound away is read as this name ("Adayar" is Adyar, Zone 13) */
  areas?: string[];
  /** words never corrected: English, Tanglish */
  isKnown: (w: string) => boolean;
  /** words corrected only toward a place one letter or a sound away (GCC street-name words: "adayar" in a street's name is still Adyar) */
  soft?: (w: string) => boolean;
  /** Tamil targets: place names and layer words in Tamil script */
  tamil?: string[];
}

/** A sound key for Tamil names written in English: letters people swap for the same sound are made one. */
export function soundKey(w: string): string {
  let s = w.toLowerCase().replace(/[^a-z]/g, "");
  s = s.replace(/zh/g, "l").replace(/sh/g, "s").replace(/th/g, "t").replace(/dh/g, "d").replace(/ph/g, "f").replace(/bh/g, "b").replace(/kh/g, "k").replace(/gh/g, "g")
    .replace(/ch/g, "c").replace(/ck/g, "k").replace(/q/g, "k").replace(/c/g, "k").replace(/w/g, "v").replace(/z/g, "s")
    .replace(/ee|ii|ie|ey/g, "i").replace(/oo|ou/g, "u").replace(/aa/g, "a").replace(/(?<=.)y/g, "i").replace(/(.)\1+/g, "$1");
  if (s.length > 4) s = s.replace(/e$/, "");
  return s;
}

/**
 * A sound key for Tamil script: the letters people mix up made one (ற/ர, ள/ழ/ல, ண/ன/ந, ஷ/ஜ/ச), a doubled consonant
 * made single (மயிலாப்பூர், மயிலாபூர்), and the final dead consonant or short u dropped (அடையாறு, அடையார்).
 */
export function tamilKey(w: string): string {
  return w.replace(/ற/g, "ர").replace(/[ளழ]/g, "ல").replace(/[ணன]/g, "ந").replace(/[ஷஜ]/g, "ச").replace(/(.)்\1/g, "$1").replace(/[்ு]$/, "");
}

const isTamil = (w: string) => /^[஀-௿]+$/.test(w);
/** Tamil words a map question is made of (areas, near, time, asking): never corrected toward a place, whatever their spelling is close to. */
const TA_COMMON = ["மண்டல", "வார்டு", "வட்ட", "பகுதி", "மாவட்ட", "அருகே", "அருகில்", "அருகாமை", "பக்கத்", "சுற்றி", "உள்ள", "இல்லாத", "எத்தனை", "எந்த", "எங்கே", "என்ன",
  "இந்த", "அந்த", "இன்று", "நேற்று", "வாரம்", "வாரத்", "மாதம்", "மாதத்", "கடந்த", "புகார்", "சம்பவ", "திறந்த", "கடுமையான", "அதிக", "குறைந்த", "தொலைவ", "மீட்டர்", "கி.மீ",
  "காட்டு", "சொல்", "வரைபட", "மேல்", "க்குள்", "வாரியாக", "அனைத்து", "எல்லா", "மற்றும்", "அல்லது", "காலக்கெடு"];
const plain = (s: string) => s.toLowerCase().replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();
/** Shorthand people type on a phone, read as the word ("nr" near, "arnd" around, "hosp" hospital). */
const SHORT: Record<string, string> = { nr: "near", arnd: "around", abt: "about", hosp: "hospital", hosps: "hospitals", govt: "government", dept: "department",
  stn: "station", stns: "stations", rly: "railway", wrt: "about", plz: "please", pls: "please", bw: "between", btw: "between", cmplnt: "complaint", cmplnts: "complaints",
  compl: "complaints", acc: "accidents", wk: "week", mth: "month", yday: "yesterday", tdy: "today", wat: "what", wht: "what", hw: "how", whr: "where" };

export function makeSpeller(src: SpellWords) {
  // target word -> its label (a one-word place's name as written, or the word itself); tier 0 map words, 1 place parts, 2 keywords
  const label = new Map<string, string>();
  const tier = new Map<string, number>();
  for (const w of src.words) if (w.length >= 3) { label.set(w, w); tier.set(w, 0); }
  for (const name of src.places) {
    const parts = name.split(/[^A-Za-z]+/).filter((p) => p.length >= 4);
    for (const p of parts) { const k = p.toLowerCase(); if (!label.has(k)) { label.set(k, parts.length === 1 ? p : k); tier.set(k, 1); } }
  }
  for (const w of src.extra ?? []) if (w.length >= 4 && !label.has(w)) { label.set(w, w); tier.set(w, 2); }
  // the shorter word "and", "the" is never a target: a four-letter slip is read only toward a word of four or more
  const targets = [...label.keys()].filter((t) => t.length >= 4);
  const known = (w: string) => label.has(w) || src.isKnown(w);
  const tamil = [...new Set(src.tamil ?? [])].filter((t) => t.length >= 5).map((t) => ({ t, k: tamilKey(t) })).sort((a, b) => b.k.length - a.k.length);
  // a one-word place spelt like a zone or taluk ("adayar", "Adyar"): the zone's name
  const areaOf = new Map<string, string>();
  for (const a of src.areas ?? []) if (/^[A-Za-z]+$/.test(a)) {
    const ak = a.toLowerCase();
    for (const [k, t] of label) if (k !== ak && t !== k && tier.get(k) === 1 && k[0] === ak[0] && (soundKey(k) === soundKey(ak) || editDistance(k, ak, 1) === 1)) areaOf.set(k, ak);
  }
  // words that start or end a place name of two or more words ("salai" in Anna Salai): may stand in a name though they are map words
  // (only names written as words: "Anna Nagar(Zone 7)", an office's label, is no name to read a slip as; area words never stand in a name)
  const plainName = (n: string) => /^[A-Za-z][A-Za-z .'-]*$/.test(n.trim());
  const AREA_WORDS = new Set(["zone", "zones", "ward", "wards", "taluk", "taluks", "district", "near", "within"]);
  const nameWords = new Set(src.places.filter((n) => /\s/.test(n.trim()) && plainName(n)).flatMap((n) => n.toLowerCase().split(/[^a-z]+/)).filter((x) => x.length >= 4 && !AREA_WORDS.has(x)));
  // place names of two or more words as one run of letters ("tnagar", "annanagar")
  const joined = new Map<string, string>();
  for (const name of src.places) {
    if (!plainName(name)) continue;
    const j = name.toLowerCase().replace(/[^a-z]/g, "");
    if (j.length >= 6 && /[^A-Za-z]/.test(name.trim()) && !joined.has(j)) joined.set(j, name);
  }
  // one-word places by their sound ("velacheri" and "Velachery"); a sound two places share is no one's
  const placeSound = new Map<string, string>();
  for (const [k, t] of label) if (tier.get(k) === 1 && t !== k) { const s = soundKey(k); placeSound.set(s, placeSound.has(s) && placeSound.get(s) !== k ? "" : k); }
  const onePlace = [...label].filter(([k, t]) => tier.get(k) === 1 && t !== k).map(([k]) => k);

  /** The closest targets to one word, with their score (lower is closer); [] when none is close enough. */
  function candidates(w: string): { t: string; score: number }[] {
    const max = w.length <= 4 ? 1 : Math.min(3, allowedEdits(w.length));
    const k = soundKey(w);
    const out: { t: string; score: number }[] = [];
    for (const t of targets) {
      if (Math.abs(t.length - w.length) > max + 1) continue;
      const raw = editDistance(w, t, max + 1);
      const sound = k === soundKey(t) && w.length >= 5;
      if (!sound) {
        if (raw > max) continue;
        // people rarely mistype the first letter: a different one costs the whole allowance
        if (t[0] !== w[0] && raw > 1) continue;
        // four letters: only a dropped, added or swapped letter ("hosp" is not "hope")
        if (w.length <= 4 && t.length === w.length && !swapped(w, t)) continue;
        if (w.length <= 4 && t[0] !== w[0]) continue;
      }
      out.push({ t, score: sound ? Math.min(raw, 0.5) : raw });
    }
    if (!out.length) return [];
    const best = Math.min(...out.map((c) => c.score));
    const top = out.filter((c) => c.score === best);
    const t0 = Math.min(...top.map((c) => tier.get(c.t) ?? 2));
    return top.filter((c) => (tier.get(c.t) ?? 2) === t0);
  }

  /** A Tamil word whose start sounds like a place or layer word (by tamilKey), or is one letter off a long one: that start corrected, its ending kept. */
  function fixTamil(w: string): string | null {
    for (const { t } of tamil) if (w.startsWith(t)) return null;
    // the question's own words ("மண்டலம்" zone, "அருகே" near, "இந்த" this) are never a misspelt place
    for (const c of TA_COMMON) if (w.startsWith(c)) return null;
    const hits: { t: string; k: string; cut: number }[] = [];
    for (const { t, k } of tamil) {
      let cut = -1;
      for (let c = 3; c <= w.length; c++) if (tamilKey(w.slice(0, c)) === k) { cut = c; while (cut < w.length && tamilKey(w.slice(0, cut + 1)) === k) cut++; break; }
      if (cut < 0 && t.length >= 7) for (const c of [t.length - 1, t.length, t.length + 1]) if (c <= w.length && editDistance(w.slice(0, c), t, 1) === 1) { cut = c; break; }
      if (cut >= 0) hits.push({ t, k, cut });
    }
    if (!hits.length) return null;
    // the longest word wins ("மருத்துவமனைகள்" over "மருத்துவ"); two different words as long are a tie: left as typed
    const top = Math.max(...hits.map((h) => h.k.length));
    const best = hits.filter((h) => h.k.length === top);
    return new Set(best.map((h) => h.t)).size === 1 ? best[0].t + w.slice(best[0].cut) : null;
  }

  /** Place names typed as one word or with one part off: "tnagar", "anna nager", "besant nager". */
  function phrases(text: string, fixes: Fix[]): string {
    const words = [...text.matchAll(/[A-Za-z.]+/g)];
    const cut: { s: number; e: number; name: string; from: string }[] = [];
    for (let i = 0; i < words.length; i++) {
      for (let n = Math.min(3, words.length - i); n >= 1; n--) {
        const span = words.slice(i, i + n);
        // map words ("near", "banks") are never part of a name, unless names use them too ("Anna Salai")
        if (span.some((m) => { const x = m[0].toLowerCase().replace(/\./g, ""); return tier.get(x) === 0 && !nameWords.has(x); })) continue;
        const s = span[0].index!, e = span[n - 1].index! + span[n - 1][0].length;
        if (/[^A-Za-z. ]/.test(text.slice(s, e))) continue;
        const j = text.slice(s, e).toLowerCase().replace(/[^a-z]/g, "");
        if (j.length < 6) continue;
        // words that are all map words or English ("government hospitals") are read as typed, never as a place spelt like them
        if (span.every((m) => { const x = m[0].toLowerCase().replace(/\./g, ""); return tier.get(x) === 0 || (src.isKnown(x) && x.length >= 4); })) continue;
        let hit = joined.get(j) ?? null;
        if (hit && plain(hit) === plain(text.slice(s, e))) break; // written right
        // a name one or two letters off, each word of three letters or more ("Velachery la" is not "Velachery Lake")
        if (!hit && n >= 2 && span.every((m) => m[0].replace(/\./g, "").length >= 3)) {
          const max = Math.min(2, allowedEdits(j.length) - 1);
          const near = [...joined.entries()].filter(([k]) => k[0] === j[0] && Math.abs(k.length - j.length) <= max && editDistance(k, j, max) <= max);
          const names = [...new Set(near.map(([, v]) => v))];
          if (names.length === 1) hit = names[0];
        }
        if (hit) { cut.push({ s, e, name: hit, from: text.slice(s, e) }); i += n - 1; break; }
      }
    }
    for (const c of cut.reverse()) { text = text.slice(0, c.s) + c.name + text.slice(c.e); fixes.unshift({ from: c.from, to: c.name.toLowerCase(), label: c.name }); }
    return text;
  }

  return function spell(text0: string): Spelled {
    const fixes: Fix[] = [];
    let ask: Spelled["ask"] = null;
    const text = phrases(text0, fixes);
    const out = text.replace(/[A-Za-z]+|[஀-௿]+/g, (tok, at: number) => {
      if (isTamil(tok)) {
        const to = tok.length >= 5 ? fixTamil(tok) : null;
        if (to && to !== tok) { fixes.push({ from: tok, to, label: to }); return to; }
        return tok;
      }
      const w = tok.toLowerCase();
      const short = SHORT[w];
      if (short && !/[\d-]/.test(text[at - 1] ?? "")) { fixes.push({ from: tok, to: short, label: short }); return short; }
      // three letters: only one dropped letter of a four-letter map word ("zon" zone, "wrd" ward), never a changed one
      if (w.length === 3 && !known(w) && !/[\d-]/.test(text[at - 1] ?? "")) {
        const four = targets.filter((t) => t.length === 4 && tier.get(t) === 0 && t[0] === w[0] && editDistance(w, t, 1) === 1);
        if (four.length === 1) { fixes.push({ from: tok, to: four[0], label: four[0] }); return four[0]; }
      }
      if (w.length <= 3) return tok;
      // a place spelt like a zone or taluk is that zone's name ("adayar" is Adyar)
      const area = areaOf.get(w);
      if (area) { fixes.push({ from: tok, to: area, label: label.get(area) ?? area }); return label.get(area) ?? area; }
      // a word of a longer name ("Velacheri Lake") that sounds like a one-word place is that place ("velacheri" is Velachery)
      // or is one letter off one ("adayar" in "Adayar Ananda Bhavan" is still Adyar)
      let ps0 = w.length >= 5 && tier.get(w) === 1 && label.get(w) === w ? placeSound.get(soundKey(w)) : undefined;
      if (!ps0 && w.length >= 5 && tier.get(w) === 1 && label.get(w) === w && !src.isKnown(w)) {
        const near = onePlace.filter((p) => p[0] === w[0] && Math.abs(p.length - w.length) <= 1 && editDistance(p, w, 1) === 1);
        if (near.length === 1) ps0 = near[0];
      }
      if (label.has(w) && !(ps0 && ps0 !== w)) return tok;
      if (ps0 && ps0 !== w) { fixes.push({ from: tok, to: ps0, label: label.get(ps0)! }); return label.get(ps0)!; }
      // glued to a number or a code ("W-12", "ZONE13", "INC-...")
      if (/[\d-]/.test(text[at - 1] ?? "") || /\d/.test(text[at + tok.length] ?? "")) return tok;
      const put = (to: string) => {
        const lab = label.get(to)!;
        fixes.push({ from: tok, to, label: lab });
        return lab !== to ? lab : tok[0] === tok[0].toUpperCase() ? to[0].toUpperCase() + to.slice(1) : to;
      };
      // a place's sound-alike wins over a street word ("velacheri" is Velachery), never over a real English word
      const ps = w.length >= 5 ? placeSound.get(soundKey(w)) : undefined;
      if (ps && !src.isKnown(w.replace(/s$/, "")) && ps !== w) return put(ps);
      if (src.isKnown(w)) return tok;
      if (src.soft?.(w)) {
        const c1 = candidates(w).filter((x) => tier.get(x.t) === 1 && x.score <= 1);
        return c1.length && new Set(c1.map((x) => label.get(x.t))).size === 1 ? put(c1[0].t) : tok;
      }
      // a map word with a wrong plural ("pharmacys", "atmss") is that word
      for (const st of [w.replace(/s$/, ""), w.replace(/es$/, ""), w.replace(/ys$/, "y")]) if (st !== w && tier.get(st) === 0) return put(st);
      const c = candidates(w);
      // another form of a known word ("complaining") is not a slip, unless a map word is one letter away ("waterloging")
      const form = [w.replace(/s$/, ""), w.replace(/es$/, ""), w.replace(/ing$/, ""), w.replace(/ed$/, ""), w.replace(/ly$/, "")].some((s) => s !== w && s.length >= 3 && known(s));
      if (!c.length || (form && c[0].score > 1)) return tok;
      // forms of one word ("hospital", "hospitals") are not a real tie: the one nearest in length
      let distinct = [...new Set(c.map((x) => label.get(x.t)!.toLowerCase().replace(/(es|s)$/, "")))];
      // a one-word place against spellings of it inside longer names ("Pallikaranai", "pallikarani"): the place
      const own = c.filter((x) => label.get(x.t) !== x.t);
      if (distinct.length > 1 && own.length === 1 && c.every((x) => x === own[0] || editDistance(x.t, own[0].t, 2) <= 2)) { distinct = [own[0].t]; c.splice(0, c.length, own[0]); }
      if (distinct.length > 1) {
        if (!ask) ask = { word: tok, options: [...new Set(c.map((x) => label.get(x.t)!))].slice(0, 3).map((l) => ({ label: l, text: "" })) };
        return tok;
      }
      return put(c.map((x) => x.t).sort((a, b) => Math.abs(a.length - w.length) - Math.abs(b.length - w.length) || a.localeCompare(b))[0]);
    });
    if (ask) {
      const a = ask as NonNullable<Spelled["ask"]>;
      const re = new RegExp(`\\b${a.word}\\b`);
      a.options = a.options.map((o) => ({ label: o.label, text: out.replace(re, o.label) }));
    }
    return { text: out, fixes, ask };
  };
}

/** One adjacent pair swapped ("hsop" / "hosp"). */
function swapped(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const d = [...a].map((ch, i) => (ch === b[i] ? -1 : i)).filter((i) => i >= 0);
  return d.length === 2 && d[1] === d[0] + 1 && a[d[0]] === b[d[1]] && a[d[1]] === b[d[0]];
}

/** "Read 'adayar' as Adyar, 'hospitls' as hospitals." */
export function fixesLine(fixes: Fix[], ta: boolean): string | null {
  if (!fixes.length) return null;
  const parts = fixes.slice(0, 4).map((f) => (ta ? `'${f.from}' → ${f.label}` : `'${f.from}' as ${f.label}`));
  return ta ? `படித்தது: ${parts.join(", ")}.` : `Read ${parts.join(", ")}.`;
}
