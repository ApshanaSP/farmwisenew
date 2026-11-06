# Coverage of the critical modules: baseline

Measured with the default test suite only (`vitest.config.ts`). Tests in `tests/qa/pass4/`, the live tests and the browser tests are not counted.

- Commit: `cd14265b4fc3d12799075bccfb5a50303a5aaa09`, with 0 changes under src not committed
- Tests: 2319 passed, 0 failed, 13 skipped, in 163 files
- Tool: vitest 3.2.7 with @vitest/coverage-v8 3.2.7, AST-aware remapping (real if, ?:, and/or, switch and default-value branches)
- Every part of an and/or chain counts as a branch, and so does each side of an if, even when the if has no else
- Figures made without AST-aware remapping cannot be compared with these: that mode counts far fewer branches, and a file whose functions no test calls can show 100 %
- Command: `npx vitest run --coverage --coverage.provider=v8 --coverage.reporter=json --coverage.reporter=json-summary --coverage.include=src/** --coverage.experimentalAstAwareRemapping=true --coverage.reportOnFailure=true --coverage.reportsDirectory=coverage/baseline --reporter=default --reporter=json --outputFile.json=coverage/baseline/vitest-results.json`

## Where each module stands against 85 %

9 of 17 modules meet 85 %. Together: 1377 of 1782 branches, 77.27 %. Worst first.

| Module | Branches | Branch % | Against 85 % | Branches to add | Functions % | Note |
|---|---|---|---|---|---|---|
| `src/lib/collector/guard.ts` | 0 of 4 | 0.00 % | below | 4 | 0.00 % | No test loads this file |
| `src/lib/officer/guard.ts` | 1 of 18 | 5.55 % | below | 15 | 20.00 % |  |
| `src/lib/assistant/compile.ts` | 119 of 255 | 46.66 % | below | 98 | 57.81 % |  |
| `src/lib/rate-limit.ts` | 20 of 33 | 60.60 % | below | 9 | 87.50 % |  |
| `src/lib/thunai/narrate.ts` | 126 of 192 | 65.62 % | below | 38 | 100.00 % |  |
| `src/lib/thunai/frame.ts` | 100 of 143 | 69.93 % | below | 22 | 100.00 % |  |
| `src/lib/security/stepup.ts` | 22 of 28 | 78.57 % | below | 2 | 85.71 % |  |
| `src/lib/thunai/quick.ts` | 307 of 370 | 82.97 % | below | 8 | 98.03 % |  |
| `src/lib/thunai/speechcheck.ts` | 13 of 15 | 86.66 % | met | 0 | 100.00 % |  |
| `src/lib/thunai/numbergate.ts` | 56 of 64 | 87.50 % | met | 0 | 100.00 % |  |
| `src/lib/collector/effective.ts` | 9 of 10 | 90.00 % | met | 0 | 100.00 % |  |
| `src/lib/netsafe.ts` | 128 of 140 | 91.42 % | met | 0 | 82.35 % |  |
| `src/lib/thunai/entities.ts` | 326 of 354 | 92.09 % | met | 0 | 92.15 % |  |
| `src/lib/csv.ts` | 12 of 13 | 92.30 % | met | 0 | 100.00 % |  |
| `src/lib/thunai/injection.ts` | 17 of 18 | 94.44 % | met | 0 | 100.00 % |  |
| `src/lib/thunai/privacy.ts` | 92 of 96 | 95.83 % | met | 0 | 54.54 % |  |
| `src/lib/thunai/outside.ts` | 29 of 29 | 100.00 % | met | 0 | 100.00 % |  |

Every named module was found at the path in `tests/qa/pass4/critical-modules.json`. None has moved.

Similar names that are not counted:

- `src/lib/assistant/guard.ts`: the Ask District IQ question guard, not the collector or officer guard
- `src/lib/thunai/devguard.ts`: not named in the plan
- `src/components/collector/app/thunai/guards.ts`: browser-side checks, not the collector guard in src/lib/collector
- `src/lib/collector/onboard.ts`: has a small local safeFetch that only calls netsafe's safeFetch
- `src/lib/studio/fetchurl.ts`: Data Studio's download code, which calls netsafe's safeFetch

## Code files under src with no figure (10)

The coverage tool could not read these, so a fall in them cannot be seen. The ones seen so far are files no test loads, with a name like [id] in their path. None is a critical module.

- `src/app/api/collector/assistant/sessions/[id]/route.ts`
- `src/app/api/collector/incidents/[id]/action/route.ts`
- `src/app/api/collector/incidents/[id]/analysis/route.ts`
- `src/app/api/collector/incidents/[id]/route.ts`
- `src/app/api/collector/studio/[id]/route.ts`
- `src/app/api/collector/workspaces/[id]/route.ts`
- `src/app/api/map/layers/[id]/route.ts`
- `src/app/api/rehearsal/photo/[dir]/[name]/route.ts`
- `src/app/api/rehearsal/traffic/[z]/[x]/[y]/route.ts`
- `src/app/thunai-ort/[file]/route.ts`

## Every untested branch

### src/lib/collector/guard.ts: 0.00 %, 4 untested

- `src/lib/collector/guard.ts:8` if: the true side never ran: `if (!session || session.role !== "collector") {`
- `src/lib/collector/guard.ts:8` if: the false side never ran: `if (!session || session.role !== "collector") {`
- `src/lib/collector/guard.ts:8` and/or: part 1 of 2 never reached: `!session`
- `src/lib/collector/guard.ts:8` and/or: part 2 of 2 never reached: `session.role !== "collector")`

### src/lib/officer/guard.ts: 5.55 %, 17 untested

- `src/lib/officer/guard.ts:28` if: the true side never ran: `if (err?.code !== "ER_BAD_FIELD_ERROR") throw err;`
- `src/lib/officer/guard.ts:28` if: the false side never ran: `if (err?.code !== "ER_BAD_FIELD_ERROR") throw err;`
- `src/lib/officer/guard.ts:36` if: the true side never ran: `if (!r) return null;`
- `src/lib/officer/guard.ts:36` if: the false side never ran: `if (!r) return null;`
- `src/lib/officer/guard.ts:37` and/or: part 1 of 2 never reached: `r.dept_code as string | null)`
- `src/lib/officer/guard.ts:37` and/or: part 2 of 2 never reached: `return (r.dept_code as string | null) || codeForPortalDept(r.portal_dept as string | null);`
- `src/lib/officer/guard.ts:47` default value never used: `export async function officerSession(_params?: URLSearchParams, _opts: { write?: boolean } = {}): Pr...`
- `src/lib/officer/guard.ts:50` if: the true side never ran: `if (!session || session.role !== "department_officer") {`
- `src/lib/officer/guard.ts:50` if: the false side never ran: `if (!session || session.role !== "department_officer") {`
- `src/lib/officer/guard.ts:50` and/or: part 1 of 2 never reached: `!session`
- `src/lib/officer/guard.ts:50` and/or: part 2 of 2 never reached: `session.role !== "department_officer")`
- `src/lib/officer/guard.ts:54` ?: the true side never ran: `await deptProfile(code)`
- `src/lib/officer/guard.ts:54` ?: the false side never ran: `const dept = code ? await deptProfile(code) : null;`
- `src/lib/officer/guard.ts:55` if: the true side never ran: `if (!dept) {`
- `src/lib/officer/guard.ts:55` if: the false side never ran: `if (!dept) {`
- `src/lib/officer/guard.ts:74` ?: the true side never ran: `) ? parsePeriod(p.get("period")) : (`
- `src/lib/officer/guard.ts:74` ?: the false side never ran: `period: p.get("period") ? parsePeriod(p.get("period")) : (OFFICER.defaultPeriod as Period),`

### src/lib/assistant/compile.ts: 46.66 %, 136 untested

- `src/lib/assistant/compile.ts:107` if: the true side never ran: `` if (!ALIAS.test(pq.id.toLowerCase())) throw new CompileError(`Query id "${pq.id}" must be a short lo... ``
- `src/lib/assistant/compile.ts:120` if: the true side never ran: `` if (!other) throw new CompileError(`Table "${t}" (${purpose}) is not in the catalog.`); ``
- `src/lib/assistant/compile.ts:124` if: the false side never ran: `if (!j) {`
- `src/lib/assistant/compile.ts:128` if: the false side never ran: `` if (fwd) j = { table: other, alias, on: `b.${q(fwd.name)} = ${alias}.${q(fwd.join!.split(".")[1])}` ... ``
- `src/lib/assistant/compile.ts:129` if: the true side never ran: `` ...if (back) j = { table: other, alias, on: `${alias}.${q(back.name)} = b.${q(back.join!.split(".")[1])... ``
- `src/lib/assistant/compile.ts:129` if: the false side never ran: `` ...if (back) j = { table: other, alias, on: `${alias}.${q(back.name)} = b.${q(back.join!.split(".")[1])... ``
- `src/lib/assistant/compile.ts:136` if: the true side never ran: `if (pq.measures.length === 0 && pq.dimensions.length === 0) throw new CompileError("Select at least ...`
- `src/lib/assistant/compile.ts:137` if: the true side never ran: `if (pq.dimensions.filter((d) => !d.grain).length > LIMITS.dimensionsPerQuery || pq.dimensions.length...`
- `src/lib/assistant/compile.ts:144` if: the true side never ran: `` if (used.has(x)) throw new CompileError(`Alias "${a}" is used twice.`); ``
- `src/lib/assistant/compile.ts:152` if: the true side never ran: `` if (["geo"].includes(r.col.role)) throw new CompileError(`Cannot group by ${d.field}.`); ``
- `src/lib/assistant/compile.ts:154` if: the true side never ran: `` if (d.grain && !time) throw new CompileError(`A grain (${d.grain}) only applies to a date or time co... ``
- `src/lib/assistant/compile.ts:154` and/or: part 2 of 2 never reached: `!time)`
- `src/lib/assistant/compile.ts:155` ?: the true side never ran: `d.grain ?? "day"`
- `src/lib/assistant/compile.ts:155` and/or: part 1 of 2 never reached: `d.grain`
- `src/lib/assistant/compile.ts:155` and/or: part 2 of 2 never reached: `"day"`
- `src/lib/assistant/compile.ts:158` ?: the false side never ran: `` !d.time ? d.expr : grain === "month" ? `DATE_FORMAT(${d.expr}, '%Y-%m')` ``
- `src/lib/assistant/compile.ts:158` ?: the true side never ran: `` !d.time ? d.expr : grain === "month" ? `DATE_FORMAT(${d.expr}, '%Y-%m')` ``
- `src/lib/assistant/compile.ts:159` ?: the false side never ran: `` : grain === "week" ? `DATE_FORMAT(DATE_SUB(DATE(${d.expr}), INTERVAL WEEKDAY(${d.expr}) DAY), '%Y-%m... ``
- `src/lib/assistant/compile.ts:159` ?: the true side never ran: `` `DATE_FORMAT(DATE_SUB(DATE(${d.expr}), INTERVAL WEEKDAY(${d.expr}) DAY), '%Y-%m-%d')` ``
- `src/lib/assistant/compile.ts:159` ?: the false side never ran: `` : grain === "week" ? `DATE_FORMAT(DATE_SUB(DATE(${d.expr}), INTERVAL WEEKDAY(${d.expr}) DAY), '%Y-%m... ``
- `src/lib/assistant/compile.ts:165` if: the true side never ran: `` if (!m.field) throw new CompileError(`${m.fn} needs a field.`); ``
- `src/lib/assistant/compile.ts:167` if: the true side never ran: `` if (m.fn === "count") return { alias, fn: m.fn, col: r.col, sql: `COUNT(${r.sql})` }; ``
- `src/lib/assistant/compile.ts:168` if: the true side never ran: `` if (m.fn === "count_distinct") return { alias, fn: m.fn, col: r.col, sql: `COUNT(DISTINCT ${r.sql})`... ``
- `src/lib/assistant/compile.ts:169` if: the false side never ran: `` if (!NUMERIC.test(r.col.type) || !["measure", "flag"].includes(r.col.role)) throw new CompileError(`... ``
- `src/lib/assistant/compile.ts:169` and/or: part 2 of 2 never reached: `!["measure", "flag"].includes(r.col.role))`
- `src/lib/assistant/compile.ts:178` if: the true side never ran: `if (!t.cap) return;`
- `src/lib/assistant/compile.ts:190` if: the true side never ran: `` if (!f) throw new CompileError(`${base.name} has no time column for a time range.`); ``
- `src/lib/assistant/compile.ts:192` if: the true side never ran: `` if (!isTimeType(timeRef.col.type)) throw new CompileError(`${f} is not a date or time column.`); ``
- `src/lib/assistant/compile.ts:193` if: the false side never ran: `if (tr.mode === "relative") {`
- `src/lib/assistant/compile.ts:195` if: the true side never ran: `if (!tr.unit || !Number.isFinite(n) || n < 1 || n * HOURS[tr.unit] > 24 * 400) throw new CompileErro...`
- `src/lib/assistant/compile.ts:200` if: the true side never ran: `if (!tr.from || !DATE.test(tr.from)) throw new CompileError("from must be a date (YYYY-MM-DD).");`
- `src/lib/assistant/compile.ts:200` if: the false side never ran: `if (!tr.from || !DATE.test(tr.from)) throw new CompileError("from must be a date (YYYY-MM-DD).");`
- `src/lib/assistant/compile.ts:200` and/or: part 1 of 2 never reached: `!tr.from`
- `src/lib/assistant/compile.ts:200` and/or: part 2 of 2 never reached: `!DATE.test(tr.from))`
- `src/lib/assistant/compile.ts:201` if: the true side never ran: `if (tr.mode === "between" && (!tr.to || !DATE.test(tr.to))) throw new CompileError("to must be a dat...`
- `src/lib/assistant/compile.ts:201` if: the false side never ran: `if (tr.mode === "between" && (!tr.to || !DATE.test(tr.to))) throw new CompileError("to must be a dat...`
- `src/lib/assistant/compile.ts:201` and/or: part 1 of 3 never reached: `tr.mode === "between" && (`
- `src/lib/assistant/compile.ts:201` and/or: part 2 of 3 never reached: `if (tr.mode === "between" && (!tr.to || !DATE.test(tr.to))) throw new CompileError("to must be a dat...`
- `src/lib/assistant/compile.ts:201` and/or: part 3 of 3 never reached: `!DATE.test(tr.to)))`
- `src/lib/assistant/compile.ts:203` ?: the true side never ran: `` `${tr.to!.slice(0, 10)} 23:59:59` ``
- `src/lib/assistant/compile.ts:203` ?: the false side never ran: `asOf`
- `src/lib/assistant/compile.ts:213` if: the false side never ran: `if (known && typeof v === "string") {`
- `src/lib/assistant/compile.ts:218` ?: the true side never ran: `return typeof v === "boolean" ? (v ? 1 : 0) : v;`
- `src/lib/assistant/compile.ts:218` ?: the true side never ran: `return typeof v === "boolean" ? (v ? 1 : 0) : v;`
- `src/lib/assistant/compile.ts:218` ?: the false side never ran: `return typeof v === "boolean" ? (v ? 1 : 0) : v;`
- `src/lib/assistant/compile.ts:218` ?: the false side never ran: `return typeof v === "boolean" ? (v ? 1 : 0) : v;`
- `src/lib/assistant/compile.ts:222` if: the true side never ran: `` if (one == null) throw new CompileError(`${f.op} on ${f.field} needs a value.`); ``
- `src/lib/assistant/compile.ts:227` switch: case 7 of 12 never ran: `case "in": case "not_in": {`
- `src/lib/assistant/compile.ts:227` switch: case 8 of 12 never ran: `case "in": case "not_in": {`
- `src/lib/assistant/compile.ts:228` if: the true side never ran: `` if (!vals.length || vals.length > 50) throw new CompileError(`${f.op} on ${f.field} needs 1 to 50 va... ``
- `src/lib/assistant/compile.ts:228` if: the false side never ran: `` if (!vals.length || vals.length > 50) throw new CompileError(`${f.op} on ${f.field} needs 1 to 50 va... ``
- `src/lib/assistant/compile.ts:228` and/or: part 1 of 2 never reached: `!vals.length`
- `src/lib/assistant/compile.ts:228` and/or: part 2 of 2 never reached: `vals.length > 50)`
- `src/lib/assistant/compile.ts:229` ?: the true side never ran: `` where.push(`${r.sql} ${f.op === "in" ? "IN" : "NOT IN"} (?)`); ``
- `src/lib/assistant/compile.ts:229` ?: the false side never ran: `"NOT IN"`
- `src/lib/assistant/compile.ts:233` switch: case 9 of 12 never ran: `case "between": {`
- `src/lib/assistant/compile.ts:234` if: the true side never ran: `` if (vals.length !== 2) throw new CompileError(`between on ${f.field} needs two values.`); ``
- `src/lib/assistant/compile.ts:234` if: the false side never ran: `` if (vals.length !== 2) throw new CompileError(`between on ${f.field} needs two values.`); ``
- `src/lib/assistant/compile.ts:240` if: the true side never ran: `` if (typeof one !== "string" || !one.trim()) throw new CompileError(`contains on ${f.field} needs tex... ``
- `src/lib/assistant/compile.ts:245` switch: case 11 of 12 never ran: `` case "is_null": where.push(`${r.sql} IS NULL`); break; ``
- `src/lib/assistant/compile.ts:246` switch: case 12 of 12 never ran: `` case "not_null": where.push(`${r.sql} IS NOT NULL`); break; ``
- `src/lib/assistant/compile.ts:256` if: the true side never ran: `if (!col) continue;`
- `src/lib/assistant/compile.ts:257` and/or: part 1 of 2 never reached: `f.field === col`
- `src/lib/assistant/compile.ts:257` and/or: part 2 of 2 never reached: `` f.field.endsWith(`.${col}`) ``
- `src/lib/assistant/compile.ts:266` ?: the false side never ran: `const W = where.length ? where.join(" AND ") : "1=1";`
- `src/lib/assistant/compile.ts:267` ?: the true side never ran: `null`
- `src/lib/assistant/compile.ts:269` ?: the true side never ran: `true`
- `src/lib/assistant/compile.ts:269` ?: the true side never ran: `false`
- `src/lib/assistant/compile.ts:273` ?: the true side never ran: `"ASC"`
- `src/lib/assistant/compile.ts:275` ?: the true side never ran: `` `${q(timeDim.alias)} ASC` ``
- `src/lib/assistant/compile.ts:277` ?: the true side never ran: `LIMITS.rowsShown`
- `src/lib/assistant/compile.ts:281` ?: the false side never ran: `` ? [...dims.map((d) => `${dimSql(d)} AS ${q(d.alias)}`), ...(testExpr ? [`(${testExpr}) AS \`__test\`... ``
- `src/lib/assistant/compile.ts:282` ?: the false side never ran: `` : [...dims.map((d) => `${dimSql(d)} AS ${q(d.alias)}`), ...measures.map((m) => `${m.sql} AS ${q(m.al... ``
- `src/lib/assistant/compile.ts:292` if: the true side never ran: `if (!windowHours || !timeRef) throw new CompileError("compare = previous_period needs a relative tim...`
- `src/lib/assistant/compile.ts:298` and/or: part 2 of 2 never reached: `const pos = where.slice(0, k).reduce((a, w) => a + (w.match(/\?/g)?.length ?? 0), 0);`
- `src/lib/assistant/compile.ts:320` if: the true side never ran: `if (!user || !password) return null;`
- `src/lib/assistant/compile.ts:320` if: the false side never ran: `if (!user || !password) return null;`
- `src/lib/assistant/compile.ts:320` and/or: part 1 of 2 never reached: `!user`
- `src/lib/assistant/compile.ts:320` and/or: part 2 of 2 never reached: `!password)`
- `src/lib/assistant/compile.ts:327` ?: the true side never ran: `"select-only account"`
- `src/lib/assistant/compile.ts:327` ?: the false side never ran: `return roPool() ? "select-only account" : "read-only transaction";`
- `src/lib/assistant/compile.ts:332` and/or: part 1 of 2 never reached: `roPool()`
- `src/lib/assistant/compile.ts:332` and/or: part 2 of 2 never reached: `const pool = roPool() ?? intelPool;`
- `src/lib/assistant/compile.ts:337` if: the true side never ran: `if (!/^\s*SELECT\b/i.test(sql)) throw new CompileError("Only SELECT statements run here.");`
- `src/lib/assistant/compile.ts:337` if: the false side never ran: `if (!/^\s*SELECT\b/i.test(sql)) throw new CompileError("Only SELECT statements run here.");`
- `src/lib/assistant/compile.ts:377` and/or: part 1 of 2 never reached: `cnt?.n`
- `src/lib/assistant/compile.ts:377` and/or: part 2 of 2 never reached: `const total = Number(cnt?.n ?? 0);`
- `src/lib/assistant/compile.ts:382` if: the true side never ran: `if (!c.records && timeDim && timeDim.grain === "day") {`
- `src/lib/assistant/compile.ts:382` if: the false side never ran: `if (!c.records && timeDim && timeDim.grain === "day") {`
- `src/lib/assistant/compile.ts:382` and/or: part 1 of 3 never reached: `!c.records`
- `src/lib/assistant/compile.ts:382` and/or: part 2 of 3 never reached: `timeDim`
- `src/lib/assistant/compile.ts:382` and/or: part 3 of 3 never reached: `timeDim.grain === "day")`
- `src/lib/assistant/compile.ts:384` and/or: part 1 of 2 never reached: `span?.n`
- `src/lib/assistant/compile.ts:384` and/or: part 2 of 2 never reached: `const days = Number(span?.n ?? 0);`
- `src/lib/assistant/compile.ts:385` ?: the true side never ran: `const maxPoints = catDim ? 31 : LIMITS.pointsPerSeries;`
- `src/lib/assistant/compile.ts:385` ?: the false side never ran: `const maxPoints = catDim ? 31 : LIMITS.pointsPerSeries;`
- `src/lib/assistant/compile.ts:386` if: the true side never ran: `if (days > maxPoints) {`
- `src/lib/assistant/compile.ts:386` if: the false side never ran: `if (days > maxPoints) {`
- `src/lib/assistant/compile.ts:387` ?: the true side never ran: `"week"`
- `src/lib/assistant/compile.ts:387` ?: the false side never ran: `const grain = days / 7 <= maxPoints ? "week" : "month";`
- `src/lib/assistant/compile.ts:393` if: the true side never ran: `if (!c.records && catDim && timeDim) {`
- `src/lib/assistant/compile.ts:393` if: the false side never ran: `if (!c.records && catDim && timeDim) {`
- `src/lib/assistant/compile.ts:393` and/or: part 1 of 3 never reached: `!c.records`
- `src/lib/assistant/compile.ts:393` and/or: part 2 of 3 never reached: `catDim`
- `src/lib/assistant/compile.ts:393` and/or: part 3 of 3 never reached: `timeDim)`
- `src/lib/assistant/compile.ts:401` if: the true side never ran: `if (cats.size > LIMITS.groupsShown) {`
- `src/lib/assistant/compile.ts:401` if: the false side never ran: `if (cats.size > LIMITS.groupsShown) {`
- `src/lib/assistant/compile.ts:406` if: the true side never ran: `if (keep.has(r[catDim.alias])) { kept.push(r); continue; }`
- `src/lib/assistant/compile.ts:406` if: the false side never ran: `if (keep.has(r[catDim.alias])) { kept.push(r); continue; }`
- `src/lib/assistant/compile.ts:408` and/or: part 1 of 2 never reached: `others.get(t)`
- `src/lib/assistant/compile.ts:408` and/or: part 2 of 2 never reached: `const o = others.get(t) ?? { [timeDim.alias]: t, [catDim.alias]: "Others" };`
- `src/lib/assistant/compile.ts:409` if: the true side never ran: `...if (["count", "sum"].includes(m.fn)) o[m.alias] = Number(o[m.alias] ?? 0) + Number(r[m.alias] ?? 0);`
- `src/lib/assistant/compile.ts:409` if: the false side never ran: `...if (["count", "sum"].includes(m.fn)) o[m.alias] = Number(o[m.alias] ?? 0) + Number(r[m.alias] ?? 0);`
- `src/lib/assistant/compile.ts:409` and/or: part 1 of 2 never reached: `o[m.alias]`
- `src/lib/assistant/compile.ts:409` and/or: part 2 of 2 never reached: `for (const m of c.measures) if (["count", "sum"].includes(m.fn)) o[m.alias] = Number(o[m.alias] ?? 0...`
- `src/lib/assistant/compile.ts:409` and/or: part 1 of 2 never reached: `r[m.alias]`
- `src/lib/assistant/compile.ts:409` and/or: part 2 of 2 never reached: `for (const m of c.measures) if (["count", "sum"].includes(m.fn)) o[m.alias] = Number(o[m.alias] ?? 0...`
- `src/lib/assistant/compile.ts:417` if: the true side never ran: `` if (!c.records && catDim && total > rows.length) notes.push(`${total} groups in all; the largest ${r... ``
- `src/lib/assistant/compile.ts:417` if: the false side never ran: `` if (!c.records && catDim && total > rows.length) notes.push(`${total} groups in all; the largest ${r... ``
- `src/lib/assistant/compile.ts:417` and/or: part 1 of 3 never reached: `!c.records`
- `src/lib/assistant/compile.ts:417` and/or: part 2 of 3 never reached: `catDim`
- `src/lib/assistant/compile.ts:417` and/or: part 3 of 3 never reached: `total > rows.length)`
- `src/lib/assistant/compile.ts:418` if: the true side never ran: `` if (c.records && total > rows.length) notes.push(`${total} records match; ${rows.length} are shown.`... ``
- `src/lib/assistant/compile.ts:418` if: the false side never ran: `` if (c.records && total > rows.length) notes.push(`${total} records match; ${rows.length} are shown.`... ``
- `src/lib/assistant/compile.ts:418` and/or: part 1 of 2 never reached: `c.records`
- `src/lib/assistant/compile.ts:418` and/or: part 2 of 2 never reached: `total > rows.length)`
- `src/lib/assistant/compile.ts:421` if: the true side never ran: `if (c.previous) {`
- `src/lib/assistant/compile.ts:421` if: the false side never ran: `if (c.previous) {`
- `src/lib/assistant/compile.ts:425` and/or: part 1 of 2 never reached: `byKey.get(key(r))?.[m.alias]`
- `src/lib/assistant/compile.ts:425` and/or: part 2 of 2 never reached: `` rows = rows.map((r) => ({ ...r, ...Object.fromEntries(c.measures.map((m) => [`${m.alias}_prev`, byKe... ``
- `src/lib/assistant/compile.ts:427` and/or: part 1 of 2 never reached: `c.testData`
- `src/lib/assistant/compile.ts:427` and/or: part 2 of 2 never reached: `const testData = c.testData ?? rows.some((r) => Number(r.__test) === 1);`
- `src/lib/assistant/compile.ts:439` ?: the true side never ran: `` `DATE_FORMAT(${e}, '%Y-%m')` ``
- `src/lib/assistant/compile.ts:439` ?: the false side never ran: `` const to = grain === "month" ? `DATE_FORMAT(${e}, '%Y-%m')` : `DATE_FORMAT(DATE_SUB(DATE(${e}), INTE... ``
- `src/lib/assistant/compile.ts:440` ?: the true side never ran: `{ ...d, grain }`
- `src/lib/assistant/compile.ts:440` ?: the false side never ran: `return { ...c, sql: c.sql.split(day).join(to), dims: c.dims.map((d) => (d.time ? { ...d, grain } : d...`

### src/lib/rate-limit.ts: 60.60 %, 13 untested

- `src/lib/rate-limit.ts:15` if: the true side never ran: `for (const [k, b] of buckets) if (b.resetAt < now) buckets.delete(k);`
- `src/lib/rate-limit.ts:15` if: the false side never ran: `for (const [k, b] of buckets) if (b.resetAt < now) buckets.delete(k);`
- `src/lib/rate-limit.ts:30` if: the true side never ran: `if (buckets.size >= SWEEP_AT) sweep(now);`
- `src/lib/rate-limit.ts:52` if: the false side never ran: `if (!b || b.resetAt < Date.now()) return { allowed: true };`
- `src/lib/rate-limit.ts:52` and/or: part 2 of 2 never reached: `b.resetAt < Date.now())`
- `src/lib/rate-limit.ts:53` ?: the true side never ran: `{ allowed: false, retryAfterSeconds: Math.ceil((b.resetAt - Date.now()) / 1000) }`
- `src/lib/rate-limit.ts:53` ?: the false side never ran: `return b.count >= limit ? { allowed: false, retryAfterSeconds: Math.ceil((b.resetAt - Date.now()) / ...`
- `src/lib/rate-limit.ts:58` if: the false side never ran: `if (!b || b.resetAt < now) buckets.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });`
- `src/lib/rate-limit.ts:58` and/or: part 2 of 2 never reached: `b.resetAt < now)`
- `src/lib/rate-limit.ts:74` and/or: part 2 of 2 never reached: `const chain = (headers.get("x-forwarded-for") ?? "").split(",").map((x) => x.trim()).filter(Boolean)...`
- `src/lib/rate-limit.ts:77` and/or: part 1 of 3 never reached: `headers.get("x-real-ip")?.trim()`
- `src/lib/rate-limit.ts:77` and/or: part 2 of 3 never reached: `chain[0]`
- `src/lib/rate-limit.ts:77` and/or: part 3 of 3 never reached: `return headers.get("x-real-ip")?.trim() || chain[0] || "direct";`

### src/lib/thunai/narrate.ts: 65.62 %, 66 untested

- `src/lib/thunai/narrate.ts:32` and/or: part 2 of 2 never reached: `const s = String(status ?? "").toLowerCase();`
- `src/lib/thunai/narrate.ts:129` if: the true side never ran: `if (!code && !name) return null;`
- `src/lib/thunai/narrate.ts:129` and/or: part 2 of 2 never reached: `!name)`
- `src/lib/thunai/narrate.ts:130` and/or: part 2 of 2 never reached: `const c = code ?? "";`
- `src/lib/thunai/narrate.ts:131` if: the true side never ran: `if (c.startsWith("POL")) return { en: "the police", ta: "காவல்துறை" };`
- `src/lib/thunai/narrate.ts:132` if: the true side never ran: `if (c === "CMWSSB") return { en: "Metrowater", ta: "குடிநீர் வாரியம்" };`
- `src/lib/thunai/narrate.ts:133` if: the true side never ran: `if (c.startsWith("PWD")) return { en: "the PWD", ta: "பொதுப்பணித்துறை" };`
- `src/lib/thunai/narrate.ts:134` if: the true side never ran: `if (c === "TANGEDCO") return { en: "the electricity board", ta: "மின் வாரியம்" };`
- `src/lib/thunai/narrate.ts:136` if: the false side never ran: `if (c === "GCC-SWD") return { en: "the corporation's drains team", ta: "மாநகராட்சியின் மழைநீர் வடிகா...`
- `src/lib/thunai/narrate.ts:137` if: the true side never ran: `if (c === "GCC-SWM") return { en: "the corporation's conservancy team", ta: "மாநகராட்சியின் துப்புரவ...`
- `src/lib/thunai/narrate.ts:137` if: the false side never ran: `if (c === "GCC-SWM") return { en: "the corporation's conservancy team", ta: "மாநகராட்சியின் துப்புரவ...`
- `src/lib/thunai/narrate.ts:138` if: the true side never ran: `if (c.startsWith("GCC")) return { en: "the corporation", ta: "மாநகராட்சி" };`
- `src/lib/thunai/narrate.ts:138` if: the false side never ran: `if (c.startsWith("GCC")) return { en: "the corporation", ta: "மாநகராட்சி" };`
- `src/lib/thunai/narrate.ts:139` ?: the true side never ran: `{ en: name, ta: name }`
- `src/lib/thunai/narrate.ts:139` ?: the false side never ran: `return name ? { en: name, ta: name } : null;`
- `src/lib/thunai/narrate.ts:144` if: the true side never ran: `if (hours == null || !Number.isFinite(hours) || hours < 0) return null;`
- `src/lib/thunai/narrate.ts:160` ?: the true side never ran: `return u.startsWith("min") ? n / 60 : u.startsWith("h") ? n : u.startsWith("d") ? n * 24 : u.startsW...`
- `src/lib/thunai/narrate.ts:160` ?: the false side never ran: `return u.startsWith("min") ? n / 60 : u.startsWith("h") ? n : u.startsWith("d") ? n * 24 : u.startsW...`
- `src/lib/thunai/narrate.ts:167` if: the false side never ran: `if (m) hours = ((extra.now ?? Date.now()) - Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), N...`
- `src/lib/thunai/narrate.ts:170` and/or: part 2 of 3 never reached: `row.zoneName`
- `src/lib/thunai/narrate.ts:170` and/or: part 3 of 3 never reached: `null`
- `src/lib/thunai/narrate.ts:170` and/or: part 3 of 4 never reached: `row.place`
- `src/lib/thunai/narrate.ts:170` and/or: part 4 of 4 never reached: `what: plainWhat(row.cat, row.why ?? row.title), place: row.place ?? row.zoneName ?? null, placeTa: e...`
- `src/lib/thunai/narrate.ts:179` if: the false side never ran: `` if (/ு$/.test(word)) return `${word.slice(0, -1)}ிடம்`; ``
- `src/lib/thunai/narrate.ts:180` if: the true side never ran: `` if (/்$/.test(word)) return `${word.slice(0, -1)}ிடம்`; ``
- `src/lib/thunai/narrate.ts:180` if: the false side never ran: `` if (/்$/.test(word)) return `${word.slice(0, -1)}ிடம்`; ``
- `src/lib/thunai/narrate.ts:184` ?: the false side never ran: `const article = (s: string) => (/^(a|an|the|uncleared|standing|street|bad|people)\b/i.test(s) ? s : ...`
- `src/lib/thunai/narrate.ts:184` ?: the true side never ran: `const article = (s: string) => (/^(a|an|the|uncleared|standing|street|bad|people)\b/i.test(s) ? s : ...`
- `src/lib/thunai/narrate.ts:184` ?: the false side never ran: `const article = (s: string) => (/^(a|an|the|uncleared|standing|street|bad|people)\b/i.test(s) ? s : ...`
- `src/lib/thunai/narrate.ts:188` ?: the false side never ran: `const what = f.what ? article(f.what.en) : "an issue";`
- `src/lib/thunai/narrate.ts:192` ?: the true side never ran: `"There were"`
- `src/lib/thunai/narrate.ts:193` ?: the false side never ran: `` const first = `${was} ${what}${f.place ? ` at ${f.place}` : ""}${f.what ? "" : `, logged as ${label.... ``
- `src/lib/thunai/narrate.ts:193` ?: the false side never ran: `` `, logged as ${label.toLowerCase()}` ``
- `src/lib/thunai/narrate.ts:194` ?: the false side never ran: `` const plain = `${was} ${what}${f.place ? ` at ${f.place}` : ""}.`; ``
- `src/lib/thunai/narrate.ts:195` ?: the false side never ran: `` const ta = `${f.placeTa ? `${f.placeTa} பகுதியில் ` : ""}${f.what ? f.what.ta : "ஒரு பிரச்சினை"} இரு... ``
- `src/lib/thunai/narrate.ts:195` ?: the false side never ran: `` const ta = `${f.placeTa ? `${f.placeTa} பகுதியில் ` : ""}${f.what ? f.what.ta : "ஒரு பிரச்சினை"} இரு... ``
- `src/lib/thunai/narrate.ts:197` and/or: part 2 of 2 never reached: `` return { en: speechProblem(en, sources, [f.place ?? "", f.placeTa ?? ""]) ? `${plain} ${said.en}` : ... ``
- `src/lib/thunai/narrate.ts:197` and/or: part 2 of 2 never reached: `` return { en: speechProblem(en, sources, [f.place ?? "", f.placeTa ?? ""]) ? `${plain} ${said.en}` : ... ``
- `src/lib/thunai/narrate.ts:197` ?: the true side never ran: `` `${plain} ${said.en}` ``
- `src/lib/thunai/narrate.ts:199` ?: the false side never ran: `` const s1 = `There's ${what}${f.place ? ` at ${f.place}` : ""}${f.what ? "" : `, logged as ${label.to... ``
- `src/lib/thunai/narrate.ts:199` ?: the false side never ran: `` `, logged as ${label.toLowerCase()}` ``
- `src/lib/thunai/narrate.ts:201` ?: the false side never ran: `` const s2 = age ? `It's been open for ${age.en}${f.overdue ? ", and it's past its deadline" : ""}.` :... ``
- `src/lib/thunai/narrate.ts:201` ?: the false side never ran: `` const s2 = age ? `It's been open for ${age.en}${f.overdue ? ", and it's past its deadline" : ""}.` :... ``
- `src/lib/thunai/narrate.ts:201` ?: the true side never ran: `"It's past its deadline."`
- `src/lib/thunai/narrate.ts:201` ?: the false side never ran: `` const s2 = age ? `It's been open for ${age.en}${f.overdue ? ", and it's past its deadline" : ""}.` :... ``
- `src/lib/thunai/narrate.ts:202` ?: the false side never ran: `` const s3 = f.complaints >= 2 ? `${f.complaints} people have complained about it, so it's hitting a l... ``
- `src/lib/thunai/narrate.ts:203` ?: the false side never ran: `: f.serious ? "It's one of the serious ones." : "";`
- `src/lib/thunai/narrate.ts:204` ?: the false side never ran: `` const s4 = f.next ? `I'd ${f.next.en}${f.overdue ? " today" : ""}.` : f.who ? `I'd ask ${f.who.en} f... ``
- `src/lib/thunai/narrate.ts:204` ?: the false side never ran: `` const s4 = f.next ? `I'd ${f.next.en}${f.overdue ? " today" : ""}.` : f.who ? `I'd ask ${f.who.en} f... ``
- `src/lib/thunai/narrate.ts:204` ?: the false side never ran: `` const s4 = f.next ? `I'd ${f.next.en}${f.overdue ? " today" : ""}.` : f.who ? `I'd ask ${f.who.en} f... ``
- `src/lib/thunai/narrate.ts:206` ?: the false side never ran: `const whatTa = f.what ? f.what.ta : "ஒரு பிரச்சினை";`
- `src/lib/thunai/narrate.ts:207` ?: the false side never ran: `` const t1 = `${f.placeTa ? `${f.placeTa} பகுதியில் ` : ""}${whatTa} இருக்கிறது.`; ``
- `src/lib/thunai/narrate.ts:208` ?: the false side never ran: `` const t2 = age ? `${age.ta} தீர்க்கப்படாமல் இருக்கிறது${f.overdue ? ", கெடுவும் தாண்டிவிட்டது" : ""}... ``
- `src/lib/thunai/narrate.ts:208` ?: the false side never ran: `` const t2 = age ? `${age.ta} தீர்க்கப்படாமல் இருக்கிறது${f.overdue ? ", கெடுவும் தாண்டிவிட்டது" : ""}... ``
- `src/lib/thunai/narrate.ts:208` ?: the true side never ran: `` const t2 = age ? `${age.ta} தீர்க்கப்படாமல் இருக்கிறது${f.overdue ? ", கெடுவும் தாண்டிவிட்டது" : ""}... ``
- `src/lib/thunai/narrate.ts:208` ?: the false side never ran: `` const t2 = age ? `${age.ta} தீர்க்கப்படாமல் இருக்கிறது${f.overdue ? ", கெடுவும் தாண்டிவிட்டது" : ""}... ``
- `src/lib/thunai/narrate.ts:209` ?: the false side never ran: `` const t3 = f.complaints >= 2 ? `${f.complaints} பேர் புகார் கொடுத்திருக்கிறார்கள், நிறைய பேரைப் பாதி... ``
- `src/lib/thunai/narrate.ts:209` ?: the false side never ran: `` const t3 = f.complaints >= 2 ? `${f.complaints} பேர் புகார் கொடுத்திருக்கிறார்கள், நிறைய பேரைப் பாதி... ``
- `src/lib/thunai/narrate.ts:210` ?: the false side never ran: `` const t4 = f.next ? `${f.next.ta}${f.overdue ? ", இன்றே" : ""}.` : f.who ? `${idam(f.who.ta)} ${f.ov... ``
- `src/lib/thunai/narrate.ts:210` ?: the false side never ran: `` const t4 = f.next ? `${f.next.ta}${f.overdue ? ", இன்றே" : ""}.` : f.who ? `${idam(f.who.ta)} ${f.ov... ``
- `src/lib/thunai/narrate.ts:210` ?: the false side never ran: `` const t4 = f.next ? `${f.next.ta}${f.overdue ? ", இன்றே" : ""}.` : f.who ? `${idam(f.who.ta)} ${f.ov... ``
- `src/lib/thunai/narrate.ts:213` and/or: part 2 of 2 never reached: `const names = [f.place ?? "", f.placeTa ?? ""];`
- `src/lib/thunai/narrate.ts:213` and/or: part 2 of 2 never reached: `const names = [f.place ?? "", f.placeTa ?? ""];`
- `src/lib/thunai/narrate.ts:214` if: the true side never ran: `` if (speechProblem(en, sources, names)) return { en: [`There's ${what}${f.place ? ` at ${f.place}` : ... ``
- `src/lib/thunai/narrate.ts:214` ?: the true side never ran: `` ` at ${f.place}` ``
- `src/lib/thunai/narrate.ts:214` ?: the false side never ran: `` if (speechProblem(en, sources, names)) return { en: [`There's ${what}${f.place ? ` at ${f.place}` : ... ``

### src/lib/thunai/frame.ts: 69.93 %, 43 untested

- `src/lib/thunai/frame.ts:74` if: the true side never ran: `if (!words.length || words.length > 12) return { kind: "none" };`
- `src/lib/thunai/frame.ts:91` and/or: part 2 of 2 never reached: `return { kind: "screen", recipe: "why", slots: { zones: zones ?? [], cat: slots.cat ?? null, period:...`
- `src/lib/thunai/frame.ts:91` and/or: part 2 of 2 never reached: `"weekly"`
- `src/lib/thunai/frame.ts:95` ?: the false side never ran: `const period = MONTHLY.test(t) ? "monthly" : WEEKLY.test(t) ? "weekly" : QUARTER.test(t) ? "quarterl...`
- `src/lib/thunai/frame.ts:95` ?: the true side never ran: `"weekly"`
- `src/lib/thunai/frame.ts:95` ?: the false side never ran: `const period = MONTHLY.test(t) ? "monthly" : WEEKLY.test(t) ? "weekly" : QUARTER.test(t) ? "quarterl...`
- `src/lib/thunai/frame.ts:95` ?: the true side never ran: `"quarterly" : (`
- `src/lib/thunai/frame.ts:95` ?: the false side never ran: `const period = MONTHLY.test(t) ? "monthly" : WEEKLY.test(t) ? "weekly" : QUARTER.test(t) ? "quarterl...`
- `src/lib/thunai/frame.ts:95` and/or: part 1 of 2 never reached: `slots.period as string)`
- `src/lib/thunai/frame.ts:95` and/or: part 2 of 2 never reached: `const period = MONTHLY.test(t) ? "monthly" : WEEKLY.test(t) ? "weekly" : QUARTER.test(t) ? "quarterl...`
- `src/lib/thunai/frame.ts:96` and/or: part 2 of 2 never reached: `return { kind: "screen", recipe: "why", slots: { zones: (slots.zones as number[]) ?? [], cat: slots....`
- `src/lib/thunai/frame.ts:100` and/or: part 2 of 2 never reached: `const from = ((slots.zones as number[]) ?? []).filter((z) => !hasNewPlace.includes(z));`
- `src/lib/thunai/frame.ts:102` if: the false side never ran: `if (zones.length >= 2) return { kind: "screen", recipe: "compare", slots: { zones, cat: slots.cat ??...`
- `src/lib/thunai/frame.ts:102` and/or: part 2 of 2 never reached: `"weekly"`
- `src/lib/thunai/frame.ts:106` ?: the false side never ran: `const v = /table|டேபிள்|அட்டவணை/.test(t) ? "table" : /map|வரைபடம்/.test(t) ? "map" : "chart";`
- `src/lib/thunai/frame.ts:106` ?: the true side never ran: `"map"`
- `src/lib/thunai/frame.ts:106` ?: the false side never ran: `const v = /table|டேபிள்|அட்டவணை/.test(t) ? "table" : /map|வரைபடம்/.test(t) ? "map" : "chart";`
- `src/lib/thunai/frame.ts:111` and/or: part 2 of 2 never reached: `const period = periodIn(t) ?? (DAILY.test(t) ? "daily" : WEEKLY.test(t) ? "weekly" : MONTHLY.test(t)...`
- `src/lib/thunai/frame.ts:111` ?: the true side never ran: `"daily"`
- `src/lib/thunai/frame.ts:111` ?: the false side never ran: `const period = periodIn(t) ?? (DAILY.test(t) ? "daily" : WEEKLY.test(t) ? "weekly" : MONTHLY.test(t)...`
- `src/lib/thunai/frame.ts:111` ?: the true side never ran: `"weekly"`
- `src/lib/thunai/frame.ts:111` ?: the false side never ran: `const period = periodIn(t) ?? (DAILY.test(t) ? "daily" : WEEKLY.test(t) ? "weekly" : MONTHLY.test(t)...`
- `src/lib/thunai/frame.ts:111` ?: the true side never ran: `"monthly"`
- `src/lib/thunai/frame.ts:111` ?: the false side never ran: `const period = periodIn(t) ?? (DAILY.test(t) ? "daily" : WEEKLY.test(t) ? "weekly" : MONTHLY.test(t)...`
- `src/lib/thunai/frame.ts:111` ?: the true side never ran: `"quarterly"`
- `src/lib/thunai/frame.ts:111` ?: the false side never ran: `const period = periodIn(t) ?? (DAILY.test(t) ? "daily" : WEEKLY.test(t) ? "weekly" : MONTHLY.test(t)...`
- `src/lib/thunai/frame.ts:112` if: the false side never ran: `if (period) return { kind: "screen", recipe: last.recipe, slots: { ...slots, period }, why: "period"...`
- `src/lib/thunai/frame.ts:118` ?: the false side never ran: `["Chembarambakkam", "Puzhal", "Poondi", "Cholavaram", "Veeranam", "Red Hills"]).`
- `src/lib/thunai/frame.ts:119` if: the false side never ran: `if (named) return { kind: "screen", recipe: "readings", slots: { ...slots, name: named }, why: "new-...`
- `src/lib/thunai/frame.ts:123` if: the true side never ran: `if (last.recipe === "compare") return { kind: "screen", recipe: "compare", slots: { ...slots, zones:...`
- `src/lib/thunai/frame.ts:123` and/or: part 1 of 2 never reached: `slots.zones as number[])`
- `src/lib/thunai/frame.ts:123` and/or: part 2 of 2 never reached: `if (last.recipe === "compare") return { kind: "screen", recipe: "compare", slots: { ...slots, zones:...`
- `src/lib/thunai/frame.ts:124` ?: the true side never ran: `"cases"`
- `src/lib/thunai/frame.ts:128` ?: the true side never ran: `"cases"`
- `src/lib/thunai/frame.ts:129` if: the true side never ran: `if (short && periodIn(t) && !catIn(t)) {`
- `src/lib/thunai/frame.ts:129` and/or: part 3 of 3 never reached: `!catIn(t))`
- `src/lib/thunai/frame.ts:131` if: the true side never ran: `if (period) return { kind: "screen", recipe: last.recipe, slots: { ...slots, period }, why: "period"...`
- `src/lib/thunai/frame.ts:131` if: the false side never ran: `if (period) return { kind: "screen", recipe: last.recipe, slots: { ...slots, period }, why: "period"...`
- `src/lib/thunai/frame.ts:135` and/or: part 3 of 6 never reached: `last.recipe === "dashboard"`
- `src/lib/thunai/frame.ts:135` and/or: part 4 of 6 never reached: `last.recipe === "trend"`
- `src/lib/thunai/frame.ts:135` and/or: part 5 of 6 never reached: `last.recipe === "why"`
- `src/lib/thunai/frame.ts:135` and/or: part 6 of 6 never reached: `last.recipe === "map"))`
- `src/lib/thunai/frame.ts:139` ?: the true side never ran: `{ cat: c }`

### src/lib/security/stepup.ts: 78.57 %, 6 untested

- `src/lib/security/stepup.ts:36` and/or: part 2 of 2 never reached: `null`
- `src/lib/security/stepup.ts:40` and/or: part 2 of 2 never reached: `return signTicket("grant", { uid: s.userId, tv: Number(s.tv) || 0, act, scope, fac }, GRANT_TTL_S);`
- `src/lib/security/stepup.ts:68` ?: the true side never ran: `"an emailed code"`
- `src/lib/security/stepup.ts:68` ?: the false side never ran: `f === "email" ? "an emailed code" : f === "password" ? "the account password" : "no confirmation";`
- `src/lib/security/stepup.ts:68` ?: the true side never ran: `"the account password"`
- `src/lib/security/stepup.ts:68` ?: the false side never ran: `f === "email" ? "an emailed code" : f === "password" ? "the account password" : "no confirmation";`

### src/lib/thunai/quick.ts: 82.97 %, 63 untested

- `src/lib/thunai/quick.ts:32` ?: the false side never ran: `const at = stem.length >= 4 ? t.indexOf(stem) : -1;`
- `src/lib/thunai/quick.ts:39` if: the true side never ran: `if (at >= 0 && !hits.some((h) => h.n === z.n)) hits.push({ n: z.n, at });`
- `src/lib/thunai/quick.ts:46` if: the true side never ran: `` if (nm.length >= 4 && t.includes(` ${nm} `)) { hits.push({ n: p.zone, at: t.indexOf(` ${nm} `) }); b... ``
- `src/lib/thunai/quick.ts:50` if: the true side never ran: `if (m && +m[1] >= 1 && +m[1] <= 15 && !hits.some((h) => h.n === +m[1])) hits.push({ n: +m[1], at: m....`
- `src/lib/thunai/quick.ts:50` and/or: part 2 of 4 never reached: `if (m && +m[1] >= 1 && +m[1] <= 15 && !hits.some((h) => h.n === +m[1])) hits.push({ n: +m[1], at: m....`
- `src/lib/thunai/quick.ts:50` and/or: part 3 of 4 never reached: `if (m && +m[1] >= 1 && +m[1] <= 15 && !hits.some((h) => h.n === +m[1])) hits.push({ n: +m[1], at: m....`
- `src/lib/thunai/quick.ts:50` and/or: part 4 of 4 never reached: `!hits.some((h) => h.n === +m[1]))`
- `src/lib/thunai/quick.ts:55` if: the true side never ran: `...if (!hits.some((h) => h.n === n)) hits.push({ n, at: t.length });`
- `src/lib/thunai/quick.ts:66` if: the true side never ran: `if (nm.length < 4) continue;`
- `src/lib/thunai/quick.ts:89` if: the true side never ran: `if (has(t, ["serious", "critical", "urgent", "danger", "dangerous", "கடுமையான", "கடுமை", "அவசர", "se...`
- `src/lib/thunai/quick.ts:96` if: the true side never ran: `if (has(t, ["quarter", "3 months", "90 days", "காலாண்டு"])) return "quarterly";`
- `src/lib/thunai/quick.ts:204` and/or: part 6 of 6 never reached: `const isPrice = (t: string) => has(t, PRICE) || (has(t, PRICE_WEAK) && (VEG.test(t) || MARKET.test(t...`
- `src/lib/thunai/quick.ts:211` if: the true side never ran: `if (SUBJECTS.test(text.toLowerCase())) return "other-subject";`
- `src/lib/thunai/quick.ts:213` if: the true side never ran: `if (MAPISH.test(t) && !has(t, ON_MAP)) return "map-word";`
- `src/lib/thunai/quick.ts:213` and/or: part 2 of 2 never reached: `!has(t, ON_MAP))`
- `src/lib/thunai/quick.ts:214` if: the true side never ran: `if (NEARBY.test(t) && !FACILITY.test(t)) return "nearby-word";`
- `src/lib/thunai/quick.ts:220` if: the true side never ran: `if (shapes >= 2) return "two-questions";`
- `src/lib/thunai/quick.ts:241` if: the true side never ran: `if (t.trim().length < 3) return null;`
- `src/lib/thunai/quick.ts:249` and/or: part 2 of 2 never reached: `const zoneWords = zones.flatMap((n) => [...(ZONES[n]?.en ?? []), ...(ZONES[n]?.ta ?? []), w.zones.fi...`
- `src/lib/thunai/quick.ts:249` and/or: part 2 of 2 never reached: `const zoneWords = zones.flatMap((n) => [...(ZONES[n]?.en ?? []), ...(ZONES[n]?.ta ?? []), w.zones.fi...`
- `src/lib/thunai/quick.ts:249` and/or: part 2 of 2 never reached: `const zoneWords = zones.flatMap((n) => [...(ZONES[n]?.en ?? []), ...(ZONES[n]?.ta ?? []), w.zones.fi...`
- `src/lib/thunai/quick.ts:253` if: the false side never ran: `if (!o.noBail) return null;`
- `src/lib/thunai/quick.ts:263` and/or: part 2 of 2 never reached: `"weekly"`
- `src/lib/thunai/quick.ts:264` if: the true side never ran: `if (has(t, ON_MAP) && !cat && !sev && !has(t, ["hotspot", "hotspots", "severe"])) return null;`
- `src/lib/thunai/quick.ts:264` and/or: part 2 of 4 never reached: `!cat`
- `src/lib/thunai/quick.ts:264` and/or: part 3 of 4 never reached: `!sev`
- `src/lib/thunai/quick.ts:264` and/or: part 4 of 4 never reached: `!has(t, ["hotspot", "hotspots", "severe"]))`
- `src/lib/thunai/quick.ts:265` if: the true side never ran: `if (has(t, ON_MAP) && (cat || sev || has(t, ["hotspot", "hotspots", "severe"]))) return { recipe: "m...`
- `src/lib/thunai/quick.ts:265` and/or: part 2 of 4 never reached: `cat`
- `src/lib/thunai/quick.ts:265` and/or: part 3 of 4 never reached: `sev`
- `src/lib/thunai/quick.ts:265` and/or: part 4 of 4 never reached: `has(t, ["hotspot", "hotspots", "severe"])))`
- `src/lib/thunai/quick.ts:265` ?: the true side never ran: `"hotspots"`
- `src/lib/thunai/quick.ts:265` ?: the false side never ran: `sev ? "severe" : "cases"`
- `src/lib/thunai/quick.ts:265` ?: the true side never ran: `"severe"`
- `src/lib/thunai/quick.ts:265` ?: the false side never ran: `"cases"`
- `src/lib/thunai/quick.ts:265` and/or: part 1 of 2 never reached: `period`
- `src/lib/thunai/quick.ts:265` and/or: part 2 of 2 never reached: `"weekly"`
- `src/lib/thunai/quick.ts:273` if: the true side never ran: `if (has(t, COMPARE) && zones.length >= 2 && (has(t, AIR) || has(t, LAKE))) return { recipe: "compare...`
- `src/lib/thunai/quick.ts:273` and/or: part 2 of 4 never reached: `zones.length >= 2 && (`
- `src/lib/thunai/quick.ts:273` and/or: part 3 of 4 never reached: `has(t, AIR)`
- `src/lib/thunai/quick.ts:273` and/or: part 4 of 4 never reached: `has(t, LAKE)))`
- `src/lib/thunai/quick.ts:273` and/or: part 1 of 2 never reached: `period`
- `src/lib/thunai/quick.ts:273` and/or: part 2 of 2 never reached: `"weekly"`
- `src/lib/thunai/quick.ts:274` and/or: part 2 of 2 never reached: `null`
- `src/lib/thunai/quick.ts:274` ?: the false side never ran: `null`
- `src/lib/thunai/quick.ts:278` if: the true side never ran: `if (isComparing(t) && zones.length >= 2) return { recipe: "compare", slots: { zones: zones.slice(0, ...`
- `src/lib/thunai/quick.ts:278` and/or: part 2 of 2 never reached: `zones.length >= 2)`
- `src/lib/thunai/quick.ts:278` and/or: part 1 of 2 never reached: `period`
- `src/lib/thunai/quick.ts:278` and/or: part 2 of 2 never reached: `"weekly"`
- `src/lib/thunai/quick.ts:280` if: the true side never ran: `if (isComparing(t)) return null;`
- `src/lib/thunai/quick.ts:282` ?: the true side never ran: `"zone"`
- `src/lib/thunai/quick.ts:283` and/or: part 2 of 2 never reached: `"monthly"`
- `src/lib/thunai/quick.ts:284` ?: the true side never ran: `"zone_severe"`
- `src/lib/thunai/quick.ts:284` ?: the true side never ran: `"bottom"`
- `src/lib/thunai/quick.ts:284` and/or: part 2 of 2 never reached: `"weekly"`
- `src/lib/thunai/quick.ts:285` if: the true side never ran: `if (has(t, RANK) && has(t, ["department", "departments", "dept", "துறை", "துறைகள்"])) return { recip...`
- `src/lib/thunai/quick.ts:285` and/or: part 2 of 2 never reached: `has(t, ["department", "departments", "dept", "துறை", "துறைகள்"]))`
- `src/lib/thunai/quick.ts:285` and/or: part 1 of 2 never reached: `Number(/ (\d{1,2}) /.exec(t)?.[1])`
- `src/lib/thunai/quick.ts:285` and/or: part 2 of 2 never reached: `if (has(t, RANK) && has(t, ["department", "departments", "dept", "துறை", "துறைகள்"])) return { recip...`
- `src/lib/thunai/quick.ts:285` and/or: part 1 of 2 never reached: `period`
- `src/lib/thunai/quick.ts:285` and/or: part 2 of 2 never reached: `"weekly"`
- `src/lib/thunai/quick.ts:286` and/or: part 3 of 3 never reached: `sev))`
- `src/lib/thunai/quick.ts:286` and/or: part 2 of 2 never reached: `"daily"`

### src/lib/thunai/speechcheck.ts: 86.66 %, 2 untested

- `src/lib/thunai/speechcheck.ts:49` if: the true side never ran: `` if (l) return `label: ${l}`; ``
- `src/lib/thunai/speechcheck.ts:51` ?: the true side never ran: `` `copied: "${c}"` ``

### src/lib/thunai/numbergate.ts: 87.50 %, 8 untested

- `src/lib/thunai/numbergate.ts:59` if: the true side never ran: `if (!Number.isFinite(base)) continue;`
- `src/lib/thunai/numbergate.ts:61` ?: the false side never ran: `const mult = m[4] ? 1000 : !scale ? 1 : /lakh|லட்சம்/.test(scale) ? 100_000 : /crore|கோடி/.test(scal...`
- `src/lib/thunai/numbergate.ts:61` ?: the true side never ran: `1000`
- `src/lib/thunai/numbergate.ts:61` ?: the false side never ran: `const mult = m[4] ? 1000 : !scale ? 1 : /lakh|லட்சம்/.test(scale) ? 100_000 : /crore|கோடி/.test(scal...`
- `src/lib/thunai/numbergate.ts:68` and/or: part 2 of 2 never reached: `if (w === "double" && /^[\s-]*(check|click|tap)/i.test(t.slice((m.index ?? 0) + w.length))) continue...`
- `src/lib/thunai/numbergate.ts:78` if: the true side never ran: `if (seenWord.has(m[0])) continue;`
- `src/lib/thunai/numbergate.ts:95` ?: the false side never ran: `const n = typeof v === "number" ? v : Number(String(v).replace(/[,%\s]/g, ""));`
- `src/lib/thunai/numbergate.ts:96` if: the true side never ran: `if (!Number.isFinite(n)) continue;`

### src/lib/collector/effective.ts: 90.00 %, 1 untested

- `src/lib/collector/effective.ts:27` and/or: part 2 of 2 never reached: `return e ? { open: e.open, status: e.status } : { open: Number(isOpen) === 1 ? 1 : 0, status: String...`

### src/lib/netsafe.ts: 91.42 %, 12 untested

- `src/lib/netsafe.ts:30` and/or: part 15 of 19 never reached: `|| (a === 100 && b >= 64 && b <= 127) || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === ...`
- `src/lib/netsafe.ts:30` and/or: part 17 of 19 never reached: `|| (a === 100 && b >= 64 && b <= 127) || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === ...`
- `src/lib/netsafe.ts:30` and/or: part 18 of 19 never reached: `|| (a === 100 && b >= 64 && b <= 127) || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === ...`
- `src/lib/netsafe.ts:38` if: the true side never ran: `if (!net.isIPv4(dotted[1])) return null;`
- `src/lib/netsafe.ts:43` if: the true side never ran: `if (halves.length > 2) return null;`
- `src/lib/netsafe.ts:47` if: the true side never ran: `if (fill < 0) return null;`
- `src/lib/netsafe.ts:72` and/or: part 6 of 6 never reached: `|| (top === 0x2001 && g[1] === 0x0db8); // documentation`
- `src/lib/netsafe.ts:98` and/or: part 2 of 2 never reached: `sysLookup)(`
- `src/lib/netsafe.ts:100` if: the true side never ran: `` if (!addrs.length) throw new UnsafeUrlError(`The site ${host} could not be found (DNS).`, "dns"); ``
- `src/lib/netsafe.ts:145` if: the true side never ran: `if (o.stopAtRedirect) return { res, url: next.toString(), buf: Buffer.alloc(0), truncated: false };`
- `src/lib/netsafe.ts:147` if: the true side never ran: `if (res.status === 303 || ((res.status === 301 || res.status === 302) && method === "POST")) { metho...`
- `src/lib/netsafe.ts:163` if: the true side never ran: `if (o.onTooLarge) throw o.onTooLarge();`

### src/lib/thunai/entities.ts: 92.09 %, 28 untested

- `src/lib/thunai/entities.ts:93` and/or: part 2 of 2 never reached: `const said = (DEPT_ALIASES[d.code] ?? []).some((a) => a.toLowerCase() === suffix) || initials(d.name...`
- `src/lib/thunai/entities.ts:94` and/or: part 2 of 2 never reached: `add(d.code, "dept", d.name, DEPT_TA[d.code] ?? null, [d.name, d.code.toLowerCase(), initials(d.name)...`
- `src/lib/thunai/entities.ts:103` and/or: part 2 of 2 never reached: `` for (const z of w.zones) add(`ZONE-${z.n}`, "zone", z.name, z.ta ?? null, [z.name, `zone ${z.n}`, ..... ``
- `src/lib/thunai/entities.ts:103` and/or: part 2 of 2 never reached: `` for (const z of w.zones) add(`ZONE-${z.n}`, "zone", z.name, z.ta ?? null, [z.name, `zone ${z.n}`, ..... ``
- `src/lib/thunai/entities.ts:108` and/or: part 2 of 2 never reached: `for (const t of w.taluks) for (const n of [t.name, t.ta ?? ""]) for (const x of /[஀-௿]/.test(n) ? to...`
- `src/lib/thunai/entities.ts:153` if: the true side never ran: `if (scored.size > 50_000) scored.clear();`
- `src/lib/thunai/entities.ts:175` if: the true side never ran: `if (reg.near.size > 5000) reg.near.clear();`
- `src/lib/thunai/entities.ts:188` if: the true side never ran: `if (reg.seen.size > 5000) reg.seen.clear();`
- `src/lib/thunai/entities.ts:257` and/or: part 2 of 2 never reached: `const head = heads[0]?.x ?? (near ? near.aliases[0]?.[near.aliases[0].length - 1] ?? "" : "");`
- `src/lib/thunai/entities.ts:257` ?: the false side never ran: `const head = heads[0]?.x ?? (near ? near.aliases[0]?.[near.aliases[0].length - 1] ?? "" : "");`
- `src/lib/thunai/entities.ts:283` if: the true side never ran: `if (other && top.e.kind !== "zone" && /\b(and|or|with|vs|versus|matrum)\b|&|,|மற்றும்/i.test(text)) ...`
- `src/lib/thunai/entities.ts:286` if: the true side never ran: `if (rival && top.via !== "exact" && rival.via !== "exact") return { kind: "ambiguous", options: [top...`
- `src/lib/thunai/entities.ts:286` and/or: part 3 of 3 never reached: `rival.via !== "exact")`
- `src/lib/thunai/entities.ts:295` and/or: part 1 of 2 never reached: `ORGS[org]?.name`
- `src/lib/thunai/entities.ts:295` and/or: part 2 of 2 never reached: `export const orgName = (org: string) => ORGS[org]?.name ?? org;`
- `src/lib/thunai/entities.ts:322` and/or: part 2 of 2 never reached: `near.name`
- `src/lib/thunai/entities.ts:324` if: the true side never ran: `if (r.kind === "ambiguous") {`
- `src/lib/thunai/entities.ts:327` and/or: part 1 of 2 never reached: `` text: { en: `Did you mean ${a.name} or ${b.name}?`, ta: `${a.ta ?? a.name} அல்லது ${b.ta ?? b.name}?... ``
- `src/lib/thunai/entities.ts:327` and/or: part 2 of 2 never reached: `a.name`
- `src/lib/thunai/entities.ts:327` and/or: part 1 of 2 never reached: `` text: { en: `Did you mean ${a.name} or ${b.name}?`, ta: `${a.ta ?? a.name} அல்லது ${b.ta ?? b.name}?... ``
- `src/lib/thunai/entities.ts:327` and/or: part 2 of 2 never reached: `b.name`
- `src/lib/thunai/entities.ts:334` and/or: part 2 of 2 never reached: `e.name`
- `src/lib/thunai/entities.ts:335` if: the true side never ran: `if (r.conf < 0.8) return { kind: "clarify", conf: r.conf, via: r.via, options: [{ label: e.name, req...`
- `src/lib/thunai/entities.ts:336` and/or: part 1 of 2 never reached: `` text: { en: `I heard "${r.heard}". Did you mean ${e.name}?`, ta: `"${r.heard}" என்று கேட்டேன். ${e.t... ``
- `src/lib/thunai/entities.ts:336` and/or: part 2 of 2 never reached: `e.name`
- `src/lib/thunai/entities.ts:340` ?: the true side never ran: `[zone]`
- `src/lib/thunai/entities.ts:343` ?: the true side never ran: `"weekly"`
- `src/lib/thunai/entities.ts:343` ?: the true side never ran: `"monthly"`

### src/lib/csv.ts: 92.30 %, 1 untested

- `src/lib/csv.ts:7` ?: the true side never ran: `if (v == null) return always ? '""' : "";`

### src/lib/thunai/injection.ts: 94.44 %, 1 untested

- `src/lib/thunai/injection.ts:34` if: the true side never ran: `if (depth > 6 || out.length > 400) return;`

### src/lib/thunai/privacy.ts: 95.83 %, 4 untested

- `src/lib/thunai/privacy.ts:52` if: the true side never ran: `if (/\bcaller\b.*\b(mobile|number)\b|\b(pugar|complaint)\s+kuduth|yaaru\s+pugar/i.test(t) && /(per|p...`
- `src/lib/thunai/privacy.ts:52` and/or: part 2 of 2 never reached: `/(per|peru|address|number|enna|kuduthadhu|pannadhu)/i.test(t))`
- `src/lib/thunai/privacy.ts:118` if: the true side never ran: `if (depth > 8) return v;`
- `src/lib/thunai/privacy.ts:143` ?: the true side never ran: `(n: string) => h.dataset!(n).then((r) => redact(r))`

### src/lib/thunai/outside.ts: 100.00 %, 0 untested

None.
