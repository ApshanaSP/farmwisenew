import { execFileSync, spawnSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";

// P5-033 part sms-ocr-11: manu_paddle_ocr/server.py checked its 40 MP pixel cap only after cv2.imdecode had decoded the whole picture
// (a 3 MB PNG of 30000 x 30000 of one colour decodes to about 2.7 GB), and the single-threaded server had only a per-read timeout,
// so a sender trickling a byte every 29 s held the only reader. The server is driven here with the system Python, without
// PaddleOCR and with OpenCV blocked: a request that reaches `import cv2` stops there with ModuleNotFoundError.
const FOLDER = path.join(process.cwd(), "..", "manu_paddle_ocr");
const python = ["python", "python3", "py"].find((p) => spawnSync(p, ["--version"], { encoding: "utf8" }).status === 0);

const SCRIPT = String.raw`
import io, json, struct, sys, zlib
sys.path.insert(0, sys.argv[1])
sys.modules["cv2"] = None  # whether or not OpenCV is installed here: reaching the decoder is seen as ModuleNotFoundError
import server

def png(w, h):
    ihdr = struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)
    return b"\x89PNG\r\n\x1a\n" + struct.pack(">I", 13) + b"IHDR" + ihdr + struct.pack(">I", zlib.crc32(b"IHDR" + ihdr)) + b"\x00" * 64

def jpeg(w, h):
    app0 = b"\xff\xe0" + struct.pack(">H", 16) + b"JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00"
    sof = b"\xff\xc0" + struct.pack(">HBHHB", 17, 8, h, w, 3) + b"\x01\x22\x00\x02\x11\x01\x03\x11\x01"
    return b"\xff\xd8" + app0 + sof + b"\xff\xda" + b"\x00" * 32

class Headers(dict):
    def get(self, k, d=None):
        return dict.get(self, k, d)

def post(body):
    r = server.Reader.__new__(server.Reader)
    r.path = "/read"
    r.headers = Headers({"Content-Length": str(len(body))})
    r.rfile = io.BufferedReader(io.BytesIO(body))
    seen = []
    r.answer = lambda status, payload: seen.append([status, payload.get("error")])
    try:
        r.do_POST()
    except ModuleNotFoundError as e:
        seen.append(["decoded", str(e.name)])
    return seen[0]

class Trickle:
    def __init__(self):
        self.t = 0.0
    def read1(self, n):
        self.t += 29.0  # a byte every 29 s
        return b"x"
    def clock(self):
        return self.t

t = Trickle()
print(json.dumps({
    "png_size": server.header_size(png(30000, 30000)),
    "jpeg_size": server.header_size(jpeg(4000, 3000)),
    "junk_size": server.header_size(b"\xff\xd8\xff\x00not a jpeg"),
    "big_png": post(png(30000, 30000)),
    "big_jpeg": post(jpeg(9000, 9000)),
    "small_png": post(png(1200, 1600)),
    "trickle": server.read_body(t, 1000, deadline_s=60, clock=t.clock),
    "trickle_after_s": t.t,
}))
`;

describe.skipIf(!python)("sms-ocr-11: the PaddleOCR server refuses a picture by its header before decoding it", () => {
  const out = JSON.parse(execFileSync(python!, ["-c", SCRIPT, FOLDER], { encoding: "utf8", timeout: 30_000 })) as Record<string, unknown>;

  it("reads the size from a PNG's or a JPEG's header, and not from junk", () => {
    expect(out.png_size).toEqual([30000, 30000]);
    expect(out.jpeg_size).toEqual([4000, 3000]);
    expect(out.junk_size).toBeNull();
  });

  it("a 900 MP PNG and an 81 MP JPEG are 413 before anything is decoded; a page-sized picture goes on to the decoder", () => {
    expect(out.big_png).toEqual([413, "too many pixels"]);
    expect(out.big_jpeg).toEqual([413, "too many pixels"]);
    expect(out.small_png).toEqual(["decoded", "cv2"]);
  });

  it("a sender trickling a byte every 29 s is cut off at the whole-body deadline", () => {
    expect(out.trickle).toBeNull();
    expect(Number(out.trickle_after_s)).toBeLessThanOrEqual(90);
  });
});
