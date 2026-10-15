import { createHash } from "crypto";
import { NextResponse } from "next/server";

/**
 * JSON with a strong ETag taken from the body: a browser that already holds the same
 * answer gets a 304 and no body, so a big unchanged payload is not sent twice.
 */
export function jsonWithEtag(req: Request, body: unknown, headers: Record<string, string> = {}): NextResponse {
  const text = JSON.stringify(body);
  const tag = `"${createHash("sha1").update(text).digest("base64url")}"`;
  const seen = (req.headers.get("if-none-match") ?? "").split(",").map((t) => t.trim().replace(/^W\//, ""));
  const common = { ETag: tag, ...headers };
  if (seen.includes(tag)) return new NextResponse(null, { status: 304, headers: common });
  return new NextResponse(text, { headers: { "Content-Type": "application/json", ...common } });
}
