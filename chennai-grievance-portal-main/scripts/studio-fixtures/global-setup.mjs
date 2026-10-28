/**
 * The Studio's fixture server, started once for the whole test run (vitest globalSetup): test files run in their own
 * processes, and one closing a server another still uses failed the other's links at random.
 */
import { start } from "./server.mjs";

export default async function setup() {
  const stop = await start().catch((e) => { if (e.code === "EADDRINUSE") return null; throw e; });
  return async () => { await stop?.(); };
}
