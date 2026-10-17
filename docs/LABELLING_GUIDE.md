# Team tasks: real-data labels and Collector decisions

Two jobs only people can do. They turn "tested on simulated data" into "measured on real Chennai news",
and make the priority ranking learn from a Collector. About two hours in total, split across the team.

## 1. Mark 141 news-vs-record pairs (about 1 hour)

File: `district_intel/reference/labels/link_pair_labels.csv` (already prepared, 0 of 141 marked).

Each row is one real news report and one department record that the linker thinks *might* be the same incident.
Some are linked today, some are in the review band, some were rejected: that mix is on purpose.

1. Open the file in Excel (it is UTF-8 with a BOM, so Tamil shows correctly). Do not re-sort or delete rows.
2. For each row, read `news_title` / `news_text` and `record_title` / `record_text`. Look at `distance_m` and `hours_apart`.
3. In `same_incident` write:
   - **1**: the same real-world event (same kind of incident, same place, same time window)
   - **0**: different events, even if they look alike ("a bike accident in Adyar" on two different days is 0)
   - leave it **blank** if you cannot tell. Blank rows are skipped, so a blank is better than a guess.
4. In `labeled_by`, write your initials. Use `note` for anything odd.
5. Save as CSV (keep the name). Split the rows between people if you like: 1–70 and 71–141.

What counts: same category **and** a place within a few streets **and** within about a day. A news report about a
city-wide problem ("dengue cases rise in Chennai") is not the same as one complaint about a drain.

After marking, run from `district_intel/`:

```bash
python run_pipeline.py build
```

`output/reports/evaluation.md` then shows **"Cross-source linking on real pairs"** with precision, recall and F1
on your labels. That is the number to quote: it is measured on real news, not on the simulation's answer key.

## 2. Make 30–50 real Collector decisions (about 1 hour)

The priority weights learn from the Collector's decisions once 30 count (`config.yaml` → `priority_learning`).
Today none count, so the hand-set weights are used.

1. Sign in to the Collector console on the PC that saves to AWS (`AWS_STORE_SAVE=1`), so the decisions are kept.
2. Go through the **Needs your attention** list and the incident details, and decide as a Collector would:
   - **Escalate** or **Send back**: this needed the Collector (it should have ranked higher)
   - **Verify**: the department had it in hand (it could have ranked lower)
3. Decide on what you see, not to push a result. Mix them: about half one way, half the other, across categories.

After the next hourly build, `evaluation.md` → **"Priority learning"** shows how many decisions count and whether the
learned weights rank the decisions better than the hand-set ones (held-out AUC). They are used only if they do.

## 3. Optional: more news labels

`python run_pipeline.py news-labels` writes new samples for the event place and same-story checks
(`reference/labels/*.new.csv`). Mark them like the files beside them, then run `python run_pipeline.py news-eval`.
