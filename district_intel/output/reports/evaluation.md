# Evaluation report
_As of 04 Oct 2026 10:57 IST · dintel-1.0.0_

## Within-source duplicates (B-cubed)
| Source | Precision | Recall | F1 | Items |
|---|---|---|---|---|
| grievance | 0.9914 | 1.0 | 0.9957 | 16093 |
| police | 0.9917 | 1.0 | 0.9958 | 12259 |

Officer duplicate decisions used: 562

## Cross-source linking (held-out half of the world events)
- Scorer: logistic_regression
- Pairwise: {"precision": 0.971, "recall": 0.748, "f1": 0.845, "true_pairs": 583}
- World events fully joined: 64/102
- Linked pairs 707, review band 226, multi-source incidents 172
- Coefficients: {"dist_norm": -3.346, "dt_norm": -5.694, "text_sim": 4.595, "same_cat": 1.535, "same_ward": 0.366, "coarse": -1.241, "has_news": -0.851}

## Geo resolution from text (20% of pinned grievances held out)
- {"n_test": 2813, "resolved_share": 0.934, "note": "Grievances always carry the citizen's ward; text only places them inside it. These figures are the harder case of text alone.", "street": {"share": 0.648, "ward_acc": 0.481, "zone_acc": 0.79, "median_error_m": 1001}, "locality": {"share": 0.232, "ward_acc": 0.4, "zone_acc": 0.752, "median_error_m": 1224}, "area": {"share": 0.054, "ward_acc": 0.651, "zone_acc": 0.947, "median_error_m": 724}, "all_resolved": {"ward_acc": 0.47, "zone_acc": 0.79, "median_error_m": 1030}}

## Category classifier (multilingual, held-out 20%)
- {"macro_f1_all": 0.995, "n_train": 16348, "n_test": 4087, "classes": 30, "grievance_macro_f1_en": 0.993, "grievance_n_en": 1783, "grievance_macro_f1_ta": 0.989, "grievance_n_ta": 803, "grievance_macro_f1_tanglish": 1.0, "grievance_n_tanglish": 470}

## One shared world
- Flood-day correlation before overlay: {"daily_spearman": {"grievance~police": 0.149, "grievance~pwd": 0.097, "police~pwd": 0.197}, "episode_3day_pearson": {"grievance~police": 0.637, "grievance~pwd": 0.572, "police~pwd": 0.848}}
- After overlay: {"daily_spearman": {"grievance~police": 0.235, "grievance~pwd": 0.226, "police~pwd": 0.261}, "episode_3day_pearson": {"grievance~police": 0.795, "grievance~pwd": 0.76, "police~pwd": 0.869}}
- Overlay: {"baseline_per_day": {"grievance": 5.0, "police": 0.0, "pwd": 2.0}, "uplift_per_rain_day": {"grievance": 11.11111111111111, "police": 9.952380952380953, "pwd": 20.823529411764707}, "world_rain_days": 17, "reflected": {"grievance": 18, "police": 21, "pwd": 17}, "planted_records": 736, "by_source": {"grievance": 332, "pwd": 217, "police": 174, "hospital": 13}, "world_events": 196}

## News classification (in Chennai, incident, report type, category)
- By meaning: Groq LLM labels (cached), the local SetFit model (multilingual-e5-base, trained on those labels)
  for articles the LLM has not reached; the old rules only when neither exists.
- Articles by method: {"review": 6729, "llm": 1957, "tfidf:unsure": 1087, "tfidf": 178}; Chennai incident articles: 1729
- SetFit agreement with the LLM on held-out labels: {"trained_at": "2026-10-03 21:08", "train": 1211, "held_out": 303, "category_agreement_with_llm": 0.756, "report_type_agreement_with_llm": 0.62, "is_incident_agreement_with_llm": 0.891, "in_chennai_agreement_with_llm": 0.749}
- Story merges from embeddings: {"same_language_merges": 144, "english_tamil_merges": 0, "stories_after": 7234}

## News funnel
- {"feed_rows": 22817, "unique_urls": 10324, "documents": 9951, "stories": 7234, "incident_articles": 1729, "incident_events": 585, "with_full_text": 794, "located_below_district": 2315}

## Briefings
- Unverified numbers across all briefings: 0
