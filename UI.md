# Beacon UI Guide

Reference for all design decisions, color usage, component patterns, and layout conventions in the Beacon dashboard.

## Theme

Warm, minimal light theme inspired by dewanggogte.com. Serif typography, muted backgrounds, no dark mode.

### Colors

Defined as CSS custom properties in `globals.css` via Tailwind CSS 4 `@theme`:

| Token | Hex | Usage |
|-------|-----|-------|
| `bg-primary` | `#fdfcfb` | Page background (warm off-white) |
| `bg-secondary` | `#f3f1ee` | Table headers, code blocks, input fields |
| `bg-card` | `#ffffff` | Card/panel surfaces |
| `bg-hover` | `#f0eee9` | Row/card hover state |
| `border` | `#e8e6e3` | All borders — cards, tables, dividers |
| `text-primary` | `#2c2c2c` | Headings, company names, primary data |
| `text-secondary` | `#666666` | Body text, secondary values |
| `text-muted` | `#999999` | Labels, captions, section headings |

### Signal Colors

Used for financial classifications and data quality indicators. Toned down for readability on light backgrounds.

| Token | Hex | Meaning |
|-------|-----|---------|
| `accent-green` | `#2d7a4f` | Strong long, positive signals, high conviction |
| `accent-red` | `#c0392b` | Strong avoid, red flags, negative signals |
| `accent-amber` | `#b8860b` | Potential short, warnings, elevated risk |
| `accent-blue` | `#2563eb` | Informational, asset play badge |
| `accent-cyan` | `#b85a3b` | **Primary accent (terracotta)**. Links, potential long, brand highlight. Named "cyan" for Tailwind class compatibility with the original dark theme — actual color is terracotta. |

### Typography

- **Font**: Source Serif 4 (Google Fonts), fallback Georgia, serif
- **Base size**: 15px, line-height 1.6
- **Weights**: 400 (body), 500 (medium labels), 600 (headings, nav), 700 (scores, bold data)
- **Antialiasing**: `-webkit-font-smoothing: antialiased` on body

### Score Color Thresholds

Used consistently across `FrameworkScores`, `CompanyDetail`, and `CompanyTable`:

| Score | Text class | Bar color |
|-------|-----------|-----------|
| >= 75 | `text-accent-green` | `#2d7a4f` |
| >= 55 | `text-accent-cyan` | `#b85a3b` |
| >= 35 | `text-text-secondary` | `#666666` |
| >= 20 | `text-accent-amber` | `#b8860b` |
| < 20 | `text-accent-red` | `#c0392b` |

Classification thresholds differ slightly (80/65/40/20) in `CompanyDetail` since they map to actual classification boundaries.

## Layout

### Global Shell

`layout.tsx` provides the nav + main area. No sidebar.

- **Nav**: `border-b`, `px-8 py-4`, `flex items-center justify-between`
- **Brand**: Left-aligned, `text-xl font-semibold`, links to `/`
- **Links**: `text-sm`, `text-text-secondary`, hover to `text-accent-cyan`, `gap-5` between items
- **Tagline**: Right-aligned, `text-xs uppercase tracking-wide text-text-muted`
- **Main**: `p-8` padding on all pages

### Page Patterns

Pages use one of two width constraints:

- **Full width**: Home, Rankings, Frameworks (data-dense tables)
- **Constrained**: `max-w-3xl` (Pipeline, Market Snapshot table), `max-w-4xl` (Backtest), `max-w-5xl` (Overview)

All pages export `const dynamic = 'force-dynamic'` for server-side data fetching.

### Section Spacing

- Between major sections: `space-y-8` (most pages) or `space-y-10` (home), `space-y-12` (overview)
- Section headings: Two styles used:
  - **Muted label**: `text-text-muted text-xs uppercase tracking-wider mb-3` — used for data sections (stats grids, tables, framework scores)
  - **Content heading**: `text-lg font-semibold text-text-primary mb-4` — used for named content sections (High Conviction Picks, Top Rated Companies)
- Page title: `text-xl font-bold mb-1` with `text-text-muted text-sm` subtitle

## Components

### StatCard

`components/stat-card.tsx` — Display a single metric.

Props: `label`, `value`, `color?`, `subtext?`, `size?: 'default' | 'large'`

| Size | Padding | Value text | Label text |
|------|---------|-----------|------------|
| default | `p-4` | `text-2xl font-bold` | `text-xs uppercase tracking-wider` |
| large | `p-6` | `text-4xl font-bold` | `text-sm uppercase tracking-wider` |

Card styling: `bg-bg-card border border-border rounded-lg`

### Badge Components

`LynchBadge` and `ConvictionBadge` use the same visual pattern:

```
inline-block px-2 py-0.5 rounded text-xs font-medium {color} {bg}
```

Background is always the accent color at 10-15% opacity (`bg-accent-green/10`, `bg-accent-cyan/10`).

Lynch badge color mapping:
- fast_grower → green
- stalwart → cyan (terracotta)
- slow_grower → text-secondary
- cyclical → amber
- turnaround → red
- asset_play → blue

Conviction badge color mapping:
- high → green
- medium → cyan (terracotta)
- low → text-secondary
- none → bg-secondary (neutral)

### ClassificationTabs

`components/classification-tabs.tsx` — Client component. Tabbed view over multiple `CompanyTable` instances.

Tab bar: `flex gap-1 border-b border-border mb-4`. Active tab gets `border-b-2 border-current -mb-px` with the tab's color class. Inactive tabs are `text-text-muted`.

### CompanyTable

`components/company-table.tsx` — Client component. Sortable, filterable table.

- Search input: `bg-bg-secondary border border-border rounded px-3 py-1.5 text-sm`, focus → `border-accent-cyan`
- Dropdowns: Same styling as search input
- Table: `border border-border rounded-lg`, `text-sm`
- Header: `bg-bg-secondary`, `text-xs font-medium text-text-muted uppercase tracking-wider`
- Rows: `border-t border-border`, hover → `bg-bg-hover`
- Sort indicator: `↑`/`↓` appended to header text
- Company links: `text-accent-cyan hover:underline`
- Compact mode: Hides sector column and advanced framework filters
- AG4 indicator: Small `w-4 h-4 rounded-full bg-accent-cyan/20 text-accent-cyan text-[9px]` circle with "A"

### FrameworkScores

`components/framework-scores.tsx` — 2x2 grid of framework score cards (Buffett, Graham, Pabrai, Lynch).

Each card has:
- Label: `text-text-muted text-xs`
- Score: `text-2xl font-bold` with color based on score thresholds
- Description: `text-text-muted text-xs`
- Progress bar: `h-2 bg-bg-secondary rounded-full` track, score-colored fill

Detail breakdowns appear below in a `grid-cols-1 md:grid-cols-2` grid.

### AgentAnalysisPanel

`components/agent-analysis-panel.tsx` — Client component. Tabbed panel showing LLM agent outputs.

Tabs: Synthesis, Fundamentals, Governance, Risk. Same tab pattern as ClassificationTabs but with `bg-bg-hover` on active.

Content sections use:
- Field labels: `text-text-muted text-xs mb-1`
- Values: `text-sm` for prose, `text-xs` for metadata
- Lists: `ul` with `text-xs text-text-secondary space-y-0.5`, items prefixed with `- `
- Quoted reasoning: `border-l-2 border-accent-cyan/30 pl-2` or `border-t border-border pt-2`

Quality/risk keywords are color-coded:
- strong/high/low-risk → green
- adequate/medium/moderate → cyan
- weak/elevated → amber
- red_flag/extreme → red

## Page-Specific Patterns

### Home (`/`)

1. **Hero**: `flex-col lg:flex-row`, large typographic stat on left (`text-3xl font-semibold`), compact text stats on right (`text-sm`, label/value rows with `justify-between`). Separated by `border-b`.
2. **High Conviction Picks**: 2-column grid (`md:grid-cols-2`), cards with `p-6`, `border-accent-green/30`, `line-clamp-3` on thesis text. Max 6, "View all" link below.
3. **Top Rated**: `ClassificationTabs` with 3 tabs (Strong Long, Potential Long, Strong Avoid).
4. **Market Snapshot**: Table with inline score bars (`h-2 bg-bg-secondary rounded` track, `bg-accent-cyan/40` fill, width as percentage of max score). Constrained to `max-w-3xl`.
5. **Nav Signpost**: `border-t`, centered row of page links separated by `·` middots.

### Overview (`/overview`)

1. **Header**: Centered `text-3xl` title + `text-text-secondary` subtitle.
2. **Pipeline Flow**: Vertical card list (`max-w-3xl mx-auto`), each card is `bg-bg-card border rounded-lg p-5 flex gap-5` with inline SVG icon + description. Cards connected by `↓` arrow dividers.
3. **Phase Descriptions**: Inline within cards. Score and Analyze phases include structured sublists (dimensions with percentages, agent names with descriptions).
4. **Analysis Funnel**: Progressively narrowing horizontal bars (`h-8 bg-accent-cyan/15 border-accent-cyan/30 rounded`), labels to the right.
5. **Last Run**: Metadata card with `flex-wrap gap-x-8 gap-y-2` for key-value pairs.

### Icons

Pipeline stage icons are inline SVGs defined in `overview/page.tsx`:
- `ScrapeIcon`: Globe with meridian lines
- `ScoreIcon`: Ascending bar chart
- `AnalyzeIcon`: Stylized figure/funnel
- `PresentIcon`: Monitor with trend line

All use `stroke="currentColor"` and `strokeWidth="1.5"` with `fill="none"`. Sized with Tailwind (`w-7 h-7` in cards, `w-6 h-6` in descriptions). Color inherited from parent via the stage's color class.

## Conventions

### Do

- Use semantic color tokens (`text-accent-green`), never raw hex in JSX
- Use `transition-colors` on interactive elements
- Use `rounded-lg` for cards, `rounded` for badges and small elements
- Use `text-xs uppercase tracking-wider` for section labels
- Use `hover:bg-bg-hover` for table rows and card hover states
- Keep financial numbers in `font-bold` — scores, percentages, counts
- Use `border-border` for all structural borders
- Constrain content-heavy pages with `max-w-*` utilities
- Use `space-y-*` on parent containers rather than margin on children

### Don't

- No colored emoji — use inline SVGs with `currentColor`
- No dark mode — single light theme only
- No external icon libraries — inline SVGs or Unicode only
- No custom CSS beyond `globals.css` — everything uses Tailwind utilities
- No client components unless interactivity is required (tabs, sorting, filtering)
- Don't use raw `#hex` values in className — always reference theme tokens
- Don't add decorative borders or shadows — the theme is deliberately flat
