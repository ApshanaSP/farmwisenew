/**
 * The PCM path's player (mouth.ts): one answer's audio, asked for in one request, scheduled on an AudioContext as it
 * arrives. A WAV (the server's unary answer, a cache hit, Azure) arrives as one decoded buffer; a stream (audio/l16: 16-bit
 * little-endian mono, headerless) arrives in pieces, and each is scheduled right after the one before, so the first sound
 * plays before the last byte is in. Where in the answer the voice is, is read from the audio clock, which stops while the
 * context is suspended, so a pause keeps the place.
 */

/** 16-bit little-endian PCM to float samples. A byte left over at the end of a piece is carried into the next. */
export function l16ToFloat(bytes: Uint8Array, carry: number | null): { samples: Float32Array; carry: number | null } {
  const all = carry == null ? bytes : (() => { const b = new Uint8Array(bytes.length + 1); b[0] = carry; b.set(bytes, 1); return b; })();
  const n = all.length >> 1;
  const samples = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let v = all[2 * i] | (all[2 * i + 1] << 8);
    if (v >= 0x8000) v -= 0x10000;
    samples[i] = v / 0x8000;
  }
  return { samples, carry: all.length & 1 ? all[all.length - 1] : null };
}

/** float samples as a mono AudioBuffer at their own rate (the context resamples on play) */
export function toBuffer(c: BaseAudioContext, samples: Float32Array, rate: number): AudioBuffer {
  const b = c.createBuffer(1, Math.max(1, samples.length), rate);
  b.getChannelData(0).set(samples);
  return b;
}

/** pieces of a stream, end to end, as one buffer (kept so "continue" plays from it with no second request) */
export function joinSamples(c: BaseAudioContext, parts: Float32Array[], rate: number): AudioBuffer {
  const n = parts.reduce((s, p) => s + p.length, 0);
  const all = new Float32Array(n);
  let at = 0;
  for (const p of parts) { all.set(p, at); at += p.length; }
  return toBuffer(c, all, rate);
}

interface Seg { at: number; dur: number; off: number }

export class Player {
  private segs: Seg[] = [];
  private live = new Set<AudioBufferSourceNode>();
  private next = 0;
  /** seconds of audio scheduled so far: where the next piece sits in the answer's audio */
  private fed = 0;
  private ended = false;
  private stopped = false;
  private waiters: ((played: boolean) => void)[] = [];

  constructor(private c: BaseAudioContext, private dest: AudioNode, private lead = 0.02) {}

  /** something has been scheduled */
  get started() { return this.segs.length > 0; }
  /** seconds of audio scheduled so far */
  get scheduled() { return this.fed; }

  /** Schedule a buffer, from `from` seconds into it, right after what is already scheduled. */
  push(buf: AudioBuffer, from = 0): void {
    if (this.stopped) return;
    const dur = Math.max(0, buf.duration - from);
    if (dur <= 0) return;
    const s = this.c.createBufferSource();
    s.buffer = buf;
    s.connect(this.dest);
    const at = Math.max(this.next, this.c.currentTime + this.lead);
    s.start(at, from);
    this.segs.push({ at, dur, off: this.fed });
    this.next = at + dur;
    this.fed += dur;
    this.live.add(s);
    s.onended = () => { this.live.delete(s); this.check(); };
  }

  /** No more audio is coming. */
  end(): void { this.ended = true; this.check(); }

  /** Seconds of the answer's audio played so far (a gap between late pieces counts nothing). */
  position(): number {
    const t = this.c.currentTime;
    let p = 0;
    for (const g of this.segs) if (t >= g.at) p = g.off + Math.min(g.dur, t - g.at);
    return p;
  }

  /** True when everything scheduled has played and nothing more is coming; false when it was stopped. */
  done(): Promise<boolean> {
    if (this.stopped) return Promise.resolve(false);
    return new Promise((r) => { this.waiters.push(r); this.check(); });
  }

  /** Stop everything at `when` (a few ms ahead lets the caller's fade finish, so the cut does not click). */
  stop(when = this.c.currentTime): void {
    if (this.stopped) return;
    this.stopped = true;
    for (const s of this.live) { s.onended = null; try { s.stop(when); } catch { /* ended */ } }
    this.live.clear();
    const w = this.waiters; this.waiters = [];
    for (const r of w) r(false);
  }

  private check() {
    if (this.stopped || !this.ended || this.live.size) return;
    const w = this.waiters; this.waiters = [];
    for (const r of w) r(true);
  }
}

/**
 * Where each piece of a run of the answer starts in its audio, in seconds: by its share of the characters (no word timings
 * come back from the speech service). For the HUD's line highlight and for where "continue" starts; never for a number.
 */
export function pieceStarts(lengths: number[], duration: number): number[] {
  const total = lengths.reduce((s, n) => s + n, 0) || 1;
  const out: number[] = [];
  let before = 0;
  for (const n of lengths) { out.push((duration * before) / total); before += n; }
  return out;
}
