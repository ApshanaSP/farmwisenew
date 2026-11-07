// the hash of the English-word filter, shared by the generator script and the runtime (plain JS so both can import it)
export const BLOOM_BYTES = 229376;
export const BLOOM_K = 4;
export function bloomIndexes(w) {
  let h1 = 0x811c9dc5, h2 = 0x01000193 ^ 0x9e3779b9;
  for (let i = 0; i < w.length; i++) {
    const c = w.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 + c, 0x85ebca6b) >>> 0; h2 ^= h2 >>> 13;
  }
  h2 = (h2 | 1) >>> 0;
  const m = BLOOM_BYTES * 8, out = [];
  for (let k = 0; k < BLOOM_K; k++) out.push(((h1 + Math.imul(k, h2)) >>> 0) % m);
  return out;
}
