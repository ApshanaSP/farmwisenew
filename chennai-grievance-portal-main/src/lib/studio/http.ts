/**
 * HTTP helpers for the Studio's routes: a run streamed as NDJSON (one event per line, so the page animates each agent
 * as it finishes), and the audit entry every change leaves.
 */
import { audit } from "@/lib/collector/sources";
import type { RunEvent } from "@/lib/studio/types";
import { LinkError } from "@/lib/studio/fetchurl";
import { ParseError } from "@/lib/studio/parse";

export function stream(work: (emit: (e: RunEvent) => void) => Promise<string>): Response {
  const enc = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(ctrl) {
      let open = true;
      const emit = (e: RunEvent) => {
        if (!open) return;
        try { ctrl.enqueue(enc.encode(JSON.stringify(e) + "\n")); } catch { open = false; }
      };
      try {
        const id = await work(emit);
        emit({ t: "done", id });
      } catch (e) {
        const known = e instanceof ParseError || e instanceof LinkError;
        if (!known) console.error("[studio] run failed", e);
        emit({ t: "error", message: known ? (e as Error).message : `Something went wrong while reading the data: ${((e as Error).message ?? "").slice(0, 140)}` });
      } finally {
        open = false;
        try { ctrl.close(); } catch { /* the page went away */ }
      }
    }
  });
  return new Response(body, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no" }
  });
}

/** The audit log (never blocks or breaks a Studio action). */
export async function note(actor: string, action: string, id: string, after: unknown) {
  try { await audit(actor, action, "studio", null, null, { dataset: id, ...(after as object) }); } catch (e) { console.warn("[studio] audit failed", (e as Error).message); }
}
