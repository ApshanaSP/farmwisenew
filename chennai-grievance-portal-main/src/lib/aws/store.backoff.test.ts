import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// The saving PC (AWS_STORE_SAVE=1) sent a POST /store/write after every write. Opening /collector while it compiled made a burst
// of writes, AWS answered HTTP 429 Too Many Requests, and every later write sent again at once: 31 failures in a row in the log.
// Now a failed send makes the store wait (5 s, 10 s, ... up to 60 s); writes made meanwhile stay in _changes and go in one send.

vi.stubEnv("AWS_STORE_SAVE", "1");
vi.stubEnv("AWS_STORE_DRY_RUN", "");
vi.stubEnv("REFRESH_API_KEY", "test-key");
const { flushForTests: flush, retryDelay } = await import("./store");

const sqliteDb = () => {
  const { DatabaseSync } = (process as unknown as { getBuiltinModule(m: string): { DatabaseSync: new (f: string) => any } }).getBuiltinModule("node:sqlite");
  return new DatabaseSync(":memory:");
};

describe("saving to AWS waits after a 429 instead of sending on every write", () => {
  const conn = sqliteDb();
  const calls: number[] = [];
  let answer = 429;

  beforeAll(() => {
    vi.useFakeTimers();
    conn.exec(`CREATE TABLE _changes (id INTEGER PRIMARY KEY AUTOINCREMENT, t TEXT NOT NULL, k TEXT NOT NULL);
               CREATE TABLE notes (id INTEGER PRIMARY KEY, body TEXT)`);
    global.__awsStore!.durable = { conn, keys: { notes: ["id"] } } as any;
    vi.stubGlobal("fetch", async () => {
      calls.push(Date.now());
      return answer === 429
        ? new Response('{"message":"Too Many Requests"}', { status: 429 })
        : new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
    });
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterAll(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    global.__awsStore!.durable = null;
  });

  const write = async (id: number) => {
    conn.prepare("INSERT INTO notes VALUES (?, ?)").run(id, `note ${id}`);
    conn.prepare("INSERT INTO _changes (t, k) VALUES ('notes', ?)").run(JSON.stringify([id]));
    await flush();
  };
  const waiting = () => (conn.prepare("SELECT count(*) AS n FROM _changes").get() as { n: number }).n;

  it("a burst of writes after a 429 sends once, keeps the changes, and sends them together when the wait is over", async () => {
    for (let i = 1; i <= 30; i++) await write(i);
    expect(calls.length).toBe(1);   // the first write met the 429; the other 29 waited instead of sending
    expect(waiting()).toBe(30);     // nothing lost

    await vi.advanceTimersByTimeAsync(retryDelay(1) - 100);
    expect(calls.length).toBe(1);   // still waiting

    answer = 200;
    await vi.advanceTimersByTimeAsync(200);
    await global.__awsStore!.flushing;
    expect(calls.length).toBe(2);   // one send for all 30 rows
    expect(waiting()).toBe(0);

    await write(31);                // back to normal: a write sends at once
    expect(calls.length).toBe(3);
    expect(waiting()).toBe(0);
  });

  it("the wait doubles after each failure in a row, up to a minute", () => {
    expect([1, 2, 3, 4, 5, 9].map(retryDelay)).toEqual([5_000, 10_000, 20_000, 40_000, 60_000, 60_000]);
  });
});
