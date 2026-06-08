# Handoff: Stonks — Company Briefing (scrollytelling analyst report)

## Overview
This is the **Stonks Company Briefing** — a single-scroll, "answer-first" equity research briefing for a
*bounded analyst* product. A user asks a question about a company (e.g. *"How have margins trended over the
last few quarters?"*) and the product returns a structured, source-grounded briefing they read top-to-bottom.

The briefing is organized as **7 chapters** in a vertical scroll with a fixed left chapter rail, a top
progress bar, scroll-spy, keyboard navigation, and per-chapter expandable detail drawers. Its defining product
principle is **"trust = flag problems only"**: every figure is verified by default and shown plainly; only
*unverified*, *rejected/quarantined*, or *contradictory* data gets a colored flag. The UI never decorates good
data — it only surfaces problems.

## About the Design Files
The files in this bundle are **design references created in HTML/React-via-Babel** — a working prototype that
demonstrates the intended look, content, and behavior. **They are not production code to copy directly.** The
prototype is deliberately built as standalone browser files (React + Babel loaded from CDN, JSX compiled in the
browser, all data in a single global object). That setup is for fast design iteration, not production.

Your task is to **recreate this design in the target codebase's existing environment** — its component library,
styling system, data layer, and conventions. If there is no existing app yet, choose the most appropriate
framework (a React + TypeScript SPA is a natural fit given the prototype) and implement it there. Treat the HTML
files as the source of truth for *visual design, copy, layout, and interaction* — and re-implement the
*structure* idiomatically.

## Fidelity
**High-fidelity (hifi).** Colors, typography, spacing, charts, and interactions are all final and intentional.
Recreate the UI pixel-accurately using the codebase's existing primitives. Exact values are documented in
**Design Tokens** below; the prototype's CSS custom properties are the canonical reference.

---

## Layout & Global Shell

The page is a **document-level vertical scroll** (the body scrolls, not an inner container) with a fixed rail
on the left.

- **Chapter rail** — `position: fixed`, left, width **208px**, full viewport height. Translucent panel
  (`--panel` at 70% over a blur), 1px right border (`--border`). Contains:
  - **Brand block** (top): a 9×9px gold square dot (`--accent`, `border-radius: 2px`), then `stonks` in mono
    13px bold and `bounded analyst` in mono 10px faint, stacked.
  - **Nav list**: one button per chapter — a 2-digit mono index (`01`…`07`, 11px, faint; turns gold when
    active), the chapter label (sans 13px), and an optional right-aligned 6px **flag dot** (only chapter 05
    "Management" has one, colored `--warn`). Active item: text brightens to `--text`, index turns `--accent`,
    and a 2px gold bar appears on the left edge (`::before`, inset 6px top/bottom). Hover: text lifts to
    `--text-2` with a faint 5% gold background wash.
  - **Foot** (bottom, above a top border): mono 10px faint — ticker (`INDHOTEL`) and as-of date.
- **Progress bar** — `position: fixed`, top, 3px tall, gold (`--accent`) with a soft gold glow shadow; width
  tracks scroll percentage (0→100%), `z-index: 60`.
- **Chapters container** — `margin-left: 208px` (the rail width).
- **Responsive**: at **≤900px** the rail collapses (`--rail-w: 0`, rail translated off-screen) and chapters go
  full-width. (Note: there is no mobile hamburger to reveal the rail in the prototype — add one if mobile is in
  scope.)

### Chapter frame (every chapter shares this)
Each chapter is a `<section class="chapter">`:
- `min-height: 100vh`, vertically centered content, `scroll-snap-align: start` (gentle proximity snap on the
  document), padding `72px clamp(28px, 6vw, 88px)`.
- A 1px `--border` top divider between consecutive chapters.
- Alternating chapters carry `.alt` (a subtle top-to-bottom `--panel`→`--bg` gradient background). Chapters
  **01, 03, 05, 07** are `.alt`.
- **Watermark**: the 2-digit chapter number, absolutely positioned top-right, mono **clamp(80px,12vw,150px)**
  700 weight, color `--panel-2` (very dim), `z-index: 0`, non-interactive. Real content sits at `z-index: 1`.
- **Inner wrapper**: `max-width: 1080px`, centered.
- **Head block**: an "eyebrow" line (`NN / 07 · <Eyebrow>`, mono 11px, letter-spacing .14em, faint), an `h2`
  title (`clamp(28px,3.4vw,42px)`, 600, letter-spacing -0.02em, line-height 1.05), and an optional deck/dek
  paragraph (15px, `--muted`, max-width 60ch, line-height 1.5).
- **Detail drawer** (optional per chapter): an "Expand detail ▾" button (mono 12px, `--panel` bg, 1px border,
  8px radius; gold chevron rotates 180° when open; hover brightens border toward gold). Below it a drawer that
  animates open via `grid-template-rows: 0fr → 1fr` over .42s `cubic-bezier(.4,0,.2,1)`. **Double-clicking the
  chapter** also toggles the drawer.
- **Entrance animation**: when JS adds `.anim` to the briefing root, each direct child of `.chapter-inner`
  starts at `opacity:0; translateY(22px)` and animates to rest (`.65s ease`) when the chapter enters the
  viewport (IntersectionObserver, threshold .45 adds `.in-view`). Children stagger by 70ms each (nth-child 2/3/4
  delays .07/.14/.21s). All of this is disabled under `prefers-reduced-motion: reduce` and when JS hasn't run —
  so print/SSR/no-JS shows content fully visible. **Preserve this gating** in your re-implementation.

### Global interactions
- **Scroll-spy**: IntersectionObserver sets the active chapter as you scroll; the rail reflects it.
- **Click a rail item**: smooth-scrolls to that chapter.
- **Keyboard**: `↓`/`PageDown`/`Space` → next chapter; `↑`/`PageUp` → previous. Suppressed when focus is in a
  button/anchor/input/textarea so you don't hijack control activation.
- **Scroll hint**: only on chapter 01 — a centered "scroll · or ↓ / ⌄" mono 11px faint cue near the bottom,
  gently bobbing (2.4s loop; disabled under reduced-motion).

---

## Chapters (Screens / Views)

There are 7. The narrative arc is: **answer first → the evidence → the caveats → the provenance.**

### 01 · Overview  *(eyebrow: "Overview", `.alt`, has scroll hint)*
**Purpose:** orient someone who's never seen the company, then hand them the answer immediately.
- **Title** = company name ("Indian Hotels Co."); **dek** = one-paragraph "about" the company.
- **Identity row**: gold-outlined ticker chip (`INDHOTEL`, mono 12px 700, 45%-gold border, 5px radius) +
  industry (`--muted` 13px) + as-of (mono 11px faint).
- **The ask card**: `--panel` bg, **3px gold left border**, 12px radius, padding 20×24. Contains an "The ask"
  eyebrow (gold), the user's question in italic `--muted` 14px, then the **headline answer** in
  `clamp(19px,2.1vw,25px)`, 500 weight, line-height 1.4.
- **Stat tiles**: a 4-column grid (`tile-grid`, gap 12). Each tile (`--panel-2` bg, 1px border, 10px radius,
  padding 14×16): an uppercase mono key (10.5px, `--muted`), a big mono value (26px, 600), and a row with a
  green/red **Delta** (mono 12px, ▲/▼) + sub-label (faint 11px). The four tiles: EBITDA margin 36.0% (+1.5 pts),
  Revenue ₹2,425 cr (+27.3%), EBITDA ₹873 cr (+32.9%), PAT ₹522 cr (+24.9%) — all "up".
- **Bottom-line pair**: a 2-column grid. Left card tinted **green** (`--up` at 7% over panel, 30% green
  border): "WHY IT MIGHT BE WORTH YOUR TIME". Right card tinted **amber** (`--warn`): "WHAT TO CHECK FIRST".
  Each: mono 10.5px colored label + 13.5px `--text-2` body.
- **Trust strip**: a mono 11px row — "Built from 4 sources ·", green "✓ 47 verified", amber "◌ 3 unverified",
  red "✕ 1 rejected".

### 02 · Margins  *(eyebrow: "Margins · the answer")*
**Purpose:** show the headline trend visually — this *is* the answer to the asked question.
- A `--panel` card holding a **LineChart**: single series "EBITDA margin %", gold line, 8 quarterly points
  (Q1FY24→Q4FY25), height 300, y-axis in %. Interactive: hover crosshair + value chip, peak dot labelled
  ("peak 39.5"), faint area fill under the single series.
- **Detail drawer**: 2-column. Left = a `data-table` of Quarter / Margin / QoQ delta (QoQ colored green/red).
  Right = "WHAT MOVED THE NUMBERS" — three driver cards, each an optional gold mono metric chip
  (e.g. `ARR ₹13,420`, `+28% YoY`) + 13px explanatory text.

### 03 · Financials  *(eyebrow: "Financials", `.alt`)*
**Purpose:** corroborate the margin story with absolute revenue & EBITDA.
- 2-column grid of cards, each a **MiniBars** chart (compact bar chart, hover shows value): left = Revenue ₹cr
  (teal bars, label "REVENUE · ₹cr"), right = EBITDA ₹cr (gold bars). Height 190 each, 8 quarters.
- **Detail drawer**: a wide `data-table` — Quarter / Revenue / EBITDA / PAT / OPM% (OPM column gold), Indian
  number formatting (`toLocaleString("en-IN")`).

### 04 · Peers  *(eyebrow: "Peers · Hotels")*
**Purpose:** position the company against its peer set.
- A `--panel` card: "EBITDA MARGIN % · RANKED" — horizontal **rank bars**. Each row is a
  `108px / 1fr / 46px` grid: peer ticker (mono 12px; the subject `INDHOTEL` is gold + bold), a rounded track
  (`--panel-2`) with a filled bar (subject = gold, others = 70% teal), and a right-aligned value. Sorted
  descending; rejected/missing values excluded.
- **Detail drawer**: the **full KPI matrix** — a sortable table. Rows = KPIs (Revenue, EBITDA margin, ARR,
  Occupancy, RevPAR, Keys); columns = the 6 peers. The subject column is gold-tinted. **Click a KPI row label
  to sort columns by that KPI** (active row gets a gold wash + "▾" marker). The EBITDA-margin row renders a tiny
  **Sparkline** (last 6 quarters) inside each cell. Flagged cells render a small **Flag** badge and a `title`
  tooltip explaining the problem; flagged values are dimmed (`--faint`). A mono caption underneath explains the
  flags in prose.

### 05 · Management  *(eyebrow: "Management commentary", `.alt`, flag dot in rail)*
**Purpose:** track tone across earnings calls and surface a detected contradiction.
- A `--panel` card with a **tone path** SVG: 4 earnings calls (Q1→Q4 FY25) plotted on a 4-level y-axis
  (cautious=1 … confident=4), connected by a gold line. Each node is a dot colored by tone; the **flagged**
  Q4 node is larger and `--warn`-colored with a ⚠ beneath it. Labels above (tone) and below (period) each node.
- Below the chart: a **contradiction callout** — amber-tinted card, "⚠ CONTRADICTION DETECTED · Q4 FY25" mono
  label + the explanation (Q4's supply-driven ARR caution contradicts Q3's "no signs of demand moderation").
- **Detail drawer**: one card per call (4), each with period, a **ToneBadge** (arrow + label, colored), the
  summary, and — for the flagged one — an amber "⚠ CONTRADICTION" pill and the contradiction text. The flagged
  card has an amber border + tint.

### 06 · Risks  *(eyebrow: "Risks & what to watch")*
**Purpose:** the caveats — what could bend the trajectory.
- A vertical stack of **risk cards** (2). Each: a left accent border (3px) + glyph colored by tone
  (`cautious` = `--warn` ▼, else `--muted` ▶), and the risk text at 15px.
- **Detail drawer**: a single card of "guidance context" prose (built from the guidance items), emphasizing the
  risks are about **"pace, not direction."**

### 07 · Provenance / Sources  *(eyebrow: "Provenance", `.alt`)*
**Purpose:** make the evidence trail auditable — nothing hides.
- A 2-column grid of **source cards** (4): a small square dot colored by source type (RESULT=teal, DECK=gold,
  AR=green, CONCALL=violet), the type label (mono 10px faint), the document label, and a right-aligned page
  number (`p3`, etc).
- A **integrity row**: three flex tiles — green "✓ 47 verified figures", amber "◌ 3 unverified (NLM-only)",
  red "✕ 1 rejected / quarantined" — each a big mono number + label, tinted by status.
- **Detail drawer**: one card per flagged matrix cell (the SAMHI margin rejection, SAMHI ARR NLM-only, ITC
  Hotels RevPAR missing), each with its **Flag** badge, a left accent border, and the quarantine note.

---

## Shared Components / Atoms (`ui.jsx`)
Re-create these as reusable components in the target codebase:
- **`Flag({trust})`** — small mono badge for problem data. `nlm` → "NLM-ONLY" amber, `rejected` → "REJECTED"
  red, `missing` → "MISSING" muted. Renders nothing for `ok` (the core "flag problems only" rule).
- **`Delta({dir})`** — green ▲ / red ▼ / muted change indicator (mono 12px 600).
- **`ToneBadge({tone})`** — outlined mono pill, arrow + label, colored per tone
  (cautious=warn ▼, neutral=muted ▶, optimistic=teal ▲, confident=green ▲).
- **`Eyebrow({accent})`** — uppercase mono 10.5px label, letter-spacing .14em.
- **`SourcePill({type,label,page})`** — inline mono source reference with a type-colored dot.
- **Formatters**: `fmtNum(v, fmt)` (`pct` → 1 decimal; else `en-IN` locale integer; `null` → "—") and
  `cellInfo(raw)` (normalizes a matrix cell that may be a bare number *or* `{v, trust, note}` — bare numbers are
  implicitly `trust: "ok"`). This normalization is the mechanism behind "verified is silent."

## Charts (`charts.jsx`) — recreate with your charting lib or as SVG
All charts read colors from CSS variables and are fully responsive (a `ResizeObserver` hook `useElementWidth`
measures the container). If your codebase has a charting library, reproduce the *behavior and styling*; the
SVG source here is a precise reference.
- **`LineChart`** — multi-series line with gridlines, mono axis labels, hover crosshair + dashed line, hover
  value chips below, a highlighted+labelled peak dot, optional area fill (only when a single series), and a
  clickable pill legend to toggle series (only shown for >1 series). Padding L44/R14/T16/B30.
- **`MiniBars`** — compact bar chart, 3 gridlines, hover dims the other bars and shows the value above the
  hovered bar.
- **`Sparkline`** — tiny in-cell line with an end dot, no axes.

---

## State Management
The prototype keeps state local with React hooks — no global store, no data fetching (all data is a static
import). For a production build, model:
- **Active chapter** (`active: number`) — derived from scroll position via IntersectionObserver; also set
  imperatively when a rail item is clicked. Drives the rail highlight.
- **Scroll progress** (`pct: number`) — `window.scrollY / (scrollHeight - innerHeight) * 100`, throttled via a
  passive scroll listener. Drives the progress bar width.
- **Per-chapter drawer open** (`open: boolean`, local to each chapter) — toggled by the expand button or a
  double-click on the chapter.
- **Matrix sort key** (`sortBy: string | null`, local to the peer matrix) — toggling a KPI row label sorts the
  peer columns by that KPI's values (nulls sorted last); clicking the active KPI again clears the sort.
- **Chart hover index** (`hover`, local to each chart) and **series toggles** (`off`, in LineChart).
- **Data** would come from the briefing-generation backend. In production, replace the static `STONKS` object
  with a typed API response. The trust/flag fields (`trust`, `note`) must be carried end-to-end — they are the
  product, not decoration.

## Data Model (`data.js`)
The entire briefing renders from one object, `STONKS`. Use it as the schema reference:
- `company` (name, ticker, industry, sector, asOf), `ask` (the user's question), `about` (one-paragraph
  orientation), `bottomLine` ({worth, watch}), `brief` ({headline, answer[], drivers[], guidance[], risks[]}).
- `quarters[]` — chronological time series: `{period, label, margin, rev, ebitda, pat}` (₹cr, margin = OPM%).
- `stats[]` — the 4 headline tiles `{key, value, delta, dir, sub}`.
- `peers[]` + `matrix[]` — the KPI matrix. **A cell is either a bare number (verified) or
  `{v, trust, note}`** where `trust ∈ {nlm, rejected, missing}`. This duality is the heart of the trust model.
- `peerMargins{}` — 6-quarter margin arrays per peer for in-cell sparklines.
- `commentary[]` — per-call `{period, tone, summary, topics[], flag}`; a non-null `flag` marks a contradiction.
- `sources[]` — `{type, label, page}` with `type ∈ {RESULT, DECK, AR, CONCALL}`.
- `integrity` — run counts `{verified, nlmOnly, pending, rejected}`.

> The data is illustrative mock data grounded in a real company (Indian Hotels / INDHOTEL) and its hospitality
> peers, for FY24–FY26. Treat figures as placeholders — wire to real data in production.

---

## Design Tokens
Warm-dark theme. These are the prototype's canonical CSS custom properties.

### Colors
| Token | Hex | Use |
|---|---|---|
| `--bg` | `#17140f` | page background (warm near-black) |
| `--panel` | `#201c15` | cards, rail |
| `--panel-2` | `#28231a` | stat tiles, bar tracks, watermark |
| `--border` | `#36301f` | all 1px borders / dividers |
| `--text` | `#ece5d8` | primary text |
| `--text-2` | `#cbc2b1` | secondary text / table body |
| `--muted` | `#948b78` | labels, deks |
| `--faint` | `#6c6452` | tertiary / axis / watermark-adjacent |
| `--accent` | `#e8b04b` | **gold brand accent** — primary series, active states, DECK source |
| `--teal` | `#5cb9b1` | cool secondary series, RESULT source |
| `--violet` | `#b09be0` | CONCALL source |
| `--up` | `#7bb25e` | positive / verified (warm green) |
| `--bad` | `#e0664f` | negative / rejected (warm red) |
| `--warn` | `#e0903a` | caution / NLM-only / contradiction (amber) |
| `--grid` | `rgba(255,255,255,0.055)` | chart gridlines |

Tinted surfaces use `color-mix(in srgb, <token> N%, <base>)` — e.g. status cards are the status color at
7–9% over `--panel`, with a 30% border. Reproduce with your theme's alpha-blend utilities.

### Typography
- **Sans** (`--sans`): `IBM Plex Sans`, weights 400/500/600/700 — titles, body, deks.
- **Mono** (`--mono`): `IBM Plex Mono`, weights 400/500/600/700 — *all* numbers, labels, eyebrows, axis ticks,
  badges, tickers. **Numbers are always mono** — this is a strong, deliberate convention; keep it.
- Loaded from Google Fonts. Substitute your codebase's equivalents only if these aren't available.
- Scale highlights: chapter title `clamp(28px,3.4vw,42px)`/600/-0.02em; dek 15px; headline answer
  `clamp(19px,2.1vw,25px)`/500; stat value 26px mono/600; eyebrow 11px mono/.14em; table 12.5px mono.

### Spacing, radius, motion
- **Radius**: tiles 10px, cards 12px, buttons/drawer-button 8px, chips/badges 3–5px, bar tracks 999px (pill).
- **Borders**: uniformly 1px `--border`; accent cards add a 3px colored left border.
- **Chapter padding**: `72px clamp(28px,6vw,88px)`; inner max-width 1080px; rail 208px.
- **Motion**: drawer `.42s cubic-bezier(.4,0,.2,1)`; entrance `.65s ease` with 70ms stagger; progress bar
  `.15s linear`; chevron rotate `.35s`. All decorative/entrance motion must respect
  `prefers-reduced-motion: reduce`.

## Assets
- **Fonts only** — IBM Plex Sans + IBM Plex Mono (Google Fonts). No image assets, no icon library: all glyphs
  (▲ ▼ ▶ ◌ ✓ ✕ ⚠ ⌄ ▾ ·) are Unicode characters, and the brand "logo" is a CSS square. If your codebase has an
  icon set, you may swap the Unicode glyphs for equivalent icons — keep them monochrome and small.
- If your codebase has its own brand/design system, map these tokens onto it rather than introducing a parallel
  theme.

## Files in this bundle
The prototype is one HTML entry that loads six script modules (compiled in-browser via Babel):
- `Stonks Briefing.html` — entry: theme CSS (all tokens + global shell styles live here), font links, script
  load order, and the React mount.
- `data.js` — the `STONKS` data object (schema reference + mock content).
- `charts.jsx` — `LineChart`, `MiniBars`, `Sparkline`, `useElementWidth`.
- `ui.jsx` — atoms & formatters: `Flag`, `Delta`, `ToneBadge`, `Eyebrow`, `SourcePill`, `fmtNum`, `cellInfo`,
  and the `TRUST_META` / `TONE_META` / `SRC_COLOR` maps.
- `briefing-sections.jsx` — the reusable `Chapter` frame + chapters **01–03**.
- `briefing-sections2.jsx` — chapters **04–07** (peer matrix, tone path, etc).
- `briefing.jsx` — the app shell: rail, progress bar, scroll-spy, keyboard nav, entrance-animation wiring.

Open `Stonks Briefing.html` in a browser to see the live reference. The CSS in its `<head>` is the
authoritative source for any value not spelled out above.

### Screenshots
`screenshots/` contains a rendered capture of each chapter for quick visual reference:
`01-overview.png`, `02-margins.png`, `03-financials.png`, `04-peers.png`, `05-management.png`,
`06-risks.png`, `07-provenance.png`. These show the collapsed (default) state of each chapter — open the live
HTML and use the "Expand detail" buttons to see the drawer content described above.

> Note: the prototype shares global scope across the in-browser Babel scripts (components attached to
> `window`). That is a prototyping artifact — in production, use proper modules/imports.
