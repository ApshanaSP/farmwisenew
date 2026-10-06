# Evaluation report
_As of 04 Oct 2026 11:31 IST · dintel-1.0.0_

## Within-source duplicates (B-cubed)
| Source | Precision | Recall | F1 | Items |
|---|---|---|---|---|
| grievance | 0.9896 | 1.0 | 0.9948 | 16285 |
| police | 0.9917 | 1.0 | 0.9958 | 12263 |

Officer duplicate decisions used: 564

## Cross-source linking (held-out half of the world events)
- Scorer: logistic_regression
- Pairwise: {"precision": 0.916, "recall": 0.715, "f1": 0.803, "true_pairs": 705}
- World events fully joined: 59/111
- Linked pairs 884, review band 276, multi-source incidents 214
- Coefficients: {"dist_norm": -2.672, "dt_norm": -4.4, "text_sim": 4.883, "same_cat": 2.122, "same_ward": 1.454, "coarse": -1.397, "has_news": 0.471}

## Geo resolution from text (20% of pinned grievances held out)
- {"n_test": 2861, "resolved_share": 0.917, "note": "Grievances always carry the citizen's ward; text only places them inside it. These figures are the harder case of text alone.", "street": {"share": 0.641, "ward_acc": 0.462, "zone_acc": 0.774, "median_error_m": 1018}, "locality": {"share": 0.224, "ward_acc": 0.371, "zone_acc": 0.718, "median_error_m": 1327}, "area": {"share": 0.051, "ward_acc": 0.612, "zone_acc": 0.966, "median_error_m": 870}, "all_resolved": {"ward_acc": 0.448, "zone_acc": 0.771, "median_error_m": 1076}}

## Category classifier (multilingual, held-out 20%)
- {"macro_f1_all": 0.977, "n_train": 16444, "n_test": 4112, "classes": 30, "grievance_macro_f1_en": 0.964, "grievance_n_en": 1843, "grievance_macro_f1_ta": 0.992, "grievance_n_ta": 764, "grievance_macro_f1_tanglish": 0.991, "grievance_n_tanglish": 481}

## One shared world
- Flood-day correlation before overlay: {"daily_spearman": {"grievance~police": 0.149, "grievance~pwd": 0.049, "police~pwd": 0.2}, "episode_3day_pearson": {"grievance~police": 0.513, "grievance~pwd": 0.48, "police~pwd": 0.848}}
- After overlay: {"daily_spearman": {"grievance~police": 0.239, "grievance~pwd": 0.176, "police~pwd": 0.288}, "episode_3day_pearson": {"grievance~police": 0.737, "grievance~pwd": 0.708, "police~pwd": 0.903}}
- Overlay: {"baseline_per_day": {"grievance": 5.0, "police": 0.0, "pwd": 2.0}, "uplift_per_rain_day": {"grievance": 11.555555555555555, "police": 9.952380952380953, "pwd": 20.823529411764707}, "world_rain_days": 17, "reflected": {"grievance": 18, "police": 21, "pwd": 17}, "planted_records": 857, "by_source": {"grievance": 413, "pwd": 237, "police": 194, "hospital": 13}, "world_events": 224}

## News incident filter (300 hand labels, stratified; population-weighted 5-fold cross-validation)
- Weak labels only: {"precision": 0.586, "recall": 0.553, "f1": 0.569, "threshold": 0.2}
- Weak + hand labels: {"precision": 0.69, "recall": 0.557, "f1": 0.616} at threshold 0.3
- Features: char n-grams + multilingual-e5 embeddings; story merges from embeddings: {"same_language_merges": 132, "english_tamil_merges": 0, "stories_after": 7245}

## News funnel
- {"feed_rows": 22804, "unique_urls": 10325, "documents": 9953, "stories": 7245, "incident_articles": 1452, "incident_events": 858, "with_full_text": 790, "located_below_district": 2318}

## Briefings
- Unverified numbers across all briefings: 0
