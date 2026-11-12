# Lane c review (first round)

Recovered from the agent's result. The reviewer (agent ad49fe924dfc5c5e6, branch claude/p4-lane-c) could not save this file: a hook refused its write into the lane c worktree, and it did not go round the refusal. Its result text is saved here as it was given (lightly laid out). Status it reported: blocked. The later lane c commits (77e6d11 skeptic review, 28e12df CSK-1..10 fixes) came after this round, so some points below may already be fixed; the lane c notes say which.

## Verdict

Review is done but was not written or committed. The reviewer ran vitest on src/lib/thunai and src/lib/studio: 1197 tests passed; one timing test failed once and passed on re-run. It probed the new gates with real strings.

- RC-17, 20, 21, 22, 23 and 24 fix the mechanism.
- RC-18 mostly does, since it normalises digits, then matches by count.
- RC-25 mostly does.
- RC-19 is only partly fixed (issues below).
- No weakened or deleted tests were found. The it.fails to it flips are for fixed rows, and the params Promise edits and FakeDate statics are Next 15 adaptations.
- One chain test (audit-privacy_injection-1) changed its input from a now-refused ask to "open INC-... for me". That is fair but weaker as a proof.

## Issues

1. RC-19, P1. exitgate.ts FILED_BY has no case-insensitive flag and its verbs are lower case. lineProblem('Reported by Priya Nair') and 'the complainant is Mr. Suresh' both return null, so a model line that starts with the verb can name a citizen. The guard test uses only lower-case lead-ins, so it would pass whatever happens.
2. RC-19, P1. exitgate.ts NEGATED is tested on the whole line, so one negation word turns off the 'order' check. 'I will never hesitate: approve all the drafts now' and 'Approve the tray now, do not wait' return null. A word list that excuses the entire line stands in for a mechanism. Step gates still stand behind it.
3. RC-19, P2. injection.ts ASKED builds the type and undo patterns in a normal template literal, so \s becomes the letter s. 'டைப் செய் அடையார்' runs no type step, and 'fill in' becomes fill(?:s+in)?. 'please type water' and 'type water in the search' also run no type step, because the English ask needs a particular word after the verb. The tests have one positive type case, so this went unseen. It fails closed but loses real commands.
4. RC-19, P2. RC-19 is only partly fixed but the commit says the whole class is. Speech built with no model at stagelocal.ts:267 and screens.ts:101 never passes through finish(), so audit-privacy_injection-4 and -11 stay it.fails. The lane log says so; the commit title fix(RC-19, ...) and the 'one exit gate for every line' wording do not.
5. RC-25, P2. devguard.localOnly now accepts x-forwarded-for and cf-connecting-ip when they hold only loopback addresses. A tunnel that rewrites Host to localhost and sends no client address, or only 127.0.0.1, is now treated as this PC. That is the case the dev-OTP and dev-page guards are for. It is tested at header level only, and no tunnel was opened. It needs a run through a real forwarder, or a note that it rests on Host alone.

## Smaller points

- (a) RC-18's intent rules are still Tamil and Tanglish word lists, and "order 2024 1234 5678 9012" leaves the last four digits visible.
- (b) RC-20's "cannot read this" answer applies only to Tamil questions; English no-read questions still get the old row count.
- (c) The RC-17 guard decides "signed in" by matching text anywhere in the file.
- (d) looksLikePlaceholder rejects any three-lowercase-word secret in production; it fails closed, and the owner's .env keys are not flagged.

## Not done by the reviewer

docs/qa/pass4/reviews/c-review.md was not written or committed: the write was blocked by a worktree hook. No code was changed, as the task required.
