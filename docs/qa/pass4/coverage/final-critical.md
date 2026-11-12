# Coverage of the critical modules: final

Measured with the default test suite only (`vitest.config.ts`). Tests in `tests/qa/pass4/`, the live tests and the browser tests are not counted.

- Commit: `b9725eab902ce5f2aeda28e5722d595b764554d7`, with 0 changes under src not committed
- Tests: 3148 passed, 0 failed, 13 skipped, in 206 files
- Tool: vitest 3.2.7 with @vitest/coverage-v8 3.2.7, AST-aware remapping (real if, ?:, and/or, switch and default-value branches)
- Every part of an and/or chain counts as a branch, and so does each side of an if, even when the if has no else
- Figures made without AST-aware remapping cannot be compared with these: that mode counts far fewer branches, and a file whose functions no test calls can show 100 %
- Command: `npx vitest run --coverage --coverage.provider=v8 --coverage.reporter=json --coverage.reporter=json-summary --coverage.include=src/** --coverage.experimentalAstAwareRemapping=true --coverage.reportOnFailure=true --coverage.reportsDirectory=coverage/final --reporter=default --reporter=json --outputFile.json=coverage/final/vitest-results.json`

## Where each module stands against 85 %

10 of 17 modules meet 85 %. Together: 1859 of 2285 branches, 81.36 %. Worst first.

| Module | Branches | Branch % | Against 85 % | Branches to add | Functions % | Note |
|---|---|---|---|---|---|---|
| `src/lib/collector/guard.ts` | 0 of 4 | 0.00 % | below | 4 | 0.00 % | No test loads this file |
| `src/lib/officer/guard.ts` | 1 of 18 | 5.55 % | below | 15 | 20.00 % |  |
| `src/lib/assistant/compile.ts` | 123 of 259 | 47.49 % | below | 98 | 58.46 % |  |
| `src/lib/thunai/narrate.ts` | 143 of 206 | 69.41 % | below | 33 | 85.71 % |  |
| `src/lib/thunai/frame.ts` | 105 of 148 | 70.94 % | below | 21 | 100.00 % |  |
| `src/lib/rate-limit.ts` | 26 of 33 | 78.78 % | below | 3 | 87.50 % |  |
| `src/lib/security/stepup.ts` | 24 of 30 | 80.00 % | below | 2 | 85.71 % |  |
| `src/lib/thunai/speechcheck.ts` | 13 of 15 | 86.66 % | met | 0 | 100.00 % |  |
| `src/lib/thunai/quick.ts` | 444 of 508 | 87.40 % | met | 0 | 100.00 % |  |
| `src/lib/thunai/privacy.ts` | 152 of 169 | 89.94 % | met | 0 | 65.62 % |  |
| `src/lib/thunai/numbergate.ts` | 89 of 98 | 90.81 % | met | 0 | 100.00 % |  |
| `src/lib/netsafe.ts` | 128 of 140 | 91.42 % | met | 0 | 82.35 % |  |
| `src/lib/csv.ts` | 12 of 13 | 92.30 % | met | 0 | 100.00 % |  |
| `src/lib/thunai/entities.ts` | 532 of 575 | 92.52 % | met | 0 | 90.00 % |  |
| `src/lib/thunai/injection.ts` | 18 of 19 | 94.73 % | met | 0 | 100.00 % |  |
| `src/lib/thunai/outside.ts` | 36 of 37 | 97.29 % | met | 0 | 100.00 % |  |
| `src/lib/collector/effective.ts` | 13 of 13 | 100.00 % | met | 0 | 100.00 % |  |

Every named module was found at the path in `tests/qa/pass4/critical-modules.json`. None has moved.

Similar names that are not counted:

- `src/lib/assistant/guard.ts`: the Ask District IQ question guard, not the collector or officer guard
- `src/lib/thunai/devguard.ts`: not named in the plan
- `src/components/collector/app/thunai/guards.ts`: browser-side checks, not the collector guard in src/lib/collector
- `src/lib/collector/onboard.ts`: has a small local safeFetch that only calls netsafe's safeFetch
- `src/lib/studio/fetchurl.ts`: Data Studio's download code, which calls netsafe's safeFetch

## Code files under src with no figure (11)

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
- `src/lib/thunai/english.hash.d.mts`

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

### src/lib/assistant/compile.ts: 47.49 %, 136 untested

- `src/lib/assistant/compile.ts:109` if: the true side never ran: `` if (!ALIAS.test(pq.id.toLowerCase())) throw new CompileError(`Query id "${pq.id}" must be a short lo... ``
- `src/lib/assistant/compile.ts:132` if: the true side never ran: `` if (!other) throw new CompileError(`Table "${t}" (${purpose}) is not in the catalog.`); ``
- `src/lib/assistant/compile.ts:136` if: the false side never ran: `if (!j) {`
- `src/lib/assistant/compile.ts:140` if: the false side never ran: `` if (fwd) j = { table: other, alias, on: `b.${q(fwd.name)} = ${alias}.${q(fwd.join!.split(".")[1])}` ... ``
- `src/lib/assistant/compile.ts:141` if: the true side never ran: `` ...if (back) j = { table: other, alias, on: `${alias}.${q(back.name)} = b.${q(back.join!.split(".")[1])... ``
- `src/lib/assistant/compile.ts:141` if: the false side never ran: `` ...if (back) j = { table: other, alias, on: `${alias}.${q(back.name)} = b.${q(back.join!.split(".")[1])... ``
- `src/lib/assistant/compile.ts:148` if: the true side never ran: `if (pq.measures.length === 0 && pq.dimensions.length === 0) throw new CompileError("Select at least ...`
- `src/lib/assistant/compile.ts:149` if: the true side never ran: `if (pq.dimensions.filter((d) => !d.grain).length > LIMITS.dimensionsPerQuery || pq.dimensions.length...`
- `src/lib/assistant/compile.ts:156` if: the true side never ran: `` if (used.has(x)) throw new CompileError(`Alias "${a}" is used twice.`); ``
- `src/lib/assistant/compile.ts:164` if: the true side never ran: `` if (["geo"].includes(r.col.role)) throw new CompileError(`Cannot group by ${d.field}.`); ``
- `src/lib/assistant/compile.ts:166` if: the true side never ran: `` if (d.grain && !time) throw new CompileError(`A grain (${d.grain}) only applies to a date or time co... ``
- `src/lib/assistant/compile.ts:166` and/or: part 2 of 2 never reached: `!time)`
- `src/lib/assistant/compile.ts:167` ?: the true side never ran: `d.grain ?? "day"`
- `src/lib/assistant/compile.ts:167` and/or: part 1 of 2 never reached: `d.grain`
- `src/lib/assistant/compile.ts:167` and/or: part 2 of 2 never reached: `"day"`
- `src/lib/assistant/compile.ts:170` ?: the false side never ran: `` !d.time ? d.expr : grain === "month" ? `DATE_FORMAT(${d.expr}, '%Y-%m')` ``
- `src/lib/assistant/compile.ts:170` ?: the true side never ran: `` !d.time ? d.expr : grain === "month" ? `DATE_FORMAT(${d.expr}, '%Y-%m')` ``
- `src/lib/assistant/compile.ts:171` ?: the false side never ran: `` : grain === "week" ? `DATE_FORMAT(DATE_SUB(DATE(${d.expr}), INTERVAL WEEKDAY(${d.expr}) DAY), '%Y-%m... ``
- `src/lib/assistant/compile.ts:171` ?: the true side never ran: `` `DATE_FORMAT(DATE_SUB(DATE(${d.expr}), INTERVAL WEEKDAY(${d.expr}) DAY), '%Y-%m-%d')` ``
- `src/lib/assistant/compile.ts:171` ?: the false side never ran: `` : grain === "week" ? `DATE_FORMAT(DATE_SUB(DATE(${d.expr}), INTERVAL WEEKDAY(${d.expr}) DAY), '%Y-%m... ``
- `src/lib/assistant/compile.ts:177` if: the true side never ran: `` if (!m.field) throw new CompileError(`${m.fn} needs a field.`); ``
- `src/lib/assistant/compile.ts:179` if: the true side never ran: `` if (m.fn === "count") return { alias, fn: m.fn, col: r.col, sql: `COUNT(${r.sql})` }; ``
- `src/lib/assistant/compile.ts:180` if: the true side never ran: `` if (m.fn === "count_distinct") return { alias, fn: m.fn, col: r.col, sql: `COUNT(DISTINCT ${r.sql})`... ``
- `src/lib/assistant/compile.ts:181` if: the false side never ran: `` if (!NUMERIC.test(r.col.type) || !["measure", "flag"].includes(r.col.role)) throw new CompileError(`... ``
- `src/lib/assistant/compile.ts:181` and/or: part 2 of 2 never reached: `!["measure", "flag"].includes(r.col.role))`
- `src/lib/assistant/compile.ts:190` if: the true side never ran: `if (!t.cap) return;`
- `src/lib/assistant/compile.ts:202` if: the true side never ran: `` if (!f) throw new CompileError(`${base.name} has no time column for a time range.`); ``
- `src/lib/assistant/compile.ts:204` if: the true side never ran: `` if (!isTimeType(timeRef.col.type)) throw new CompileError(`${f} is not a date or time column.`); ``
- `src/lib/assistant/compile.ts:205` if: the false side never ran: `if (tr.mode === "relative") {`
- `src/lib/assistant/compile.ts:207` if: the true side never ran: `if (!tr.unit || !Number.isFinite(n) || n < 1 || n * HOURS[tr.unit] > 24 * 400) throw new CompileErro...`
- `src/lib/assistant/compile.ts:212` if: the true side never ran: `if (!tr.from || !DATE.test(tr.from)) throw new CompileError("from must be a date (YYYY-MM-DD).");`
- `src/lib/assistant/compile.ts:212` if: the false side never ran: `if (!tr.from || !DATE.test(tr.from)) throw new CompileError("from must be a date (YYYY-MM-DD).");`
- `src/lib/assistant/compile.ts:212` and/or: part 1 of 2 never reached: `!tr.from`
- `src/lib/assistant/compile.ts:212` and/or: part 2 of 2 never reached: `!DATE.test(tr.from))`
- `src/lib/assistant/compile.ts:213` if: the true side never ran: `if (tr.mode === "between" && (!tr.to || !DATE.test(tr.to))) throw new CompileError("to must be a dat...`
- `src/lib/assistant/compile.ts:213` if: the false side never ran: `if (tr.mode === "between" && (!tr.to || !DATE.test(tr.to))) throw new CompileError("to must be a dat...`
- `src/lib/assistant/compile.ts:213` and/or: part 1 of 3 never reached: `tr.mode === "between" && (`
- `src/lib/assistant/compile.ts:213` and/or: part 2 of 3 never reached: `if (tr.mode === "between" && (!tr.to || !DATE.test(tr.to))) throw new CompileError("to must be a dat...`
- `src/lib/assistant/compile.ts:213` and/or: part 3 of 3 never reached: `!DATE.test(tr.to)))`
- `src/lib/assistant/compile.ts:215` ?: the true side never ran: `` `${tr.to!.slice(0, 10)} 23:59:59` ``
- `src/lib/assistant/compile.ts:215` ?: the false side never ran: `asOf`
- `src/lib/assistant/compile.ts:225` if: the false side never ran: `if (known && typeof v === "string") {`
- `src/lib/assistant/compile.ts:230` ?: the true side never ran: `return typeof v === "boolean" ? (v ? 1 : 0) : v;`
- `src/lib/assistant/compile.ts:230` ?: the true side never ran: `return typeof v === "boolean" ? (v ? 1 : 0) : v;`
- `src/lib/assistant/compile.ts:230` ?: the false side never ran: `return typeof v === "boolean" ? (v ? 1 : 0) : v;`
- `src/lib/assistant/compile.ts:230` ?: the false side never ran: `return typeof v === "boolean" ? (v ? 1 : 0) : v;`
- `src/lib/assistant/compile.ts:234` if: the true side never ran: `` if (one == null) throw new CompileError(`${f.op} on ${f.field} needs a value.`); ``
- `src/lib/assistant/compile.ts:239` switch: case 7 of 12 never ran: `case "in": case "not_in": {`
- `src/lib/assistant/compile.ts:239` switch: case 8 of 12 never ran: `case "in": case "not_in": {`
- `src/lib/assistant/compile.ts:240` if: the true side never ran: `` if (!vals.length || vals.length > 50) throw new CompileError(`${f.op} on ${f.field} needs 1 to 50 va... ``
- `src/lib/assistant/compile.ts:240` if: the false side never ran: `` if (!vals.length || vals.length > 50) throw new CompileError(`${f.op} on ${f.field} needs 1 to 50 va... ``
- `src/lib/assistant/compile.ts:240` and/or: part 1 of 2 never reached: `!vals.length`
- `src/lib/assistant/compile.ts:240` and/or: part 2 of 2 never reached: `vals.length > 50)`
- `src/lib/assistant/compile.ts:241` ?: the true side never ran: `` where.push(`${r.sql} ${f.op === "in" ? "IN" : "NOT IN"} (?)`); ``
- `src/lib/assistant/compile.ts:241` ?: the false side never ran: `"NOT IN"`
- `src/lib/assistant/compile.ts:245` switch: case 9 of 12 never ran: `case "between": {`
- `src/lib/assistant/compile.ts:246` if: the true side never ran: `` if (vals.length !== 2) throw new CompileError(`between on ${f.field} needs two values.`); ``
- `src/lib/assistant/compile.ts:246` if: the false side never ran: `` if (vals.length !== 2) throw new CompileError(`between on ${f.field} needs two values.`); ``
- `src/lib/assistant/compile.ts:252` if: the true side never ran: `` if (typeof one !== "string" || !one.trim()) throw new CompileError(`contains on ${f.field} needs tex... ``
- `src/lib/assistant/compile.ts:257` switch: case 11 of 12 never ran: `` case "is_null": where.push(`${r.sql} IS NULL`); break; ``
- `src/lib/assistant/compile.ts:258` switch: case 12 of 12 never ran: `` case "not_null": where.push(`${r.sql} IS NOT NULL`); break; ``
- `src/lib/assistant/compile.ts:268` if: the true side never ran: `if (!col) continue;`
- `src/lib/assistant/compile.ts:269` and/or: part 1 of 2 never reached: `f.field === col`
- `src/lib/assistant/compile.ts:269` and/or: part 2 of 2 never reached: `` f.field.endsWith(`.${col}`) ``
- `src/lib/assistant/compile.ts:278` ?: the false side never ran: `const W = where.length ? where.join(" AND ") : "1=1";`
- `src/lib/assistant/compile.ts:279` ?: the true side never ran: `null`
- `src/lib/assistant/compile.ts:281` ?: the true side never ran: `true`
- `src/lib/assistant/compile.ts:281` ?: the true side never ran: `false`
- `src/lib/assistant/compile.ts:285` ?: the true side never ran: `"ASC"`
- `src/lib/assistant/compile.ts:287` ?: the true side never ran: `` `${q(timeDim.alias)} ASC` ``
- `src/lib/assistant/compile.ts:289` ?: the true side never ran: `LIMITS.rowsShown`
- `src/lib/assistant/compile.ts:293` ?: the false side never ran: `` ? [...dims.map((d) => `${dimSql(d)} AS ${q(d.alias)}`), ...(testExpr ? [`(${testExpr}) AS \`__test\`... ``
- `src/lib/assistant/compile.ts:294` ?: the false side never ran: `` : [...dims.map((d) => `${dimSql(d)} AS ${q(d.alias)}`), ...measures.map((m) => `${m.sql} AS ${q(m.al... ``
- `src/lib/assistant/compile.ts:304` if: the true side never ran: `if (!windowHours || !timeRef) throw new CompileError("compare = previous_period needs a relative tim...`
- `src/lib/assistant/compile.ts:310` and/or: part 2 of 2 never reached: `const pos = where.slice(0, k).reduce((a, w) => a + (w.match(/\?/g)?.length ?? 0), 0);`
- `src/lib/assistant/compile.ts:332` if: the true side never ran: `if (!user || !password) return null;`
- `src/lib/assistant/compile.ts:332` if: the false side never ran: `if (!user || !password) return null;`
- `src/lib/assistant/compile.ts:332` and/or: part 1 of 2 never reached: `!user`
- `src/lib/assistant/compile.ts:332` and/or: part 2 of 2 never reached: `!password)`
- `src/lib/assistant/compile.ts:339` ?: the true side never ran: `"select-only account"`
- `src/lib/assistant/compile.ts:339` ?: the false side never ran: `return roPool() ? "select-only account" : "read-only transaction";`
- `src/lib/assistant/compile.ts:344` and/or: part 1 of 2 never reached: `roPool()`
- `src/lib/assistant/compile.ts:344` and/or: part 2 of 2 never reached: `const pool = roPool() ?? intelPool;`
- `src/lib/assistant/compile.ts:349` if: the true side never ran: `if (!/^\s*SELECT\b/i.test(sql)) throw new CompileError("Only SELECT statements run here.");`
- `src/lib/assistant/compile.ts:349` if: the false side never ran: `if (!/^\s*SELECT\b/i.test(sql)) throw new CompileError("Only SELECT statements run here.");`
- `src/lib/assistant/compile.ts:389` and/or: part 1 of 2 never reached: `cnt?.n`
- `src/lib/assistant/compile.ts:389` and/or: part 2 of 2 never reached: `const total = Number(cnt?.n ?? 0);`
- `src/lib/assistant/compile.ts:394` if: the true side never ran: `if (!c.records && timeDim && timeDim.grain === "day") {`
- `src/lib/assistant/compile.ts:394` if: the false side never ran: `if (!c.records && timeDim && timeDim.grain === "day") {`
- `src/lib/assistant/compile.ts:394` and/or: part 1 of 3 never reached: `!c.records`
- `src/lib/assistant/compile.ts:394` and/or: part 2 of 3 never reached: `timeDim`
- `src/lib/assistant/compile.ts:394` and/or: part 3 of 3 never reached: `timeDim.grain === "day")`
- `src/lib/assistant/compile.ts:396` and/or: part 1 of 2 never reached: `span?.n`
- `src/lib/assistant/compile.ts:396` and/or: part 2 of 2 never reached: `const days = Number(span?.n ?? 0);`
- `src/lib/assistant/compile.ts:397` ?: the true side never ran: `const maxPoints = catDim ? 31 : LIMITS.pointsPerSeries;`
- `src/lib/assistant/compile.ts:397` ?: the false side never ran: `const maxPoints = catDim ? 31 : LIMITS.pointsPerSeries;`
- `src/lib/assistant/compile.ts:398` if: the true side never ran: `if (days > maxPoints) {`
- `src/lib/assistant/compile.ts:398` if: the false side never ran: `if (days > maxPoints) {`
- `src/lib/assistant/compile.ts:399` ?: the true side never ran: `"week"`
- `src/lib/assistant/compile.ts:399` ?: the false side never ran: `const grain = days / 7 <= maxPoints ? "week" : "month";`
- `src/lib/assistant/compile.ts:405` if: the true side never ran: `if (!c.records && catDim && timeDim) {`
- `src/lib/assistant/compile.ts:405` if: the false side never ran: `if (!c.records && catDim && timeDim) {`
- `src/lib/assistant/compile.ts:405` and/or: part 1 of 3 never reached: `!c.records`
- `src/lib/assistant/compile.ts:405` and/or: part 2 of 3 never reached: `catDim`
- `src/lib/assistant/compile.ts:405` and/or: part 3 of 3 never reached: `timeDim)`
- `src/lib/assistant/compile.ts:413` if: the true side never ran: `if (cats.size > LIMITS.groupsShown) {`
- `src/lib/assistant/compile.ts:413` if: the false side never ran: `if (cats.size > LIMITS.groupsShown) {`
- `src/lib/assistant/compile.ts:418` if: the true side never ran: `if (keep.has(r[catDim.alias])) { kept.push(r); continue; }`
- `src/lib/assistant/compile.ts:418` if: the false side never ran: `if (keep.has(r[catDim.alias])) { kept.push(r); continue; }`
- `src/lib/assistant/compile.ts:420` and/or: part 1 of 2 never reached: `others.get(t)`
- `src/lib/assistant/compile.ts:420` and/or: part 2 of 2 never reached: `const o = others.get(t) ?? { [timeDim.alias]: t, [catDim.alias]: "Others" };`
- `src/lib/assistant/compile.ts:421` if: the true side never ran: `...if (["count", "sum"].includes(m.fn)) o[m.alias] = Number(o[m.alias] ?? 0) + Number(r[m.alias] ?? 0);`
- `src/lib/assistant/compile.ts:421` if: the false side never ran: `...if (["count", "sum"].includes(m.fn)) o[m.alias] = Number(o[m.alias] ?? 0) + Number(r[m.alias] ?? 0);`
- `src/lib/assistant/compile.ts:421` and/or: part 1 of 2 never reached: `o[m.alias]`
- `src/lib/assistant/compile.ts:421` and/or: part 2 of 2 never reached: `for (const m of c.measures) if (["count", "sum"].includes(m.fn)) o[m.alias] = Number(o[m.alias] ?? 0...`
- `src/lib/assistant/compile.ts:421` and/or: part 1 of 2 never reached: `r[m.alias]`
- `src/lib/assistant/compile.ts:421` and/or: part 2 of 2 never reached: `for (const m of c.measures) if (["count", "sum"].includes(m.fn)) o[m.alias] = Number(o[m.alias] ?? 0...`
- `src/lib/assistant/compile.ts:429` if: the true side never ran: `` if (!c.records && catDim && total > rows.length) notes.push(`${total} groups in all; the largest ${r... ``
- `src/lib/assistant/compile.ts:429` if: the false side never ran: `` if (!c.records && catDim && total > rows.length) notes.push(`${total} groups in all; the largest ${r... ``
- `src/lib/assistant/compile.ts:429` and/or: part 1 of 3 never reached: `!c.records`
- `src/lib/assistant/compile.ts:429` and/or: part 2 of 3 never reached: `catDim`
- `src/lib/assistant/compile.ts:429` and/or: part 3 of 3 never reached: `total > rows.length)`
- `src/lib/assistant/compile.ts:430` if: the true side never ran: `` if (c.records && total > rows.length) notes.push(`${total} records match; ${rows.length} are shown.`... ``
- `src/lib/assistant/compile.ts:430` if: the false side never ran: `` if (c.records && total > rows.length) notes.push(`${total} records match; ${rows.length} are shown.`... ``
- `src/lib/assistant/compile.ts:430` and/or: part 1 of 2 never reached: `c.records`
- `src/lib/assistant/compile.ts:430` and/or: part 2 of 2 never reached: `total > rows.length)`
- `src/lib/assistant/compile.ts:433` if: the true side never ran: `if (c.previous) {`
- `src/lib/assistant/compile.ts:433` if: the false side never ran: `if (c.previous) {`
- `src/lib/assistant/compile.ts:437` and/or: part 1 of 2 never reached: `byKey.get(key(r))?.[m.alias]`
- `src/lib/assistant/compile.ts:437` and/or: part 2 of 2 never reached: `` rows = rows.map((r) => ({ ...r, ...Object.fromEntries(c.measures.map((m) => [`${m.alias}_prev`, byKe... ``
- `src/lib/assistant/compile.ts:439` and/or: part 1 of 2 never reached: `c.testData`
- `src/lib/assistant/compile.ts:439` and/or: part 2 of 2 never reached: `const testData = c.testData ?? rows.some((r) => Number(r.__test) === 1);`
- `src/lib/assistant/compile.ts:451` ?: the true side never ran: `` `DATE_FORMAT(${e}, '%Y-%m')` ``
- `src/lib/assistant/compile.ts:451` ?: the false side never ran: `` const to = grain === "month" ? `DATE_FORMAT(${e}, '%Y-%m')` : `DATE_FORMAT(DATE_SUB(DATE(${e}), INTE... ``
- `src/lib/assistant/compile.ts:452` ?: the true side never ran: `{ ...d, grain }`
- `src/lib/assistant/compile.ts:452` ?: the false side never ran: `return { ...c, sql: c.sql.split(day).join(to), dims: c.dims.map((d) => (d.time ? { ...d, grain } : d...`

### src/lib/thunai/narrate.ts: 69.41 %, 63 untested

- `src/lib/thunai/narrate.ts:108` and/or: part 1 of 2 never reached: `label`
- `src/lib/thunai/narrate.ts:108` and/or: part 2 of 2 never reached: `const k = KINDS.find(([, l]) => l.toLowerCase() === String(label ?? "").toLowerCase());`
- `src/lib/thunai/narrate.ts:109` ?: the true side never ran: `CAT_LABEL_TA[k[0]] ?? null`
- `src/lib/thunai/narrate.ts:109` and/or: part 1 of 2 never reached: `CAT_LABEL_TA[k[0]]`
- `src/lib/thunai/narrate.ts:109` and/or: part 2 of 2 never reached: `null`
- `src/lib/thunai/narrate.ts:109` ?: the false side never ran: `return k ? CAT_LABEL_TA[k[0]] ?? null : null;`
- `src/lib/thunai/narrate.ts:156` and/or: part 2 of 2 never reached: `const c = code ?? "";`
- `src/lib/thunai/narrate.ts:165` ?: the false side never ran: `return name ? { en: name, ta: name } : null;`
- `src/lib/thunai/narrate.ts:170` if: the true side never ran: `if (hours == null || !Number.isFinite(hours) || hours < 0) return null;`
- `src/lib/thunai/narrate.ts:186` ?: the true side never ran: `return u.startsWith("min") ? n / 60 : u.startsWith("h") ? n : u.startsWith("d") ? n * 24 : u.startsW...`
- `src/lib/thunai/narrate.ts:186` ?: the false side never ran: `return u.startsWith("min") ? n / 60 : u.startsWith("h") ? n : u.startsWith("d") ? n * 24 : u.startsW...`
- `src/lib/thunai/narrate.ts:193` if: the false side never ran: `if (m) hours = ((extra.now ?? Date.now()) - Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), N...`
- `src/lib/thunai/narrate.ts:196` and/or: part 2 of 3 never reached: `row.zoneName`
- `src/lib/thunai/narrate.ts:196` and/or: part 3 of 3 never reached: `null`
- `src/lib/thunai/narrate.ts:196` and/or: part 3 of 4 never reached: `row.place`
- `src/lib/thunai/narrate.ts:196` and/or: part 4 of 4 never reached: `what: plainWhat(row.cat, row.why ?? row.title), place: row.place ?? row.zoneName ?? null, placeTa: e...`
- `src/lib/thunai/narrate.ts:207` if: the false side never ran: `` if (/ு$/.test(word)) return `${word.slice(0, -1)}ிடம்`; ``
- `src/lib/thunai/narrate.ts:208` if: the true side never ran: `` if (/்$/.test(word)) return `${word.slice(0, -1)}ிடம்`; ``
- `src/lib/thunai/narrate.ts:208` if: the false side never ran: `` if (/்$/.test(word)) return `${word.slice(0, -1)}ிடம்`; ``
- `src/lib/thunai/narrate.ts:212` ?: the false side never ran: `const article = (s: string) => (/^(a|an|the|uncleared|standing|street|bad|people)\b/i.test(s) ? s : ...`
- `src/lib/thunai/narrate.ts:212` ?: the true side never ran: `const article = (s: string) => (/^(a|an|the|uncleared|standing|street|bad|people)\b/i.test(s) ? s : ...`
- `src/lib/thunai/narrate.ts:212` ?: the false side never ran: `const article = (s: string) => (/^(a|an|the|uncleared|standing|street|bad|people)\b/i.test(s) ? s : ...`
- `src/lib/thunai/narrate.ts:216` ?: the false side never ran: `const what = f.what ? article(f.what.en) : "an issue";`
- `src/lib/thunai/narrate.ts:220` ?: the true side never ran: `"There were"`
- `src/lib/thunai/narrate.ts:221` ?: the false side never ran: `` const first = `${was} ${what}${f.place ? ` at ${f.place}` : ""}${f.what ? "" : `, logged as ${label.... ``
- `src/lib/thunai/narrate.ts:221` ?: the false side never ran: `` `, logged as ${label.toLowerCase()}` ``
- `src/lib/thunai/narrate.ts:222` ?: the false side never ran: `` const plain = `${was} ${what}${f.place ? ` at ${f.place}` : ""}.`; ``
- `src/lib/thunai/narrate.ts:223` ?: the false side never ran: `` const ta = `${f.placeTa ? `${f.placeTa} பகுதியில் ` : ""}${f.what ? f.what.ta : "ஒரு பிரச்சினை"} இரு... ``
- `src/lib/thunai/narrate.ts:223` ?: the false side never ran: `` const ta = `${f.placeTa ? `${f.placeTa} பகுதியில் ` : ""}${f.what ? f.what.ta : "ஒரு பிரச்சினை"} இரு... ``
- `src/lib/thunai/narrate.ts:225` and/or: part 2 of 2 never reached: `` return { en: speechProblem(en, sources, [f.place ?? "", f.placeTa ?? ""]) ? `${plain} ${said.en}` : ... ``
- `src/lib/thunai/narrate.ts:225` and/or: part 2 of 2 never reached: `` return { en: speechProblem(en, sources, [f.place ?? "", f.placeTa ?? ""]) ? `${plain} ${said.en}` : ... ``
- `src/lib/thunai/narrate.ts:225` ?: the true side never ran: `` `${plain} ${said.en}` ``
- `src/lib/thunai/narrate.ts:229` ?: the false side never ran: `` const s1 = `${there} ${what}${f.place ? ` at ${f.place}` : ""}${f.what ? "" : `, logged as ${label.t... ``
- `src/lib/thunai/narrate.ts:229` ?: the false side never ran: `` `, logged as ${label.toLowerCase()}` ``
- `src/lib/thunai/narrate.ts:231` ?: the false side never ran: `` const s2 = age ? `It's been open for ${age.en}${f.overdue ? ", and it's past its deadline" : ""}.` :... ``
- `src/lib/thunai/narrate.ts:231` ?: the false side never ran: `` const s2 = age ? `It's been open for ${age.en}${f.overdue ? ", and it's past its deadline" : ""}.` :... ``
- `src/lib/thunai/narrate.ts:231` ?: the true side never ran: `"It's past its deadline."`
- `src/lib/thunai/narrate.ts:231` ?: the false side never ran: `` const s2 = age ? `It's been open for ${age.en}${f.overdue ? ", and it's past its deadline" : ""}.` :... ``
- `src/lib/thunai/narrate.ts:234` ?: the false side never ran: `` const s3 = f.complaints >= 2 ? `${f.complaints} people have complained about it, so it's hitting ${r... ``
- `src/lib/thunai/narrate.ts:235` ?: the false side never ran: `: f.serious ? "It's one of the serious ones." : "";`
- `src/lib/thunai/narrate.ts:236` ?: the true side never ran: `` `I'd ${f.next.en}${f.overdue ? " today" : ""}.` ``
- `src/lib/thunai/narrate.ts:236` ?: the true side never ran: `" today"`
- `src/lib/thunai/narrate.ts:236` ?: the false side never ran: `` const s4 = f.next ? `I'd ${f.next.en}${f.overdue ? " today" : ""}.` : f.who ? `I'd ask ${f.who.en} f... ``
- `src/lib/thunai/narrate.ts:236` ?: the false side never ran: `` const s4 = f.next ? `I'd ${f.next.en}${f.overdue ? " today" : ""}.` : f.who ? `I'd ask ${f.who.en} f... ``
- `src/lib/thunai/narrate.ts:236` ?: the false side never ran: `` const s4 = f.next ? `I'd ${f.next.en}${f.overdue ? " today" : ""}.` : f.who ? `I'd ask ${f.who.en} f... ``
- `src/lib/thunai/narrate.ts:238` ?: the false side never ran: `const whatTa = f.what ? f.what.ta : "ஒரு பிரச்சினை";`
- `src/lib/thunai/narrate.ts:239` ?: the false side never ran: `` const t1 = `${f.placeTa ? `${f.placeTa} பகுதியில் ` : ""}${whatTa} இருக்கிறது.`; ``
- `src/lib/thunai/narrate.ts:240` ?: the false side never ran: `` const t2 = age ? `${age.ta} தீர்க்கப்படாமல் இருக்கிறது${f.overdue ? ", கெடுவும் தாண்டிவிட்டது" : ""}... ``
- `src/lib/thunai/narrate.ts:240` ?: the false side never ran: `` const t2 = age ? `${age.ta} தீர்க்கப்படாமல் இருக்கிறது${f.overdue ? ", கெடுவும் தாண்டிவிட்டது" : ""}... ``
- `src/lib/thunai/narrate.ts:240` ?: the true side never ran: `` const t2 = age ? `${age.ta} தீர்க்கப்படாமல் இருக்கிறது${f.overdue ? ", கெடுவும் தாண்டிவிட்டது" : ""}... ``
- `src/lib/thunai/narrate.ts:240` ?: the false side never ran: `` const t2 = age ? `${age.ta} தீர்க்கப்படாமல் இருக்கிறது${f.overdue ? ", கெடுவும் தாண்டிவிட்டது" : ""}... ``
- `src/lib/thunai/narrate.ts:241` ?: the false side never ran: `` const t3 = f.complaints >= 2 ? `${f.complaints} பேர் புகார் கொடுத்திருக்கிறார்கள், ${reach.ta}${f.se... ``
- `src/lib/thunai/narrate.ts:241` ?: the false side never ran: `` const t3 = f.complaints >= 2 ? `${f.complaints} பேர் புகார் கொடுத்திருக்கிறார்கள், ${reach.ta}${f.se... ``
- `src/lib/thunai/narrate.ts:242` ?: the true side never ran: `` `${f.next.ta}${f.overdue ? ", இன்றே" : ""}.` ``
- `src/lib/thunai/narrate.ts:242` ?: the true side never ran: `` const t4 = f.next ? `${f.next.ta}${f.overdue ? ", இன்றே" : ""}.` : f.who ? `${idam(f.who.ta)} ${f.ov... ``
- `src/lib/thunai/narrate.ts:242` ?: the false side never ran: `` const t4 = f.next ? `${f.next.ta}${f.overdue ? ", இன்றே" : ""}.` : f.who ? `${idam(f.who.ta)} ${f.ov... ``
- `src/lib/thunai/narrate.ts:242` ?: the false side never ran: `` const t4 = f.next ? `${f.next.ta}${f.overdue ? ", இன்றே" : ""}.` : f.who ? `${idam(f.who.ta)} ${f.ov... ``
- `src/lib/thunai/narrate.ts:242` ?: the false side never ran: `` const t4 = f.next ? `${f.next.ta}${f.overdue ? ", இன்றே" : ""}.` : f.who ? `${idam(f.who.ta)} ${f.ov... ``
- `src/lib/thunai/narrate.ts:245` and/or: part 2 of 2 never reached: `const names = [f.place ?? "", f.placeTa ?? ""];`
- `src/lib/thunai/narrate.ts:245` and/or: part 2 of 2 never reached: `const names = [f.place ?? "", f.placeTa ?? ""];`
- `src/lib/thunai/narrate.ts:246` if: the true side never ran: `` if (speechProblem(en, sources, names)) return { en: [`${there} ${what}${f.place ? ` at ${f.place}` :... ``
- `src/lib/thunai/narrate.ts:246` ?: the true side never ran: `` ` at ${f.place}` ``
- `src/lib/thunai/narrate.ts:246` ?: the false side never ran: `` if (speechProblem(en, sources, names)) return { en: [`${there} ${what}${f.place ? ` at ${f.place}` :... ``

### src/lib/thunai/frame.ts: 70.94 %, 43 untested

- `src/lib/thunai/frame.ts:88` and/or: part 6 of 8 never reached: `!isNewRequest(t)) || (`
- `src/lib/thunai/frame.ts:94` and/or: part 2 of 2 never reached: `return { kind: "screen", recipe: "why", slots: { zones: zones ?? [], cat: slots.cat ?? null, period:...`
- `src/lib/thunai/frame.ts:94` and/or: part 2 of 2 never reached: `"weekly"`
- `src/lib/thunai/frame.ts:98` ?: the false side never ran: `const period = MONTHLY.test(t) ? "monthly" : WEEKLY.test(t) ? "weekly" : QUARTER.test(t) ? "quarterl...`
- `src/lib/thunai/frame.ts:98` ?: the true side never ran: `"weekly"`
- `src/lib/thunai/frame.ts:98` ?: the false side never ran: `const period = MONTHLY.test(t) ? "monthly" : WEEKLY.test(t) ? "weekly" : QUARTER.test(t) ? "quarterl...`
- `src/lib/thunai/frame.ts:98` ?: the true side never ran: `"quarterly" : (`
- `src/lib/thunai/frame.ts:98` ?: the false side never ran: `const period = MONTHLY.test(t) ? "monthly" : WEEKLY.test(t) ? "weekly" : QUARTER.test(t) ? "quarterl...`
- `src/lib/thunai/frame.ts:98` and/or: part 1 of 2 never reached: `slots.period as string)`
- `src/lib/thunai/frame.ts:98` and/or: part 2 of 2 never reached: `const period = MONTHLY.test(t) ? "monthly" : WEEKLY.test(t) ? "weekly" : QUARTER.test(t) ? "quarterl...`
- `src/lib/thunai/frame.ts:99` and/or: part 2 of 2 never reached: `return { kind: "screen", recipe: "why", slots: { zones: (slots.zones as number[]) ?? [], cat: slots....`
- `src/lib/thunai/frame.ts:103` and/or: part 2 of 2 never reached: `const from = ((slots.zones as number[]) ?? []).filter((z) => !hasNewPlace.includes(z));`
- `src/lib/thunai/frame.ts:105` if: the false side never ran: `if (zones.length >= 2) return { kind: "screen", recipe: "compare", slots: { zones, cat: slots.cat ??...`
- `src/lib/thunai/frame.ts:105` and/or: part 2 of 2 never reached: `"weekly"`
- `src/lib/thunai/frame.ts:109` ?: the false side never ran: `const v = /table|டேபிள்|அட்டவணை/.test(t) ? "table" : /map|வரைபடம்/.test(t) ? "map" : "chart";`
- `src/lib/thunai/frame.ts:109` ?: the true side never ran: `"map"`
- `src/lib/thunai/frame.ts:109` ?: the false side never ran: `const v = /table|டேபிள்|அட்டவணை/.test(t) ? "table" : /map|வரைபடம்/.test(t) ? "map" : "chart";`
- `src/lib/thunai/frame.ts:114` and/or: part 2 of 2 never reached: `const period = periodIn(t) ?? (DAILY.test(t) ? "daily" : WEEKLY.test(t) ? "weekly" : MONTHLY.test(t)...`
- `src/lib/thunai/frame.ts:114` ?: the true side never ran: `"daily"`
- `src/lib/thunai/frame.ts:114` ?: the false side never ran: `const period = periodIn(t) ?? (DAILY.test(t) ? "daily" : WEEKLY.test(t) ? "weekly" : MONTHLY.test(t)...`
- `src/lib/thunai/frame.ts:114` ?: the true side never ran: `"weekly"`
- `src/lib/thunai/frame.ts:114` ?: the false side never ran: `const period = periodIn(t) ?? (DAILY.test(t) ? "daily" : WEEKLY.test(t) ? "weekly" : MONTHLY.test(t)...`
- `src/lib/thunai/frame.ts:114` ?: the true side never ran: `"monthly"`
- `src/lib/thunai/frame.ts:114` ?: the false side never ran: `const period = periodIn(t) ?? (DAILY.test(t) ? "daily" : WEEKLY.test(t) ? "weekly" : MONTHLY.test(t)...`
- `src/lib/thunai/frame.ts:114` ?: the true side never ran: `"quarterly"`
- `src/lib/thunai/frame.ts:114` ?: the false side never ran: `const period = periodIn(t) ?? (DAILY.test(t) ? "daily" : WEEKLY.test(t) ? "weekly" : MONTHLY.test(t)...`
- `src/lib/thunai/frame.ts:115` if: the false side never ran: `if (period) return { kind: "screen", recipe: last.recipe, slots: { ...slots, period }, why: "period"...`
- `src/lib/thunai/frame.ts:121` ?: the false side never ran: `["Chembarambakkam", "Puzhal", "Poondi", "Cholavaram", "Veeranam", "Red Hills"]).`
- `src/lib/thunai/frame.ts:122` if: the false side never ran: `if (named) return { kind: "screen", recipe: "readings", slots: { ...slots, name: named }, why: "new-...`
- `src/lib/thunai/frame.ts:126` if: the true side never ran: `if (last.recipe === "compare") return { kind: "screen", recipe: "compare", slots: { ...slots, zones:...`
- `src/lib/thunai/frame.ts:126` and/or: part 1 of 2 never reached: `slots.zones as number[])`
- `src/lib/thunai/frame.ts:126` and/or: part 2 of 2 never reached: `if (last.recipe === "compare") return { kind: "screen", recipe: "compare", slots: { ...slots, zones:...`
- `src/lib/thunai/frame.ts:127` ?: the true side never ran: `"cases"`
- `src/lib/thunai/frame.ts:131` ?: the true side never ran: `"cases"`
- `src/lib/thunai/frame.ts:132` if: the true side never ran: `if (short && periodIn(t) && !catIn(t)) {`
- `src/lib/thunai/frame.ts:132` and/or: part 3 of 3 never reached: `!catIn(t))`
- `src/lib/thunai/frame.ts:134` if: the true side never ran: `if (period) return { kind: "screen", recipe: last.recipe, slots: { ...slots, period }, why: "period"...`
- `src/lib/thunai/frame.ts:134` if: the false side never ran: `if (period) return { kind: "screen", recipe: last.recipe, slots: { ...slots, period }, why: "period"...`
- `src/lib/thunai/frame.ts:138` and/or: part 3 of 6 never reached: `last.recipe === "dashboard"`
- `src/lib/thunai/frame.ts:138` and/or: part 4 of 6 never reached: `last.recipe === "trend"`
- `src/lib/thunai/frame.ts:138` and/or: part 5 of 6 never reached: `last.recipe === "why"`
- `src/lib/thunai/frame.ts:138` and/or: part 6 of 6 never reached: `last.recipe === "map"))`
- `src/lib/thunai/frame.ts:142` ?: the true side never ran: `{ cat: c }`

### src/lib/rate-limit.ts: 78.78 %, 7 untested

- `src/lib/rate-limit.ts:15` if: the true side never ran: `for (const [k, b] of buckets) if (b.resetAt < now) buckets.delete(k);`
- `src/lib/rate-limit.ts:15` if: the false side never ran: `for (const [k, b] of buckets) if (b.resetAt < now) buckets.delete(k);`
- `src/lib/rate-limit.ts:30` if: the true side never ran: `if (buckets.size >= SWEEP_AT) sweep(now);`
- `src/lib/rate-limit.ts:74` and/or: part 2 of 2 never reached: `const chain = (headers.get("x-forwarded-for") ?? "").split(",").map((x) => x.trim()).filter(Boolean)...`
- `src/lib/rate-limit.ts:77` and/or: part 1 of 3 never reached: `headers.get("x-real-ip")?.trim()`
- `src/lib/rate-limit.ts:77` and/or: part 2 of 3 never reached: `chain[0]`
- `src/lib/rate-limit.ts:77` and/or: part 3 of 3 never reached: `return headers.get("x-real-ip")?.trim() || chain[0] || "direct";`

### src/lib/security/stepup.ts: 80.00 %, 6 untested

- `src/lib/security/stepup.ts:39` and/or: part 2 of 2 never reached: `null`
- `src/lib/security/stepup.ts:43` and/or: part 2 of 2 never reached: `return signTicket("grant", { uid: s.userId, tv: Number(s.tv) || 0, act, scope, fac }, GRANT_TTL_S);`
- `src/lib/security/stepup.ts:76` ?: the true side never ran: `"an emailed code"`
- `src/lib/security/stepup.ts:76` ?: the false side never ran: `f === "email" ? "an emailed code" : f === "password" ? "the account password" : "no confirmation";`
- `src/lib/security/stepup.ts:76` ?: the true side never ran: `"the account password"`
- `src/lib/security/stepup.ts:76` ?: the false side never ran: `f === "email" ? "an emailed code" : f === "password" ? "the account password" : "no confirmation";`

### src/lib/thunai/speechcheck.ts: 86.66 %, 2 untested

- `src/lib/thunai/speechcheck.ts:49` if: the true side never ran: `` if (l) return `label: ${l}`; ``
- `src/lib/thunai/speechcheck.ts:51` ?: the true side never ran: `` `copied: "${c}"` ``

### src/lib/thunai/quick.ts: 87.40 %, 64 untested

- `src/lib/thunai/quick.ts:34` if: the true side never ran: `if (!ww) return -1;`
- `src/lib/thunai/quick.ts:63` ?: the false side never ran: `const at = stem.length >= 4 ? t.indexOf(stem) : -1;`
- `src/lib/thunai/quick.ts:70` if: the true side never ran: `if (at >= 0 && !hits.some((h) => h.n === z.n)) hits.push({ n: z.n, at });`
- `src/lib/thunai/quick.ts:77` if: the true side never ran: `` if (nm.length >= 4 && t.includes(` ${nm} `)) { hits.push({ n: p.zone, at: t.indexOf(` ${nm} `) }); b... ``
- `src/lib/thunai/quick.ts:84` ?: the true side never ran: `for (const g of [m[1], m[2]]) if (g && +g >= 1 && +g <= 15 && !hits.some((h) => h.n === +g)) hits.pu...`
- `src/lib/thunai/quick.ts:90` if: the true side never ran: `...if (!hits.some((h) => h.n === n)) hits.push({ n, at: t.length });`
- `src/lib/thunai/quick.ts:101` if: the true side never ran: `if (nm.length < 4) continue;`
- `src/lib/thunai/quick.ts:151` and/or: part 2 of 2 never reached: `for (let i = 0; i < tk.length; i++) if (WEAK_SEV.has(tk[i]) && (SEV_NOUN.has(tk[i + 1] ?? "") || SEV...`
- `src/lib/thunai/quick.ts:152` if: the true side never ran: `if (has(t, ["serious", "critical", "urgent", "danger", "dangerous", "கடுமையான", "கடுமை", "அவசர", "se...`
- `src/lib/thunai/quick.ts:180` ?: the false side never ran: `if (counted) return counted.kind === "span" ? heldPeriod(counted.hours) : null;`
- `src/lib/thunai/quick.ts:303` and/or: part 6 of 6 never reached: `const isPrice = (t: string) => has(t, PRICE) || (has(t, PRICE_WEAK) && (VEG.test(t) || MARKET.test(t...`
- `src/lib/thunai/quick.ts:311` if: the true side never ran: `...if (/^(complaints?|issues?|problems?|grievances?)$/.test(all[i]) && /^[a-z]{3,}$/.test(all[i - 1]) &...`
- `src/lib/thunai/quick.ts:331` if: the true side never ran: `if (!cat && unknownTopicIn(t, w)) return "unknown-topic";`
- `src/lib/thunai/quick.ts:332` if: the true side never ran: `if (SUBJECTS.test(text.toLowerCase())) return "other-subject";`
- `src/lib/thunai/quick.ts:333` if: the true side never ran: `if (SAVE_ASK.test(t)) return "save";`
- `src/lib/thunai/quick.ts:334` if: the true side never ran: `if (MAPISH.test(t) && !has(t, ON_MAP)) return "map-word";`
- `src/lib/thunai/quick.ts:334` and/or: part 2 of 2 never reached: `!has(t, ON_MAP))`
- `src/lib/thunai/quick.ts:335` if: the true side never ran: `if (NEARBY.test(t) && !FACILITY.test(t)) return "nearby-word";`
- `src/lib/thunai/quick.ts:341` if: the true side never ran: `if (shapes >= 2) return "two-questions";`
- `src/lib/thunai/quick.ts:382` if: the true side never ran: `...if (nos.some((n) => n < 1 || n > 15) || (nos.length > 1 && !isComparing(t))) return null; }`
- `src/lib/thunai/quick.ts:382` and/or: part 3 of 3 never reached: `!isComparing(t)))`
- `src/lib/thunai/quick.ts:387` and/or: part 2 of 2 never reached: `const zoneWords = zones.flatMap((n) => [...(ZONES[n]?.en ?? []), ...(ZONES[n]?.ta ?? []), w.zones.fi...`
- `src/lib/thunai/quick.ts:387` and/or: part 2 of 2 never reached: `const zoneWords = zones.flatMap((n) => [...(ZONES[n]?.en ?? []), ...(ZONES[n]?.ta ?? []), w.zones.fi...`
- `src/lib/thunai/quick.ts:387` and/or: part 2 of 2 never reached: `const zoneWords = zones.flatMap((n) => [...(ZONES[n]?.en ?? []), ...(ZONES[n]?.ta ?? []), w.zones.fi...`
- `src/lib/thunai/quick.ts:395` if: the false side never ran: `if (!o.noBail) return null;`
- `src/lib/thunai/quick.ts:405` and/or: part 2 of 2 never reached: `"weekly"`
- `src/lib/thunai/quick.ts:406` if: the true side never ran: `if (has(t, ON_MAP) && !cat && !sev && !has(t, ["hotspot", "hotspots", "severe"])) return null;`
- `src/lib/thunai/quick.ts:406` and/or: part 2 of 4 never reached: `!cat`
- `src/lib/thunai/quick.ts:406` and/or: part 3 of 4 never reached: `!sev`
- `src/lib/thunai/quick.ts:406` and/or: part 4 of 4 never reached: `!has(t, ["hotspot", "hotspots", "severe"]))`
- `src/lib/thunai/quick.ts:407` if: the true side never ran: `if (has(t, ON_MAP) && (cat || sev || has(t, ["hotspot", "hotspots", "severe"]))) return { recipe: "m...`
- `src/lib/thunai/quick.ts:407` and/or: part 2 of 4 never reached: `cat`
- `src/lib/thunai/quick.ts:407` and/or: part 3 of 4 never reached: `sev`
- `src/lib/thunai/quick.ts:407` and/or: part 4 of 4 never reached: `has(t, ["hotspot", "hotspots", "severe"])))`
- `src/lib/thunai/quick.ts:407` ?: the true side never ran: `"hotspots"`
- `src/lib/thunai/quick.ts:407` ?: the false side never ran: `sev ? "severe" : "cases"`
- `src/lib/thunai/quick.ts:407` ?: the true side never ran: `"severe"`
- `src/lib/thunai/quick.ts:407` ?: the false side never ran: `"cases"`
- `src/lib/thunai/quick.ts:407` and/or: part 1 of 2 never reached: `period`
- `src/lib/thunai/quick.ts:407` and/or: part 2 of 2 never reached: `"weekly"`
- `src/lib/thunai/quick.ts:415` if: the true side never ran: `if (has(t, COMPARE) && zones.length >= 2 && (has(t, AIR) || has(t, LAKE))) return { recipe: "compare...`
- `src/lib/thunai/quick.ts:415` and/or: part 2 of 4 never reached: `zones.length >= 2 && (`
- `src/lib/thunai/quick.ts:415` and/or: part 3 of 4 never reached: `has(t, AIR)`
- `src/lib/thunai/quick.ts:415` and/or: part 4 of 4 never reached: `has(t, LAKE)))`
- `src/lib/thunai/quick.ts:415` and/or: part 1 of 2 never reached: `period`
- `src/lib/thunai/quick.ts:415` and/or: part 2 of 2 never reached: `"weekly"`
- `src/lib/thunai/quick.ts:416` and/or: part 2 of 2 never reached: `null`
- `src/lib/thunai/quick.ts:416` ?: the false side never ran: `null`
- `src/lib/thunai/quick.ts:420` if: the true side never ran: `if (isComparing(t) && zones.length >= 2) return { recipe: "compare", slots: { zones: zones.slice(0, ...`
- `src/lib/thunai/quick.ts:420` and/or: part 2 of 2 never reached: `zones.length >= 2)`
- `src/lib/thunai/quick.ts:420` and/or: part 1 of 2 never reached: `period`
- `src/lib/thunai/quick.ts:420` and/or: part 2 of 2 never reached: `"weekly"`
- `src/lib/thunai/quick.ts:422` if: the true side never ran: `if (isComparing(t)) return null;`
- `src/lib/thunai/quick.ts:424` ?: the true side never ran: `"zone"`
- `src/lib/thunai/quick.ts:425` and/or: part 2 of 2 never reached: `"monthly"`
- `src/lib/thunai/quick.ts:427` ?: the true side never ran: `"zone_severe"`
- `src/lib/thunai/quick.ts:427` ?: the true side never ran: `"zone_open"`
- `src/lib/thunai/quick.ts:427` ?: the true side never ran: `"bottom"`
- `src/lib/thunai/quick.ts:430` if: the true side never ran: `if (has(t, RANK) && has(t, ["department", "departments", "dept", "துறை", "துறைகள்"])) return { recip...`
- `src/lib/thunai/quick.ts:430` and/or: part 2 of 2 never reached: `has(t, ["department", "departments", "dept", "துறை", "துறைகள்"]))`
- `src/lib/thunai/quick.ts:430` and/or: part 1 of 2 never reached: `period`
- `src/lib/thunai/quick.ts:430` and/or: part 2 of 2 never reached: `"weekly"`
- `src/lib/thunai/quick.ts:431` and/or: part 3 of 3 never reached: `sev))`
- `src/lib/thunai/quick.ts:431` and/or: part 2 of 2 never reached: `"daily"`

### src/lib/thunai/privacy.ts: 89.94 %, 17 untested

- `src/lib/thunai/privacy.ts:83` if: the true side never ran: `if (SAID_WRITE.test(t)) return true;`
- `src/lib/thunai/privacy.ts:87` if: the true side never ran: `if (/\bwho\s+is\s+behind\b|\bwhich\s+(?:citizen|resident|person|complainant|caller|reporter)\b.{0,40...`
- `src/lib/thunai/privacy.ts:92` if: the true side never ran: `if (/\bwho\s+(?:is|was)\s+(?:the\s+)?(?:(?:citizen|person|resident|complainant|caller|reporter|one|g...`
- `src/lib/thunai/privacy.ts:93` if: the true side never ran: `if (!counting && /புகாரளித்த|புகாரளி(?:த்)?தவ/.test(t)) return true;`
- `src/lib/thunai/privacy.ts:94` if: the true side never ran: `if (ONE_FILING.test(t) && (/\bperu\b|\bpugar\s+solr?\w+|மூல\s*உரை|\b(?:raw|source|original)\s+(?:tex...`
- `src/lib/thunai/privacy.ts:100` if: the true side never ran: `if (WHO_TA.test(t) && /புகார/.test(t) && !/பொறுப்பு/.test(t)) return true;`
- `src/lib/thunai/privacy.ts:101` if: the true side never ran: `if (/\bcaller\b.*\b(mobile|number)\b|\b(pugar|complaint)\s+kuduth|yaaru\s+pugar/i.test(t) && /(per|p...`
- `src/lib/thunai/privacy.ts:101` and/or: part 2 of 2 never reached: `/(per|peru|address|number|enna|kuduthadhu|pannadhu)/i.test(t))`
- `src/lib/thunai/privacy.ts:139` if: the true side never ran: `if (CHANGE_VERB.test(t) && STATE_WORD.test(t) && RECORDISH.test(t)) return true;`
- `src/lib/thunai/privacy.ts:139` and/or: part 3 of 3 never reached: `RECORDISH.test(t))`
- `src/lib/thunai/privacy.ts:177` ?: the true side never ran: `const digits = toks.reduce((n, x) => n + (MIXED_DIGIT_WORD.test(x) ? 1 : x.length), 0);`
- `src/lib/thunai/privacy.ts:178` and/or: part 2 of 2 never reached: `digits >= 10`
- `src/lib/thunai/privacy.ts:178` ?: the true side never ran: `"[hidden] "`
- `src/lib/thunai/privacy.ts:218` ?: the true side never ran: `"[hidden]"`
- `src/lib/thunai/privacy.ts:218` ?: the false side never ran: `.replace(UNDERSCORED, (m) => (personalRun(m.replace(/_/g, " "), "") ? "[hidden]" : m));`
- `src/lib/thunai/privacy.ts:223` if: the true side never ran: `if (depth > 8) return v;`
- `src/lib/thunai/privacy.ts:248` ?: the true side never ran: `(n: string) => h.dataset!(n).then((r) => redact(r))`

### src/lib/thunai/numbergate.ts: 90.81 %, 9 untested

- `src/lib/thunai/numbergate.ts:107` if: the true side never ran: `if (!Number.isFinite(base)) continue;`
- `src/lib/thunai/numbergate.ts:109` ?: the false side never ran: `const mult = m[4] ? 1000 : !scale ? 1 : /lakh|லட்சம்/.test(scale) ? 100_000 : /crore|கோடி/.test(scal...`
- `src/lib/thunai/numbergate.ts:109` ?: the true side never ran: `1000`
- `src/lib/thunai/numbergate.ts:109` ?: the false side never ran: `const mult = m[4] ? 1000 : !scale ? 1 : /lakh|லட்சம்/.test(scale) ? 100_000 : /crore|கோடி/.test(scal...`
- `src/lib/thunai/numbergate.ts:121` and/or: part 2 of 2 never reached: `if (w === "double" && /^[\s-]*(check|click|tap)/i.test(en.slice((m.index ?? 0) + w.length))) continu...`
- `src/lib/thunai/numbergate.ts:138` and/or: part 2 of 2 never reached: `const after = en.slice((m.index ?? 0) + 3).match(/^\W*([\p{L}'-]+)(?:\W+([\p{L}'-]+))?/u);`
- `src/lib/thunai/numbergate.ts:153` if: the true side never ran: `if (seenWord.has(m[0])) continue;`
- `src/lib/thunai/numbergate.ts:170` ?: the false side never ran: `const n = typeof v === "number" ? v : Number(String(v).replace(/[,%\s]/g, ""));`
- `src/lib/thunai/numbergate.ts:171` if: the true side never ran: `if (!Number.isFinite(n)) continue;`

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

### src/lib/csv.ts: 92.30 %, 1 untested

- `src/lib/csv.ts:8` ?: the true side never ran: `if (v == null) return always ? '""' : "";`

### src/lib/thunai/entities.ts: 92.52 %, 43 untested

- `src/lib/thunai/entities.ts:104` if: the true side never ran: `...if (a.length === 1 && a[0].length <= 5 && aliases.some((o) => o.length >= 2 && o[0] === a[0])) alias...`
- `src/lib/thunai/entities.ts:113` and/or: part 2 of 2 never reached: `const said = (DEPT_ALIASES[d.code] ?? []).some((a) => a.toLowerCase() === suffix) || initials(d.name...`
- `src/lib/thunai/entities.ts:114` and/or: part 2 of 2 never reached: `null`
- `src/lib/thunai/entities.ts:114` and/or: part 2 of 2 never reached: `add(d.code, "dept", d.name, DEPT_TA[d.code] ?? null, [d.name, d.code.toLowerCase(), initials(d.name)...`
- `src/lib/thunai/entities.ts:114` and/or: part 2 of 2 never reached: `add(d.code, "dept", d.name, DEPT_TA[d.code] ?? null, [d.name, d.code.toLowerCase(), initials(d.name)...`
- `src/lib/thunai/entities.ts:123` and/or: part 2 of 2 never reached: `` for (const z of w.zones) add(`ZONE-${z.n}`, "zone", z.name, z.ta ?? null, [z.name, `zone ${z.n}`, ..... ``
- `src/lib/thunai/entities.ts:123` and/or: part 2 of 2 never reached: `` for (const z of w.zones) add(`ZONE-${z.n}`, "zone", z.name, z.ta ?? null, [z.name, `zone ${z.n}`, ..... ``
- `src/lib/thunai/entities.ts:128` and/or: part 2 of 2 never reached: `for (const t of w.taluks) for (const n of [t.name, t.ta ?? ""]) for (const x of /[஀-௿]/.test(n) ? to...`
- `src/lib/thunai/entities.ts:203` if: the true side never ran: `if (reg.near.size > 5000) reg.near.clear();`
- `src/lib/thunai/entities.ts:216` if: the true side never ran: `if (reg.seen.size > 5000) reg.seen.clear();`
- `src/lib/thunai/entities.ts:266` if: the true side never ran: `...if (a.every((x, j) => content[k + j] === x)) hits.push({ e, s: 0.97, via: "exact", start: k, end: k ...`
- `src/lib/thunai/entities.ts:293` ?: the true side never ran: `near.aliases[0]?.[near.aliases[0].length - 1] ?? ""`
- `src/lib/thunai/entities.ts:293` and/or: part 1 of 2 never reached: `near.aliases[0]?.[near.aliases[0].length - 1]`
- `src/lib/thunai/entities.ts:293` and/or: part 2 of 2 never reached: `const head = heads[0]?.x ?? (near ? near.aliases[0]?.[near.aliases[0].length - 1] ?? "" : "");`
- `src/lib/thunai/entities.ts:325` if: the true side never ran: `if (rival && top.via !== "exact" && rival.via !== "exact") return { kind: "ambiguous", options: [top...`
- `src/lib/thunai/entities.ts:325` and/or: part 3 of 3 never reached: `rival.via !== "exact")`
- `src/lib/thunai/entities.ts:391` and/or: part 1 of 2 never reached: `ORGS[org]?.name`
- `src/lib/thunai/entities.ts:391` and/or: part 2 of 2 never reached: `export const orgName = (org: string) => ORGS[org]?.name ?? org;`
- `src/lib/thunai/entities.ts:429` and/or: part 3 of 3 never reached: `return ws.map((w) => byTheirSound.get(w.toLowerCase()) ?? terms.get(w.toLowerCase()) ?? w).join(" ")...`
- `src/lib/thunai/entities.ts:445` and/or: part 2 of 2 never reached: `near.name`
- `src/lib/thunai/entities.ts:452` ?: the false side never ran: `null`
- `src/lib/thunai/entities.ts:465` if: the true side never ran: `if (missing !== undefined) return { kind: "reply", conf: 0, via: "no-zone", text: {`
- `src/lib/thunai/entities.ts:468` if: the true side never ran: `if (nos.length > 1) {`
- `src/lib/thunai/entities.ts:470` and/or: part 1 of 2 never reached: `name(n)?.name`
- `src/lib/thunai/entities.ts:470` and/or: part 2 of 2 never reached: `` const en = pick.map((n) => `zone ${n} (${name(n)?.name ?? n})`).join(", "), ta = pick.map((n) => `${... ``
- `src/lib/thunai/entities.ts:470` and/or: part 1 of 3 never reached: `name(n)?.ta`
- `src/lib/thunai/entities.ts:470` and/or: part 2 of 3 never reached: `name(n)?.name`
- `src/lib/thunai/entities.ts:470` and/or: part 3 of 3 never reached: `` const en = pick.map((n) => `zone ${n} (${name(n)?.name ?? n})`).join(", "), ta = pick.map((n) => `${... ``
- `src/lib/thunai/entities.ts:471` and/or: part 1 of 2 never reached: `name(n)?.name`
- `src/lib/thunai/entities.ts:471` and/or: part 2 of 2 never reached: `` `Zone ${n}` ``
- `src/lib/thunai/entities.ts:481` if: the true side never ran: `if (r.kind === "ambiguous") {`
- `src/lib/thunai/entities.ts:484` and/or: part 1 of 2 never reached: `` text: { en: `Did you mean ${a.name} or ${b.name}?`, ta: `${a.ta ?? a.name} அல்லது ${b.ta ?? b.name}?... ``
- `src/lib/thunai/entities.ts:484` and/or: part 2 of 2 never reached: `a.name`
- `src/lib/thunai/entities.ts:484` and/or: part 1 of 2 never reached: `` text: { en: `Did you mean ${a.name} or ${b.name}?`, ta: `${a.ta ?? a.name} அல்லது ${b.ta ?? b.name}?... ``
- `src/lib/thunai/entities.ts:484` and/or: part 2 of 2 never reached: `b.name`
- `src/lib/thunai/entities.ts:491` and/or: part 2 of 2 never reached: `e.name`
- `src/lib/thunai/entities.ts:492` if: the true side never ran: `if (r.conf < 0.8) return { kind: "clarify", conf: r.conf, via: r.via, options: [{ label: e.name, req...`
- `src/lib/thunai/entities.ts:493` and/or: part 1 of 2 never reached: `` text: { en: `I heard "${r.heard}". Did you mean ${e.name}?`, ta: `"${r.heard}" என்று கேட்டேன். ${e.t... ``
- `src/lib/thunai/entities.ts:493` and/or: part 2 of 2 never reached: `e.name`
- `src/lib/thunai/entities.ts:538` if: the true side never ran: `if (rest.some((x) => !placeLike(x) && isEnglishWord(x) && x.length > 2)) return null;`
- `src/lib/thunai/entities.ts:538` and/or: part 2 of 3 never reached: `) && isEnglishWord(x)`
- `src/lib/thunai/entities.ts:538` and/or: part 3 of 3 never reached: `x.length > 2`
- `src/lib/thunai/entities.ts:542` ?: the true side never ran: `said.replace(/nagar/gi, "நகர்")`

### src/lib/thunai/injection.ts: 94.73 %, 1 untested

- `src/lib/thunai/injection.ts:44` if: the true side never ran: `if (depth > 6 || out.length > 400) return;`

### src/lib/thunai/outside.ts: 97.29 %, 1 untested

- `src/lib/thunai/outside.ts:94` if: the true side never ran: `if (outsideIn([word]) || taOutside(word)) return true;`

### src/lib/collector/effective.ts: 100.00 %, 0 untested

None.
