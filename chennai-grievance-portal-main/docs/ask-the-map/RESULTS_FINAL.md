# Ask the Map final: results

20 November 2026, branch `claude/askmap-collector-final-333e26` (not in `main`; pushing needs the owner's yes).

## What is new

- **Claude writes the map's plan:** Ask the Map has its own AI order (`AI_MAP_PROVIDER`, default Claude, Nova Lite, Groq, Gemini), independent of `AI_FORCE_PROVIDER`; Jarvis and the other steps are unchanged. Claude Haiku 5.5 at low effort, no thinking, the plan as structured outputs (every field required, a sentinel for none: 0 unions, 0 optional fields), the fixed prompt (about 2,700 tokens) as the cached system block. Rules first, `checkPlan`, retry then chips, the number gate and the spend ceiling are kept.
- **14 Collector layers** from OpenStreetMap (20 Nov 2026, ODbL), in the plan, the words (English, Tamil, Tanglish), the Layers menu, the legend and the AI prompt. Partial layers say so in every answer and in the legend.
- **League table** (`rank` step): which wards or zones got worse or improved, with map bubbles, CSV and print.
- **Gaps:** per ward or per neighbourhood, a Gaps button, a list to print or download.
- **Rule checks:** licensed premises within N m of schools or places of worship; N is the officer's setting; the answer says to confirm the legal distance with the Excise desk.
- **Your lists:** CSV, Excel or PDF (PDF read by Claude Haiku 5.5), reviewed and approved before it shows; limits 2 MB, 2,000 rows.
- **Meeting packs:** weekly review, quarterly bank meeting, pre-monsoon meeting: one printable page (SVG ward map, top 10s, numbers).

## Numbers

| | Before | After |
|---|---|---|
| Ask the Map unit tests | 598 | 679, all pass |
| Golden, frozen store, no AI | 19 of 20 (one failure hid the rest of its loop) | 30 of 30 |
| Whole-app unit suite | — | 8,438 of 8,443 (5 Jarvis timeouts under load; 55 of 55 when run alone) |
| Typecheck, lint, build | — | clean, no errors, build passes |
| Live questions (TEST_LOG_FINAL.md) | — | every checked count equals the independent count after the fixes |

**AI comparison (Claude Haiku 5.5 against the current providers): not measured.** The Anthropic key in the portal's `.env` is refused (401) and the Bedrock keys have expired. With the free providers on 45 dev questions: Gemini answered 11 (10 correct, 8–14 s each), the rest were "busy"; Groq ran out of its per-minute allowance (old code and new code runs were still in progress at the end). Estimated Haiku cost per plan from the token sizes: about US$0.0004 to 0.0006 (2,700 cached tokens at US$0.01 a million, about 1,000 output tokens at US$0.50 a million); not measured. To measure: put a working key in `.env`, then `set AI_MAP_PROVIDER=anthropic&& npx vitest run --config vitest.live.config.ts src/lib/map/mapai.live.ts`.

US$ spent on Claude in this work: 0 (every call was refused before billing).

## Known limits

- OpenStreetMap is partial: ration shops 18 (not the 162 in the plan doc: that count matched "Corporation"), wine shops 31, banks 482, ATMs 412. Departments' own lists are needed (Civil Supplies, TASMAC/Excise, the Lead District Manager).
- Straight-line distances. Ward boundaries are DataMeet's, not GCC's.
- "which 5 zones" shows the top 10 (the number is not used).
- The blind set (`eval/v10/blind`) was not run: it tests Jarvis, which this work does not change, and its providers are out of keys.

## Owner decisions

1. Put a valid `ANTHROPIC_API_KEY` in the portal's `.env` (the main one is refused), then run the Haiku eval above before relying on it.
2. Keep `AI_MAP_PROVIDER` default (Claude first) or set it to `default` to stay on the console's order.
3. Ask the departments for their lists (ration shops, TASMAC, banks) and load them with "Your lists".
4. Confirm the legal distance for licensed premises with the Excise desk; the panel's default is 100 m, a setting, not a rule.
5. Merge this branch to `main` or not.
