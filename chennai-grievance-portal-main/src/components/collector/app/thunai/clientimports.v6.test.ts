/**
 * v6 (defect found by the 17 Nov bundle build): Jarvis's browser code must not reach a server-only module. The Phase 3 briefing imported
 * isNewsMedia from lib/collector/newsrel.ts into screens.ts, which the console's bundle holds (Thunai.tsx -> recipes/explain.ts ->
 * screens.ts), and newsrel.ts reaches the MySQL driver (threads.ts -> db.ts -> mysql2): `next build` failed on node:diagnostics_channel.
 * This walks the static import graph from Thunai.tsx (type-only imports are erased and skipped) and fails on any server-only module.
 */
import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

const SRC = path.resolve(__dirname, "../../../..");
const SERVER_ONLY = [/^mysql2/, /^node:/, /^@\/lib\/collector\/db$/, /^fs$/, /^child_process$/, /^net$/, /^dns$/];
const EXT = ["", ".ts", ".tsx", "/index.ts", "/index.tsx"];

function resolve(from: string, spec: string): string | null {
  const base = spec.startsWith("@/") ? path.join(SRC, spec.slice(2)) : spec.startsWith(".") ? path.resolve(path.dirname(from), spec) : null;
  if (!base) return null;
  for (const e of EXT) { const f = base + e; if (fs.existsSync(f) && fs.statSync(f).isFile()) return f; }
  return null;
}
/** the module specifiers a file imports at run time (not `import type`, not `export type`) */
function importsOf(file: string): string[] {
  const s = fs.readFileSync(file, "utf8");
  const out: string[] = [];
  for (const m of s.matchAll(/^\s*(import|export)\s+(type\s+)?[^;'"]*?\sfrom\s+["']([^"']+)["']/gm)) if (!m[2]) out.push(m[3]);
  for (const m of s.matchAll(/^\s*import\s+["']([^"']+)["']/gm)) out.push(m[1]);
  for (const m of s.matchAll(/\bimport\(\s*["']([^"']+)["']\s*\)/g)) out.push(m[1]);
  return out;
}

describe("the console's Jarvis code stays browser-safe", () => {
  it("no module Thunai.tsx reaches imports the database driver, node: built-ins or the store", () => {
    const start = path.join(SRC, "components", "collector", "app", "thunai", "Thunai.tsx");
    const seen = new Set<string>([start]);
    const queue = [start];
    const bad: string[] = [];
    while (queue.length) {
      const f = queue.shift()!;
      for (const spec of importsOf(f)) {
        if (SERVER_ONLY.some((re) => re.test(spec))) { bad.push(`${path.relative(SRC, f)} -> ${spec}`); continue; }
        const r = resolve(f, spec);
        if (r && !seen.has(r)) { seen.add(r); queue.push(r); }
      }
    }
    expect(seen.size).toBeGreaterThan(20);
    expect(bad).toEqual([]);
  });
});
