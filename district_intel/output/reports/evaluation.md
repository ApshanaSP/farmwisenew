# Evaluation report
_As of 04 Oct 2026 16:23 IST · dintel-1.0.0_

## Within-source duplicates (B-cubed)
| Source | Precision | Recall | F1 | Items |
|---|---|---|---|---|
| grievance | 0.9914 | 1.0 | 0.9957 | 16113 |
| police | 0.9917 | 1.0 | 0.9958 | 12263 |

Officer duplicate decisions used: 562

## Cross-source linking (held-out half of the world events)
- Scorer: logistic_regression
- Pairwise: {"precision": 0.939, "recall": 0.795, "f1": 0.861, "true_pairs": 580}
- World events fully joined: 66/99
- Linked pairs 876, review band 308, multi-source incidents 207
- Coefficients: {"dist_norm": -3.939, "dt_norm": -5.5, "text_sim": 2.96, "sem_sim": 2.138, "ent_overlap": 0.927, "same_cat": 1.595, "same_ward": 0.371, "coarse": -0.639, "has_news": -0.177}

## Cross-source linking on real pairs (news vs departmental records, marked by a person)
- Real candidate pairs this build: {"total": 1330, "below": 1282, "review": 26, "linked": 22}
- No marked pairs yet: `python run_pipeline.py link-labels`, then fill `same_incident` in reference/labels/link_pair_labels.csv

## Unusual rises (spikes and slow rises)
- 3824 checks (3346 one-day, 478 slow-rise) under one false-discovery rate of 0.05: 5 spikes and 1 slow rises kept; the old rule (p < 0.01 each, no rain factor) would have raised 22
- Rain factors (reports on a rain day and the two after, against dry days): {"AIR_POLLUTION": 0.67, "BUILDING_SAFETY": 1.69, "CIVIC_FACILITIES": 1.09, "CRIME_PROPERTY": 0.91, "DARK_SPOT_SAFETY": 0.86, "DRAINAGE_SEWAGE": 2.47, "DRAIN_WORKS_SAFETY": 2.88, "DRUGS_LIQUOR": 0.6, "ENCROACHMENT": 0.85, "FIRE_EXPLOSION": 1.24, "FLOOD_RELIEF": 1.75, "FLOOD_WATERLOGGING": 5.22, "MISSING_PERSON": 0.9, "POLICE_OTHER": 1.43, "PUBLIC_ORDER": 0.87, "PUBLIC_WORKS": 0.8, "ROAD_ACCIDENT": 1.23, "ROAD_DAMAGE": 0.93, "SANITATION_TOILETS": 0.86, "SOLID_WASTE": 0.92, "STRAY_ANIMALS": 0.92, "STREETLIGHT_ELECTRICAL": 1.67, "TRAFFIC_OBSTRUCTION": 1.36, "TREES_PARKS": 1.55, "VECTOR_DISEASE": 1.19, "WATERBODY_INFRA": 2.32}

## Priority learning from the Collector's decisions
- Status: collecting; 0 of 0 decisions count (raise: ['escalate', 'reopen'] = 0, lower: ['verify'] = 0); needs 30
- Ranking of the decisions (AUC, held out): learned None, hand-set None
- Weights in use: {"multi_source": 5.0, "complaints": 3.0, "sla_over_2x": 20.0, "sla_over": 10.0, "unverified_serious": 8.0, "growing": 8.0, "vulnerable": 5.0, "multi_outlet": 5.0, "media_only": 5.0, "rain": 5.0, "recurring": 5.0}

## Geo resolution from text (20% of pinned grievances held out)
- {"n_test": 2817, "resolved_share": 0.934, "note": "Grievances always carry the citizen's ward; text only places them inside it. These figures are the harder case of text alone.", "street": {"share": 0.648, "ward_acc": 0.484, "zone_acc": 0.789, "median_error_m": 997}, "locality": {"share": 0.232, "ward_acc": 0.403, "zone_acc": 0.747, "median_error_m": 1223}, "area": {"share": 0.054, "ward_acc": 0.654, "zone_acc": 0.948, "median_error_m": 724}, "all_resolved": {"ward_acc": 0.474, "zone_acc": 0.788, "median_error_m": 1028}}

## Category classifier (multilingual, held-out 20%)
- {"macro_f1_all": 0.995, "n_train": 16362, "n_test": 4091, "classes": 30, "grievance_macro_f1_en": 0.993, "grievance_n_en": 1782, "grievance_macro_f1_ta": 0.989, "grievance_n_ta": 819, "grievance_macro_f1_tanglish": 1.0, "grievance_n_tanglish": 465}

## One shared world
- Flood-day correlation before overlay: {"daily_spearman": {"grievance~police": 0.148, "grievance~pwd": 0.103, "police~pwd": 0.2}, "episode_3day_pearson": {"grievance~police": 0.636, "grievance~pwd": 0.573, "police~pwd": 0.848}}
- After overlay: {"daily_spearman": {"grievance~police": 0.249, "grievance~pwd": 0.234, "police~pwd": 0.284}, "episode_3day_pearson": {"grievance~police": 0.796, "grievance~pwd": 0.757, "police~pwd": 0.868}}
- Overlay: {"baseline_per_day": {"grievance": 5.0, "police": 0.0, "pwd": 2.0}, "uplift_per_rain_day": {"grievance": 11.11111111111111, "police": 9.952380952380953, "pwd": 20.823529411764707}, "world_rain_days": 17, "reflected": {"grievance": 18, "police": 21, "pwd": 17}, "planted_records": 753, "by_source": {"grievance": 323, "pwd": 234, "police": 183, "hospital": 13}, "world_events": 194}

## News classification (in Chennai, incident, report type, category)
- By meaning: Groq LLM labels (cached), the local SetFit model (multilingual-e5-base, trained on those labels)
  for articles the LLM has not reached; the old rules only when neither exists.
- Articles by method: {"review": 6984, "llm": 1353, "tfidf:unsure": 1295, "tfidf": 321}; Chennai incident articles: 1712
- SetFit agreement with the LLM on held-out labels: {"trained_at": "2026-10-03 21:08", "train": 1211, "held_out": 303, "category_agreement_with_llm": 0.756, "report_type_agreement_with_llm": 0.62, "is_incident_agreement_with_llm": 0.891, "in_chennai_agreement_with_llm": 0.749}
- Story merges from embeddings: {"candidates": 23139, "reranked": 11026, "labelled_pairs": 286, "merge_pairs": 4622, "cross_language_merge_pairs": 1298, "llm_checked": 8549, "llm_same": 176, "stories_before": 7377, "stories_after": 6226}

## News funnel
- {"feed_rows": 22804, "unique_urls": 10325, "documents": 9953, "stories": 6226, "incident_articles": 1712, "incident_events": 585, "with_full_text": 790, "full_text_from_publisher_page": 0, "located_below_district": 1859}

## Briefings
- Unverified numbers across all briefings: 0
