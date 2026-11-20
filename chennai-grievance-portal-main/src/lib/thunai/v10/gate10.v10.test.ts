/**
 * v10 (docs/jarvis/JARVIS_V10.md 4.8 and Part 3): who a line is said to.
 *   - Jarvis's own name by ear: the owner's "Javes, Goto News." (19 Nov) and "எப்படி இருக்காதே ஜர்விஸ்?" are said to Jarvis.
 *   - Speech to a person in Tamil script: a vocative with a comma ("சார், ...", "ஏங்க, ...", "தம்பி, ...", "அண்ணா, ...") is someone else's.
 *   - A lone unclear word ("வாயமுர்ரா.") or a cut-off line that reached the lanes (named, called or engaged) waits; it is never answered.
 * Failing first on v9's gate and lanes.
 */
import { describe, expect, it, vi } from "vitest";

// (round 4's conductor tests: the microphone and the voice are stand-ins, as in conductor.v10.test.ts; the gate is real)
vi.mock("@/components/collector/app/thunai/ears", () => ({ Ears: class { live = true; } }));
vi.mock("@/components/collector/app/thunai/mouth", () => ({
  EARCON_GUARD_MS: 400, setMouthHooks: () => undefined, speaking: () => false, nowSaying: () => null, canContinue: () => false,
  continueAnswer: () => false, stopVoice: () => undefined, duckVoice: () => undefined, unduckVoice: () => undefined
}));

import { Conductor, type ConductorHooks } from "@/components/collector/app/thunai/conductor";
import { addressed, embeddedAsk, namedIn, sideTalk8, type Addressed } from "../addressed";
import { WORLD } from "../fixture";
import { referenceWorld } from "../world";
import { browserLaneV10, cutOff } from "./browser10";

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

describe("v10 review 2, round 3: a question asked inside a request is acted on in the engaged window (finding 19)", () => {
  // v10 review 2, round 3: round 2's frame (a listed verb right before the question word) cut these off again: held on the open mic, never answered
  it.each(["Tell me exactly where the Adyar zonal office is", "Tell me again what the IMD warning is", "Can you tell me quickly how many complaints there are",
    "Any idea who the AE for Velachery is?", "Do you remember who the AE for Adyar is?", "Can you find where the relief centres are?",
    "Can you look up who the AE for Adyar is?"])("'%s' (3 s after Jarvis spoke) is acted on", (said) => {
    const g = gate(said, { engagedSec: 3 });
    expect(`${g.act}/${g.why}`).toBe("true/engaged");
  });
});

type Inner = { gateFor(t: string): Addressed; ignored(t: string, g: Addressed): void };
const conductor = (lastTurn: number) => new Conductor({
  hearUrl: () => "/x", siteLang: () => "en", onSentence: () => undefined, cancelTurn: () => undefined, onIgnored: () => undefined,
  onState: () => undefined, rules: () => ({ sure: false, districtNoun: false }), lastTurnAt: () => lastTurn
} as unknown as ConductorHooks) as unknown as Inner;
/** the held line gated and held as the open mic holds it, then its rest gated */
const heldThen = (held: string, rest: string) => {
  const c = conductor(Date.now() - 3000);
  const g = c.gateFor(held);
  c.ignored(held, g);
  const r = c.gateFor(rest);
  return `held:${g.why} rest:${r.act}/${r.why} text:${r.text}`;
};

describe("v10 review 2, round 4: the rest of a held line is its clause, is or are in it or not (finding 20)", () => {
  // v10 review 2, round 4: round 3 let go any rest with an is/are in it as a remark of its own, so the clause a held "Tell me what the" or "Check
  // whether the" waits for, and a noun with its relative clause after "Show me the", were gated as asides and never answered
  it.each([["Tell me what the", "situation is in Velachery"], ["Tell me why the", "power is out in Adyar"], ["Check whether the", "pumps in Velachery are working"],
    ["Tell me if the", "Adyar subway is flooded"], ["Show me the", "wards where water is stagnant"], ["Tell me what the", "problem is in Adyar"],
    ["Show me the", "roads that are flooded in Velachery"]])("'%s' ... '%s' is acted on, joined", (held, rest) => {
    expect(heldThen(held, rest)).toBe(`held:cut-off rest:true/engaged text:${held} ${rest}`);
  });
  // (round 3's remarks stay remarks: one with its own subject, a person or a thing of the speaker's, is no clause of the held line)
  it.each([["Tell me what the", "my phone is not working"], ["Tell me if the", "I will be back in ten minutes"], ["Tell me why the", "your car is ready downstairs"],
    ["Show me the", "the driver is waiting downstairs"]])("'%s' ... '%s' stays a remark", (held, rest) => {
    expect(heldThen(held, rest)).toMatch(/^held:cut-off rest:false\//);
  });
});

describe("v10 review 2, round 4: a relative clause cut off is held, with no article or a phrase before it (finding 19)", () => {
  // v10 review 2, round 4: round 3's embedded question took any words before where/when/who, so a relative clause cut off on its "is" after a bare
  // noun or a place ("Show me complaints where the status is") was acted on as whole and its qualifier lost; the rest then went unaddressed
  it.each(["Show me complaints where the status is", "List complaints in Adyar where the road is", "Show me the complaints in Velachery where the water is",
    "Give me the list of wards where the water is", "Show me only complaints where the status is", "Show me all the complaints from last week in Adyar where the status is"])("'%s' (3 s after Jarvis spoke) is cut off", (said) => {
    expect(`${embeddedAsk(said)} ${cutOff(said)}`).toBe("false true");
    const g = gate(said, { engagedSec: 3 });
    expect(`${g.act} ${g.why}`).toBe("false cut-off");
    expect(lane(said).lane).toBe("wait");
  });
  it("its rest is joined to it and acted on ('Show me complaints where the status is' ... 'still open after a week')", () => {
    expect(heldThen("Show me complaints where the status is", "still open after a week"))
      .toBe("held:cut-off rest:true/engaged text:Show me complaints where the status is still open after a week");
  });
  it.each(["Show me where the relief centres are", "Find out who the AE for Velachery is", "Show me again where the Adyar zonal office is",
    "Find me who the AE for Adyar is", "Show me the map and tell me where the relief centres are", "Can you find where the relief centres are?",
    "Give me an update on where the relief work is", "Show me exactly where the flooding is"])("'%s' (an embedded question) is still acted on", (said) => {
    expect(`${gate(said, { engagedSec: 3 }).act}`).toBe("true");
  });
});

// ---- v10 dev2 (the development set written blind to the code, 20 Nov): the engaged window's own lines, each a failing test first

describe("v10 dev2: dA-reading-9, dB-feature-4, dC-control-4: a request in a later clause is still a request in the engaged window", () => {
  // dev2: the request's shape was looked for only at the line's start (a verb, a question word) or its end (a Tamil verb), so a request after a
  // lead-in ("hold on.") or a topic said first ("rain gauges, ...") was unaddressed, and an imperative ending its clause ("full-aa padinga,") too
  it.each([["full-aa padinga, endha endha area-nu ellam", 4], ["hold on. go deeper here", 1], ["detail-aa kaattunga, endha zone-la adhigam", 5],
    ["முழுசா படிங்க, எந்த எந்த ஏரியான்னு எல்லாம்", 4], ["wait, show me more here", 2], ["one sec. tell me more about this one", 3],
    ["Adyar subway, what's the water level now", 6]] as const)("'%s' (%i s after Jarvis spoke) is acted on", (said, sec) => {
    const g = gate(said, { engagedSec: sec });
    expect(`${g.act}/${g.why}`).toBe("true/engaged");
  });
  it.each(["hold on, I'm on a call", "wait, he is coming", "one sec, the driver is here", "saapadu ready, vaanga", "the rain is heavy, close the windows",
    "the car is ready, go down and wait", "Ramesh, show the Adyar cases."])("'%s' in the window is still not for Jarvis", (said) => {
    expect(gate(said, { engagedSec: 3 }).act).toBe(false);
  });
  it("outside the window it is still unaddressed ('hold on. go deeper here')", () => {
    expect(gate("hold on. go deeper here").act).toBe(false);
  });
});

describe("v10 dev2: dC-control-4, dA-reading-4: the office's own 'we' and 'our' asking about the console's records is no side talk", () => {
  // dev2: "we", "our", "us" made any line side talk, even in the engaged window, so "rain gauges, last 24 hours, what have we got" and "and on our
  // side? any complaints there" were silenced: the Collector's office asking what it holds
  it.each([["rain gauges, last 24 hours, what have we got", 10], ["right, and on our side? any complaints there, how old?", 5], ["how many complaints do we have in Adyar", 4],
    ["and on our end, any petitions about it?", 6], ["what do our records say about Velachery flooding?", 3], ["severe cases, what have we got in Teynampet", 8]] as const)("'%s' (%i s after Jarvis spoke) is acted on", (said, sec) => {
    const g = gate(said, { engagedSec: sec });
    expect(`${g.act}/${g.why}`).toBe("true/engaged");
  });
  it.each(["what have we got for lunch", "shall we go now", "we should leave by five", "our car is ready downstairs", "did we tell him about the meeting"])("'%s' in the window is still side talk", (said) => {
    expect(gate(said, { engagedSec: 4 }).act).toBe(false);
  });
});

describe("v10 dev2: dC-control-2: a list of the console's own named with no verb, in the engaged window", () => {
  // dev2: "severe ones in adair zone, quick" 7 s after Jarvis spoke: six words with no verb and no question word, so it was unaddressed; a
  // follow-up said as the list it wants ("overdue ones in Teynampet") is a request in the conversation
  it.each([["severe ones in adair zone, quick", 7], ["overdue ones in Teynampet zone, fast", 5], ["pending petitions for Kodambakkam zone, quickly", 9], ["the oldest open complaints in Royapuram please", 4]] as const)("'%s' (%i s after Jarvis spoke) is acted on", (said, sec) => {
    const g = gate(said, { engagedSec: sec });
    expect(`${g.act}/${g.why}`).toBe("true/engaged");
  });
  it("in Tamil script too ('அடையாறு மண்டலத்துல சீரியஸ் புகார்கள், சீக்கிரம்')", () => {
    const now = 1_000_000;
    const g = addressed({ text: "அடையாறு மண்டலத்துல சீரியஸ் புகார்கள், சீக்கிரம்", lastTurnAt: now - 5000, now, rulesSure: false, districtNoun: true });
    expect(`${g.act}/${g.why}`).toBe("true/engaged");
  });
  it.each(["status meeting at five", "the zone officer called about the meeting", "severe pain in the back since morning", "new zone officer joined today"])("'%s' in the window is still not for Jarvis", (said) => {
    expect(gate(said, { engagedSec: 4 }).act).toBe(false);
  });
  it("outside the window it is still unaddressed", () => {
    expect(gate("severe ones in adair zone, quick").act).toBe(false);
  });
});
