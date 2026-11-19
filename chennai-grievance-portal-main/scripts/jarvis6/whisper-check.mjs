/** v6: decode clips with Groq Whisper (language auto) to check what a synthetic clip really says. Keys from .env, never printed. Ledger-recorded. */
import fs from "fs";
import path from "path";
import { DatabaseSync } from "node:sqlite";
process.loadEnvFile(".env");
const db = new DatabaseSync(path.join("data", "thunai", "ledger.sqlite"));
for (const f of process.argv.slice(2)) {
  const fd = new FormData();
  fd.append("file", new Blob([fs.readFileSync(f)], { type: "audio/wav" }), "a.wav");
  fd.append("model", "whisper-large-v3-turbo");
  fd.append("response_format", "verbose_json");
  db.prepare("INSERT INTO spend VALUES (?,?,?,?,?,?,?)").run(Date.now(), "groq", "whisper-large-v3-turbo", 1, 0, 10, "eval");
  const r = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", { method: "POST", headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` }, body: fd });
  const j = await r.json();
  console.log(path.basename(f), r.status, j.language, JSON.stringify(j.text), (j.segments ?? []).map((s) => `${s.start}-${s.end}`).join(" "));
}
