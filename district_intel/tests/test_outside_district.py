"""Headlines that place the event outside Chennai district are not Chennai news (news.outside_headline)."""
import pandas as pd

from dintel.loaders.news import outside_headline

OUT = [
    "நெல்லையில் பட்டப்பகலில் இரட்டை கொலை! 4 பேருக்குக் கத்திக்குத்து!",
    "நெல்லையில் பட்டப்பகலில் அண்ணன்-தம்பி குத்திக்கொலை: சென்னை தொழிலாளி வெறிச்செயல்",
    "நெல்லையில் இரட்டைக் கொலை... சென்னையில் கொடூரம்! - மக்கள் உயிருக்கு பாதுகாப்பில்லையா?",
    "Minibus carrying Chennai tourists overturns near Munnar; several injured",
    "History-sheeter shot in leg after attacking cop with machete in Karasangal forest",
    "கேரளாவில் கனமழையால் நிலச்சரிவு.. சென்னை பெண் உள்பட 3 பேர் உயிரோடு புதைந்த சோகம்",
    "Madurai: two held for chain snatching",
]
STAY = [
    "சென்னை - திருச்சி தேசிய நெடுஞ்சாலையில் போக்குவரத்து நெரிசல்",           # a road between two cities
    "சென்னை விமான நிலையத்தில் ரூ. 4.70 கோடி மதிப்பிலான கஞ்சா பறிமுதல் - கேரள இளைஞர் கைது",  # held at Chennai airport
    "சென்னை, மதுரையில் என்ஐஏ அதிகாரிகள் அதிரடி சோதனை",                        # in Chennai and Madurai
    "சென்னையில் இன்று மழை இருக்கு.. சேலம் உள்பட 14 மாவட்டங்களில் மழை",          # Chennai first
    "ஆந்திராவில் இருந்து சென்னைக்கு கஞ்சா கடத்தல்: பிரபல ரவுடி கைது",            # from Andhra, into Chennai
    "Madras High Court defers charges in Nellai Express cash seizure case",      # a train
    "Rameswaram Fishermen Released From Lankan Jail Arrive in Chennai",
    "Youth murdered over obscene messages in Chennai's Mangadu; two held",
    "சென்னையில் டெங்கு பாதிப்பு 2 மடங்கு அதிகரிப்பு",
    "டெல்லியில் ராகுல் காந்தி கைது.. சென்னையில் காங்கிரஸ் கட்சி சார்பில் போராட்டம்",       # a protest in Chennai
    "திருச்சியில் காணாமல் போன இளைஞரை ‘முக அடையாள தொழில்நுட்பம்’ மூலம் சென்னையில் மீட்ட போலீஸார்",  # rescued in Chennai
]


def test_outside_headlines_leave_chennai():
    got = outside_headline(pd.Series(OUT + STAY)).tolist()
    assert got[:len(OUT)] == [True] * len(OUT)
    assert got[len(OUT):] == [False] * len(STAY)
