# Design

This document specifies the design tokens, typography, and structural components for the HDFC Wizard Log Explorer UI.

## Palette

The application uses a sleek developer dark-mode palette.

### Brand & Accents
* `accent-blue`: `#58a6ff` (Primary actions, selection indicators)
* `accent-purple`: `#ab7df6` (Workspace tags, secondary highlights, branding)
* `accent-purple-dim`: `rgba(171, 125, 246, 0.15)`

### Surface Colors
* `bg-app`: `#0d1117` (Deep app canvas background)
* `bg-panel`: `#161b22` (Secondary container/sidebar background)
* `bg-panel-hover`: `#21262d` (Hover states)
* `bg-input`: `#090d13` (Form backgrounds, dark code backgrounds)
* `bg-active-row`: `#1f2937` (Active list selection)

### Borders
* `border-color`: `#30363d` (Subtle dark separator borders)
* `border-color-focus`: `#58a6ff` (Active border highlights)

### Ink Colors
* `text-main`: `#c9d1d9` (General body text)
* `text-muted`: `#8b949e` (Secondary annotations and dates)
* `text-bright`: `#f0f6fc` (Headers, titles, and active inputs)

### Semantic States
* `success`: `#3fb950` (200 OK statuses, added code lines in diffs)
* `success-dim`: `rgba(63, 185, 80, 0.15)`
* `warning`: `#d29922` (Modified API warnings)
* `warning-dim`: `rgba(210, 153, 34, 0.15)`
* `error`: `#f85149` (500 Error statuses, deleted code lines in diffs)
* `error-dim`: `rgba(248, 81, 73, 0.15)`

---

## Typography

The interface employs two distinct typography families for functional separation:

* **UI Sans Stack**: `'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif`
  * Applied to body copy, table headers, forms, buttons, and navigation elements.
* **Code Mono Stack**: `'Fira Code', 'SFMono-Regular', Consolas, "Liberation Mono", Menlo, Courier, monospace`
  * Applied to request/response JSON content, split code diffs, logs indexes, and status indicator badges.

---

## Spacing & Layout

* **Header Height**: `60px`
* **Layout Structure**: 
  * Uses a flex-based layout for screens, filling `100vh` and avoiding browser scrollbars.
  * Sidebars and content drawers use grid definitions to keep layout elements aligned perfectly.
  * Left side nav list columns are matched to header widths (e.g., `#session-list` is grid-aligned to `.list-header`).
