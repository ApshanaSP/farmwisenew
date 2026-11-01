/**
 * A sentence in the other language (Jarvis answers in one language and shows the other under it): English to Tamil
 * or Tamil to English, through api/i18n (translated once by AI, then cached). Numbers are taken out first and put back
 * in the same order, so a figure can never change in translation. Null when the AI cannot be reached.
 */
const NUM = /\d+(?:[.,]\d+)*/g;
const memo = new Map<string, string>();

export async function otherLang(text: string, from: "en" | "ta"): Promise<string | null> {
  const to = from === "en" ? "ta" : "en";
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return null;
  const key = `${to}|${clean}`;
  const hit = memo.get(key);
  if (hit) return hit;
  // sentence-sized pieces, each under the endpoint's 400 characters
  const parts = (clean.match(/[^.!?।]+[.!?।]?/g) ?? [clean]).map((s) => s.trim()).filter(Boolean)
    .flatMap((s) => (s.length <= 380 ? [s] : s.match(/.{1,380}(\s|$)/g) ?? [s.slice(0, 380)]));
  // each figure is numbered ("#1", "#2"): Tamil word order differs from English, so a figure must find its own place
  const tpl = parts.map((p) => { let k = 0; return p.replace(NUM, () => `#${++k}`); });
  try {
    const r = await fetch("/api/i18n", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lang: to, texts: tpl.slice(0, 20) }) });
    if (!r.ok) return null;
    const j = (await r.json()) as { out?: Record<string, string> };
    const out = parts.map((p, i) => {
      const t = j.out?.[tpl[i]];
      if (!t) return null;
      const nums = p.match(NUM) ?? [];
      // every figure exactly once, each where its own number is; anything else is not shown (a figure must never change)
      const got = (t.match(/#\d+/g) ?? []).map((x) => Number(x.slice(1))).sort((a, b) => a - b);
      if (got.length !== nums.length || got.some((n, i) => n !== i + 1)) return null;
      return t.replace(/#(\d+)/g, (_, n: string) => nums[Number(n) - 1] ?? "");
    });
    if (out.some((x) => x == null)) return null;
    const res = out.join(" ");
    memo.set(key, res);
    return res;
  } catch {
    return null;
  }
}
