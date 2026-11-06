// QA pass 4, golden master: the route inventory, read from the route files, never written by hand.
import fs from "node:fs";
import path from "node:path";

const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : e.name === "route.ts" ? [path.join(dir, e.name)] : []));

/** What the GET handler reads from the query string: `p.get("x")`, `searchParams.get("x")`, and the officer's parseScope(p). */
function getParams(src) {
  const at = src.search(/export\s+(?:async\s+)?function\s+GET\b/);
  if (at < 0) return [];
  const after = src.slice(at + 10);
  const end = after.search(/\nexport\s/);
  const body = end < 0 ? after : after.slice(0, end);
  const out = new Set();
  for (const m of body.matchAll(/\b(?:p|searchParams)\.get\(\s*["'`]([A-Za-z_]+)["'`]\s*\)/g)) out.add(m[1]);
  if (/\bparseScope\(/.test(body)) for (const k of ["period", "zone", "taluk"]) out.add(k);
  return [...out].sort();
}

/** One row per route file: its URL, the methods it exports, its dynamic segments and the query parameters its GET reads. */
export function inventory(appRoot) {
  const api = path.join(appRoot, "src", "app", "api");
  return walk(api).map((file) => {
    const rel = path.relative(api, path.dirname(file)).split(path.sep).join("/");
    const src = fs.readFileSync(file, "utf8");
    const methods = [...new Set([...src.matchAll(/export\s+(?:async\s+function|const|function)\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/g)].map((m) => m[1]))].sort();
    return { route: `/api/${rel}`, methods, segments: [...rel.matchAll(/\[([^\]]+)\]/g)].map((m) => m[1]), params: getParams(src) };
  }).sort((a, b) => a.route.localeCompare(b.route));
}
