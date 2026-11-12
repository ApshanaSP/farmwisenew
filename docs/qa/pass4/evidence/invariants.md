# QA pass 4: data invariants

These checks read the pinned snapshot directly (build `2026-11-06 18:21:19|76734f481810`, as-of 2026-11-06 18:08:00) into an in-memory database, with no app code and none of the app's build steps. So they say what is in the stored data. Each check is a SQL query that returns one row per problem. Examples in `invariants.json` are ids only, so no personal data is copied out.

Rerun: `node tests/qa/pass4/invariants.mjs`. Guard test (no server, about a minute): `npx vitest run --config vitest.qa4.config.ts tests/qa/pass4/invariants.test.ts`. The app's side, on the real code (about 3 minutes): `npx vitest run --config vitest.qa4.config.ts tests/qa/pass4/invariants-app.test.ts`.

No model was called. Nothing here needs one. Nothing under `src/` was changed.

## Result

637 checks: **576 pass**, **54 are pipeline issues**, **7 are app issues**.

"Pipeline issue" means the data from `district_intel` is wrong. That code is not in this repo, so it is reported and not patched. "App issue" means this repo's code shows the problem wrongly. Each app issue was proved by running the real code on the same snapshot (`tests/qa/pass4/invariants-app.test.ts`).

| Group | Checks | Pass | Pipeline | App |
|---|---|---|---|---|
| time order | 28 | 25 | 3 | 0 |
| status and flags | 44 | 33 | 9 | 2 |
| wards inside zones | 21 | 17 | 2 | 2 |
| departments and categories | 40 | 40 | 0 | 0 |
| duplicates | 79 | 72 | 7 | 0 |
| impossible dates | 165 | 158 | 7 | 0 |
| totals across tables | 50 | 40 | 10 | 0 |
| orphan rows | 29 | 21 | 8 | 0 |
| zones 1 to 15 | 15 | 15 | 0 | 0 |
| latitude and longitude | 12 | 12 | 0 | 0 |
| severity | 5 | 5 | 0 | 0 |
| empty text | 17 | 17 | 0 | 0 |
| control characters and broken text | 55 | 52 | 3 | 0 |
| personal data in shown text | 55 | 51 | 1 | 3 |
| Tamil fields | 22 | 18 | 4 | 0 |

The guard test also plants a bad row for 43 of the checks (in the in-memory copy, then rolled back) and requires the check to count it. So these checks can fail.

## The three known items, with today's numbers

**OPEN-7: confirmed, the number is now 914** (the claim was 933, on an older build). Open incidents past their due time with `sla_breached = 0`. Of these 912 have a "response" deadline and 2 have a "resolution" deadline at exactly the limit. The oldest was due on 2026-05-13 19:16:58. The same rule also leaves 6,463 closed incidents closed after their due time and not marked late. The cause is one rule: `sla_breached` is `sla_ratio > 1`, and for a "response" deadline the ratio uses the time to the first action (`district_intel/dintel/incidents.py` lines 125 to 129). The check `sla_flag_is_the_pipeline_rule` passes, so there are no stray rows. For scale: 959 open incidents are marked past deadline. The app's part is INV-3 and INV-4.

**OPEN-8: confirmed, and the cause is now known.** All the kpis columns match the incidents exactly on all 128 rows except two sets. (1) `complaints_filed` and `complaints_open` count complaints by their own filing time, and they match `events` on every row. The console sums complaints over incidents first reported in the window. So the two differ: daily 166 against 147 filed, 165 against 147 open; weekly 800 against 787 filed, 680 against 692 open; monthly 3,270 against 3,255 filed, 1,064 against 1,174 open; quarterly 9,120 against 9,113 filed, 1,118 against 1,238 open. Neither sum is broken. They are two definitions. (2) `kpis.resolved` also counts Rejected incidents (daily 179 against 175 truly Resolved). The claim of "132 against 123" was an older build. The app does not read this table, and `catalog.ts` keeps it from Ask District IQ, so nothing on screen shows these figures.

**OPEN-11: confirmed, all three parts updated.**
- Future times: **5 IMD incidents**, not 4, have a first report of 2026-11-06 19:11:33, after the build at 2026-11-06 18:21:19, so `hours_open` is -1.1. 4 of them also have an "occurred" date of 7 to 10 November: forecasts stored as happenings. The pipeline's own `data_quality` table names 5 and says "quarantine", but they are still in `incidents`. The lists hide them, because they stop at the store's time; the incident's own answer says "-1 hours" (INV-5).
- Lapsed with no close time: **763** in the stored data (the claim was 756). The app's build steps remove some news-only incidents, which leaves 611 on screen, where the case page shows the status "Lapsed" in place of a close time. The pipeline sets a close time only for Resolved and Rejected (`incidents.py` line 88).
- `daily_counts`: **228 fewer grievance rows** than events (16,721 against 16,949), as claimed: these are the rows flagged junk (`analytics.py` line 29). New: IMD (139) and CPCB (17) are left out of `daily_counts` as well. Once those three are set aside, every day, zone, category and source agrees.

## What the app shows wrongly

These six were each proved on the real code. The rest of the failures are the pipeline's, and they are reported, not patched.

- **INV-3 (P0).** "Closed on time" and "Within deadline" read a flag that means something else for police incidents. Over 90 days Ask District IQ says 48% were within the deadline; 22% were closed by their due time. The police officer's tile says 77%; 8% were.
- **INV-4 (P1, OPEN-7).** 914 open incidents say "missed" on the case page, and the Past deadline tile and list do not count them.
- **INV-1 (P2).** A news result in the search box can open an incident the app's own build took out.
- **INV-2 (P2).** The search box shows a private person's home address and mobile number as a news headline. Jarvis's path hides the same text.
- **INV-6 (P2).** The profile form accepts a ward from another zone, because zone 14's range wraps around zone 13.
- **INV-5 (P3, OPEN-11).** A forecast stored as an incident is described as open for "-1 hours".

## What is good

Every incident, report, document, action and complaint has a known department and category. (The complaints table has no category column: its category comes through its report, and that is checked too.) No ward is in the wrong zone in any record. No zone is outside 1 to 15. No severity is outside the four allowed. No position is outside Chennai, except two real reservoirs outside the city, which are expected. No orphan members, actions, timeline or history rows. No empty titles. No control characters anywhere that is shown. No invalid date strings and none before 2000. No date earlier than its source could know, apart from the forecasts in OPEN-11: no article fetched before it was published, no news report dated before its article, no complaint's report before its filing, no police report before its incident. No personal data in incident titles, summaries, complaint titles, complaint text, report text or briefings. No Aadhaar-shaped number in any shown field. Incident counts, member counts, ward and hotspot totals and the briefing figures all add up.

## What fails

| Check | Count | Verdict | Finding | What it means |
|---|---|---|---|---|
| `incident_closed_after_last_update` | 114 | pipeline issue | INV-16 | Closed later than its own last update, so the last update is not the last thing that happened. |
| `timeline_step_after_last_update` | 1,161 | pipeline issue | INV-16 | A timeline step later than the incident's last update. |
| `event_occurred_after_reported` | 4 | pipeline issue | INV-9 (OPEN-11) | Something reported before it happened: a forecast stored as a happening. |
| `incident_lapsed_without_closed_at` | 763 | pipeline issue | INV-10 (OPEN-11) | Lapsed (closed by age) with no close time. |
| `incident_resolved_with_open_report` | 24 | pipeline issue | INV-16 | Resolved or Rejected while one of its reports is still open. |
| `incident_open_past_due_not_breached` | 914 | pipeline issue | INV-7 (OPEN-7) | Open, past its due time, and not marked past deadline. |
| `incident_closed_after_due_not_breached` | 6,463 | pipeline issue | INV-7 (OPEN-7) | Closed after its due time and not marked past deadline. |
| `case_page_says_missed_but_tile_does_not_count` | 914 | app issue | INV-4 (OPEN-7) | The case page says the deadline is missed; the Past deadline tile, list and briefing do not count the same incident. |
| `resolved_said_within_deadline_but_closed_late` | 6,457 | app issue | INV-3 | Counted as closed within the deadline by the app's on-time figures, though closed after the due time. |
| `incident_hours_open_negative` | 5 | pipeline issue | INV-9 (OPEN-11) | Open for less than no time: reported after the build. |
| `event_in_progress_with_closed_at` | 2 | pipeline issue | INV-16 | A report still In progress with a close time. |
| `event_outside_district_but_in_a_zone` | 3 | pipeline issue | INV-16 | Marked outside the district but given a zone. |
| `action_finished_but_status_in_progress` | 13 | pipeline issue | INV-16 | An action with finish and check times but still In progress. |
| `action_open_on_closed_incident` | 10 | pipeline issue | INV-16 | A step still In progress or not started on a closed incident. |
| `zone_range_contains_other_zones_ward` | 13 | app issue | INV-6 | A zone's ward_start to ward_end holds wards of another zone. The profile form and its server check use this range as if it were exact. |
| `user_profile_ward_in_other_zone` | 1 | app issue | INV-6 | A saved profile whose ward belongs to another zone. |
| `incident_pin_outside_own_ward` | 456 | pipeline issue | INV-19 | An incident's pin is outside its own ward's shape. |
| `incident_pin_over_5km_from_ward_centre` | 1 | pipeline issue | INV-19 | An incident's pin is more than 5 km from its ward's centre. |
| `duplicate_news_article_url` | 440 | pipeline issue | INV-14 | The same news article URL stored as more than one document. |
| `duplicate_news_title_publisher_day` | 1,349 | pipeline issue | INV-14 | The same headline from the same publisher on one day, more than once. |
| `duplicate_news_url_in_one_incident` | 49 | pipeline issue | INV-14 | One incident lists the same article URL twice. |
| `outlet_count_is_not_publishers` | 124 | pipeline issue | INV-14 | outlet_count counts articles: it differs from the distinct publishers of the incident's articles. |
| `duplicate_event_same_text_time_place` | 77 | pipeline issue | INV-14 | Two reports with the same title, text, time and place. |
| `duplicate_action_same_incident_text_dept` | 135 | pipeline issue | INV-15 | The same step for one department twice in one incident. |
| `duplicate_incident_same_title_time_place` | 1 | pipeline issue | INV-14 | Two incidents with the same title, time and place. |
| `date_future:events` | 17 | pipeline issue | INV-9 (OPEN-11) | A date in events after the moment the data was made (2026-11-06 18:21:19). |
| `date_future:incident_members` | 5 | pipeline issue | INV-9 (OPEN-11) | A date in incident_members after the moment the data was made (2026-11-06 18:21:19). |
| `date_future:incidents` | 15 | pipeline issue | INV-9 (OPEN-11) | A date in incidents after the moment the data was made (2026-11-06 18:21:19). |
| `date_future:observations` | 4 | pipeline issue | INV-9 (OPEN-11) | A date in observations after the moment the data was made (2026-11-06 18:21:19). |
| `event_newer_than_source_says` | 5 | pipeline issue | INV-9 (OPEN-11) | A report later than the newest record its own source says it has: the source could not have known it. |
| `reading_newer_than_source_says` | 112 | pipeline issue | INV-9 (OPEN-11) | A reading later than the newest record its own source says it has. |
| `incident_id_date_differs_from_first_report` | 472 | pipeline issue | INV-20 | The date inside an incident's id differs from its first report. |
| `incident_only_junk_reports` | 225 | pipeline issue | INV-13 | An incident whose every report the pipeline itself flags as unusable text ("ok", "testing", random letters). |
| `daily_counts_miss_junk_complaints` | 228 | pipeline issue | INV-11 (OPEN-11) | A report left out of daily_counts because it is flagged junk. |
| `daily_counts_miss_imd_and_cpcb` | 156 | pipeline issue | INV-11 (OPEN-11) | A report left out of daily_counts because its source is IMD or CPCB. |
| `kpis_resolved_counts_rejected` | 92 | pipeline issue | INV-8 (OPEN-8) | kpis.resolved also counts Rejected incidents: it differs from those truly Resolved. |
| `kpis_complaints_filed_vs_console_rule` | 75 | pipeline issue | INV-8 (OPEN-8) | kpis.complaints_filed against the console's rule (complaints on incidents first reported in the window). |
| `kpis_complaints_open_vs_console_rule` | 77 | pipeline issue | INV-8 (OPEN-8) | kpis.complaints_open against the console's Open complaints tile rule. |
| `data_quality_quarantine_not_applied` | 5 | pipeline issue | INV-9 (OPEN-11) | The pipeline's hard rule says future reports are quarantined; they are still in incidents. |
| `complaint_not_in_events` | 8,110 | pipeline issue | INV-17 | A complaint in the portal's table that the console's reports do not have. |
| `grievance_event_without_complaint` | 16,945 | pipeline issue | INV-17 | A grievance report with no complaint in the portal's table. |
| `report_link_points_to_localhost` | 16,241 | pipeline issue | INV-17 | A report's link points to a developer's own machine. |
| `orphan_collector_decision` | 6 | pipeline issue | INV-12 | collector_decisions.incident_id points at a incidents row that does not exist. |
| `orphan_department_assignment` | 3 | pipeline issue | INV-12 | dept_assignments.incident_id points at a incidents row that does not exist. |
| `orphan_officer_report` | 3 | pipeline issue | INV-12 | officer_reports.incident_id points at a incidents row that does not exist. |
| `orphan_officer_step` | 5 | pipeline issue | INV-12 | officer_steps.incident_id points at a incidents row that does not exist. |
| `orphan_followup` | 6 | pipeline issue | INV-12 | followups.incident_id points at a incidents row that does not exist. |
| `orphan_outbound_email` | 6 | pipeline issue | INV-12 | outbound_emails.incident_id points at a incidents row that does not exist. |
| `orphan_action_update_action` | 4 | pipeline issue | INV-12 | action_updates.action_id points at a actions row that does not exist. |
| `archived_briefing_incident_missing` | 23 | pipeline issue | INV-12 | An incident named in an issued briefing (kept in the archive) that this build no longer has. |
| `personal_data:documents.title` | 4 | app issue | INV-2 | documents.title holds a mobile number, an Aadhaar-shaped number or an email. |
| `personal_data:documents.title_en` | 3 | app issue | INV-2 | documents.title_en holds a mobile number, an Aadhaar-shaped number or an email. |
| `personal_data:documents.summary` | 4 | app issue | INV-2 | documents.summary holds a mobile number, an Aadhaar-shaped number or an email. |
| `personal_data:documents.body` | 193 | pipeline issue | INV-22 | documents.body holds a mobile number, an Aadhaar-shaped number or an email. |
| `document_body_mojibake` | 14 | pipeline issue | INV-21 | An article's text has broken characters (wrong encoding). |
| `document_body_html_left` | 25 | pipeline issue | INV-21 | An article's text still has HTML tags or codes in it. |
| `source_item_title_html_left` | 2 | pipeline issue | INV-21 | A source item's title still has HTML tags or codes in it. |
| `tamil_garbled_word:briefings.ai_summary_ta` | 1 | pipeline issue | INV-18 | Latin letters in the middle of a Tamil word. |
| `tamil_missing:briefing_notes.text_ta` | 12 | pipeline issue | INV-18 | A briefing note with English but no Tamil. |
| `english_article_with_tamil_title:documents` | 21 | pipeline issue | INV-18 | An article marked English with a Tamil headline. |
| `english_title_holds_tamil:documents.title_en` | 26 | pipeline issue | INV-18 | title_en, the English headline, still holds Tamil. |

The findings, with what to do about each, are in `docs/qa/pass4/findings/invariants.json`.

## Personal data, in plain words

3 news headlines hold a phone number and 1 hold an email. They are Dinamalar's home Golu listings: a private person's name, home address and mobile number used as the headline. They do not appear on the News page, but the search box finds them and shows them as stored (INV-2). Jarvis's path hides the same text.

Article bodies: 116 hold a phone number and 86 an email. All the numbers were read with their digits masked. They are helplines, WhatsApp complaint numbers, restaurant bookings, book publishers and reporters' emails, with a few private organisers. This is the publisher's own text, so it is reported (INV-22) and not called an app fault. No citizen's number or email is in any complaint or report text. An earlier version of this check counted two "Aadhaar" hits: both were +91 helplines, and the pattern now leaves those out. The count is 0.

## The Collector's and officers' own work

The durable tables hold work done on earlier builds, and it names incidents this build no longer has: 6 of 6 Collector decisions, 3 of 7 department assignments, 3 of 3 officer reports, 5 of 5 officer steps, 6 of 6 follow-ups and 6 of 6 emails. The pipeline names an incident from its first report. So 17 of these 29 old ids can be traced to a report that is still here, now inside an incident with another id. In the code read, these rows are looked up by incident id, so they simply do not appear: the work no longer shows on the case it was done for (INV-12). This was read in the code, not clicked through. All 6 emails are in sandbox mode, which points to testing; for the other rows the data cannot say. The rule matters more than the count.

## After the app's build steps

The stored data is what the pipeline made. The app then changes it (takes out some news, merges some). `invariants-app.test.ts` reruns every check on what the real store holds after that, and writes `invariants-after-build.json`. 30 checks change. Most are expected or not shown: the app never reads `kpis`, the planner is told not to count from the ward statistics, and it reads only the briefing's summary sentences. One is a real fault: the build step `newsMedia` (`derive.ts` line 311) deletes incidents but leaves 181 articles, 181 reports, 43 actions and 136 timeline rows pointing at them, so a news result in the search box can open nothing (INV-1).

## Limits

- The main checks read the pipeline's stored tables. The rerun after the build steps replaces only the main tables (incidents, events, members, documents, actions, timeline, gaps, alerts).
- Bounds for Chennai are a box around the ward shapes with a margin. A pin in the wrong part of the city but inside the box only shows up in the ward-shape check.
- A mobile number is matched by pattern, so a 10-digit figure in news text can be counted, and an unusual layout can be missed. 044 landlines are not counted, because those seen are offices and helplines (one report quotes a public suicide helpline).
- Whether a number in an article is private or public was judged by reading a masked sample, not proved.
- INV-1 and INV-2 were proved at the function the page calls (`search`, `incident`), not by clicking in a browser. INV-4's "missed" is the rule in `Detail.tsx` line 130, compared with the data the page receives; the page itself was not rendered.
- The deadline rule (INV-3, INV-4) is an owner's call on what "on time" means for a "response" deadline. The tests hold the plain meaning of the words on the screen.
- A check that passes on this build says nothing about the next one. The guard test is frozen to this build, and goes red if the snapshot is pinned again: then rerun with `--freeze` on purpose, after reading what changed.
