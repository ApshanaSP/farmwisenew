"""Build the District IQ study guide PDF.

parts/*.html (sorted) are joined into guide.html with style.css, printed to PDF
with headless Microsoft Edge, then the contents page numbers are filled in from
the first print and the guide is printed again.

Run:  python docs/study-guide/build.py
Out:  docs/District_IQ_Study_Guide_Changes_26Nov_to_29Nov.pdf
"""
import html
import pathlib
import re
import subprocess
import sys

import fitz  # PyMuPDF

HERE = pathlib.Path(__file__).resolve().parent
PARTS = HERE / "parts"
OUT_HTML = HERE / "guide.html"
OUT_PDF = HERE.parent / "District_IQ_Study_Guide_Changes_26Nov_to_29Nov.pdf"
TMP_PDF = HERE / "_pass1.pdf"
EDGE = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"

CH_RE = re.compile(r'<h1 class="ch" id="(c\d+)"[^>]*>\s*<span class="n">([^<]*)</span>\s*<span class="t">(.*?)</span>', re.S)
PART_RE = re.compile(r'<div class="part" data-part="([^"]+)"')


def load_parts():
    files = sorted(PARTS.glob("*.html"))
    if not files:
        sys.exit("no parts")
    return [(f.name, f.read_text(encoding="utf-8")) for f in files]


def toc_html(parts, pages):
    rows = []
    for _, body in parts:
        # walk part labels and chapters in document order
        for m in re.finditer(r'<div class="part" data-part="([^"]+)"|' + CH_RE.pattern, body, re.S):
            if m.group(1):
                rows.append(f'<div class="tp">{m.group(1)}</div>')
            else:
                cid, n, t = m.group(2), m.group(3), m.group(4)
                t_plain = re.sub(r"<[^>]+>", "", t)
                pg = pages.get(cid, "")
                num = n.replace("Chapter", "").strip() if "Chapter" in n else "·"
                rows.append(
                    f'<div class="te"><span class="tn">{html.escape(num)}</span>'
                    f'<span class="tt">{t_plain}</span><span class="tg">{pg}</span></div>'
                )
    return '<section class="toc"><h1>Contents</h1>' + "".join(rows) + "</section>"


def assemble(parts, pages):
    css = (HERE / "style.css").read_text(encoding="utf-8")
    chunks = []
    for name, body in parts:
        # add a white marker after each chapter heading so the page can be found
        body = CH_RE.sub(lambda m: m.group(0) + f'<span class="mk">@@{m.group(1)}@@</span>', body)
        chunks.append(body)
        if name.startswith("00"):
            chunks.append(toc_html(parts, pages))
    doc = (
        "<!doctype html><html lang='en'><head><meta charset='utf-8'>"
        "<title>District IQ - What changed since 26 Nov</title>"
        f"<style>{css}</style></head><body>" + "\n".join(chunks) + "</body></html>"
    )
    OUT_HTML.write_text(doc, encoding="utf-8")


def print_pdf(target):
    url = OUT_HTML.as_uri()
    cmd = [EDGE, "--headless", "--disable-gpu", "--no-pdf-header-footer",
           "--run-all-compositor-stages-before-draw", "--virtual-time-budget=4000",
           f"--print-to-pdf={target}", url]
    subprocess.run(cmd, check=True, capture_output=True, timeout=240)


def find_pages(pdf):
    pages = {}
    with fitz.open(pdf) as d:
        for i, p in enumerate(d):
            for m in re.finditer(r"@@(c\d+)@@", p.get_text()):
                pages.setdefault(m.group(1), i + 1)
        return pages, d.page_count


def main():
    parts = load_parts()
    assemble(parts, {})
    print_pdf(TMP_PDF)
    pages, n = find_pages(TMP_PDF)
    assemble(parts, pages)
    print_pdf(OUT_PDF)
    pages2, n2 = find_pages(OUT_PDF)
    if pages2 != pages:  # contents length changed the flow: one more pass
        assemble(parts, pages2)
        print_pdf(OUT_PDF)
        pages2, n2 = find_pages(OUT_PDF)
    TMP_PDF.unlink(missing_ok=True)
    print(f"pages={n2}  chapters={len(pages2)}  -> {OUT_PDF}")
    for k in sorted(pages2, key=lambda x: int(x[1:])):
        print(k, pages2[k])


if __name__ == "__main__":
    main()
