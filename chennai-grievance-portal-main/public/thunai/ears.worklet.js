// Jarvis's ears on the audio thread: the microphone cut into 20 ms frames, whatever the device's sample rate, each posted
// with the running sample count (the only clock barge-in timing trusts).
class JarvisEars extends AudioWorkletProcessor {
  constructor() {
    super();
    this.size = Math.round(sampleRate * 0.02);
    this.buf = new Float32Array(this.size);
    this.fill = 0;
    this.total = 0;
  }
  process(inputs) {
    const x = inputs[0] && inputs[0][0];
    if (!x) return true;
    for (let i = 0; i < x.length; i++) {
      this.buf[this.fill++] = x[i];
      this.total++;
      if (this.fill === this.size) {
        const frame = this.buf;
        this.port.postMessage({ frame, total: this.total }, [frame.buffer]);
        this.buf = new Float32Array(this.size);
        this.fill = 0;
      }
    }
    return true;
  }
}
registerProcessor("jarvis-ears", JarvisEars);
