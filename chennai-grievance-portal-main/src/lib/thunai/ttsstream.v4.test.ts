import { describe, expect, it } from "vitest";
import { SseAudio, streamBody } from "./ttsstream";

const b64 = (bytes: number[]) => Buffer.from(bytes).toString("base64");

describe("the streamed speech reader (wire format from the docs, unverified live)", () => {
  it("takes the audio of every step.delta, in order, across chunk boundaries, and nothing else", () => {
    const sse = new SseAudio();
    const ev = (o: unknown, name: string) => `event: ${name}\ndata: ${JSON.stringify(o)}\n\n`;
    const all = ev({ event_type: "interaction.created", interaction: { id: "x" } }, "interaction.created")
      + ev({ event_type: "step.start", index: 1, step: { type: "model_output" } }, "step.start")
      + ev({ event_type: "step.delta", index: 1, delta: { type: "audio", data: b64([1, 2, 3]) } }, "step.delta")
      + ev({ event_type: "step.delta", index: 1, delta: { type: "text", text: "not audio" } }, "step.delta")
      + ev({ event_type: "step.delta", index: 1, delta: { type: "audio", data: b64([4, 5]) } }, "step.delta")
      + ev({ event_type: "interaction.completed", interaction: { id: "x" } }, "interaction.completed");
    const got: number[] = [];
    // fed in awkward pieces, as a network delivers them
    for (let i = 0; i < all.length; i += 7) for (const p of sse.push(all.slice(i, i + 7))) got.push(...p);
    for (const p of sse.end()) got.push(...p);
    expect(got).toEqual([1, 2, 3, 4, 5]);
    expect(sse.completed).toBe(true);
    expect(sse.error).toBeNull();
  });
  it("an error event is noted as a code, never as text", () => {
    const sse = new SseAudio();
    sse.push(`data: ${JSON.stringify({ event_type: "error", error: { message: "Quota exceeded for the day" } })}\n\n`);
    expect(sse.error).toMatch(/^[A-Za-z0-9._:-]+$/);
  });
  it("a last event with no blank line after it is read at the end", () => {
    const sse = new SseAudio();
    expect(sse.push(`data: ${JSON.stringify({ event_type: "step.delta", delta: { type: "audio", data: b64([9]) } })}`)).toEqual([]);
    expect(sse.end().map((x) => Array.from(x))).toEqual([[9]]);
  });
  it("the request asks for audio, streamed, in the given voice", () => {
    expect(streamBody("gemini-3.8-flash-tts", "Hello.", "Despina")).toEqual({ model: "gemini-3.8-flash-tts", input: "Hello.", response_format: { type: "audio" }, generation_config: { speech_config: [{ voice: "Despina" }] }, stream: true });
  });
});
