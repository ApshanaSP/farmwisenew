/**
 * v10: Ask the Map by voice, the grammar (map10.ts). Each of the eleven features and the two new ones, in English, Tamil and Tanglish; and the
 * sentences that are not the map's: news, console filters, cases, page moves, "next" with no tour, an export with no answer on the map.
 */
import { describe, expect, it } from "vitest";
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
  it("7. the visit order, and the field visit by voice", () => {
    expect(mapCommand10("plan my visits", ANSWER)).toEqual({ op: "visit", question: null });
    expect(mapCommand10("Plan my visit to the worst flooded spots tomorrow morning", CLOSED)).toEqual({ op: "visit", question: "open flooding", when: { en: "tomorrow morning", ta: "நாளை காலை" } });
    expect(mapCommand10("plan a field visit to the garbage complaints in Adyar today", CLOSED)).toMatchObject({ op: "visit", question: "open garbage in Adyar", place: "Adyar" });
    expect(mapCommand10("நாளை காலை வெள்ளம் பாதித்த இடங்களுக்குச் செல்ல திட்டமிடு", CLOSED)).toMatchObject({ op: "visit", question: "open flooding", when: { en: "tomorrow morning" } });
    expect(mapCommand10("naalaiku kaalaila vellam irukura edathukku visit plan pannu", CLOSED)).toMatchObject({ op: "visit", question: "open flooding", when: { en: "tomorrow morning" } });
    expect(mapCommand10("visit order", CLOSED)).toBe(null);
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
