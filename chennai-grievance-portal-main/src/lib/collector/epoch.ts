/**
 * One counter for "the store's answers changed under the caches" (QA pass 4, RC-35). A Collector decision, or an officer step that closes a case, changes what
 * every figure and status says, but the readers that keep a result for a while (Jarvis's tool results 30 s, the assistant's shared reads 60 s, its composed
 * cards 10 min, developing stories 10 min, the map's answers and the insight cards) only learned it when their time ran out. A writer calls bumpDataEpoch()
 * after its commit; each cache calls syncEpoch(itsMap) before it reads and is emptied when the epoch has moved. In one server process, so a decision made
 * through this process reaches every reader in it at once.
 */
const g = globalThis as { __dataEpoch?: number };
const seen = new WeakMap<object, number>();

export const dataEpoch = (): number => g.__dataEpoch ?? 0;
export const bumpDataEpoch = (): number => (g.__dataEpoch = dataEpoch() + 1);

/** Empty `cache` if a decision has been made since it was last looked at. Call before every read of it. */
export function syncEpoch(cache: { clear(): void }): void {
  const e = dataEpoch();
  const was = seen.get(cache);
  if (was !== e) {
    if (was !== undefined) cache.clear();
    seen.set(cache, e);
  }
}

/** Same for a cache kept as a plain property bag (a global object keyed by a string). */
export function syncEpochKeys(bag: Record<string, unknown> | undefined, token: object): void {
  if (!bag) return;
  const e = dataEpoch();
  const was = seen.get(token);
  if (was !== e) {
    if (was !== undefined) for (const k of Object.keys(bag)) delete bag[k];
    seen.set(token, e);
  }
}
