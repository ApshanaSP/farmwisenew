# Coverage: baseline against final

- Before: `cd14265`, 2319 passed, 0 failed, 13 skipped
- After: `b9725ea`, 3148 passed, 0 failed, 13 skipped
- Same tool and options both times: vitest default suite (`vitest.config.ts`) with v8 coverage and AST-aware remapping. The qa4 tests in `tests/qa/pass4/` are not counted.
- All of src: branches 16005/56471 (28.34 %) before, 17817/58883 (30.25 %) after; lines 13731/38122 (36.01 %) before, 15015/39591 (37.92 %) after

## Critical modules (target 85 % of branches)

Together: 1377/1782 (77.27 %) before, 1859/2285 (81.36 %) after. 9 of 17 met the target before, 10 of 17 after.

| Module | Before | After | Against 85 % | Branches to add |
|---|---|---|---|---|
| `src/lib/collector/guard.ts` | 0/4 (0.00 %) | 0/4 (0.00 %) | **below** | 4 |
| `src/lib/officer/guard.ts` | 1/18 (5.55 %) | 1/18 (5.55 %) | **below** | 15 |
| `src/lib/assistant/compile.ts` | 119/255 (46.66 %) | 123/259 (47.49 %) | **below** | 98 |
| `src/lib/thunai/narrate.ts` | 126/192 (65.62 %) | 143/206 (69.41 %) | **below** | 33 |
| `src/lib/thunai/frame.ts` | 100/143 (69.93 %) | 105/148 (70.94 %) | **below** | 21 |
| `src/lib/rate-limit.ts` | 20/33 (60.60 %) | 26/33 (78.78 %) | **below** | 3 |
| `src/lib/security/stepup.ts` | 22/28 (78.57 %) | 24/30 (80.00 %) | **below** | 2 |
| `src/lib/thunai/speechcheck.ts` | 13/15 (86.66 %) | 13/15 (86.66 %) | met | 0 |
| `src/lib/thunai/quick.ts` | 307/370 (82.97 %) | 444/508 (87.40 %) | met | 0 |
| `src/lib/thunai/privacy.ts` | 92/96 (95.83 %) | 152/169 (89.94 %) | met | 0 |
| `src/lib/thunai/numbergate.ts` | 56/64 (87.50 %) | 89/98 (90.81 %) | met | 0 |
| `src/lib/netsafe.ts` | 128/140 (91.42 %) | 128/140 (91.42 %) | met | 0 |
| `src/lib/csv.ts` | 12/13 (92.30 %) | 12/13 (92.30 %) | met | 0 |
| `src/lib/thunai/entities.ts` | 326/354 (92.09 %) | 532/575 (92.52 %) | met | 0 |
| `src/lib/thunai/injection.ts` | 17/18 (94.44 %) | 18/19 (94.73 %) | met | 0 |
| `src/lib/thunai/outside.ts` | 29/29 (100.00 %) | 36/37 (97.29 %) | met | 0 |
| `src/lib/collector/effective.ts` | 9/10 (90.00 %) | 13/13 (100.00 %) | met | 0 |

## Under 85 %: 7

- `src/lib/collector/guard.ts`: 0.00 %, 4 more branches needed (No test loads this file)
- `src/lib/officer/guard.ts`: 5.55 %, 15 more branches needed
- `src/lib/assistant/compile.ts`: 47.49 %, 98 more branches needed
- `src/lib/thunai/narrate.ts`: 69.41 %, 33 more branches needed
- `src/lib/thunai/frame.ts`: 70.94 %, 21 more branches needed
- `src/lib/rate-limit.ts`: 78.78 %, 3 more branches needed
- `src/lib/security/stepup.ts`: 80.00 %, 2 more branches needed

## Falls in the critical modules: 3

- `src/lib/thunai/privacy.ts`: 92/96 (95.83 %) to 152/169 (89.94 %) (branch %)
- `src/lib/thunai/outside.ts`: 29/29 (100.00 %) to 36/37 (97.29 %) (branch %)
- `src/lib/thunai/entities.ts`: 326/354 (92.09 %) to 532/575 (92.52 %) (line %)

## Falls anywhere else: 32

A file is listed when its branch % went down by more than 0.01 point, its covered branches went down, or its line % went down. Code changed between the two commits, so a fall can also mean a bigger file with the same tests. Worst first.

| File | Branches before | Branches after | Lines before | Lines after | Why |
|---|---|---|---|---|---|
| `src/lib/thunai/devguard.ts` | 4/4 (100.00 %) | 13/20 (65.00 %) | 4/4 (100.00 %) | 13/13 (100.00 %) | branch % |
| `src/lib/thunai/brain.ts` | 2/13 (15.38 %) | 2/45 (4.44 %) | 2/8 (25.00 %) | 2/23 (8.69 %) | branch %, line % |
| `src/components/collector/app/thunai/guards.ts` | 7/8 (87.50 %) | 11/14 (78.57 %) | 3/3 (100.00 %) | 6/6 (100.00 %) | branch % |
| `src/app/api/collector/sources/[id]/route.ts` | 16/30 (53.33 %) | 12/26 (46.15 %) | 23/34 (67.64 %) | 26/37 (70.27 %) | branch %, covered branches |
| `src/lib/collector/searchwords.ts` | 7/10 (70.00 %) | 9/14 (64.28 %) | 10/10 (100.00 %) | 12/12 (100.00 %) | branch % |
| `src/lib/assistant/direct.ts` | 82/91 (90.10 %) | 102/120 (85.00 %) | 64/64 (100.00 %) | 72/72 (100.00 %) | branch % |
| `src/lib/complaint-progress.ts` | 74/99 (74.74 %) | 86/119 (72.26 %) | 97/99 (97.97 %) | 109/111 (98.19 %) | branch % |
| `src/app/api/profile/photo/route.ts` | 9/14 (64.28 %) | 10/16 (62.50 %) | 24/29 (82.75 %) | 25/30 (83.33 %) | branch % |
| `src/app/api/collector/decisions/route.ts` | 37/68 (54.41 %) | 40/76 (52.63 %) | 39/51 (76.47 %) | 45/57 (78.94 %) | branch % |
| `src/app/api/auth/login/route.ts` | 12/18 (66.66 %) | 13/20 (65.00 %) | 23/29 (79.31 %) | 24/30 (80.00 %) | branch % |
| `src/lib/thunai/agent.ts` | 379/481 (78.79 %) | 379/490 (77.34 %) | 213/234 (91.02 %) | 218/241 (90.45 %) | branch %, line % |
| `src/lib/thunai/addressed.ts` | 97/99 (97.97 %) | 98/101 (97.02 %) | 72/72 (100.00 %) | 76/76 (100.00 %) | branch % |
| `src/lib/assistant/guard.ts` | 23/122 (18.85 %) | 23/128 (17.96 %) | 25/72 (34.72 %) | 25/73 (34.24 %) | branch %, line % |
| `src/lib/assistant/intent.ts` | 240/268 (89.55 %) | 247/278 (88.84 %) | 133/136 (97.79 %) | 133/136 (97.79 %) | branch % |
| `src/lib/officer/data.ts` | 43/269 (15.98 %) | 43/279 (15.41 %) | 65/168 (38.69 %) | 66/170 (38.82 %) | branch % |
| `src/lib/assistant/lance.ts` | 4/151 (2.64 %) | 4/167 (2.39 %) | 12/156 (7.69 %) | 13/167 (7.78 %) | branch % |
| `src/lib/collector/sources.ts` | 38/485 (7.83 %) | 38/495 (7.67 %) | 103/381 (27.03 %) | 103/381 (27.03 %) | branch % |
| `src/lib/aws/store.ts` | 28/245 (11.42 %) | 28/247 (11.33 %) | 80/389 (20.56 %) | 80/390 (20.51 %) | branch %, line % |
| `src/lib/studio/pipeline.ts` | 3/491 (0.61 %) | 3/495 (0.60 %) | 14/444 (3.15 %) | 14/447 (3.13 %) | line % |
| `src/lib/assistant/incidents.ts` | 0/256 (0.00 %) | 0/271 (0.00 %) | 8/154 (5.19 %) | 8/161 (4.96 %) | line % |
| `src/lib/assistant/insightcards.ts` | 0/40 (0.00 %) | 0/40 (0.00 %) | 3/31 (9.67 %) | 3/32 (9.37 %) | line % |
| `src/lib/auth.ts` | 23/76 (30.26 %) | 23/76 (30.26 %) | 31/65 (47.69 %) | 31/66 (46.96 %) | line % |
| `src/lib/collector/storyai.ts` | 17/96 (17.70 %) | 17/96 (17.70 %) | 28/110 (25.45 %) | 28/112 (25.00 %) | line % |
| `src/lib/crypto.ts` | 0/2 (0.00 %) | 0/4 (0.00 %) | 4/19 (21.05 %) | 4/20 (20.00 %) | line % |
| `src/lib/map/analyst.ts` | 0/41 (0.00 %) | 0/41 (0.00 %) | 4/35 (11.42 %) | 4/36 (11.11 %) | line % |
| `src/lib/map/ask.ts` | 0/474 (0.00 %) | 0/474 (0.00 %) | 11/295 (3.72 %) | 11/296 (3.71 %) | line % |
| `src/lib/map/world.ts` | 0/344 (0.00 %) | 0/345 (0.00 %) | 7/195 (3.58 %) | 7/196 (3.57 %) | line % |
| `src/lib/studio/link.ts` | 0/213 (0.00 %) | 0/213 (0.00 %) | 4/119 (3.36 %) | 4/120 (3.33 %) | line % |
| `src/lib/assistant/cards.ts` | 51/470 (10.85 %) | 52/477 (10.90 %) | 54/211 (25.59 %) | 54/215 (25.11 %) | line % |
| `src/app/api/complaints/[code]/route.ts` | 8/14 (57.14 %) | 7/12 (58.33 %) | 13/18 (72.22 %) | 14/19 (73.68 %) | covered branches |
| `src/lib/thunai/screens.ts` | 965/1600 (60.31 %) | 1155/1868 (61.83 %) | 666/729 (91.35 %) | 731/801 (91.26 %) | line % |
| `src/lib/thunai/say.ts` | 9/13 (69.23 %) | 33/43 (76.74 %) | 11/11 (100.00 %) | 19/20 (95.00 %) | line % |

Files only in the after map: 24. Files only in the before map: 1.
