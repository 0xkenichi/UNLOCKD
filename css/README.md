# Reusable Dashboard CSS

Portable design system for dark-theme dashboards with accent green. Use in any project.

## Quick use

```html
<link rel="stylesheet" href="path/to/reusable-dashboard.css" />
```

Then add classes to your HTML. All components use the **`.ds-`** prefix (design system) to avoid clashes with existing styles.

## Theming

Override CSS variables in your page or app:

```css
:root {
  --ds-bg-primary: #0a0a0c;
  --ds-bg-card: #1a1a20;
  --ds-accent: #00d26a;
  --ds-sidebar-width: 260px;
}
```

## Components

| Class / block | Purpose |
|---------------|--------|
| **Layout** | |
| `.ds-app` | Full-page dark background |
| `.ds-layout` | Flex container for sidebar + main |
| `.ds-sidebar` | Left nav column |
| `.ds-sidebar-brand` | Logo/title |
| `.ds-sidebar-nav` | Nav list container |
| `.ds-sidebar-link` | Nav item; use `.is-active` for current |
| `.ds-layout-main` | Main content area |
| `.ds-dashboard-grid` | Grid for cards |
| **Cards** | |
| `.ds-card` | Card/widget container |
| `.ds-card-header`, `.ds-card-title`, `.ds-card-subtitle` | Card header |
| `.ds-card-wide` | Card spanning grid (in dashboard grid) |
| **Buttons** | |
| `.ds-btn` | Base button |
| `.ds-btn-primary` | Accent (green) button |
| `.ds-btn-secondary` | Dark secondary |
| `.ds-btn-ghost` | Transparent |
| `.ds-btn-lg`, `.ds-btn-icon` | Size variants |
| **Tabs** | |
| `.ds-tabs` | Tab bar container |
| `.ds-tab` | Tab; use `.is-active` for selected |
| **Data** | |
| `.ds-table-wrap` + `.ds-table` | Table widget |
| `.ds-list-dots` | List with colored `.ds-dot` (e.g. `.ds-dot-green`) |
| **Map / chart** | |
| `.ds-map-wrap` | Container for map |
| `.ds-map-legend`, `.ds-map-legend-gradient` | Legend |
| `.ds-map-zoom`, `.ds-map-zoom-btn` | Zoom controls |
| **Overlay** | |
| `.ds-overlay-panel` | Floating panel (e.g. wallet UI) |
| `.ds-overlay-panel-header`, `.ds-overlay-panel-body`, `.ds-overlay-panel-footer` | Sections |
| `.ds-nav-icon` | Footer nav icon; use `.is-active` for current |

## Example: sidebar + main

```html
<div class="ds-app">
  <div class="ds-layout">
    <aside class="ds-sidebar">
      <div class="ds-sidebar-brand">DATS</div>
      <div class="ds-sidebar-section-title">DePIN Users</div>
      <nav class="ds-sidebar-nav">
        <a class="ds-sidebar-link is-active" href="#">Dashboard</a>
        <a class="ds-sidebar-link" href="#">My Node</a>
      </nav>
    </aside>
    <main class="ds-layout-main">
      <div class="ds-dashboard-grid">
        <div class="ds-card">...</div>
        <div class="ds-card ds-card-wide">...</div>
      </div>
    </main>
  </div>
</div>
```

## Copy to another project

Copy the file `reusable-dashboard.css` (and optionally this README) into the other repo and link it. No build step required; works with plain HTML, React, Vue, etc.
