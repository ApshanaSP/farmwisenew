/**
 * Runs once when the server starts (instrumentation-node.ts: the AWS store starts loading). Compiled for the Edge runtime
 * too, so the Node-only module is imported only behind this check, which the bundler removes from the Edge build.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") await import("./instrumentation-node");
}
