# npm audit, 27 Oct 2026 (LT-42)

`npm audit` in `chennai-grievance-portal-main`:

| | Critical | High | Moderate | Total |
|---|---|---|---|---|
| Before | 3 | 7 | 3 | 13 |
| After `npm audit fix` (no breaking changes) | 3 | 5 | 1 | 9 |

**Patched** (lock file only, no code change):
- nodemailer → 10.2.1
- undici → 7.30.1 (inside the AI SDK)
- vite → 7.3.7 (tests only)
- postcss-selector-parser

The direct `postcss` is 8.5.28, which is not affected.

**Mitigated in config:** `next.config.js` now has `images: { unoptimized: true }`. No page uses `next/image` (the logo is a
plain `<img>`), so the Image Optimization API is switched off. Two critical advisories and three image DoS advisories
live in that API.

Everything left needs a **major upgrade**, and that is the owner's decision: Next 14 → 16, zod 3 → 4, vitest 3 → 5.

## Act first: Windows remote code execution

**GHSA-p293-qw3h-jr36**, critical: *Unauthenticated Remote Code Execution on windows-hosted servers*, fixed in Next 15.5.24 / 16.x.
**It applies:** the site runs on this Windows PC, and `next dev` listens on **all network interfaces** (`0.0.0.0:3000`),
so anyone on the same Wi-Fi or LAN can reach it.

Until Next is upgraded, do one of these:
- Listen on this PC only: change the `dev` script in `package.json` to `next dev -H 127.0.0.1` (and the same `-H` in
  `.claude/launch.json`). Phones and other PCs on the network can then no longer open the site.
- Or block inbound TCP 3000 to 3002 in Windows Defender Firewall on public and untrusted networks.
- Or upgrade (below), which closes it properly.

## next 14.2.35: 24 advisories

| Advisory | Applies here? | Mitigation |
|---|---|---|
| RCE in Image Optimization API via AVIF / SVG (GHSA-2xp9-vwfh-vxw4, GHSA-2464-fhr4-w9xw), critical | No longer | Optimizer off (`images.unoptimized`) |
| Image Optimizer DoS, disk-cache growth, remotePatterns DoS (GHSA-h64f-5h5j-jqjh, GHSA-3x4c-7xq6-9pq8, GHSA-9g9p-9gw9-jx7f) | No longer | Optimizer off |
| RCE on Windows-hosted servers (GHSA-p293-qw3h-jr36), critical | **Yes** | See above: bind to 127.0.0.1 or firewall; upgrade |
| DoS with Server Components (GHSA-h25m-26qc-wcjf, GHSA-q4gf-8mx6-v5v3, GHSA-8h8q-6873-q5fj) | Yes: App Router pages | Local deployment only; upgrade |
| Server Actions: DoS, SSRF on custom servers, unbounded payload, endpoint disclosure (GHSA-m99w-x7hq-7vfj, GHSA-p3m5-59mp-jv5r, GHSA-89xv-2m56-2m9x, GHSA-4c39-4ccg-62r3, GHSA-955p-x3mx-jcvp) | No: no `"use server"` anywhere | None needed |
| Rewrites: request smuggling, SSRF (GHSA-ggv3-7p47-pfv8, GHSA-p9j2-gv94-2wf4) | No: no rewrites | None needed |
| Middleware bypass in Pages Router with i18n (GHSA-36qx-fr4f-26g5) | No: App Router, no i18n | None needed |
| Middleware redirect cache poisoning, RSC cache poisoning / confusion (GHSA-3g8h-86w9-wvmq, GHSA-vfv6-92ff-j949, GHSA-wfc6-r584-vfw7, GHSA-68g3-v927-f742, GHSA-4633-3j49-mh5q) | Low: needs a shared cache or CDN in front, and there is none | None now; re-check before putting a CDN in front |
| XSS with CSP nonces (GHSA-ffhc-5mcf-pf4q), XSS in `beforeInteractive` scripts (GHSA-gx5p-jg67-6x7h) | No: no nonces, no `beforeInteractive` | None needed |
| SSRF with WebSocket upgrades (GHSA-c4j6-fc7j-m34r) | No: no WebSocket server (dev hot reload only) | None needed |

**Upgrade path:** `next@16` with `eslint-config-next@16` (React 19 is required). It is a major upgrade: the App Router
caching defaults, `next.config` keys (`experimental.serverComponentsExternalPackages` → `serverExternalPackages`,
`instrumentationHook` no longer needed) and some types change. Budget half a day to a day, plus the full test run and a
click-through of every page. Next 15.5.24 would close the Windows RCE but not the SVG optimizer RCE, which is closed here
by switching the optimizer off.

## Other packages

| Package | Severity | Applies here? | Mitigation |
|---|---|---|---|
| zod 3.x (GHSA-mrhx-c7xc-m3w5: memory exhaustion validating oversized constrained collections) | High | Barely: zod checks request bodies that are already size-limited (chat message ≤ `LIMITS.messageChars`, Next's 1 MB body limit) and the AI's JSON | Keep the body limits. zod 4 is a migration across 38 files plus the AI SDK schemas |
| vitest 3, tinypool, @vitest/mocker (path traversal, code injection, prototype pollution) | Critical (dev only) | No in production: the test runner is not shipped and runs only on this repository's own tests | Do not run `vitest --ui` or the browser mode on a shared network; vitest 5 when convenient |
| eslint-config-next 14 / glob CLI command injection | High (dev only) | No: the glob CLI is never run (lint is skipped in builds) | Goes away with Next 16's `eslint-config-next` |
| postcss inside next 14 (8.4.31) | High | No: it only processes this repository's own CSS at build time | Goes away with Next 16 |
