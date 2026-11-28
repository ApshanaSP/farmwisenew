"""
Official lists that are published only as PDFs, for Ask the Map's official-places check (scripts/build-official-places.mjs reads the
files this writes). Run from the portal folder, once when a list changes:

    python scripts/fetch-official-pdfs.py            # both lists
    python scripts/fetch-official-pdfs.py schools    # one

  data/layers/official/schools.list.json       Government and Corporation high and higher secondary schools, with their UDISE codes, from
                                                the Tamil Nadu Textbook and Educational Services Corporation's school list (Samagra Shiksha
                                                manpower tender, Feb 2023). Only these schools: no primary or middle school, no aided or
                                                private school is on it. Chennai district and the three districts around it.
  data/layers/official/universities.list.json  The universities in and around Chennai on the UGC's consolidated lists (state universities,
                                                16 Nov 2022; institutions deemed to be universities, 17 Jun 2020).

Names are read as printed; nothing is added. A PDF whose layout changed is reported, never guessed at. TLS goes through the Windows store
(truststore), as on a PC whose antivirus inspects TLS. Needs pypdf.
"""
import datetime
import io
import json
import os
import re
import sys
import urllib.request

try:
    import truststore
    truststore.inject_into_ssl()
except ImportError:  # a plain machine: the default store is fine
    pass
from pypdf import PdfReader

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
OFF = os.path.join(ROOT, "data", "layers", "official")
UA = "DistrictIQ-official-places/1.0 (district administration prototype; one request per list)"
TODAY = (datetime.datetime.utcnow() + datetime.timedelta(hours=5, minutes=30)).strftime("%Y-%m-%d")
AROUND = ("CHENGALPATTU", "KANCHEEPURAM", "TIRUVALLUR")

TBC_URL = "https://textbookcorp.tn.gov.in/assets/pdf/School%20List%20and%20Manpower%20Deployment.pdf"
UGC_STATE_URL = "https://www.ugc.gov.in/oldpdf/State%20University/Consolidated%20State%20%20University%20List.pdf"
UGC_DEEMED_URL = "https://www.ugc.gov.in/oldpdf/Deemed%20University/Institute%20Deemed%20to%20be%20Univ%20List.pdf"


def get_pdf(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/pdf"})
    with urllib.request.urlopen(req, timeout=120) as r:
        data = r.read()
    if not data.startswith(b"%PDF"):
        raise RuntimeError(f"{url} did not answer with a PDF")
    return PdfReader(io.BytesIO(data))


def write(name, value):
    os.makedirs(OFF, exist_ok=True)
    with open(os.path.join(OFF, name), "w", encoding="utf-8") as f:
        json.dump(value, f, ensure_ascii=False, indent=1)


# ------------------------------------------------------------------ schools --

# the education districts a row names after its block ("Kodambakkam Chennai South GOVERNMENT HIGHER SECONDARY SCHOOL, WEST MAMBALAM HSS ...")
EDU = r"(Chennai (?:North|South|East|West|Central)|Ambattur|Avadi|Ponneri|Thiruvallur|Tiruvallur|Tiruttani|Chengalpattu|Madurantagam|Tambaram|Kancheepuram|Sriperumbudur)"
ROW = re.compile(r"^(\d+)\s+(33\d{9})\s+\d+\s*\([A-Za-z]+\)\s+(CHENNAI \(EXT\. GCC\)|[A-Z][A-Z ]+?)\s+(.*)$")
MGMTS = r"(?P<mgmt>Sch Edu Dept|Corporation School|Adi-Dravida Wel Sch|Municipal School|Diff\. Abled Welfare Dept|Tribal Welfare|Forest Dept|Kallar Reclamation|Social Welfare|Others)"
# words a name with no school word gets for matching only ("SAIDAPET" is printed alone: a government higher secondary school in Saidapet)
MGMT_WORD = {"Sch Edu Dept": "government", "Corporation School": "corporation", "Municipal School": "municipal", "Adi-Dravida Wel Sch": "adi dravidar welfare government",
             "Diff. Abled Welfare Dept": "government special"}


def schools():
    pdf = get_pdf(TBC_URL)
    entries, unread = [], 0
    for page in pdf.pages:
        for line in (page.extract_text() or "").splitlines():
            m = ROW.match(line.strip())
            if not m:
                continue
            district = "CHENNAI" if m.group(3).startswith("CHENNAI") else m.group(3).strip()
            if district != "CHENNAI" and district not in AROUND:
                continue
            rest = re.sub(r"(\s+[\d,]+)+\s*$", "", m.group(4)).strip()
            # the name runs to the last "HS" / "HSS" before the management ("GOVT HSS NANDANAM HSS Sch Edu Dept": the name is "GOVT HSS NANDANAM")
            t = re.match(rf"^(?P<block>.+?)\s+(?P<edu>{EDU})\s+(?P<name>.+)\s+(?P<lvl>HSS|HS)\s+{MGMTS}\s*$", rest) \
                or re.match(rf"^(?P<block>.+?)\s+(?P<edu>{EDU})\s+(?P<name>.+)\s+(?P<lvl>HSS|HS)(?P<mgmt>)\s*$", rest)
            if not t:
                unread += 1
                continue
            name = re.sub(r"\s+", " ", t.group("name")).strip(" ,.-")
            level = "higher secondary" if t.group("lvl") == "HSS" else "high"
            e = {"id": f"udise:{m.group(2)}", "name": name, "udise": m.group(2), "district": "Chennai" if district == "CHENNAI" else district.title(),
                 "block": t.group("block"), "level": level, "management": t.group("mgmt") or None}
            if not re.search(r"school|\bh\.?s\.?s?\b|ghss?|gghss?|gbhss?|chss?|mhss?|hr\.?\s*sec", name, re.I):
                e["alt"] = [f"{MGMT_WORD.get(t.group('mgmt') or '', 'government')} {level} school {name}"]
            entries.append(e)
    if len([e for e in entries if e["district"] == "Chennai"]) < 50:
        raise RuntimeError(f"only {len(entries)} rows read from the school list: its layout changed")
    write("schools.list.json", {
        "source": {"id": "tn-tbc-udise", "name": "Tamil Nadu Textbook and Educational Services Corporation: School List and Manpower Deployment (government and Corporation high and higher secondary schools, with UDISE codes)",
                   "url": TBC_URL, "checked": TODAY, "published": "2023-02-07 (the PDF's own date)",
                   "note": "Only government, Corporation, municipal and Adi Dravidar welfare high and higher secondary schools are on this list. UDISE+ (udiseplus.gov.in), the full school directory, asks for a CAPTCHA on every search (Know Your School), so it was not read by program; other schools are kept on their names."},
        "entries": entries})
    print(f"schools: {len(entries)} entries ({sum(1 for e in entries if e['district'] == 'Chennai')} in Chennai district); {unread} rows not read")


# ------------------------------------------------------------- universities --

CHENNAI_AREA = re.compile(r"chennai|kancheepuram|kanchipuram|chengalpattu|tiruvallur|thiruvallur|kelambakkam|padur|vandalur|tambaram|avadi|kanathur|siruseri|kattankulathur", re.I)
NUM = re.compile(r"^\s*(\d{2,3})\.?\s+(?=[A-Z])", re.M)


def fix_words(s):
    """pypdf splits some words ("Res earch", "Educ ation", "Univ ersity"): joined back where the halves are not words on their own."""
    for a, b in [("Res earch", "Research"), ("Educ ation", "Education"), ("Univ ersity", "University"), ("Univers ity", "University"), ("High er", "Higher"),
                 ("Highe r", "Higher"), ("Educatio n", "Education"), ("L aw", "Law"), ("Universi ty", "University")]:
        s = s.replace(a, b)
    return re.sub(r"\s+", " ", s).strip()


def tn_entries(pdf, kind, start_pat, end_pat):
    text = "\n".join(p.extract_text() or "" for p in pdf.pages)
    i = re.search(start_pat, text)
    if not i:
        raise RuntimeError(f"no Tamil Nadu section in the UGC {kind} list: its layout changed")
    j = re.search(end_pat, text[i.end():])
    sec = text[i.end(): i.end() + (j.start() if j else 20000)]
    parts = NUM.split(sec)
    out = []
    for k in range(1, len(parts) - 1, 2):
        body = fix_words(parts[k + 1].replace("\n", " "))
        body = re.sub(r"\s*\d{2}\.\d{2}\.\d{4}\s*$|\s*\b(19|20)\d{2}\s*$", "", body).strip()
        if not CHENNAI_AREA.search(body):
            continue
        # the name runs to the first comma that starts the address ("Vel's Institute of Science, Technology & Advanced Studies (VISTAS), Pallavaram")
        segs = re.split(r",\s*", body)
        name = segs[0]
        for s in segs[1:]:
            if not re.match(r"(Technology|Science|Sciences|Research|Education|Arts|Engineering)\b", s):
                break
            name += ", " + s
        name = re.sub(r"\s*#\s*$", "", name.replace("�", "'")).strip()
        e = {"id": f"ugc:{kind}-{parts[k]}", "name": name, "kind": f"{kind} university", "address": body[len(name):].strip(" ,")[:160] or None, "district": None}
        # "Madras University" is the University of Madras; an acronym in brackets is another name for it
        alt = ["University of Madras"] if name == "Madras University" else []
        alt += [m.group(1) for m in [re.search(r"\(([A-Z]{3,8})\)", name)] if m]
        if alt:
            e["alt"] = alt
        out.append(e)
    return out


def universities():
    state = tn_entries(get_pdf(UGC_STATE_URL), "state", r"\n\s*TAMIL ?NADU\s*\n", r"\n\s*TELANGANA\s*\n")
    deemed = tn_entries(get_pdf(UGC_DEEMED_URL), "deemed", r"\n\s*TAMIL ?NADU\s*\n|\bTamil Nadu\.\s*\n\s*\d{2}\.\d{2}\.\d{4}", r"\n\s*TELANGANA\s*\n")
    if len(state) < 5 or len(deemed) < 5:
        raise RuntimeError(f"too few universities read (state {len(state)}, deemed {len(deemed)}): a list's layout changed")
    write("universities.list.json", {
        "source": {"id": "ugc", "name": "University Grants Commission: consolidated lists of state universities (16 Nov 2022) and of institutions deemed to be universities (17 Jun 2020), Tamil Nadu entries in and around Chennai",
                   "url": UGC_STATE_URL, "urls": [UGC_STATE_URL, UGC_DEEMED_URL], "checked": TODAY,
                   "note": "Universities only. Central universities and institutes of national importance (IIT Madras, Indian Maritime University) are not on these two lists; they are kept on their names."},
        "entries": state + deemed})
    print(f"universities: {len(state)} state, {len(deemed)} deemed in and around Chennai")


if __name__ == "__main__":
    which = sys.argv[1:] or ["schools", "universities"]
    failed = False
    for w in which:
        try:
            {"schools": schools, "universities": universities}[w]()
        except Exception as e:  # one list failing leaves the others (and the earlier file) as they were
            failed = True
            print(f"{w}: the official list could not be read: {e}", file=sys.stderr)
    sys.exit(1 if failed else 0)
