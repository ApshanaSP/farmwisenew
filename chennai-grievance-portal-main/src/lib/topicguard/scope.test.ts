import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { scopeOf } from "./scope";
import { offTopicReply } from "./reply";
import { WORLD } from "@/lib/thunai/fixture";
import { referenceWorld } from "@/lib/thunai/world";

const world = WORLD as never;

describe("topic guard: the code pre-check", () => {
  const OUT = [
    "When was Dhoni's retirement?",
    "How many runs did Virat Kohli score yesterday?",
    "Virat Kohli innings",
    "தோனி எப்போது ஓய்வு பெற்றார்?",
    "dhoni eppo retire aanaru",
    "Who won the IPL?",
    "write a python function to sort a list",
    "tell me a joke",
    "Explain machine learning in one line.",
    "what is my horoscope today",
    "bitcoin price now",
    "Rajinikanth's next movie"
  ];
  for (const q of OUT) it(`declines: ${q}`, () => expect(scopeOf(q, { world }).verdict).toBe("out"));

  const NOT_OUT = [
    "traffic near Chepauk stadium for the IPL match",
    "crowd at Marina for a cricket screening",
    "Is there any traffic diversion for the CSK match today?",
    "any news about the cricket match at Chepauk",
    "metro crowd for the film festival at Nungambakkam",
    "what is a cusec",
    "How is AQI calculated?",
    "what is the northeast monsoon",
    "how do I export this table",
    "Show the history of this case.",
    "who is the chief minister",
    "Tell me about Perambur.",
    "tomato price in Chennai",
    "how many complaints today",
    "hello",
    "what can you do"
  ];
  for (const q of NOT_OUT) it(`does not pre-decline: ${q}`, () => expect(scopeOf(q, { world }).verdict).not.toBe("out"));

  // review 27 Nov: the store's own records and the console's words once fell to a topic word ("stock", "trailer", "coding", "cooking",
  // "assignment", "how far is", "solve this problem") with nothing to anchor them, and were declined with no model asked
  const RECORDS = [
    "Stock-trading app fraud: Rs 11,43,000 lost in Triplicane",
    "How many stock-trading app frauds this month?",
    "Broken-down trailer truck blocks Santhome Cathedral",
    "Trailer truck overturned near Maduravoyal",
    "What does the colour coding mean?",
    "Any cooking gas cylinder blasts this week?",
    "Do we have enough stock of relief material?",
    "How much sandbag stock is there for the monsoon?",
    "Show the assignment status of my tasks",
    "How far is the nearest shelter from Velachery?",
    "How can we solve this problem?",
    "Theft at actor Vijay's house in Neelankarai"
  ];
  for (const q of RECORDS) it(`a record or console question is never pre-declined: ${q}`, () => {
    expect(scopeOf(q, { world }).verdict).not.toBe("out");
    // the chat's own check (no world) too
    expect(scopeOf(q).verdict).not.toBe("out");
  });

  it("a district locality ties a question to the district (most places have no zone in the reference)", () => {
    const real = { ...(WORLD as object), ...referenceWorld() } as never;
    expect(scopeOf("Is there an IPL match at Chepauk today?", { world: real }).verdict).not.toBe("out");
    expect(scopeOf("Is there an IPL match today?", { world: real }).verdict).toBe("out");
    expect(scopeOf("When was Dhoni's retirement?", { world: real }).verdict).toBe("out");
  });

  it("names the topic it understood (the chat's headline)", () => {
    expect(scopeOf("Who will win the next election?", { world })).toEqual({ verdict: "out", topic: "politics" });
    expect(scopeOf("Who will win the IPL final?", { world }).topic).toBe("sports");
    for (const q of ["Should I buy stocks?", "stock market today", "Leo movie trailer", "How to cook sambar?", "solve this equation 2x + 3 = 7"])
      expect(scopeOf(q, { world }).verdict, q).toBe("out");
  });

  it("leaves a short follow-up inside a thread to the model", () => {
    expect(scopeOf("and who won the match?", { world, follows: true }).verdict).not.toBe("out");
    expect(scopeOf("and who won the match?", { world }).verdict).toBe("out");
    for (const q of ["what about the IPL match", "for the CSK match?", "Is it the IPL match?", "Do the same for the IPL match day", "only the film shoots"])
      expect(scopeOf(q, { world, follows: true }).verdict, q).not.toBe("out");
  });

  it("a short question that stands on its own is declined inside a thread too (review 27 Nov)", () => {
    for (const q of ["When was Dhoni's retirement?", "Who won the toss?", "Tell me a joke", "What is machine learning?", "தோனி எப்போது ஓய்வு பெற்றார்?", "dhoni eppo retire aanaru"])
      expect(scopeOf(q, { world, follows: true }).verdict, q).toBe("out");
  });

  it("the Collector's own Data Studio files are never pre-declined, whatever they hold", () => {
    for (const q of ["how many cricket grounds in my playgrounds data", "what does my sports grounds file say about cricket"]) expect(scopeOf(q, { world }).verdict, q).not.toBe("out");
  });

  it("declines none of the bank's must-answer questions", () => {
    const bank = JSON.parse(fs.readFileSync(path.join(process.cwd(), "src/lib/brain/eval/bank.json"), "utf8")) as { id: string; text: string; expect: { kind: string } }[];
    const must = bank.filter((x) => ["answer", "action", "clarify"].includes(x.expect.kind));
    expect(must.length).toBeGreaterThan(1000);
    const wrong = must.filter((x) => scopeOf(x.text, { world }).verdict === "out").map((x) => `${x.id}: ${x.text}`);
    expect(wrong).toEqual([]);
    // asked inside a conversation (Jarvis nearly always is) and by the chat's own check, with no world
    expect(must.filter((x) => scopeOf(x.text, { world, follows: true }).verdict === "out" || scopeOf(x.text).verdict === "out").map((x) => `${x.id}: ${x.text}`)).toEqual([]);
  });

  it("never pre-declines small talk or a civic term the bank expects answered (AQI, cusec, POCSO, SLA, monsoon)", () => {
    const bank = JSON.parse(fs.readFileSync(path.join(process.cwd(), "src/lib/brain/eval/bank.json"), "utf8")) as { id: string; text: string; expect: { kind: string } }[];
    const chat = bank.filter((x) => x.expect.kind === "chat");
    expect(chat.length).toBeGreaterThan(20);
    expect(chat.filter((x) => scopeOf(x.text, { world }).verdict === "out").map((x) => `${x.id}: ${x.text}`)).toEqual([]);
  });

  it("says the decline in the asker's language", () => {
    expect(offTopicReply("ta", { voice: true })).toMatch(/[஀-௿]/);
    expect(offTopicReply("en", { topic: "sports" })).toMatch(/^Sports are outside what I cover\. I answer about Chennai district/);
    expect(offTopicReply("en", { topic: "sports", voice: true })).toMatch(/^Sorry, that is outside what I cover\. Ask me about Chennai district/);
    expect(offTopicReply("en", { dept: "Greater Chennai Police" })).toMatch(/Greater Chennai Police's records/);
    expect(offTopicReply("tanglish")).toMatch(/velaikku veliya/);
  });
});
