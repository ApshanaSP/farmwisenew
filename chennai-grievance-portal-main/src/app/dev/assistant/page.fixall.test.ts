import fs from "fs";
import path from "path";
import { build } from "esbuild";
import { describe, expect, it } from "vitest";

// hunt2-sec-13 / redsec2-12: the dev-only "Ask District IQ" preview statically imported Preview.tsx, which imports fixtures.json
// (57 KB of real Collector answers). notFound() stopped the page in production, but the build still emitted the client chunk with
// the fixtures as a public static file. The import now sits in the development branch only, which the build drops.
//
// The module graph is checked with esbuild, folding process.env.NODE_ENV the way Next's webpack build does (DefinePlugin, then the
// dead branch and its import() are not followed). A full `next build` check is left to the lead.
const page = path.join(__dirname, "page.tsx");

async function inputsFor(nodeEnv: "production" | "development"): Promise<string[]> {
  const r = await build({
    entryPoints: [page], bundle: true, write: false, metafile: true, format: "esm", platform: "neutral", jsx: "automatic",
    define: { "process.env.NODE_ENV": JSON.stringify(nodeEnv) },
    external: ["next/*", "next", "react", "react/*", "react-dom", "@/*", "*.css"],
    loader: { ".json": "json" }, logLevel: "silent"
  });
  return Object.keys(r.metafile!.inputs).map((f) => f.replace(/\\/g, "/"));
}

describe("hunt2-sec-13 / redsec2-12: the dev preview's fixtures stay out of the production build", () => {
  it("a production build of the page does not reach Preview.tsx or fixtures.json", async () => {
    const inputs = await inputsFor("production");
    expect(inputs.some((f) => f.endsWith("dev/assistant/page.tsx"))).toBe(true);
    expect(inputs.filter((f) => /dev\/assistant\/(Preview\.tsx|fixtures\.json)$/.test(f))).toEqual([]);
  });

  it("a development build still has the preview and its fixtures (the check can see them)", async () => {
    const inputs = await inputsFor("development");
    expect(inputs.some((f) => f.endsWith("dev/assistant/Preview.tsx"))).toBe(true);
    expect(inputs.some((f) => f.endsWith("dev/assistant/fixtures.json"))).toBe(true);
  });

  it("the page has no static import of the preview or the fixtures", () => {
    const src = fs.readFileSync(page, "utf8");
    expect(src).not.toMatch(/^\s*import\s+[^;]*from\s+["']\.\/(Preview|fixtures)/m);
    expect(src).toMatch(/if \(process\.env\.NODE_ENV !== "production"\) \{\s*const \{ default: Preview \} = await import\("\.\/Preview"\)/);
  });
});
