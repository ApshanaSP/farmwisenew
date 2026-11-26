/**
 * "What's the situation (in Adyar)?": one screen that joins what the console knows about a place or the district: the incidents in the
 * window against the window before, the kinds that rose, the console's own unusual rises, the news that names the place, rain at the
 * gauges, the IMD warning in force and the reservoirs. Links are said as links in time ("more flooding reports in Adyar after the rain"),
 * never as causes. Every figure is code's and is on the screen; the spoken line is 2 to 4 short sentences, English and spoken Tamil.
 */
import { spoken } from "../insight";
import { ZONES } from "../lexicon";
import { caseRow, when } from "../screens";
import type { BlockT, Bilingual } from "../stage";
import { unusual } from "./adtributor";
import { RAIN_KINDS, WATER_KINDS, bi, call, catName, clip, inTa, langFor, num, scopeArg, stepFor, windowWords, zoneName, type RecipeCtx, type RecipePart, type Row } from "./common";

const LEVEL: Record<number, Bilingual> = { 1: bi("yellow", "மஞ்சள்"), 2: bi("orange", "ஆரஞ்சு"), 3: bi("red", "சிவப்பு") };
const LAKE_TA: [string, string][] = [["chembarambakkam", "செம்பரம்பாக்கம்"], ["puzhal", "புழல்"], ["red hills", "புழல்"], ["poondi", "பூண்டி"], ["cholavaram", "சோழவரம்"], ["veeranam", "வீராணம்"], ["kannankottai", "கண்ணன்கோட்டை"]];
const lakeTa = (name: string) => LAKE_TA.find(([k]) => name.toLowerCase().includes(k))?.[1] ?? null;
/** rain worth saying: a gauge at 10 mm or more in 24 hours */
const WET_MM = 10;

/** the words that name a zone in a news report: its names in both languages and the gazetteer's places inside it */
function zoneWords(c: RecipeCtx, zone: number): string[] {
  const z = ZONES[zone];
  const out = [...(z?.en ?? []), ...(z?.ta ?? []), c.w.zones.find((x) => x.n === zone)?.name ?? ""];
  for (const p of c.w.places) if (p.zone === zone) out.push(p.name, ...p.aliases);
  return [...new Set(out.map((x) => x.toLowerCase().trim()).filter((x) => x.length >= 4))];
}

export async function situationRecipe(c: RecipeCtx): Promise<RecipePart> {
  const { s, w } = c;
  const lang = langFor(c);
  const L = (en: string, ta: string) => (lang === "ta" ? ta : en);
  const win = windowWords(s.period);
  const zone = zoneName(w, s.zone);
  const [drv, rainR, warnR, lakeR, risesR, newsR] = await Promise.all([
    call(c, "change_drivers", { scope: scopeArg(s) }),
    call(c, "environment", { metric: "rainfall_24h_mm" }).catch(() => null),
    call(c, "environment", { metric: "imd_warning_level" }).catch(() => null),
    call(c, "environment", { metric: "lake_pct_full" }).catch(() => null),
    call(c, "unusual_rises", { scope: scopeArg({ ...s, zone: null }) }).catch(() => null),
    c.h.news({ ...s, zone: null, dept: null, cat: null, taluk: null }).then((x) => { c.runs.push("console_news"); c.sources.add("console latest news"); return x; }).catch(() => null)
  ]);
  const d = (drv.data ?? {}) as Row;
  const t = (d.totals ?? {}) as Row;
  const now = num(t.n), before = num(t.prev);
  if (now == null || before == null) throw new Error("change_drivers gave no totals for the two windows");
  const overdue = num(t.overdue), linked = num(t.rainLinked), rainDays = num(d.rainDays), rainDaysBefore = num(d.rainDaysPrev);
  const gauges = (((rainR?.data as Row | undefined)?.rows ?? []) as Row[]).filter((x) => num(x.value) != null).sort((a, b) => Number(b.value) - Number(a.value));
  const wettest = gauges[0] ? { name: clip(gauges[0].place, 120), mm: Math.round(Number(gauges[0].value) * 10) / 10 } : null;
  const level = num((warnR?.data as Row | undefined)?.warning?.level);
  const lakes = (((lakeR?.data as Row | undefined)?.rows ?? []) as Row[]).filter((x) => num(x.value) != null).sort((a, b) => Number(b.value) - Number(a.value));
  const fullest = lakes[0] ? { name: clip(lakes[0].place, 120), pct: Math.round(Number(lakes[0].value)) } : null;
  const rises = (((risesR?.data as Row | undefined)?.rows ?? []) as Row[]).filter((x) => num(x.observed) != null && num(x.expected) != null && (!s.zone || Number(x.zone) === s.zone))
    .sort((a, b) => Number(b.ratio ?? 0) - Number(a.ratio ?? 0)).slice(0, 3);
  const words = s.zone ? zoneWords(c, s.zone) : [];
  const news = ((newsR?.rows ?? []) as Row[]).filter((x) => !s.zone || words.some((wd) => `${x.loc ?? ""} ${x.title ?? ""}`.toLowerCase().includes(wd))).slice(0, 10);
  // rain in the window: a 24-hour window is set against the gauges, a longer one against its rain days
  const wet = s.period === "daily" ? !!wettest && wettest.mm >= WET_MM : rainDays != null && rainDays > 0;
  // the kinds that rose; the rain-linked ones among them, when it rained, are the link to say
  const cats = ((d.categories ?? []) as Row[]).filter((x) => x.code && num(x.n) != null && num(x.prev) != null)
    .map((x) => ({ code: String(x.code), name: catName(w, String(x.code), clip(x.label, 80)) ?? bi(String(x.code), String(x.code)), now: Number(x.n), before: Number(x.prev), d: Number(x.n) - Number(x.prev) }))
    .filter((x) => x.d > 0).sort((a, b) => b.d - a.d);
  const afterRain = wet ? cats.find((x) => RAIN_KINDS.has(x.code)) ?? null : null;
  const lead = afterRain ?? cats[0] ?? null;

  const blocks: BlockT[] = [];
  // at most five tiles (the catalog holds six)
  const tiles: Extract<BlockT, { kind: "Kpis" }>["items"] = [
    { key: "now", label: clip(L(`Reported, ${win.now.en}`, `பதிவானவை, ${win.now.ta}`), 80), value: now, unit: null, prev: before, delta: now - before, tone: now > before ? "bad" : now < before ? "good" : "neutral", spark: [] },
    { key: "before", label: clip(L(`Reported, ${win.before.en}`, `பதிவானவை, ${win.before.ta}`), 80), value: before, unit: null, prev: null, delta: null, tone: "neutral", spark: [] },
    ...(overdue != null ? [{ key: "overdue", label: L("Open past their deadline", "காலக்கெடு தாண்டியவை"), value: overdue, unit: null, prev: null, delta: null, tone: overdue ? "bad" as const : "good" as const, spark: [] }] : []),
    ...(rainDays != null ? [{ key: "raindays", label: L("Rain days", "மழை நாட்கள்"), value: rainDays, unit: null, prev: rainDaysBefore, delta: rainDaysBefore == null ? null : rainDays - rainDaysBefore, tone: "neutral" as const, spark: [] }] : []),
    ...(linked ? [{ key: "rain", label: L("During or after rain", "மழையின் போது அல்லது பிறகு"), value: linked, unit: null, prev: null, delta: null, tone: "neutral" as const, spark: [] }] : [])
  ];
  blocks.push({ kind: "Kpis", id: "kpis", title: L("The situation", "நிலவரம்"), items: tiles.slice(0, 6) });
  const items: Extract<BlockT, { kind: "Findings" }>["items"] = [];
  if (lead) {
    const u = unusual(lead.now, lead.before);
    items.push({ title: clip(afterRain ? L(`More ${lead.name.en.toLowerCase()} reports after the rain: ${lead.now} against ${lead.before}`, `மழைக்குப் பிறகு ${lead.name.ta} புகார்கள் அதிகம்: ${lead.now}, முன்பு ${lead.before}`)
      : L(`${lead.name.en} rose the most: ${lead.now} against ${lead.before}`, `${lead.name.ta} அதிகம் உயர்ந்தது: ${lead.now}, முன்பு ${lead.before}`), 240), value: lead.d, unit: L("more", "கூடுதல்"),
      method: clip(afterRain ? L(`Rose in the same window as the rain (${s.period === "daily" && wettest ? `${wettest.mm} mm at the wettest gauge` : `${rainDays} rain days against ${rainDaysBefore ?? 0} before`}); ${u.flag ? `outside its 99% band of ${u.band.lo} to ${u.band.hi}` : `within its 99% band of ${u.band.lo} to ${u.band.hi}`}`,
        `மழை பெய்த அதே காலத்தில் உயர்ந்தது (${s.period === "daily" && wettest ? `அதிக மழை மானியில் ${wettest.mm} மி.மீ` : `${rainDays} மழை நாட்கள், முன்பு ${rainDaysBefore ?? 0}`}); 99% வரம்பு ${u.band.lo}–${u.band.hi}`)
        : L(`The kind with the biggest rise against the window before; 99% band ${u.band.lo} to ${u.band.hi}`, `முந்தைய காலத்தை விட அதிகம் உயர்ந்த வகை; 99% வரம்பு ${u.band.lo}–${u.band.hi}`), 200),
      n: lead.now + lead.before, caveat: afterRain ? L("A link in time, not proof of what is behind it.", "நேரத்தில் மட்டுமே தொடர்பு; பின்னணிக்கான சான்று அல்ல.") : L("Shows where the change sits, not what is behind it.", "மாற்றம் எங்கே என்று மட்டும் காட்டுகிறது, அதன் பின்னணியை அல்ல."),
      tone: u.flag === "high" ? "bad" : "warn" });
  }
  for (const r of rises) {
    const z = zoneName(w, num(r.zone));
    const kind = catName(w, String(r.cat ?? ""), clip(r.label, 80)) ?? bi(clip(r.label, 80), clip(r.label, 80));
    const at = when(r.date) ?? clip(r.date, 20);
    items.push({ title: clip(L(`Unusual rise: ${kind.en}${z ? ` in ${z.en}` : ""}, ${Number(r.observed)} against a usual ${Number(r.expected)}`, `அசாதாரண உயர்வு: ${z ? `${inTa(z.ta)} ` : ""}${kind.ta}, ${Number(r.observed)}, வழக்கமாக ${Number(r.expected)}`), 240),
      value: Number(r.observed), unit: L("reports", "புகார்கள்"), method: clip(L(`The console's own check (a 28-day baseline with weekday and rain factors, after a false-discovery check), ${at}`, `கன்சோலின் சொந்தச் சோதனை (28 நாள் அடிப்படை, வாரநாள், மழைக் காரணிகளுடன்), ${at}`), 200),
      n: Number(r.observed), caveat: L("Descriptive only; no forecast.", "விவரிப்பு மட்டுமே; முன்கணிப்பு அல்ல."), tone: "bad" });
  }
  if (level != null && level >= 1) items.push({ title: L(`IMD ${LEVEL[Math.min(3, Math.round(level))].en} warning in force`, `வானிலை மையத்தின் ${LEVEL[Math.min(3, Math.round(level))].ta} எச்சரிக்கை`), value: level, unit: L("level", "நிலை"),
    method: L("IMD warning level in force (0 green to 3 red)", "நடப்பில் உள்ள வானிலை எச்சரிக்கை நிலை (0 பச்சை முதல் 3 சிவப்பு)"), n: 1, caveat: L("Issued for the district, not for one place.", "மாவட்டம் முழுவதற்கானது, ஒரு இடத்துக்கு மட்டும் அல்ல."), tone: level >= 2 ? "bad" : "warn" });
  if (fullest && fullest.pct >= 75) items.push({ title: clip(L(`${fullest.name}: ${fullest.pct}% full`, `${lakeTa(fullest.name) ?? "அதிகம் நிரம்பிய நீர்த்தேக்கம்"}: ${fullest.pct}% நிரம்பியுள்ளது`), 240), value: fullest.pct, unit: "% full",
    method: clip(L(`The fullest of ${lakes.length} reservoirs, latest reading`, `${lakes.length} நீர்த்தேக்கங்களில் அதிகம் நிரம்பியது, சமீபத்திய அளவு`), 200), n: lakes.length, caveat: L("Storage is read once a day.", "இருப்பு நாளுக்கு ஒருமுறை அளக்கப்படுகிறது."), tone: fullest.pct >= 90 ? "bad" : "warn" });
  if (items.length) blocks.push({ kind: "Findings", id: "links", title: L("What goes with what", "எது எதனுடன்"), items: items.slice(0, 8) });
  if (gauges.length && (wet || (level ?? 0) >= 1)) blocks.push({ kind: "Readings", id: "rain", title: L("Rainfall, last 24 hours", "கடந்த 24 மணி நேர மழை"), metric: "rain", unit: "mm",
    items: gauges.slice(0, 8).map((x) => ({ id: clip(String(x.place_id ?? x.place), 80), name: clip(x.place, 120), value: Math.round(Number(x.value) * 10) / 10, t: x.t ?? null,
      mean28: num(x.mean28) == null ? null : Math.round(Number(x.mean28) * 10) / 10, z: num(x.zscore), anomaly: !!x.anomaly, detail: null })) });
  if (lakes.length && (fullest?.pct ?? 0) >= 75 && lead && WATER_KINDS.has(lead.code)) blocks.push({ kind: "Readings", id: "lakes", title: L("Reservoir storage", "நீர்த்தேக்க இருப்பு"), metric: "lakes", unit: "% full",
    items: lakes.slice(0, 8).map((x) => ({ id: clip(String(x.place_id ?? x.place), 80), name: clip(x.place, 120), value: Math.round(Number(x.value)), t: x.t ?? null, mean28: num(x.mean28) == null ? null : Math.round(Number(x.mean28)), z: null, anomaly: !!x.anomaly, detail: null })) });
  if (news.length) blocks.push({ kind: "NewsReader", id: "news", title: zone ? L(`In the news: ${zone.en}`, `செய்திகளில்: ${zone.ta}`) : L("In the news", "செய்திகளில்"), total: news.length, items: news.map((x) => ({
    id: clip(x.id, 120), title: clip(x.title, 300), source: clip((x.outletNames ?? [])[0] ?? x.publisher, 80) || null, t: x.t ?? null, place: clip(x.loc, 120) || null, incidentId: x.incident ?? null,
    url: typeof x.url === "string" && /^https?:\/\//.test(x.url) && x.url.length <= 2000 ? x.url : null })) });
  const top = ((d.top ?? []) as Row[]).map((x) => caseRow({ ...x, sev: x.severity ?? x.sev, why: null, reasons: x.reasons }, w));
  if (top.length) blocks.push({ kind: "CaseList", id: "top", title: L("The open incidents that rank highest here", "இங்கே முன்னுரிமை உள்ள திறந்த சம்பவங்கள்"), source: "list", sev: null, total: top.length, rows: top });

  // the spoken line: how it stands, the link, the conditions, what I'd do
  const where = zone ? bi(`In ${zone.en}`, inTa(zone.ta)) : bi("Across the district", "மாவட்டம் முழுக்க");
  const en: string[] = [`${where.en}, ${spoken(now)} incidents came in ${win.over.en} against ${spoken(before)} ${win.before.en}.`];
  const ta: string[] = [`${where.ta} ${win.now.ta} ${spoken(now)} சம்பவங்கள் வந்திருக்கு, ${win.before.ta} ${spoken(before)}.`];
  const placeEn = zone ? ` in ${zone.en}` : "", placeTa = zone ? `${inTa(zone.ta)} ` : "";
  if (afterRain) {
    en.push(`There are more ${afterRain.name.en.toLowerCase().replace(/&/g, "and")} reports${placeEn} after the rain: ${spoken(afterRain.now)} against ${spoken(afterRain.before)}.`);
    ta.push(`மழைக்கு அப்புறம் ${placeTa}${afterRain.name.ta} புகார் கூடியிருக்கு: ${spoken(afterRain.now)}, முன்னாடி ${spoken(afterRain.before)}.`);
  } else if (rises[0]) {
    const r = rises[0];
    const kind = catName(w, String(r.cat ?? ""), clip(r.label, 80)) ?? bi(clip(r.label, 80), clip(r.label, 80));
    const z = zoneName(w, num(r.zone));
    en.push(`There's an unusual rise in ${kind.en.toLowerCase().replace(/&/g, "and")}${z ? ` in ${z.en}` : ""}: ${spoken(Number(r.observed))} reports against a usual ${spoken(Number(r.expected))}.`);
    ta.push(`${z ? `${inTa(z.ta)} ` : ""}${kind.ta} அசாதாரணமா கூடியிருக்கு: ${spoken(Number(r.observed))}, வழக்கமா ${spoken(Number(r.expected))}.`);
  } else if (lead) {
    en.push(`${lead.name.en} rose the most, ${spoken(lead.d)} more.`);
    ta.push(`${lead.name.ta} அதிகமா கூடியிருக்கு, ${spoken(lead.d)} கூட.`);
  }
  const cond: Bilingual[] = [];
  if (level != null && level >= 1) cond.push(bi(`an IMD ${LEVEL[Math.min(3, Math.round(level))].en} warning is in force`, `வானிலை மையத்தோட ${LEVEL[Math.min(3, Math.round(level))].ta} எச்சரிக்கை இருக்கு`));
  if (fullest && fullest.pct >= 80) cond.push(bi(`${fullest.name} is ${spoken(fullest.pct)}% full`, `${lakeTa(fullest.name) ?? "ஒரு ஏரி"} ${spoken(fullest.pct)}% நிரம்பியிருக்கு`));
  if (!cond.length && s.period === "daily" && wettest && wettest.mm >= WET_MM) cond.push(bi(`the wettest gauge, ${wettest.name}, read ${spoken(wettest.mm)} mm in the last 24 hours`, `கடந்த 24 மணி நேரத்துல அதிக மழை ${spoken(wettest.mm)} மி.மீ`));
  if (cond.length) { const j = cond.slice(0, 2); en.push(`${j[0].en.charAt(0).toUpperCase()}${j.map((x) => x.en).join(", and ").slice(1)}.`); ta.push(`${j.map((x) => x.ta).join("; ")}.`); }
  if (lead && now > before) {
    const step = stepFor(lead.code);
    en.push(`I'd ${step.en}${overdue ? `, and chase the ${spoken(overdue)} cases past their deadline` : ""}.`);
    ta.push(`${step.ta}${overdue ? `; கெடு தாண்டின ${spoken(overdue)} சம்பவங்களையும் கேட்கலாம்` : ""}.`);
  } else if (overdue) {
    en.push(`I'd chase the ${spoken(overdue)} cases past their deadline.`);
    ta.push(`கெடு தாண்டின ${spoken(overdue)} சம்பவங்களைக் கேட்கலாம்.`);
  }
  c.notes.push(L("A link here is in time and place only: things that happened together, not what made them happen.", "இங்குள்ள தொடர்பு நேரம், இடம் மட்டுமே: சேர்ந்து நடந்தவை, ஒன்றால் மற்றொன்று நடந்ததாக அல்ல."));
  const title = L(`The situation${zone ? ` · ${zone.en}` : " · Chennai district"} · ${win.now.en}`, `நிலவரம்${zone ? ` · ${zone.ta}` : " · சென்னை மாவட்டம்"} · ${win.now.ta.replace(/த்துல$/, "ம்").replace(/ல$/, "")}`);
  return { title, takeaway: en[1] ? bi(en[1], ta[1] ?? ta[0]) : null, say: bi(en.slice(0, 4).join(" "), ta.slice(0, 4).join(" ")), blocks: blocks.slice(0, 6) };
}
