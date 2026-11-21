/**
 * v13 (21 Nov): marks work that nobody is waiting for (Jarvis's keep-warm, a stale-while-revalidate refresh, the district snapshot's
 * rebuild), so the store can put a request's own statements ahead of it (aws/store.ts queryTurn).
 *
 * Why: v12 queued every pool statement in one line, so a sign-in check from /api/jarvis/hear or a round's first read waited behind all 17
 * of a warm-up's insights queries (1.6 s measured with 17 x 100 ms statements, review finding 0-0). Work started inside inBackground (and
 * everything it awaits, through AsyncLocalStorage) is marked; everything else counts as a request's own.
 *
 * Server only. The storage is on globalThis: the server's start-up code and the routes load their own copies of a module.
 */
import { AsyncLocalStorage } from "node:async_hooks";

declare global {
  // eslint-disable-next-line no-var
  var __diqBackground: AsyncLocalStorage<true> | undefined;
}
const als = (): AsyncLocalStorage<true> => (globalThis.__diqBackground ??= new AsyncLocalStorage<true>());

/** Runs `fn` as background work: its store statements wait while a request's own are queued. */
export function inBackground<T>(fn: () => Promise<T>): Promise<T> {
  return als().run(true, fn);
}

/** Is the calling code background work (inside inBackground)? */
export const isBackground = (): boolean => als().getStore() === true;
