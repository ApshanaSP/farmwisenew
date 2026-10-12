# Collector console redesign: progress checkpoint

Scope: the Collector console only (`/collector`). Citizen and officer portals are untouched. Visual layer only: no
API, data, auth, routing or logic changes. Everything new is scoped to `.dic.cc` (the Collector root in
`CollectorApp.tsx`), so removing the imports below restores the previous "Marina" look.

## Design decisions
- Language: "Command Centre" (calm civic intelligence). One accent (deep ocean `#0A3D62` / `#0B7290`), severity colours
  only for severity, Geist type with tabular figures, hairline edges instead of heavy shadows, no dark page band.
- Navigation stays a top bar (5 pages): a sidebar would take ~200px from a 4-column, fit-to-screen layout and cut more text.
- No new dependencies: the project already has `motion`, `echarts`, `leaflet` and its own UI kit (`components/ui`).
  shadcn/Radix/Tremor would add a second component system next to the existing one.
- Motion: CSS only (entrance stagger, page fade, drawer/modal slide), all under `prefers-reduced-motion`.

## Files
- `src/components/collector/app/command.css` (new): the Command Centre layer
- `src/components/collector/app/studio/studio-command.css` (new): Data Studio in the same language
- `CollectorApp.tsx` (root class `cc`, import), `studio/Studio.tsx` (import), `studio/Dataset.tsx` (skeleton),
  `studio/Hero.tsx` (orb colours), `assistant/Brand.tsx` (AI mark follows `--ai`)
- `Overview.tsx`: grid composition only (map wider; My Tasks + news share the right column). Same panels, same handlers.
- `components/ui/chartTheme.ts`: `currentFont()` (charts use the console's own font; officer unchanged);
  `assistant/ChartRenderer.tsx`, `studio/StudioChart.tsx` use it.

## Bold layer (2026-10-08, user asked for a stronger look with animation)
- `command-bold.css` (new, imported after command.css): navy command bar with glowing sliding tab indicator, ambient
  page wash, KPI accent edges that draw in + bigger numbers + sparklines that draw, card hover lift + cursor spotlight,
  rows cascading in, severity bar growing, freshness and Ask rings (finite). All off under reduced motion.
- `CollectorApp.tsx`: `spotlight()` pointer handler (sets --mx/--my on the hovered card only) + import.
- Verified: 1440 light + dark, no page errors, tsc clean, vitest 330 passed.

## Status
- [x] Tokens, header, KPI tiles, flat rows, one accent, Data Studio colours, dataset skeleton, dark mode, phone width
- [x] Overview composition (map as centrepiece) — verified 1440 light
- [x] Briefing: narrative key points, critical list, flat lists — verified 1440 light + dark
- [x] Motion (entrance stagger, page fade, modal/drawer/popover, hover/press/focus; reduced-motion off)
- [x] Map frame/legend, chart fonts, incident labels; assistant inherits tokens — verified opening incident,
      assistant, Trends drill-down (no page errors)
- [x] QA 2026-10-08: tsc clean, vitest 330 passed, screenshots 1440 light/dark, 1280, 390
- [ ] Not done: 1920 check; tables beyond Trends; incident dialog loading skeleton (text "Loading the incident…");
      long titles still truncate in narrow cards; officer/citizen intentionally untouched

## How to verify
Screenshots: scratchpad `shots.mjs` (Playwright + installed Edge, seed accounts from `scripts/seed-users.js`, localhost).
Tests: `npx vitest run`; types: `npx tsc --noEmit`.
