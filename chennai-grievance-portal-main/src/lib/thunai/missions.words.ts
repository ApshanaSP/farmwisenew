/**
 * The words of a mission, all written by code: each step's label (bilingual, never a figure), the one sentence said when a step is
 * done (its real, measured time is the only figure, and the gate is told so), the template a sentence asks for ("build me a
 * water-crisis board for Velachery", "monsoon readiness", "tour the flood risk", in English, Tamil and Tanglish), and the spoken
 * controls of a plan card or a running mission ("start", "stop", "skip that", "instead show me Adyar's drains").
 * Client-safe and pure. The Tamil lines are written Tamil, flagged for a native speaker's check.
 */
import { asciiDigits } from "./digits";
import { CAT_LABEL_TA } from "./narrate";
import { DEPT_TA, ZONE_TA_NAME } from "./lexicon";
import { placesIn, zonesIn } from "./quick";
import type { Bilingual, ConsoleMoveT, DraftStepT, MissionPlaceT, MissionStepT, TourNoteT } from "./missions.schema";
import type { Lang, PageKey, PeriodKey, World } from "./types";

const bi = (en: string, ta: string): Bilingual => ({ en, ta });
const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** the text as the place readers read it: lower case, a possessive dropped ("Adyar's" is Adyar), one space between words */
export const normText = (s: string): string =>
  ` ${asciiDigits(s.normalize("NFC").toLowerCase()).replace(/(\p{L})['’]s(?![\p{L}])/gu, "$1").replace(/[’']/g, "").replace(/[^a-z0-9஀-௿]+/g, " ").replace(/\s+/g, " ").trim()} `;

// ------------------------------------------------------------------ places --

const RESERVOIR_TA: Record<string, string> = { Chembarambakkam: "செம்பரம்பாக்கம்", Puzhal: "புழல்", Poondi: "பூண்டி", Cholavaram: "சோழவரம்", Veeranam: "வீராணம்" };

export const zonePlace = (w: World, n: number): MissionPlaceT => {
  const z = w.zones.find((x) => x.n === n);
  return { name: z?.name ?? `Zone ${n}`, ta: z?.ta ?? ZONE_TA_NAME[n] ?? null, zone: n, taluk: null };
};

/**
 * The place a sentence names, by the world's own lists: a taluk by its name (Velachery), a zone or a locality inside one (Adyar,
 * Anna Nagar), or a locality the reference holds with no zone. A taluk that shares a zone's name is the zone. null: no place.
 */
export function placeIn(text: string, w: World): MissionPlaceT | null {
  const t = normText(text);
  const zoneNames = new Set(w.zones.map((z) => z.name.toLowerCase()));
  for (const tk of w.taluks) {
    if (zoneNames.has(tk.name.toLowerCase())) continue;
    const en = normText(tk.name).trim();
    const ta = tk.ta ? normText(tk.ta).trim() : "";
    if ((en.length >= 4 && t.includes(` ${en} `)) || (ta.length >= 3 && t.includes(` ${ta}`))) return { name: tk.name, ta: tk.ta ?? null, zone: null, taluk: tk.code };
  }
  const zones = zonesIn(t, w);
  if (zones.length) {
    // a locality inside a zone keeps its own name for the map, the zone for the screens
    const loc = placesIn(t, w).map((n) => w.places.find((p) => p.name === n)).find((p) => p && p.zone === zones[0] && !w.zones.some((z) => z.name === p.name));
    if (loc) return { name: loc.name, ta: loc.aliases.find((a) => /[஀-௿]/.test(a)) ?? null, zone: zones[0], taluk: null };
    return zonePlace(w, zones[0]);
  }
  const p = placesIn(t, w).map((n) => w.places.find((x) => x.name === n)).find(Boolean);
  if (p) {
    const tk = w.taluks.find((x) => x.name.toLowerCase() === p.name.toLowerCase());
    return { name: p.name, ta: p.aliases.find((a) => /[஀-௿]/.test(a)) ?? tk?.ta ?? null, zone: p.zone, taluk: tk?.code ?? null };
  }
  return null;
}

/** the screens' own scope for a place: its zone, its taluk, or (a locality with neither) its name as search words */
export const placeSlots = (p: MissionPlaceT | null): Record<string, unknown> =>
  !p ? {} : p.zone ? { zones: [p.zone] } : p.taluk ? { taluk: p.taluk } : { q: p.name };

const placeName = (p: Pick<MissionPlaceT, "name" | "ta">, lang: Lang) => (lang === "ta" ? p.ta ?? p.name : p.name);

// ------------------------------------------------------------------ labels --

const PERIOD_W: Record<PeriodKey, Bilingual> = { daily: bi("today", "இன்று"), weekly: bi("this week", "இந்த வாரம்"), monthly: bi("this past month", "கடந்த மாதம்"), quarterly: bi("this past quarter", "கடந்த காலாண்டு") };
const PAGE_W: Record<PageKey, Bilingual> = { overview: bi("the overview", "முகப்பு"), briefing: bi("the briefing page", "சுருக்கப் பக்கம்"), trends: bi("the trends page", "போக்குகள் பக்கம்"), environment: bi("the environment page", "சுற்றுச்சூழல் பக்கம்"), studio: bi("the data studio", "தரவு ஸ்டுடியோ") };
const SEV_W: Record<string, Bilingual> = { Severe: bi("severe", "கடுமையான"), High: bi("high-priority", "முக்கியமான"), Medium: bi("medium", "நடுத்தர"), Low: bi("low-priority", "குறைந்த") };
const STATUS_W: Record<string, Bilingual> = { overdue: bi("overdue", "கெடு தாண்டிய"), open: bi("open", "திறந்த"), resolved: bi("resolved", "தீர்க்கப்பட்ட") };
/** people, not departments (JARVIS_VOICE rule 9) */
const PEOPLE_EN: Record<string, string> = { "GCC-SWD": "the drains team", CMWSSB: "Metrowater", "POL-GCP": "the police", "GCC-SWM": "the conservancy team", "GCC-ELE": "the street-lights team", TANGEDCO: "the electricity board", "GCC-HLT": "the corporation's health team", "PWD-WRD": "the water resources wing" };

const catEn = (w: World, c: string) => (w.cats.find((x) => x.code === c)?.label ?? c.toLowerCase().replace(/_/g, " ")).replace(/\s*&\s*/g, " and ").toLowerCase();
const catTa = (c: string) => CAT_LABEL_TA[c] ?? "";
const deptEn = (w: World, d: string) => PEOPLE_EN[d] ?? w.depts.find((x) => x.code === d)?.name ?? d;
const deptTa = (w: World, d: string) => DEPT_TA[d] ?? deptEn(w, d);

/** the place a screen's slots name, in words */
function slotPlace(s: Record<string, unknown>, w: World): MissionPlaceT | null {
  const zones = Array.isArray(s.zones) ? (s.zones as number[]) : [];
  if (zones.length) return zonePlace(w, zones[0]);
  if (typeof s.taluk === "string") { const tk = w.taluks.find((x) => x.code === s.taluk); if (tk) return { name: tk.name, ta: tk.ta ?? null, zone: null, taluk: tk.code }; }
  return null;
}
const inPlace = (p: MissionPlaceT | null): Bilingual => (p ? bi(` in ${p.name}`, `${p.ta ?? p.name} பகுதியில் `) : bi("", ""));

/** A screen step's label, from its recipe and its checked slots only (never a model's free words: q and name are left out unless code knows them). */
export function screenLabel(recipe: string, s: Record<string, unknown>, w: World): Bilingual {
  const p = slotPlace(s, w), at = inPlace(p);
  const cat = typeof s.cat === "string" ? s.cat : null;
  const zones = Array.isArray(s.zones) ? (s.zones as number[]) : [];
  switch (recipe) {
    case "cases": {
      const words = [s.status ? STATUS_W[String(s.status)] : null, s.sev ? SEV_W[String(s.sev)] : null].filter((x): x is Bilingual => !!x);
      const en = cap(`${words.map((x) => x.en).join(" ")} ${cat ? catEn(w, cat) : ""} cases`.replace(/\s+/g, " ").trim()) + at.en;
      const ta = `${at.ta}${words.map((x) => x.ta).join(" ")} ${cat ? catTa(cat) : ""} புகார்கள்`.replace(/\s+/g, " ").trim();
      return bi(en, ta);
    }
    case "performance": {
      if (s.by === "zone") return bi("How the zones are doing", "மண்டலவாரி செயல்பாடு");
      if (typeof s.dept === "string") return bi(`How ${deptEn(w, s.dept)} is doing`, `${deptTa(w, s.dept)} செயல்பாடு`);
      return bi("How the departments are doing", "துறைவாரி செயல்பாடு");
    }
    case "readings": {
      const res = typeof s.name === "string" ? Object.keys(RESERVOIR_TA).find((r) => r.toLowerCase() === String(s.name).toLowerCase()) : undefined;
      switch (s.metric) {
        case "rain": return bi(`Rain readings${at.en}`, `${at.ta}மழை அளவுகள்`);
        case "aqi": return bi(`Air quality${at.en}`, `${at.ta}காற்றின் தரம்`);
        case "temp": return bi("Temperatures", "வெப்பநிலை");
        case "humidity": return bi("Humidity", "ஈரப்பதம்");
        default: return res ? bi(`${res} level`, `${RESERVOIR_TA[res]} நீர்மட்டம்`) : bi("Reservoir levels", "ஏரிகளின் நீர்மட்டம்");
      }
    }
    case "brief": return bi("The day's brief", "இன்றைய சுருக்கம்");
    case "ranking": switch (s.measure) {
      case "zone_attention": return bi("Zones that need you first", "முதலில் கவனிக்க வேண்டிய மண்டலங்கள்");
      case "zone_severe": return bi("Zones by severe cases", "கடுமையான புகார்கள்படி மண்டலங்கள்");
      case "zone_open": case "zone_incidents": case "zone_complaints": return bi("Zones by open cases", "திறந்த புகார்கள்படி மண்டலங்கள்");
      case "rain": return bi("Where it rained most", "அதிக மழை பெய்த இடங்கள்");
      case "lakes": return bi("Reservoirs by how full", "நிரம்பிய அளவுப்படி ஏரிகள்");
      case "hotspots": return bi("The hotspots", "அதிகப் புகார் உள்ள இடங்கள்");
      case "taluk_open": return bi("Taluks by open cases", "திறந்த புகார்கள்படி வட்டங்கள்");
      default: return String(s.measure ?? "").startsWith("dept_") ? bi("Departments ranked", "துறைகளின் வரிசை") : bi("A ranking", "வரிசைப்பட்டியல்");
    }
    case "map": {
      const what = cat ? catEn(w, cat) : "";
      if (s.what === "hotspots") return bi(cap(`${what} hotspots on the map`.trim()), `${at.ta}வரைபடத்தில் ${cat ? `${catTa(cat)} ` : ""}மையங்கள்`.trim());
      if (s.what === "severe" || s.sev === "Severe") return bi(`Severe cases on the map${at.en}`, `${at.ta}வரைபடத்தில் கடுமையான புகார்கள்`);
      return bi(cap(`${what} cases on the map`.trim()) + at.en, `${at.ta}வரைபடத்தில் ${cat ? `${catTa(cat)} ` : ""}புகார்கள்`);
    }
    case "news": return bi(`The news${at.en}`, `${at.ta}செய்திகள்`);
    case "trend": return bi(cap(`how ${cat ? catEn(w, cat) : "cases"} moved`) + at.en, `${at.ta}${cat ? `${catTa(cat)} ` : ""}போக்கு`);
    case "why": return bi(`Why it rose${at.en}`, `${at.ta}ஏன் அதிகரித்தது`);
    case "dashboard": return bi(cap(`${cat ? catEn(w, cat) : "the"} dashboard`) + at.en, `${at.ta}${cat ? `${catTa(cat)} ` : ""}டாஷ்போர்டு`);
    case "compare": {
      const names = zones.slice(0, 4).map((n) => zonePlace(w, n));
      return names.length >= 2 ? bi(`${names.map((x) => x.name).join(" and ")} side by side`, `${names.map((x) => x.ta ?? x.name).join(", ")} ஒப்பீடு`) : bi("Side by side", "ஒப்பீடு");
    }
    case "advise": return bi(`What needs you first${at.en}`, `${at.ta}முதலில் கவனிக்க வேண்டியவை`);
    case "insight": return bi(`What stands out${at.en}`, `${at.ta}தனித்து நிற்பவை`);
    case "drafts": return bi("Your approval tray", "ஒப்புதல் தட்டு");
    case "case": return bi("A case in depth", "சம்பவம், விரிவாக");
    case "nearby": return bi("Places nearby", "அருகிலுள்ள இடங்கள்");
    case "prices": return bi("Market prices", "சந்தை விலைகள்");
    case "complete": return bi("What is still missing", "விடுபட்டவை");
    default: return bi("A screen", "திரை");
  }
}

/** A console step's label: what each move does, in words (zones by name, never by number). */
export function consoleLabel(moves: ConsoleMoveT[], w: World): Bilingual {
  const parts = moves.map((m): Bilingual => {
    switch (m.a) {
      case "page": return PAGE_W[m.page];
      case "period": return PERIOD_W[m.period];
      case "view": {
        const v = m.view;
        const xs: Bilingual[] = [];
        if (v.zone) { const z = zonePlace(w, v.zone); xs.push(bi(z.name, z.ta ?? z.name)); }
        if (v.taluk) { const tk = w.taluks.find((x) => x.code === v.taluk); if (tk) xs.push(bi(tk.name, tk.ta ?? tk.name)); }
        if (v.cat) xs.push(bi(catEn(w, v.cat), catTa(v.cat) || catEn(w, v.cat)));
        if (v.dept) xs.push(bi(deptEn(w, v.dept), deptTa(w, v.dept)));
        if (v.sev) xs.push(SEV_W[v.sev]);
        return xs.length ? bi(xs.map((x) => x.en).join(", "), xs.map((x) => x.ta).join(", ")) : bi("filters cleared", "வடிகட்டிகள் நீக்கப்பட்டன");
      }
      case "panel": return bi(`the ${m.panel} panel`, `${m.panel} பேனல்`);
      case "mapMode": return m.mode === "taluks" ? bi("the map by taluks", "வட்டவாரி வரைபடம்") : bi("the map by zones", "மண்டலவாரி வரைபடம்");
      case "layer": return bi(`the ${m.layer} layer ${m.on === false ? "off" : "on"}`, `${m.layer} அடுக்கு`);
    }
  });
  return bi(cap(`the console: ${parts.map((p) => p.en).join(", ")}`), `கன்சோல்: ${parts.map((p) => p.ta).join(", ")}`);
}

export const focusLabel = (p: MissionPlaceT): Bilingual => bi(`The map on ${p.name}`, `வரைபடம்: ${p.ta ?? p.name}`);
export const draftLabel = (only: DraftStepT["only"]): Bilingual =>
  only === "overdue" ? bi("Drafts for the overdue ones", "கெடு தாண்டியவற்றுக்கு வரைவுகள்") : bi("Drafts for the worst ones", "முக்கியமானவற்றுக்கு வரைவுகள்");

// ------------------------------------------------------------------ titles --

export const TITLES = {
  flood: (p: MissionPlaceT | null): Bilingual => (p ? bi(`Water-crisis board for ${p.name}`, `${p.ta ?? p.name}: தண்ணீர் நெருக்கடி பலகை`) : bi("Water-crisis board for the district", "மாவட்டத் தண்ணீர் நெருக்கடி பலகை")),
  brief: (): Bilingual => bi("The morning brief", "காலைச் சுருக்கம்"),
  monsoon: (): Bilingual => bi("Monsoon readiness", "பருவமழைத் தயார்நிலை"),
  tour: (): Bilingual => bi("Flood risk, zone by zone", "வெள்ள அபாயம், மண்டலவாரியாக"),
  model: (): Bilingual => bi("Your mission", "உங்கள் பணித்திட்டம்")
};

// ------------------------------------------------------------------ narration --

/** a measured time as it is said: a tenth of a second under ten seconds, whole seconds above */
export const secondsOf = (ms: number): number => (ms < 10_000 ? Math.round(Math.max(0, ms) / 100) / 10 : Math.round(ms / 1000));
const inSecs = (v: number, lang: Lang) => (lang === "ta" ? `${v} நொடியில்` : `in ${v} second${v === 1 ? "" : "s"}`);

/** One spoken line and the figures in it, every one put there by code (the gate on the browser is given exactly these). */
export interface Line { text: string; figures: number[] }
export type StepOutcome = { state: "done"; drafted?: number; none?: boolean } | { state: "failed" } | { state: "skipped" };

/** The one sentence said when a step ends: what it was and its real time (a tour stop says its zone's figure instead). */
export function stepLine(step: MissionStepT, out: StepOutcome, ms: number, lang: Lang, first: boolean): Line {
  const L = step.label[lang];
  const v = secondsOf(ms);
  const ta = lang === "ta";
  if (out.state === "skipped") return { text: ta ? `தவிர்த்தேன்: ${L}.` : `Skipped: ${L}.`, figures: [] };
  if (out.state === "failed") return { text: ta ? `${L} வரவில்லை, அடுத்ததுக்குப் போகிறேன்.` : `${L} didn't come through, so I moved on.`, figures: [] };
  switch (step.kind) {
    case "screen": return { text: ta ? `${L}: ${inSecs(v, lang)} திரையில்.` : `${L}: on screen ${inSecs(v, lang)}.`, figures: [v] };
    case "console": return { text: ta ? `${L}: ${inSecs(v, lang)} முடிந்தது.` : `${L}: done ${inSecs(v, lang)}.`, figures: [v] };
    case "focus": return step.tour ? tourLine(step.place, step.tour, lang, first) : { text: ta ? `வரைபடம் ${placeName(step.place, lang)} பக்கம், ${inSecs(v, lang)}.` : `The map is on ${step.place.name}, ${inSecs(v, lang)}.`, figures: [v] };
    case "draft": {
      const k = out.drafted ?? 0;
      if (!k) return { text: step.only === "overdue" ? (ta ? "அங்கே கெடு தாண்டியது எதுவும் இல்லை, அதனால் வரைவு இல்லை." : "Nothing there is past its deadline, so no drafts.") : (ta ? "வரைவு எழுத சம்பவம் இல்லை." : "There were no cases to draft for."), figures: [] };
      return { text: ta ? `${k} வரைவுகள் உங்கள் தட்டில், ${inSecs(v, lang)}; எதுவும் அனுப்பப்படவில்லை.` : `${k} draft${k === 1 ? " is" : "s are"} in your tray ${inSecs(v, lang)}, nothing sent.`, figures: [k, v] };
    }
  }
}

/** a tour stop: the zone and its code-counted open flooding cases this week */
export function tourLine(p: MissionPlaceT, t: TourNoteT, lang: Lang, first: boolean): Line {
  const name = placeName(p, lang);
  if (lang === "ta") return { text: `${first ? "மோசமானதிலிருந்து தொடங்குகிறேன். " : ""}${name}: இந்த வாரம் ${t.n ? `${t.n} திறந்த வெள்ளப் புகார்கள்` : "திறந்த வெள்ளப் புகார் இல்லை"}.`, figures: t.n ? [t.n] : [] };
  return { text: `${first ? "Worst first. " : ""}${name}: ${t.n ? `${t.n} open flooding case${t.n === 1 ? "" : "s"}` : "no open flooding cases"} this week.`, figures: t.n ? [t.n] : [] };
}

export const LINES = {
  stopped: (lang: Lang): Line => ({ text: lang === "ta" ? "நிறுத்தினேன். இனி எதுவும் ஓடாது." : "Stopped. Nothing else will run.", figures: [] }),
  redirect: (next: MissionStepT | undefined, lang: Lang): Line => ({ text: lang === "ta" ? `திசை மாற்றுகிறேன்${next ? `: ${next.label.ta}` : ""}.` : `Changing course${next ? `: ${next.label.en}` : ""}.`, figures: [] }),
  noRedirect: (lang: Lang): Line => ({ text: lang === "ta" ? "அதைத் திட்டமிட முடியவில்லை, தொடர்கிறேன்." : "I couldn't plan that, so I'm carrying on.", figures: [] }),
  done: (ms: number, lang: Lang): Line => { const v = secondsOf(ms); return { text: lang === "ta" ? `அவ்வளவுதான், மொத்தம் ${v} நொடி.` : `That's everything, ${v} second${v === 1 ? "" : "s"} in all.`, figures: [v] }; }
};

// ------------------------------------------------------------------ what was asked --

export type MissionTemplate = "flood" | "brief" | "monsoon" | "tour";
export type MissionIntent = { template: MissionTemplate; place: MissionPlaceT | null } | { template: "model"; place: MissionPlaceT | null };

const WATER = /\b(?:water[\s-]*crisis|water[\s-]*shortage|water[\s-]*emergency|flood(?:s|ing|ed)?|water[\s-]*logging|waterlogging|waterlogged|inundation|vellam|vellap|thanni|thanneer)\b|வெள்ள|தண்ணீர்|தண்ணி|நீர்\s*நெருக்கடி|நீர்த்தேக்க/iu;
/** a board, not a dashboard: one dashboard screen is the screens' own (quick.ts DASHBOARD) */
const BOARD = /\b(?:board|war[\s-]*room|situation[\s-]*room|command[\s-]*cent(?:re|er)|crisis[\s-]*(?:cell|desk|view)|mission)\b|(?<![஀-௿])(?:பலகை|போர்டு|வார்\s*ரூம்|கட்டுப்பாட்டு\s*அறை)/iu;
const RAINY = /\b(?:monsoon|cyclone|storm|heavy[\s-]*rain|rains?|mazhai[a-z]*|malai[a-z]*)\b|மழை|புயல்/iu;
const READY = /\b(?:ready|readiness|prepare|preparing|preparedness|prep|get\s+set)\b|தயார்|ரெடி/iu;
const BRIEF = /\b(?:morning\s+brief(?:ing)?|brief\s+me|today'?s\s+brief|daily\s+brief|brief\s+sollu|innaiku\s+brief|brief\s+kudu)\b|காலைச்?\s*சுருக்கம்|இன்றைய\s*சுருக்கம்|சுருக்கம்\s*சொல்/iu;
const TOUR = /\b(?:tour|walk\s+me\s+through|take\s+me\s+through|zone\s+by\s+zone|one\s+zone\s+at\s+a\s+time|suthi\s+kaattu|suthi\s+kaatu)\b|சுற்றிக்?\s*காட்டு|மண்டலவாரியாக|ஒவ்வொரு\s*மண்டலமாக/iu;
const RISK = /\b(?:risk|danger|flood|flooding|vellam|abaayam|apaayam)\b|அபாய|வெள்ள/iu;
/** asking for a mission in other words: a plan of several steps the templates do not hold (one dashboard screen is not one) */
const MISSION = /\b(?:mission|war[\s-]*room|situation[\s-]*room|board|step\s+by\s+step)\b|(?<![஀-௿])(?:பலகை|போர்டு|மிஷன்)/iu;

/** Which mission a sentence asks for, if any: a template (rules, no model), or "model" for a mission in other words. */
export function missionIntent(text: string, w: World): MissionIntent | null {
  const place = placeIn(text, w);
  if (TOUR.test(text) && RISK.test(text)) return { template: "tour", place };
  if (WATER.test(text) && BOARD.test(text)) return { template: "flood", place };
  if (RAINY.test(text) && READY.test(text)) return { template: "monsoon", place };
  if (BRIEF.test(text)) return { template: "brief", place };
  if (MISSION.test(text)) return { template: "model", place };
  return null;
}

// ------------------------------------------------------------------ spoken controls --

export type MissionCommand = { kind: "start" } | { kind: "stop" } | { kind: "skip" } | { kind: "instead"; text: string };

const NOT = /\b(?:don'?t|do\s+not|not\s+yet|wait|hold\s+on|venaam|vendaam|vendam)\b|வேண்டாம்|இல்லை|வெயிட்/iu;
const START_W = /^(?:(?:ok(?:ay)?|yes|yeah|alright|right|jarvis|sure)[,\s]+)*(?:start|begin|go|go\s+ahead|run\s+it|do\s+it|let'?s\s+go|start\s+it|start\s+the\s+mission|aarambi(?:nga|kalam)?|thodangu(?:nga)?|thodanga|start\s+pannu(?:nga)?|start\s+panlam|start\s+pannalam)(?:\s+(?:please|now|jarvis|pannu|pannunga))?$|^(?:சரி\s+)?(?:தொடங்கு|தொடங்குங்க|தொடங்குங்கள்|ஆரம்பி|ஆரம்பிங்க|ஸ்டார்ட்)(?:\s*(?:பண்ணு|பண்ணுங்க|செய்|செய்யுங்கள்))?$/iu;
const STOP_W = /\b(?:stop|cancel|halt|abort|enough|niruthu(?:nga)?|nippatu|podhum|pothum)\b|நிறுத்து|போதும்|ஸ்டாப்|(?<![஀-௿])ரத்து/iu;
const NOT_STOP = /\b(?:don'?t|do\s+not|never)\s+(?:stop|cancel)\b|நிறுத்தாத/iu;
const SKIP_W = /\b(?:skip|next\s+step|move\s+on|leave\s+(?:that|this|it)|vidu|vittudu)\b|தவிர்|ஸ்கிப்|அடுத்தது|விட்டுடு|(?<![஀-௿])விடு(?![஀-௿])/iu;
const INSTEAD_LEAD = /^(?:no[,\s]+|actually[,\s]+)*(?:instead(?:\s+of\s+(?:that|this))?|rather)[,:\s]+(.{3,})$/iu;
const INSTEAD_TAIL = /^(?:no[,\s]+|actually[,\s]+)*(.{3,}?)[,\s]+instead[.!]?$/iu;
const INSTEAD_TA = /^(?:அதுக்கு|அதற்கு|அதற்குப்)?\s*பதில(?:ா|ாக|ாக்)\s*,?\s*(.{2,})$/u;
const INSTEAD_TG = /^(?:adhukku|athukku|adhuku|athuku)?\s*badhil(?:a|aa|ah)\s*,?\s*(.{3,})$/iu;

/**
 * A plan card's or a running mission's own words: start, stop, skip that, instead X. Short sentences only (a sentence that says more is
 * a new request); a "don't" or "wait" is never a start. null: not a control word.
 */
export function missionCommand(text: string): MissionCommand | null {
  const s = text.normalize("NFC").replace(/[.!?]+$/g, "").replace(/\s+/g, " ").trim();
  if (!s) return null;
  for (const re of [INSTEAD_LEAD, INSTEAD_TAIL, INSTEAD_TA, INSTEAD_TG]) {
    const m = re.exec(s);
    if (m) {
      const rest = m[1].replace(/^(?:do|please)\s+/i, "").trim();
      if (rest.length >= 2) return { kind: "instead", text: rest };
    }
  }
  const words = s.split(" ").length;
  if (words <= 6 && STOP_W.test(s) && !NOT_STOP.test(s)) return { kind: "stop" };
  if (words <= 6 && SKIP_W.test(s) && !NOT.test(s)) return { kind: "skip" };
  if (words <= 6 && START_W.test(s.toLowerCase()) && !NOT.test(s)) return { kind: "start" };
  return null;
}
