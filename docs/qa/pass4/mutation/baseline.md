# Mutation testing: baseline

Stryker, perTest coverage, sandboxed copy. Score = (killed + timeout) / all mutants. NoCoverage = no test reaches the line.

| module | score % | killed | survived | no coverage | timeout |
|---|---|---|---|---|---|
| src/lib/assistant/compile.ts | 28.0 | 199 | 219 | 296 | 1 |
| src/lib/collector/effective.ts | 88.9 | 24 | 2 | 1 | 0 |
| src/lib/collector/guard.ts | 0.0 | 0 | 0 | 18 | 0 |
| src/lib/csv.ts | 87.0 | 20 | 2 | 1 | 0 |
| src/lib/netsafe.ts | 53.1 | 205 | 151 | 32 | 2 |
| src/lib/officer/guard.ts | 0.0 | 0 | 0 | 58 | 0 |
| src/lib/rate-limit.ts | 42.1 | 45 | 11 | 51 | 0 |
| src/lib/security/stepup.ts | 70.0 | 53 | 11 | 13 | 3 |
| src/lib/thunai/entities.ts | 35.8 | 357 | 507 | 142 | 5 |
| src/lib/thunai/frame.ts | 53.9 | 173 | 92 | 56 | 0 |
| src/lib/thunai/narrate.ts | 37.4 | 139 | 148 | 85 | 0 |
| src/lib/thunai/numbergate.ts | 65.3 | 163 | 84 | 3 | 1 |
| src/lib/thunai/outside.ts | 42.5 | 36 | 42 | 8 | 1 |
| src/lib/thunai/privacy.ts | 57.4 | 167 | 123 | 1 | 0 |
| src/lib/thunai/quick.ts | 46.5 | 443 | 405 | 109 | 4 |
| src/lib/thunai/speechcheck.ts | 68.0 | 33 | 14 | 2 | 1 |
| src/lib/thunai/injection.ts | 62.0 | 31 | 19 | 0 | 0 |

## 30 survivors that matter most (logic changes first, at most 4 per file)

1. src/lib/assistant/compile.ts:107 [Survived] ConditionalExpression -> `false`  (code: `if (!ALIAS.test(pq.id.toLowerCase())) throw new CompileError(`Query id "${pq.id}" must be `)
2. src/lib/assistant/compile.ts:120 [Survived] ConditionalExpression -> `false`  (code: `if (!other) throw new CompileError(`Table "${t}" (${purpose}) is not in the catalog.`);`)
3. src/lib/assistant/compile.ts:122 [Survived] ConditionalExpression -> `false`  (code: `if (!col) throw new CompileError(`Column "${c}" (${purpose}) is not available on ${t}.`);`)
4. src/lib/assistant/compile.ts:124 [Survived] ConditionalExpression -> `true`  (code: `if (!j) {`)
5. src/lib/collector/effective.ts:19 [Survived] ConditionalExpression -> `true`  (code: `return typeof decision === "string" && Object.prototype.hasOwnProperty.call(DECISION_EFFEC`)
6. src/lib/netsafe.ts:29 [Survived] ConditionalExpression -> `true`  (code: `return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= `)
7. src/lib/netsafe.ts:29 [Survived] LogicalOperator -> `a === 169 || b === 254`  (code: `return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= `)
8. src/lib/netsafe.ts:29 [Survived] ConditionalExpression -> `true`  (code: `return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= `)
9. src/lib/netsafe.ts:29 [Survived] LogicalOperator -> `a === 172 || b >= 16`  (code: `return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= `)
10. src/lib/rate-limit.ts:30 [Survived] ConditionalExpression -> `true`  (code: `if (buckets.size >= SWEEP_AT) sweep(now);`)
11. src/lib/rate-limit.ts:30 [Survived] ConditionalExpression -> `false`  (code: `if (buckets.size >= SWEEP_AT) sweep(now);`)
12. src/lib/rate-limit.ts:30 [Survived] EqualityOperator -> `buckets.size > SWEEP_AT`  (code: `if (buckets.size >= SWEEP_AT) sweep(now);`)
13. src/lib/rate-limit.ts:30 [Survived] EqualityOperator -> `buckets.size < SWEEP_AT`  (code: `if (buckets.size >= SWEEP_AT) sweep(now);`)
14. src/lib/security/stepup.ts:44 [Survived] ConditionalExpression -> `false`  (code: `const off = () => process.env.NODE_ENV === "test" && process.env.STEP_UP === "off";`)
15. src/lib/security/stepup.ts:44 [Survived] ConditionalExpression -> `true`  (code: `const off = () => process.env.NODE_ENV === "test" && process.env.STEP_UP === "off";`)
16. src/lib/security/stepup.ts:44 [Survived] EqualityOperator -> `process.env.NODE_ENV !== "test"`  (code: `const off = () => process.env.NODE_ENV === "test" && process.env.STEP_UP === "off";`)
17. src/lib/security/stepup.ts:52 [Survived] ConditionalExpression -> `false`  (code: `if (off()) return { ok: true, grant: null };`)
18. src/lib/thunai/entities.ts:64 [Survived] ConditionalExpression -> `true`  (code: `const core = (ws: string[]) => ws.filter((w) => !QUAL.has(w) && w !== "and");`)
19. src/lib/thunai/entities.ts:64 [Survived] LogicalOperator -> `!QUAL.has(w) || w !== "and"`  (code: `const core = (ws: string[]) => ws.filter((w) => !QUAL.has(w) && w !== "and");`)
20. src/lib/thunai/entities.ts:64 [Survived] ConditionalExpression -> `true`  (code: `const core = (ws: string[]) => ws.filter((w) => !QUAL.has(w) && w !== "and");`)
21. src/lib/thunai/entities.ts:66 [Survived] ConditionalExpression -> `true`  (code: `const initials = (name: string) => { const ws = words(name).filter((w) => w !== "and" && w`)
22. src/lib/thunai/frame.ts:41 [Survived] ConditionalExpression -> `false`  (code: `return ELLIPSIS_EN.test(t) || ELLIPSIS_TG.test(t) || ELLIPSIS_TA.test(text.trim()) || (wor`)
23. src/lib/thunai/frame.ts:41 [Survived] LogicalOperator -> `(ELLIPSIS_EN.test(t) || ELLIPSIS_TG.test(t)) && ELLIPSIS_TA.`  (code: `return ELLIPSIS_EN.test(t) || ELLIPSIS_TG.test(t) || ELLIPSIS_TA.test(text.trim()) || (wor`)
24. src/lib/thunai/frame.ts:41 [Survived] ConditionalExpression -> `false`  (code: `return ELLIPSIS_EN.test(t) || ELLIPSIS_TG.test(t) || ELLIPSIS_TA.test(text.trim()) || (wor`)
25. src/lib/thunai/frame.ts:41 [Survived] LogicalOperator -> `ELLIPSIS_EN.test(t) && ELLIPSIS_TG.test(t)`  (code: `return ELLIPSIS_EN.test(t) || ELLIPSIS_TG.test(t) || ELLIPSIS_TA.test(text.trim()) || (wor`)
26. src/lib/thunai/narrate.ts:36 [Survived] ConditionalExpression -> `true`  (code: `return open != null && Number(open) === 0 ? "closed" : null;`)
27. src/lib/thunai/narrate.ts:120 [Survived] ConditionalExpression -> `false`  (code: `if (!src) continue;`)
28. src/lib/thunai/narrate.ts:129 [Survived] ConditionalExpression -> `false`  (code: `if (!code && !name) return null;`)
29. src/lib/thunai/narrate.ts:129 [Survived] LogicalOperator -> `!code || !name`  (code: `if (!code && !name) return null;`)
30. src/lib/thunai/numbergate.ts:40 [Survived] EqualityOperator -> `k >= 0`  (code: `if (k > 0) { const head = taNumber(`${w.slice(0, k)}ு`); if (head) return head * 1000; }`)
