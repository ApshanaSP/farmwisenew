// QA pass 6, redsec2: the officer, Collector and Ask District IQ searches escape % and _ with a backslash (officer/data.ts:409,
// collector/intel.ts:1451/1456, assistant/compile.ts:254), but the AWS store is SQLite, whose LIKE has no escape character
// unless the query says ESCAPE '\' (the dialect adds none). In-memory database only; no app code, no server.
import { DatabaseSync } from "node:sqlite";
const db = new DatabaseSync(":memory:");
db.exec("CREATE TABLE t (title TEXT)");
for (const t of ["Drain 100% blocked", "Road_work stuck", "plain title", "path C:\\x"]) db.prepare("INSERT INTO t VALUES (?)").run(t);
const esc = (q) => `%${q.replace(/[%_\\]/g, (m) => "\\" + m)}%`; // the app's own escaping
for (const q of ["100%", "Road_work", "%", "_"]) {
  const rows = db.prepare("SELECT title FROM t WHERE title LIKE ?").all(esc(q)).map((r) => r.title);
  const withEscape = db.prepare("SELECT title FROM t WHERE title LIKE ? ESCAPE '\\'").all(esc(q)).map((r) => r.title);
  console.log(`search ${JSON.stringify(q)} -> app's query finds ${JSON.stringify(rows)} | with ESCAPE it would find ${JSON.stringify(withEscape)}`);
}
