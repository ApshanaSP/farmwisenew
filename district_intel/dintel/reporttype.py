"""What kind of report a news headline is (LT-03). Only an incident becomes an incident with a severity; a forecast,
government work, a rescue, a roundup, an opinion or a promotion stays news.

The same rules as the website's src/lib/collector/reporttype.ts (which also applies them to builds made before this
file existed): keep the two in step. `report_kind` returns None when the headline is not decisive, and the LLM's or
the local model's label stands.
"""
from __future__ import annotations

import re

NON_INCIDENT_KINDS = ["alert", "government_action", "resolution", "roundup", "opinion", "other"]


def _rx(parts: list[str]) -> re.Pattern:
    return re.compile("|".join(parts), re.I)


HARM = _rx([
    r"\b(killed|kills?|dies|died|dead|death|deaths|drown\w*|electrocut\w*|injur\w*|hurt|stabb\w*|murder\w*|hacked|assault\w*|rape\w*|raped|sexual|pocso|molest\w*|suicide|attack\w*|bodies (found|recovered)|body found|charred|missing)\b",
    "பலி", "உயிரிழ", "கொலை", "தற்கொலை", "காயம்"])
EVENT = _rx([
    r"\b(accidents?|collision|collides?|crash\w*|rams?|rammed|overturn\w*|fire|blaze|gutted|explosion|blast|collaps\w*|caved|cave-in|uprooted|fell|fallen|waterlogg\w*|inundat\w*|flooded|submerged|stagnat\w*|overflow\w*|breach\w*|potholes?|sinkhole|outage|power cut|blackout|no water|bomb threat|hoax|theft|thefts|stolen|steal\w*|snatch\w*|robb\w*|burglar\w*|arrest\w*|seized|seizure|held for|nabbed|cheat\w*|fraud|scam|jailbreaks?|escaped|stranded|disrupt\w*|leak\w*|contaminat\w*|outbreak|cases rise|spike in|protest\w*|stir|agitation|road roko|blockade|clash\w*|derail\w*|plunge[sd]?|skid\w*|overcharg\w*|piles? up|piling up|nightmare|menace|stench|troubles? residents|residents (flag|complain|suffer|struggle|fume))\b",
    r"\bshock as\b", "விபத்து", "தீ விபத்து", "மின்தடை", "கைது", "திருட்டு", "மழைநீர் தேங்கி", "போராட்டம்"])
ROUNDUP = _rx([
    r"latest news today", r"news today live", r"live updates?", r"\btop (news|stories|headlines)\b",
    r"news highlights", r"news (wrap|roundup|round-up|bulletin|digest)", r"crime corner", r"\bin brief\b",
    r"morning (news|briefing)", r"evening (news|briefing)", r"#gallery", r"where was the highest rainfall",
    r"rainfall (recorded|figures|data) (across|in) ", r"storage (status|position|level)s? of", r"current water storage",
    r"(water|storage) levels? (in|of) (chennai'?s )?(major )?(lakes|reservoirs)", r"\bdeep dive\b", r"\bnews update\b.*\|.*\|",
    r"\b(water|storage) (inflow|level|levels|storage)\b.{0,60}\b(rises?|rose|decreas\w*|increas\w*|dips?|drops?|falls?)\b", r"\bwater inflow\b",
    "இன்றைய முக்கிய செய்திகள்", "செய்தி தொகுப்பு"])
OPINION = _rx([
    r"\bopinion\b", r"\beditorial\b", r"\bcolumn\b", r"\bexplainer\b", r"\bexplained\b", r"vox pop",
    r"public opinion", r"\bwhy (does|do|is|are)\b", r"\bwhat (it|this) means\b", r"new study", r"\bstudy (finds|shows|says)\b",
    r"\bmeme\b", r"\bviral\b", r"\bdebate\b", r"places to visit", r"things to do", r"\binterview\b",
    r"\bpodcast\b", r"\bfeature\b", r"\bhow to\b", r"\btips\b", r"left her|left him|rebuild (her|his) life"])
_SPEAKER = (r"(minister|mayor|mla|mp|cm|chief minister|leader|chief|party|dmk|aiadmk|bjp|pmk|tvk|vck|ntk|congress|cpi|cpm|dmdk|"
            r"mdmk|ramadoss|anbumani|stalin|seeman|velmurugan|annamalai|vijay|palaniswami|eps|ops|udhayanidhi|governor)")
STATEMENT = re.compile(
    rf"\b{_SPEAKER}\b.{{0,80}}\b(accuses?|accused|insists?|slams?|blames?|demands?|urges?|criticis\w*|criticiz\w*|asks|questions|hits out|lashes out|alleges?|warns|condemns?|says|said|claims?|vows?|promises?|responds?|ready to respond|reacts?)\b"
    r"|\b(accuses?|insists?|slams?|demands?|urges?|criticis\w*|alleges?|condemns?)\b.{0,40}[!:]?\s*$|asks barrage of questions", re.I)
RESOLVED = _rx([
    r"\b(rescued|rescues|traced|found safe|found alive|reunited|restored|resumed|reopen\w*|back to normal|escape[sd]? (safely|unhurt|unharmed)|safe(ly)? rescued|recovered|retrieved|returned safely|sentenced|convicted|acquitted|gets? \d+(\.\d+)?[- ]years?|jail term|life term|life imprisonment)\b",
    "மீட்பு", "மீட்கப்பட்ட", "சீரானது"])
ALERT = _rx([
    r"\b(red|orange|yellow|green) alert\b", r"\balert for\b", r"\brain alert\b", r"\bwarning\b", r"\bwarns\b",
    r"\bforecast\b", r"\bimd\b", r"meteorolog\w*", r"weather (update|centre|center|research|department|report|today)",
    r"\bhow will (the )?(rain|weather)\b", r"\brain (to|will|may|likely)\b", r"\b(heavy|very heavy|extremely heavy) rain(fall)? (likely|expected|predicted)\b",
    r"\bwill (it|the cyclone|cyclone|the storm|chennai)\b.*\b(rain|cyclone|storm|hit|affect|affected)\b", r"\bcyclone\b", r"\bdepression\b",
    r"\blow[- ]pressure\b", r"\bstorm (forming|approaching|to form)\b", r"\bsignal (no\.?|number) ?\d\b", r"\bcage hoisted\b",
    r"\bflash flood risk\b", r"\bmonsoon (update|onset|forecast)\b", r"\b(no|direct) impact on chennai\b", r"\bnowcast\b",
    "எச்சரிக்கை", "புயல்", "வானிலை", "மழை (பெய்யும்|வாய்ப்பு)", "கனமழை"])
GOV_ACTION = _rx([
    r"\bmore (boats|pumps|motors|staff|workers|buses|personnel)\b",
    r"\b(removed|removal|cleared|clearance|desilt\w*|deployed|deploys?|on standby|kept ready|ready to|boats? ready|readied|inspect\w*|launch\w*|inaugurat\w*|tender\w*|projects?|scheme|plans?|to build|to construct|construction of|sanction\w*|allocat\w*|funds?|crore|vaccinat\w*|drive|campaign|awareness|order(s|ed)?|directs?|directed|instructs?|instructed|starts? work|work (is )?underway|underway|special officers?|monitoring|preparedness|precaution\w*|measures?|relief camps?|set up|opens?|opened|holiday declared|declares holiday|advised|advises|advisory|appeal\w*|helpline|control room|to ease|to reduce|upgrade|portal|app launched)\b",
    "நடவடிக்கை", "ஆய்வு", "அகற்றம்", "அகற்றப்பட்ட", "தயார் நிலை", "திட்டம்", "முகாம்"])
PROMO = _rx([
    r"\b(robotic|knee (joint )?replacement|surgery at .* hospital|awareness event|world \w+ day|celebrat\w*|festival|concert|exhibition|expo|launch of .* (store|showroom|outlet)|offers?|discount|admission(s)? open|webinar|conclave|summit)\b"])
IMPACT = re.compile(r"\b(stranded|uprooted|collaps\w*|waterlogg\w*|inundat\w*|flooded|submerged|outage|power cut|blackout|potholes?|caved|damaged)\b", re.I)
PREVENTED = re.compile(r"\b(?:to\s+)?(?:prevent\w*|avoid\w*|face|tackle|fight|combat|curb|check|reduce|ease|stop|against|ahead of|in view of)\s+(?:\w+\s+){0,3}?\w+", re.I)
SERVICES = re.compile(r"\bfire\s*(?:personnel|service\w*|fighters?|and rescue|tenders?|station|brigade|department|safety)\b|\bfirefighters?\b|"
                      r"\bflood\s+(?:relief|response|control)\s+(?:teams?|centres?|room)\b", re.I)
_ARRESTED = re.compile(r"\b(arrest\w*|held|detained|booked|raid\w*)\b", re.I)


def report_kind(*texts: str | None) -> str | None:
    """The kind of report a headline is (the English translation of a Tamil one first), or None when not decisive."""
    t = " \n ".join(x for x in texts if isinstance(x, str) and x).replace("‘", "'").replace("’", "'")
    if not t.strip():
        return None
    said = SERVICES.sub(" ", PREVENTED.sub(" ", t))
    harm, event = bool(HARM.search(said)), bool(EVENT.search(said))
    hurt = bool(HARM.search(re.sub(r"\bmissing\b", " ", said, flags=re.I)))
    if ROUNDUP.search(t):
        return "roundup"
    if OPINION.search(t) and not (harm and not re.search(r"left her|left him|rebuild", t, re.I)):
        return "opinion"
    if STATEMENT.search(t) and not harm and not _ARRESTED.search(t):
        return "opinion"
    if RESOLVED.search(t) and not hurt and not event:
        return "resolution"
    if ALERT.search(t) and not harm and not IMPACT.search(said):
        return "alert"
    if harm:
        return "incident"
    if PROMO.search(t) and not event:
        return "other"
    if GOV_ACTION.search(t) and not event:
        return "government_action"
    if event:
        return "incident"
    return None
