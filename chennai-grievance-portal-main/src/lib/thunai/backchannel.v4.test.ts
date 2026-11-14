import { describe, expect, it } from "vitest";
import { bargesIn, contentWords, isBackchannel } from "./backchannel";

describe("backchannels: what a listener says while someone else talks, in English, Tamil and Tanglish", () => {
  it.each(["okay", "ok", "Okay.", "yes", "hmm", "Hmm...", "right", "uh-huh", "uh huh", "mm-hmm", "Mm hmm.", "yeah, okay", "OK OK"])("English %s is a backchannel", (t) => {
    expect(isBackchannel(t)).toBe(true);
  });
  it.each(["ம்ம்", "சரி", "ஆமா", "ஓகே", "சரி சரி", "ஆமாம்", "ம்ம்ம்."])("Tamil %s is a backchannel", (t) => {
    expect(isBackchannel(t)).toBe(true);
  });
  it.each(["seri", "aama", "ok", "hmm", "seri seri", "sari", "aamaa ok"])("Tanglish %s is a backchannel", (t) => {
    expect(isBackchannel(t)).toBe(true);
  });
  it.each(["show trends", "stop", "wait", "Adyar", "no", "சரி அடையாறு காட்டு", "okay show me Adyar", "continue", "Jarvis", ""])("%s is not one", (t) => {
    expect(isBackchannel(t)).toBe(false);
  });
  it("counts the words that are not backchannels", () => {
    expect(contentWords("mm-hmm okay")).toBe(0);
    expect(contentWords("okay show trends")).toBe(2);
    expect(contentWords("சரி அடையாறு காட்டு")).toBe(2);
    expect(contentWords("seri, Adyar")).toBe(1);
    expect(contentWords("")).toBe(0);
  });
  it("two words that are not backchannels are a bid for the turn; one is not", () => {
    expect(bargesIn("okay show trends")).toBe(true);
    expect(bargesIn("no wait")).toBe(true);
    expect(bargesIn("அடையாறு காட்டு")).toBe(true);
    expect(bargesIn("Adyar la kaattu")).toBe(true);
    expect(bargesIn("hmm right")).toBe(false);
    expect(bargesIn("wait")).toBe(false);
    expect(bargesIn("aama aama seri")).toBe(false);
    expect(bargesIn("சரி ஓகே")).toBe(false);
  });
});
