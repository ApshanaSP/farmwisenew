# Evaluation report
_As of 02 Oct 2026 12:32 IST · dintel-1.0.0_

## Within-source duplicates (B-cubed)
| Source | Precision | Recall | F1 | Items |
|---|---|---|---|---|
| grievance | 0.9921 | 1.0 | 0.996 | 16201 |
| police | 0.9914 | 1.0 | 0.9957 | 12268 |

Officer duplicate decisions used: 569

## Cross-source linking (held-out half of the world events)
- Scorer: logistic_regression
- Pairwise: {"precision": 0.968, "recall": 0.761, "f1": 0.852, "true_pairs": 723}
- World events fully joined: 74/110
- Linked pairs 1007, review band 302, multi-source incidents 261
- Coefficients: {"dist_norm": -4.081, "dt_norm": -5.797, "text_sim": 3.974, "same_cat": 2.687, "same_ward": 1.169, "coarse": -1.152, "has_news": 0.761}

## Geo resolution from text (20% of pinned grievances held out)
- {"n_test": 2849, "resolved_share": 0.925, "note": "Grievances always carry the citizen's ward; text only places them inside it. These figures are the harder case of text alone.", "street": {"share": 0.626, "ward_acc": 0.481, "zone_acc": 0.784, "median_error_m": 996}, "locality": {"share": 0.245, "ward_acc": 0.364, "zone_acc": 0.742, "median_error_m": 1262}, "area": {"share": 0.054, "ward_acc": 0.658, "zone_acc": 0.955, "median_error_m": 830}, "all_resolved": {"ward_acc": 0.46, "zone_acc": 0.783, "median_error_m": 1033}}

## Category classifier (multilingual, held-out 20%)
- {"macro_f1_all": 0.983, "n_train": 16376, "n_test": 4095, "classes": 30, "grievance_macro_f1_en": 0.979, "grievance_n_en": 1821, "grievance_macro_f1_ta": 0.992, "grievance_n_ta": 767, "grievance_macro_f1_tanglish": 0.995, "grievance_n_tanglish": 475}

## One shared world
- Flood-day correlation before overlay: {"daily_spearman": {"grievance~police": 0.209, "grievance~pwd": 0.117, "police~pwd": 0.178}, "episode_3day_pearson": {"grievance~police": 0.614, "grievance~pwd": 0.504, "police~pwd": 0.85}}
- After overlay: {"daily_spearman": {"grievance~police": 0.299, "grievance~pwd": 0.197, "police~pwd": 0.259}, "episode_3day_pearson": {"grievance~police": 0.79, "grievance~pwd": 0.742, "police~pwd": 0.876}}
- Overlay: {"baseline_per_day": {"grievance": 4.0, "police": 0.0, "pwd": 2.0}, "uplift_per_rain_day": {"grievance": 10.538461538461538, "police": 10.25, "pwd": 21.75}, "world_rain_days": 13, "reflected": {"grievance": 26, "police": 20, "pwd": 16}, "planted_records": 800, "by_source": {"grievance": 417, "pwd": 206, "police": 163, "hospital": 14}, "world_events": 217}

## News incident filter (300 hand labels, stratified; population-weighted 5-fold cross-validation)
- Weak labels only: {"precision": 0.583, "recall": 0.497, "f1": 0.537, "threshold": 0.225}
- Weak + hand labels: {"precision": 0.632, "recall": 0.594, "f1": 0.612} at threshold 0.2
- Features: char n-grams + multilingual-e5 embeddings; story merges from embeddings: {"same_language_merges": 135, "english_tamil_merges": 0, "stories_after": 7032}

## News funnel
- {"feed_rows": 21416, "unique_urls": 9930, "documents": 9620, "stories": 7032, "incident_articles": 1678, "incident_events": 886, "with_full_text": 667, "located_below_district": 2253}

## Briefings
- Unverified numbers across all briefings: 0
