# Lightfield Design Tokens — Extracted 2026-04-01

## Color System

Lightfield uses **OKLCH color space** throughout, with a sophisticated token architecture:
- **z-scale** (z0-z12): Solid colors from dark to light
- **t-scale** (t0-t12): Transparent overlays from 2% to 95% opacity

### Neutral Scale (Grays)
```
--color-neutral-z:   oklch(16% 0 0)     /* Darkest */
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
--color-neutral-t0:  oklch(100% 0 0/.02)   /* Barely visible */
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

### Color Hues Available
Full z0-z12 + t0-t2 scales for each:
- **Red** (hue 30-33): errors, destructive, alerts
- **Orange** (hue 65-72): attention, warm signals
- **Copper** (hue 69): muted warm accent
- **Yellow** (hue 87-91): attention, caution
- **Lime** (hue 111-115): secondary positive
- **Green** (hue 144-145): success, positive signals
- **Blue** (hue 248-251): **brand color**, primary actions, links — has full t0-t12 transparency scale
- **Indigo** (hue 271-277): secondary accent
- **Purple** (hue 296-303): tertiary accent
- **Magenta** (hue 342-350): decorative accent

### Semantic Color Tokens

#### Backgrounds
```
--color-background-primary:    var(--color-neutral-z2)    /* Dark mode: oklch(21.5%) */
--color-background-secondary:  var(--color-neutral-z1)    /* Slightly darker: oklch(20%) */
--color-background-tertiary:   var(--color-neutral-z3)    /* Slightly lighter: oklch(23%) */
--color-background-quaternary: var(--color-neutral-z4)    /* oklch(24.5%) */
```

#### Surfaces
```
--color-surface-primary:       var(--color-neutral-t1)    /* 4% transparent overlay */
--color-surface-secondary:     var(--color-neutral-t0)    /* 2% transparent overlay */
--color-surface-tertiary:      var(--color-neutral-z3)
--color-surface-inverse:       var(--color-neutral-z12)   /* White: oklch(96%) */
```

#### Content (Text)
```
--color-content-primary:       var(--color-neutral-t11)   /* 85% opacity — primary text */
--color-content-secondary:     var(--color-neutral-t9)    /* 60% opacity — muted text */
--color-content-tertiary:      var(--color-neutral-t10)   /* 75% opacity — labels, hints */
--color-content-quaternary:    var(--color-neutral-t8)    /* 50% opacity */
--color-content-subtle:        var(--color-neutral-t6)    /* 25% opacity — faint text */
--color-content-disabled:      var(--color-neutral-t6)    /* 25% opacity */
--color-content-inverse:       var(--color-neutral-z1)    /* Dark text on light bg */
--color-content-brand:         var(--color-blue-z7)       /* Blue brand text */
```

#### Semantic Content
```
--color-content-success:       var(--color-green-z7)
--color-content-attention:     var(--color-yellow-z7)
--color-content-error:         var(--color-red-z7)
--color-content-error-strong:  var(--color-red-z8)
```

#### Interactive States
```
--color-interactive-primary:              var(--color-neutral-t0)    /* 2% */
--color-interactive-primary-hover:        var(--color-neutral-t1)    /* 4% */
--color-interactive-primary-selected:     var(--color-neutral-t2)    /* 6% */
--color-interactive-secondary:            var(--color-neutral-t3)    /* 10% */
--color-interactive-secondary-hover:      var(--color-neutral-t4)    /* 12% */
--color-interactive-secondary-selected:   var(--color-neutral-t5)    /* 16% */
--color-interactive-brand:                var(--color-blue-z7)       /* Brand blue */
--color-interactive-brand-hover:          var(--color-blue-z8)
--color-interactive-brand-selected:       var(--color-blue-z9)
--color-interactive-brand-subtle:         var(--color-blue-t1)       /* 10% blue */
--color-interactive-brand-subtle-hover:   var(--color-blue-t2)       /* 14% blue */
--color-interactive-error:                var(--color-red-z7)
--color-interactive-inverse:              var(--color-neutral-z12)   /* White bg buttons */
```

#### Borders
```
--color-border-strong:    var(--color-neutral-t6)    /* 25% opacity */
--color-border-prominent: var(--color-neutral-t5)    /* 16% opacity */
--color-border-moderate:  var(--color-neutral-t3)    /* 10% opacity */
--color-border-subtle:    var(--color-neutral-t2)    /* 6% opacity */
--color-border-focused:   var(--color-blue-t4)       /* Blue focus ring: 40% opacity */
--color-border-error:     var(--color-red-z7)
```

#### Workflow/Stage Colors (for kanban, pipelines)
Each with bg (20% opacity of z2) and text:
- Red, Orange, Yellow, Lime, Green, Blue, Neutral

### Shadows
```
--shadow-button:          0px 1px 3px 0 var(--color-dark-t9)
--shadow-button-large:    0px 2px 6px 0 var(--color-dark-t10)
--shadow-composer:        0px 8px 24px 0 var(--color-dark-t10)
--shadow-plate:           0px 1px 3px 0 var(--color-dark-t1)
--shadow-sticky-top:      0 -4px 8px -4px var(--color-dark-t10)
--shadow-floating-menu:   0 0 0 .5px var(--color-border-moderate), 0px 6px 18px 0 var(--color-dark-t10)
--shadow-floating-dialog: 0 0 0 .5px var(--color-border-moderate), 0px 8px 24px 0 var(--color-dark-t10)
```

## Typography

### Font Stack
```
Primary: ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji"
Mono:    "DM Mono", "DM Mono Fallback"
CJK:     "Noto Sans JP/KR/SC/TC" (loaded as custom properties)
```
**NOTE**: Lightfield uses the **system font stack**, not Inter or a custom font. This gives native feel on each OS (San Francisco on Mac, Segoe UI on Windows).

### Font Sizes in Use
```
10px  — Rare, smallest text
11px  — Badge labels, meta text
12px  — Buttons, CTA links, small labels
13px  — Nav items, body text, sidebar items
15px  — (observed in larger text areas)
16px  — Body default (from <body>)
```

### Font Weights
```
400  — Normal body text
425  — **Unique weight** — used for nav items, most body text (slightly heavier than normal)
500  — Medium — buttons, labels, section headers
```
Note: The `425` weight is distinctive — it's between regular and medium, giving text slightly more presence without feeling bold.

### Line Heights
```
15.96px (for 12px text — ratio ~1.33)
17.94px (for 13px text — ratio ~1.38)
24px    (for 16px body text — ratio 1.5)
```

### Letter Spacing
```
normal — no custom letter-spacing used
```

## Spacing

### Gap Scale (from elements)
```
0px, 1px, 2px, 4px, 6px, 8px, 12px, 14px, 16px
```

### Key Measurements
- Sidebar width: **250px** (resizable)
- Sidebar item height: **32px**
- Sidebar item padding: **6px**
- Page header height: **44px**
- Page header padding: `10px 14px 10px 30px`
- Filter bar height: **~41px**
- Filter bar padding: `8px 14px 8px 30px`
- Filter bar gap: **14px**
- Content left padding: **30px** (from sidebar edge)
- Button height (small): **24px**
- Button padding (small): `2px 7px`

## Border Radius
```
4px  — Inputs, small elements
6px  — Buttons, cards, nav items, dropdowns
9999px (pill) — Avatars, round buttons
```

## Transitions
```
transition: all — used on interactive elements (nav items, buttons)
```
No specific duration extracted from CSS — likely short (150-200ms).

## Light Mode Specifics (Currently Active)
The app is in LIGHT MODE:
- Body background: `oklch(0.9851 0 0)` — very light warm white
- Main content: `oklch(0.9851 0 0)` — same
- Active sidebar item bg: `oklch(0 0 0 / 0.04)` — 4% black overlay
- Primary text: `oklch(0 0 0 / 0.85)` — 85% black
- Secondary text: `oklch(0 0 0 / 0.75)` — 75% black
- Tertiary text: `oklch(0 0 0 / 0.6)` — 60% black
- Hint text: `oklch(0 0 0 / 0.5)` — 50% black
- Button borders: `0.666667px solid oklch(0 0 0 / 0.12)` — 12% black, sub-pixel
- CTA button bg: `oklch(1 0 0)` — pure white
- CTA button shadow: `oklch(0 0 0 / 0.04) 0px 1px 3px 0px` — barely visible

## Dark Mode Token Mapping
The CSS variables show a dark mode architecture exists:
- Background tokens map to neutral-z1/z2/z3 (very dark grays)
- Content tokens use transparent whites (neutral-t9/t10/t11)
- The z-scale is designed for dark-first (low z = dark)

## Key Design Observations

1. **OKLCH everywhere** — perceptually uniform color space, modern CSS
2. **Transparency-based theming** — text/borders use alpha overlays, not fixed colors, making them work across any background
3. **Sub-pixel borders** — 0.666667px borders (2/3 pixel) for ultra-thin lines
4. **System fonts** — no custom font loading, instant render
5. **425 font weight** — distinctive in-between weight for the "default" text
6. **Blue as brand** — full transparency scale only exists for blue
7. **Minimal shadows** — shadows are extremely subtle in light mode
8. **High contrast ratio** — 85% black on near-white gives excellent readability
