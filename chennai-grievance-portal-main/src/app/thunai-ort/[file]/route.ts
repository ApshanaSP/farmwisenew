import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * Thunai v3's voice detector (Silero VAD, run in the browser by onnxruntime-web) needs the runtime's own files. They are
 * served from the installed package (allow-listed names only), so 14 MB of WebAssembly is not copied into git.
 */
const FILES: Record<string, string> = {
  "ort.wasm.min.mjs": "text/javascript",
  "ort-wasm-simd-threaded.mjs": "text/javascript",
  "ort-wasm-simd-threaded.wasm": "application/wasm"
};

export async function GET(_req: Request, ctx: { params: Promise<{ file: string }> }) {
  const params = await ctx.params;
  const type = Object.hasOwn(FILES, params.file) ? FILES[params.file] : null;
  if (!type) return new NextResponse(null, { status: 404 });
  try {
    const body = await fs.promises.readFile(path.join(process.cwd(), "node_modules", "onnxruntime-web", "dist", params.file));
    return new NextResponse(body, { headers: { "Content-Type": type, "Cache-Control": "public, max-age=604800, immutable" } });
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}
