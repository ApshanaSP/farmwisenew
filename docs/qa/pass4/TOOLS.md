# QA pass 4: tools added

All are dev-only and are never shipped to production. Licences are from each project's published licence.

| Tool | Version | Licence |
|---|---|---|
| @vitest/coverage-v8 | 3.2.7 | MIT |
| fast-check | 4.10.2 | MIT |
| @stryker-mutator/core, @stryker-mutator/vitest-runner | 10.1.1 | Apache-2.0 |
| @axe-core/playwright (with axe-core 4.14.0) | 4.14.0 | MPL-2.0 (weak copyleft), unmodified |
| autocannon | 8.0.0 | MIT |
| knip | 6.44.1 | ISC |
| madge | 8.0.0 | MIT |
| semgrep (pip, outside the repo) | see evidence/scans | LGPL-2.1 engine, run as a tool only |
| Playwright browsers: Chromium, Firefox, WebKit (installed outside the repo), and the installed Microsoft Edge 156 | with @playwright/test 1.63.0 | Apache-2.0 |

Installing them moved one transitive package that production can load: `nanoid` 3.3.19 to 3.3.20 (a patch, pulled in by the newer `postcss`). `postcss` 8.5.28 to 8.5.32, `axe-core` and `is-core-module` also moved, all dev. No production dependency was added or removed.
