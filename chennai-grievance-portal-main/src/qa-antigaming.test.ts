import fs from "fs";
import path from "path";
import { expect, it } from "vitest";

// the frozen held-out sentences (eval/holdout/qa-understanding.jsonl) may appear in no non-test source file: tuning to them fails here
it("no frozen held-out sentence is in the code", () => {
  const set = path.join(process.cwd(), "eval", "holdout", "qa-understanding.jsonl");
  const sentences = fs.readFileSync(set, "utf8").trim().split(/\r?\n/).map((l) => String(JSON.parse(l).text).toLowerCase().trim()).filter((t) => t.length >= 12);
  // short generic follow-ups the QA brief itself names, already in these files at a999d42, before the set was written
  const BEFORE = new Set(["and in adyar?", "what about last month?"]);
  const hits: string[] = [];
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { if (e.name !== "node_modules") walk(p); continue; }
      if (!/\.(ts|tsx|js|mjs|cjs|json)$/.test(e.name) || /\.(test|live|spec)\.|\.cases\.ts$/.test(e.name)) continue;
      const src = fs.readFileSync(p, "utf8").toLowerCase();
      for (const s of sentences) if (!BEFORE.has(s) && src.includes(s)) hits.push(`${path.relative(process.cwd(), p)}: ${s.slice(0, 40)}…`);
    }
  };
  walk(path.join(process.cwd(), "src"));
  expect(hits).toEqual([]);
});
