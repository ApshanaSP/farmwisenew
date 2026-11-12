# QA pass 6: rules for every agent

Read these before anything else. Breaking one ends your job.

1. **Where you may write.** Only inside `E:\farm\.claude\worktrees\qa-pass6-a84a72`, and there only:
   - your findings file `docs/qa/pass6/findings/<your-name>.json`,
   - probe tests in `chennai-grievance-portal-main/tests/qa/pass6/probes/<your-name>/` (run them with
     `npx vitest run --config vitest.p6probe.config.ts tests/qa/pass6/probes/<your-name>` from `chennai-grievance-portal-main`),
   - evidence files in `docs/qa/pass6/evidence/<your-name>/` (screenshots, logs; never a password, cookie, token or `.env` value),
   - scratch files in your own scratchpad directory.
   Never edit `src/`, an existing test, a config file, or anything in another worktree or in `E:\farm` itself. If a write is refused, **stop that action** and say so in your report. Never get round a refusal with `node`, `sed`, redirects or any other shell trick.
2. **Git is read-only for you:** `log`, `show`, `diff`, `blame` only. No commit, checkout, stash, reset, merge or branch.
3. **Do not run** `npx vitest run` without `--config vitest.p6probe.config.ts`, `npm run build`, `next build`, `npm ci`, or any server, unless your brief gives you a port and a command. The default vitest config shares a fixture server on port 4599 with the lead's runs: never use it. Keep each probe run narrow (one folder or file).
4. **Secrets:** never read, print or log `.env` or any key, password or token. Test-account passwords are read by `tests/qa/pass6/lib/live.mjs`; never print them. Never open `C:\Users\arjun\OneDrive\Desktop\FAI HELPER\Task_6 (2).pdf`. Never open `docs/qa/pass4/testsets/sealed.jsonl.gz` or `authoring-trail.json.gz`.
5. **Real systems:** nothing may reach AWS, a mail server, an SMS provider or any outside host. `AWS_STORE_DRY_RUN=1` always. No model calls (no Groq, no Claude, no other provider). Attack only `127.0.0.1` on the port your brief gives.
6. **Stay blind:** do not read `docs/qa/pass4/BUGS.json`, `docs/qa/BUGS.md`, `docs/qa/pass5/BUGS.json`, `docs/qa/pass6/BUGS.json` or other agents' findings files before you have written yours, unless your brief says otherwise.
7. **Findings file:** a JSON array, one object per finding:
   `{ "id": "<name>-NN", "severity": "P0|P1|P2|P3", "area": "...", "title": "...", "where": "file:line", "repro": "a command or exact steps", "evidence": "what you saw (short)", "cause": "your best reading of the root cause", "confidence": "high|medium|low" }`.
   Only "high" when you ran it, or the code path is unambiguous and you quote the lines. Save as you go, so a cut-off loses nothing.
8. **Severity:** P0 = wrong number, confident answer about the wrong thing, privacy or security failure, a real message sent, unsafe action, crash, data loss, broken sign-in. P1 = a feature does not do what it says. P2 = works but confusing, slow or misleading. P3 = polish.
9. **Report:** your last message is under 250 words: counts by severity, then the top five findings in one line each with `file:line`.
10. **Time:** you have a time box in your brief. Run `date` now and then; when the box is used up, save your findings file and report, even if you are mid-way.
