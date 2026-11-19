/**
 * Gemini's streamed speech, for api/jarvis/say when JARVIS_TTS_STREAM=1 (off by default). Server only.
 *
 * UNVERIFIED, written from the speech-generation docs read on 15 Nov 2026 with no live call made: POST
 * /v1beta/interactions?alt=sse with `"stream": true` answers in server-sent events; each `step.delta` event whose delta.type is
 * "audio" carries base64 audio in delta.data, by default headerless 16-bit little-endian 24 kHz mono PCM that can be joined end
 * to end. The docs disagree on the voice field: the speech page shows generation_config.speech_config: [{ voice }], the API
 * reference names generation_config.structured_speech_config. The route falls back to the one-request WAV path
 * (generateContent, which is what has run so far) whenever a streamed request is refused before any audio.
 */

/** the streamed audio's rate (the docs' default) */
export const STREAM_RATE = 24_000;

/** The body for one streamed answer (UNVERIFIED shape: see above). */
export function streamBody(model: string, text: string, voice: string) {
  return { model, input: text, response_format: { type: "audio" }, generation_config: { speech_config: [{ voice }] }, stream: true };
}

type Event = { event_type?: string; delta?: { type?: string; data?: unknown }; error?: { message?: string } | string };

/** Server-sent events in, the audio bytes of every audio delta out, in order. `error` is set when the stream reports one. */
export class SseAudio {
  private buf = "";
  error: string | null = null;
  completed = false;

  push(text: string): Uint8Array[] {
    this.buf += text.replace(/\r\n/g, "\n");
    const out: Uint8Array[] = [];
    for (let k = this.buf.indexOf("\n\n"); k >= 0; k = this.buf.indexOf("\n\n")) {
      const block = this.buf.slice(0, k);
      this.buf = this.buf.slice(k + 2);
      const data = block.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).replace(/^ /, "")).join("\n");
      if (!data || data === "[DONE]") continue;
      let e: Event;
      try { e = JSON.parse(data) as Event; } catch { continue; }
      if (e.event_type === "step.delta" && e.delta?.type === "audio" && typeof e.delta.data === "string") {
        const bytes = Buffer.from(e.delta.data, "base64");
        if (bytes.length) out.push(new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.length));
      } else if (e.event_type === "error" || e.error) {
        // a code for the log, never the text that was being said
        this.error = typeof e.error === "string" ? "error" : (e.error?.message ?? "error").slice(0, 60).replace(/[^A-Za-z0-9._:-]/g, "_");
      } else if (e.event_type === "interaction.completed") this.completed = true;
    }
    return out;
  }

  /** the stream ended: an event with no blank line after it is read too */
  end(): Uint8Array[] { return this.buf.trim() ? this.push("\n\n") : []; }
}
