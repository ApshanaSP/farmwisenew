#!/usr/bin/env python3
"""Adds a known lead-in of near-silence to each SAPI clip, writes a noise burst, and records where speech starts in each
fixture (fixtures.json), measured from the samples, so barge-in is timed from the fixture's known speech start.
  python -I tests/e2e/fixtures/prepare.py
"""
import array, json, math, os, random, wave

here = os.path.dirname(os.path.abspath(__file__))
LEAD_MS = 600
rnd = random.Random(4)
meta = {}


def read(path):
    with wave.open(path) as w:
        assert w.getframerate() == 16000 and w.getnchannels() == 1 and w.getsampwidth() == 2
        x = array.array("h")
        x.frombytes(w.readframes(w.getnframes()))
    return list(x)


def write(path, x):
    with wave.open(path, "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(16000)
        w.writeframes(array.array("h", (max(-32768, min(32767, int(v))) for v in x)).tobytes())


def onset(x):
    # the first 10 ms window clearly above the lead-in's floor
    win = 160
    for i in range(0, len(x) - win, win):
        r = math.sqrt(sum(v * v for v in x[i:i + win]) / win)
        if r > 400:
            return i / 16
    return 0


for name in sorted(os.listdir(here)):
    if not name.endswith(".wav") or name.startswith("burst"):
        continue
    x = read(os.path.join(here, name))
    start = onset(x)
    # trim SAPI's own silence, then a known lead-in of quiet noise
    trimmed = x[int(start * 16):]
    lead = [rnd.uniform(-12, 12) for _ in range(int(LEAD_MS * 16))]
    tail = [rnd.uniform(-12, 12) for _ in range(int(300 * 16))]
    y = lead + trimmed + tail
    write(os.path.join(here, name), y)
    meta[name[:-4]] = {"speechMs": LEAD_MS, "durMs": round(len(y) / 16)}

burst = [rnd.uniform(-12, 12) for _ in range(int(LEAD_MS * 16))] + [rnd.uniform(-9000, 9000) for _ in range(int(150 * 16))] + [rnd.uniform(-12, 12) for _ in range(int(800 * 16))]
write(os.path.join(here, "burst.wav"), burst)
meta["burst"] = {"speechMs": LEAD_MS, "durMs": round(len(burst) / 16)}
with open(os.path.join(here, "fixtures.json"), "w", encoding="utf8") as f:
    json.dump(meta, f, indent=1)
print(meta)
