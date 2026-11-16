/**
 * Jarvis v5 E3: a warm connection to Groq, JARVIS_KEEPALIVE (default on: KEEPALIVE_DEFAULT below, set by the measurement). Server
 * only (Node runtime): stt.ts's Whisper requests and gateway.ts's createGroq({ apiKey, fetch }) take `groqFetch`.
 *
 * Node's built-in fetch drops an idle connection after 4 s, so a Collector who speaks every 10-30 s pays a new TCP and TLS
 * handshake to api.groq.com on most requests. Here npm undici (MIT; the version is in package.json) gives its own Agent, which keeps
 * an idle connection 60 s (keepAliveTimeout; a server's own Keep-Alive hint is capped at keepAliveMaxTimeout, 600 s), and undici's
 * OWN fetch is given that Agent as its dispatcher. An npm Agent is never handed to the built-in or Next-wrapped fetch (that pairing
 * is unverified). No warm-up request is ever sent: the first real request opens the connection and the next ones reuse it while
 * it stays open. undici is loaded on that first request, never at import, and never on a Node older than its engines (22.19.0):
 * there every Groq request uses the built-in fetch.
 */
import type { Agent } from "undici";

type Undici = typeof import("undici");

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
 * The oldest Node npm undici 8.12.4 supports (its own package.json: engines node >= 22.19.0). The app declares node 22.x, so a host
 * on 22.0-22.18 can run it: there keep-alive is off, undici is never loaded, and the log says so once (review planner-quota-9).
 */
export const UNDICI_MIN_NODE = "22.19.0";

/** Does this Node version (process.versions.node by default) meet undici's engines? */
export function nodeFitsUndici(v: string = process.versions.node): boolean {
  const have = v.replace(/^v/, "").split(".").map((x) => parseInt(x, 10) || 0), need = UNDICI_MIN_NODE.split(".").map(Number);
  for (let i = 0; i < 3; i++) if ((have[i] ?? 0) !== need[i]) return (have[i] ?? 0) > need[i];
  return true;
}

let said = false;
/** the one log line of this process when keep-alive is wanted and cannot run */
const sayOnce = (why: string) => {
  if (said) return;
  said = true;
  console.warn(`[jarvis keepalive] ${why}: Groq requests use the built-in fetch (no keep-alive)`);
};

/**
 * JARVIS_KEEPALIVE=1 on, 0 off; unset: KEEPALIVE_DEFAULT, except under the unit-test runner (VITEST set), where unset means off:
 * the tests that stub the global fetch must still see every Groq call, and must never reach the network. On a Node older than
 * UNDICI_MIN_NODE it is off whatever the flag says (said once in the log).
 */
export function keepAliveOn(): boolean {
  const v = (process.env.JARVIS_KEEPALIVE ?? "").trim();
  const want = v === "1" ? true : v === "0" ? false : KEEPALIVE_DEFAULT && !process.env.VITEST;
  if (want && !nodeFitsUndici()) { sayOnce(`Node ${process.versions.node} is older than ${UNDICI_MIN_NODE}, which npm undici needs`); return false; }
  return want;
}

let undiciLoad: Promise<Undici> | null = null;
/** npm undici, loaded on first use only (never at import): on a Node older than it needs it is never loaded at all */
const undici = (): Promise<Undici> => (undiciLoad ??= import("undici"));

let agent: Agent | null = null;
/** the one keep-alive Agent of this server process (undici is loaded on the first call) */
export async function keepAliveAgent(): Promise<Agent> {
  const u = await undici();
  return (agent ??= new u.Agent({ ...KEEPALIVE_OPTIONS }));
}

type UFetch = Undici["fetch"];
type UBody = NonNullable<Parameters<UFetch>[1]>["body"];

/**
 * undici brand-checks its OWN FormData class: given the built-in one (stt.ts's Whisper upload) it would send the text
 * "[object FormData]" (Groq answered 400 in the first live try). So a built-in FormData is copied, field by field and file by
 * file (name and type kept), into undici's. Any other body (the gateway's JSON string, a Blob, bytes) is passed as it is.
 */
function ownBody(body: unknown, UFormData: Undici["FormData"]): UBody {
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
export const warmFetch = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
  const u = await undici();
  const opts = { ...(init as Parameters<UFetch>[1]), dispatcher: await keepAliveAgent() };
  if (init && init.body != null) opts.body = ownBody(init.body, u.FormData);
  return u.fetch(input as Parameters<UFetch>[0], opts);
}) as unknown as typeof fetch;

/**
 * The fetch for a Groq request: the warm one with keep-alive on, else the built-in fetch, looked up at call time. If undici cannot
 * be loaded at all, the built-in fetch too (said once in the log).
 */
export const groqFetch = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
  if (keepAliveOn() && await undici().then(() => true, (e: unknown) => { sayOnce(`npm undici did not load (${String((e as Error)?.message ?? e).slice(0, 80)})`); return false; }))
    return warmFetch(input, init);
  return globalThis.fetch(input, init);
}) as typeof fetch;
