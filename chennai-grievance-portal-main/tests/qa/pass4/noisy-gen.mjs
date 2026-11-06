#!/usr/bin/env node
// Seeded speech-noise generator for the QA "noisy" test family.
//
//   node noisy-gen.mjs <base.jsonl> <out.jsonl> --seed 20261106
//
// Reads clean JSONL rows and writes the same rows with `text` degraded the way
// speech recognition degrades it on a noisy Indian office line. Every other field,
// including the expectations, is copied untouched: noise must never change what the
// Collector asked. Each output row records the seed and the noise it got in `noise`.
//
// The tables below are a test tool only. They have no effect on the product, and they
// are written from the zone and body exports, not from any product code.
//
// Same input and same seed give byte-identical output. Each row gets its own random
// stream, derived from the seed and the row id, so editing one row leaves the noise on
// the others unchanged. No Math.random and no dependencies.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

// ---------------------------------------------------------------- seeded randomness

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function fnv1a(text) {
  let h = 0x811c9dc5;
  for (const ch of text) {
    h ^= ch.codePointAt(0);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

const pick = (rng, list) => list[Math.floor(rng() * list.length)];

// ---------------------------------------------------------------- mishearing table
//
// Each form is [what is heard in the text, what the line turns it into].
// Tamil forms are stems, so that case endings survive: கோடம்பாக்க matches both
// கோடம்பாக்கம் and கோடம்பாக்கத்துல, and the ending stays on after the swap.
// No mishearing may produce another zone's or another body's name (checked at start-up).

const ENTITIES = [
  // Zones
  { kind: 'zone', name: 'Thiruvottiyur', forms: [
    ['Thiruvottiyur', ['Tiruvottiyur', 'Thiruvotriyur', 'Thiru Vottiyur', 'Tiruvottiyoor']],
    ['திருவொற்றியூ', ['திருவொத்தியூ', 'திருவெற்றியூ', 'திரு ஒற்றியூ']],
  ] },
  { kind: 'zone', name: 'Manali', forms: [
    ['Manali', ['Manaali', 'Manalee', 'Mannali', 'Manalli']],
    ['மணலி', ['மனலி', 'மண்ணலி', 'மணழி']],
  ] },
  { kind: 'zone', name: 'Madhavaram', forms: [
    ['Madhavaram', ['Madavaram', 'Mathavaram', 'Madha varam', 'Madhuvaram']],
    ['மாதவர', ['மாதாவர', 'மாதவார', 'மாத வர']],
  ] },
  { kind: 'zone', name: 'Tondiarpet', forms: [
    ['Tondiarpet', ['Thondiarpet', 'Tondiyarpettai', 'Thandayarpet', 'Tondiar pet']],
    ['தண்டையார்பேட்டை', ['தண்டையார் பேட்டை', 'தொண்டியார்பேட்டை', 'தண்டயார்பேட்டை']],
  ] },
  { kind: 'zone', name: 'Royapuram', forms: [
    ['Royapuram', ['Rayapuram', 'Roya puram', 'Royal puram', 'Rayaburam']],
    ['ராயபுர', ['இராயபுர', 'ராயாபுர', 'ராய புர']],
  ] },
  { kind: 'zone', name: 'Thiru-Vi-Ka-Nagar', forms: [
    ['Thiru-Vi-Ka-Nagar', ['Thiru Vika Nagar', 'Thiruvika Nagar', 'TVK Nagar', 'Tiru Vi Ka Nagar']],
    ['Thiru Vi Ka Nagar', ['Thiru Vika Nagar', 'Thiruvika Nagar', 'TVK Nagar', 'Tiru Vi Ka Nagar']],
    ['திரு.வி.க நகர', ['திரு வி க நகர', 'திருவிக நகர', 'திரு வி கா நகர']],
  ] },
  { kind: 'zone', name: 'Ambattur', forms: [
    ['Ambattur', ['Ambathoor', 'Amba tour', 'Ambatoor', 'Ambathur']],
    ['அம்பத்தூ', ['அம்பத்து', 'அம்பட்டூ', 'அம்ப தூ']],
  ] },
  { kind: 'zone', name: 'Anna Nagar', forms: [
    ['Anna Nagar', ['Annanagar', 'Ana Nagar', 'Anna Nagger', 'Anna Naga']],
    ['அண்ணா நகர', ['அண்ணாநகர', 'அன்னா நகர', 'அண்ணா நாகர']],
  ] },
  { kind: 'zone', name: 'Teynampet', forms: [
    ['Teynampet', ['Thenampet', 'Teynam pet', 'Tenampet', 'Thenampettai']],
    ['தேனாம்பேட்ட', ['தேனாம் பேட்ட', 'தேனாம்பெட்ட', 'தேனம்பேட்ட']],
  ] },
  { kind: 'zone', name: 'Kodambakkam', forms: [
    ['Kodambakkam', ['Kodambakam', 'Kodam bakkam', 'Kodumbakkam', 'Kodambaakam']],
    ['கோடம்பாக்க', ['கொடம்பாக்க', 'கோடம் பாக்க', 'கோடம்பாக']],
  ] },
  { kind: 'zone', name: 'Valasaravakkam', forms: [
    ['Valasaravakkam', ['Valasarawakkam', 'Valasara vakkam', 'Valasarvakam', 'Velasaravakkam']],
    ['வளசரவாக்க', ['வளசர வாக்க', 'வலசரவாக்க', 'வளசரவாக']],
  ] },
  { kind: 'zone', name: 'Alandur', forms: [
    ['Alandur', ['Aalandur', 'Alandhur', 'Aalanthoor', 'Alan door']],
    ['ஆலந்தூ', ['ஆலந்து', 'அலந்தூ', 'ஆலந் தூ']],
  ] },
  { kind: 'zone', name: 'Perungudi', forms: [
    ['Perungudi', ['Perungudy', 'Perum gudi', 'Perunkudi', 'Peru Goody']],
    ['பெருங்குடி', ['பெரும் குடி', 'பெருங்கூடி', 'பெருங்குடீ']],
  ] },
  { kind: 'zone', name: 'Adyar', forms: [
    ['Adyar', ['Adayar', 'Adaiyar', 'Ad yar', 'Adyaar']],
    ['அடையாறு', ['அடையார்', 'அடயாறு', 'அடையாரு']],
  ] },
  { kind: 'zone', name: 'Sholinganallur', forms: [
    ['Sholinganallur', ['Solinganallur', 'Cholinganallur', 'Sholinga nallur', 'Sholinganalloor']],
    ['சோழிங்கநல்லூ', ['சோழிங்க நல்லூ', 'சோளிங்கநல்லூ', 'சோலிங்கநல்லூ']],
  ] },

  // Bodies
  { kind: 'body', name: 'GCC-SWD', forms: [
    ['Storm Water Drain', ['Strom Water Drain', 'Storm Watter Drain', 'Storm Water Train', 'Storm Water Dren']],
    ['மழைநீர் வடிகால்', ['மழை நீர் வடிகால்', 'மழைநீர் வாடிகால்']],
  ] },
  { kind: 'body', name: 'GCC-SWM', forms: [
    ['Solid Waste', ['Solid West', 'Salad Waste', 'Solid Vest']],
    ['திடக்கழிவு', ['திட கழிவு', 'திடக் கழிவு', 'திடகழிவு']],
  ] },
  { kind: 'body', name: 'GCC-ENG', forms: [
    ['Roads department', ['Rhodes department', 'Rods department']],
    ['சாலைகள் துறை', ['சாலை துறை', 'சாலைகள் தொறை']],
  ] },
  { kind: 'body', name: 'GCC-ELE', forms: [
    ['Street Lighting', ['Street Lightning', 'Stree Lighting', 'Street Lighten']],
    ['தெரு விளக்கு துறை', ['தெருவிளக்கு துறை', 'தெரு விளக்கு தொறை']],
  ] },
  { kind: 'body', name: 'GCC-HLT', forms: [
    ['Public Health', ['Public Helth', 'Public Helt']],
    ['பொது சுகாதார', ['பொதுச் சுகாதார', 'பொது சுகாதர']],
  ] },
  { kind: 'body', name: 'GCC-PRK', forms: [
    ['Parks and Play', ['Parks an Play', 'Barks and Play']],
    ['பூங்கா துறை', ['பூங்க துறை', 'பூங்கா தொறை']],
  ] },
  { kind: 'body', name: 'GCC-REV', forms: [
    ['Corporation Revenue', ['Corporation Revenew', 'Corporation Reven You']],
    ['மாநகராட்சி வருவாய்', ['மாநகராட்சி வருவாயி', 'மாநகராச்சி வருவாய்']],
  ] },
  { kind: 'body', name: 'GCC-GAD', forms: [
    ['General Administration', ['Genral Administration', 'General Admin Stration']],
    ['பொது நிர்வாக', ['பொது நிருவாக', 'பொது நிர்வக']],
  ] },
  { kind: 'body', name: 'GCC-BRG', forms: [
    ['Bridges', ['Brijes', 'Bridge is']],
    ['பாலங்கள்', ['பாளங்கள்', 'பாலம் கள்']],
  ] },
  { kind: 'body', name: 'GCC-EDU', forms: [
    ['Education', ['Edukashan', 'Edu Cation']],
    ['கல்வி துறை', ['கல்வி தொறை', 'கல்வீ துறை']],
  ] },
  { kind: 'body', name: 'GCC-BLD', forms: [
    ['Corporation Buildings', ['Corporation Bildings', 'Corporation Billdings']],
    ['மாநகராட்சி கட்டிட', ['மாநகராச்சி கட்டிட', 'மாநகராட்சி கட்டட']],
  ] },
  { kind: 'body', name: 'GCC-MEC', forms: [
    ['Mechanical Engineering', ['Mekanical Engineering', 'Mechanic Cal Engineering']],
    ['இயந்திர பொறியியல்', ['எந்திர பொறியியல்', 'இயந்திர பொறியல்']],
  ] },
  { kind: 'body', name: 'GCC-LND', forms: [
    ['Land and Estate', ['Land and State', 'Lan and Estate']],
    ['நிலம் மற்றும் எஸ்டேட்', ['நிலம் மற்றும் எஸ்டேட்டு', 'நிலம் மத்தும் எஸ்டேட்']],
  ] },
  { kind: 'body', name: 'GCC-FMU', forms: [
    ['Financial Management Unit', ['Finanshal Management Unit', 'Financial Manage Meant Unit']],
    ['நிதி மேலாண்மை', ['நிதி மேளாண்மை', 'நிதி மேலான்மை']],
  ] },
  { kind: 'body', name: 'GCC-CNL', forms: [
    ['Council', ['Counsel', 'Kaunsil']],
    ['கவுன்சில்', ['கௌன்சில்', 'கவுன்சிலு']],
  ] },
  { kind: 'body', name: 'GCC-FWD', forms: [
    ['Family Welfare', ['Family Wellfare', 'Family Well Fair']],
    ['குடும்ப நல', ['குடும்ப நள', 'குடும்பு நல']],
  ] },
  { kind: 'body', name: 'POL-GCP', forms: [
    ['Greater Chennai Police', ['Greater Chennai Polis', 'Grater Chennai Police', 'Greater Chennai Bolice']],
    ['சென்னை போலீஸ்', ['சென்னை பொலிஸ்', 'சென்னை போலிசு']],
  ] },
  { kind: 'body', name: 'PWD-WRD', forms: [
    ['PWD Water Resources', ['P W D Water Resources', 'PWD Water Resource', 'PW Water Resources']],
    ['பொதுப்பணித்துறை நீர்வள', ['பொது பணித்துறை நீர்வள', 'பொதுப்பணி துறை நீர்வள', 'பொதுப்பணித்துறை நீர் வள']],
  ] },
  { kind: 'body', name: 'PWD-BLD', forms: [
    ['PWD Buildings', ['P W D Buildings', 'PWD Bildings']],
    ['பொதுப்பணித்துறை கட்டிட', ['பொது பணித்துறை கட்டிட', 'பொதுப்பணி துறை கட்டிட']],
  ] },
  { kind: 'body', name: 'HLT-DMS', forms: [
    ['Government Hospitals', ['Gorment Hospitals', 'Government Ospitals', 'Govern Meant Hospitals']],
    ['அரசு மருத்துவமனை', ['அரசு மருத்துவ மனை', 'அரசு மருத்துவமணை']],
  ] },
  { kind: 'body', name: 'CMWSSB', forms: [
    ['Metrowater', ['Metro Vaatar', 'Metrowatter', 'Metro Walter', 'Metro Wattar']],
    ['CMWSSB', ['C M W S S B', 'CMWSB', 'CMW SSB']],
    ['மெட்ரோ வாட்டர்', ['மெட்ரோவாட்டர்', 'மெட்ரோ வாடர்', 'மெட்ரோ வாட்டெர்']],
  ] },
  { kind: 'body', name: 'TANGEDCO', forms: [
    ['Tangedco', ['Tan Jet Co', 'Tangent Co', 'Tangetco', 'Tangedko']],
    ['டான்ஜெட்கோ', ['டான் ஜெட்கோ', 'தாங்கெட்கோ', 'டேன்ஜெட்கோ']],
  ] },
  { kind: 'body', name: 'TNPCB', forms: [
    ['TNPCB', ['T N P C B', 'TNBCB', 'TN PCB']],
    ['Pollution Control Board', ['Polution Control Board', 'Pollution Control Bored']],
    ['மாசு கட்டுப்பாட்டு வாரிய', ['மாசு கட்டுபாட்டு வாரிய', 'மாசு கட்டுப்பாடு வாரிய']],
  ] },
  { kind: 'body', name: 'DIST-DM', forms: [
    ['Disaster Management', ['Dizaster Management', 'Disaster Manage Meant']],
    ['பேரிடர் மேலாண்மை', ['பேரிடர் மேளாண்மை', 'பேரிடர் மேலான்மை']],
  ] },
  { kind: 'body', name: 'DIST-REV', forms: [
    ['District Revenue', ['District Revenew', 'Distric Revenue', 'District Reven You']],
    ['மாவட்ட வருவாய்', ['மாவட்டு வருவாய்', 'மாவட்ட வருவாயி']],
  ] },
  { kind: 'body', name: 'IMD', forms: [
    ['India Meteorological', ['India Metrological', 'India Meterological']],
    ['IMD', ['I M D', 'I.M.D']],
    ['வானிலை மைய', ['வானில மைய', 'வானிலை மய']],
  ] },
  { kind: 'body', name: 'WRD-CFM', forms: [
    ['Flood Monitoring', ['Flood Monitering', 'Flud Monitoring']],
    ['வெள்ள கண்காணிப்பு', ['வெள்ளக் கண்காணிப்பு', 'வெள்ள கன்காணிப்பு']],
  ] },
];

// ---------------------------------------------------------------- language tables

const FILLERS = {
  en: ['um', 'uh', 'like', 'basically', 'you know', 'hmm', 'er', 'actually'],
  ta: ['அதாவது', 'ம்ம்', 'வந்து', 'ஆங்', 'என்னன்னா', 'அப்படியே'],
  tanglish: ['apdiye', 'basically', 'adhavadhu', 'umm', 'aah', 'vandhu', 'like', 'enna na'],
};

const RESTART_MARKERS = {
  en: ['no wait', 'sorry', 'I mean', 'hold on'],
  ta: ['இல்ல இல்ல', 'இல்ல', 'சாரி', 'ஒரு நிமிஷம்'],
  tanglish: ['no wait', 'illa illa', 'sorry', 'wait wait'],
};

// Words a noisy line loses without changing the request. Never negations, status words,
// time words, or demonstratives that are part of a period ("this week", "இந்த வாரம்").
const DROPPABLE = {
  en: ['the', 'a', 'an', 'of', 'in', 'is', 'are', 'on', 'from', 'for'],
  ta: ['ஒரு', 'அந்த', 'கொஞ்சம்', 'தான்', 'சம்பந்தமா', 'மொத்தம்', 'இன்னும்', 'பத்தி', 'கிட்ட', 'மேல'],
  tanglish: ['la', 'ah', 'oda', 'konjam', 'oru', 'andha', 'side', 'ku', 'nu', 'pathi', 'kitta', 'mela'],
};

// One word or short phrase swapped for its other-language equivalent, same meaning.
const CODE_SWITCH = {
  en: [
    ['flooding', ['vellam', 'வெள்ளம்']],
    ['flood', ['vellam', 'வெள்ளம்']],
    ['waterlogging', ['thanni thekkam', 'தண்ணி தேக்கம்']],
    ['garbage', ['kuppai', 'குப்பை']],
    ['complaints', ['pugar', 'புகார்']],
    ['how many', ['evlo', 'எத்தனை']],
    ['this week', ['indha vaaram', 'இந்த வாரம்']],
    ['this month', ['indha maasam', 'இந்த மாசம்']],
    ['last month', ['pona maasam', 'போன மாசம்']],
    ['today', ['innaikku', 'இன்னைக்கு']],
    ['dog', ['naai', 'நாய்']],
    ['drainage', ['saakkadai', 'சாக்கடை']],
    ['zone', ['mandalam', 'மண்டலம்']],
    ['road accident', ['saalai vibathu', 'சாலை விபத்து']],
    ['air pollution', ['kaatru maasu', 'காற்று மாசு']],
    ['still', ['innum', 'இன்னும்']],
    ['severe', ['kadumaiyana', 'கடுமையான']],
    ['streetlight', ['theru vilakku', 'தெரு விளக்கு']],
    ['why', ['yen', 'ஏன்']],
  ],
  ta: [
    ['புகார்களை', ['complaints', 'கம்ப்ளைன்ட்ஸ்']],
    ['புகார்', ['complaint', 'கம்ப்ளைன்ட்']],
    ['எத்தனை', ['how many']],
    ['எத்தன', ['how many']],
    ['எவ்வளவு', ['how many']],
    ['இந்த வாரம்', ['this week', 'திஸ் வீக்']],
    ['போன வாரத்தை', ['last week-ஐ']],
    ['போன வாரம்', ['last week', 'லாஸ்ட் வீக்']],
    ['போன மாசம்', ['last month', 'லாஸ்ட் மன்த்']],
    ['இன்னைக்கு', ['today', 'டுடே']],
    ['நேத்து', ['yesterday', 'எஸ்டர்டே']],
    ['மண்டலத்துல', ['zone-ல', 'ஜோன்ல']],
    ['மண்டலம்', ['zone', 'ஜோன்']],
    ['கொசுத்', ['mosquito']],
    ['குடிநீர்', ['drinking water']],
    ['கட்டிடங்கள்', ['buildings', 'பில்டிங்ஸ்']],
    ['சாலை விபத்து', ['road accident', 'ரோடு ஆக்சிடென்ட்']],
    ['சாலை பள்ளம்', ['road pothole', 'ரோடு பள்ளம்']],
    ['திருட்டு', ['theft']],
    ['தீ விபத்துகள்', ['fire accidents']],
    ['பட்டியல்', ['list', 'லிஸ்ட்']],
    ['நிலவரம்', ['status', 'ஸ்டேட்டஸ்']],
    ['நிலுவையில', ['pending-ல', 'பெண்டிங்ல']],
    ['நிலுவை', ['pending', 'பெண்டிங்']],
    ['கடுமையான', ['severe']],
    ['பிரச்சனை', ['problem', 'பிராப்ளம்']],
    ['உணவு பாதுகாப்பு', ['food safety']],
    ['மாவட்டத்துல', ['district-ல']],
    ['மேலாண்மை', ['management']],
  ],
  tanglish: [
    ['evlo', ['how many']],
    ['ethana', ['how many']],
    ['innaiku', ['today']],
    ['nethu', ['yesterday']],
    ['pona vaaram', ['last week']],
    ['indha vaaram', ['this week']],
    ['indha maasam', ['this month']],
    ['kuppai', ['garbage']],
    ['vellam', ['flood']],
    ['prechana', ['problem']],
    ['complaints', ['pugar', 'புகார்']],
    ['pending', ['nilluvai', 'நிலுவை']],
    ['jaasthi', ['more']],
    ['mosam', ['worse']],
    ['zone', ['mandalam']],
    ['kudi thanni', ['drinking water']],
    ['drainage', ['saakkadai']],
    ['fire accident', ['thee vibathu']],
    ['kaattu', ['show']],
    ['sollunga', ['tell']],
    ['sollu', ['tell']],
  ],
};

// Phrases that noise may not split. Entity names are added to this list at start-up.
const UNBREAKABLE = [
  'this week', 'last week', 'this month', 'last month', 'how many', 'high severity',
  'road accident', 'air pollution', 'Southern Railway', 'no wait',
  'indha vaaram', 'pona vaaram', 'indha maasam', 'pona maasam', 'kudi thanni', 'fire accident',
  'thanni thekkam', 'saalai vibathu', 'kaatru maasu', 'theru vilakku',
  'இந்த வாரம்', 'போன வாரம்', 'போன வாரத்தை', 'போன மாசம்', 'இந்த மாசம்',
  'தண்ணி தேக்கம்', 'சாலை விபத்து', 'சாலை பள்ளம்', 'தீ விபத்துகள்', 'உணவு பாதுகாப்பு',
  'தெரு விளக்கு', 'காற்று மாசு', 'drinking water', 'food safety', 'fire accidents', 'road pothole',
  // Two alternatives: அதாவது between them would read as "gone up, that is, gone down".
  'கொசுத் தொல்லை', 'கூடியிருக்கா குறைஞ்சிருக்கா',
];

// A filler does not land between a name and its case particle.
const NO_FILLER_BEFORE = new Set(['la', 'ku', 'oda', 'ah', 'nu', 'mela', 'kitta', 'side', 'rendula', "'s"]);

// ---------------------------------------------------------------- text helpers

const isRoman = (s) => /^[\x00-\x7f]+$/.test(s);
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const TRAILING_PUNCT = /[.,?!;:]+$/;

function occurrences(text, pattern, closedRight) {
  const spans = [];
  if (isRoman(pattern)) {
    const right = closedRight ? "(?![A-Za-z'’])" : '';
    const re = new RegExp(`(?<![A-Za-z])${escapeRe(pattern)}${right}`, 'gi');
    for (const m of text.matchAll(re)) spans.push({ start: m.index, end: m.index + m[0].length });
  } else {
    for (let at = text.indexOf(pattern); at !== -1; at = text.indexOf(pattern, at + pattern.length)) {
      spans.push({ start: at, end: at + pattern.length });
    }
  }
  return spans;
}

// Longest first, then drop anything overlapping an already chosen span.
function nonOverlapping(candidates) {
  const sorted = [...candidates].sort((a, b) => (b.end - b.start) - (a.end - a.start) || a.start - b.start);
  const chosen = [];
  for (const c of sorted) {
    if (!chosen.some((k) => c.start < k.end && k.start < c.end)) chosen.push(c);
  }
  return chosen.sort((a, b) => a.start - b.start);
}

function canonicalMentions(text) {
  const found = [];
  for (const entity of ENTITIES) {
    for (const [match, say] of entity.forms) {
      for (const span of occurrences(text, match, false)) found.push({ ...span, entity, say });
    }
  }
  return nonOverlapping(found);
}

// Finds names whether or not they have already been misheard.
function anyMentions(text) {
  const found = [];
  for (const entity of ENTITIES) {
    for (const [match, say] of entity.forms) {
      for (const form of [match, ...say]) {
        for (const span of occurrences(text, form, false)) found.push({ ...span, entity });
      }
    }
  }
  return nonOverlapping(found);
}

function protectedSpans(text) {
  const spans = anyMentions(text).map(({ start, end }) => ({ start, end }));
  for (const phrase of UNBREAKABLE) spans.push(...occurrences(text, phrase, false));
  return spans;
}

function tokensOf(text) {
  return [...text.matchAll(/\S+/g)].map((m) => ({ word: m[0], start: m.index, end: m.index + m[0].length }));
}

const splice = (text, start, end, insert) => text.slice(0, start) + insert + text.slice(end);

// Keep the speaker's casing when the speaker wrote the name in lower case.
const matchCase = (original, replacement) =>
  isRoman(original) && original === original.toLowerCase() ? replacement.toLowerCase() : replacement;

// ---------------------------------------------------------------- the noise kinds
// Each returns { text, detail } or null when it has nothing to do.

function mishear(text, lang, rng) {
  const mentions = canonicalMentions(text);
  if (!mentions.length) return null;
  const first = pick(rng, mentions);
  const targets = [first];
  if (mentions.length > 1 && rng() < 0.35) {
    targets.push(mentions.find((m) => m !== first));
  }
  const detail = [];
  let out = text;
  for (const m of [...targets].sort((a, b) => b.start - a.start)) {
    const from = text.slice(m.start, m.end);
    const to = matchCase(from, pick(rng, m.say));
    out = splice(out, m.start, m.end, to);
    detail.unshift({ entity: m.entity.name, from, to });
  }
  return { text: out, detail };
}

function codeSwitch(text, lang, rng) {
  const entitySpans = anyMentions(text);
  const found = [];
  for (const [pattern, swaps] of CODE_SWITCH[lang]) {
    for (const span of occurrences(text, pattern, true)) {
      if (!entitySpans.some((e) => span.start < e.end && e.start < span.end)) found.push({ ...span, swaps });
    }
  }
  const spots = nonOverlapping(found);
  if (!spots.length) return null;
  const spot = pick(rng, spots);
  const from = text.slice(spot.start, spot.end);
  const to = pick(rng, spot.swaps);
  return { text: splice(text, spot.start, spot.end, to), detail: { from, to } };
}

function drop(text, lang, rng) {
  const shield = protectedSpans(text);
  const tokens = tokensOf(text);
  const droppable = new Set(DROPPABLE[lang]);
  const spots = tokens.filter((t, i) => {
    if (!droppable.has(t.word.toLowerCase())) return false;
    if (tokens.length < 4) return false;
    const next = (tokens[i + 1]?.word ?? '').toLowerCase().replace(TRAILING_PUNCT, '');
    if (t.word.toLowerCase() === 'on' && (next === 'that' || next === 'top')) return false;
    return !shield.some((s) => t.start < s.end && s.start < t.end);
  });
  if (!spots.length) return null;
  const chosen = [pick(rng, spots)];
  if (spots.length > 2 && rng() < 0.3) {
    const second = pick(rng, spots);
    if (second !== chosen[0]) chosen.push(second);
  }
  let out = text;
  for (const t of [...chosen].sort((a, b) => b.start - a.start)) {
    out = splice(out, t.start, Math.min(t.end + 1, out.length), '');
  }
  return { text: out.trim(), detail: chosen.map((t) => t.word) };
}

function repeat(text, lang, rng) {
  const shield = protectedSpans(text);
  const spots = tokensOf(text).filter((t) =>
    /[\p{L}]/u.test(t.word) && !shield.some((s) => t.start < s.end && s.start < t.end));
  if (!spots.length) return null;
  const t = pick(rng, spots);
  const bare = t.word.replace(TRAILING_PUNCT, '');
  return { text: splice(text, t.start, t.start, `${bare} `), detail: bare };
}

function filler(text, lang, rng) {
  const shield = protectedSpans(text);
  const tokens = tokensOf(text);
  const spots = tokens.filter((t) =>
    !NO_FILLER_BEFORE.has(t.word.toLowerCase().replace(TRAILING_PUNCT, '')) &&
    !shield.some((s) => s.start < t.start && t.start < s.end));
  const count = rng() < 0.3 ? 2 : 1;
  const chosen = [];
  for (let i = 0; i < count; i++) {
    const spot = pick(rng, spots);
    const unused = FILLERS[lang].filter((word) => !chosen.some((c) => c.word === word));
    const word = pick(rng, unused);
    if (!chosen.some((c) => c.spot === spot)) chosen.push({ spot, word });
  }
  let out = text;
  for (const c of [...chosen].sort((a, b) => b.spot.start - a.spot.start)) {
    out = splice(out, c.spot.start, c.spot.start, `${c.word} `);
  }
  return { text: out, detail: chosen.map((c) => c.word) };
}

function restart(text, lang, rng) {
  const marker = pick(rng, RESTART_MARKERS[lang]);
  const mentions = anyMentions(text);
  if (mentions.length && rng() < 0.7) {
    const m = pick(rng, mentions);
    let tokenEnd = m.end;
    while (tokenEnd < text.length && !/\s/.test(text[tokenEnd])) tokenEnd++;
    const tail = text.slice(m.end, tokenEnd);
    const suffix = tail.replace(TRAILING_PUNCT, '');
    const punct = tail.slice(suffix.length);
    const name = text.slice(m.start, m.end);
    const nextMatch = /^\s+(\S+)/.exec(text.slice(tokenEnd));
    const next = nextMatch ? nextMatch[1].toLowerCase() : '';
    const particle = lang === 'tanglish' && !tail && ['la', 'side', 'ku', 'oda'].includes(next)
      ? nextMatch[1] : '';
    const end = particle ? tokenEnd + nextMatch[0].length : tokenEnd;
    const addZone = m.entity.kind === 'zone' && isRoman(name) && !suffix && !/^zone\b/.test(next);
    const after = particle ? ` ${particle}` : '';
    const firstGo = `${name}${suffix}${after}`;
    const secondGo = `${name}${addZone ? ' zone' : ''}${suffix}${after}${punct}`;
    return { text: splice(text, m.start, end, `${firstGo}, ${marker}, ${secondGo}`), detail: { marker, on: name } };
  }
  const tokens = tokensOf(text);
  if (tokens.length < 3) return null;
  const k = tokens.length >= 5 && rng() < 0.5 ? 3 : 2;
  const opening = text.slice(0, tokens[k - 1].end).replace(TRAILING_PUNCT, '');
  return { text: `${opening}, ${marker}, ${text}`, detail: { marker, on: opening } };
}

function noPunctuation(text, lang, rng) {
  // A dot inside a name (திரு.வி.க) becomes a space, so the letters stay apart.
  let out = text.replace(/([\p{L}\p{M}])\.(?=[\p{L}\p{M}])/gu, '$1 ')
    .replace(/[.,?!;:…]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const lowered = rng() < 0.5;
  if (lowered) out = out.toLowerCase();
  if (out === text) return null;
  return { text: out, detail: { lowered } };
}

const KINDS = {
  mishear: { apply: mishear, weight: 5, canApply: (t) => canonicalMentions(t).length > 0 },
  codeswitch: { apply: codeSwitch, weight: 2, canApply: (t, lang) => CODE_SWITCH[lang].some(([p]) => occurrences(t, p, true).length) },
  drop: { apply: drop, weight: 2, canApply: (t, lang) => tokensOf(t).some((x) => DROPPABLE[lang].includes(x.word.toLowerCase())) },
  repeat: { apply: repeat, weight: 1, canApply: () => true },
  filler: { apply: filler, weight: 2, canApply: () => true },
  restart: { apply: restart, weight: 1.5, canApply: () => true },
  nopunct: { apply: noPunctuation, weight: 1, canApply: (t) => /[.,?!;:]/.test(t) },
};

// Mishearing first (later kinds work on the misheard words). Restart before filler, so a
// restart does not copy a filler. Punctuation last, so it also clears a restart's commas.
const APPLY_ORDER = ['mishear', 'codeswitch', 'drop', 'repeat', 'restart', 'filler', 'nopunct'];

function chooseKinds(text, lang, rng) {
  const pool = Object.keys(KINDS).filter((k) => KINDS[k].canApply(text, lang));
  const howMany = Math.min(pool.length, 1 + Math.floor(rng() * 3));
  const chosen = [];
  while (chosen.length < howMany) {
    const total = pool.reduce((sum, k) => sum + KINDS[k].weight, 0);
    let roll = rng() * total;
    const kind = pool.find((k) => (roll -= KINDS[k].weight) < 0) ?? pool[pool.length - 1];
    chosen.push(kind);
    pool.splice(pool.indexOf(kind), 1);
  }
  return APPLY_ORDER.filter((k) => chosen.includes(k));
}

function noisify(row, seed) {
  const rng = mulberry32((seed ^ fnv1a(row.id)) >>> 0);
  let text = row.text;
  const applied = [];
  for (const kind of chooseKinds(text, row.lang, rng)) {
    const result = KINDS[kind].apply(text, row.lang, rng);
    if (result && result.text !== text) {
      text = result.text;
      applied.push({ kind, detail: result.detail });
    }
  }
  if (!applied.length) {
    const result = filler(text, row.lang, rng);
    text = result.text;
    applied.push({ kind: 'filler', detail: result.detail });
  }
  return {
    ...row,
    text,
    noise: { seed, kinds: applied.map((a) => a.kind), applied, base_text: row.text },
  };
}

// ---------------------------------------------------------------- self-check and run

function checkTables() {
  const owner = new Map();
  for (const entity of ENTITIES) {
    for (const [match] of entity.forms) owner.set(match.toLowerCase(), entity.name);
  }
  for (const entity of ENTITIES) {
    for (const [match, say] of entity.forms) {
      for (const variant of say) {
        const other = owner.get(variant.toLowerCase());
        if (other && other !== entity.name) {
          throw new Error(`mishearing "${variant}" of ${entity.name} is the name of ${other}`);
        }
        if (variant === match) throw new Error(`mishearing of ${entity.name} equals its own form: ${match}`);
      }
    }
  }
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

function main() {
  const args = process.argv.slice(2);
  const seedAt = args.indexOf('--seed');
  const seed = seedAt === -1 ? NaN : Number(args[seedAt + 1]);
  const paths = args.filter((_, i) => seedAt === -1 || (i !== seedAt && i !== seedAt + 1));
  if (paths.length !== 2 || !Number.isInteger(seed)) {
    fail('usage: node noisy-gen.mjs <base.jsonl> <out.jsonl> --seed <integer>');
  }
  const [basePath, outPath] = paths;

  checkTables();
  for (const entity of ENTITIES) {
    for (const [match, say] of entity.forms) {
      for (const form of [match, ...say]) if (/\s/.test(form)) UNBREAKABLE.push(form);
    }
  }

  const seen = new Set();
  const rows = readFileSync(basePath, 'utf8').split(/\r?\n/).filter((line) => line.trim()).map((line, i) => {
    let row;
    try {
      row = JSON.parse(line);
    } catch (err) {
      fail(`${basePath} line ${i + 1}: not JSON: ${err.message}`);
    }
    if (typeof row.id !== 'string' || typeof row.text !== 'string' || !FILLERS[row.lang]) {
      fail(`${basePath} line ${i + 1}: needs a string id, a string text, and lang en, ta or tanglish`);
    }
    if (seen.has(row.id)) fail(`${basePath} line ${i + 1}: duplicate id ${row.id}`);
    seen.add(row.id);
    return row;
  });

  const out = rows.map((row) => noisify(row, seed));
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, out.map((row) => JSON.stringify(row)).join('\n') + '\n', 'utf8');

  const tally = {};
  for (const row of out) for (const kind of row.noise.kinds) tally[kind] = (tally[kind] ?? 0) + 1;
  console.log(JSON.stringify({ rows: out.length, seed, kinds: tally }));
}

main();
