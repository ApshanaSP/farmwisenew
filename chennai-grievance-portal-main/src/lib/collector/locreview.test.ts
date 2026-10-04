import { describe, expect, it } from "vitest";
import { isCityTopic, isEvent, judgeLocation, outsidePlace, reviewLocations, type Ward } from "./locreview";

const wards: Ward[] = [
  { ward_no: 43, zone_no: 4, lat: 13.1180, lon: 80.2860 },
  { ward_no: 58, zone_no: 5, lat: 13.0850, lon: 80.2700 }
];
// a stand-in for the gazetteer: two Chennai places
const resolve = (t: string) =>
  /periamet/i.test(t) ? { place: "Periamet", ward: 58, zone: 5, taluk: null, conf: 0.8, lat: 13.085, lon: 80.27 }
    : /broadway/i.test(t) ? { place: "Broadway", ward: 58, zone: 5, taluk: null, conf: 0.8, lat: 13.09, lon: 80.285 } : null;
const news = (title: string, extra: Record<string, unknown> = {}) =>
  ({ id: title, title, loc: "Chennai", sources: "news", lat: 13.0827, lon: 80.2707, ...extra });

describe("location review", () => {
  it("a district-wide IMD warning is not a location problem", () => {
    expect(judgeLocation({ id: "w", title: "Weather & flood warnings – Chennai district", loc: "Chennai district", sources: "imd" }, wards, resolve).kind).toBe("district");
  });

  it("city-wide news (totals, schedules, drives) is not about one spot", () => {
    for (const t of ["Dengue cases in Chennai more than double in September to 1,290",
      "சென்னையில் நாளை (01.10.2026) பல்வேறு பகுதிகளில் மின்தடை - எந்தெந்த இடங்களில் தெரியுமா?",
      "Chennai Corporation vaccinates over one lakh stray dogs against rabies",
      "2 நாள்களில் 9 கொலைகள்! இனியும் மிக்சர் சாப்பிட்டுக் கொண்டிருக்காமல்... உதயநிதி விமர்சனம்",
      "Chennai Latest News Today on September 29th, 2026: Flood Work Deadline, Kidnapping Arrest & Power Outages"]) {
      expect(judgeLocation(news(t), wards, resolve).kind, t).toBe("district");
    }
  });

  it("a specific event known only as 'in Chennai' needs review", () => {
    for (const t of ["Youth chasing cattle thieves hurt as bike hits getaway van in Chennai",
      "சென்னையில் தாய் முன்னிலையில் இளைஞர் வெட்டிக் கொலை.!",
      "சென்னையில் பெரிய ஏரியில் 2 சிறுமிகள், 2 சிறுவர்கள் நீரில் மூழ்கி பலி"]) {
      const v = judgeLocation(news(t), wards, resolve);
      expect(v.kind, t).toBe("missing");
      expect(v.how).toMatch(/only "Chennai"/);
    }
  });

  it("deaths or injuries make a report an event even without an event word", () => {
    expect(judgeLocation(news("A sad day in Chennai", { dead: 1 }), wards, resolve).kind).toBe("missing");
  });

  it("its own map point near a ward places it; far away is outside the corporation", () => {
    const near = judgeLocation({ id: "k", title: "Flooding – Korukkupet", loc: "Korukkupet", sources: "grievance", lat: 13.1245, lon: 80.3023 }, wards, resolve);
    expect(near).toMatchObject({ kind: "located", zone: 4 });
    const far = judgeLocation({ id: "s", title: "Theft – Semmancheri", loc: "Semmancheri", sources: "police", lat: 12.8427, lon: 80.2223 }, wards, resolve);
    expect(far.kind).toBe("outside");
  });

  it("a place named in the headline (English, Tamil or a landmark) gives the zone", () => {
    expect(judgeLocation(news("Footpath parking forces pedestrians onto road in Broadway"), wards, resolve)).toMatchObject({ kind: "located", zone: 5 });
    expect(judgeLocation(news("சென்னை பெரியமேடு லாட்ஜில் அண்ணன்-தம்பி தற்கொலை"), wards, resolve)).toMatchObject({ kind: "located", zone: 5 });
  });

  it("a town outside Chennai district is outside, in English or Tamil", () => {
    expect(outsidePlace("Youth murdered over obscene messages in Chennai's Mangadu; two held")).toBe("Mangadu");
    expect(outsidePlace("திருத்தணியில் டெங்கு காய்ச்சல் தடுப்பு விழிப்புணர்வு பேரணி")).toBeTruthy();
    expect(judgeLocation(news("Sewage stagnation degrading borewell water, fume Pattabiram residents"), wards, resolve).kind).toBe("outside");
  });

  it("event and topic words", () => {
    expect(isEvent("Hydroponic ganja worth Rs 5.2 cr seized")).toBe(true);
    expect(isEvent("GCC flies drone to spray larvicide over Cooum")).toBe(false);
    expect(isCityTopic("Chennai steps up dengue control measures")).toBe(true);
  });

  it("one row per headline, with the other incidents of the same story kept", () => {
    const t = "Chennai Road Develops Sinkhole, Third Cave-In on Stretch Since 2021";
    const r = reviewLocations([news(t, { id: "a" }), news(t, { id: "b" }), news("Dengue cases surge in Chennai", { id: "c" })], wards, resolve);
    expect(r.counts).toEqual({ missing: 1, district: 1, located: 0, outside: 0 });
    expect(r.missing[0]).toMatchObject({ id: "a", also: ["b"] });
  });
});
