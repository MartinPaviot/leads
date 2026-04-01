# LeadSens Design System Specification

Based on comprehensive teardowns of Lightfield (live DOM inspection) and Monaco (screenshot analysis). Every decision references WHY based on competitive analysis.

---

## 1. COLOR PALETTE

### Philosophy
Dark mode first (like Monaco) because founders work late. Use OKLCH for semantic tokens but ship hex for browser compatibility. Transparency-based text/borders (from Lightfield) for theme flexibility.

### Background Colors
| Token | Hex | OKLCH | Inspired By | Reason |
|-------|-----|-------|-------------|--------|
| `--bg-base` | `#09090b` | `oklch(0.13 0 0)` | Monaco `#0D0D0D` | Deepest background. Monaco's near-black is more premium than our current `#0a0b0f` |
| `--bg-surface` | `#121214` | `oklch(0.17 0 0)` | Monaco `#1A1A1E` | Cards, panels, table areas. Slightly lighter for layering |
| `--bg-elevated` | `#1a1a1f` | `oklch(0.20 0 0)` | Monaco `#252529` | Modals, dropdowns, popovers |
| `--bg-muted` | `#222228` | `oklch(0.23 0 0)` | Monaco `#2A2A2E` | Hover states, active elements, input backgrounds |
| `--bg-emphasis` | `#2a2a31` | `oklch(0.26 0 0)` | Monaco `#333338` | Selected states, pressed buttons |

### Text Colors (transparency-based, from Lightfield)
| Token | Value | Hex Equiv | Inspired By | Reason |
|-------|-------|-----------|-------------|--------|
| `--text-primary` | `rgba(255,255,255,0.92)` | `#eaeaeb` | Lightfield `oklch(0 0 0/0.85)` inverted | Primary text. 92% white — bright but not harsh |
| `--text-secondary` | `rgba(255,255,255,0.64)` | `#a3a3a3` | Lightfield `oklch(0 0 0/0.75)` inverted + Monaco `#A0A0A8` | Labels, column headers, metadata |
| `--text-tertiary` | `rgba(255,255,255,0.45)` | `#737373` | Lightfield `oklch(0 0 0/0.5)` inverted | Placeholder text, descriptions, disabled |
| `--text-muted` | `rgba(255,255,255,0.28)` | `#474747` | Lightfield `oklch(0 0 0/0.25)` inverted | Hints, very subtle text |

### Border Colors (transparency-based, from Lightfield)
| Token | Value | Inspired By | Reason |
|-------|-------|-------------|--------|
| `--border-default` | `rgba(255,255,255,0.08)` | Lightfield 0.666px at 12% | Subtle borders. Uses Lightfield's alpha approach for theme flexibility |
| `--border-moderate` | `rgba(255,255,255,0.12)` | Lightfield `--color-border-moderate` | More visible borders (filter bars, cards) |
| `--border-strong` | `rgba(255,255,255,0.20)` | Lightfield `--color-border-strong` | Active elements, focus indicators |
| `--border-focus` | `rgba(99,102,241,0.5)` | Lightfield `--color-border-focused` (blue) | Focus rings |

### Brand / Accent Colors
| Token | Hex | Inspired By | Reason |
|-------|-----|-------------|--------|
| `--accent` | `#6366f1` | Monaco indigo-purple gradient feel | Primary actions. Indigo is modern and distinctive from Lightfield's blue |
| `--accent-hover` | `#818cf8` | Derived lighter | Hover state |
| `--accent-soft` | `rgba(99,102,241,0.12)` | Lightfield `--color-interactive-brand-subtle` | Badges, selected nav items |
| `--accent-muted` | `rgba(99,102,241,0.06)` | Derived | Subtle backgrounds |

### Semantic Colors
| Token | Hex | Soft (12%) | Usage |
|-------|-----|------------|-------|
| `--success` | `#22c55e` | `rgba(34,197,94,0.12)` | Won deals, positive signals, "Yes" badges (from Monaco) |
| `--warning` | `#f59e0b` | `rgba(245,158,11,0.12)` | Risk indicators, "Burning" scores (from Monaco) |
| `--error` | `#ef4444` | `rgba(239,68,68,0.12)` | Lost deals, errors, "No" badges |
| `--info` | `#3b82f6` | `rgba(59,130,246,0.12)` | Links, informational badges |

### Score/Signal Colors (from Monaco)
| Token | Hex | Usage |
|-------|-----|-------|
| `--score-a` | `#22c55e` (green) | A-grade accounts, "Burning" |
| `--score-b` | `#f59e0b` (amber) | B-grade accounts, "Warm" |
| `--score-c` | `#3b82f6` (blue) | C-grade accounts, "Cool" |
| `--score-d` | `#6b7280` (gray) | D-grade accounts, "Cold" |

### Badge Category Colors (from Lightfield's auto-color system)
10 hues for automatic assignment to industry/category values:
| Index | Hex | Soft BG | Text |
|-------|-----|---------|------|
| 0 | Blue `#3b82f6` | `rgba(59,130,246,0.10)` | `#2563eb` |
| 1 | Green `#22c55e` | `rgba(34,197,94,0.10)` | `#16a34a` |
| 2 | Purple `#a855f7` | `rgba(168,85,247,0.10)` | `#9333ea` |
| 3 | Orange `#f97316` | `rgba(249,115,22,0.10)` | `#ea580c` |
| 4 | Cyan `#06b6d4` | `rgba(6,182,212,0.10)` | `#0891b2` |
| 5 | Red `#ef4444` | `rgba(239,68,68,0.10)` | `#dc2626` |
| 6 | Lime `#84cc16` | `rgba(132,204,22,0.10)` | `#65a30d` |
| 7 | Indigo `#6366f1` | `rgba(99,102,241,0.10)` | `#4f46e5` |
| 8 | Pink `#ec4899` | `rgba(236,72,153,0.10)` | `#db2777` |
| 9 | Amber `#f59e0b` | `rgba(245,158,11,0.10)` | `#d97706` |

Color assigned by: `hash(categoryString) % 10`

---

## 2. TYPOGRAPHY

### Font Family
```css
--font-sans: 'Inter', ui-sans-serif, system-ui, sans-serif;
--font-mono: 'JetBrains Mono', 'DM Mono', monospace;
```
**Justification**: Keep Inter as primary (Monaco uses Inter-like font). It supports variable weights (400-700 smoothly) which Lightfield's system fonts don't. Inter at 13-14px is extremely legible for data-dense CRM tables.

### Type Scale
| Token | Size | Weight | Line Height | Letter Spacing | Usage |
|-------|------|--------|-------------|----------------|-------|
| `--text-2xl` | 24px | 600 | 32px | -0.3px | Settings page titles (from Lightfield 24px/500/-0.3) |
| `--text-xl` | 20px | 600 | 28px | -0.2px | Hero numbers, date headers (Up Next "Wed, Apr 1") |
| `--text-lg` | 16px | 500 | 22px | 0 | Section headers ("Meetings", "Tasks") |
| `--text-base` | 14px | 400 | 20px | 0 | Primary body text, table cells (Monaco 13-14px body) |
| `--text-chat` | 15px | 450 | 22px | 0 | Chat messages only (from Lightfield's distinct chat size) |
| `--text-sm` | 13px | 400 | 18px | 0 | Nav items, secondary text (Lightfield nav at 13px/425) |
| `--text-xs` | 12px | 500 | 16px | 0 | Buttons, badges, labels (consistent across both products) |
| `--text-xxs` | 11px | 500 | 14px | 0 | Section headers (sidebar "RECORDS"), smallest text |
| `--text-micro` | 10px | 500 | 14px | 0.5px | Rare — smallest badges (from Monaco micro text) |

### Font Weights
| Token | Weight | Usage |
|-------|--------|-------|
| `--font-normal` | 400 | Body text, descriptions |
| `--font-medium` | 500 | Nav items, buttons, labels, badges |
| `--font-semibold` | 600 | Page titles, section headers, emphasis |

**Note**: Lightfield uses 425/450 weights. Inter supports these via variable font. We MAY use them for body text (`font-variation-settings: 'wght' 425`) but start with standard 400/500 for simplicity.

---

## 3. SPACING

### Scale
Base unit: 4px. Consistent with Lightfield's observed gap values.

| Token | Value | Usage |
|-------|-------|-------|
| `--space-0.5` | 2px | Sub-pixel adjustments, badge icon gaps |
| `--space-1` | 4px | Tight inline spacing, icon-text gaps |
| `--space-1.5` | 6px | Sidebar item padding, button padding (Lightfield nav items) |
| `--space-2` | 8px | Standard element gap, small card padding |
| `--space-3` | 12px | Chat bubble padding, filter bar gaps |
| `--space-3.5` | 14px | Filter bar item gap (from Lightfield exactly 14px) |
| `--space-4` | 16px | Card padding, section gaps |
| `--space-5` | 20px | Content section spacing |
| `--space-6` | 24px | Major section separation |
| `--space-8` | 32px | Page-level spacing, content padding |
| `--space-10` | 40px | Large gaps (settings content top) |

### Content Padding Standards
| Area | Value | Source |
|------|-------|--------|
| Content left padding | 30px | Lightfield header `10px 14px 10px 30px` |
| Content right padding | 14px | Lightfield header padding-right |
| Card internal padding | 16px | Both products |
| Chat bubble padding | `8px 12px` | Lightfield user bubble |
| Button padding (small) | `2px 7px` | Lightfield button measurements |
| Button padding (medium) | `6px 12px` | Derived from nav items |

---

## 4. COMPONENT SPECS

### Button — Primary
| Property | Value | Reference |
|----------|-------|-----------|
| Height | 28px | Between Lightfield 24px and Monaco ~32px |
| Font size | 12px | Both products use 12px for buttons |
| Font weight | 500 | Both products |
| Color | `--text-primary` | White text on dark |
| Background | `--accent` (#6366f1) | Brand indigo |
| Border | none | Clean, no border on filled buttons |
| Border radius | 6px | Lightfield standard |
| Padding | `4px 12px` | Balanced |
| Shadow | `0 1px 2px rgba(0,0,0,0.3)` | Subtle lift (adapted from Lightfield shadow-button) |
| Hover | `--accent-hover` (#818cf8) | Lighter accent |
| Active | `#5855e0` | Slightly darker |
| Disabled | 50% opacity | Standard |
| Transition | `all 150ms ease` | Fast, smooth |

### Button — Secondary
| Property | Value |
|----------|-------|
| Background | `transparent` |
| Border | `0.5px solid var(--border-moderate)` |
| Color | `--text-primary` |
| Shadow | none |
| Hover bg | `var(--bg-muted)` |

### Button — Ghost
| Property | Value |
|----------|-------|
| Background | `transparent` |
| Border | none |
| Color | `--text-secondary` |
| Hover bg | `var(--bg-muted)` |
| Hover color | `--text-primary` |

### Button — Icon Only
| Property | Value |
|----------|-------|
| Size | 28x28px |
| Padding | 6px |
| Icon size | 16px |
| Border radius | 6px |
| Same hover as ghost |

### Button — Destructive
| Property | Value |
|----------|-------|
| Background | `--error` |
| Color | white |
| Hover | `#dc2626` (darker red) |

### Input — Text
| Property | Value | Reference |
|----------|-------|-----------|
| Height | 32px | Slightly larger than Lightfield 28px dropdown |
| Font size | 13px | Lightfield input size |
| Font weight | 400 |
| Color | `--text-primary` |
| Background | `--bg-muted` | Monaco input bg `#2C2C30` |
| Border | `0.5px solid var(--border-default)` | Lightfield sub-pixel border |
| Border radius | 6px | Lightfield standard |
| Padding | `6px 10px` |
| Placeholder | `--text-tertiary` |
| Focus ring | `0 0 0 2px var(--border-focus)` | Lightfield blue focus |
| Focus border | `var(--accent)` |

### Input — Textarea
Same as text input but:
- Min height: 80px
- Resize: vertical
- Line height: 20px

### Input — Select/Dropdown
| Property | Value | Reference |
|----------|-------|-----------|
| Height | 28px | Lightfield dropdown 28px |
| Font size | 13px |
| Padding | `4px 6px 4px 8px` | Lightfield exact measurement |
| Border | `0.5px solid var(--border-moderate)` |
| Chevron | 12px right-aligned icon |
| Dropdown panel | `--bg-elevated`, shadow-floating-menu, border-radius 8px |
| Option height | 32px |
| Option hover | `--bg-muted` |

### Input — Toggle/Switch
| Property | Value |
|----------|-------|
| Width | 36px |
| Height | 20px |
| Border radius | 10px (pill) |
| Track off | `--bg-muted` |
| Track on | `--accent` |
| Thumb size | 16px |
| Transition | `200ms ease-in-out` |

### Input — Checkbox
| Property | Value | Reference |
|----------|-------|-----------|
| Size | 16x16px | Lightfield exact |
| Border radius | 4px | Lightfield exact |
| Unchecked bg | `transparent` |
| Unchecked border | `0.5px solid var(--border-moderate)` |
| Checked bg | `--accent` | (Lightfield uses blue `oklch(0.787 0.112 249.8)`) |
| Checked icon | White checkmark, 10px |
| Transition | `150ms ease` |

### Table
| Property | Value | Reference |
|----------|-------|-----------|
| Row height | 40px | Monaco 36-40px (data-dense) |
| Header height | 36px | Monaco column headers |
| Header font | 12px, 500, `--text-secondary` | Both products |
| Header bg | `--bg-surface` |
| Header border-bottom | `var(--border-moderate)` |
| Cell font | 13px, 400, `--text-primary` |
| Cell padding | `0 12px` | Monaco 12px horizontal |
| Row border-bottom | `var(--border-default)` | Subtle separator |
| Hover row bg | `--bg-muted` |
| Selected row bg | `--accent-soft` |
| Sticky header | yes |
| Footer | 36px, `--text-secondary` |

### Card
| Property | Value | Reference |
|----------|-------|-----------|
| Background | `--bg-surface` |
| Border | `0.5px solid var(--border-default)` | Lightfield sub-pixel |
| Border radius | 8px | Lightfield CRM card 8px |
| Padding | 16px |
| Shadow | none (dark mode — shadows invisible) |
| Hover (interactive) | border color → `--border-moderate` |

### Badge/Pill
| Property | Value | Reference |
|----------|-------|-----------|
| Height | 22px | Between Lightfield 24px and Monaco compact |
| Font size | 11px | Compact for dense tables |
| Font weight | 500 |
| Border radius | 4px | Monaco badge radius |
| Padding | `2px 8px` |
| Border | `0.5px solid var(--border-default)` |
| Background | category color at 10% opacity | Lightfield's 10% bg system |
| Text | darker shade of category color |

### Score Badge (special, from Monaco)
| Grade | Text | Background | Icon |
|-------|------|------------|------|
| A | white | `--success` solid | fire emoji |
| B | white | `--warning` solid | fire emoji |
| C | white | `--info` solid | — |
| D | `--text-secondary` | `--bg-emphasis` | — |

### Avatar
| Size | Usage |
|------|-------|
| 16px | Inline in tables (from Lightfield) |
| 24px | Sidebar items, small references |
| 32px | Contact cards, chat messages |
| 40px | Detail panel headers (from Lightfield) |
| Fallback | Colored initials on bg-emphasis |
| Shape | Rounded (border-radius: 6px), not circular |

### Modal/Dialog
| Property | Value | Reference |
|----------|-------|-----------|
| Overlay | `rgba(0,0,0,0.6)` | Lightfield `--color-overlay-primary` |
| Width | 480px (sm), 640px (md), 800px (lg) |
| Background | `--bg-elevated` |
| Border | `0.5px solid var(--border-moderate)` |
| Border radius | 12px | Monaco popover radius |
| Shadow | `0 0 0 0.5px var(--border-moderate), 0 8px 24px rgba(0,0,0,0.4)` | Lightfield floating-dialog |
| Padding | 24px |
| Header | title + close button (24px), border-bottom |
| Footer | action buttons right-aligned, border-top |

### Toast/Notification
| Property | Value |
|----------|-------|
| Position | bottom-right |
| Width | 360px |
| Background | `--bg-elevated` |
| Border | `0.5px solid var(--border-moderate)` |
| Border radius | 8px |
| Shadow | floating-dialog shadow |
| Enter | slide up + fade in, 200ms |
| Exit | fade out, 150ms |
| Duration | 4s default, 8s for errors |

### Tooltip
| Property | Value |
|----------|-------|
| Background | `--bg-emphasis` |
| Color | `--text-primary` |
| Font size | 12px |
| Border radius | 6px |
| Padding | `4px 8px` |
| Shadow | `0 4px 12px rgba(0,0,0,0.3)` |
| Delay | 300ms |
| Arrow | 6px, same bg |

### Sidebar Nav Item
| Property | Default | Active | Hover |
|----------|---------|--------|-------|
| Height | 32px | 32px | 32px |
| Font size | 13px | 13px | 13px |
| Font weight | 500 | 500 | 500 |
| Color | `--text-secondary` | `--text-primary` | `--text-primary` |
| Background | transparent | `--accent-soft` | `--bg-muted` |
| Border radius | 6px | 6px | 6px |
| Padding | 6px | 6px | 6px |
| Icon size | 16px | 16px (accent color) | 16px |

### Chat — User Bubble
| Property | Value | Reference |
|----------|-------|-----------|
| Alignment | right (flex-end) | Lightfield |
| Background | `--bg-muted` | Lightfield `oklch(0 0 0/0.04)` inverted for dark |
| Border radius | 10px | Lightfield exact |
| Padding | `8px 12px` | Lightfield exact |
| Font size | 15px | Lightfield chat size |
| Font weight | 450 | Lightfield distinctive weight |
| Max width | 85% |

### Chat — AI Response
| Property | Value | Reference |
|----------|-------|-----------|
| Alignment | left (full width) | Lightfield |
| Background | transparent | Lightfield — no bubble |
| Font size | 15px | Lightfield |
| Font weight | 400 | Slightly lighter than user |
| Line height | 22px (1.47) | Lightfield 22.5px |
| Label | "LeadSens" with sparkle icon, `--text-tertiary` |
| Citations | inline links, `--accent` color, underline on hover |
| Code blocks | `--bg-surface`, `--font-mono`, border-radius 6px |

### Chat — CRM Data Card (inline)
| Property | Value | Reference |
|----------|-------|-----------|
| Background | `--bg-surface` | Lightfield white → our surface |
| Border | `0.5px solid var(--border-moderate)` | Lightfield `0.666px` |
| Border radius | 8px | Lightfield exact |
| Padding | `8px 12px` |
| Contains | entity icon + title + metadata |

### Empty State
| Property | Value |
|----------|-------|
| Layout | Centered in content area |
| Icon | 40px muted icon (relevant to entity type) |
| Title | `--text-lg`, `--text-primary` |
| Description | `--text-sm`, `--text-tertiary` |
| CTA | Primary button or text link with arrow |
| Illustration | Optional SVG illustration (unlike Lightfield's bare approach) |

### Loading — Skeleton
| Property | Value |
|----------|-------|
| Background | `--bg-muted` |
| Animation | shimmer left-to-right, 1.5s infinite |
| Border radius | 4px for text lines, 6px for cards |
| Height | matches the element being loaded |

### Loading — Spinner
| Property | Value |
|----------|-------|
| Size | 16px (inline), 24px (section), 40px (page) |
| Color | `--accent` |
| Animation | `spin 0.8s linear infinite` |

---

## 5. LAYOUT SPECS

### Sidebar
| Property | Value | Reference |
|----------|-------|-----------|
| Width | 240px (default) | Between Lightfield 250px and Monaco ~220px |
| Min width | 200px | Resizable |
| Max width | 320px | |
| Background | `--bg-base` | Same as page bg (from Lightfield's transparent approach) |
| Border right | `var(--border-default)` | Subtle separator |
| Collapse | icon-only mode at 52px | |

### Main Content
| Property | Value |
|----------|-------|
| Left offset | sidebar width |
| Padding | `0 14px 0 24px` (no top — header handles it) |
| Max width | none (tables fill viewport) |
| Background | `--bg-base` |

### Page Header
| Property | Value | Reference |
|----------|-------|-----------|
| Height | 44px | Lightfield exact |
| Padding | `10px 14px 10px 24px` | Lightfield adapted |
| Border bottom | `var(--border-default)` |
| Content | icon + title + view toggles + spacer + actions |

### Filter Bar
| Property | Value | Reference |
|----------|-------|-----------|
| Height | 40px | Lightfield ~41px |
| Padding | `8px 14px 8px 24px` | Lightfield adapted |
| Border bottom | `var(--border-default)` |
| Gap | 14px | Lightfield exact |

### Detail Panel (Slide-over)
| Property | Value | Reference |
|----------|-------|-----------|
| Width | 400px | Lightfield 388px, rounded up |
| Background | `--bg-elevated` |
| Border left | `var(--border-moderate)` |
| Border radius | 10px (left corners only) | Lightfield exact |
| Shadow | `0 8px 24px rgba(0,0,0,0.3)` |
| Animation | slide in from right, 200ms ease-out |

### Kanban
| Property | Value | Reference |
|----------|-------|-----------|
| Column width | 260px | Lightfield ~246px + padding |
| Column padding | `0 8px` |
| Column gap | 0 (columns touch) |
| Card gap | 8px |
| Stage header height | 36px |
| Footer height | 36px |

### Settings Page
| Property | Value |
|----------|-------|
| Content max-width | 720px |
| Title size | `--text-2xl` (24px) |
| Description | `--text-sm`, `--text-tertiary` |
| Section gap | 32px |

### Responsive Breakpoints
| Breakpoint | Behavior |
|-----------|----------|
| >= 1440px | Full layout, expanded sidebar |
| 1280-1439px | Sidebar collapsible, may auto-collapse |
| 1024-1279px | Sidebar collapsed to icon mode |
| < 1024px | Not supported (desktop-first) |

---

## 6. ANIMATION SPECS

| Animation | Duration | Easing | Usage |
|-----------|----------|--------|-------|
| Hover states | 150ms | ease | Buttons, nav items, table rows |
| Sidebar collapse | 200ms | ease-in-out | Width transition |
| Modal open | 200ms | ease-out | Scale from 0.95 + fade in |
| Modal close | 150ms | ease-in | Scale to 0.95 + fade out |
| Detail panel slide | 200ms | ease-out | Transform translateX |
| Toast enter | 200ms | ease-out | Slide up + fade in |
| Toast exit | 150ms | ease-in | Fade out |
| Skeleton shimmer | 1.5s | linear infinite | Background-position animation |
| Chat message | 100ms | ease-out | Fade in + slide up 4px |
| Page transition | 0ms | instant | No animation (from Lightfield) |
| Focus ring | 150ms | ease | Border-color transition |
| Dropdown open | 100ms | ease-out | Scale from 0.95 + fade in |
| Checkbox toggle | 150ms | ease | Background + checkmark appearance |

---

## 7. IMPLEMENTATION NOTES

### CSS Architecture
- Use CSS custom properties for ALL tokens (no hardcoded values)
- Tailwind CSS 4 with `@theme` for token registration
- Sub-pixel borders via `border-width: 0.5px` (rounds to 1px on 1x displays, sharp on 2x)
- Transparency-based text/borders for automatic dark/light compatibility

### Tailwind Theme Extension
```css
@theme {
  --color-bg-base: #09090b;
  --color-bg-surface: #121214;
  --color-bg-elevated: #1a1a1f;
  --color-bg-muted: #222228;
  --color-bg-emphasis: #2a2a31;
  
  --color-text-primary: rgba(255,255,255,0.92);
  --color-text-secondary: rgba(255,255,255,0.64);
  --color-text-tertiary: rgba(255,255,255,0.45);
  
  --color-border-default: rgba(255,255,255,0.08);
  --color-border-moderate: rgba(255,255,255,0.12);
  --color-border-strong: rgba(255,255,255,0.20);
  
  --color-accent: #6366f1;
  --color-accent-hover: #818cf8;
  --color-accent-soft: rgba(99,102,241,0.12);
  
  --color-success: #22c55e;
  --color-warning: #f59e0b;
  --color-error: #ef4444;
  --color-info: #3b82f6;
}
```

### Key Differentiators from Current Design
1. **Sub-pixel borders** (0.5px) — adds definition without weight
2. **Transparency text** — replaces fixed gray values
3. **Badge auto-coloring** — hash-based color assignment from Lightfield
4. **Chat at 15px/450** — distinct from UI text at 13px/400
5. **6px border-radius standard** — down from current 10px (more refined)
6. **40px table rows** — denser than typical, matches Monaco
7. **Slide-over detail panels** — not full-page navigation
8. **Settings page title at 24px with -0.3px letter-spacing** — tight, elegant display text
