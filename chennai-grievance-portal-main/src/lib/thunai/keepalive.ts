/**
 * Jarvis v5 E3: a warm connection to Groq, JARVIS_KEEPALIVE (default on: KEEPALIVE_DEFAULT below, set by the measurement). Server
 * only (Node runtime): stt.ts's Whisper requests and gateway.ts's createGroq({ apiKey, fetch }) take `groqFetch`.
 *
 * Node's built-in fetch drops an idle connection after 4 s, so a Collector who speaks every 10-30 s pays a new TCP and TLS
 * handshake to api.groq.com on most requests. Here npm undici (MIT; the version is in package.json) gives its own Agent, which keeps
 * an idle connection 60 s (keepAliveTimeout; a server's own Keep-Alive hint is capped at keepAliveMaxTimeout, 600 s), and undici's
 * OWN fetch is given that Agent as its dispatcher. An npm Agent is never handed to the built-in or Next-wrapped fetch (that pairing
 * is unverified). No warm-up request is ever sent: the first real request opens the connection and the next ones reuse it while
 * it stays open.
 */
import { Agent, FormData as UFormData, fetch as undiciFetch } from "undici";

export const KEEPALIVE_OPTIONS = { keepAliveTimeout: 60_000, keepAliveMaxTimeout: 600_000 } as const;

/**
 * ON by default: the rule was "on only if the gain is 30 ms or more". Measured 15 Nov 2026 (keepalive.live.ts, once, from the
 * owner's laptop: 12 requests to whisper-large-v3-turbo, a synthetic 1 s tone, the two fetches alternating 10 s apart; undici
 * 8.12.4): built-in fetch p50 374 ms, p90 457 ms (387, 457, 315, 374, 334, 433); keep-alive fetch p50 235 ms, p90 858 ms (858,
 * 300, 258, 202, 235, 225). Gain at p50: 139 ms. The keep-alive p90 is its FIRST request, which opened the connection (858 ms,
 * slower than a built-in cold request: not explained, one sample); the five warm ones were 202-300 ms. A Collector silent for
 * more than 60 s pays one such cold request again.
 */
export const KEEPALIVE_DEFAULT = true;

/**
 * JARVIS_KEEPALIVE=1 on, 0 off; unset: KEEPALIVE_DEFAULT, except under the unit-test runner (VITEST set), where unset means off:
 * the tests that stub the global fetch must still see every Groq call, and must never reach the network.
 */
export function keepAliveOn(): boolean {
  const v = (process.env.JARVIS_KEEPALIVE ?? "").trim();
  if (v === "1") return true;
  if (v === "0") return false;
  return KEEPALIVE_DEFAULT && !process.env.VITEST;
}

let agent: Agent | null = null;
/** the one keep-alive Agent of this server process */
export const keepAliveAgent = (): Agent => (agent ??= new Agent({ ...KEEPALIVE_OPTIONS }));

type UFetch = typeof undiciFetch;
type UBody = NonNullable<Parameters<UFetch>[1]>["body"];

/**
 * undici brand-checks its OWN FormData class: given the built-in one (stt.ts's Whisper upload) it would send the text
 * "[object FormData]" (Groq answered 400 in the first live try). So a built-in FormData is copied, field by field and file by
 * file (name and type kept), into undici's. Any other body (the gateway's JSON string, a Blob, bytes) is passed as it is.
 */
function ownBody(body: unknown): UBody {
  if (typeof globalThis.FormData === "function" && body instanceof globalThis.FormData && !(body instanceof UFormData)) {
    const fd = new UFormData();
    for (const [k, v] of body.entries()) {
      if (typeof v === "string") fd.append(k, v);
      else fd.append(k, v, v.name);
    }
    return fd;
  }
  return body as UBody;
}

/** undici's own fetch on the keep-alive Agent, whatever the flag says */
export const warmFetch = ((input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
  const opts = { ...(init as Parameters<UFetch>[1]), dispatcher: keepAliveAgent() };
  if (init && init.body != null) opts.body = ownBody(init.body);
  return undiciFetch(input as Parameters<UFetch>[0], opts);
}) as unknown as typeof fetch;

/** The fetch for a Groq request: the warm one with the flag on, else the built-in fetch, looked up at call time. */
export const groqFetch = ((input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) =>
  (keepAliveOn() ? warmFetch : globalThis.fetch)(input, init)) as typeof fetch;
