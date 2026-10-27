# Live test P0 fixes, 26–27 Oct 2026

The 14 urgent fixes from the live test. Each one was checked on the live data of 26–27 Oct (Cyclone Arnab) in the local
console (localhost:3000).

| ID | Fix | Where | Proof |
|---|---|---|---|
| LT-01 | Alerts lane: IMD, NDMA SACHET and warning news side by side. A banner shows whether the sources agree, and the Briefing status uses it. The code, not the AI, decides whether Chennai is named. SACHET has no Tamil Nadu feed (`rss_tamil_nadu.xml` is 404), so the all-India CAP feed is filtered to alerts that name Chennai | `src/lib/collector/alerts.ts`, `/api/collector/alerts`, `AlertBar.tsx`, `briefbook.ts` | `alerts.test.ts` (Arnab fixture, 22 tests). Live: "Cyclone Arnab in 16 outlets; 4 reports put Chennai under a warning; red alert for Madurai, Dindigul, Theni" |
| LT-02 | A stale hazard feed during an alert turns the banner red and falls back to IMD rain and lake levels | `alerts.ts` (`HAZARD_FEEDS`) | Fixture test. Live: CFM-DSS gauges silent since 20 Oct (162 h) |
| LT-03 | Report kinds: incident / alert / government action / resolution / roundup / opinion / other. Only incidents become incidents with a severity | `src/lib/collector/reporttype.ts` + `derive.ts` (report-kinds@1); `district_intel/dintel/reporttype.py` in the pipeline | 57 real headlines in `reporttype.test.ts`, 22 in `tests/test_report_kind.py`. Live: 117 non-incidents left the counts |
| LT-04 | Death counts: class, grade, route, ward, age and price numbers are not tolls; the count must sit next to the death word (Tamil too); whole words only ("diesel" is not "die") | `district_intel/dintel/textproc.py`, `loaders/news.py`; `newssanity.ts` + `derive.ts` (news-sanity@6) | "Class 12 student killed…" → 1 death. Live: 142 article counts lowered (petrol prices had counted 87 deaths) |
| LT-07 | One metric glossary. "Waiting for your check" is one rule for My Tasks, the Briefing and the AI briefing | `src/lib/reference/metrics.ts`, `intel.ts` `awaitingCheck` | `glossary.sqlite.test.ts`. Live, all four periods: My Tasks = Briefing |
| LT-08 | Every figure shows its measure and window ("Past deadline, still open · 24 h"; the taluk ranking says 30 days) | `Overview.tsx`, `Insights.tsx`, `metrics.ts` | Glossary test. Live: tile = list = Briefing in every period (3 / 415 / 751 / 915) |
| LT-10 | One measure per answer: a complaints answer counts the incidents the complaints are about. No % change on a base under 20 | `assistant/fastpath.ts`, `incidents.ts`, `facts.ts`, `tools.ts` | `guards.test.ts`, glossary test |
| LT-11 | The deadline state is computed when the text is shown; "deadline missed" is dropped before the due time. The pipeline refuses such write-ups | `metrics.ts` (`deadlineState`), `intel.ts` `explain()`; `newsllm.py` `_on_time` | `metrics.test.ts` (not said before 17:06), `test_newsllm.py`. Live: the 5 remaining claims are all past due |
| LT-15 | Weather and alert questions go to the alerts lane and the flood-warning playbook, before the router | `assistant/warnings.ts`, `pipeline.ts` | `warnings.test.ts`, EN / TA / Tanglish (25 tests). Live: no longer "outside the data" |
| LT-29 | A refused or expired AI key shows an admin banner with how to renew it | `src/lib/ai/keyhealth.ts`, `gateway.ts`, `docs/AI_KEY_ROTATION.md` | Simulated 403 in `keyhealth.test.ts`. Live: the PC's Bedrock key had expired |
| LT-32 | Dated workspace versions for the demo | — | **Not done: it writes to the live AWS store; waiting for the owner's OK** |
| LT-36 | Search: every word in any order, by stem and synonyms, across title, place, zone and category | `src/lib/collector/searchwords.ts`, `intel.ts` `search` | `searchwords.test.ts`. Live: "velachery flooding" 0 → 7, "garbage adyar" 0 → 7 |
| LT-37 | One severe definition: the tile, the list, the Briefing and Ask District IQ agree | `metrics.ts`, `glossary.sqlite.test.ts` | Live: 8 / 80 / 258 / 562 everywhere |
| LT-42 | Non-breaking patches (nodemailer, undici, vite); image optimizer switched off; a mitigation for each remaining advisory | `package-lock.json`, `next.config.js`, `chennai-grievance-portal-main/docs/SECURITY_AUDIT.md` | 13 → 9 advisories. **Next 16 / zod 4 is the owner's decision**; the Windows RCE advisory applies while the dev server listens on 0.0.0.0 |

## Left for the owner

1. LT-32: OK to save dated workspace versions to the AWS store.
2. LT-42: upgrade to Next 16, or bind the dev server to 127.0.0.1 (see SECURITY_AUDIT.md).
3. Run the route-news job once. It withdraws news roundups that were routed to officers as complaints before LT-03, for
   example the CMWSSB items "Water level in 5 lakes…". It writes to the AWS store.
4. Renew the Bedrock key: `npm run ai:key`.
5. Push to main (code only). The pipeline fixes (LT-03, LT-04, LT-11) reach the hourly build only after the push.
