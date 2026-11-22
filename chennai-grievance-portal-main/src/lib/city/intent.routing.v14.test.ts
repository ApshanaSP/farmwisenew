/**
 * v14 (21 Nov review of v13's city routing, the shared reading): the Tamil and Tanglish "where is the traffic worst" is the worst jam (routing
 * 2); who handles it, its update, the papers, an accident and a past period are the records' for traffic, power and trains too, and power and
 * trains need a rain said (routing 3); power and trains in the rain said other ways are power and trains, not the rain gauges (routing 6,
 * scenarios 5). The owner's six sentences read as they did.
 */
import { describe, expect, it } from "vitest";
import { cityAsk } from "./intent";
import { cityTopic } from "./topic";

describe("v14: the owner's sentences read as before", () => {
  it.each([
    ["Where are the flooded roads?", { topic: "flood", focus: null, map: false, rain: null }],
    ["What are the flooded streets in the last rain", { topic: "flood", focus: null, map: false, rain: "latest" }],
    ["Zoom in the map to the most congested area", { topic: "traffic", focus: "worst-jam", map: true, rain: null }],
    ["Show me the most congested traffic now", { topic: "traffic", focus: "worst-jam", map: false, rain: null }],
    ["Show me live traffic in the map", { topic: "traffic", focus: null, map: true, rain: null }],
    ["Go to the map, show live traffic and zoom to the worst jam", { topic: "traffic", focus: "worst-jam", map: true, rain: null }],
    ["Which areas lose power in heavy rain?", { topic: "power", focus: null, map: false, rain: null }],
    ["மழை வந்தா கரண்ட் எங்க போகும்?", { topic: "power", focus: null, map: false, rain: null }]
  ])("%s", (said, want) => expect(cityAsk(said)).toEqual(want));
});

describe("v14 routing 2: where the traffic is worst, in Tamil and Tanglish, is the worst jam", () => {
  it.each([
    "டிராபிக் எங்க அதிகமா இருக்கு",
    "எங்க அதிகமா டிராபிக் இருக்கு",
    "அதிகமான நெரிசல் எந்த ரோட்ல இருக்கு",
    "எந்த சாலையில் அதிக போக்குவரத்து நெரிசல்?",
    "எந்த ரோட்ல ரொம்ப டிராபிக்",
    "traffic adhigama irukka idam kaattu",
    "romba traffic irukka road edhu",
    "jaasthi traffic enga irukku",
    "enga romba jam ah irukku",
    "worst jam enga"
  ])("%s", (said) => expect(cityAsk(said)).toMatchObject({ topic: "traffic", focus: "worst-jam" }));

  it("the stem நெரிசல without its pulli is traffic, and the Tamil zoom is a camera move to the worst jam", () => {
    expect(cityTopic("ரொம்ப நெரிசலான இடம்")).toBe("traffic");
    expect(cityAsk("ரொம்ப நெரிசலான இடத்துக்கு ஜூம் பண்ணு")).toEqual({ topic: "traffic", focus: "worst-jam", map: true, rain: null });
  });

  it("live traffic asked plainly stays the overview; a rise (அதிகரி) is no 'most'", () => {
    expect(cityAsk("டிராபிக் எப்படி இருக்கு")).toMatchObject({ topic: "traffic", focus: null });
    expect(cityAsk("போக்குவரத்து நெரிசல் அதிகரித்துள்ளதா")?.focus ?? null).toBeNull();
    expect(cityAsk("How is traffic today?")).toMatchObject({ topic: "traffic", focus: null });
  });
});

describe("v14 routing 3: records, past periods and who handles it are not the live city", () => {
  it.each([
    "Show traffic accidents this month",
    "How many traffic accidents today?",
    "How was traffic last week?",
    "Show the traffic jams yesterday",
    "What was the worst jam yesterday?",
    "Show me the most congested roads this week",
    "Traffic this month",
    "Which officer handles traffic in Adyar?",
    "Who is the traffic police officer for Anna Nagar?",
    "Who is responsible for the traffic jam on OMR?",
    "What is the update on the traffic jam on OMR?",
    "What did the papers say about the traffic jam on OMR?",
    "Which department handles power cuts?",
    "Is the power supply restored in Velachery?",
    "Is the power supply restored in Velachery after the rain?",
    "When is the next metro train?",
    "Show me the metro stations",
    "Metro timings",
    "Which officer handles the flooded roads in Adyar?"
  ])("%s reads nothing", (said) => expect(cityAsk(said)).toBeNull());

  it("today, now and no time stay the live view; an accident said with 'now' is live traffic's", () => {
    expect(cityAsk("Show me the most congested traffic now")?.topic).toBe("traffic");
    expect(cityAsk("Any traffic problems right now?")?.topic).toBe("traffic");
    expect(cityAsk("Any traffic accidents right now?")?.topic).toBe("traffic");
    expect(cityAsk("How is traffic this morning?")?.topic).toBe("traffic");
  });
});

describe("v14 routing 6 and scenarios 5: power and trains in the rain, said other ways", () => {
  it.each([
    ["mazhai vandha current enga pogum", "power"],
    ["Where does power go off when it rains?", "power"],
    ["What about power if it rains tonight?", "power"],
    ["What happens to power if it rains tonight?", "power"],
    ["Will the power go if it rains tonight?", "power"],
    ["Where will power go off if it rains?", "power"],
    ["Show power on the map when it rains", "power"],
    ["Which trains get delayed in rain?", "metro"],
    ["Metro in heavy rain", "metro"],
    ["Are trains running late in the rain?", "metro"]
  ])("%s: %s", (said, topic) => {
    expect(cityTopic(said)).toBe(topic);
    expect(cityAsk(said)).toMatchObject({ topic, focus: null, rain: null });
  });

  it("the rain itself and English 'current' are not power; metro water is not trains", () => {
    expect(cityTopic("What is the current rainfall?")).toBeNull();
    expect(cityTopic("Is the current rain heavy?")).not.toBe("power");
    expect(cityTopic("Metro water supply in the rain")).not.toBe("metro");
  });
});
