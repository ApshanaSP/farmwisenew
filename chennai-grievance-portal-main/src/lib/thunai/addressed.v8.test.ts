import { afterEach, describe, expect, it } from "vitest";
import { addressed } from "./addressed";

// the owner's example 5: speech to someone else in the room is not answered; a request inside the conversation still is.
// Every line here is heard by the open mic, unnamed, a few seconds after Jarvis last spoke (the engaged window).
const at = (text: string, o: { sec?: number; sure?: boolean; noun?: boolean; awaiting?: boolean } = {}) =>
  addressed({ text, lastTurnAt: 1_000_000 - (o.sec ?? 5) * 1000, now: 1_000_000, rulesSure: o.sure ?? false, districtNoun: o.noun ?? false, awaitingAnswer: o.awaiting ?? false });

describe("v8 addressee: said to someone else, stays silent", () => {
  const side = ["Ramesh, send the file to the Commissioner.", "Call him back after lunch.", "Madam, the car is ready downstairs.", "Siri, set a timer for ten minutes.",
    "Alexa, when was it open?", "Yes, tell the DRO I'll be there by four.", "அவரை உள்ளே வரச் சொல்லுங்க.", "Kumar, andha file ah kondu vaa", "Okay okay.", "Hmm.",
    "What are the", "தயவுசெய்து,", "வாயமுர்ரா.", "Did you speak to the PWD engineer about it?", "Show the Adyar report, Ramesh.", "Google, what's the time?",
    "Sir, the MLA is waiting outside.", "Ask the AE to come at four.", "Tell him to wait.", "Inform the Commissioner.", "PA kitta kudunga"];
  for (const t of side) it(t, () => { const g = at(t, { noun: /Adyar|PWD|AE|MLA|Commissioner/.test(t) }); expect(g.act, g.why).toBe(false); });
  it("an assistant's or a person's name closes the line even with a district word in it", () => expect(at("Ramesh, show the Adyar cases.", { noun: true, sure: true }).act).toBe(false));
});

describe("v8 addressee: a request inside the conversation is still answered", () => {
  const asks: [string, boolean][] = [["Show the severe cases in Adyar.", true], ["What about Royapuram?", true], ["அடையாறு நிலவரம் என்ன?", true], ["Open the news.", true],
    ["The Nungambakkam subway one, open it.", true], ["Supreme Court news open pannunga.", false], ["Open the Supreme Court news on Palikan.", false], ["Next.", false], ["Why?", false],
    ["Open the second one.", false], ["rendavadhu news ah padinga", false], ["Tell me about the first one.", false], ["Only the severe ones.", false], ["Who has it?", false],
    ["Since when?", false], ["Okay, show the severe cases.", false], ["Kasimedu harbour news pathi sollunga", false]];
  for (const [t, noun] of asks) it(t, () => { const g = at(t, { noun }); expect(g.act, g.why).toBe(true); });
  it("a plain yes while Jarvis waits for one is an answer", () => expect(at("Okay.", { awaiting: true }).act).toBe(true));
  it("the name always acts", () => expect(at("Jarvis, ask the AE to come at four.").act).toBe(true));
});

describe("v8 addressee: the v7 gate stays with JARVIS_UNDERSTAND=v7 (the rollback)", () => {
  afterEach(() => { delete process.env.JARVIS_UNDERSTAND; });
  it("v7 answered 'Alexa, when was it open?' in the window", () => {
    process.env.JARVIS_UNDERSTAND = "v7";
    expect(at("Alexa, when was it open?").act).toBe(true);
  });
});
