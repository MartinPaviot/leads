# Design Language — LeadSens

## Philosophy

Dense when data matters. Clean when conversation matters. The chat is Lightfield-clean. The pipeline is Monaco-dense. The transition should feel natural.

## Color System

```css
/* Base — dark mode default */
--bg-primary: #0a0b0f;          /* Main background */
--bg-surface: #12131a;          /* Cards, panels */
--bg-elevated: #1a1b24;         /* Modals, dropdowns */
--border: #1e1f2a;              /* Subtle borders */

/* Text */
--text-primary: #e8e8ed;        /* Primary text */
--text-secondary: #8b8ba0;      /* Muted, labels */
--text-tertiary: #5a5a70;       /* Disabled, hints */

/* Accent — indigo, inspired by Monaco */
--accent: #6366f1;              /* Primary actions, links */
--accent-soft: rgba(99,102,241,0.12);  /* Hover states, badges */
--accent-strong: #818cf8;       /* Accent on dark backgrounds */

/* Semantic */
--green: #22c55e;               /* Won, positive, hot */
--green-soft: rgba(34,197,94,0.12);
--amber: #f59e0b;               /* Warm, warning, in progress */
--amber-soft: rgba(245,158,11,0.12);
--red: #ef4444;                 /* Risk, lost, error */
--red-soft: rgba(239,68,68,0.12);
--blue: #3b82f6;                /* Info, links */
```

## Typography

```css
/* Font stack — Inter for UI, system fallbacks */
--font-sans: 'Inter', -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
--font-mono: 'JetBrains Mono', 'Fira Code', monospace;

/* Scale */
--text-xs: 11px;    /* Badges, meta */
--text-sm: 13px;    /* Secondary text, table cells */
--text-base: 14px;  /* Primary text */
--text-lg: 16px;    /* Subheadings */
--text-xl: 20px;    /* Page titles */
--text-2xl: 24px;   /* Stats, hero numbers */

/* Weight */
--font-normal: 400;
--font-medium: 500;
--font-semibold: 600;
--font-bold: 700;
```

## Spacing

Base unit: 4px. Everything is multiples of 4.
- `xs`: 4px
- `sm`: 8px
- `md`: 12px
- `lg`: 16px
- `xl`: 24px
- `2xl`: 32px

## Components

### Cards
- Background: `--bg-surface`
- Border: 1px solid `--border`
- Border-radius: 10px
- Padding: 16px

### Buttons
- Primary: `--accent` background, white text, rounded-lg
- Secondary: transparent, `--border` border, `--text-primary` text
- Ghost: transparent, no border, `--text-secondary`
- All: 8px 16px padding, 14px text, 500 weight

### Score Badges
- Letter grade (A, B, C, D) with semantic color
- Fire icon for "burning" / hot accounts
- Pill shape, small (--text-xs)

### Signal Tags
- Colored pills: green for positive, amber for neutral, red for negative
- Industry tags: distinct muted colors per category
- Rounded-full, padding 2px 8px

### Chat
- User messages: right-aligned, subtle background
- AI messages: left-aligned, full width, markdown-rendered
- Streaming: character-by-character with cursor
- Citations: inline links to original source with hover preview
- Input: Bottom-fixed, full-width, minimal border

### Tables (Pipeline, TAM)
- Dense: 13px text, 40px row height
- Column headers: uppercase, 11px, muted
- Hover: subtle row highlight
- Sticky headers
- Sortable, filterable

### Sidebar
- 220px width, collapsible
- Section headers: uppercase, 11px, muted
- Active item: accent-soft background, accent text
- Icons: 18px, muted until active

## States

### Empty
- Centered illustration or icon
- Helpful text explaining what will appear
- Clear CTA to populate ("Connect email" / "Build TAM")

### Loading
- Skeleton screens, not spinners
- Chat: typing indicator dots

### Error
- Red accent, clear message, retry action
- Never technical jargon in error messages

## Motion

- Transitions: 150ms ease
- Page transitions: none (instant)
- Chat streaming: real-time characters
- Sidebar collapse: 200ms ease-in-out

## Responsive

- Desktop-first (founders use laptops)
- Min-width: 1024px
- Sidebar collapses below 1280px
- Mobile: not a priority for V1
