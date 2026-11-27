/**
 * v18 (24 Nov): the screens other than the summary, over any window with its own dates ("news from the last 2 days", "air quality on 20
 * November", "compare Adyar and Anna Nagar over the last 4 days", "which zone had the most cases between 15 and 20 November", "how did
 * flooding move this past fortnight"). The console's own tools know only its four windows; these read the window's own IST bounds
 * (v18/window.ts) and say it. Every figure is code's; the spoken line says only figures on the screen.
 */
import { spoken } from "../insight";
import { CAT_LABEL_TA } from "../narrate";
import { DEPT_TA, ZONES } from "../lexicon";
import type { Bilingual, BlockT, DrillT, StageDocT } from "../stage";
import type { PeriodSpec } from "@/lib/period/read";
import { isTopic, topicCats, TOPICS } from "../v18/topics";
import { OutsideRecords, boundWords, daySpec, overWords, windowOf, type Win } from "../v18/when";
const Over = (l: string) => { const o = overWords(l); return o.charAt(0).toUpperCase() + o.slice(1); };
import type { WinMetric, WinScope } from "../v18/window";
import { bi, clip, zoneName, type RecipeCtx } from "./common";
import type { SummaryPart } from "./summary";
import { COMMODITY_ALIAS, editDistance } from "@/lib/assistant/fuzzy";

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const whenOf = (w: Win): StageDocT["when"] => (w.custom ? { en: clip(w.label.en, 160), ta: clip(w.label.ta, 200), from: w.from, to: w.to } : null);

async function windowFor(c: RecipeCtx, own = false): Promise<Win> {
  const now = await c.h.win!.now();
  c.asOf ??= now;
  const w = windowOf((c.slots.span ?? null) as PeriodSpec | null, c.s.period, now);
  // v18 round 2: a window wholly before the records is said to be so (screens.ts v18), never counted as another window
  // (`own`: prices and readings have their own first days and say them, so they read the window as asked)
  if ((w.outside === "all" && !own) || w.outside === "future") throw new OutsideRecords(w);
  if (w.note) c.notes.push(c.ta ? "பதிவுகள் சுமார் 180 நாட்கள் மட்டுமே." : w.note);
  return w;
}
function scopeOf(c: RecipeCtx, zones?: number[]): WinScope {
  const z = zones ?? (c.slots.zones.length ? c.slots.zones : c.s.zone ? [c.s.zone] : []);
  const fam = isTopic(c.slots.family) ? c.slots.family : null;
  return { zone: z.length === 1 ? z[0] : null, zones: z.length > 1 ? z : null, place: c.slots.place ?? null, dept: c.slots.dept ?? c.s.dept ?? null,
    cats: fam ? topicCats(fam, c.w.cats) : c.s.cat ? [c.s.cat] : null, sev: c.s.sev === "Severe" || c.s.sev === "High" ? c.s.sev : null, taluk: c.s.taluk ?? null, status: c.slots.status ?? null };
}
function baseSlots(c: RecipeCtx, w: Win): Record<string, unknown> {
  const fam = isTopic(c.slots.family) ? c.slots.family : null;
  return { zones: c.slots.zones, ...(c.slots.place ? { place: c.slots.place } : {}), ...(c.slots.dept ?? c.s.dept ? { dept: c.slots.dept ?? c.s.dept } : {}),
    ...(fam ? { family: fam } : c.s.cat ? { cat: c.s.cat } : {}), period: w.key, ...(w.custom && c.slots.span ? { span: c.slots.span } : {}) };
}
const summaryDrill = (base: Record<string, unknown>, extra: Record<string, unknown>, label: string): DrillT => ({ recipe: "summary", slots: { ...base, ...extra, fresh: true }, label: clip(label, 160) });
/** the subject in words: "Adyar · Flooding", or the district */
function subjectWords(c: RecipeCtx, zones?: number[]): Bilingual {
  const z = zones ?? (c.slots.zones.length ? c.slots.zones : c.s.zone ? [c.s.zone] : []);
  const fam = isTopic(c.slots.family) ? c.slots.family : null;
  const en: string[] = [], ta: string[] = [];
  if (c.slots.place) { en.push(c.slots.place); ta.push(c.slots.place); }
  for (const n of z) { const nm = zoneName(c.w, n); if (nm) { en.push(nm.en); ta.push(nm.ta); } }
  const dept = c.slots.dept ?? c.s.dept;
  if (dept) { const d = c.w.depts.find((x) => x.code === dept)?.name ?? dept; en.push(d); ta.push(DEPT_TA[dept] ?? d); }
  if (fam) { en.push(TOPICS[fam].en); ta.push(TOPICS[fam].ta); }
  else if (c.s.cat) { const l = c.w.cats.find((x) => x.code === c.s.cat)?.label ?? c.s.cat; en.push(l); ta.push(CAT_LABEL_TA[c.s.cat] ?? l); }
  return en.length ? bi(en.join(" · "), ta.join(" · ")) : bi("Chennai district", "சென்னை மாவட்டம்");
}

// ------------------------------------------------------------------ news --

export async function spanNews(c: RecipeCtx): Promise<SummaryPart> {
  const w = await windowFor(c);
  const subj = subjectWords(c);
  const zones = c.slots.zones.length ? c.slots.zones : c.s.zone ? [c.s.zone] : [];
  const words = [...(c.slots.place ? [c.slots.place] : []), ...zones.flatMap((z) => [...(ZONES[z]?.en ?? []), ...(ZONES[z]?.ta ?? []), ...c.w.places.filter((p) => p.zone === z).flatMap((p) => [p.name, ...p.aliases])]),
    ...(c.slots.q ? c.slots.q.toLowerCase().split(/[^a-z஀-௿]+/).filter((x) => x.length >= 5) : [])].map((x) => x.toLowerCase()).filter((x) => x.length >= 4);
  const sc = scopeOf(c);
  c.runs.push("window_news"); c.sources.add("news (window)");
  const r = await c.h.win!.news(w, { words: [...new Set(words)], cats: sc.cats, dept: sc.dept }, 20);
  const when = bi(w.label.en, w.label.ta);
  const blocks: BlockT[] = [];
  if (r.rows.length) blocks.push({ kind: "NewsReader", id: "news", title: clip(c.ta ? `செய்திகள் · ${subj.ta} · ${when.ta}` : `News · ${subj.en} · ${when.en}`, 160), total: r.total,
    items: r.rows.map((x: Row) => ({ id: clip(x.id, 120), title: clip(c.ta ? x.title : x.title_en || x.title, 300), source: clip(x.publisher, 80) || null, t: x.t ?? null, place: clip(x.loc, 120) || null,
      incidentId: x.incident ?? null, url: typeof x.url === "string" && /^https?:\/\//.test(x.url) && x.url.length <= 2000 ? x.url : null, summary: clip(x.summary, 600) || null })) });
  else blocks.push({ kind: "Note", id: "none", text: c.ta ? `${when.ta} ${subj.ta} பற்றிய செய்தி எதுவும் இல்லை.` : `No news about ${subj.en} ${overWords(when.en)}.` });
  const first = r.rows[0];
  return { title: bi(`News · ${subj.en} · ${when.en}`, `செய்திகள் · ${subj.ta} · ${when.ta}`), takeaway: null, when: whenOf(w),
    say: r.total ? bi(`${spoken(r.total)} ${r.total === 1 ? "story" : "stories"} about ${subj.en} ${overWords(when.en)}. The latest: ${clip(first?.title_en || first?.title, 160)}.`, `${when.ta} ${subj.ta} பற்றி ${spoken(r.total)} செய்திகள். சமீபத்தியது: ${clip(first?.title, 160)}.`)
      : bi(`No news about ${subj.en} ${overWords(when.en)}.`, `${when.ta} ${subj.ta} பற்றிய செய்தி எதுவும் இல்லை.`), blocks };
}

// ------------------------------------------------------------------ readings --

const METRIC_OF: Record<string, { m: WinMetric; en: string; ta: string; unit: string }> = {
  aqi: { m: "aqi", en: "Air quality (AQI)", ta: "காற்றுத் தரம்", unit: "AQI" }, rain: { m: "rainfall_24h_mm", en: "Rainfall", ta: "மழை", unit: "mm" },
  lakes: { m: "lake_pct_full", en: "Lake storage", ta: "ஏரி இருப்பு", unit: "% full" }, temp: { m: "temp_max_c", en: "Maximum temperature", ta: "அதிகபட்ச வெப்பம்", unit: "°C" },
  humidity: { m: "humidity_pct", en: "Humidity", ta: "ஈரப்பதம்", unit: "%" }
};

export async function spanReadings(c: RecipeCtx): Promise<SummaryPart> {
  const w = await windowFor(c, true);
  const key = (c.slots.metric ?? (["rain", "aqi", "lakes", "temp"].includes(String(c.slots.measure)) ? c.slots.measure : "aqi")) as string;
  const M = METRIC_OF[key] ?? METRIC_OF.aqi;
  const zone = c.slots.zones.length === 1 ? c.slots.zones[0] : c.s.zone ?? null;
  c.runs.push(`window_${M.m}`); c.sources.add(M.en);
  const r = await c.h.win!.readings(M.m, w, zone);
  const when = bi(w.label.en, w.label.ta);
  // v18 round 2: a station named in the words ("air quality at Velachery on 20 November"): that station alone
  const said = ` ${`${c.slots.name ?? ""} ${c.slots.place ?? ""} ${c.heard}`.toLowerCase()} `;
  const station = (x: { name: string }) => x.name.replace(/, Chennai - (TNPCB|CPCB)$/, "").replace(/^Chennai-/, "").toLowerCase().split(/[^a-z]+/).filter((t) => t.length >= 5);
  const named = r.rows.filter((x) => station(x).some((t) => said.includes(` ${t}`)));
  const pool = named.length ? named : r.rows;
  const rows = pool.filter((x) => x.inWindow);
  const use = rows.length ? rows : pool;
  if (!rows.length && r.held && (w.to.slice(0, 10) <= r.held.from || w.from.slice(0, 10) > r.held.to)) c.notes.push(c.ta ? `${M.ta} அளவுகள் ${r.held.from} முதல் ${r.held.to} வரை மட்டுமே.` : `${M.en} readings are held from ${boundWords(`${r.held.from} 00:00`)} to ${boundWords(`${r.held.to} 00:00`)} ${r.held.to.slice(0, 4)}; none fall in ${w.label.en}.`);
  const val = (x: (typeof use)[number]) => Math.round((M.m === "rainfall_24h_mm" ? x.max : M.m === "lake_pct_full" ? x.last : x.avg) * 10) / 10;
  const blocks: BlockT[] = [];
  if (use.length) blocks.push({ kind: "Readings", id: M.m, title: clip(c.ta ? `${M.ta} · ${when.ta}` : `${M.en} · ${when.en}`, 160), metric: key, unit: M.unit,
    items: use.slice(0, 18).map((x) => ({ id: clip(x.id, 80), name: clip(x.name.replace(/, Chennai - (TNPCB|CPCB)$/, "").replace(/^Chennai-/, ""), 120), value: val(x), t: x.lastAt, mean28: null, z: null, anomaly: false,
      detail: clip(x.inWindow ? (c.ta ? `குறைந்தது ${spoken(Math.round(x.min))}, அதிகம் ${spoken(Math.round(x.max))}, ${x.count} அளவுகள்` : `${M.m === "rainfall_24h_mm" ? "most in a day" : M.m === "lake_pct_full" ? "latest" : "average"}; low ${spoken(Math.round(x.min))}, high ${spoken(Math.round(x.max))}, ${x.count} readings`)
        : (c.ta ? `கடைசி அளவு ${boundWords(x.lastAt + ":00")}` : `no reading in this window; last ${boundWords(x.lastAt + ":00")}`), 200) })) });
  else blocks.push({ kind: "Note", id: "none", text: c.ta ? `${when.ta} ${M.ta} அளவுகள் இல்லை.` : `No ${M.en.toLowerCase()} readings ${overWords(when.en)}.` });
  if (use.length > 1) blocks.push({ kind: "Chart", id: "chart", title: clip(c.ta ? M.ta : `${M.en} by station`, 160), chart: "hbar", unit: M.unit,
    labels: use.slice(0, 18).map((x) => clip(x.name.replace(/, Chennai - (TNPCB|CPCB)$/, "").replace(/^Chennai-/, ""), 80)), values: use.slice(0, 18).map(val) });
  const top = [...use].sort((a, b) => val(b) - val(a))[0];
  if (!rows.length && r.rows.length) c.notes.push(c.ta ? "இந்தக் காலத்தில் அளவுகள் இல்லை: கடைசி அளவுகள் காட்டப்படுகின்றன." : "No reading falls inside this window: each station's last reading before it is shown, with its date.");
  const short = (x: { name: string }) => clip(x.name.replace(/, Chennai - (TNPCB|CPCB)$/, "").replace(/^Chennai-/, ""), 60);
  // v18 round 3: no reading inside the window: the spoken line says so and gives the latest reading before it with its own date, never an
  // older reading as the window's highest. The newest of the stations on the screen, said as the screen shows it (its value, the date in its line).
  const stale = !rows.length && use.length ? [...use.slice(0, 18)].sort((a, b) => b.lastAt.localeCompare(a.lastAt) || val(b) - val(a))[0] : null;
  const unit = M.unit === "AQI" ? "" : ` ${M.unit}`;
  return { title: bi(`${M.en} · ${when.en}`, `${M.ta} · ${when.ta}`), takeaway: null, when: whenOf(w), blocks,
    say: stale ? bi(`No ${M.en.toLowerCase()} reading falls ${overWords(when.en)}. The latest before it: ${short(stale)} at ${spoken(val(stale))}${unit}, on ${boundWords(stale.lastAt + ":00")}.`,
      `${when.ta} ${M.ta} அளவு எதுவும் இல்லை. அதற்கு முன் கடைசி அளவு: ${short(stale)}, ${spoken(val(stale))}, ${boundWords(stale.lastAt + ":00")}.`)
      : top ? bi(`${M.en} ${overWords(when.en)}: the highest is ${short(top)} at ${spoken(val(top))} ${M.unit === "AQI" ? "" : M.unit}`.trim() + ".",
        `${when.ta} ${M.ta}: அதிகம் ${short(top)}, ${spoken(val(top))}.`) : bi(`No ${M.en.toLowerCase()} readings ${overWords(when.en)}.`, `${when.ta} ${M.ta} அளவுகள் இல்லை.`) };
}

// ------------------------------------------------------------------ prices --

/**
 * the Chennai Uzhavar Sandhai markets whose prices are kept (lib/collector/tnprices.ts TN_MARKETS), by the words that name them. 27 Nov:
 * no "Anna Nagar" or "K.K. Nagar": AGMARKNET's markets of those names are in Madurai and Tiruchirappalli (a place named so is read as its zone)
 */
const MARKETS: [string, RegExp][] = [["Nanganallur", /nanganallur|நங்கநல்லூர்/i], ["Ambattur", /ambattur|அம்பத்தூர்/i], ["Medavakkam", /medavakkam|மேடவாக்கம்/i],
  ["Pallavaram", /pallavaram|பல்லாவரம்/i], ["Keelkattalai", /keel\s*kat+alai|கீழ்க்கட்டளை/i], ["Guduvancheri", /guduvancheri|கூடுவாஞ்சேரி/i], ["Kundrathur", /kundrathur|குன்றத்தூர்/i],
  ["Padappai", /padappai|படப்பை/i]];

/** v18 round 3: produce a price question may name (English, as said): one the report does not hold is said to be missing, never swapped */
const PRODUCE = new Set(("tomato onion potato brinjal eggplant bean carrot cabbage cauliflower garlic ginger lemon coconut drumstick pumpkin cucumber radish " +
  "beetroot chilli chili capsicum coriander mint mango apple grape papaya pineapple guava pomegranate spinach pea bhindi okra banana plantain gourd yam " +
  "tapioca colocasia avocado watermelon jackfruit sapota tamarind").split(" "));
const wordsOf = (s: string) => s.toLowerCase().split(/[^a-z]+/).filter(Boolean);
/** a word's forms as said or written ("tomatoes", "tomatoe", "tomato"; "apples", "apple") */
const formsOf = (x: string) => [x, x.replace(/s$/, ""), x.replace(/es$/, "")];
/** an item's name holds the produce: a word of it in any form, AGMARKNET's own spelling ("Cucumbar", "Raddish") or name ("Bhindi" for okra) */
export function holdsProduce(commodity: string, x: string): boolean {
  const ws = wordsOf(commodity);
  const alias = COMMODITY_ALIAS[x];
  if (alias && ` ${ws.join(" ")} `.includes(` ${alias} `)) return true;
  const xs = formsOf(x);
  return ws.some((y) => formsOf(y).some((f) => xs.includes(f)) || (x.length >= 5 && editDistance(y, x, 1) <= 1));
}
const holds = holdsProduce;

/**
 * v18 round 2 (24 Nov, the owner: "I want any day from any market"): the prices at a market named in the words (else the zone's, else every
 * Chennai market) over the window asked, a single day included. A window with no report held is said to be so, with the days that are held,
 * and the latest prices held are shown under their own date, never as that day's.
 */
export async function spanPrices(c: RecipeCtx): Promise<SummaryPart> {
  const w = await windowFor(c, true);
  const zone = c.slots.zones.length === 1 ? c.slots.zones[0] : c.s.zone ?? null;
  const text = `${c.slots.place ?? ""} ${c.slots.q ?? ""} ${c.heard}`;
  const named = MARKETS.find(([, re]) => re.test(text))?.[0] ?? null;
  c.runs.push("window_prices"); c.sources.add("Uzhavar Sandhai market prices (TN Agricultural Marketing department)");
  const p = await c.h.win!.prices(w, named ? null : zone, named);
  // an item named in the words ("tomato", "onions"): matched by a whole word against the item's own first word, never inside another word
  // ("Anna Nagar" named Banana once: "banana" holds "anna"). v18 round 3: against every item reported (not only the first twelve), and a
  // produce named that the report does not hold is said to be missing, never answered with another item.
  const asked = wordsOf(c.slots.q ?? c.heard);
  const said = new Set(asked.filter((x) => x.length >= 4).flatMap(formsOf));
  const head = (name: string) => wordsOf(name)[0] ?? "";
  const items = [...new Set(asked.map((x) => formsOf(x).find((y) => PRODUCE.has(y))).filter((x): x is string => !!x))];
  const byHead = said.size ? p.rows.filter((r) => formsOf(head(r.commodity)).some((y) => said.has(y))) : [];
  const rows = byHead.length ? byHead : p.rows.filter((r) => items.some((x) => holds(r.commodity, x)));
  const absent = p.rows.length ? items.filter((x) => !p.rows.some((r) => holds(r.commodity, x))) : [];
  const use = rows.length ? rows : p.rows;
  const mk = p.market ? bi(`${p.market} Uzhavar Sandhai`, `${p.market} உழவர் சந்தை`) : bi("Chennai markets", "சென்னைச் சந்தைகள்");
  const when = bi(w.label.en, w.label.ta);
  const L = (en: string, ta: string) => (c.ta ? ta : en);
  const blocks: BlockT[] = [];
  const day = (d: string) => boundWords(`${d} 00:00`);
  const heldWords = p.held ? `${day(p.held.from)} to ${day(p.held.to)} ${p.held.to.slice(0, 4)}` : "";
  // the window has no report: said first, then the latest held, under its own date
  const missing = !p.inWindow;
  // v18 round 3: what data.gov.in really gave, day by day: "had none" only for a day it answered with none, a failure named, a day it was
  // not asked for never claimed
  const o = p.ogd ?? null;
  const days = (ds: string[]) => { const s = [...ds].sort(); return s.length <= 4 ? s.map(day).join(", ") : L(`${s.length} days, ${day(s[0])} to ${day(s.at(-1)!)}`, `${day(s[0])} – ${day(s.at(-1)!)}`); };
  const ogdWords = o ? L([
    o.none.length ? `data.gov.in, asked too, had no Chennai market report for ${days(o.none)}.` : "",
    o.failed.length ? `data.gov.in could not be read for ${days(o.failed)}: ${clip(o.error ?? "", 120)}.` : "",
    o.late.length ? `data.gov.in had not answered for ${days(o.late)} in time; the read goes on and is kept, so asking again shortly may find ${o.late.length > 1 ? "those days" : "it"}.` : "",
    o.capped ? `One answer asks data.gov.in for the newest ${o.tried.length} missing days only.` : ""
  ].filter(Boolean).join(" "), [
    o.none.length ? `data.gov.in-இலும் ${days(o.none)} அறிக்கை இல்லை.` : "",
    o.failed.length ? `data.gov.in படிக்க முடியவில்லை (${days(o.failed)}).` : "",
    o.late.length ? "data.gov.in இன்னும் படிக்கப்படுகிறது; சிறிது நேரத்தில் மீண்டும் கேளுங்கள்." : ""
  ].filter(Boolean).join(" ")) : "";
  const why = missing ? L(`No price report is held for ${w.label.en} at ${mk.en}${p.held ? `: the reports held run from ${heldWords}` : ""}.${p.keyed ? "" : " Newer days are not being collected on this website: AGMARKNET's API asks for a CAPTCHA, and the TN Agricultural Marketing department's price feed is not read here."}`,
    `${w.label.ta} அன்று ${mk.ta} விலை அறிக்கை இல்லை${p.held ? `; உள்ள அறிக்கைகள் ${heldWords}` : ""}.`) : null;
  if (why) blocks.push({ kind: "Note", id: "missing", text: clip(why, 400) });
  // (a window with reports, some of its days unread: said beside the answer; a window with none: shown under the reason)
  if (ogdWords && missing) blocks.push({ kind: "Note", id: "ogd", text: clip(ogdWords, 400) });
  else if (o && (o.failed.length || o.late.length)) c.notes.push(L(`Some days of this window are not in the store yet. ${ogdWords}`, ogdWords));
  // an item asked about that the report does not hold
  const possessive = (s: string) => (/s$/i.test(s) ? `${s}'` : `${s}'s`);
  const cap = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);
  const absentEn = absent.length ? `${absent.length > 1 ? `${absent.slice(0, -1).map(cap).join(", ")} and ${cap(absent.at(-1)!)} are` : `${cap(absent[0])} is`} not in ${possessive(mk.en)} report ${missing ? `for ${day(p.latest ?? "")}, the latest held` : overWords(w.label.en).replace(/^on /, "for ")}.` : "";
  const absentTa = absent.length ? `${absent.map(cap).join(", ")}: ${mk.ta} அறிக்கையில் இல்லை (${missing ? day(p.latest ?? "") : when.ta}).` : "";
  if (absent.length) blocks.push({ kind: "Note", id: "absent", text: clip(L(absentEn, absentTa), 400) });
  if (use.length) {
    // v18 round 3: each item's value is its own last report in the window, which may be an earlier day than another's: its date is beside it
    const shownDays = [...new Set(use.slice(0, 12).map((r) => r.date))];
    const oneDay = shownDays.length === 1 ? shownDays[0] : null;
    blocks.push({ kind: "Ranking", id: "prices", title: clip(missing ? L(`Latest prices held · ${mk.en} · ${day(p.latest ?? "")}`, `கடைசியாக உள்ள விலை · ${mk.ta} · ${day(p.latest ?? "")}`)
      : L(`Vegetable prices · ${mk.en} · ${when.en}`, `காய்கறி விலை · ${mk.ta} · ${when.ta}`), 160), unit: "₹/kg", order: "top",
      method: clip(L(`Modal price a kilo${oneDay ? ` on ${day(oneDay)}` : ": each item's latest report in this window; its date is beside it"}${!missing && use.some((r) => r.firstDate !== r.date) ? "; with it, the change against the window's first report" : ""}. Uzhavar Sandhai retail prices as the markets enter them with the TN Agricultural Marketing department: the middle of each market's low and high.`,
        oneDay ? `கிலோ விலை, ${day(oneDay)}.` : "கிலோ விலை: ஒவ்வொரு பொருளின் கடைசி அறிக்கை; அதன் தேதி அருகில்."), 240),
      about: clip(L(`Each bar: one item's modal (most common) price a kilo at ${mk.en}${p.market ? "" : ", averaged over the markets that reported it"}.`, `ஒவ்வொரு பட்டையும்: ஒரு பொருளின் கிலோ விலை.`), 300),
      items: use.slice(0, 12).map((r, i) => ({ key: clip(r.commodity, 60), label: clip(r.commodity, 120), value: r.perKg, rank: i + 1,
        sub: clip([day(r.date), r.firstDate !== r.date && r.firstPerKg !== r.perKg ? `${r.perKg > r.firstPerKg ? "up" : "down"} from ₹${r.firstPerKg} on ${day(r.firstDate)}` : r.lo != null && r.hi != null ? `₹${r.lo} to ₹${r.hi}` : "",
          r.markets > 1 ? `${r.markets} markets` : ""].filter(Boolean).join(" · "), 160) || null,
        zone: null, lat: null, lon: null, action: "none" as const })) });
  } else if (!why) blocks.push({ kind: "Note", id: "none", text: L("No market reported prices for this window.", "இந்தக் காலத்துக்கு விலை அறிக்கை இல்லை.") });
  if (p.fetched) c.notes.push(L("Days missing from the store were read from data.gov.in (the Open Government Data copy of the market prices) for this answer.", "இல்லாத நாட்கள் data.gov.in-இலிருந்து படிக்கப்பட்டன."));
  // (an item asked about and not reported: no other item's price is said in its place)
  const f = rows.length || !absent.length ? use[0] : undefined;
  const withAbsent = (en: string, ta: string) => bi(`${en} ${absentEn}`.trim(), `${ta} ${absentTa}`.trim());
  const say = missing
    ? withAbsent(`There's no price report for ${w.label.en} at ${mk.en}${p.held ? `; the reports held run from ${heldWords}` : ""}.${f ? ` The latest held, on ${day(f.date)}: ${f.commodity} at ${f.perKg} rupees a kilo.` : ""}`,
      `${w.label.ta} அன்று ${mk.ta} விலை அறிக்கை இல்லை.${f ? ` கடைசியாக ${day(f.date)}: ${f.commodity} கிலோ ${f.perKg} ரூபாய்.` : ""}`)
    : f ? withAbsent(`At ${mk.en}, ${f.commodity} was ${f.perKg} rupees a kilo on ${day(f.date)}.`, `${mk.ta}-ல ${f.commodity} கிலோ ${f.perKg} ரூபாய், ${day(f.date)}.`)
      : absent.length ? bi(absentEn, absentTa) : bi("No market reported prices for this window.", "இந்தக் காலத்துக்கு விலை அறிக்கை இல்லை.");
  return { title: bi(`Vegetable prices · ${mk.en} · ${when.en}`, `காய்கறி விலை · ${mk.ta} · ${when.ta}`), takeaway: null, when: whenOf(w), blocks, say };
}

// ------------------------------------------------------------------ compare --

export async function spanCompare(c: RecipeCtx): Promise<SummaryPart> {
  const w = await windowFor(c);
  const zones = c.slots.zones.slice(0, 4);
  const base = baseSlots(c, w);
  const when = bi(w.label.en, w.label.ta);
  c.runs.push("window_compare"); c.sources.add("incidents (window)");
  const sides = await Promise.all(zones.map((z) => c.h.win!.incidents(w, { ...scopeOf(c, [z]), zone: z, zones: null }, 3)));
  const metrics = [{ key: "n", label: c.ta ? "பதிவானவை" : "Reported" }, { key: "severe", label: c.ta ? "கடுமையானவை" : "Severe" }, { key: "open", label: c.ta ? "நிலுவையில்" : "Still open" },
    { key: "overdue", label: c.ta ? "கெடு தாண்டியவை" : "Past deadline" }, { key: "resolved", label: c.ta ? "தீர்க்கப்பட்டவை" : "Resolved" }, { key: "prev", label: c.ta ? "முந்தைய காலம்" : "The window before" }];
  const name = (z: number) => zoneName(c.w, z)!;
  const allDays = [...new Set(sides.flatMap((s) => s.buckets.map((b) => b.at)))].sort();
  const cmp: Extract<BlockT, { kind: "Compare" }> = { kind: "Compare", id: "cmp", title: clip(c.ta ? `ஒப்பீடு · ${when.ta}` : `Side by side · ${when.en}`, 160), metrics,
    sides: sides.map((s, i) => ({ key: `z${zones[i]}`, label: clip(c.ta ? name(zones[i]).ta : name(zones[i]).en, 80), zone: zones[i], values: { n: s.n, severe: s.severe, open: s.open, overdue: s.overdue, resolved: s.resolved, prev: s.prev },
      cats: s.kinds.slice(0, 5).map((k) => ({ code: clip(k.cat, 40), label: clip(c.ta ? CAT_LABEL_TA[k.cat] ?? k.label : k.label, 80), n: k.n })), series: allDays.map((d) => s.buckets.find((b) => b.at === d)?.n ?? 0).slice(-60) })),
    seriesLabels: allDays.map((d) => boundWords(d.length > 10 ? `${d}:00`.slice(0, 16) : `${d} 00:00`)).slice(-60), diffs: [] };
  for (const m of metrics.slice(0, 4)) {
    const vals = cmp.sides.map((s) => ({ l: s.label, v: s.values[m.key] ?? 0 })).sort((a, b) => b.v - a.v);
    if (vals.length >= 2 && vals[0].v > vals[1].v) cmp.diffs.push({ metric: m.key, label: m.label, hi: vals[0].l, lo: vals.at(-1)!.l, ratio: vals.at(-1)!.v > 0 ? Math.round((vals[0].v / vals.at(-1)!.v) * 10) / 10 : null, gap: vals[0].v - vals.at(-1)!.v });
  }
  const blocks: BlockT[] = [cmp];
  blocks.push({ kind: "Ranking", id: "sides", title: c.ta ? "ஒவ்வொரு பகுதியும்" : "Open each area", unit: "incidents", order: "top", method: c.ta ? "தொட்டால் அந்தப் பகுதியின் முழுச் சுருக்கம்." : "Click an area for its whole summary in this window.",
    items: sides.map((s, i) => ({ key: `z${zones[i]}`, label: clip(c.ta ? name(zones[i]).ta : name(zones[i]).en, 120), value: s.n, rank: i + 1, sub: clip(`${s.severe} severe · ${s.open} open · ${s.overdue} past deadline`, 160),
      zone: zones[i], lat: null, lon: null, action: "zone" as const, drill: summaryDrill(base, { zones: [zones[i]] }, name(zones[i]).en) })).sort((a, b) => b.value - a.value).map((x, i) => ({ ...x, rank: i + 1 })) });
  const lead = [...sides.keys()].sort((a, b) => sides[b].n - sides[a].n)[0];
  const say = sides.length >= 2
    ? bi(`${Over(when.en)}, ${sides.map((s, i) => `${name(zones[i]).en} had ${spoken(s.n)} (${spoken(s.severe)} severe)`).join(", ")}. ${name(zones[lead]).en} had the most.`,
      `${when.ta}: ${sides.map((s, i) => `${name(zones[i]).ta} ${spoken(s.n)} (${spoken(s.severe)} கடுமை)`).join(", ")}. அதிகம் ${name(zones[lead]).ta}.`)
    : bi("Name two areas to compare.", "ஒப்பிட இரண்டு பகுதிகளைச் சொல்லுங்கள்.");
  return { title: bi(`${zones.map((z) => name(z).en).join(" vs ")} · ${when.en}`, `${zones.map((z) => name(z).ta).join(" / ")} · ${when.ta}`), takeaway: null, when: whenOf(w), blocks, say };
}

// ------------------------------------------------------------------ ranking and trend --

/** "which zone had the most cases between 15 and 20 November", "which department has the most open complaints in the last 4 days" */
export async function spanRanking(c: RecipeCtx): Promise<SummaryPart> {
  const m = String(c.slots.measure ?? "zone_incidents");
  if (["rain", "aqi", "lakes", "temp"].includes(m)) return spanReadings({ ...c, slots: { ...c.slots, metric: m as never } });
  const w = await windowFor(c);
  const base = baseSlots(c, w);
  const when = bi(w.label.en, w.label.ta);
  const sc = scopeOf(c);
  c.runs.push("window_ranking"); c.sources.add("incidents (window)");
  const inc = await c.h.win!.incidents(w, { ...sc, zone: m.startsWith("zone") || m === "taluk_open" ? null : sc.zone, zones: null }, 3);
  const bottom = c.slots.order === "bottom";
  const n = c.slots.n ?? 15;
  let block: Extract<BlockT, { kind: "Ranking" }>;
  let lead: { en: string; ta: string; v: number } | null = null;
  if (m.startsWith("dept")) {
    const by = m === "dept_overdue" || m === "dept_backlog" ? "overdue" : m === "dept_open" ? "open" : "n";
    const items = [...inc.depts].sort((a, b) => (bottom ? a[by] - b[by] : b[by] - a[by])).slice(0, n);
    lead = items[0] ? { en: items[0].name, ta: DEPT_TA[items[0].code] ?? items[0].name, v: items[0][by] } : null;
    block = { kind: "Ranking", id: "rank", title: clip(c.ta ? `துறைகள் · ${when.ta}` : `Departments by ${by === "n" ? "incidents" : by === "open" ? "open cases" : "cases past deadline"} · ${when.en}`, 160), unit: "incidents", order: bottom ? "bottom" : "top",
      method: clip(c.ta ? "ஒவ்வொரு சம்பவத்துக்கும் பொறுப்பான துறை, இந்தக் காலத்தில்." : `The department that leads each incident reported ${overWords(when.en)}.`, 240),
      items: items.map((d, i) => ({ key: d.code, label: clip(c.ta ? DEPT_TA[d.code] ?? d.name : d.name, 120), value: d[by], rank: i + 1, sub: clip(`${d.n} reported · ${d.open} open · ${d.overdue} past deadline`, 160), zone: null, lat: null, lon: null, action: "dept" as const,
        drill: summaryDrill(base, { dept: d.code }, d.name) })) };
  } else if (m === "hotspots") {
    const items = inc.places.slice(0, n);
    lead = items[0] ? { en: items[0].place, ta: items[0].place, v: items[0].n } : null;
    block = { kind: "Ranking", id: "rank", title: clip(c.ta ? `அதிகம் புகார் வரும் இடங்கள் · ${when.ta}` : `Hotspots · ${when.en}`, 160), unit: "incidents", order: "top", method: clip(`Incidents by locality, ${when.en}.`, 240),
      items: items.map((p, i) => ({ key: `p${i}`, label: clip(p.place, 120), value: p.n, rank: i + 1, sub: clip(`${p.open} open · ${p.severe} severe`, 160), zone: p.zone, lat: null, lon: null, action: "none" as const, drill: summaryDrill(base, { place: p.place }, p.place) })) };
  } else {
    const by = m === "zone_severe" ? "severe" : m === "zone_open" || m === "taluk_open" ? "open" : "n";
    const items = [...inc.zones].sort((a, b) => (bottom ? a[by] - b[by] : b[by] - a[by])).slice(0, n);
    lead = items[0] ? { en: zoneName(c.w, items[0].zone)?.en ?? items[0].name, ta: zoneName(c.w, items[0].zone)?.ta ?? items[0].name, v: items[0][by] } : null;
    block = { kind: "Ranking", id: "rank", title: clip(c.ta ? `மண்டலங்கள் · ${when.ta}` : `Zones by ${by === "n" ? "incidents" : by === "open" ? "open cases" : "severe incidents"} · ${when.en}`, 160), unit: "incidents", order: bottom ? "bottom" : "top",
      method: clip(c.ta ? "இந்தக் காலத்தில் ஒவ்வொரு மண்டலத்திலும்." : `Incidents reported in each zone ${overWords(when.en)}; beside each, the window before.`, 240),
      items: items.map((z, i) => ({ key: `z${z.zone}`, label: clip(zoneName(c.w, z.zone)?.[c.ta ? "ta" : "en"] ?? z.name, 120), value: z[by], rank: i + 1, sub: clip(`${z.n} reported · ${z.severe} severe · ${z.open} open · ${z.prev} before`, 160),
        zone: z.zone, lat: null, lon: null, action: "zone" as const, drill: summaryDrill(base, { zones: [z.zone] }, z.name) })) };
  }
  const blocks: BlockT[] = [{ kind: "Kpis", id: "kpis", title: clip(c.ta ? `முக்கிய எண்கள் · ${when.ta}` : `Key numbers · ${when.en}`, 120), items: [
    { key: "reported", label: c.ta ? "பதிவானவை" : "Reported", value: inc.n, unit: null, prev: inc.prev, delta: inc.n - inc.prev, tone: inc.n > inc.prev ? "bad" : "neutral", spark: [], drill: summaryDrill(base, { view: "cases" }, "All incidents") },
    { key: "severe", label: c.ta ? "கடுமையானவை" : "Severe", value: inc.severe, unit: null, prev: inc.prevSevere, delta: inc.severe - inc.prevSevere, tone: "bad", spark: [], drill: summaryDrill(base, { view: "cases", sev: "Severe" }, "Severe incidents") },
    { key: "open", label: c.ta ? "நிலுவையில்" : "Still open", value: inc.open, unit: null, prev: null, delta: null, tone: "neutral", spark: [], drill: summaryDrill(base, { view: "cases", status: "open" }, "Still open") }] }, block];
  return { title: bi(block.title, block.title), takeaway: null, when: whenOf(w), blocks,
    say: lead ? bi(`${Over(when.en)}, ${lead.en} ${bottom ? "had the fewest" : "leads"} with ${spoken(lead.v)}.`, `${when.ta} ${lead.ta} ${bottom ? "குறைவு" : "முதலிடம்"}, ${spoken(lead.v)}.`) : bi(`Nothing reported ${overWords(when.en)}.`, `${when.ta} எதுவும் பதிவாகவில்லை.`) };
}

/** "how did flooding move over the last 10 days", "dengue between 1 and 20 November": day by day (hour by hour for two days or less) */
export async function spanTrend(c: RecipeCtx): Promise<SummaryPart> {
  const w = await windowFor(c);
  const base = baseSlots(c, w);
  const when = bi(w.label.en, w.label.ta);
  const subj = subjectWords(c);
  c.runs.push("window_trend"); c.sources.add("incidents (window)");
  const inc = await c.h.win!.incidents(w, scopeOf(c), 5);
  const labels = inc.buckets.map((b) => (inc.byHour ? boundWords(`${b.at}:00`.slice(0, 16)) : boundWords(`${b.at} 00:00`)));
  const peakAt = inc.buckets.reduce((a, b, i) => (b.n > (inc.buckets[a]?.n ?? -1) ? i : a), 0);
  const blocks: BlockT[] = [
    { kind: "Kpis", id: "kpis", title: clip(c.ta ? `முக்கிய எண்கள் · ${when.ta}` : `Key numbers · ${when.en}`, 120), items: [
      { key: "reported", label: c.ta ? "பதிவானவை" : "Reported", value: inc.n, unit: null, prev: inc.prev, delta: inc.n - inc.prev, tone: inc.n > inc.prev ? "bad" : "good", spark: inc.buckets.map((b) => b.n).slice(-60), drill: summaryDrill(base, { view: "cases" }, "All incidents") },
      { key: "severe", label: c.ta ? "கடுமையானவை" : "Severe", value: inc.severe, unit: null, prev: inc.prevSevere, delta: inc.severe - inc.prevSevere, tone: "bad", spark: inc.buckets.map((b) => b.severe).slice(-60), drill: summaryDrill(base, { view: "cases", sev: "Severe" }, "Severe incidents") }] },
    { kind: "Trend", id: "trend", title: clip(c.ta ? `${subj.ta} · ${inc.byHour ? "மணி வாரியாக" : "நாள் வாரியாக"}` : `${subj.en} · ${inc.byHour ? "hour by hour" : "day by day"}`, 160), unit: "incidents",
      labels: labels.slice(-120), values: inc.buckets.map((b) => b.n).slice(-120), marks: inc.buckets.length > 2 ? [{ i: peakAt, why: c.ta ? "அதிகபட்சம்" : "the peak" }] : [], normal: null,
      drills: inc.buckets.map((b) => { const d = daySpec(b.at.slice(0, 10)); return d ? summaryDrill(base, { span: d, period: "daily" }, b.at.slice(0, 10)) : null; }).slice(-120) }];
  if (inc.kinds.length > 1) blocks.push({ kind: "Chart", id: "kinds", title: c.ta ? "வகை வாரியாக" : "By kind", chart: "hbar", unit: "incidents", labels: inc.kinds.slice(0, 8).map((k) => clip(c.ta ? CAT_LABEL_TA[k.cat] ?? k.label : k.label, 80)),
    values: inc.kinds.slice(0, 8).map((k) => k.n), drills: inc.kinds.slice(0, 8).map((k) => summaryDrill(base, { cat: k.cat, family: null }, k.label)) });
  const pk = inc.buckets[peakAt];
  return { title: bi(`${subj.en} · ${when.en}`, `${subj.ta} · ${when.ta}`), takeaway: null, when: whenOf(w), blocks,
    say: inc.n ? bi(`${spoken(inc.n)} ${subj.en.toLowerCase().replace(/&/g, "and")} incidents ${overWords(when.en)}, against ${spoken(inc.prev)} in the window before.${pk ? ` The most came on ${labels[peakAt]}: ${spoken(pk.n)}.` : ""}`,
      `${when.ta} ${subj.ta} ${spoken(inc.n)}; முன்பு ${spoken(inc.prev)}.${pk ? ` அதிகம் ${labels[peakAt]}: ${spoken(pk.n)}.` : ""}`)
      : bi(`No ${subj.en.toLowerCase()} incidents ${overWords(when.en)}.`, `${when.ta} ${subj.ta} எதுவும் இல்லை.`) };
}

// ------------------------------------------------------------------ traffic over a window --

const TRAFFIC_KINDS = ["TRAFFIC_OBSTRUCTION", "ROAD_ACCIDENT", "ROAD_DAMAGE"];

/**
 * v18 round 2 (24 Nov): "summary of live traffic for the past four days", "which roads were most congested in the past 30 days", "the very
 * congested stretches in Anna Nagar last week". From the website's own readings of TomTom, every 10 minutes (lib/city/history.ts): how often each
 * stretch was seen jammed or very congested, its worst delay, the zones, day by day; beside them the district's own traffic records in the same
 * window (police traffic reports, road accidents, road damage), which reach back before the readings began. Nothing is estimated: a stretch's
 * figure is how many readings saw it jammed.
 */
/**
 * "in this window", or the whole days counted when the window is part of a day (v18 round 2's review: a stretch is kept by the day, so its
 * sightings and the readings are counted over the same whole days, and the line says which)
 */
export function wholeDays(w: Pick<Win, "from" | "to" | "partial">, hist: { dayFrom: string; dayTo: string } | null): string {
  if (!hist) return "in this window";
  const whole = w.from.slice(11, 19) === "00:00:00" && (w.to.slice(11, 19) === "00:00:00" || w.partial);
  if (whole) return "in this window";
  const d = (x: string) => boundWords(`${x} 00:00`);
  return hist.dayFrom === hist.dayTo ? `on ${d(hist.dayFrom)} (a stretch is kept by the whole day)` : `from ${d(hist.dayFrom)} to ${d(hist.dayTo)} (a stretch is kept by the whole day)`;
}
export async function spanTraffic(c: RecipeCtx): Promise<SummaryPart> {
  const w = await windowFor(c);
  const zone = c.slots.zones.length === 1 ? c.slots.zones[0] : c.s.zone ?? null;
  const zn = zone ? zoneName(c.w, zone) : null;
  const where = zn ?? bi("Chennai", "சென்னை");
  const when = bi(w.label.en, w.label.ta);
  const ta = !!c.ta;
  const L = (en: string, t: string) => (ta ? t : en);
  const top = Math.max(3, Math.min(15, c.slots.rank?.n ?? c.slots.n ?? 10));
  const least = c.slots.rank?.order === "least";
  c.runs.push("traffic_history"); c.sources.add("TomTom readings (kept every 10 min)");
  const [hist, inc] = await Promise.all([
    c.h.win!.trafficHistory ? c.h.win!.trafficHistory(w, zone).catch(() => null) : Promise.resolve(null),
    c.h.win!.incidents(w, { zone, zones: null, place: null, dept: null, cats: TRAFFIC_KINDS, sev: null, taluk: null, status: null }, 6)
  ]);
  c.sources.add("traffic records (window)");
  const blocks: BlockT[] = [];
  const span = w.custom && c.slots.span ? { span: c.slots.span } : {};
  const base = { q: "traffic", past: true, ...(zone ? { zones: [zone] } : {}), period: w.key, ...span };
  const readings = hist?.readings ?? 0;
  const accidents = inc.kinds.find((k) => k.cat === "ROAD_ACCIDENT")?.n ?? 0;
  const tiles: Extract<BlockT, { kind: "Kpis" }>["items"] = [
    { key: "readings", label: L("Live readings kept", "பதிவான நேரலை அளவீடுகள்"), value: readings, unit: null, prev: null, delta: null, tone: "neutral", spark: [] },
    { key: "stretches", label: L("Stretches seen jammed", "நெரிசல் கண்ட சாலைப் பகுதிகள்"), value: hist?.stretches.filter((s) => s.seen > 0).length ?? 0, unit: null, prev: null, delta: null, tone: "neutral", spark: [] },
    { key: "very", label: L("Very congested sightings", "மிகக் கடும் நெரிசல்"), value: hist?.stretches.reduce((a, s) => a + s.very, 0) ?? 0, unit: null, prev: null, delta: null, tone: "bad", spark: [] },
    { key: "reports", label: L("Traffic reports filed", "போக்குவரத்துப் புகார்கள்"), value: inc.n, unit: null, prev: inc.prev, delta: inc.n - inc.prev, tone: inc.n > inc.prev ? "bad" : "neutral", spark: inc.buckets.map((b) => b.n).slice(-60),
      drill: { recipe: "summary", slots: { ...(zone ? { zones: [zone] } : {}), family: "ROADS_TRAFFIC", view: "cases", period: w.key, ...span, fresh: true }, label: L("Traffic reports", "போக்குவரத்துப் புகார்கள்") } },
    { key: "accidents", label: L("Road accidents reported", "சாலை விபத்துகள்"), value: accidents, unit: null, prev: null, delta: null, tone: accidents ? "bad" : "good", spark: [],
      drill: { recipe: "summary", slots: { ...(zone ? { zones: [zone] } : {}), cat: "ROAD_ACCIDENT", view: "cases", period: w.key, ...span, fresh: true }, label: L("Road accidents", "சாலை விபத்துகள்") } }
  ];
  blocks.push({ kind: "Kpis", id: "kpis", title: clip(L(`Traffic · ${where.en} · ${when.en}`, `போக்குவரத்து · ${where.ta} · ${when.ta}`), 120), items: tiles,
    about: clip(L("Live readings: TomTom's traffic, read and kept by this website every 10 minutes. Reports: the district's own police traffic reports, road accidents and road damage filed in this window.",
      "நேரலை அளவீடுகள்: ஒவ்வொரு 10 நிமிடமும் இந்தத் தளம் படித்துச் சேமிக்கும் TomTom போக்குவரத்து. புகார்கள்: இந்தக் காலத்தில் பதிவான காவல் போக்குவரத்துப் புகார்கள், விபத்துகள், சாலைச் சேதம்."), 300) });
  const ranked = (hist?.stretches ?? []).filter((s) => s.seen > 0);
  const list = least ? [...ranked].sort((a, b) => a.seen - b.seen).slice(0, top) : ranked.slice(0, top);
  if (list.length) blocks.push({ kind: "Ranking", id: "stretches", title: clip(L(least ? `Least often jammed stretches · ${when.en}` : `Most often jammed stretches · ${when.en}`, least ? `குறைவாக நெரிசல் உள்ள சாலைப் பகுதிகள் · ${when.ta}` : `அடிக்கடி நெரிசல் உள்ள சாலைப் பகுதிகள் · ${when.ta}`), 160),
    unit: L("readings", "அளவீடுகள்"), order: least ? "bottom" : "top",
    method: clip(L(`How many of the ${readings} ten-minute ${readings === 1 ? "reading" : "readings"} ${wholeDays(w, hist)} saw each stretch jammed; beside it, how often very congested, its worst delay and its zone.`, `இந்தக் காலத்தின் ${readings} அளவீடுகளில் ஒவ்வொரு பகுதியும் நெரிசலாக இருந்த முறை.`), 240),
    about: clip(L("Click a stretch for its zone's traffic in this window.", "அந்த மண்டலத்தின் போக்குவரத்தைக் காண தொடுங்கள்."), 300),
    items: list.map((s, i) => ({ key: clip(s.stretch, 60), label: clip(s.name, 120), value: s.seen, rank: i + 1,
      sub: clip(L(`${s.very} very congested · worst ${Math.round(s.maxDelayS / 60)} min delay${s.zoneName ? ` · ${s.zoneName}` : ""}${s.closed ? ` · closed ${s.closed}` : ""}${s.flooded ? ` · flooded ${s.flooded}` : ""}`,
        `${s.very} மிகக் கடும் · அதிகபட்ச தாமதம் ${Math.round(s.maxDelayS / 60)} நி.`), 160),
      zone: s.zone, lat: s.lat, lon: s.lon, action: s.zone ? "zone" as const : "none" as const,
      drill: s.zone ? { recipe: "city" as const, slots: { ...base, zones: [s.zone], fresh: true }, label: s.zoneName ?? `Zone ${s.zone}` } : null })) });
  if (!zone && (hist?.zones.length ?? 0) > 1) blocks.push({ kind: "Ranking", id: "zones", title: L(`Zones by jams · ${when.en}`, `மண்டலங்கள் · நெரிசல் · ${when.ta}`), unit: L("sightings", "முறை"), order: "top",
    method: L("Jammed sightings of every stretch in the zone, added up over the window's readings.", "மண்டலத்தின் எல்லாப் பகுதிகளின் நெரிசல் முறைகள்."),
    about: L("Click a zone for its own traffic in this window.", "மண்டலத்தின் போக்குவரத்தைக் காண தொடுங்கள்."),
    items: hist!.zones.slice(0, 15).map((z, i) => ({ key: `z${z.zone}`, label: clip(zoneName(c.w, z.zone)?.[ta ? "ta" : "en"] ?? z.name, 120), value: z.seen, rank: i + 1,
      sub: clip(L(`${z.very} very congested · ${z.stretches} stretches`, `${z.very} மிகக் கடும் · ${z.stretches} பகுதிகள்`), 160), zone: z.zone, lat: null, lon: null, action: "zone" as const,
      drill: { recipe: "city" as const, slots: { ...base, zones: [z.zone], fresh: true }, label: z.name } })) });
  if ((hist?.days.length ?? 0) > 1) blocks.push({ kind: "Trend", id: "days", title: L("Jammed stretches in a reading, day by day", "ஒரு அளவீட்டில் நெரிசல் பகுதிகள், நாள் வாரியாக"), unit: L("stretches", "பகுதிகள்"),
    labels: hist!.days.map((d) => boundWords(`${d.d} 00:00`)), values: hist!.days.map((d) => d.jams), marks: [], normal: null,
    about: L("The average number of stretches jammed at one time, each day (that day's readings averaged).", "ஒவ்வொரு நாளும் ஒரே நேரத்தில் நெரிசலான பகுதிகளின் சராசரி.") });
  if (inc.places.length) blocks.push({ kind: "Ranking", id: "places", title: L(`Where traffic reports came from · ${when.en}`, `போக்குவரத்துப் புகார்கள் வந்த இடங்கள் · ${when.ta}`), unit: L("reports", "புகார்கள்"), order: "top",
    method: L("Police traffic reports, road accidents and road damage filed in this window, by locality.", "இந்தக் காலத்தில் பதிவான போக்குவரத்துப் புகார்கள், இடம் வாரியாக."),
    about: L("Click a place for its reports.", "அந்த இடத்தின் புகார்களைக் காண தொடுங்கள்."),
    items: inc.places.slice(0, 10).map((p, i) => ({ key: `p${i}`, label: clip(p.place, 120), value: p.n, rank: i + 1, sub: clip(`${p.open} open · ${p.severe} severe`, 160), zone: p.zone, lat: null, lon: null, action: "none" as const,
      drill: { recipe: "summary" as const, slots: { place: p.place, family: "ROADS_TRAFFIC", view: "cases", period: w.key, ...span, fresh: true }, label: p.place } })) });
  if (!readings) c.notes.push(L(hist?.since
    ? `TomTom keeps no history: this website has kept its live traffic every 10 minutes since ${boundWords(hist.since)}, and no reading falls in this window. The district's own traffic reports are shown.`
    : "TomTom keeps no history: this website keeps its live traffic every 10 minutes from the day the recorder first ran, and none is kept yet. The district's own traffic reports are shown.",
    "TomTom வரலாற்றைச் சேமிப்பதில்லை: இந்தக் காலத்துக்கு நேரலை அளவீடுகள் இல்லை; மாவட்டத்தின் போக்குவரத்துப் புகார்கள் காட்டப்படுகின்றன."));
  else if (hist?.since && hist.since > w.from) c.notes.push(L(`The live readings begin on ${boundWords(hist.since)}: earlier days of this window have the district's own traffic reports only.`, `நேரலை அளவீடுகள் ${boundWords(hist.since)} முதல் மட்டுமே.`));
  const first = list[0];
  const possessive = /s$/i.test(where.en) ? `${where.en}'` : `${where.en}'s`;
  // (v18 round 2's review: readings with no stretch jammed are said as such, never as "no readings" beside a tile that counts them)
  const en = [!readings ? `${Over(when.en)}, there are no live traffic readings for ${where.en}.`
    : first ? `${Over(when.en)}, ${spoken(readings)} live ${readings === 1 ? "reading" : "readings"} of ${possessive} traffic saw ${spoken(ranked.length)} ${ranked.length === 1 ? "stretch" : "stretches"} jammed; the ${least ? "least" : "most"} often was ${clip(first.name, 90)}, jammed in ${spoken(first.seen)} of them${first.very ? `, very congested in ${spoken(first.very)}` : ""}.`
      : `${Over(when.en)}, ${spoken(readings)} live ${readings === 1 ? "reading" : "readings"} of traffic saw no stretch in ${where.en} jammed.`,
    `The district logged ${spoken(inc.n)} traffic ${inc.n === 1 ? "report" : "reports"}${accidents ? `, ${spoken(accidents)} of them road accidents` : ""}.`];
  const taS = [!readings ? `${when.ta} நேரலை அளவீடுகள் இல்லை.`
    : first ? `${when.ta} ${spoken(readings)} அளவீடுகளில் ${spoken(ranked.length)} பகுதிகள் நெரிசலாக இருந்தன; ${least ? "குறைவு" : "அதிகம்"} ${clip(first.name, 90)}, ${spoken(first.seen)} முறை.`
      : `${when.ta} ${spoken(readings)} அளவீடுகளில் ${where.ta} பகுதியில் நெரிசல் இல்லை.`,
    `மாவட்டத்தில் ${spoken(inc.n)} போக்குவரத்துப் புகார்கள்${accidents ? `, அவற்றில் ${spoken(accidents)} விபத்துகள்` : ""}.`];
  return { title: bi(`Traffic · ${where.en} · ${when.en}`, `போக்குவரத்து · ${where.ta} · ${when.ta}`), takeaway: null, when: whenOf(w), blocks, say: bi(en.join(" "), taS.join(" ")) };
}
