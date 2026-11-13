# Fix-all run: state

- 2026-11-12 23:50 IST: start. The owner said "fix all" after pass 6 went to main (`d399015`). The branch is `claude/fixall-a84a72`, cut from `d399015`.
- Scope: pass 6's 131 open P1–P3 rows. The 14 open P0s are fixed by a separate session ("Fix pass 6's 14 open P0 bugs") in its own worktree. The 13 owner rows stay the owner's.
- Clusters (`rows-*.json`): desk 39, officer 22, collector 17, platform 18, ai 4, P0side 31.
  - The P0side rows have their fix in the P0 session's files. They are done after its branch, or by that session.
- One fixer agent at a time in this worktree (15 GB of memory, with the P0 session running alongside). A read-only reviewer reads each finished cluster.
- Ports: this run uses 3110–3113 and the pinned API on 3196; the P0 session uses 3106–3109 and 3197.
- Studio fixture port 4599: a default-config vitest run first takes the lock folder `vitest-4599.lock` in the shared notes folder.
- Rules for agents: `FIXER_RULES.md`.
