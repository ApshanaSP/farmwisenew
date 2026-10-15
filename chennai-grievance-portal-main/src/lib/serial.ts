/**
 * One request at a time per key (a citizen filing a complaint): the next waits until the one before has finished, so a
 * double click or a retry can see what the first one did instead of doing it again. In-process, like the rate limiter.
 */
const queues = new Map<string, Promise<void>>();

/** Waits for earlier holders of `key`; resolves to the function that lets the next one in. */
export async function oneAtATime(key: string): Promise<() => void> {
  const before = queues.get(key) ?? Promise.resolve();
  let done!: () => void;
  const mine = new Promise<void>((r) => (done = r));
  const chain = before.then(() => mine);
  queues.set(key, chain);
  await before;
  return () => {
    done();
    if (queues.get(key) === chain) queues.delete(key);
  };
}
