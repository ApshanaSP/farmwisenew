/**
 * v10 (docs/jarvis/JARVIS_V10.md 4.8 and Part 3): who a line is said to.
 *   - Jarvis's own name by ear: the owner's "Javes, Goto News." (19 Nov) and "எப்படி இருக்காதே ஜர்விஸ்?" are said to Jarvis.
 *   - Speech to a person in Tamil script: a vocative with a comma ("சார், ...", "ஏங்க, ...", "தம்பி, ...", "அண்ணா, ...") is someone else's.
 *   - A lone unclear word ("வாயமுர்ரா.") or a cut-off line that reached the lanes (named, called or engaged) waits; it is never answered.
 * Failing first on v9's gate and lanes.
 */
import { describe, expect, it } from "vitest";
import { addressed, namedIn, sideTalk8 } from "../addressed";
import { WORLD } from "../fixture";
import { referenceWorld } from "../world";
import { browserLaneV10 } from "./browser10";

const world = { ...WORLD, ...referenceWorld() };
const gate = (text: string, o: { engagedSec?: number | null } = {}) => {
  const now = 1_000_000;
  return addressed({ text, lastTurnAt: o.engagedSec == null ? null : now - o.engagedSec * 1000, now, rulesSure: false, districtNoun: false });
};
const state = { page: "overview", period: "daily", zone: null, dept: null, cat: null, taluk: null, sev: null, mapMode: "zones", panel: null, incident: null, listLength: 0, lastPlace: null, numbers: false } as never;
const lane = (said: string) => browserLaneV10(said, { stage: null, news: { items: [] }, state, world, listenLang: "en", heardLang: /[஀-௿]/u.test(said) ? "ta" : "en", v7: true, lex: [] });

describe("v10: Jarvis's own name by ear", () => {
  it.each([["Javes, Goto News.", "Goto News."], ["Jarvees, open the news", "open the news"], ["எப்படி இருக்காதே ஜர்விஸ்?", "எப்படி இருக்காதே"]])("'%s' is named", (said, rest) => {
    const n = namedIn(said);
    expect(n).not.toBeNull();
    expect((n ?? "").replace(/[?.]+$/, "").trim().toLowerCase()).toBe(rest.replace(/[?.]+$/, "").trim().toLowerCase());
    expect(gate(said).act).toBe(true);
  });
  it.each(["Jaws was a good film", "he has a javelin", "jerseys for the team"])("'%s' is not the name", (said) => {
    expect(namedIn(said)).toBeNull();
  });
});

describe("v10: speech to a person in the room, in Tamil script", () => {
  it.each(["சார், கார் ரெடியா இருக்கு", "ஏங்க, காபி வேணுமா?", "தம்பி, அந்த ஃபைலை எடுத்துட்டு வா", "அண்ணா, மீட்டிங் எப்போ?", "மேடம், கையெழுத்து போடுங்க", "ஐயா, அவர் வந்துட்டாரு"])("'%s' is someone else's", (said) => {
    expect(sideTalk8(said)).not.toBeNull();
    expect(gate(said, { engagedSec: 5 }).act).toBe(false);
  });
  it.each(["அண்ணா நகர் புகார்களைக் காட்டு", "அம்மா உணவகம் பற்றிய செய்தி"])("'%s' (a place or a name, no vocative) is not", (said) => {
    expect(sideTalk8(said)).toBeNull();
  });
});

describe("v10: talk about the screen, a phone call, reported speech (v10-research/30-side-talk.md 5.4)", () => {
  it.each([
    ["ஏங்க, இதைப் பாருங்க", 4], ["See, this one has gone up", 3], ["Look at this, Adyar is the worst again", 3], ["look here, the numbers doubled", 5],
    ["Idhu romba jaasthi aagiduchu, paarunga", 4], ["இதோ பாருங்க, அடையார் மறுபடியும் மோசம்", 4], ["idho paarunga, Adyar la thaan adhigam", 6],
    ["Hello? Haan, sollunga", 4], ["ஹலோ? சொல்லுங்க", 5], ["Hello, yes, speaking", 8],
    ["He said show the Adyar report", 5], ["அடையார் ரிப்போர்ட் காட்டுங்கன்னு சொன்னார்", 5], ["நாளைக்கு மழை வருமாம்", 5], ["Kodungaiyur la thanni illaiyaam", 5]
  ])("'%s' (%i s after Jarvis spoke) is not for Jarvis", (said, sec) => {
    expect(gate(said, { engagedSec: sec }).act).toBe(false);
  });
  it.each([
    ["Open the Akvan storm news", 6], ["Adyar la evvalavu complaints?", 7], ["look up the Akvan news", 5], ["show me this one", 4], ["இதைத் திறங்க", 4],
    ["Adyar cases paarunga", 5], ["இந்த வாரம் எத்தனை புகார்கள் வந்திருக்கு?", 6], ["அங்கே போகலாம்", 30]
  ])("'%s' (%i s after) is not silenced by these rules", (said, sec) => {
    const g = gate(said, { engagedSec: sec });
    if (sec <= 20) expect(g.act).toBe(true);
    else expect(g.why).not.toMatch(/screen|phone|hearsay/);
  });
});

describe("v10: a lone unclear word or a cut-off line that reached the lanes waits", () => {
  it.each(["வாயமுர்ரா.", "Tell me about the", "What are the"])("'%s' waits", (said) => {
    expect(lane(said).lane).toBe("wait");
  });
  it.each(["அடுத்து", "Adyar", "stop", "yes", "next", "நன்றி"])("'%s' does not", (said) => {
    expect(lane(said).lane).not.toBe("wait");
  });
  // v10 review 2, finding 27: the brief's own one-word example and "Please." reached the lanes (unclearWord exempts a filler) and were answered
  it.each(["தயவுசெய்து,", "Please.", "Please, please."])("a filler alone ('%s') waits", (said) => {
    expect(lane(said).lane).toBe("wait");
  });
  it.each(["yes", "சரி", "no", "இல்லை", "okay"])("a yes, a no or an ack ('%s') is still an answer", (said) => {
    expect(lane(said).lane).not.toBe("wait");
  });
});

describe("v10 review 2: a whole question that ends on 'is' or 'are' is no cut-off line on the open mic either (finding 19)", () => {
  // v10 review 2, finding 19: the gate's cut-off rule held "Tell me where the relief centres are" in the engaged window, and it was never answered
  it.each(["Tell me where the relief centres are", "Tell me what the IMD warning is"])("'%s' (5 s after Jarvis spoke) is acted on", (said) => {
    expect(gate(said, { engagedSec: 5 }).act).toBe(true);
  });
  it.each(["And the real problem is the", "What are the", "Tell me if the drain is"])("'%s' is still cut off", (said) => {
    expect(gate(said, { engagedSec: 5 }).why).toBe("cut-off");
  });
});

describe("v10 review 2: a yes or a no in Tamil and Tanglish is no hearsay (finding 21)", () => {
  // v10 review 2, finding 21: HEARSAY_TA matched ஆமாம் (ஆ + மாம்) and HEARSAY_TG matched "vendaam" (ven + daam): these were silenced
  it.each(["ஆமாம்", "சரி, ஆமாம்", "Map vendaam", "Adyar report vendaam"])("'%s' 3 s after Jarvis spoke is acted on", (said) => {
    const g = gate(said, { engagedSec: 3 });
    expect(`${g.act} ${g.why}`).toBe("true engaged");
  });
  it.each(["நாளைக்கு மழை வருமாம்", "Kodungaiyur la thanni illaiyaam"])("'%s' is still hearsay", (said) => {
    expect(gate(said, { engagedSec: 3 }).why).toBe("hearsay");
  });
});

describe("v10 review 2, round 2: a cleft or a relative clause cut off is held on the open mic (finding 19)", () => {
  // v10 review 2, round 2: the embedded-question rule took any word before what/where for a request's frame, so the gate acted on these half
  // sentences in the engaged window and the lanes answered them
  it.each(["And what I need is", "Okay what I want is", "Show me the complaints where the status is", "List the wards where the water level is", "So what we need is"])("'%s' (3 s after Jarvis spoke) is cut off", (said) => {
    const g = gate(said, { engagedSec: 3 });
    expect(`${g.act} ${g.why}`).toBe("false cut-off");
  });
  it.each(["Can you tell me where the relief centres are", "Find out who the AE for Velachery is"])("'%s' is still acted on", (said) => {
    expect(gate(said, { engagedSec: 3 }).act).toBe(true);
  });
});

describe("v10 review 2, round 2: a typed line never waits, fillers alone included (finding 27)", () => {
  // v10 review 2, round 2: the fillers' wait ran whatever the source, so a typed "Please." got no reply at all
  const c = (source: "typed" | "whisper" | "captions") => ({ stage: null, news: { items: [] }, state, world, listenLang: "en" as const, heardLang: null, v7: true, lex: [], source });
  it.each(["Please.", "hmm", "தயவுசெய்து", "Please, please.", "ம்ம்"])("typed '%s' does not wait", (said) => {
    expect(browserLaneV10(said, c("typed")).lane).not.toBe("wait");
  });
  it.each(["Please.", "தயவுசெய்து,"])("spoken '%s' still waits", (said) => {
    expect(browserLaneV10(said, c("whisper")).lane).toBe("wait");
    expect(browserLaneV10(said, c("captions")).lane).toBe("wait");
  });
});
