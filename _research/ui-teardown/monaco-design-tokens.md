# Monaco Design Tokens - Extracted from Screenshots

## Color Palette

### Background Colors
| Token | Value (approx) | Usage |
|-------|----------------|-------|
| `bg-primary` | `#0D0D0D` / near-black | Main app background, deepest layer |
| `bg-secondary` | `#1A1A1E` / dark charcoal | Cards, panels, table rows (odd) |
| `bg-tertiary` | `#252529` / dark gray | Table rows (even), sidebar items, input fields |
| `bg-surface` | `#2A2A2E` / medium-dark gray | Modal backgrounds, popover surfaces, "Ask AI" chat area |
| `bg-elevated` | `#333338` / slightly lighter gray | Hover states on table rows, active sidebar items |
| `bg-hero` | `#1C1C20` / off-black | Hero video product demo background, dotted grid pattern overlay |
| `bg-website` | `#000000` / pure black | Marketing website background |
| `bg-input` | `#2C2C30` / dark gray | Input fields, text areas, search bars |

### Text Colors
| Token | Value (approx) | Usage |
|-------|----------------|-------|
| `text-primary` | `#FFFFFF` / pure white | Headings, account names, primary data, active nav items |
| `text-secondary` | `#A0A0A8` / medium gray | Column headers, labels, timestamps ("2 hrs ago"), metadata |
| `text-tertiary` | `#6B6B73` / dim gray | Placeholder text ("Ask follow-up"), disabled text, "Updating..." loading state |
| `text-muted` | `#555560` / very dim | Subtle labels, de-emphasized content |
| `text-link` | `#FFFFFF` / white | Links appear as white, not blue (unconventional) |

### Accent / Brand Colors
| Token | Value (approx) | Usage |
|-------|----------------|-------|
| `accent-green` | `#22C55E` / bright green | "Yes" signal badges, positive indicators, "Common Investor? Yes", "Sales-led growth? Yes" |
| `accent-green-dark` | `#166534` / dark green bg | Background fill behind green "Yes" badges |
| `accent-red` | `#EF4444` / bright red | "No" badges (sometimes), recording indicator dot, negative signals |
| `accent-red-dark` | `#7F1D1D` / dark red bg | Background behind red "No" badges |
| `accent-orange` | `#F97316` / vivid orange | Fire emoji for "Burning" score, warm signal indicators |
| `accent-pink` | `#EC4899` / hot pink | Industry badge variant ("Software dev..."), some contact avatar rings |
| `accent-purple` | `#A855F7` / purple | Industry badge variant, avatar ring colors for some contacts |
| `accent-yellow` | `#EAB308` / gold-yellow | Industry badge variant, some scoring elements |
| `accent-cyan` | `#06B6D4` / cyan-teal | Selected/highlighted meeting card (blue-teal glow), active states |
| `accent-blue` | `#3B82F6` / blue | "Respond from Inbox" button on dashboard, some action buttons |
| `accent-white` | `#FFFFFF` / white | Primary CTA button fill ("Start" button, "Send" button) |

### Status / Score Colors
| Token | Value (approx) | Usage |
|-------|----------------|-------|
| `status-prospecting` | `#A855F7` / purple | "Prospecting" status badge text on purple/dark background |
| `status-new` | `#A0A0A8` / gray | "New" status badge (plain gray text, minimal styling) |
| `status-suggested` | `#22C55E` / green | "Suggested" contact label |
| `score-burning` | `#F97316` + fire emoji | Score "A" + fire icon + "Burning" text |
| `score-a` | `#FFFFFF` / white letter | Letter grade "A" displayed white |
| `score-b` | `#FFFFFF` / white letter | Letter grade "B" displayed white (same treatment) |

### Signal Badge Colors (Yes/No System)
- **Yes**: Bright green text (`#22C55E`) on dark green background (`#166534` approx)
- **No**: Dim/muted appearance, sometimes red text on dark red background
- These are binary badges, not gradients

## Typography

### Font Family
- **Primary**: Inter or a very similar geometric sans-serif (clean, modern, high legibility at small sizes)
- **Marketing site heading**: Appears to use a serif or transitional serif for the "MONACO" wordmark in the hero/logo area — possibly a custom logotype
- **Monospace**: Not visibly used in the product UI

### Font Sizes (relative scale)
| Level | Approx Size | Weight | Usage |
|-------|-------------|--------|-------|
| Display | 36-48px | Light (300) | Marketing hero text ("Monaco customers grow revenue faster"), "How could I have" text animation |
| H1 | 24-28px | Semibold (600) | Page titles, "Judgment Labs" in account detail card |
| H2 | 18-20px | Semibold (600) | Section headers ("Overview", "Key Points", "Virtual Meeting with Alex Shan") |
| H3 | 14-16px | Medium (500) | Column headers in tables ("Account", "Status", "Score"), card titles |
| Body | 13-14px | Regular (400) | Table cell text, meeting notes, email body text, chat messages |
| Caption | 11-12px | Regular (400) | Timestamps ("2 hrs ago", "1 minute ago"), metadata labels ("Recipient:", "Subject:"), "Sent from sam@monaco.com" |
| Micro | 10px | Medium (500) | Badge text ("Yes", "No"), industry tags, small labels |

### Font Weight Distribution
- **Light/Thin (300)**: Marketing display text only
- **Regular (400)**: Most body text, descriptions, message content
- **Medium (500)**: Column headers, badge labels, some navigation
- **Semibold (600)**: Account names, section headers, CTA text
- **Bold (700)**: Rarely used; emphasis within body text (email bold formatting B/I toolbar)

### Text Formatting
- **Bullet points** in AI-generated content use standard disc bullets
- **Bold text** available in email composer (B button in toolbar)
- **Italic** available in email composer (I button in toolbar)
- **Ordered/unordered lists** available in email composer (list icons in toolbar)

## Spacing & Density

### Information Density
Monaco's UI is **HIGH DENSITY** compared to typical CRMs. Key observations:
- Table rows are tightly packed: approximately 36-40px row height
- Minimal vertical padding between elements
- Multiple columns visible simultaneously (Account, Status, Score, Industries, Connected to, Common Investor?, Sales-led growth?, YC Company?)
- No wasted whitespace in the data table view
- Meeting notes appear alongside the video, not in a separate view

### Spacing Scale
| Token | Value (approx) | Usage |
|-------|----------------|-------|
| `space-xs` | 4px | Inline spacing between badges, icon-to-text gap |
| `space-sm` | 8px | Padding inside badges, gap between column header icon and text |
| `space-md` | 12-16px | Table cell padding (horizontal), card internal padding |
| `space-lg` | 20-24px | Section separation, padding between major UI areas |
| `space-xl` | 32-40px | Major section gaps, sidebar width padding |
| `space-2xl` | 48-64px | Page-level margins, hero section spacing |

### Table-Specific Spacing
- Column header height: ~36px
- Row height: ~36-40px (very dense)
- Column widths vary: Account (~140px), Status (~80px), Score (~100px), Industries (~120px), Connected to (~160px), signals (~120px each)
- Horizontal cell padding: ~12px
- Checkbox column: ~32px wide

## Border Radius

### Radius Scale
| Token | Value (approx) | Usage |
|-------|----------------|-------|
| `radius-none` | 0px | Table rows, some structural elements |
| `radius-sm` | 4px | Small badges ("Yes"/"No"), industry tags, status badges |
| `radius-md` | 8px | Cards (pipeline deal cards, account detail card), input fields |
| `radius-lg` | 12px | Modal/popover containers, "Ask AI" panel, email composer, meeting recorder panel |
| `radius-xl` | 16px | Larger panels, the sequence builder container |
| `radius-full` | 50% / 9999px | Avatar circles, the "Start" CTA button (pill shape), circular icons |

### Key Observations
- Monaco uses **rounded corners** throughout but NOT excessively rounded
- The "Start" button is fully pill-shaped (large radius)
- Cards have moderate rounding (~8-12px)
- Industry/signal badges have subtle rounding (~4px)
- Avatar images are always circular
- The overall aesthetic is "softly rounded" — never sharp, never bubbly

## Shadows & Elevation

### Shadow System
| Level | Description | Usage |
|-------|-------------|-------|
| `shadow-none` | No shadow | Most elements (dark theme = no visible shadows on dark bg) |
| `shadow-subtle` | Very faint dark glow | Card boundaries, often replaced by border |
| `shadow-modal` | Moderate drop shadow | "Ask AI" floating panel, popover tooltips |
| `shadow-elevated` | Stronger shadow | Modals, email composer overlay |

### Border System (more important than shadows in dark theme)
| Token | Value (approx) | Usage |
|-------|----------------|-------|
| `border-subtle` | 1px solid `#2A2A2E` | Table column separators, card boundaries |
| `border-input` | 1px solid `#3A3A40` | Input field borders, "Ask follow-up" input |
| `border-focus` | 1px solid `#FFFFFF` or accent | Active input states |
| `border-divider` | 1px solid `#222228` | Horizontal rules, section separators |

## Iconography

### Icon Style
- **Line icons** (outlined, not filled) for most UI: clock icon for "Wait 3 business days", checkbox icon for status
- **Emoji** for scoring: fire emoji next to "Burning" score (not a custom icon)
- **Company logos** displayed as small square thumbnails with rounded corners (~8px radius)
- **Avatar photos** always circular, with optional colored ring borders (pink, purple, green variants)
- **Signal column icons**: checkmark-circle type icons in column headers
- **Monaco logo**: A stylized crosshatch/grid pattern icon (4 squares arranged like a window pane), white on dark

### Icon Sizes
| Size | Usage |
|------|-------|
| 16px | Inline icons in table headers, badges |
| 20px | Sidebar navigation icons, action icons |
| 24px | Primary action icons, "Ask AI" header icon |
| 32px | Company logos in the TAM table |
| 40-48px | Company logos in pipeline cards |

## Animation & Interaction Patterns

### Observed Animations (from hero video frames)
- **Typing animation**: "How could I have" text types out character by character (like a typewriter effect) for the AI query demo
- **Loading state**: "Updating..." text appears with a subtle fade/pulse when auto-populating account fields
- **Card selection**: Meeting cards have a highlighted blue-teal glow when selected
- **Green toast**: "New opportunity created" toast notification appears at bottom-center with green accent
- **Smooth transitions**: UI panels slide/fade into view during the product demo
- **Cursor animation**: Animated cursor moves to demonstrate clicking, resembling a product tour

## Grid & Layout System

### Website
- Marketing pages use a centered layout, approximately 1200px max-width
- Dotted background grid pattern on hero section (subtle, decorative)
- Content cards in 2x3 or 3x2 grid for testimonials

### Product App
- Left sidebar + main content area (classic SaaS layout)
- Dashboard: two-column layout (priorities left, meetings/email right)
- Table views: full-width, edge-to-edge data tables
- Detail views: split panel (video left, notes right) or (pipeline left, overview right)
- Bottom toolbar on dashboard: icon row for navigation/actions

## Dark Theme Notes

Monaco is exclusively dark-themed based on all screenshots. There are NO light mode screenshots visible. The entire product and marketing site are dark:
- Website: pure black background
- Product: near-black with subtle gray elevation layers
- All text is light-on-dark
- Accents pop dramatically against the dark background (especially green badges, orange fire emoji)
- The dark theme gives a premium, "ops center" feeling — deliberate positioning as a serious revenue tool, not a friendly CRM

## Logo & Brand

### Monaco Logo
- Icon: A 2x2 grid of rounded squares (like a window or QR-code fragment), white
- Text: "MONACO" in all caps, appears to use a serif or sans-serif depending on context
- On website: logo + text in the top navigation bar
- On Ashby jobs page: larger centered logo treatment

### Color Usage Summary
Monaco's color palette is intentionally restrained:
- 90% of the interface is black/dark gray/white (neutral)
- Green and red are used ONLY for binary signal indicators (Yes/No)
- Orange appears ONLY for the "Burning" score fire emoji
- Purple appears for "Prospecting" status and some industry badges
- Pink/magenta appears for industry badge variants
- Blue/cyan appears sparingly for selection states and action buttons
- This creates a "data cockpit" aesthetic where the few colored elements demand attention
