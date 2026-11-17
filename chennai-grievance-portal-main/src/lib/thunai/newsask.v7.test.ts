import { describe, expect, it } from "vitest";
import { newsAsk } from "./newsask";

const on = { items: [{ id: "d1", source: "The Hindu", title: "Flooding in Adyar" }, { id: "d2", source: "DT Next", title: "Metro work" }] };

describe("v7: 'tell me about this news' reads the item on screen (the owner's example)", () => {
  it("English, Tamil and Tanglish, with a news list on screen", () => {
    for (const s of ["tell me about this news", "Jarvis, tell me about this news", "what is this news about", "explain this article", "summarise this story", "tell me more about that report", "brief me on this news",
      "இந்த செய்தி பற்றி சொல்லு", "இந்தச் செய்தியைப் பற்றி சொல்லுங்க", "indha news pathi sollu"])
      expect(newsAsk(s, on), s).toEqual({ kind: "read", body: { id: "d1" } });
  });
  it("the one being read, or the one named, wins", () => {
    expect(newsAsk("tell me about this news", { ...on, reading: "d2" })).toEqual({ kind: "read", body: { id: "d2" } });
    expect(newsAsk("tell me about the second news", on)).toEqual({ kind: "read", body: { id: "d2" } });
  });
  it("a case on screen: its own news report", () => {
    expect(newsAsk("tell me about this news", { incident: "INC-1" })).toEqual({ kind: "read", body: { incident: "INC-1" } });
  });
  it("nothing on screen, or the news in general: not this lane (the news screen and its summary)", () => {
    expect(newsAsk("tell me about this news", {})).toBeNull();
    expect(newsAsk("tell me about the news", on)).toBeNull();
    expect(newsAsk("what's in the news today", on)).toBeNull();
  });
});
