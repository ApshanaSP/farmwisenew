# District IQ — Complete UI Redesign Prompt

> Paste this whole file into your coding agent (Claude Code, Cursor, etc.) from inside
> `chennai-grievance-portal-main/`. It is written as instructions to the agent.

---

## 0. Your mission

You are redesigning the **entire user interface** of *District IQ — Chennai Intelligent District Governance Platform*
(Next.js 14 App Router · React 18 · Tailwind 3 · Leaflet · ECharts 6 · `motion` 14 · `animejs` 4 · lucide-react).

Rebuild **every screen, every card, every dialog** with a new visual identity and a **professional motion system**, so it
looks like a premium product (Linear / Vercel / Stripe level) and is **easier to understand and navigate** for three
users: a **Citizen**, a **Department Officer**, and the **District Collector**.

This is a **UI-only** change. The functionality, data and numbers stay exactly as they are.

### 0.1 Hard rules (do not break)

1. **Do not change** anything in `src/app/api/**`, `src/lib/**` (except pure display helpers), `scripts/**`, `migrations/**`,
   `district_intel/**`, or any data-fetching / business logic. Same API calls, same query params, same payloads.
2. **Every number shown must stay identical** to today — and every count must still equal the list it opens
   (this was fixed in Round 18; don't regress it).
3. **Keep every feature** listed in Section 5. Nothing is removed, renamed in a way that changes meaning, or hidden behind
   extra clicks unless this prompt says so.
4. **Desktop fits one screen** on Collector and Officer consoles (1366×768 and 1920×1080): no page scroll; long lists
   scroll *inside* their card or use "See all". Keep the `useFit` behaviour (only whole rows, then "See all").
5. **Dark and light themes** both fully designed. Keep the `diq-theme` localStorage key and the pre-paint script in
   `layout.tsx`.
6. **English + Tamil (+ Tanglish input)** must render correctly everywhere (load a Tamil font, see 2.3).
7. **Accessibility**: WCAG AA contrast, visible focus rings, full keyboard use (PageUp/PageDown pager, Ctrl+K assistant,
   Esc closes overlays), `aria-*` kept, and **`prefers-reduced-motion` respected by every animation**.
8. **Performance**: no layout-shifting animations, animate only `transform`/`opacity`/`filter`/`clip-path`; 60 fps on a
   mid-range laptop; no new heavy dependency over ~30 kB gzip without a reason.
9. Keep existing `aria-label`s and button texts that automated checks use; after each phase run `npm run lint`,
   `npm test`, and click through every page in both themes.

---

## 1. Design direction — "Civic Command"

A calm, precise **operations console** for government: graphite surfaces (not navy), one confident azure accent,
a violet accent reserved for AI, and severity colours that are instantly readable. Feels like a modern mission-control
room, not a generic admin template.

**Personality:** trustworthy · calm · fast · data-first · humane (plain-language labels, never jargon).

**Inspiration — study these for patterns and motion (use as reference, build our own; only copy code from MIT/open-licensed libraries):**

| Area | Look at | What to take |
|---|---|---|
| App shell, nav, command palette | **linear.app**, **raycast.com**, **vercel.com/dashboard** (Geist design system: vercel.com/geist) | Thin top bar, icon rail, ⌘K palette, crisp 1px borders, subtle hover states |
| Dashboard cards & charts | **Tremor** (tremor.so — open-source dashboard blocks), **Stripe Dashboard**, **shadcn/ui blocks** (ui.shadcn.com/blocks) | KPI tiles with sparkline + delta, chart cards, data tables |
| Motion components | **Magic UI** (magicui.design): *Number Ticker, Blur Fade, Animated List, Border Beam, Shimmer Button, Bento Grid, Animated Beam, Dock*; **Aceternity UI** (ui.aceternity.com): *Spotlight, Background Beams, Multi-step Loader, Placeholders & Vanish Input, Floating Dock*; **React Bits** (reactbits.dev): *Count Up, Split Text*; **motion.dev/examples** | Number count-ups, staggered entrances, shared-layout morphs, glowing borders for "live/AI" |
| Forms, OTP, steppers | **Origin UI** (originui.com), **input-otp** examples, shadcn form blocks | OTP boxes, stepper, file dropzone, comboboxes |
| Maps | **Mapbox Studio** dark styles, **kepler.gl**, CARTO *Dark Matter / Positron* basemaps | Dark vector-style basemap, glow pins, heat shading |
| Moodboards | **godly.website**, **mobbin.com** (dashboards, onboarding), Dribbble "smart city dashboard" | Overall polish, spacing, hierarchy |

**Optional small libraries (add only if useful):** `cmdk` (command palette), `sonner` (toasts), `vaul` (mobile bottom
sheets), `@number-flow/react` (animated numbers), `input-otp` (OTP fields). Already installed: `motion`, `animejs`,
`echarts`, `leaflet`, `lucide-react` — use these first.

---

## 2. Design system (build this first — Phase 1)

Replace `src/components/collector/app/tokens.css`, regenerate `src/app/theme.css` with
`node scripts/gen-portal-theme.js` (update the script's mapping to the new tokens), and update `tailwind.config.ts`.
All three portals (citizen, officer, Collector) and the assistant must read from **one token set**.

### 2.1 Colour tokens

**Dark (default)**

| Token | Value | Use |
|---|---|---|
| `--bg` | `#0A0B0E` | App background (with faint 1px grid + soft radial glow at top) |
| `--bg-2` | `#0E1014` | Workspace behind panels |
| `--surface` | `#13161B` | Panels / cards |
| `--surface-2` | `#191D23` | Rows, inputs inside panels |
| `--surface-3` | `#20252D` | Hover |
| `--elev` | `#161A20` + `backdrop-filter: blur(16px)` at 92% | Popovers, dialogs, assistant |
| `--line` / `--line-2` / `--line-3` | `rgba(255,255,255,.08 / .05 / .14)` | Borders |
| `--text` / `-2` / `-3` / `-4` | `#EDEFF3` / `#B4BAC5` / `#848B98` / `#565D6A` | Text levels |
| `--accent` | `#3D8BFF` (Marina azure) | Primary actions, selection, links |
| `--accent-grad` | `linear-gradient(135deg,#3D8BFF,#5B6CFF)` | Primary button, active tab pill |
| `--ai` | `#A78BFA` (violet) + `--ai-grad: linear-gradient(135deg,#A78BFA,#3D8BFF)` | **Only** AI things: Ask District IQ, AI briefing, onboarding agent |
| `--live` | `#22D3EE` | Live/freshness dot, data refresh pulse |
| `--critical` | `#FF4D6D` | Severe, deaths, errors |
| `--high` | `#FF9F43` | High severity, warnings |
| `--medium` | `#F5C451` | Medium, pending, IMD watch |
| `--low` / `--ok` | `#2BD99F` | Low, verified, resolved, good |
| `--neutral` | `#8B93A1` | Low priority / unknown |
| each semantic | `-soft` (14% alpha bg) and `-line` (40% alpha border) | Chips, tinted badges |

**Light**: page `#F6F7F9`, surface `#FFFFFF`, surface-2 `#F9FAFB`, lines `#E6E8EC`, text `#0F1115 / #4A5260 / #6B7280 / #A3A9B4`,
accent `#1F6FEB`, AI `#7C3AED`, critical `#E11D48`, high `#EA7A0C`, medium `#B7860B`, ok `#059669`. Soft shadows instead of
borders-glow.

**Colour rules:** colour carries meaning only. Azure = interactive/selected. Violet = AI. Red/orange/yellow/green = severity
and status. Everything else is neutral greys. Never use more than 2 accent hues in one card.

**Data-viz palette (ECharts):** `#3D8BFF, #22D3EE, #A78BFA, #F5C451, #2BD99F, #FF4D6D`; grid lines `--line-2`; axis text `--text-3`.
Map choropleth: sequential azure → violet → critical (5 steps), with a legend bar.

### 2.2 Shape, depth, spacing

- Radius: `--r-xs 6px` (chips), `--r-sm 8px` (inputs/buttons), `--r 12px` (cards), `--r-lg 16px` (dialogs), pill `999px`.
- Spacing scale: 4 · 8 · 12 · 16 · 20 · 24 · 32. Card padding 16 (compact consoles) / 24 (citizen pages).
- Depth: cards = 1px border + `inset 0 1px 0 rgba(255,255,255,.04)` top light + soft drop shadow. Dialogs = large blurred
  shadow + 1px border. No heavy glows except on focus and AI elements.
- Card header pattern (`.ch`): 28px tinted icon chip · title (14.5px/600) · muted subtitle · right-aligned count badge and
  "See all →" link. Same everywhere.

### 2.3 Typography

- UI: **Geist** (via `next/font/google` → `Geist`) — fallback Inter. Numbers: **Geist Mono** with `font-variant-numeric: tabular-nums`.
- Tamil: **Noto Sans Tamil** (`next/font/google`, weights 400/600) added to the font stack so Tamil never falls back to a system font.
- Scale: 11 (labels, uppercase +0.06em) · 12.5 · 13.5 (body in consoles) · 15 (body in citizen pages) · 17 · 20 · 26 · KPI number 30/600 tight.
- Headlines: `letter-spacing: -0.02em`. Max line length 70ch for any prose.

### 2.4 Iconography

lucide-react only, 1.75 stroke, 16px in rows, 18px in buttons, 20px in rail. Every department gets a fixed icon + tint
(keep `deptIcon()`), reused in map pins, chips and snapshots.

### 2.5 Component kit — create `src/components/ui/`

Build once, use in all three portals (replace the duplicated `diq-*`, `.dic` and officer-only classes):

`Button` (primary / secondary / ghost / danger / ok / ai; sizes sm 28 / md 36 / lg 44; loading spinner state) ·
`IconButton` · `SegmentedControl` (sliding pill indicator) · `Select` / `Combobox` (keep current Combobox logic) · `Chip` / `FilterChip` (removable) ·
`StatusPill` (all 7 complaint statuses + 6 officer stages, each with colour + icon) · `SeverityBadge` · `Card` + `CardHeader` ·
`KpiTile` · `Sparkline` · `Tabs` (animated underline/pill) · `Dialog` · `Drawer` (right side; bottom sheet on mobile) ·
`Popover` · `Tooltip` (200 ms delay, fades) · `Toast` · `Skeleton` (shimmer) · `EmptyState` (icon + one line + action) ·
`DataTable` (sticky header, sticky first column, row hover, sort arrows) · `Timeline` · `Stepper` · `OtpInput` ·
`Dropzone` · `Avatar` · `LiveDot` · `CountUp` (reuse `lib.tsx` count-up) · `Kbd` (shortcut hint).

---

## 3. Motion system (Phase 1, used everywhere)

Create `src/components/ui/motion.ts` with shared presets, and wrap each app in `<MotionConfig reducedMotion="user">`.

### 3.1 Tokens

| Token | Value | Use |
|---|---|---|
| `--t-instant` | 90 ms | Hover colour, press |
| `--t-fast` | 160 ms | Tooltips, chips, toggles |
| `--t-base` | 240 ms | Dropdowns, tabs, cards |
| `--t-slow` | 380 ms | Dialogs, drawers, page change |
| `--t-enter` | 520 ms | First-load entrances, charts |
| `ease-out` | `cubic-bezier(.16,1,.3,1)` | Entrances |
| `ease-in-out` | `cubic-bezier(.65,0,.35,1)` | Moves |
| `spring.snappy` | `{type:"spring", stiffness:420, damping:34}` | Indicators, toggles |
| `spring.soft` | `{type:"spring", stiffness:220, damping:28}` | Dialogs, drawers, shared layout |

### 3.2 Motion rules

1. **Motion explains, never decorates.** Every animation answers "where did this come from / where did it go / what changed".
2. **Entrances once.** Dashboard cards stagger in (40 ms apart, `opacity 0→1`, `y 8→0`, `blur 4px→0`) on first load only — not on every filter change.
3. **Filter / period change:** content cross-fades (160 ms) and **numbers roll** to new values (count-up/number-flow); charts morph (ECharts `universalTransition: true`), never blank-then-redraw.
4. **Shared-element morphs:** clicking a KPI tile, a severity row, a task, or a news item opens its dialog/drawer **growing from that element** (`motion` `layoutId`), and closing returns to it.
5. **Active indicators slide:** pager pill, tabs, segmented controls, rail selection use one `layoutId` indicator that slides with `spring.snappy`.
6. **Feedback within 100 ms:** buttons scale to .97 on press; Verify → button morphs into a green check, the task row collapses (height + fade, 280 ms) and the count badge ticks down.
7. **Loading:** skeletons with a left-to-right shimmer shaped like the real content; never spinners on whole cards. Over 1.2 s show a thin progress bar at the top bar.
8. **Live data:** when the pipeline sends new data, the freshness chip pulses once (`--live`), the toast slides in from top-right, and changed numbers flash a soft azure background for 1 s.
9. **Only two infinite animations allowed:** the live dot pulse and the AI "thinking" shimmer. Nothing else loops.
10. **Reduced motion:** replace all movement with 120 ms opacity fades; numbers jump; map uses `setView` instead of `flyTo`.

### 3.3 Signature moments (make these feel premium)

- **Login → console:** after successful sign-in, the auth card scales to 0.98 + fades, and the console shell assembles (top bar slides down 12px, rail slides from left, cards Blur-Fade in stagger). ≤ 900 ms total.
- **Pager change (Collector/Officer pages 1–4):** horizontal slide-and-fade — new page enters 24px from the direction of travel; the pager's pill slides; page title text swaps with a vertical roll.
- **Map focus:** selecting a zone/taluk/incident → `map.flyTo` (0.9 s, ease-in-out) while the selected ward outline draws in (stroke-dashoffset) and a pin drops with a small bounce + one ripple ring.
- **AI answer:** the Ask District IQ answer streams with a violet **Border Beam** on the answer card; charts inside the answer draw in after the text settles.
- **Complaint registered (citizen):** success check draws itself (SVG path), the complaint code rolls in digit by digit, a subtle confetti burst of 12 particles in brand colours (skip with reduced motion).

---

## 4. Global layout & navigation

### 4.1 Consoles (Collector + Officer) — new shell

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ TOP BAR 56px: ◆ District IQ │ ⌘K Search… │ Live·Collected 06:00 │ + Add source │ ⧉ Workspace │ ☀ │ ⚙ │ 🔔 │ (avatar) │
├────┬─────────────────────────────────────────────────────────────────────────┤
│RAIL│ PAGE HEADER 48px: Title (rolls on change) · Filter bar (Period seg · Zone · Taluk · Dept · active chips · Clear) · Pager ①②③④ │
│ 64 ├─────────────────────────────────────────────────────────────────────────┤
│ px │ BENTO GRID (fits viewport, 12-col, 12px gaps)                            │
│    │                                                                         │
└────┴─────────────────────────────────────────────────────────────────────────┘
                                                         (✦ Ask District IQ fab, bottom-right)
```

- **Icon rail (64px)** replaces the current 84px rail: one icon per page (Overview, Briefing, Trends, Environment & markets),
  then a divider, then Sources, Export, Audit/Workspace. Hover expands a label tooltip; active item has the sliding azure pill
  and a 2px left bar. Collapses to a bottom tab bar on mobile.
- **Top bar**: brand mark (new logo, see 4.3), **command palette search** (cmdk; searches incidents, zones, departments,
  and also *actions*: "Go to Trends", "Export weekly PDF", "Switch to light theme", "Open Data sources"), **one freshness chip**
  ("● Collected today, 06:04" / "2 feeds missing" in orange) that opens the feeds popover, **Add source** (the onboarding link
  dock — becomes a button that expands into an input with the rotating placeholder words "RSS feed / JSON API / web page / login portal"),
  Workspace, theme toggle (sun↔moon morph icon), Customize, Alerts bell (badge with count, shakes once when new), avatar menu
  (name, role, "Logged in as …", department head contact for officers, Sign out).
- **Filter bar**: Period segmented control (Daily · Weekly · Monthly · Quarterly with tooltip windows), Zone, Taluk,
  Department selects with icons, active filter chips (category chip removable), "Clear" text button that only appears when a
  filter is set. Filters hidden on pages that are district-wide (Trends, Environment) — show a small "District-wide" tag instead.
- **Pager**: ‹ ① ② ③ ④ › with the current page's name inside the active pill; PageUp/PageDown keep working; shows `Kbd` hint on hover.

### 4.2 Citizen portal shell

Top bar 64px (glass, sticky): logo · nav **Overview · File a Complaint · Track Status** (sliding pill on the active link) ·
Helpline **1913** chip (click-to-call on mobile) · theme toggle · avatar menu (Profile, Sign out). Mobile: bottom tab bar with
a centre raised **"+ File"** button. Content max-width 1200px, generous spacing (citizen pages *may* scroll).

### 4.3 Brand

New logo mark: a simple geometric **kolam-inspired dot-grid "D"** or a pin + pulse inside a rounded square, in the azure gradient;
wordmark "District IQ" in Geist 600 with "Chennai" small caps beneath. Favicon + app icon. Update `Logo.tsx`, `Brand.tsx` (assistant
uses the violet gradient variant). Footer: "District IQ · Chennai Intelligent District Governance Platform · Helpline 1913".

---

## 5. Screen-by-screen redesign (every functionality)

For each screen: **Purpose → Layout → Components → Motion → States (loading / empty / error)**.

### 5.1 Sign-in, Create account, Forgot password (`/login`, `/register`, `/forgot-password`, `AuthShell`, `AuthHeroPanel`)

- **Purpose:** one entrance for citizens, department officers and the Collector. Must fit one screen, no scroll.
- **Layout:** split screen. Left 55%: **hero** — dark map of Chennai district (static SVG of zone outlines) with animated
  pins appearing and connecting lines (Magic UI *Animated Beam* style) between "Citizen → Officer → Collector", headline
  "One platform for Chennai's citizens, officers and Collector", three small proof stats (count-up). Right 45%: auth card.
- **Login card:** role-neutral, Email/Mobile + password (show/hide eye), "Forgot password?", primary gradient button with
  loading state, "Create account" link. Errors shake the card once (x: ±6px, 3 times, 300 ms) and show an inline message.
- **Register:** compact 2-column form, live **PasswordStrengthMeter** as a 4-segment bar that fills and changes colour,
  OTP step uses `OtpInput` (6 boxes, auto-advance, paste support, resend timer ring that counts down).
- **Forgot password:** 3-step stepper (Request OTP → Verify → New password) inside one card; steps slide horizontally.
- **Motion:** hero Spotlight that slowly follows the cursor (disabled on reduced motion), card fades up, field focus = azure ring grows in.
- **Light theme:** hero becomes a soft paper map with azure pins.

### 5.2 Citizen home (`/citizen`)

- **Header:** "Vanakkam, {name}" + date; primary CTA **File a Complaint** (Shimmer Button), secondary Track Status.
- **3 KPI tiles** (total filed, in progress, resolved) with count-up and a tiny ring progress for "resolved %".
- **Recent complaints:** cards with complaint code (mono), category icon, title, area, `StatusPill`, and a **mini 4-step progress
  bar** (Filed → Approved → In progress → Verified). Click opens the tracking view with a shared-element morph.
- **Quick actions:** large tiles (File, Track, Profile, Call 1913) with hover lift and icon nudge.
- **Empty state:** illustration-free friendly card "You haven't filed any complaints yet" + File button.

### 5.3 File a Complaint wizard (`/citizen/file-complaint`) — 5 steps

Keep all logic (GCC 17 categories / 327 sub-types, ward detection, 53.8k streets, map pin, "Other" → AI routing, evidence upload).

- **Stepper** at top: 4 numbered steps (Your details · Location · Complaint type · Details) with a progress line that fills
  between steps (scaleX, 400 ms). Completed steps show a check and are clickable to go back. Steps slide left/right.
- **Step 1 – Your details:** 2-column form, prefilled from profile with a "Prefilled from your profile" note; PIN code validation inline.
- **Step 2 – Location:** large **MapPicker** (60% width) + form (40%). Drop pin → pin bounces, ward/zone detected chip animates
  in ("Ward 112 · Zone 9 Teynampet ✓"). "Use my location" button with a pulsing locate icon. Street Combobox with highlighted match text.
- **Step 3 – Complaint type:** **visual category grid** — 17 cards with icon + name (search box on top filters with a layout
  animation). Choosing a category flips to its sub-types as a searchable list with counts; breadcrumb "Roads › Potholes" to go back.
  Show "We'll send this to: {Department}" chip that appears after selection (this is what auto-routing decided).
- **Step 4 – Details:** title, description with character counter and language hint (English / தமிழ் / Tanglish welcome),
  **Dropzone** for photos/evidence (drag highlight, thumbnails with progress ring, remove ×), declaration checkbox.
  A **review summary card** on the right (sticky) lists everything entered — editable via links.
- **Step 5 – Registered:** success animation (3.3), complaint code with copy button, what happens next as a 4-step timeline,
  buttons Track this complaint / File another / Download receipt (if available).
- **Validation:** errors appear under fields with a small slide-down; the Next button stays enabled and scrolls to the first error.

### 5.4 Track complaints (`/citizen/track-complaints`)

- **Layout:** left list (search by code, filter chips by status), right detail panel (desktop) / full page (mobile).
- **List item:** code, title, category icon, date, `StatusPill`. Selected item has an azure left bar (sliding).
- **Detail:** big **StatusTracker** redesigned as a vertical timeline: Complaint Filed → Pending Approval → Approved by Department
  Officer → In Progress → Completed – Pending Collector Verification → Verified by Collector. Completed nodes filled, current node
  pulses once, future nodes hollow. Each node shows date/time and remarks. **Rejected** shows a red branch with the stage and reason.
  Officer's completion photos in a lightbox gallery. Location mini-map.

### 5.5 Profile (`/profile`)

- Left: profile card with avatar (upload with circular crop preview + progress ring), name, role, member since.
- Right: tabbed sections (animated tab underline): **Account information · Personal details · Mobile number · Password**.
- Aadhaar field always masked (`XXXX XXXX 1234`) with a lock icon and "Encrypted" tooltip — never show the full number.
- Mobile change uses the `OtpInput` flow. Change password uses the strength meter. Save buttons show success check morph + toast.

---

### 5.6 Collector console (`/collector`, `CollectorApp.tsx`) — shell from 4.1

#### Page 1 — Overview (`Overview.tsx → Page1`)

Reading order left→right: **what's urgent → where → what to act on**. Bento layout that fits the viewport:

```
┌───────────── KPI strip (5–6 tiles) ─────────────┐
├──────────────────────┬──────────────────────────┤
│                      │ District / Zone / Dept    │
│   SATELLITE MAP      │ Snapshot strip            │
│   (full height)      ├────────┬────────┬────────┤
│                      │By      │My Tasks│Latest  │
│ legend chips below   │severity│        │news    │
└──────────────────────┴────────┴────────┴────────┘
```

- **KPI tiles** (`Kpi`): label (uppercase 11px), big mono number with count-up, delta chip (▲ 12% vs previous, coloured by
  `goodDown`), sparkline drawn in on load, hover shows the existing tooltip text ("what it counts") in a styled `Tooltip`.
  Click → list dialog morphs out of the tile. With a department selected the "Open complaints / Ongoing incidents" merge into
  one "Open incidents" tile (keep this rule).
- **Map (`SatMap.tsx`)**: keep Leaflet + Esri imagery as "Satellite"; add a "Map" style toggle (CARTO Dark Matter / Positron by
  theme). Zones / Taluks segmented control top-left over the map (glass). Ward heat shading with the new sequential palette and a
  gradient legend. **Pins**: 8–11px dots that scale with zoom (keep `--pz`), severity colour, critical ones have one ripple
  on first appear; **added-source items** as violet diamonds; stations (AQI, rain, lakes) as small rounded squares with icons.
  Label collision rule kept. Hover a pin → glass tooltip card (title, severity, time); click → incident drawer and `flyTo`.
  Legend + layer toggles become a chip row under the map (toggle = chip fills/empties with 160 ms).
- **Snapshot strip** (`DistrictSnap` / `AreaSnap` / `DeptSnap`): horizontal tiles with icon, value, label; dept/zone version shows
  the head official as a mini contact card (avatar initials, designation, mail/phone icon buttons). Switching
  district→zone→department cross-fades the strip content and morphs the title.
- **By severity** (`SeverityCard`): tabs Severe · High · Medium · Low with counts and a stacked **severity mix bar** on top
  (segments animate width on filter change). Rows: severity dot, title (1 line), place · time, "needs you" bell chip with first
  reason. Rows that need the Collector come first and get a faint red left glow. "See all" opens the list dialog.
- **My Tasks** (`TasksCard`): header shows count + rule tooltip ("Only closures that are severe/high, 3+ complaints, several
  departments, in the news, or very late"). Each task: title, officer's note in one line, reason chips (max 2), buttons
  **Send back** (ghost, refresh icon) and **Verify** (green). Verify animation per 3.2-6. Empty state: "All caught up ✓" with a
  small check draw animation and "N closures left to department heads".
- **Latest news** (`BriefCard`): tabs News · From added sources (with count). Items: outlet favicon/initial, headline (2 lines),
  time ago, "Linked to incident" or "News only" chip, department chip. New items slide in from the top (Animated List).
  "See more" opens the three-column news grid dialog.

#### Page 2 — Briefing (`BriefingBook.tsx`, `Insights.tsx`)

Make it read in one minute, like a newspaper front page:

- **Left column (widest) – Key points:** header with violet AI badge ("Written by AI at 06:10" or "Rules-based" when no AI),
  status pill (e.g. "Alert · 5 deaths"), **EN / தமிழ்** segmented toggle (text cross-fades), **Listen** button (animated audio
  bars while speaking). Numbered points with numbers highlighted (mono, azure). Critical incidents mentioned appear as clickable
  chips. IMD warning banner (yellow, cloud icon) and "Oldest open complaint" callout.
- **Middle – Departments:** one row per department: icon, name, count, deaths/severe badges, one-line summary
  ("Theft, protests, road accidents · Teynampet, Adyar"). Click expands **in place** (height animation) to the full note and top
  incidents + "All N reports". Only one open at a time (accordion).
- **Right – Stories still developing** (`Stories.tsx`): each story as a compact vertical mini-timeline with step labels as
  coloured chips (first report, arrest, death, court, probe, protest, action, warning, completed). Below it **Only in the news**
  list with department chips. "See all" for both.
- No item from page 1 repeats here (keep Round 15 rule).

#### Page 3 — Trends (district-wide, no filter bar)

- **Which problems are rising?** — summary row of 3 cards (Rising fastest · Falling fastest · Most reported) then rows per
  category: name, two horizontal bars (grey = 4 weeks before, coloured = last 4 weeks) that grow in, change text
  ("22% more"), Rising/Steady/Falling chip, zone adding most. One-sentence summary on top. Click → pattern dialog.
- **Unresolved by taluk (last 30 days)** — ranked bar list with rank numbers, change vs previous 30 days; click opens open incidents.
- **Unusual spikes** and **Recurring hotspots** — cards with mini bar charts, place, "View details" → pattern dialog (plain-words
  explanation, day/month bars, places, suggested next step, incidents behind it).
- **Locations needing review** — scrollable list (all items), each with "why it's here" chip and a summary line of what was
  excluded. Clicking never changes dashboard filters (keep Round 7 rule).

#### Page 4 — Environment & markets (district-wide)

- **Rainfall, Air quality, Reservoir storage** cards: each has a station picker, big value + unit, level pill (LOW / MODERATE /
  HIGH), trend arrow vs previous reading, a horizontal colour scale with an animated marker sliding to the value, and one-line
  summary. AQI card uses a semicircle gauge option.
- **Vegetable & fruit prices (AGMARKNET)**: full-width `DataTable` — sticky header & first column, search box, Chennai city / suburb
  group headers, cheapest (green pill) / dearest (red pill) with legend, "Since last report" movers on top, average and change columns,
  14-day sparkline per commodity.
- **Chennai markets view**: market cards side by side (Anna Nagar, K.K. Nagar, Nanganallur, Ambattur, Medavakkam, Pallavaram,
  Kundrathur, Guduvancheri), your zone's market highlighted with an azure border beam; click → full price list drawer.

#### Collector overlays & dialogs (`Overlays.tsx`, `Detail.tsx`, etc.)

All dialogs share one `Dialog` component: blurred scrim, `spring.soft` scale 0.96→1 + fade, close on Esc/scrim, focus trap,
sizes narrow / normal / wide. Large content uses a right **Drawer** instead.

| Dialog | Redesign |
|---|---|
| **Incident detail** (`Detail.tsx`) – right drawer 560px | Header: severity badge, title, place › ward › zone › taluk breadcrumb, time. Sections as quiet cards: *What happened* (plain sentence), *Key facts* (chips: people affected, road blocked, near school…), *Why it needs attention* (only when shown today), **Confidence** meter with explanation, **Timeline** of merged reports grouped by day (outlet/complaint/police/PWD icons, link strength bar), **Who is responsible** (official cards), **Officer's report & photos** (gallery lightbox) with **Verify / Send back** sticky footer when applicable. Mini-map at top showing the pin. |
| List dialog (`ListBody`) | `DataTable` with period choices incl. "Last 30 days", sticky header, row → incident drawer (stacked drawer animation). |
| Zones / Departments | Grid of zone/department cards with counts and mini bars; click applies the filter and closes with a morph back to the filter select. |
| **Data sources** (`Sources.tsx`) | Table of feeds: status dot (live/partial/stale/failed with reasons), newest data, last 5 runs as tiny coloured bars, actions Run now / Refresh / Pause (Run now shows progress shimmer in the row). Tabs: Feeds · Added sources · OCR upload · Audit log. |
| **Add source agent** (`Onboard.tsx`) | Keep the existing motion/anime.js drawer; restyle to the AI violet theme: live step timeline with progress rail, detected type, editable field mapping table, sample rows preview, Approve button; success mark draws. |
| **OCR upload** | Dropzone for a newspaper page, page preview with detected article boxes outlined and animated in, language chip (EN / தமிழ்), list of split articles with classification. |
| **Export** | Two big option cards: **PDF report** / **CSV action list**; period segmented (Daily / Weekly / Monthly / Quarterly); preview of what's included; Download button with progress then success check. |
| **Workspace** | Save current view with a name; list of saved versions (name, date, filters as chips, frozen briefing); Reopen with a page-flip transition. |
| **Customize** | Toggle pages, Overview panels and headline cards with switches; a live mini-preview of the bento grid that rearranges (layout animation) as you toggle. |
| Contacts / Item viewer / Stories / Markets / Pattern / Gaps / News grid | Same Dialog/Drawer style; item viewer shows text, how it was classified and placed (matched words highlighted), "Open the source link", "Show on the map" (closes dialog and flies map). |
| **Alerts bell popover** | Grouped list (Now / Earlier today), each with severity dot and time; "Mark all read". |
| **Toasts** | Top-right stack (sonner-style), success (green check) / alert (orange bell) with optional action button ("Refresh"); swipe to dismiss. |

---

### 5.7 Department Officer console (`/officer`, `OfficerApp.tsx`)

Same shell as the Collector (one design language) with the **department fixed** (department badge with icon in the page
header, no department switcher). Top bar: feeds light, **Export PDF**, theme, avatar showing "Logged in as officer.<code>" and
department head contact.

- **Page 1 – Overview:** KPI tiles (incl. *New – awaiting approval*, *Severe or high, open*, *Past deadline, open*, *Due in 24 hours*
  with a small clock ring), department **grievance map**, department snapshot, By severity, Today's Briefing (department news),
  and **My Work** in place of My Tasks:
  - New grievances → **Approve** (button morphs to "Approved ✓", row moves to "In action" with a layout animation).
  - In action → **Complete & send** opens the completion drawer.
  - **Returned by Collector** items pinned on top with an orange banner and the Collector's note.
- **Page 2 – Work & insights:**
  - Work-record figures strip.
  - **Grievance board** with tabs **New · In action · Sent to Collector · Verified** (sliding indicator, counts). Columns: grievance
    with place and complaints count, severity, reported, next step. Row hover reveals the action button.
  - **What needs you now**: prioritized list (approvals, returned, late, due soon, oldest, waiting for Collector, first finding of
    each data source) with icons and a "Do it" action per row.
  - **Complaint types vs previous period** with rise/fall chips; **department district data** cards (police, PWD, hospital, market
    prices…) or **Collector feedback** when none.
- **Grievance drawer** (`Drawer.tsx`): 4-step stage progress (Received → In action → Sent to Collector → Verified), details,
  location mini-map, history. **Completion report form** (`Report.tsx`): remarks textarea, photo Dropzone (thumbnails with upload
  progress), Send to Collector button → success animation and the stage bar advances.

---

### 5.8 Ask District IQ (`assistant/*`, both consoles)

- **Launcher fab:** 56px circle with the violet AI gradient, sparkle icon, badge with today's insight count; on hover expands
  into a pill "Ask District IQ  ⌘K". Opens with `spring.soft` from the fab's position (layoutId morph).
- **Dialog:** 2 panes — left **chat history** (search chats, sessions grouped Today / This week, pin/unpin), right conversation.
  Header: AI status pill ("Live · 06:04" or "Without AI" in neutral grey with reason tooltip), **language select**
  (Auto / English / தமிழ் / Tanglish), maximize/restore, close.
- **Empty state:** greeting ("Vanakkam, Collector") + 4–6 suggested question chips (from today's insights) that fill the input on click.
- **Input:** auto-growing textarea (Placeholders-and-Vanish style rotating examples), mic button (listening = animated waveform
  rings, `speech.ts` kept), send button that becomes stop while streaming, 1500 char counter near the limit.
- **Answers** (`AnswerCard`, `ChartRenderer`, `MapAnswer`, `Figure`): text streams in; violet border-beam while generating;
  then cards for charts (ECharts, drawn after text), maps (mini Leaflet with pins), figures (KPI chips). Each answer has
  Copy · Pin · Export · 👍/👎 feedback (thumb animates) · Listen. Sources/records used shown as expandable chips.
- Officer version is identical in look; answers locked to the department (no UI to switch).

---

## 6. Responsive behaviour

| Breakpoint | Consoles | Citizen |
|---|---|---|
| ≥1440 | Full bento, map wider | Max-width 1200 centered |
| 1280–1439 | Bento, KPI strip 5 tiles | — |
| 1024–1279 | Rail stays; bento becomes 2 rows of cards; still no page scroll; long lists → "See all" | 2-column |
| 768–1023 (tablet) | Page scroll allowed; cards stack 2-up; filter bar wraps into a "Filters" button opening a sheet | 1–2 columns |
| <768 (mobile) | Bottom tab bar for pages; dialogs become bottom sheets (vaul) with drag handle; map full-width 50vh | Bottom tab bar with raised "+ File", wizard steps full screen |

Touch targets ≥ 44px on mobile. No horizontal scroll except inside tables.

---

## 7. States, micro-copy and empty states

- **Loading:** shape-matched skeletons for KPI tiles, rows, charts, map (grey shimmer with zone outline).
- **Empty:** icon + one plain sentence + next action. Examples: "No severe incidents in this period ✓", "No news from added sources yet — Add a source".
- **Error:** inline card with the reason in plain words and a **Retry** button; never a blank card.
- **Partial data:** feed chips show "Partial" with the reason (keep current logic).
- **Copy style:** sentence case, plain words, numbers with `en-IN` grouping, relative times ("2 h ago") with exact time in a tooltip.

---

## 8. Charts (ECharts) styling

Create `src/components/ui/chartTheme.ts` registered for both themes: transparent background, Geist font, `--text-3` axis labels,
dashed `--line-2` grid, rounded bar tops (radius 4), line width 2 with soft area gradient (accent 24% → 0%), tooltip as a glass card
(same as `Tooltip`), `animationDuration: 700`, `animationEasing: 'cubicOut'`, `animationDelay: idx => idx * 30`,
`universalTransition: true` for filter changes. Sparklines: no axes, 1.5px line, last point dot.

---

## 9. Implementation plan (do in this order, commit after each phase)

1. **Phase 1 – Foundation:** tokens (dark+light), `gen-portal-theme.js` update, Tailwind config, fonts (Geist, Geist Mono, Noto Sans Tamil), `src/components/ui/*` kit, motion presets, chart theme. Build a hidden `/dev/ui` page showing every component in both themes.
2. **Phase 2 – Auth + citizen portal:** AuthShell/hero, login, register, forgot password, Header/Footer/Logo, citizen home, file-complaint wizard, track, profile.
3. **Phase 3 – Collector shell:** top bar, rail, filter bar, pager + page transitions, command palette, toasts, bell, freshness chip.
4. **Phase 4 – Collector pages 1–4** and the map restyle.
5. **Phase 5 – Collector dialogs/drawers** (incident detail, lists, sources, onboarding, OCR, export, workspace, customize, others).
6. **Phase 6 – Officer console** on the same shell and components.
7. **Phase 7 – Ask District IQ** restyle.
8. **Phase 8 – Polish & QA:** reduced motion, keyboard pass, contrast check, light theme pass, 1366×768 & 1920×1080 fit check, mobile pass, remove dead CSS (old `.dic`/`diq-*`/officer duplicates once replaced).

Files mainly touched: `src/app/**/page.tsx`, `src/app/layout.tsx`, `src/app/globals.css`, `src/app/theme.css`,
`tailwind.config.ts`, `scripts/gen-portal-theme.js`, `src/components/*.tsx`, `src/components/collector/app/**`,
`src/components/officer/**`, new `src/components/ui/**`.

---

## 10. Acceptance checklist

- [ ] Every feature in Section 5 present and working; every API call unchanged.
- [ ] Every count equals the list it opens (spot-check KPI tiles, severity tabs, My Tasks, My Work, past-deadline).
- [ ] Collector and Officer consoles fit 1366×768 and 1920×1080 with no page scroll.
- [ ] Dark and light themes complete on every screen, saved in `diq-theme`, no flash on load.
- [ ] Tamil text renders in Noto Sans Tamil; EN/தமிழ் toggle and Listen work.
- [ ] Keyboard: Tab order logical, focus visible, Esc closes, PageUp/PageDown pages, Ctrl/⌘+K opens assistant/palette.
- [ ] `prefers-reduced-motion`: no movement, only fades.
- [ ] Lighthouse accessibility ≥ 95 on login and citizen pages; no console errors; `npm run lint` and `npm test` pass.
- [ ] Animations stay at 60 fps (Chrome Performance panel) while changing filters and opening dialogs.
- [ ] Before/after screenshots of every page in both themes saved to `docs/ui-redesign/`.
