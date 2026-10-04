"""News LLM: the number check on narratives, the taxonomy it is given, and the police crosswalk split."""
from dintel import newsllm
from dintel.refdata import Reference
from dintel.util import load_settings


def _pack():
    return {"facts": {"deaths": 2, "citizen_complaints": 14, "deadline_hours": 24, "first_reported": "03 Oct 2026, 04:19 PM"}, "reports": []}


def _out(**kw):
    base = {"summary": "Two people died in a fire on 03 Oct.", "summary_ta": "தீ விபத்தில் 2 பேர் உயிரிழந்தனர்.",
            "attention": ["14 citizens have complained", "Past its 24-hour deadline"], "next_step": "Ask the fire service for a report."}
    return {**base, **kw}


def test_grounded_accepts_numbers_from_facts():
    assert newsllm._grounded(_out(), _pack())


def test_grounded_rejects_invented_numbers():
    assert not newsllm._grounded(_out(attention=["37 people were injured"]), _pack())
    assert not newsllm._grounded(_out(next_step="Deploy 50 officers."), _pack())
    assert not newsllm._grounded(_out(next_step="Send a repair team within 5 hours."), _pack())  # an invented time limit
    assert not newsllm._grounded(_out(attention=["Nine similar incidents nearby"]), _pack())     # a number in words
    assert newsllm._grounded(_out(attention=["Two people died"]), _pack())                       # in words, but in the facts


def test_grounded_needs_one_to_three_reasons():
    assert not newsllm._grounded(_out(attention=[]), _pack())
    assert not newsllm._grounded(_out(attention=["a", "b", "c", "d"]), _pack())


def test_taxonomy_has_the_new_categories():
    ref = Reference(load_settings())
    cats = newsllm.categories(ref)
    for code in ("SUICIDE_SELF_HARM", "FIRE_EXPLOSION", "CRIMES_AGAINST_WOMEN", "CRIME_VIOLENT", "OTHER"):
        assert code in cats
    assert "suicide" in cats["CRIME_VIOLENT"].lower()  # the hint tells the model suicide is not violent crime
    assert ref.cmap["police"]["CRIMES_AGAINST_WOMEN"] == "CRIMES_AGAINST_WOMEN"
    assert ref.cmap["police"]["MURDER"] == "CRIME_VIOLENT"
    schema = newsllm._classify_schema(list(ref.cat))
    assert set(schema["properties"]["items"]["items"]["properties"]["category"]["enum"]) == set(ref.cat)
