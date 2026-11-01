/**
 * Tamil for the site's words the hand-checked list does not have (components/i18n/Translator.tsx), and English for
 * Jarvis's Tamil answers (lib/i18n/line.ts: every answer is shown in both languages). Each text arrives
 * as a template (numbers already "#"), is translated once by the AI and kept in data/i18n/ta.json, so the next reader
 * gets it at once and the AI is not asked again. A translation that drops or adds a "#" is thrown away (a number must
 * never change). Open to every page (the login page is in Tamil too), so it is rate-limited and takes short texts only.
 */
import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { generateJson } from "@/lib/ai/gateway";
import { checkRateLimit, getClientIp, ipLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

type To = "ta" | "en";
const FILE = (to: To) => path.join(process.cwd(), "data", "i18n", `${to}.json`);
const caches: Partial<Record<To, Map<string, string>>> = {};
const saving: Partial<Record<To, ReturnType<typeof setTimeout>>> = {};

async function load(to: To): Promise<Map<string, string>> {
  const have = caches[to];
  if (have) return have;
  let m: Map<string, string>;
  try { m = new Map(Object.entries(JSON.parse(await fs.readFile(FILE(to), "utf8")) as Record<string, string>)); } catch { m = new Map(); }
  caches[to] = m;
  return m;
}
function save(to: To) {
  if (saving[to]) return;
  saving[to] = setTimeout(async () => {
    delete saving[to];
    try {
      await fs.mkdir(path.dirname(FILE(to)), { recursive: true });
      const sorted = Object.fromEntries([...(caches[to] ?? new Map())].sort(([a], [b]) => a.localeCompare(b)));
      await fs.writeFile(FILE(to), JSON.stringify(sorted, null, 1), "utf8");
    } catch (e) { console.warn("[i18n] cache not saved", (e as Error).message); }
  }, 2000);
}

const Body = z.object({ lang: z.enum(["ta", "en"]), texts: z.array(z.string().min(1).max(400)).max(80) });
const Out = z.object({ items: z.array(z.object({ i: z.number().int(), t: z.string() })) });
const hashes = (s: string) => (s.match(/#/g) ?? []).length;

const SYSTEM = `You translate the on-screen words of a government dashboard (the Chennai District Collector's console) from English into Tamil.
Rules:
- Natural, formal Tamil as used in Tamil Nadu government offices; short, like a label. Keep the meaning exact.
- "#" (or "#1", "#2"...) stands for a number: keep every one exactly as written, the same count, moved to the right place for Tamil word order.
- Place names (Anna Nagar, Adyar, Ambattur, Chembarambakkam...) are written in Tamil script (அண்ணா நகர், அடையாறு...).
- Keep acronyms and brands as they are (IMD, CPCB, GCC, CMWSSB, AQI, PWD, AI, PDF, CSV, District IQ, FarmwiseAI, Jarvis).
- Keep units and symbols (mm, km, %, ·, →, :).
- A text that is already Tamil, a code or a name of a person: return it unchanged.
Return every item with its index.`;

const SYSTEM_EN = `You translate short Tamil (or Tanglish) sentences from a government dashboard's voice assistant into clear, plain English.
Rules:
- Keep the meaning exact; short and natural, as a Collector's aide would say it.
- "#" (or "#1", "#2"...) stands for a number: keep every one exactly as written, the same count.
- Place names in English spelling (Anna Nagar, Adyar, Ambattur...). Keep acronyms (IMD, GCC, AQI...).
- A text that is already English: return it unchanged.
Return every item with its index.`;

export async function POST(req: NextRequest) {
  const ip = getClientIp(req.headers);
  if (!checkRateLimit(`i18n:${ip}`, ipLimit(ip, 60), 60).allowed) return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Bad request." }, { status: 400 });
  const to = parsed.data.lang;
  const map = await load(to);
  const out: Record<string, string> = {};
  const todo: string[] = [];
  for (const t of [...new Set(parsed.data.texts)]) {
    const hit = map.get(t);
    if (hit != null) out[t] = hit; else todo.push(t);
  }
  if (todo.length) {
    try {
      const r = await generateJson({
        role: "fast", name: "translate", schema: Out, system: to === "ta" ? SYSTEM : SYSTEM_EN, temperature: 0, maxOutputTokens: 4000, user: "i18n", timeoutMs: 20_000,
        // no one waits on a label: kept off the main provider's per-minute allowance, which Jarvis and the chat need
        background: true,
        prompt: to === "ta" ? `Translate each text into Tamil.\n${JSON.stringify(todo.map((t, i) => ({ i, en: t })))}`
          : `Translate each text into English.\n${JSON.stringify(todo.map((t, i) => ({ i, ta: t })))}`
      });
      for (const it of r.object.items) {
        const en = todo[it.i];
        const ta = it.t?.trim();
        if (!en || !ta || hashes(ta) !== hashes(en)) continue;
        map.set(en, ta);
        out[en] = ta;
      }
      save(to);
    } catch (e) {
      console.warn("[i18n] AI translation unavailable:", (e as Error).message.slice(0, 160));
    }
  }
  return NextResponse.json({ out });
}
