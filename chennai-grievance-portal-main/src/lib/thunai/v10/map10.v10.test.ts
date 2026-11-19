/**
 * v10: Ask the Map by voice, the grammar (map10.ts). Each of the eleven features and the two new ones, in English, Tamil and Tanglish; and the
 * sentences that are not the map's: news, console filters, cases, page moves, "next" with no tour, an export with no answer on the map.
 */
import { describe, expect, it } from "vitest";
import { deptFromWords } from "@/lib/assistant/deptwords";
import type { RefNames } from "@/lib/assistant/scope";
import { fixtureResolver } from "@/lib/map/fixture";
import { makeResolver } from "@/lib/map/resolve";
import { rulesRoute, type RouteEnv } from "@/lib/map/route";
import { WORLD } from "../fixture";
import { referenceWorld } from "../world";
import { browserLaneV10, type BrowserCtx10 } from "./browser10";
import { anchorKind, anchorOf, distance10, mapCommand10, nearKm, prep10, taBase, withDigits, type ChipCtx, type MapCtx10 } from "./map10";

const CLOSED: MapCtx10 = { open: false, hasAnswer: false, lang: "en" };
const OPEN: MapCtx10 = { open: true, hasAnswer: false, lang: "en" };
const CHIPS: ChipCtx[] = [
  { id: "category", en: "Flooding", ta: "வெள்ளம்", removable: true, options: [] },
  { id: "status", en: "Open", ta: "திறந்தவை", removable: false, options: [{ key: "open", en: "Open", ta: "திறந்தவை", on: true }, { key: "closed", en: "Closed", ta: "முடிந்தவை", on: false }, { key: "any", en: "Any status", ta: "எந்த நிலையும்", on: false }] },
  { id: "period", en: "Last 7 days", ta: "கடந்த 7 நாட்கள்", removable: false, options: [{ key: "1", en: "Last 1 day", ta: "1", on: false }, { key: "7", en: "Last 7 days", ta: "7", on: true }, { key: "30", en: "Last 30 days", ta: "கடந்த 30 நாட்கள்", on: false }] },
  { id: "overdue", en: "Past deadline", ta: "காலக்கெடு தாண்டியவை", removable: true, options: [] },
  { id: "d:near", en: "Within 500 m", ta: "500 மீ க்குள்", removable: false, options: [100, 200, 300, 500, 1000, 2000].map((m) => ({ key: String(m), en: m < 1000 ? `${m} m` : `${m / 1000} km`, ta: String(m), on: m === 500 })) }
];
const ANSWER: MapCtx10 = { open: true, hasAnswer: true, kind: "answer", total: 42, question: "open flooding within 500 m of hospitals", shots: 1, shot: 0, chips: CHIPS.map((c) => c.en), chipOpts: CHIPS, lang: "en" };
const HOT: MapCtx10 = { ...ANSWER, shots: 4, question: "where are garbage complaints clustering" };
const TOUR: MapCtx10 = { ...HOT, tour: true };
const CHECK: MapCtx10 = { ...TOUR, tourCheck: true };
const RAIN: MapCtx10 = { ...CLOSED, rainOpen: true };
const op = (t: string, c: MapCtx10) => mapCommand10(t, c)?.op ?? null;

describe("the words: prep, numbers, places", () => {
  it("prep: punctuation, Tanglish hyphens, Tamil loanwords, the name and politeness", () => {
    expect(prep10("Jarvis, export this as CSV please.")).toBe("export this as csv");
    expect(prep10("Kasimedu-la rendu km kulla")).toBe("kasimedu la rendu km kulla");
    expect(prep10("மேப்ல காட்டு")).toBe("map la காட்டு");
    expect(prep10("1.5 km around Adyar")).toBe("1.5 km around adyar");
    expect(prep10("2km")).toBe("2 km");
  });
  it("number words to a distance, in three languages", () => {
    const km = (t: string) => distance10(prep10(t))?.km ?? null;
    expect(km("within two kilometres of Kasimedu")).toBe(2);
    expect(km("within 2 km of Kasimedu")).toBe(2);
    expect(km("half a kilometre around Adyar")).toBe(0.5);
    expect(km("one and a half km from the harbour")).toBe(1.5);
    expect(km("five hundred metres around the bus stand")).toBe(0.5);
    expect(km("300 m of schools")).toBe(0.3);
    expect(km("twenty five hundred")).toBe(null);
    expect(km("Kasimedu-la rendu km kulla")).toBe(2);
    expect(km("Adyar la arai km kulla")).toBe(0.5);
    expect(km("onnarai km kulla")).toBe(1.5);
    expect(km("காசிமேட்டிலிருந்து இரண்டு கிலோமீட்டருக்குள்")).toBe(2);
    expect(km("அடையாறு அருகே அரை கிலோமீட்டர்")).toBe(0.5);
    expect(km("ஐநூறு மீட்டர் சுற்றளவில்")).toBe(0.5);
    expect(km("ஒன்றரை கி.மீ")).toBe(1.5);
    expect(km("I'm near the station")).toBe(null);
  });
  it("number words as they are said: 'and half', 'point', a count before 'thousand' or 'nooru' (v10 review 2, finding 16)", () => {
    const km = (t: string) => distance10(prep10(t))?.km ?? null;
    expect(km("within one and half km of Adyar")).toBe(1.5);
    expect(km("within two point five kilometres of Adyar")).toBe(2.5);
    expect(km("within two thousand metres of Adyar")).toBe(2);
    expect(km("Adyar la anju nooru meter kulla")).toBe(0.5);
    expect(km("twenty five hundred metres around the bus stand")).toBe(2.5);
    expect(km("two hundred and fifty metres from the school")).toBe(0.25);
    expect(withDigits(prep10("within two point five kilometres of Adyar"))).toBe("within 2.5 km of adyar");
    // the radius the circle asks with is the one said
    expect(mapCommand10("within one and half km of Adyar", CLOSED)).toEqual({ op: "circle", place: "Adyar", km: 1.5, question: "what is happening within 1.5 km of Adyar" });
  });
  it("number words become digits in the question the map reads", () => {
    expect(withDigits(prep10("complaints within two kilometres of Kasimedu"))).toBe("complaints within 2 km of kasimedu");
    expect(withDigits(prep10("make it five hundred metres"))).toBe("make it 500 m");
    expect(withDigits(prep10("காசிமேட்டிலிருந்து இரண்டு கிலோமீட்டருக்குள்"))).toBe("காசிமேட்டிலிருந்து 2 கிலோமீட்டருக்குள்");
  });
  it("Tamil place words lose their case endings", () => {
    expect(taBase("காசிமேட்டிலிருந்து")).toBe("காசிமேடு");
    expect(taBase("அடையாற்றில்")).toBe("அடையாறு");
    expect(taBase("வேளச்சேரியில்")).toBe("வேளச்சேரி");
    expect(taBase("தண்டையார்பேட்டையில்")).toBe("தண்டையார்பேட்டை");
    expect(taBase("மயிலாப்பூரில்")).toBe("மயிலாப்பூர்");
    expect(taBase("காசிமேட்டுக்கு")).toBe("காசிமேடு");
    expect(taBase("காசிமேடு")).toBe("காசிமேடு");
  });
  it("the place a spatial sentence is about", () => {
    expect(anchorOf(prep10("within two kilometres of Kasimedu"))).toBe("Kasimedu");
    expect(anchorOf(prep10("2 km around the Koyambedu bus stand"))).toBe("Koyambedu Bus Stand");
    expect(anchorOf(prep10("complaints near Kasimedu within 2 km"))).toBe("Kasimedu");
    expect(anchorOf(prep10("Kasimedu-la rendu km kulla"))).toBe("Kasimedu");
    expect(anchorOf(prep10("Adyar pakkathula enna nadakkudhu"))).toBe("Adyar");
    expect(anchorOf(prep10("காசிமேட்டிலிருந்து இரண்டு கிலோமீட்டருக்குள்"))).toBe("காசிமேடு");
    expect(anchorOf(prep10("காசிமேட்டுக்கு அருகில் என்ன நடக்கிறது"))).toBe("காசிமேடு");
    expect(anchorOf(prep10("what is happening near here"))).toBe(null);
  });
  it("the default 'near' radius is chosen in code by what the place is", () => {
    expect(anchorKind("Koyambedu bus stand")).toBe("point");
    expect(nearKm("Koyambedu bus stand")).toBe(0.5);
    expect(anchorKind("Anna Salai")).toBe("line");
    expect(nearKm("Buckingham canal")).toBe(0.5);
    expect(anchorKind("the harbour")).toBe("large");
    expect(nearKm("Chembarambakkam lake")).toBe(1);
    expect(anchorKind("Kasimedu")).toBe("locality");
    expect(nearKm("Kasimedu")).toBe(1);
    expect(anchorKind("ward 5")).toBe("area");
  });
});

describe("1. a question on the map", () => {
  it("asked of the map by name, in three languages", () => {
    expect(mapCommand10("Ask the map where garbage complaints are clustering", CLOSED)).toEqual({ op: "ask", question: "where garbage complaints are clustering" });
    expect(mapCommand10("show flooding on the map", CLOSED)).toEqual({ op: "ask", question: "flooding" });
    expect(mapCommand10("Adyar flooding map-la kaattu", CLOSED)).toEqual({ op: "ask", question: "adyar flooding" });
    expect(mapCommand10("வரைபடத்தில் அடையாற்றில் திறந்த புகார்கள்", CLOSED)).toEqual({ op: "ask", question: "அடையாற்றில் திறந்த புகார்கள்" });
    // "near" a place on the map, said in Tamil: a circle with the radius for a locality
    expect(mapCommand10("வரைபடத்தில் அடையாறு அருகே திறந்த புகார்கள்", CLOSED)).toMatchObject({ op: "circle", place: "அடையாறு", km: 1, near: true });
    expect(mapCommand10("open ask the map", CLOSED)).toEqual({ op: "ask", question: null });
  });
  it("a place question while the map is open", () => {
    expect(mapCommand10("where are garbage complaints clustering", OPEN)).toEqual({ op: "ask", question: "where are garbage complaints clustering" });
    expect(op("what is happening in Teynampet", OPEN)).toBe("ask");
    expect(op("where are garbage complaints clustering", CLOSED)).toBe(null);
  });
  it("a reference on the map ('this case', 'it') is not a question the map can read: the planner has the case in focus (v10 review 2, finding 15)", () => {
    for (const t of ["show this case on the map", "show this incident on the map", "show it on the map", "show that complaint on the map", "show this one on the map"]) {
      for (const c of [CLOSED, OPEN, ANSWER]) expect(mapCommand10(t, c), t).toBe(null);
    }
    expect(mapCommand10("show garbage complaints on the map", CLOSED)).toEqual({ op: "ask", question: "garbage complaints" });
  });
});

describe("2. follow-ups and chips", () => {
  it("follow-ups that edit the answer, in three languages", () => {
    expect(mapCommand10("only the severe ones", ANSWER)).toEqual({ op: "followup", question: "only severe" });
    expect(mapCommand10("severe mattum kaattu", ANSWER)).toEqual({ op: "followup", question: "only severe" });
    expect(mapCommand10("கடுமையானவை மட்டும்", ANSWER)).toEqual({ op: "followup", question: "only severe" });
    expect(mapCommand10("now for last month", ANSWER)).toEqual({ op: "followup", question: "last month" });
    expect(mapCommand10("pona maasathukku kaattu", ANSWER)).toEqual({ op: "followup", question: "last month" });
    expect(mapCommand10("கடந்த மாதத்துக்கு", ANSWER)).toEqual({ op: "followup", question: "last month" });
    expect(mapCommand10("make it two km", ANSWER)).toEqual({ op: "followup", question: "make it 2 km" });
    expect(mapCommand10("rendu km aakku", ANSWER)).toEqual({ op: "followup", question: "make it 2 km" });
    expect(mapCommand10("show by ward", ANSWER)).toEqual({ op: "followup", question: "show by ward" });
    expect(mapCommand10("which department has the most?", ANSWER)?.op).toBe("followup");
    expect(mapCommand10("and thefts?", ANSWER)).toEqual({ op: "followup", question: "and thefts" });
    expect(mapCommand10("what about Velachery?", ANSWER)).toEqual({ op: "followup", question: "what about velachery" });
    expect(mapCommand10("why these?", ANSWER)?.op).toBe("followup");
    expect(mapCommand10("only the ones in the news", ANSWER)?.op).toBe("followup");
  });
  it("a chip by its own label, and wider or closer", () => {
    expect(mapCommand10("last 30 days", ANSWER)).toEqual({ op: "chip", chip: "period", option: "30" });
    expect(mapCommand10("any status", ANSWER)).toEqual({ op: "chip", chip: "status", option: "any" });
    expect(mapCommand10("remove past deadline", ANSWER)).toEqual({ op: "chip", chip: "overdue", option: null });
    expect(mapCommand10("wider", ANSWER)).toEqual({ op: "chip", chip: "d:near", scale: 2 });
    expect(mapCommand10("closer", ANSWER)).toEqual({ op: "chip", chip: "d:near", scale: 0.5 });
    expect(mapCommand10("பெரிதாக்கு", ANSWER)).toEqual({ op: "chip", chip: "d:near", scale: 2 });
    expect(mapCommand10("innum perisa pannu", ANSWER)).toEqual({ op: "chip", chip: "d:near", scale: 2 });
  });
  it("with no answer on the map, the same words are the console's", () => {
    for (const t of ["only the severe ones", "now for last month", "make it weekly", "severe mattum kaattu", "கடுமையானவை மட்டும்", "last 30 days", "wider", "show by ward"]) {
      expect(mapCommand10(t, CLOSED), t).toBe(null);
    }
  });
});

describe("3. a circle by voice", () => {
  it("a distance and a place, in three languages", () => {
    expect(mapCommand10("within two kilometres of Kasimedu", CLOSED)).toEqual({ op: "circle", place: "Kasimedu", km: 2, question: "what is happening within 2 km of Kasimedu" });
    expect(mapCommand10("Kasimedu-la rendu km kulla", CLOSED)).toEqual({ op: "circle", place: "Kasimedu", km: 2, question: "what is happening within 2 km of Kasimedu" });
    expect(mapCommand10("Kasimedu-la irundhu rendu km kulla enna nadakkudhu", CLOSED)).toMatchObject({ op: "circle", place: "Kasimedu", km: 2 });
    expect(mapCommand10("காசிமேட்டிலிருந்து இரண்டு கிலோமீட்டருக்குள்", CLOSED)).toEqual({ op: "circle", place: "காசிமேடு", km: 2, question: "காசிமேட்டிலிருந்து 2 கிலோமீட்டருக்குள் என்ன நடக்கிறது" });
    expect(mapCommand10("complaints within 2 km of Kasimedu", CLOSED)).toEqual({ op: "circle", place: "Kasimedu", km: 2, question: "complaints within 2 km of Kasimedu" });
    expect(mapCommand10("draw a circle of half a kilometre around Adyar", CLOSED)).toMatchObject({ op: "circle", place: "Adyar", km: 0.5 });
    expect(mapCommand10("Adyar la arai km kulla garbage", CLOSED)).toMatchObject({ op: "circle", place: "Adyar", km: 0.5, question: "garbage within 500 m of Adyar" });
  });
  it("'near' with no distance: a radius by what the place is, when the map is open or named", () => {
    expect(mapCommand10("what is near the Koyambedu bus stand", OPEN)).toEqual({ op: "circle", place: "Koyambedu Bus Stand", km: 0.5, near: true, question: "what is happening within 500 m of Koyambedu Bus Stand" });
    expect(mapCommand10("flooding near the harbour on the map", CLOSED)).toMatchObject({ op: "circle", place: "Harbour", km: 1, near: true });
    expect(mapCommand10("Adyar pakkathula enna nadakkudhu", OPEN)).toMatchObject({ op: "circle", place: "Adyar", km: 1, near: true });
    expect(mapCommand10("near ward 5", OPEN)).toEqual({ op: "ask", question: "what is happening in Ward 5" });
    expect(mapCommand10("flooding near the harbour", CLOSED)).toBe(null);
  });
  it("a circle keeps what was asked about: schools, hospitals, rain, not only the case categories (v10 review 2, finding 11)", () => {
    expect(mapCommand10("show schools within two kilometres of Adyar", CLOSED)).toEqual({ op: "circle", place: "Adyar", km: 2, question: "show schools within 2 km of Adyar" });
    expect(mapCommand10("how many hospitals within 1 km of Kasimedu", CLOSED)?.question).toBe("how many hospitals within 1 km of Kasimedu");
    expect(mapCommand10("how much rain fell within 2 km of Adyar", CLOSED)?.question).toBe("how much rain fell within 2 km of Adyar");
    expect(mapCommand10("show hospitals near Adyar", OPEN)).toEqual({ op: "circle", place: "Adyar", km: 1, near: true, question: "hospitals within 1 km of Adyar" });
    expect(mapCommand10("how many toilets near Adyar", OPEN)?.question).toBe("how many toilets within 1 km of Adyar");
    expect(mapCommand10("Adyar la rendu km kulla schools", CLOSED)?.question).toBe("schools within 2 km of Adyar");
    expect(mapCommand10("காசிமேட்டிலிருந்து இரண்டு கிலோமீட்டருக்குள் பள்ளிகள்", CLOSED)?.question).toBe("காசிமேட்டிலிருந்து 2 கிலோமீட்டருக்குள் பள்ளிகள்");
    // a place and a distance and nothing else: what is happening there
    expect(mapCommand10("what's happening within two kilometres of Kasimedu", CLOSED)?.question).toBe("what is happening within 2 km of Kasimedu");
  });
});

describe("4. layers and the camera's shots", () => {
  it("layers on and off, in three languages", () => {
    expect(mapCommand10("show schools on the map", CLOSED)).toEqual({ op: "layer", layer: "schools", on: true });
    expect(mapCommand10("hide the hospitals", OPEN)).toEqual({ op: "layer", layer: "hospitals", on: false });
    expect(mapCommand10("turn on the rain gauges layer", CLOSED)).toEqual({ op: "layer", layer: "live_rain", on: true });
    expect(mapCommand10("rain layer on pannu", CLOSED)).toEqual({ op: "layer", layer: "live_rain", on: true });
    expect(mapCommand10("schools layer off pannu", CLOSED)).toEqual({ op: "layer", layer: "schools", on: false });
    expect(mapCommand10("பள்ளிகளை மறை", OPEN)).toEqual({ op: "layer", layer: "schools", on: false });
    expect(mapCommand10("show the heat map", OPEN)).toEqual({ op: "layer", layer: "heat", on: true });
    expect(mapCommand10("switch to satellite", OPEN)).toEqual({ op: "layer", layer: "satellite", on: true });
    expect(mapCommand10("street map", OPEN)).toEqual({ op: "layer", layer: "streets", on: true });
    expect(mapCommand10("show the news reports layer", OPEN)).toEqual({ op: "layer", layer: "news", on: true });
  });
  it("a layer word with a place is a question, not a layer", () => {
    expect(op("show hospitals near Adyar", OPEN)).toBe("circle");
    expect(mapCommand10("show the hospitals", CLOSED)).toBe(null);
    expect(mapCommand10("metro water complaints", OPEN)).toBe(null);
  });
  it("replay, next shot, previous shot", () => {
    expect(mapCommand10("replay", HOT)).toEqual({ op: "shot", shot: "replay" });
    expect(mapCommand10("next shot", HOT)).toEqual({ op: "shot", shot: "next" });
    expect(mapCommand10("previous shot", HOT)).toEqual({ op: "shot", shot: "previous" });
    expect(mapCommand10("next hotspot", HOT)).toEqual({ op: "shot", shot: "next" });
    expect(mapCommand10("அடுத்த காட்சி", HOT)).toEqual({ op: "shot", shot: "next" });
    expect(mapCommand10("மீண்டும் காட்டு", HOT)).toEqual({ op: "shot", shot: "replay" });
    expect(mapCommand10("replay pannu", HOT)).toEqual({ op: "shot", shot: "replay" });
    expect(mapCommand10("follow the road", HOT)).toEqual({ op: "shot", shot: "next" });
  });
});

describe("5-9. the answer's actions", () => {
  it("5. export as CSV or GeoJSON", () => {
    expect(mapCommand10("export this as CSV", ANSWER)).toEqual({ op: "export", format: "csv" });
    expect(mapCommand10("download the GeoJSON", ANSWER)).toEqual({ op: "export", format: "geojson" });
    expect(mapCommand10("idha CSV-a export pannu", ANSWER)).toEqual({ op: "export", format: "csv" });
    expect(mapCommand10("இதை CSV ஆக ஏற்றுமதி செய்", ANSWER)).toEqual({ op: "export", format: "csv" });
    expect(mapCommand10("export it", ANSWER)).toEqual({ op: "export", format: null });
  });
  it("6. save the view", () => {
    expect(mapCommand10("save this view", ANSWER)).toEqual({ op: "save" });
    expect(mapCommand10("save this view as Kasimedu flooding", ANSWER)).toEqual({ op: "save", name: "Kasimedu Flooding" });
    expect(mapCommand10("இந்தப் பார்வையைச் சேமி", ANSWER)).toEqual({ op: "save" });
    expect(mapCommand10("indha view-a save pannu", ANSWER)).toEqual({ op: "save" });
  });
  it("6. 'keep the map open' is not a save, nor 'suggest an action' the suggested questions (v10 review 2, finding 18)", () => {
    for (const t of ["keep the map open", "keep this view on screen", "suggest an action for this", "suggest a reply", "can you suggest the next step"]) expect(mapCommand10(t, ANSWER), t).toBe(null);
    expect(mapCommand10("bookmark this view", ANSWER)).toEqual({ op: "save" });
    expect(mapCommand10("suggest some questions", ANSWER)).toEqual({ op: "suggest" });
    expect(mapCommand10("show the suggested questions", ANSWER)).toEqual({ op: "suggest" });
    expect(mapCommand10("suggestions kaattunga", ANSWER)).toEqual({ op: "suggest" });
  });
  it("7. the visit order, and the field visit by voice", () => {
    expect(mapCommand10("plan my visits", ANSWER)).toEqual({ op: "visit", question: null });
    expect(mapCommand10("Plan my visit to the worst flooded spots tomorrow morning", CLOSED)).toEqual({ op: "visit", question: "open flooding", when: { en: "tomorrow morning", ta: "நாளை காலை" } });
    expect(mapCommand10("plan a field visit to the garbage complaints in Adyar today", CLOSED)).toMatchObject({ op: "visit", question: "open garbage in Adyar", place: "Adyar" });
    expect(mapCommand10("நாளை காலை வெள்ளம் பாதித்த இடங்களுக்குச் செல்ல திட்டமிடு", CLOSED)).toMatchObject({ op: "visit", question: "open flooding", when: { en: "tomorrow morning" } });
    expect(mapCommand10("naalaiku kaalaila vellam irukura edathukku visit plan pannu", CLOSED)).toMatchObject({ op: "visit", question: "open flooding", when: { en: "tomorrow morning" } });
    expect(mapCommand10("visit order", CLOSED)).toBe(null);
  });
  it("7. a visit mentioned, or a brief asked for it, is not a route (v10 review 2, finding 13)", () => {
    for (const t of ["I have a site visit in Velachery tomorrow, what should I know?", "I have a field visit in Adyar tomorrow morning, brief me", "I'll come with you on the field visit"]) {
      for (const c of [CLOSED, ANSWER]) expect(mapCommand10(t, c), t).toBe(null);
    }
    expect(op("how many field visits did the AE make in Adyar this week", ANSWER)).not.toBe("visit");
    expect(op("plan my visit to the flooded spots, what should I know first", CLOSED)).toBe(null);
    // still a visit's plan
    expect(mapCommand10("schedule a site visit to the garbage complaints in Adyar", CLOSED)).toMatchObject({ op: "visit", question: "open garbage in Adyar" });
  });
  it("8. the AI analyst's insight", () => {
    expect(mapCommand10("what stands out here?", ANSWER)).toEqual({ op: "insight" });
    expect(mapCommand10("what does this mean", ANSWER)).toEqual({ op: "insight" });
    expect(mapCommand10("இங்கே என்ன தனித்து நிற்கிறது", ANSWER)).toEqual({ op: "insight" });
    expect(mapCommand10("inga enna special-a irukku", ANSWER)).toEqual({ op: "insight" });
    expect(mapCommand10("what stands out", CLOSED)).toBe(null);
  });
  it("9. send to a department: drafts only, never 'send the drafts'", () => {
    expect(mapCommand10("send these to Storm Water Drains", ANSWER)).toEqual({ op: "send", dept: "storm water drains" });
    expect(mapCommand10("send this to Metro Water", ANSWER)).toEqual({ op: "send", dept: "metro water" });
    expect(mapCommand10("idha Metro Water-ku anuppu", ANSWER)).toEqual({ op: "send", dept: "metro water" });
    expect(mapCommand10("இதை மெட்ரோ வாட்டருக்கு அனுப்பு", ANSWER)).toEqual({ op: "send", dept: "மெட்ரோ வாட்டர்" });
    expect(mapCommand10("send these", ANSWER)).toEqual({ op: "send", dept: null });
    expect(mapCommand10("send the drafts", ANSWER)).toBe(null);
    expect(mapCommand10("approve and send", ANSWER)).toBe(null);
    expect(mapCommand10("send it to me", ANSWER)).toBe(null);
    expect(mapCommand10("send these to Storm Water Drains", CLOSED)).toBe(null);
  });
  it("9. a case assigned, or sent to a person, is the console's, never the map's drafts (v10 review 2, finding 17)", () => {
    for (const t of ["assign this case to the AE", "send this to the zonal officer", "send this case to Storm Water Drains", "forward this incident to Metro Water", "assign these to Metro Water", "send this to the executive engineer"]) {
      expect(mapCommand10(t, ANSWER), t).toBe(null);
    }
    // the map's answer plainly sent: still the drafts
    expect(mapCommand10("send these over to storm water drains", ANSWER)).toEqual({ op: "send", dept: "storm water drains" });
    expect(mapCommand10("send this to SWD", ANSWER)).toEqual({ op: "send", dept: "swd" });
  });
});

describe("10. the suggested questions", () => {
  it("read them, and ask one by its place", () => {
    expect(mapCommand10("what can I ask the map?", CLOSED)).toEqual({ op: "suggest" });
    expect(mapCommand10("what can I ask here", OPEN)).toEqual({ op: "suggest" });
    expect(mapCommand10("inga enna kekkalaam", OPEN)).toEqual({ op: "suggest" });
    expect(mapCommand10("இங்கே என்ன கேட்கலாம்", OPEN)).toEqual({ op: "suggest" });
    const S = { ...OPEN, suggest: ["severe cases this week", "garbage near schools", "flooding by ward"] };
    expect(mapCommand10("ask the second one", S)).toEqual({ op: "suggest", n: 2, question: "garbage near schools" });
    expect(mapCommand10("rendaavadhu kelvi kelu", S)).toEqual({ op: "suggest", n: 2, question: "garbage near schools" });
    expect(mapCommand10("இரண்டாவது கேள்வியைக் கேள்", S)).toEqual({ op: "suggest", n: 2, question: "garbage near schools" });
    expect(mapCommand10("ask the last one", S)).toEqual({ op: "suggest", n: 3, question: "flooding by ward" });
    expect(mapCommand10("ask the second one", OPEN)).toBe(null);
  });
});

describe("11. Rain & flooding", () => {
  it("open it, a tab, a past rain, back and close", () => {
    expect(mapCommand10("open rain and flooding", CLOSED)).toEqual({ op: "rain", act: "open", tab: "flooding" });
    expect(mapCommand10("show the flood-prone areas", CLOSED)).toEqual({ op: "rain", act: "open", tab: "flooding" });
    expect(mapCommand10("மழை வெள்ளம் காட்டு", CLOSED)).toEqual({ op: "rain", act: "open", tab: "flooding" });
    expect(mapCommand10("mazhai vellam kaattu", CLOSED)).toEqual({ op: "rain", act: "open", tab: "flooding" });
    expect(mapCommand10("show the traffic tab", RAIN)).toEqual({ op: "rain", act: "open", tab: "traffic" });
    expect(mapCommand10("power", RAIN)).toEqual({ op: "rain", act: "open", tab: "power" });
    expect(mapCommand10("metro kaattu", RAIN)).toEqual({ op: "rain", act: "open", tab: "metro" });
    expect(mapCommand10("show the 21 October rain", CLOSED)).toEqual({ op: "rain", act: "open", rain: "rain-2026-10-21" });
    expect(mapCommand10("October 21 mazhai kaattu", CLOSED)).toEqual({ op: "rain", act: "open", rain: "rain-2026-10-21" });
    expect(mapCommand10("அக்டோபர் 21 மழையைக் காட்டு", CLOSED)).toEqual({ op: "rain", act: "open", rain: "rain-2026-10-21" });
    expect(mapCommand10("replay the last rain", CLOSED)).toEqual({ op: "rain", act: "open", rain: "latest" });
    expect(mapCommand10("back", RAIN)).toEqual({ op: "rain", act: "back" });
    expect(mapCommand10("close rain and flooding", RAIN)).toEqual({ op: "rain", act: "close" });
    expect(mapCommand10("மூடு", RAIN)).toEqual({ op: "rain", act: "close" });
  });
  it("the weather is not Rain & flooding", () => {
    expect(mapCommand10("will it rain tomorrow", CLOSED)).toBe(null);
    expect(mapCommand10("how much rain in Adyar today", CLOSED)).toBe(null);
    expect(mapCommand10("back", CLOSED)).toBe(null);
    expect(mapCommand10("power", CLOSED)).toBe(null);
  });
  it("a news request about the rain is the news's, not Rain & flooding (v10 review 2, finding 9)", () => {
    for (const t of ["show the latest rain news", "what's the news on rain and flooding", "news about flood prone areas", "கடந்த மழை செய்திகளைக் காட்டு", "mazhai vellam news kaattu"]) {
      for (const c of [CLOSED, OPEN, RAIN]) expect(mapCommand10(t, c), t).toBe(null);
    }
    expect(mapCommand10("news on power cuts when it rains", OPEN)).toBe(null);
    // the view and a past rain asked for with no news word stay the map's; close and back still close it while it is open
    expect(op("open rain and flooding", CLOSED)).toBe("rain");
    expect(op("replay the last rain", CLOSED)).toBe("rain");
    expect(mapCommand10("close rain and flooding", RAIN)).toEqual({ op: "rain", act: "close" });
  });
});

describe("the narrated district tour", () => {
  it("starts in three languages, from today's hotspots, the news or the floods", () => {
    expect(mapCommand10("Jarvis, take me round the district", CLOSED)).toEqual({ op: "tour", tour: "start", source: "hotspots" });
    expect(mapCommand10("today's hotspots tour", CLOSED)).toEqual({ op: "tour", tour: "start", source: "hotspots" });
    expect(mapCommand10("take me round the places in today's news", CLOSED)).toEqual({ op: "tour", tour: "start", source: "news" });
    expect(mapCommand10("give me a tour of the flooded places", CLOSED)).toEqual({ op: "tour", tour: "start", source: "flood" });
    expect(mapCommand10("மாவட்டத்தைச் சுற்றிக் காட்டு", CLOSED)).toEqual({ op: "tour", tour: "start", source: "hotspots" });
    expect(mapCommand10("district-a suthi kaattu", CLOSED)).toEqual({ op: "tour", tour: "start", source: "hotspots" });
    expect(mapCommand10("the full round of the district tour", CLOSED)).toMatchObject({ op: "tour", tour: "start", full: true });
  });
  it("next, back, stop, repeat and go deeper, only while a tour runs", () => {
    expect(mapCommand10("next", TOUR)).toEqual({ op: "tour", tour: "next" });
    expect(mapCommand10("அடுத்து", TOUR)).toEqual({ op: "tour", tour: "next" });
    expect(mapCommand10("aduthu", TOUR)).toEqual({ op: "tour", tour: "next" });
    expect(mapCommand10("go back", TOUR)).toEqual({ op: "tour", tour: "back" });
    expect(mapCommand10("stop the tour", TOUR)).toEqual({ op: "tour", tour: "stop" });
    expect(mapCommand10("நிறுத்து", TOUR)).toEqual({ op: "tour", tour: "stop" });
    expect(mapCommand10("go deeper here", TOUR)).toEqual({ op: "tour", tour: "deeper" });
    expect(mapCommand10("இங்கே என்ன நடக்கிறது", TOUR)).toEqual({ op: "tour", tour: "deeper" });
    expect(mapCommand10("inga enna nadakkudhu", TOUR)).toEqual({ op: "tour", tour: "deeper" });
    expect(mapCommand10("back to the tour", TOUR)).toEqual({ op: "tour", tour: "repeat" });
  });
  it("the check-in after stop 3: a plain yes goes on, a no ends it", () => {
    expect(mapCommand10("yes", CHECK)).toEqual({ op: "tour", tour: "next" });
    expect(mapCommand10("சரி", CHECK)).toEqual({ op: "tour", tour: "next" });
    expect(mapCommand10("no", CHECK)).toEqual({ op: "tour", tour: "stop" });
    expect(mapCommand10("yes", TOUR)).toBe(null);
  });
  it("'next' with no tour running is not the map's", () => {
    for (const t of ["next", "go back", "stop", "go deeper here", "yes", "aduthu"]) expect(mapCommand10(t, HOT), t).toBe(null);
  });
  it("a running tour is stopped when the Collector names it, and a stop never starts one (v10 review 2, finding 10)", () => {
    for (const t of ["stop the district tour", "end the news tour", "cancel the hotspots tour", "சுற்றுலாவை நிறுத்துங்கள்", "சுற்றுலா நிறுத்து", "stop tour", "tour-a niruthu"]) {
      expect(mapCommand10(t, TOUR), t).toEqual({ op: "tour", tour: "stop" });
      expect(mapCommand10(t, CLOSED)?.tour ?? null, t).not.toBe("start");
    }
  });
  it("a news request that names a tour or a round-up, or a tourism word, starts no tour (v10 review 2, finding 12)", () => {
    for (const t of ["give me the news round-up", "news about the CM's district tour", "முதல்வர் சுற்றுப்பயணம் பற்றிய செய்தி", "மாமல்லபுரம் சுற்றுலா செய்திகள்", "சுற்றுலாத் துறை புகார்கள்"]) {
      expect(mapCommand10(t, CLOSED), t).toBe(null);
    }
    // a tour asked for, of the places in the news or in Tamil with its verb, still starts
    expect(mapCommand10("take me round the places in today's news", CLOSED)).toEqual({ op: "tour", tour: "start", source: "news" });
    expect(mapCommand10("start the news tour", CLOSED)).toEqual({ op: "tour", tour: "start", source: "news" });
    expect(mapCommand10("சுற்றுலா தொடங்கு", CLOSED)).toEqual({ op: "tour", tour: "start", source: "hotspots" });
  });
  it("the tour's back, repeat and deeper only with the map on screen, and never on a news word (v10 review 2, finding 14)", () => {
    const LEFT: MapCtx10 = { ...TOUR, open: false };
    for (const t of ["go back", "previous", "again", "repeat", "show me more"]) expect(mapCommand10(t, LEFT), t).toBe(null);
    expect(mapCommand10("show me more news", TOUR)).toBe(null);
    // stop still ends it
    expect(mapCommand10("stop the tour", LEFT)).toEqual({ op: "tour", tour: "stop" });
  });
});

describe("not the map's", () => {
  const ctxs: [string, MapCtx10][] = [["closed", CLOSED], ["open", OPEN], ["answer", ANSWER]];
  const NOT = [
    // news requests
    "open the first news", "news about Kasimedu", "tell me about the Kasimedu news", "any news on flooding in Adyar", "Kasimedu news kaattu", "காசிமேடு செய்தி", "நியூஸ் காட்டு",
    "read the second story", "what's the latest on the cyclone",
    // console filters and page moves
    "show zone 7", "make it weekly", "clear the filters", "go to the trends page", "open the briefing", "switch to taluks", "dark mode", "zone 13 kaattu",
    // a zone or a place alone on the map is the console's own map view, not a question (news9's n9-command-7, the merged dry run of 19 Nov)
    "Jarvis, map la Manali zone kaattu.", "show Adyar zone on the map", "Royapuram on the map",
    // cases and drafts
    "open case INC-2026-004", "draft action for the second one", "send the drafts", "open the first one",
    // exports that are not the map's
    "export the report", "export the dashboard as PDF", "save this workspace as Daily Briefing",
    // Jarvis's own words
    "stop", "repeat that", "what did you do", "undo", "show numbers", "next"
  ];
  for (const [name, c] of ctxs) {
    it(`none of the other lanes' sentences is taken (${name})`, () => {
      for (const t of NOT) expect(mapCommand10(t, c), `${t} (${name})`).toBe(null);
    });
  }
  it("console words that happen to lean on 'these' or ask 'where is' stay the console's, even with the map open", () => {
    for (const t of ["close these", "then go to trends", "also clear the filters", "where is the commissioner", "do a round of calls", "start the round"]) {
      expect(mapCommand10(t, ANSWER), t).toBe(null);
    }
    expect(mapCommand10("where are garbage complaints piling up", OPEN)?.op).toBe("ask");
  });
  it("'export this as CSV' is the map's only when Ask the Map has an answer", () => {
    expect(mapCommand10("export this as CSV", CLOSED)).toBe(null);
    expect(mapCommand10("export this as CSV", OPEN)).toBe(null);
    expect(mapCommand10("export the report", ANSWER)).toBe(null);
  });
});

describe("v10 review 2, round 2: the map lane's round-1 fixes held one word away", () => {
  const names = { zones: new Map(), cats: new Map(), taluks: new Map(), depts: new Map([["GCC-SWD", { name: "GCC-SWD", head: null, actionOwner: true }]]) } as unknown as RefNames;
  const env: RouteEnv = { resolve: makeResolver(fixtureResolver()), dept: (t) => deptFromWords(t, names)?.code ?? null };
  const state = { page: "overview", period: "daily", zone: null, dept: null, cat: null, taluk: null, sev: null, mapMode: "zones", panel: null, incident: null, listLength: 0, lastPlace: null, numbers: false } as never;
  const ANS = { open: true, hasAnswer: true, kind: "answer" as const, total: 12, shots: 4, shot: 0, chips: ["Flooding", "Open"], chipOpts: [], suggest: ["severe cases this week", "garbage near schools"] };
  const TOURING = { ...ANS, tour: true };
  /** the map's command, or the lane the sentence went to (the browser's own lanes, as Thunai.tsx runs them) */
  const seen = (s: string, askMap: unknown = null) => {
    const b = browserLaneV10(s, { stage: null, news: { items: [] }, state, world: { ...WORLD, ...referenceWorld() }, listenLang: "en", heardLang: /[஀-௿]/u.test(s) ? "ta" : "en", v7: true, lex: [], askMap } as BrowserCtx10);
    return b.lane === "map" ? b.cmd : b.lane;
  };
  const STOP = { op: "tour", tour: "stop" };

  it("v10 review 2, round 2: a circle's subject is never read from the place's own name ('near Stanley Hospital' is the area brief, not hospitals)", () => {
    for (const [s, c, q] of [
      ["what's happening near Stanley Hospital", OPEN, "what is happening within 500 m of Stanley Hospital"],
      ["Stanley hospital pakkathula enna nadakkudhu", OPEN, "what is happening within 500 m of Stanley Hospital"],
      ["Stanley hospital la 1 km kulla enna nadakkudhu", CLOSED, "what is happening within 1 km of Stanley Hospital"]] as [string, MapCtx10, string][]) {
      const cmd = mapCommand10(s, c);
      expect({ q: cmd?.question, route: rulesRoute(cmd?.question ?? "", null, env)?.kind }, s).toEqual({ q, route: "brief" });
    }
    // any place named for what it is: a school, a railway station, a fire station, a lake
    expect(mapCommand10("near the Adyar school", OPEN)?.question).toBe("what is happening within 500 m of Adyar School");
    expect(mapCommand10("within 2 km of Egmore railway station", CLOSED)?.question).toBe("what is happening within 2 km of Egmore Railway Station");
    expect(mapCommand10("Kasimedu fire station pakkathula", OPEN)?.question).toBe("what is happening within 500 m of Kasimedu Fire Station");
    expect(mapCommand10("what's near the fire station", OPEN)?.question).toBe("what is happening within 500 m of Fire Station");
    expect(mapCommand10("Velachery lake la rendu km kulla", CLOSED)?.question).toBe("what is happening within 2 km of Velachery Lake");
    // Tamil: the place's own word holds the subject word, and the circle still asks what is happening there
    expect(mapCommand10("ஸ்டான்லி மருத்துவமனையிலிருந்து 1 கிலோமீட்டருக்குள்", CLOSED)?.question).toMatch(/என்ன நடக்கிறது$/);
    // a subject said beside such a place is kept
    expect(mapCommand10("schools within 1 km of Stanley Hospital", CLOSED)?.question).toBe("schools within 1 km of Stanley Hospital");
    expect(mapCommand10("hospitals near the Adyar school", OPEN)?.question).toBe("hospitals within 500 m of Adyar School");
    expect(mapCommand10("Stanley hospital la 1 km kulla schools", CLOSED)?.question).toBe("schools within 1 km of Stanley Hospital");
  });

  it("v10 review 2, round 2: 'stop' said as a noun, a stop said not to, or the Collector's own tour cancelled, is not the map tour's stop", () => {
    for (const s of ["next stop on the tour", "go to the next stop of the tour", "don't stop the tour", "do not end the tour yet", "what's at the end of this round", "tour-a niruthadheenga"]) {
      expect(seen(s, TOURING), s).not.toEqual(STOP);
    }
    // the next stop asked for is the tour's next
    expect(seen("next stop on the tour", TOURING)).toEqual({ op: "tour", tour: "next" });
    expect(seen("go to the next stop of the tour", TOURING)).toEqual({ op: "tour", tour: "next" });
    // no tour running: a tour of the Collector's own (a day, a person's) is the planner's
    for (const s of ["cancel my tour tomorrow", "cancel tomorrow's tour", "cancel the CM's tour", "end our tour on Monday"]) expect(seen(s), s).toBe("server");
    // the map's own tour stopped with none running is still the map's ("No tour is running.")
    for (const s of ["stop the tour", "end the news tour", "stop tour", "tour-a niruthu"]) expect(mapCommand10(s, CLOSED), s).toEqual(STOP);
  });

  it("v10 review 2, round 2: the news tour asked for in plain words starts it", () => {
    for (const s of ["give me the news tour", "give me a news tour", "take me on a news tour", "tour of the places in the news", "start a quick news tour", "give me a tour of today's news"]) {
      expect(seen(s), s).toEqual({ op: "tour", tour: "start", source: "news" });
    }
    // still the news's: the round-up, the CM's tour, a tour in the news (finding 12)
    for (const s of ["give me the news round-up", "news about the CM's district tour", "news about the tour being cancelled"]) expect(seen(s), s).toBe("news");
  });

  it("v10 review 2, round 2: a named news tour is stopped whatever is said around the stop, in three languages", () => {
    for (const s of ["ok stop the news tour", "now stop the news tour", "alright, end the news tour", "news tour-a niruthu", "செய்திச் சுற்றுலாவை நிறுத்து", "please stop the news tour now",
      "சுற்றுலா போதும்"]) {
      expect(seen(s, TOURING), s).toEqual(STOP);
    }
    // the news about a tour is still the news, tour or none
    expect(seen("news about the tour being cancelled", TOURING)).toBe("news");
  });

  it("v10 review 2, round 2: a tour asked for in Tamil with any verb or a place, and a tour with a stop at each place, starts", () => {
    for (const s of ["மாவட்டச் சுற்றுலா", "சுற்றுலா செல்வோம்", "மாவட்டத்தைச் சுற்றுலா அழைத்துச் செல்லுங்கள்", "take me round the district and stop at each hotspot", "சுற்றுலா போகலாம்",
      "மாவட்டச் சுற்றுலா தொடங்குங்கள்", "என்னை மாவட்டச் சுற்றுலா கூட்டிட்டுப் போ"]) {
      expect(seen(s), s).toMatchObject({ op: "tour", tour: "start" });
    }
    // tourism, its department and the CM's tours stay off the map (finding 12); "enough of the tour" is a stop
    for (const s of ["சுற்றுலாத் துறை புகார்கள்", "மாமல்லபுரம் சுற்றுலா செய்திகள் காட்டு"]) expect(mapCommand10(s, CLOSED), s).toBe(null);
    expect(mapCommand10("சுற்றுலா போதும்", CLOSED)?.tour ?? null).not.toBe("start");
  });

  it("v10 review 2, round 2: the suggested questions asked for in everyday words", () => {
    for (const s of ["suggest a question", "what do you suggest I ask", "read out the suggestions", "tell me the suggestions", "suggestions sollu", "list the suggestions",
      "enna suggestions irukku", "suggest something to ask", "what are the map's suggestions", "suggest another question", "பரிந்துரைகளைக் காட்டு"]) {
      expect(seen(s, ANS), s).toMatchObject({ op: "suggest" });
    }
    // still not the suggestions (finding 18): an action, a reply, the next step, suggestions for a case, asking a person
    for (const s of ["suggest an action for this", "suggest a reply", "can you suggest the next step", "any suggestions for this case", "suggest I ask the AE to visit the site"]) {
      expect(mapCommand10(s, ANSWER)?.op ?? null, s).not.toBe("suggest");
    }
  });
});

describe("v10 review 2, round 3: the round-2 guards that blocked what the Collector needs", () => {
  const ANS: MapCtx10 = { open: true, hasAnswer: true, kind: "answer", total: 12, shots: 4, shot: 0, chips: [], chipOpts: [], suggest: [], lang: "en" };
  const TOURING: MapCtx10 = { ...ANS, chips: ["Flooding", "Open"], tour: true };
  const each = (ss: string[], c: MapCtx10) => Object.fromEntries(ss.map((s) => [s, mapCommand10(s, c)]));
  const all = (ss: string[], v: unknown) => Object.fromEntries(ss.map((s) => [s, v]));

  it("v10 review 2, round 3: a running tour is stopped by everyday stop phrasings (a 'never mind' or 'not now' before the stop, 'an end', the news tour)", () => {
    const ss = ["never mind, stop the tour", "not now, stop the tour", "don't continue, stop the tour", "I'm not interested, stop the tour", "bring the tour to an end",
      "put an end to this tour", "stop playing the news tour", "end the headlines tour"];
    expect(each(ss, TOURING)).toEqual(all(ss, { op: "tour", tour: "stop" }));
  });

  it("v10 review 2, round 3: a Tamil sentence about the CM's tour (நடத்துகிறார், நடத்தும்) never starts the map tour", () => {
    const ss = ["முதல்வர் நாளை சுற்றுப்பயணம் நடத்துகிறார்", "முதல்வர் சுற்றுப்பயணம் நடத்தும் செய்திகள்", "அமைச்சர் சுற்றுப்பயணம் நடத்துவது பற்றிய செய்தி"];
    expect(each(ss, CLOSED)).toEqual(all(ss, null));
    // the tour asked for with நடத்து still starts it
    expect(mapCommand10("சுற்றுலா நடத்துங்கள்", CLOSED)).toMatchObject({ op: "tour", tour: "start" });
  });

  it("v10 review 2, round 3: the Collector's own tour programme never starts the map tour", () => {
    const ss = ["give me today's tour programme", "give me the full tour plan for tomorrow", "what was the last stop of the district tour"];
    expect(each(ss, CLOSED)).toEqual(all(ss, null));
    // a named map tour asked for still starts
    expect(mapCommand10("give me today's news tour", CLOSED)).toEqual({ op: "tour", tour: "start", source: "news" });
    expect(mapCommand10("give me the full district tour", CLOSED)).toEqual({ op: "tour", tour: "start", source: "hotspots", full: true });
  });

  it("v10 review 2, round 3: a send to a person is the planner's even with a department word in it", () => {
    const ss = ["send this to the road contractor", "send this to the building owner", "forward this to the hospital dean", "send it to the victim's family"];
    expect(each(ss, ANS)).toEqual(all(ss, null));
  });

  it("v10 review 2, round 3: 'suggest' about a person or a case's action is not the map's suggested questions", () => {
    const S: MapCtx10 = { ...ANS, suggest: ["severe cases this week", "garbage near schools"] };
    const ss = ["suggest who to ask", "suggest a follow up action for this case", "suggest whom I should ask", "suggest someone to ask"];
    expect(each(ss, S)).toEqual(all(ss, null));
    expect(mapCommand10("suggest a follow up question", S)).toEqual({ op: "suggest" });
  });
});
