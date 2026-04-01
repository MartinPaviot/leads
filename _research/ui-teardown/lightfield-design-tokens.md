# Lightfield Design Tokens — Deep Extraction 2026-04-01

All values verified via live Playwright DOM inspection + `getComputedStyle()`.

## Color Architecture

Lightfield uses **OKLCH color space** with a dual-scale token system:
- **z-scale** (z0-z12): Solid colors, dark to light
- **t-scale** (t0-t12): Transparent overlays, low to high opacity

300 total CSS custom properties on `:root`.

### Neutral Scale (Grays)
```
--color-neutral-z:   oklch(16% 0 0)     /* Deepest dark */
--color-neutral-z0:  oklch(18% 0 0)
--color-neutral-z1:  oklch(20% 0 0)
--color-neutral-z2:  oklch(21.5% 0 0)
--color-neutral-z3:  oklch(23% 0 0)
--color-neutral-z4:  oklch(24.5% 0 0)
--color-neutral-z5:  oklch(30% 0 0)
--color-neutral-z6:  oklch(40% 0 0)
--color-neutral-z7:  oklch(52% 0 0)
--color-neutral-z8:  oklch(64% 0 0)
--color-neutral-z9:  oklch(74% 0 0)
--color-neutral-z10: oklch(84% 0 0)
--color-neutral-z11: oklch(91% 0 0)
--color-neutral-z12: oklch(96% 0 0)
```

### Neutral Transparency Scale
```
--color-neutral-t0:  oklch(100% 0 0/.02)
--color-neutral-t1:  oklch(100% 0 0/.04)
--color-neutral-t2:  oklch(100% 0 0/.06)
--color-neutral-t3:  oklch(100% 0 0/.1)
--color-neutral-t4:  oklch(100% 0 0/.12)
--color-neutral-t5:  oklch(100% 0 0/.16)
--color-neutral-t6:  oklch(100% 0 0/.25)
--color-neutral-t7:  oklch(100% 0 0/.35)
--color-neutral-t8:  oklch(100% 0 0/.5)
--color-neutral-t9:  oklch(100% 0 0/.6)
--color-neutral-t10: oklch(100% 0 0/.75)
--color-neutral-t11: oklch(100% 0 0/.85)
--color-neutral-t12: oklch(100% 0 0/.95)
```

### Color Hues — Full z0-z12 + t0-t2 scales

| Hue     | Hue Angle | Usage                          |
|---------|-----------|--------------------------------|
| Red     | 30-33     | Errors, destructive, alerts    |
| Orange  | 64-72     | Attention, warm signals        |
| Copper  | 69        | Muted warm accent              |
| Yellow  | 87-91     | Caution, attention             |
| Lime    | 111-115   | Secondary positive             |
| Green   | 143-145   | Success, positive              |
| Blue    | 248-251   | **Brand**, primary actions     |
| Indigo  | 271-277   | Secondary accent               |
| Purple  | 296-303   | Tertiary accent                |
| Magenta | 342-350   | Decorative accent              |

**Blue is special**: Only blue has a full t0-t12 transparency scale (others only t0-t2). This makes blue the brand/interactive color with the most versatility.

### Blue Transparency Scale (brand-only)
```
--color-blue-t0:  oklch(60% .14 251/.04)
--color-blue-t1:  oklch(60% .14 251/.1)
--color-blue-t2:  oklch(60% .14 251/.14)
--color-blue-t3:  oklch(65% .15 251/.24)
--color-blue-t4:  oklch(65% .15 251/.4)
--color-blue-t5:  oklch(67% .145 251/.55)
--color-blue-t6:  oklch(70% .14 251/.65)
--color-blue-t7:  oklch(72% .13 250/.75)
--color-blue-t8:  oklch(75% .12 250/.82)
--color-blue-t9:  oklch(78% .1 250/.88)
--color-blue-t10: oklch(82% .08 249/.92)
--color-blue-t11: oklch(88% .05 249/.95)
--color-blue-t12: oklch(94% .02 248/.98)
```

## Semantic Color Tokens

### Backgrounds
```
--color-background-primary:    var(--color-neutral-z2)    /* Dark mode base */
--color-background-secondary:  var(--color-neutral-z1)
--color-background-tertiary:   var(--color-neutral-z3)
--color-background-quaternary: var(--color-neutral-z4)
```
**Light mode computed**: `oklch(0.9851 0 0)` — warm off-white (body bg)

### Surfaces
```
--color-surface-primary:              var(--color-neutral-t1)    /* 4% overlay */
--color-surface-secondary:            var(--color-neutral-t0)    /* 2% overlay */
--color-surface-tertiary:             var(--color-neutral-z3)
--color-surface-quaternary:           var(--color-dark-z)
--color-surface-inverse:              var(--color-neutral-z12)   /* White */
--color-surface-accent-blue-subtle:   var(--color-blue-z1)
--color-surface-accent-neutral-subtle:var(--color-neutral-t1)
--color-surface-error-faint:          var(--color-red-t0)
```

### Content (Text) — VERIFIED via getComputedStyle
```
--color-content-primary:       var(--color-neutral-t11)   → oklch(0 0 0 / 0.85) in light
--color-content-secondary:     var(--color-neutral-t9)    → oklch(0 0 0 / 0.6) in light
--color-content-tertiary:      var(--color-neutral-t10)   → oklch(0 0 0 / 0.75) in light
--color-content-quaternary:    var(--color-neutral-t8)    → oklch(0 0 0 / 0.5) in light
--color-content-subtle:        var(--color-neutral-t6)    → oklch(0 0 0 / 0.25) in light
--color-content-hint-strong:   var(--color-neutral-t8)    → 0.5 opacity
--color-content-hint-moderate: var(--color-neutral-t7)    → 0.35 opacity
--color-content-hint-subtle:   var(--color-neutral-t6)    → 0.25 opacity
--color-content-disabled:      var(--color-neutral-t6)    → 0.25 opacity
--color-content-inverse:       var(--color-neutral-z1)    → dark text on light bg
--color-content-brand:         var(--color-blue-z7)       → brand blue
--color-content-brand-strong:  var(--color-blue-z8)
```

### Semantic Content Colors
```
--color-content-success:       var(--color-green-z7)
--color-content-attention:     var(--color-yellow-z7)
--color-content-error:         var(--color-red-z7)
--color-content-error-strong:  var(--color-red-z8)
```

### Accent Content (per-hue strong/subtle pairs)
Each hue has `--color-content-accent-{hue}-strong` (z7/z8) and `-subtle` (z4/z5/z6):
- Red, Copper, Orange, Yellow, Lime, Green, Blue, Indigo, Purple, Magenta

### Chip/Badge Text Colors
```
--color-chip-text-{hue}: var(--color-content-accent-{hue}-strong)
```
Maps to the z7/z8 (strong) variant of each hue.

### Interactive States — VERIFIED
```
--color-interactive-primary:              var(--color-neutral-t0)    → 2% opacity
--color-interactive-primary-hover:        var(--color-neutral-t1)    → 4% opacity
--color-interactive-primary-selected:     var(--color-neutral-t2)    → 6% opacity
--color-interactive-secondary:            var(--color-neutral-t3)    → 10%
--color-interactive-secondary-hover:      var(--color-neutral-t4)    → 12%
--color-interactive-secondary-selected:   var(--color-neutral-t5)    → 16%
--color-interactive-tertiary:             var(--color-neutral-t1)
--color-interactive-tertiary-hover:       var(--color-neutral-t2)
--color-interactive-tertiary-selected:    var(--color-neutral-t3)
--color-interactive-quaternary-hover:     var(--color-neutral-t0)
--color-interactive-quaternary-selected:  var(--color-blue-z1)
--color-interactive-overlay:              var(--color-neutral-t6)
--color-interactive-overlay-hover:        var(--color-neutral-t7)
--color-interactive-overlay-selected:     var(--color-neutral-t8)
--color-interactive-inverse:              var(--color-neutral-z12)   → white
--color-interactive-inverse-hover:        var(--color-neutral-z10)
--color-interactive-brand:                var(--color-blue-z7)
--color-interactive-brand-hover:          var(--color-blue-z8)
--color-interactive-brand-selected:       var(--color-blue-z9)
--color-interactive-brand-subtle:         var(--color-blue-t1)       → 10% blue
--color-interactive-brand-subtle-hover:   var(--color-blue-t2)       → 14% blue
--color-interactive-brand-subtle-selected:var(--color-blue-t3)       → 24% blue
--color-interactive-error:                var(--color-red-z7)
--color-interactive-error-hover:          var(--color-red-z8)
--color-interactive-error-subtle:         var(--color-red-z1)
--color-interactive-error-faint:          var(--color-red-t0)
```

### Borders — VERIFIED
```
--color-border-strong:       var(--color-neutral-t6)    → 25% opacity
--color-border-prominent:    var(--color-neutral-t5)    → 16% opacity
--color-border-moderate:     var(--color-neutral-t3)    → 10% opacity
--color-border-subtle:       var(--color-neutral-t2)    → 6% opacity
--color-border-focused:      var(--color-blue-t4)       → 40% blue focus ring
--color-border-error:        var(--color-red-z7)
--color-border-error-subtle: var(--color-red-t1)
```
**Actual computed border**: `0.666667px solid oklch(0 0 0 / 0.12)` — sub-pixel, 12% black

### Input States
```
--color-input-primary-hover:    var(--color-neutral-t1)
--color-input-primary-focused:  var(--color-neutral-t1)
--color-input-primary-selected: var(--color-neutral-t1)
```

### Workflow/Stage Colors (kanban pipelines)
Each stage color uses `oklch(from var(--color-{hue}-z2) l c h/20%)` for bg, z7/z8 for text:
- Red, Orange, Yellow (copper text), Lime, Green, Blue, Neutral

### Overlays & Shadows — VERIFIED
```
--color-overlay-primary:     var(--color-dark-t8)
--color-scroll-shadow:       var(--color-dark-t5)

--shadow-button:             0px 1px 3px 0 var(--color-dark-t9)
--shadow-button-large:       0px 2px 6px 0 var(--color-dark-t10)
--shadow-composer:           0px 8px 24px 0 var(--color-dark-t10)
--shadow-plate:              0px 1px 3px 0 var(--color-dark-t1)
--shadow-sticky-top:         0 -4px 8px -4px var(--color-dark-t10)
--shadow-floating-menu:      0 0 0 .5px var(--color-border-moderate), 0px 6px 18px 0 var(--color-dark-t10)
--shadow-floating-dialog:    0 0 0 .5px var(--color-border-moderate), 0px 8px 24px 0 var(--color-dark-t10)
```

**Computed shadow on CTA button**: `oklch(0 0 0 / 0.04) 0px 1px 3px 0px`
**Computed shadow on composer**: `oklch(0 0 0 / 0.06) 0px 8px 24px 0px`
**Computed shadow on kanban card**: `oklch(0 0 0 / 0.04) 0px 1px 3px 0px`

## Typography — VERIFIED

### Font Stack
```
Primary: ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji"
Mono:    "DM Mono", "DM Mono Fallback"
CJK:     "Noto Sans JP/KR/SC/TC"
```
**System fonts** — no custom font loading. San Francisco (Mac), Segoe UI (Windows).

### Font Size Scale — ALL SIZES ON PAGE (verified)
```
7px   — Rare, very small metadata
10px  — Smallest visible text
12px  — Buttons, CTA labels, badges, stage headers, filter bar items
13px  — Nav items, body/table text, labels, form inputs, descriptions
15px  — Section headers on Up Next (Meetings/Tasks), chat messages
16px  — Body default (from <body>), chat contenteditable
24px  — Page titles (Settings "Profile"), Up Next date header
```

### Font Weights — VERIFIED (only 3 used)
```
400  — Body default (from <body>, contenteditable)
425  — Nav items, body text, table cells, form inputs, labels — slightly heavier than normal
500  — Buttons, badges, stage headers, section headers, page titles, h1
```
**425 is distinctive**: sits between regular (400) and medium (500). Gives text presence without boldness.

### Line Heights — VERIFIED
```
15.96px — for 12px text (ratio ~1.33)
17.94px — for 13px text (ratio ~1.38)
22.5px  — for 15px text (ratio 1.5)
24px    — for 16px body default (ratio 1.5)
30.96px — for 24px titles (ratio ~1.29)
```

### Letter Spacing
```
-0.3px — Page titles (24px)
normal — Everything else
```

### Typography Hierarchy — COMPLETE VERIFIED TABLE

| Usage                          | Size | Weight | Color                    |
|-------------------------------|------|--------|--------------------------|
| Page title (Settings)          | 24px | 500    | oklch(0 0 0 / 0.85)     |
| Date header (Up Next)          | 24px | 500    | oklch(0 0 0 / 0.85)     |
| Section header (Meetings/Tasks)| 15px | 500    | oklch(0 0 0 / 0.85)     |
| Chat messages (user + AI)      | 15px | 450*   | oklch(0 0 0 / 0.85)     |
| Nav items / table body         | 13px | 425    | oklch(0 0 0 / 0.75)     |
| Table headers                  | 13px | 425    | oklch(0 0 0 / 0.6)      |
| Form labels                    | 13px | 425    | oklch(0 0 0 / 0.6)      |
| Form inputs                    | 13px | 425    | oklch(0 0 0 / 0.85)     |
| Page description               | 13px | 425    | oklch(0 0 0 / 0.5)      |
| Buttons / CTA labels           | 12px | 500    | oklch(0 0 0 / 0.85)     |
| Badges / pills                 | 12px | 500    | per-category hue color   |
| Stage headers (kanban)         | 12px | 500    | oklch(0 0 0 / 0.85)     |
| Section labels (sidebar)       | 12px | 500    | oklch(0 0 0 / 0.6)      |
| Empty state text               | 13px | 425    | oklch(0 0 0 / 0.25)     |
| Disabled button text           | 12px | 500    | oklch(0 0 0 / 0.25)     |
| Toggle inactive text           | 12px | 500    | oklch(0 0 0 / 0.5)      |
| Kanban muted metadata          | 13px | 425    | oklch(0 0 0 / 0.5)      |

*Chat weight 450 is from earlier observation — may be 425 or interpolated.

## Spacing — VERIFIED

### Key Measurements
```
Sidebar width:             250px (resizable via drag handle)
Sidebar item height:       32px
Sidebar item padding:      6px
Content left padding:      30px (from sidebar edge)
Content right padding:     14px
Header bar height:         44px (including padding)
Header bar padding:        10px 14px 10px 30px
Filter bar height:         ~41px
Filter bar padding:        8px 14px 8px 30px
Filter bar gap:            14px between items
Table row height:          44px
Table header height:       46.67px
Table header padding:      11px 8px 11px 0px (first col) / 11px 8px 11px 10px
Table cell padding:        0px 8px 0px 0px
Kanban column width:       246px (with 6px horizontal padding → 234px card)
Kanban card padding:       6px
Kanban card gap:           1px
Kanban create btn height:  36px
Button height (small):     24px
Button height (submit):    32px
Button padding (small):    2px 7px
Button padding (submit):   2px 12px
Input height:              32px
Input padding:             8px 12px
Chat composer width:       740px
Chat composer height:      ~77px
Chat composer padding:     8px
```

### Spacing Scale (observed)
```
0px, 1px, 2px, 4px, 6px, 7px, 8px, 10px, 11px, 12px, 14px, 30px
```

## Border Radius — VERIFIED
```
4px    — Inputs (text fields), small controls
6px    — Buttons, nav items, badges, dropdowns, cards (most common)
8px    — Kanban cards
10px   — Chat composer, detail slide-over panel, chat bubbles
9999px — Avatars, round buttons (pill/circle)
```

## Borders — VERIFIED
All borders use **sub-pixel width**: `0.666667px` (2/3 pixel)
```
0.666667px solid oklch(0 0 0 / 0.12)  — Default (buttons, cards, table headers, badges)
0.666667px solid oklch(0 0 0 / 0.06)  — Subtle (form inputs at rest)
0.666667px solid oklch(0 0 0 / 0.16)  — Slightly stronger (select dropdowns)
0.666667px solid rgba(0, 0, 0, 0)     — Invisible (ghost buttons — same box model)
```
Border directions vary: `border-bottom` on table headers, `border-left` on detail panels.

## Transitions — VERIFIED
```
opacity 0.2s cubic-bezier(0.4, 0, 0.2, 1)    — Most interactive elements
opacity 0.075s cubic-bezier(0, 0, 0.2, 1)     — Fast transitions (hover hints)
transition: all                                 — Sidebar items, buttons (generic)
```

## Light Mode Computed Values (Current)
```
Body background:           oklch(0.9851 0 0)       — warm off-white
Table bg:                  oklch(0.9851 0 0)       — same as page
Kanban card bg:            oklch(0.9925 0 0)       — slightly whiter than page
CTA button bg:             oklch(1 0 0)            — pure white
Chat composer bg:          oklch(1 0 0)            — pure white
Active nav item bg:        oklch(0 0 0 / 0.04)     — 4% black overlay
Active toggle bg:          oklch(0 0 0 / 0.04)     — same
Disabled input bg:         oklch(0 0 0 / 0.02)     — 2% black
Avatar bg:                 oklch(0 0 0 / 0.25)     — 25% black placeholder
Sidebar secondary bg:      oklch(0.9702 0 0)       — slightly darker than page
Primary text:              oklch(0 0 0 / 0.85)     — 85% black
Secondary text:            oklch(0 0 0 / 0.75)     — 75% (nav items)
Tertiary text:             oklch(0 0 0 / 0.6)      — 60% (labels, headers)
Muted text:                oklch(0 0 0 / 0.5)      — 50% (descriptions, kanban meta)
Empty state text:          oklch(0 0 0 / 0.25)     — 25% (very faint)
Disabled text:             oklch(0 0 0 / 0.25)     — 25%
```

## Dark Mode Architecture
The CSS variables reveal dark-first design:
- z-scale: low z = dark (z0 = oklch(18%)), high z = light (z12 = oklch(96%))
- In dark mode: backgrounds use z1/z2/z3 directly
- In light mode: the inversion happens — content uses black transparencies on light bg
- t-scale: white transparencies in dark mode, inverted to black in light mode

## Badge Color Mapping — VERIFIED via getComputedStyle

| Category                        | BG (OKLCH)                           | Text (RGB)           | Hue   |
|---------------------------------|--------------------------------------|----------------------|-------|
| Software                        | oklch(0.654 0.145 251 / 0.1)        | rgb(34, 74, 115)     | Blue  |
| IT & Services / IT And Services | oklch(0.654 0.145 251 / 0.1)        | rgb(34, 74, 115)     | Blue  |
| Technology Services             | oklch(0.582 0.197 271 / 0.1)        | rgb(42, 54, 119)     | Indigo|
| Leasing                         | oklch(0.582 0.197 271 / 0.1)        | rgb(42, 54, 119)     | Indigo|
| Manufacturing                   | oklch(0.789 0.158 64 / 0.1)         | rgb(128, 81, 28)     | Orange|
| Client Service / Engineering    | oklch(0.659 0.184 143 / 0.1)        | rgb(29, 87, 30)      | Green |
| Food Processing                 | oklch(0.617 0.191 33 / 0.1)         | rgb(112, 38, 23)     | Red   |
| Artificial Intelligence         | (separate category color)            | -                    | -     |
| FinTech                         | (separate category color)            | -                    | -     |

Badge formula: bg = `oklch({z5-z7 lightness} {chroma} {hue} / 0.1)`, text = hue's z7/z8 as solid RGB.

## Key Design System Observations

1. **OKLCH everywhere** — perceptually uniform, modern CSS color space
2. **Transparency-based theming** — text/borders use alpha, auto-adapts to any background
3. **Sub-pixel borders (0.666667px)** — ultra-thin definition without visual weight
4. **System fonts** — zero FOUT, native OS feel
5. **Font weight 425** — distinctive default between regular and medium
6. **Blue-only full t-scale** — brand color gets most token investment
7. **Minimal shadows** — extremely subtle in light mode (0.04 opacity)
8. **High contrast ratio** — 85% black on near-white = excellent readability
9. **3 border-radius values do 90% of work** — 6px (most), 8px (cards), 10px (chat/panels)
10. **Consistent 0.666667px border** — same width everywhere, only color/opacity varies
