# QA pass 4: method research

Date: 6 Nov 2026. Setting: Windows 11, Node 24.21, Next.js 14, vitest 3.2, no Docker. Python 3.14 is on this machine. Java is not.

**How this was checked.** Licences, versions and last-push dates come from the GitHub, npm and PyPI APIs, read today. Tool behaviour comes from each tool's own docs or source. No tool or data set was installed or downloaded, and none of these tools was run. So "should run on Windows" always means "not tried yet". "Checked here" marks a small Node check or a read of this repo. "Unverified" means I could not confirm it from a primary source.

## The result

The plan in the prompt holds up. No new tool is clearly stronger for the core work. The one tool to add is garak, and only because the prompt asks for its attack set.

| Area | Chosen | New tool? |
|---|---|---|
| Mutation | StrykerJS with the vitest runner, with the settings below | No |
| Property and metamorphic | fast-check, with generators built from the real store | No |
| API fuzzing | Home-made fuzzer driven by the route files | No. Schemathesis is an optional extra |
| Model-based | fast-check commands | No |
| AI red team | Own matrix of payload, field and language, plus garak's fixed probes | garak, outside the repo, if it installs |
| Load | autocannon, with p95 computed by us | No |
| Browser fuzz | Seeded Playwright action lists driven by fast-check | No |
| Accessibility | axe, plus our own Tamil `lang` check | IBM checker is optional |
| Defect estimate | Chapman per area, read as a rough floor | No |
| Confidence intervals | Wilson, and exact limits when counts are zero or few | No |
| Tamil endings | NFC clean-up, then a table of generated forms | No |
| Other places | Wikidata, GeoNames and CLDR | Data only |

## Six things that change what agents should do

1. **autocannon has no p95.** Its summary jumps from p90 to p97.5 (checked here in `hdr-histogram-percentiles-obj`). The target needs p95, so compute it ourselves.
2. **promptfoo breaks the Groq-only rule by default**, and its indirect-injection plugin cannot run without its remote service. Do not use it to generate attacks.
3. **Do not let Groq write attacks.** Groq's usage policy bars automated vulnerability discovery and has no stated exception for testing your own system. See section 5. This one is for the owner to know.
4. **`zod-fast-check` cannot be used.** It asks for fast-check below 4.0.0, and we have 4.10.2.
5. **k6 fails our licence rule.** It is AGPL-3.0, and section 4 of the prompt allows only permissive or weak-copyleft tools.
6. **80 Groq rows cannot prove 90 %.** At exactly 90 %, the interval is 81.5 % to 94.8 % overall, and about 72 % to 96 % per language. Report it that way.

---

## 1. Mutation testing

**Chosen: StrykerJS 10.1.1 with `@stryker-mutator/vitest-runner`** (Apache-2.0, [docs](https://stryker-mutator.io/docs/stryker-js/vitest-runner/)). It asks for Node 22 or later and vitest 2 or later. Settings that matter:
- Leave `inPlace` at false. Stryker then works on a copy in `.stryker-tmp`, which meets the "run on a copy" rule ([config](https://stryker-mutator.io/docs/stryker-js/configuration/)). That folder is git-ignored (checked here). Stryker deletes it after a successful run, so clear it by hand after a failed one.
- Leave `ignoreStatic` at false for the critical modules. Lists and regexes at the top of a file are static mutants, and those are where word bugs live. The docs warn this is slow, so run one module at a time with `mutate`.
- Report the total score, detected divided by valid. Do not report the covered-code score, because it leaves out code with no tests. Timeouts count as detected, no-coverage counts as undetected, and ignored mutants are left out ([metrics](https://stryker-mutator.io/docs/mutation-testing-elements/mutant-states-and-metrics/)). List every ignored mutant in the report.
- Regexes are mutated by weapon-regex, level 1 only ([mutators](https://stryker-mutator.io/docs/mutation-testing-elements/supported-mutators/)). Tamil character classes may get few mutants, so check that by hand.
- Set `vitest.related` to false for any test that does not import the source directly. Browser mode is not supported.

**Rejected.** [Mutineer](https://www.pkgstats.com/pkg:@mutineerjs/mutineer) is young, has few downloads and I found no comparison, so it is not clearly stronger. `@stryker-mutator/typescript-checker` (Apache-2.0) drops mutants that do not type-check, but add it only if type noise really shows up among survivors.

**Unverified.** The runner docs say only threads are supported and also list a `vitest.pool` option since 10.1.0. Use the default. Whether the node_modules link in `.stryker-tmp` works without extra rights on this Windows machine is untested.

## 2. Property-based and metamorphic testing of text

**Chosen: fast-check 4.10.2 (MIT) in vitest, with our own generators.** Build inputs from real store names and open-set sentences, never from the sealed set. Use the three test kinds from [CheckList](https://arxiv.org/abs/2005.04118) (ACL 2020): must work, must not change, must change in a known direction. Compare structured facts (action, body, place, topic, figures), not wording, so that language parity can really be 100 %. For Unicode use `fc.string({unit: 'binary'})` for any code point, `'grapheme'` for printable text, and a custom unit for Tamil letters ([docs](https://fast-check.dev/docs/core-blocks/arbitraries/primitives/string/)).

**Rejected.** The [CheckList library](https://github.com/marcotcr/checklist) (MIT, last push Jan 2024) is Python, its tutorials lean on an English spaCy model, and its authors do not vouch for other languages. We take the idea and leave the code. [TextAttack](https://github.com/QData/TextAttack) (MIT, Python) was not read in depth, and I saw no clear gain for rule code in three languages.

## 3. API fuzzing

**Is Schemathesis with a generated OpenAPI file stronger than a home-made fuzzer? Not here.** Checked here: of 116 route files, 47 mention zod or `safeParse`. The other 69 show no schema in the route file (they may check input in other ways), so an OpenAPI file for them would be our guess, and the tool would only test that guess. Nothing I read in these tools' docs checks a partial write or a role's data scope, and both are in our target.

**Chosen: home-made fuzzer.** It shares its route table with the access matrix.
- Read each route with the TypeScript compiler API: methods, `[id]` segments, `searchParams.get` names, body field names, zod objects.
- Generate bad input with fast-check: wrong types, missing fields, huge bodies, null bytes. Use a raw socket for bytes a normal client refuses to send.
- Send every case as anonymous and as each role.
- Check three things: no 5xx, no stack trace text, and the server's local store is unchanged after a rejected request.

**Rejected as the main tool.**
- [Schemathesis](https://schemathesis.readthedocs.io/en/stable/) 4.33.1 (MIT, Python 3.11+) needs an OpenAPI, GraphQL or gRPC description.
- [RESTler](https://github.com/microsoft/restler-fuzzer) (MIT) needs OpenAPI, Python 3.12.8 and .NET 8.
- [EvoMaster](https://github.com/WebFuzzing/EvoMaster) (LGPL-3.0) needs OpenAPI, and has dropped white-box support for JavaScript.
- [next-openapi-gen](https://github.com/tazo90/next-openapi-gen) (MIT) links schemas through JSDoc tags in the routes, which means editing `src/`.
- [zod-fast-check](https://github.com/DavidTimms/zod-fast-check) (MIT) needs fast-check below 4.0.0. Walk the zod objects ourselves.

The [Zhang and Arcuri study](https://arxiv.org/abs/2205.05325) put EvoMaster first and Schemathesis close behind, with no black-box tool above 60 % line coverage on average. Note that Arcuri leads EvoMaster.

**Optional, not a gate.** Have the route table write an OpenAPI file for the 47 routes only, and run Schemathesis on it once as a second opinion. Install with pip outside the repo. Whether it installs on Python 3.14 is untested.

## 4. Model-based testing

**Chosen: fast-check `fc.commands`** (MIT, [docs](https://fast-check.dev/docs/advanced/model-based-testing/)). Use `asyncModelRun` for flows and `scheduledModelRun` for races inside one process. Failures shrink, and `replayPath` replays the shortest sequence.

Two limits:
- The [scheduler](https://fast-check.dev/docs/advanced/race-conditions/) cannot wait for things it does not control, such as `fetch` (`waitIdle`). So controlled races need mocks. Races against a running server should be plain parallel requests with invariant checks afterwards, and those cannot be replayed exactly.
- Random runs do not promise that every transition ran. Add a counter and fail if a model transition was never hit.

**Rejected.** [XState](https://github.com/statelyai/xstate) (MIT) could give path coverage, but it means rewriting the models in its format, and the counter gets most of the gain. Not read in depth.

## 5. Red-team sets for prompt injection

**Can they run on Windows against a local route with Groq only?**

| | garak 0.17.1 | promptfoo 0.125.1 |
|---|---|---|
| Licence | Apache-2.0 | MIT. [Now part of OpenAI](https://github.com/promptfoo/promptfoo), and says it stays MIT |
| Local HTTP target | Yes, [REST generator](https://github.com/NVIDIA/garak/blob/main/garak/generators/rest.py). A cookie should work through `headers` (untested) | Yes, [HTTP provider](https://www.promptfoo.dev/docs/providers/http/) with cookies |
| Other provider needed | No, for fixed probes with string detectors | Yes by default: attacker `openai:gpt-5`, or [its own servers](https://www.promptfoo.dev/docs/red-team/configuration/) when there is no key |
| Data leaving the machine | Unverified. Some probes or detectors may fetch data or weights | [App purpose and target details go to `api.promptfoo.app`](https://www.promptfoo.dev/docs/red-team/troubleshooting/data-handling), unless turned off |
| Windows | A Windows CI badge, but the project says it is developed on Linux and macOS | Unverified |
| Install | Heavy: [torch, transformers, datasets](https://github.com/NVIDIA/garak/blob/main/pyproject.toml). Python 3.14 is untested | Node 22.22+, which we meet |

**Chosen: our own matrix, written by fresh red-team agents.** Each payload goes into each text field a model can read (titles, news, dataset cells, workspace names, memory notes, the screen digest), in English, Tamil and Tanglish. A fresh agent also writes paraphrases. Judge by a planted marker in the reply and by the action log, because that is the failure we care about. Generic tools cannot see it.

**Also used: garak's fixed probes, because the prompt asks for them.** Start with [`latentinjection`](https://github.com/NVIDIA/garak/blob/main/garak/probes/latentinjection.py), which hides instructions inside documents. Most of its probes use a string-trigger detector and no model. Leave out `LatentJailbreak`, whose classifier may need a model download. Name the probes and count the requests first, because the default runs every probe and each one spends Groq quota. Install in a venv outside the repo. If it does not install, say so and copy the payload text into our runner with the Apache notice.

**Rejected: promptfoo as a generator.**
- `PROMPTFOO_DISABLE_REMOTE_GENERATION` is, by its own docs, not a network isolation guarantee.
- [`indirect-prompt-injection`, `hijacking`, `ssrf`, `bola`, `bfla` and `ascii-smuggling` are remote-only](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/constants/plugins.ts), so the Groq-only rule removes the plugins closest to this job.
- What remains would make Groq the attacker model. The [Groq docs](https://www.promptfoo.dev/docs/providers/groq/) do not say whether that works for red-team grading (unverified).
- Its fixed encodings (base64, leetspeak, rot13) take a few lines to write ourselves.

**Groq's policy (owner should know).** The [usage policy](https://console.groq.com/docs/legal/ai-policy), effective 15 Oct 2025, bars using the service to attack systems, naming automated vulnerability discovery. It has no stated exception for your own system, though exceptions can be requested. So: Groq never writes attacks, payloads reach it only as the model under test on the app's normal path, and volume stays within its limits. This is my reading, not legal advice.

**Fixed sets checked.**

| Set | Licence | Verdict |
|---|---|---|
| [deepset/prompt-injections](https://huggingface.co/datasets/deepset/prompt-injections), 662 rows | Apache-2.0 | Use as seed payloads. Rows seen were English |
| [AgentDojo](https://github.com/ethz-spylab/agentdojo) | MIT | Read for ideas. It is a Python benchmark with its own suites |
| [InjecAgent](https://github.com/uiuc-kang-lab/InjecAgent) | MIT | Ideas only, not read in depth |
| [tensor-trust-data](https://github.com/HumanCompatibleAI/tensor-trust-data) | None detected | Rejected |
| [BIPIA](https://github.com/microsoft/BIPIA), [PINT](https://github.com/lakeraai/pint-benchmark) | Not detected / MIT | Rejected, both archived |
| [HarmBench](https://github.com/centerforaisafety/HarmBench), [JailbreakBench](https://github.com/JailbreakBench/jailbreakbench) | MIT | Rejected. They cover harmful content, and our risks are privacy, injection and unsafe actions |
| [PyRIT](https://github.com/microsoft/PyRIT) | MIT | Rejected. It is a framework and brings no fixed set I could confirm. Not read in depth |

**Tamil and Tanglish: I found no injection set.** [IndicGuard](https://arxiv.org/abs/2606.22841) and [IndicJR](https://arxiv.org/abs/2602.16832) (45,216 prompts) cover Indic languages. A search snippet says IndicGuard includes Tamil, but neither abstract names Tamil or gives a data licence (unverified), so neither is used. IndicJR saw lower attack success with romanised input on one track, on other models. That does not make Tanglish safe here, so test it.

## 6. Load testing

**Chosen: autocannon 8.0.0** (MIT, [README](https://github.com/mcollina/autocannon)).
- **p95:** listen to `instance.on('response', ...)` and feed the times into Node's `perf_hooks.createHistogram`. Checked here: that event fires in `lib/run.js`, and the histogram works on Node 24. Run without `workers`.
- **Two kinds of run:** fixed `connections` of 5, 20 and 50 with no pause, which is harder than 20 real people. Add one run with `overallRate`, because autocannon corrects for coordinated omission only when a rate is set.
- **Alone on the machine:** run when nothing heavy is running, or the numbers are noise. The load client shares the machine with the server, so say so in the report.
- **Event-loop lag:** use `monitorEventLoopDelay` in a `NODE_OPTIONS` preload, the same way as `freeze-clock.cjs`. The default sample is every 10 ms, and values are in nanoseconds ([docs](https://nodejs.org/api/perf_hooks.html)).
- **Heap snapshots:** call `v8.writeHeapSnapshot()` from the preload, triggered by a timer or a flag file. [Windows does not support signals](https://nodejs.org/api/process.html), so do not rely on `--heapsnapshot-signal` (not tried here). Do not add a route for it. A snapshot pauses the server and [takes time and memory](https://nodejs.org/api/cli.html), so leave that window out of the latency figures.

**Rejected.** [k6](https://github.com/grafana/k6/blob/master/LICENSE.md): AGPL-3.0 fails the licence rule. [Artillery](https://github.com/artilleryio/artillery) (MPL-2.0): allowed, but its scenario format adds nothing we need. [Vegeta](https://github.com/tsenart/vegeta) and [oha](https://github.com/hatoo/oha) (MIT): good fixed-rate tools, but autocannon's `overallRate` covers this, so a second tool is not clearly stronger.

## 7. Browser fuzz

**Chosen: seeded Playwright action lists driven by `fc.commands`.** Pick actions from the roles visible on the page, and type from the Unicode generators in section 2. Start each run from a fresh page on the `--frozen` build. Block any request not going to 127.0.0.1 with `page.route`. A `pageerror`, a console error or a server log error is a finding. Failures shrink to the shortest list, which the tools below do not offer on this machine. Shrinking in a browser is slow, so keep the run count low.

**Rejected.**
- [gremlins.js](https://github.com/marmelab/gremlins.js) (MIT): last push Mar 2023. It can repeat a seed but has no shrinking.
- [Bombadil](https://github.com/antithesishq/bombadil) (MIT, v0.7.10): a strong idea, exploring a UI and checking temporal properties. But its [release files](https://github.com/antithesishq/bombadil/releases) are for macOS and Linux and a Docker image, with no Windows build, and Docker is not available. Worth another look if the run ever moves to Linux.

## 8. Accessibility

**Chosen: `@axe-core/playwright` 4.14.0 (MPL-2.0), unmodified, already in `TOOLS.md`.** Use `withTags` for `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa` and `wcag22aa`.
- axe says it finds [about 57 % of WCAG issues](https://github.com/dequelabs/axe-core) on average, and [Playwright's docs](https://playwright.dev/docs/accessibility-testing) warn the same way. So 0 from axe does not mean accessible, and the report must say so.
- List every `incomplete` result. Those are items axe could not decide, and they need a person.
- Add our own check: any text with Tamil letters inside an element whose effective `lang` is not `ta`. I found no axe rule that compares `lang` with the text (unverified).
- Walk the keyboard with Playwright, including focus inside Jarvis.

**Optional, report only.** [IBM accessibility-checker](https://github.com/IBMa/equal-access) 4.0.34 (Apache-2.0) on the main pages. [Pool 2023](https://arxiv.org/abs/2304.07591) ran nine tools on 121 pages and found they overlap only a little. That is one study on one site, so it is not enough to change the target. [Pa11y](https://github.com/pa11y/pa11y) (LGPL-3.0): not needed.

## 9. Capture-recapture for defect counts

**Chosen: Chapman, per area, for two hunters.** Estimate = (n1+1)(n2+1)/(m+1) - 1, where n1 and n2 are each hunter's verified findings and m is how many both found. Chapman always gives a number, while [Lincoln-Petersen](https://en.wikipedia.org/wiki/Mark_and_recapture) (n1 n2 / m) fails at m = 0. Report the transformed-logit interval from that page, attributed there to Sadinle 2009. [El Emam and Laitenberger 2001](https://doi.org/10.1109/32.950319) found that an estimator allowing for different inspector skill suits two inspectors best (read through search results, not the full paper). Two samples of different sizes fit that case.

**When it is valid.** All of these must hold, and the report must say which ones do not:
- Same commit for both hunters. Fixes between them change the population, so never pool across passes.
- Same scope, and truly blind to each other.
- Only skeptic-verified findings count, matched by root cause.
- Each defect is equally easy to find. This is never true: easy bugs get found by everyone, which pushes the estimate down.

[Briand et al. 2000](https://pure.ul.ie/en/publications/a-comprehensive-evaluation-of-capture-recapture-models-for-estima/) found that with too few inspectors no model is accurate enough and the count can come out far too low. They recommend a model that allows for unequal detection, with a jackknife. So **read the result as a rough floor, never as a count.**

| n1, n2, overlap | Seen | Chapman | 95 % interval |
|---|---|---|---|
| 10, 8, 3 | 15 | 23.8 | 16.8 to 74.2 |
| 10, 8, 1 | 17 | 48.5 | 23.7 to 329.8 |
| 10, 8, 0 | 18 | 98.0 | 27 to 3325 |

(Computed here. The same code gives 22 to 65 for the worked example on that page, as it should.) With overlap of 0 or 1, write "too little overlap to estimate", and do not quote the number alone. Do not add up intervals across areas. The discovery rate per pass, which the prompt also asks for, is the plainer signal.

**Three or more hunters in an area:** use the bias-corrected Chao1 floor, S + f1(f1-1) / (2(f2+1)), where f1 is the count found once and f2 found twice ([scikit-bio](https://scikit.bio/docs/dev/generated/skbio.diversity.alpha.chao1.html); [Chao 1987](https://gwern.net/doc/statistics/order/capture/1987-chao.pdf) covers unequal catchability).

**Unverified.** The line "Chapman is unbiased when n1 + n2 >= N" appears only on [secondary pages](https://metricgate.com/docs/chapman-mark-recapture-estimator/), and [one paper](https://arxiv.org/pdf/2311.01297) gives a different condition from Chapman himself, so do not cite it. Chapman 1951, Seber and Sadinle were not read directly. A 2004 review by Petersson and others did not turn up in my search, so it is not used.

## 10. Confidence intervals

**Chosen: Wilson 95 % for every rate**, formula from [NIST](https://www.itl.nist.gov/div898/handbook/prc/section2/prc241.htm). [Brown, Cai and DasGupta 2001](https://doi.org/10.1214/ss/1009213286) recommend Wilson or Jeffreys for n of 40 or less, and find the good methods nearly the same for larger n. That fits the per-language rows, which are small.

**Add exact limits when wrong counts are zero or very few**, as NIST advises. With 0 of n, the two-sided upper limit is 1 - 0.025^(1/n).

| Result | Interval or upper limit (computed here) |
|---|---|
| 72 of 80 (90 %, the Groq sample) | Wilson 81.5 % to 94.8 % |
| 24 of 27 (one language) | Wilson 71.9 % to 96.1 % |
| 243 of 270 (the whole sealed set) | Wilson 85.8 % to 93.0 % |
| 0 wrong of 270 | exact upper limit 1.36 % |
| 0 wrong of 80 | exact upper limit 4.51 % |
| 0 wrong of 27 | exact upper limit 12.77 % |

So "0 wrong" on a small family is weak evidence, and each row must show its n. If the 80-row sample does not take the same share from each group, weight the overall figure and say how. **Rejected:** the plain p ± z·se interval, which NIST notes can go below zero.

## 11. Tamil normalisation and case endings

**Chosen, in this order (Phase 8, through the fix engine):**
1. **Clean up.** Apply NFC, which the [Unicode Tamil FAQ](https://www.unicode.org/faq/tamil.html) prefers. Checked here: NFC joins U+0BC6 U+0BD7 into U+0BCC, and U+0BC6 U+0BBE into U+0BCA.
2. **Two cases NFC leaves alone (checked here), so map them by hand.** The old and new spellings of SRI, which the FAQ says to treat as the same. And U+0BC6 U+0BB3, a look-alike typing of ௌ (the look-alike claim is from general knowledge, unverified).
3. **Drop zero-width characters and map Tamil digits.**
4. **Generate, do not strip.** For every name in the gazetteer, build all its forms ahead of time and match exactly. The name's last letter picks the stem change (for example சேலம் to சேலத்தில், ஈரோடு to ஈரோட்டில்), then add the endings. Do the same for Tanglish endings in Roman letters.

**Why generate.** Nothing gets stripped from an unknown word, so a word outside the table cannot match by accident, and சேலை cannot turn into சேலம். The table can be tested in full with a property test (every form returns its name) and by the word-pattern audit over real titles. Today `outside.ts` uses one flat list of endings plus special entries such as ஈரோட்டில் (checked here), and this replaces that.

**Rejected for use in the app.**
- [Snowball Tamil](https://snowballstem.org/algorithms/tamil/stemmer.html) (BSD-3): a real stemmer with a [case-ending routine](https://github.com/snowballstem/snowball/blob/master/algorithms/tamil.sbl), and it can output JavaScript. But its result [need not be a real word](https://github.com/rdamodharan/tamil-stemmer), and it strips from any word, which is the risk we want to avoid. Useful offline as a second opinion on the table.
- [ThamizhiMorph](https://github.com/sarves/thamizhi-morph) (Apache-2.0): 38 noun classes, the most thorough. It needs foma, stanza and fastText, which is far too heavy for the Next server. Use it as a reference only.
- [open-tamil](https://github.com/Ezhil-Language-Foundation/open-tamil) and [indic_nlp_library](https://github.com/anoopkunchukuttan/indic_nlp_library) (MIT): reference only. I did not check their case handling.

**Unverified.** I could not read a primary grammar for the stem-change rules (Lehmann's grammar was not found). Sources seen were [secondary](https://arxiv.org/pdf/2401.08367). So the rule table needs a check by a Tamil reader, and no agent may claim to be one. This is a place where a real person would add a lot.

## 12. Gazetteers of places outside the district

Today's `outside.ts` list has no stated source (checked here). The prompt accepts a list only if it is complete reference data with a stated source.

| Source | Licence | Use | Notes |
|---|---|---|---|
| [Wikidata](https://www.wikidata.org/wiki/Wikidata:Licensing) | CC0 | **Chosen**, for Tamil labels | Checked here: 39 of 39 items typed as an Indian district in Tamil Nadu have a Tamil label. That is one more than the 38 districts I expected, so inspect them. My count of all settlements timed out, so its coverage is unverified. Query in parts |
| [GeoNames](https://download.geonames.org/export/dump/readme.txt) | CC BY 4.0, as is | **Chosen**, for spellings and ranks | Keep the credit. `IN.zip` 15.8 MB, `alternatenames/IN.zip` 1.4 MB, `cities15000.zip` 3.4 MB (sizes read today). Tamil coverage unverified until downloaded |
| [CLDR](https://github.com/unicode-org/cldr-json/blob/main/cldr-json/cldr-localenames-full/main/ta/territories.json) | [Unicode License V3](https://www.unicode.org/license.txt) | **Chosen**, for countries | About 300 territory names in Tamil |
| [Local Government Directory](https://lgdirectory.gov.in/downloadDirectory.do) | Unverified | Cross-check only | The official list. Its page states no licence and shows no local-language field. data.gov.in returned HTTP 403 to me. The licence name (Government Open Data License - India) comes from a [third-party repo](https://github.com/planemad/india-local-government-directory). Ask the owner before shipping any of it |
| [OpenStreetMap](https://www.openstreetmap.org/copyright) | ODbL | **Rejected** | Share-alike applies to what we build from it, and we do not need that burden |
| [datameet/maps](https://github.com/datameet/maps) | MIT per API | **Rejected** | Boundaries, not names. Last push 2022 |

**How to build it (offline, with source, date and licence stored next to the file):**
- Levels: Tamil Nadu's districts, taluks and towns; India's states, districts and larger cities; then countries.
- Take out every name that is in our own store (`ref_zones`, wards, localities).
- A local name alone means ours. A local name with an outside city or state after it means outside, because some locality names exist in more than one place.
- Drop names that are common words, and prove it by running the list over every real title and category. Any hit is a finding.
- Keep one-letter fuzzy matching to long names at the first level only.
- Use the generated forms from section 11 for all of them.

Downloads, a new data file in the app and the GeoNames credit all belong to Phase 8. None of this has been built or measured yet, so no gain is claimed.
