"""PaddleOCR for the Manu Desk: step one of reading a paper petition, before the AI OCR.

Runs on this computer only (127.0.0.1) and sends nothing anywhere. Petition photos hold names, phone numbers and sometimes Aadhaar
numbers, so a photo stays in memory for the length of one request, is never written to disk, and no text read from it is printed.

  GET  /health   {"ok": true}
  POST /read     body: one JPEG or PNG. Answer: {"lines": [{"text": "...", "score": 0.97}], "ms": 25100}

One page is read at a time, on the thread that loaded the models. Others wait their turn in the connection queue.
"""
import json
import os
import sys
import time
from http.server import BaseHTTPRequestHandler, HTTPServer

HOST = "127.0.0.1"
PORT = int(os.environ.get("MANU_PADDLE_PORT", "8867"))
MAX_BYTES = 6_000_000  # the site allows 4.5 MB a page
MAX_PIXELS = 40_000_000
READ_DEADLINE_S = 60  # the whole body, not each read: a sender trickling a byte at a time cannot hold the only reader

ocr = None

# JPEG start-of-frame markers (they carry the size); C4, C8 and CC are other segments
_SOF = {0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7, 0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF}


def header_size(body):
    """(width, height) from a PNG or JPEG header, without decoding the picture; None when the header cannot be read.

    The pixel cap must hold before cv2.imdecode: a 3 MB PNG of 30000 x 30000 of one colour decodes to about 2.7 GB (QA pass 5, sms-ocr-11).
    """
    if body[:8] == b"\x89PNG\r\n\x1a\n":
        if len(body) >= 24 and body[12:16] == b"IHDR":
            return int.from_bytes(body[16:20], "big"), int.from_bytes(body[20:24], "big")
        return None
    if body[:3] != b"\xff\xd8\xff":
        return None
    i = 2
    while i + 4 <= len(body):
        if body[i] != 0xFF:
            return None
        marker = body[i + 1]
        if marker == 0xFF:  # fill byte
            i += 1
            continue
        if marker == 0x01 or 0xD0 <= marker <= 0xD8:  # markers with no length
            i += 2
            continue
        if marker in (0xD9, 0xDA):  # the end, or the picture's data, before any frame header
            return None
        length = int.from_bytes(body[i + 2:i + 4], "big")
        if marker in _SOF:
            if i + 9 > len(body):
                return None
            return int.from_bytes(body[i + 7:i + 9], "big"), int.from_bytes(body[i + 5:i + 7], "big")
        if length < 2:
            return None
        i += 2 + length
    return None


def read_body(rfile, size, deadline_s=READ_DEADLINE_S, clock=time.time):
    """Exactly `size` bytes, or None when the sender stops or takes longer than `deadline_s` in all (sms-ocr-11)."""
    deadline = clock() + deadline_s
    parts, got = [], 0
    while got < size:
        if clock() > deadline:
            return None
        chunk = rfile.read1(min(65536, size - got))
        if not chunk:
            return None
        parts.append(chunk)
        got += len(chunk)
    return b"".join(parts)


class Reader(BaseHTTPRequestHandler):
    timeout = 30  # a stalled sender cannot hold up the queue for long

    def log_message(self, *_args):  # nothing about a request is written out
        pass

    def answer(self, status, body):
        data = json.dumps(body, ensure_ascii=False).encode("utf-8")
        try:
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
        except OSError:
            pass  # the site gave up waiting

    def do_GET(self):
        if self.path == "/health":
            self.answer(200, {"ok": True})
        else:
            self.answer(404, {"error": "not found"})

    def do_POST(self):
        # The site's server sends no Origin; a web page in a browser always does, and has no business here.
        if self.headers.get("Origin"):
            return self.answer(403, {"error": "not allowed"})
        if self.path != "/read":
            return self.answer(404, {"error": "not found"})
        try:
            size = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            size = 0
        if size <= 0 or size > MAX_BYTES:
            return self.answer(413, {"error": "too large or empty"})
        body = read_body(self.rfile, size)
        if body is None:
            return self.answer(408, {"error": "the picture did not arrive in time"})
        if not (body[:3] == b"\xff\xd8\xff" or body[:8] == b"\x89PNG\r\n\x1a\n"):
            return self.answer(415, {"error": "only JPEG or PNG"})
        # the pixel cap from the header, before anything is decoded (sms-ocr-11); the check after decoding stays as a second wall
        dims = header_size(body)
        if dims is None:
            return self.answer(415, {"error": "not a readable picture"})
        if dims[0] * dims[1] > MAX_PIXELS:
            return self.answer(413, {"error": "too many pixels"})
        import cv2
        import numpy as np

        image = cv2.imdecode(np.frombuffer(body, dtype=np.uint8), cv2.IMREAD_COLOR)
        if image is None:
            return self.answer(415, {"error": "not a readable picture"})
        if image.shape[0] * image.shape[1] > MAX_PIXELS:
            return self.answer(413, {"error": "too many pixels"})
        started = time.time()
        try:
            page = list(ocr.predict(image))[0]
        except Exception as e:  # the type only: a message could quote the page
            print(f"reading failed: {type(e).__name__}", file=sys.stderr, flush=True)
            return self.answer(500, {"error": "could not read this page"})
        lines = [{"text": t, "score": round(float(s), 4)} for t, s in zip(page["rec_texts"], page["rec_scores"])]
        self.answer(200, {"lines": lines, "ms": int((time.time() - started) * 1000)})


class Server(HTTPServer):
    # On Windows, reuse would let a second copy share the port and steal requests. It must fail instead.
    allow_reuse_address = False
    request_queue_size = 32


def main():
    global ocr
    try:
        server = Server((HOST, PORT), Reader)
    except OSError:
        print(f"Port {PORT} is already in use, so PaddleOCR is probably running already.", flush=True)
        return
    # The port is open from here, so a petition that arrives during loading waits rather than being turned away.
    print("Loading PaddleOCR (the first run also downloads its models)...", flush=True)
    os.environ.setdefault("PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK", "True")
    import truststore

    truststore.inject_into_ssl()  # model downloads check certificates against the Windows store
    from paddleocr import PaddleOCR

    # lang="ta" brings the Tamil reader. Naming a detection model on its own silently drops it, so do not add one here.
    ocr = PaddleOCR(lang="ta", use_doc_orientation_classify=False, use_doc_unwarping=False, use_textline_orientation=False)
    print(f"PaddleOCR is ready on http://{HOST}:{PORT}. Keep this window open.", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
