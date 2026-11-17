import fs from "fs";
import path from "path";
import { expect, test } from "@playwright/test";

/**
 * v6 probe (no server, no quota): how long Edge's natural voices take to START an utterance, by its length, warm (a silent utterance
 * first, as Jarvis's prewarm does). The v6c run showed Tamil answers starting 2-3.5 s after speak(), between two sentences too.
 *   PW_CHANNEL=msedge npx playwright test tests/e2e/voiceprobe6.spec.ts      -> eval/v6/latency/voiceprobe.json
 */
test.skip(!process.env.REAL, "opens Edge's online voices: run with REAL=1");
const KEEP_VOICES = ["--disable-background-networking", "--disable-component-update", "--disable-component-extensions-with-background-pages", "--disable-default-apps", "--disable-extensions"];
test.use({ channel: process.env.PW_CHANNEL || "msedge", launchOptions: { ignoreDefaultArgs: KEEP_VOICES, args: ["--autoplay-policy=no-user-gesture-required"] } });

const TA_SHORT = "ராயபுரத்தில் இப்போது நிலவரம் இது.";
const TA_MID = "ராயபுரத்தில் கடந்த இருபத்து நான்கு மணி நேரத்தில் ஐந்து கடுமையான சம்பவங்கள், அதில் மூன்று காலக்கெடு தாண்டியவை.";
const TA_LONG = `${TA_MID} சுகாதாரச் சேவைகள் மற்றும் மருத்துவமனைகள் பற்றிய புகார்கள் அதிகம்; மாநகராட்சியின் மழைநீர் வடிகால் பிரிவு பொறுப்பில் இருக்கிறது.`;
const EN_SHORT = "Here is Royapuram right now.";
const EN_LONG = "In Royapuram, five severe incidents in the last twenty-four hours, three of them past their deadline; the health services and hospitals have the most complaints, and the corporation's drains team has most of them.";

test("voice start by length, warm", async ({ page }) => {
  test.setTimeout(300_000);
  await page.goto("about:blank");
  await page.waitForFunction(() => speechSynthesis.getVoices().some((v) => /Online \(Natural\)/.test(v.name)), null, { timeout: 30_000 });
  const rows = await page.evaluate(async (texts) => {
    const pick = (lang: string) => speechSynthesis.getVoices().find((v) => v.lang === lang && /Online \(Natural\)/.test(v.name)) ?? null;
    const say = (text: string, lang: string, volume = 1) => new Promise<number>((res) => {
      const u = new SpeechSynthesisUtterance(text); u.lang = lang; u.voice = pick(lang); u.volume = volume;
      const t0 = performance.now(); let started = -1;
      u.onstart = () => { started = performance.now() - t0; };
      u.onend = () => res(started);
      u.onerror = () => res(-1);
      speechSynthesis.speak(u);
    });
    const out: { kind: string; lang: string; chars: number; startMs: number }[] = [];
    for (let rep = 0; rep < 4; rep++) {
      for (const [kind, text, lang] of texts) {
        await say(".", lang, 0);            // the warm-up utterance Jarvis sends
        await new Promise((r) => setTimeout(r, 400));
        out.push({ kind, lang, chars: text.length, startMs: Math.round(await say(text, lang)) });
      }
    }
    return out;
  }, [["ta-short", TA_SHORT, "ta-IN"], ["ta-mid", TA_MID, "ta-IN"], ["ta-long", TA_LONG, "ta-IN"], ["en-short", EN_SHORT, "en-IN"], ["en-long", EN_LONG, "en-IN"]] as [string, string, string][]);
  const out = path.join(process.cwd(), "eval", "v6", "latency", "voiceprobe.json");
  fs.writeFileSync(out, JSON.stringify({ at: new Date().toISOString(), note: "Edge headless, natural online voices, warm (a silent utterance 400 ms before); startMs = speak() -> the utterance's start event", rows }, null, 1));
  console.log(JSON.stringify(rows));
  expect(rows.length).toBe(20);
});
