/**
 * v16 (22 Nov, the owner: "the voice reply is very late, delayed. It's overlapping."), the mouth with the fake synthesiser and Web Audio
 * context (fakeaudio.testkit.ts). On the owner's sessions every answer was said by the browser's own voice (no server-voice request in the
 * telemetry), which a duck cannot lower ("kept"), so a late answer that began while the Collector was talking played at full volume over them.
 *  - A speech never starts while the Collector holds the floor (MouthHooks.floorHeld): it waits, and nothing of it counts as speaking.
 *  - An acknowledgement is not said at all then.
 *  - During a barge-in the browser's voice stops at the end of its piece while the floor is held, and goes on when it is free.
 *  - A floor never given back does not silence Jarvis: past FLOOR_WAIT_MS the speech is said.
 * Invented sentences only.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeCtx, FakeSynth, FakeUtterance, type FakeVoice } from "./fakeaudio.testkit";

type Mouth = typeof import("./mouth");
const NEERJA: FakeVoice = { name: "Microsoft Neerja Online (Natural) - English (India)", lang: "en-IN" };
let m: Mouth | null = null;
let synth: FakeSynth;
const load = async (): Promise<Mouth> => { vi.resetModules(); m = (await import("./mouth")) as Mouth; return m; };

beforeEach(() => {
  FakeCtx.all = [];
  synth = new FakeSynth([NEERJA]);
  vi.stubGlobal("window", { AudioContext: FakeCtx, speechSynthesis: synth });
  vi.stubGlobal("SpeechSynthesisUtterance", FakeUtterance);
  vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 500 })));
});
afterEach(() => { m?.stopVoice(); m = null; vi.useRealTimers(); vi.unstubAllGlobals(); });

const settle = () => new Promise((r) => setTimeout(r, 150));

describe("v16: a speech never starts over the Collector", () => {
  it("held while the floor is held: nothing is said, it is not 'speaking', nothing is 'being said'; it starts once the floor is free", async () => {
    const mouth = await load();
    let floor = true;
    const ev: string[] = [];
    mouth.setMouthHooks({ floorHeld: () => floor, onRequest: () => ev.push("want"), onStart: () => ev.push("start"), onEnd: () => ev.push("end") });
    expect(mouth.speakLines(["The drains near the bridge are blocked."], "en-IN")).toBe(true);
    await settle();
    expect(synth.said).toEqual([]);
    expect(ev).toEqual(["want"]);
    expect(mouth.speaking()).toBe(false);
    expect(mouth.nowSaying()).toBeNull();
    floor = false;
    await vi.waitFor(() => expect(synth.said).toEqual(["The drains near the bridge are blocked."]));
    expect(ev).toEqual(["want", "start"]);
    expect(mouth.speaking()).toBe(true);
    expect(mouth.nowSaying()).toBe("The drains near the bridge are blocked.");
  });

  it("with the floor free it starts at once, as before", async () => {
    const mouth = await load();
    mouth.setMouthHooks({ floorHeld: () => false });
    mouth.speakLines(["Opening the news."], "en-IN");
    await vi.waitFor(() => expect(synth.said).toEqual(["Opening the news."]));
  });

  it("a request handed on meanwhile stops it (stopVoice): the held answer is never said; a newer speech replaces it", async () => {
    const mouth = await load();
    let floor = true;
    mouth.setMouthHooks({ floorHeld: () => floor });
    mouth.speakLines(["The old answer about the drains."], "en-IN");
    await settle();
    mouth.stopVoice();
    floor = false;
    await settle();
    expect(synth.said).toEqual([]);
    floor = true;
    mouth.speakLines(["The first answer."], "en-IN");
    mouth.speakLines(["The second answer."], "en-IN");
    floor = false;
    await vi.waitFor(() => expect(synth.said).toEqual(["The second answer."]));
  });

  it("an acknowledgement is refused while the floor is held (it would no longer be true once it waited)", async () => {
    const mouth = await load();
    let floor = true;
    mouth.setMouthHooks({ floorHeld: () => floor });
    expect(mouth.speakAck("Looking at the drains.", "en-IN")).toBe(false);
    floor = false;
    expect(mouth.speakAck("Looking at the drains.", "en-IN")).toBe(true);
    await vi.waitFor(() => expect(synth.said).toEqual(["Looking at the drains."]));
  });

  it("a floor never given back does not silence Jarvis: past FLOOR_WAIT_MS it is said", async () => {
    vi.useFakeTimers();
    const mouth = await load();
    mouth.setMouthHooks({ floorHeld: () => true });
    mouth.speakLines(["The answer, said at last."], "en-IN");
    await vi.advanceTimersByTimeAsync(mouth.FLOOR_WAIT_MS - 500);
    expect(synth.said).toEqual([]);
    await vi.advanceTimersByTimeAsync(800);
    expect(synth.said).toEqual(["The answer, said at last."]);
  });

  it("no floor hook (another page): exactly as before", async () => {
    const mouth = await load();
    mouth.setMouthHooks({});
    mouth.speakLines(["Opening the brief."], "en-IN");
    await vi.waitFor(() => expect(synth.said).toEqual(["Opening the brief."]));
  });
});

describe("v16: a barge-in over the browser's voice", () => {
  const TWO = "The drains near the bridge are blocked and the main roads are under water in three wards. The department has the list on screen beside the map for you.";
  it("the voice it ducked ('kept') stops at the end of its piece while the floor is held, and goes on once it is free", async () => {
    const mouth = await load();
    let floor = false;
    mouth.setMouthHooks({ floorHeld: () => floor });
    mouth.speakLines([TWO], "en-IN");
    await vi.waitFor(() => expect(synth.said.length).toBe(1));
    // the Collector starts talking: the turn machine ducks the voice (kept on this path) and the floor is theirs
    floor = true;
    mouth.duckVoice();
    expect(mouth.lastDuck()?.how).toBe("kept");
    synth.finish();
    // (the piece's end, the voice's 40 ms and the 120 ms between pieces, then the wait)
    await settle(); await settle(); await settle();
    expect(synth.said.length).toBe(1);
    // nothing sounds while it waits
    expect(mouth.speaking()).toBe(false);
    // a backchannel: the voice comes back and the next piece is said
    mouth.unduckVoice();
    floor = false;
    await vi.waitFor(() => expect(synth.said.length).toBe(2));
  });

  it("not ducked: the pieces follow each other as before, whatever the floor says between them", async () => {
    const mouth = await load();
    let floor = false;
    mouth.setMouthHooks({ floorHeld: () => floor });
    mouth.speakLines([TWO], "en-IN");
    await vi.waitFor(() => expect(synth.said.length).toBe(1));
    floor = true;
    synth.finish();
    await vi.waitFor(() => expect(synth.said.length).toBe(2));
  });
});
