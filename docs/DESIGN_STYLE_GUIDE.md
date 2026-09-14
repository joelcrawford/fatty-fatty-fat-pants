# Design Style Guide
## Katarina's Nutrition Tracker

This guide defines the visual language of the application — colours, typography, spacing, component patterns, and interaction design. It exists so that any developer or designer extending the app produces output that is visually consistent with what has already been built.

---

## Design Philosophy

The app should feel like a **personal wellness tool**, not a clinical database. The aesthetic is warm, editorial, and calm — closer to a well-designed journal than a productivity app. It is built for a woman in her 50s who is doing something considered and health-positive, so the visual language should reflect that care.

**Core principles:**
- Warmth over sterility
- Clarity over density
- Calm over urgency (except when genuinely over target)
- Feminine but not decorative

---

## Colour Palette

### Primary Colours

| Token | Hex | Usage |
|---|---|---|
| `primary` | `#3D5A4C` | Header background, primary buttons, calorie ring, active tabs |
| `accent` | `#C4714A` | Exercise calories, Log Exercise button, protein macro bar |
| `gold` | `#C9963A` | Net carbs macro bar |
| `fat` | `#5E9478` | Fat macro bar, secondary green |
| `fiber` | `#7B6BB0` | Fibre macro bar |

### Neutral Colours

| Token | Hex | Usage |
|---|---|---|
| `bg` | `#F8F5F0` | App background — warm off-white, never pure white |
| `card` | `#FFFFFF` | Card backgrounds |
| `text` | `#2C2C2C` | Primary text — dark charcoal, not pure black |
| `muted` | `#8A8A8A` | Secondary text, labels, meta information |
| `border` | `#E8E4DC` | Card borders, dividers, progress bar backgrounds |

### Semantic Colours

| State | Hex | Usage |
|---|---|---|
| Error / Over target | `#D64545` | Over-budget calorie ring, exceeded macro bars |
| Error background | `#FF9B9B` | "Over" indicator in header summary |
| Success | `#A8FBCA` | "Remaining" calories indicator |
| Exercise tint | `#FBCFA8` | Exercise calories in header (warm peach) |

### CSS Custom Properties (recommended implementation)

```css
:root {
  --color-primary:    #3D5A4C;
  --color-accent:     #C4714A;
  --color-gold:       #C9963A;
  --color-fat:        #5E9478;
  --color-fiber:      #7B6BB0;
  --color-bg:         #F8F5F0;
  --color-card:       #FFFFFF;
  --color-text:       #2C2C2C;
  --color-muted:      #8A8A8A;
  --color-border:     #E8E4DC;
  --color-error:      #D64545;
  --color-protein:    #C4714A;  /* Same as accent */
}
```

---

## Typography

### Typefaces

| Role | Family | Source |
|---|---|---|
| Display / Headings | DM Serif Display | Google Fonts |
| Body / UI | DM Sans | Google Fonts |

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600;9..40,700&display=swap" rel="stylesheet">
```

### Type Scale

| Role | Font | Size | Weight | Usage |
|---|---|---|---|---|
| App name | DM Serif Display | 21px | 400 | Header "Katarina's Nutrition" |
| Section heading | DM Serif Display | 17–18px | 400 | Card titles e.g. "Macronutrients" |
| Item name | DM Sans | 13.5–14px | 500 | Food names, exercise names |
| Calorie ring number | DM Serif Display | 34px | 700 | Large remaining number |
| Summary header stat | DM Sans | 19px | 700 | Goal / Food / Exercise / Remaining |
| Macro bar label | DM Sans | 13px | 600 | "Protein", "Net Carbs" |
| Meta / secondary | DM Sans | 11–12px | 400 | Serving amount, macro detail |
| Badge / label | DM Sans | 9.5–11px | 700 | Category badges, status labels |
| Footer note | DM Sans | 11px | 400 | Target reminder line |

### Typography Rules
- Never use more than two font families
- DM Serif Display is for warmth and structure — headings and large numbers only
- All UI controls (buttons, inputs, selects) use DM Sans
- Don't use bold in DM Serif Display — its regular weight already reads as authoritative

---

## Spacing

The app uses a base unit of 4px. All padding and margin values are multiples of 4.

| Scale | Value | Common usage |
|---|---|---|
| xs | 4px | Inline gaps |
| sm | 8px | Chip padding, tight gaps |
| md | 12–14px | Input padding, button padding |
| lg | 16–18px | Card padding, section gaps |
| xl | 20–24px | Header padding, large card padding |

---

## Border Radius

| Element | Radius | Notes |
|---|---|---|
| Cards | 18px | All white content cards |
| Library items | 14px | Slightly smaller than main cards |
| Buttons (primary) | 10px | |
| Meal filters | 20px | Pill shape |
| Macro bars | 5–7px | Shorter radius for progress bars |
| Badge chips | 8–10px | |
| Date chips (history) | 12px | |

---

## Shadows

One consistent shadow class throughout:

```css
box-shadow: 0 1px 10px rgba(0, 0, 0, 0.06);
```

Applied to all white content cards. Do not use multiple shadow depths — the single level creates sufficient elevation against the warm background.

---

## Layout

### Container
- Max width: 480px
- Centred horizontally
- Full viewport height (`100vh`)
- Flex column layout: header → tabs → scrollable content

### Header
- Background: `primary` (#3D5A4C)
- Fixed height with consistent padding: 22px top, 20px sides
- White text throughout
- Summary row uses a dark translucent background (`rgba(0,0,0,0.15)`)

### Tab Bar
- Background: white
- Sticky (does not scroll with content)
- 6 tabs: Today / Food / Exercise / Meals / History / Library
- Active tab: `primary` colour + 2.5px bottom border
- Inactive tab: `muted` colour + transparent border

### Content Area
- Flex-grow, `overflow-y: auto`
- Padding: 18px top/sides, 200px bottom (prevents content hiding under iOS keyboard or chat overlay)
- `-webkit-overflow-scrolling: touch` for iOS momentum scrolling

---

## Components

### Card
White rounded rectangle with shadow. The base container for all content sections.

```
background: #FFFFFF
border-radius: 18px
padding: 16–20px
box-shadow: 0 1px 10px rgba(0,0,0,0.06)
margin-bottom: 12–14px
```

### MacroBar (Today tab)
Thin progress bar showing current vs. target.

```
Label (left, 600 weight)          Value (right, muted or red if over)
[████████████░░░░░░░░░░░]
height: 9px | border-radius: 5px | transition: width 0.4s ease
Fill colour: per-macro colour token
Over-target fill: #D64545
```

### BarAnalysis (History tab)
Taller analysis bar with text inside.

```
Label (left)                       Percentage · Status (right, 10px uppercase)
[███ 62g ████████████ / 80g ░░░]
height: 26px | border-radius: 7px
Text: white when bar is >40% filled, text-colour otherwise
Status colours: green (on target) | gold (under) | red (over)
```

### Calorie Ring
SVG circle progress indicator. Centre of the Today dashboard.

```
Outer ring: border colour (#E8E4DC), strokeWidth 13
Inner ring: primary colour (or red if over), strokeWidth 13
Transform: rotate(-90deg) so progress starts at top
Transition: stroke-dashoffset 0.5s ease
Size: 176×176px, radius 68
Centre: large number (DM Serif Display, 34px) + small label below
```

### Summary Header Row
Four columns inside a dark translucent pill in the header.

```
Goal | Food | Exercise | Remaining
19px bold white | 19px bold white | 19px bold #FBCFA8 | 19px bold #A8FBCA (or red)
10.5px label below each, 0.7 opacity
Dividers: 1px rgba(255,255,255,0.15) between columns
```

### Macro Chip (Meals tab / Library tab)
Small coloured pill showing a single macro value.

```
Padding: 4px 9px | border-radius: 8px
Background: tinted version of macro colour
Font: 11px bold, macro colour
Format: "80g P" — value then label, label in lighter weight
```

### Primary Button
```
background: primary (#3D5A4C)
color: white
border: none
border-radius: 10px
padding: 13–14px
font: DM Sans, 14–15px, 700
width: 100% (full width within card)
cursor: pointer
```

### Secondary Button (Cancel)
```
background: white
color: muted (#8A8A8A)
border: 1.5px solid border-colour (#E8E4DC)
border-radius: 10px
padding: 13px
font: DM Sans, 14px, 600
```

### Filter Pills (Meals tab / History tab)
```
border-radius: 20px (pill)
padding: 7px 14px
font: 12px, 600
Active: background primary, white text, primary border
Inactive: white background, text colour, border-colour border
```

### Food Row (Today tab log)
```
display: flex, justify-content: space-between
padding: 8px 6px
border-bottom: 1px solid border-colour
Food name: 13.5px, 500 weight
Meta: 11.5px muted — amount · P:Xg · NC:Xg · F:Xg
Right: calorie number (14px, 700) + × delete button
```

### Toast Notification
```
Fixed, top centre of screen
background: primary
color: white
padding: 10px 20px | border-radius: 20px
font: 13px, 600
animation: slideIn (0.2s ease from translateY(8px))
Auto-dismisses after 2.2 seconds
Format: "✓ [message]"
```

### Error Banner
```
Fixed top, full width
background: #D64545
color: white
padding: 10px 16px
font: 12px, centred
Text: "⚠ Cannot reach API — check your connection or server status"
```

---

## Interaction Patterns

### Loading State
Simple text: "Loading..." centred in the content area, `muted` colour, 14px. No spinner. The app's data loads fast enough that an elaborate loading state is unnecessary.

### Delete Confirmation
No confirmation modal — food and exercise entries are deleted immediately on × tap. This is an intentional choice for speed. If misuse becomes an issue, an undo toast can be added.

### Tab Navigation
No animation between tabs. Instant content swap. The tab bar provides enough orientation that transitions add no value and could feel sluggish on mobile.

### Macro Bar Transitions
All macro bars animate width change with `transition: width 0.4s ease`. This gives a satisfying update when food is logged without being distracting.

---

## Mobile Considerations

- Minimum tap target: 44×44px (Apple HIG standard) — all buttons and tab items meet this
- Input fields: `font-size: 14px` minimum to prevent iOS auto-zoom on focus
- No `user-scalable=no` in viewport — respect user zoom preferences
- Bottom content padding (200px) prevents last items from hiding under the virtual keyboard or browser chrome
- The app is designed portrait-only; landscape is not a priority use case

---

## Do Not

- Do not use pure black (`#000000`) anywhere — use `#2C2C2C` for text
- Do not use pure white backgrounds for the app shell — only cards are white; the shell is `#F8F5F0`
- Do not add more font families
- Do not use more than one shadow depth
- Do not use gradients — the design is flat with single-colour fills only
- Do not use animations beyond the macro bar width transition and the toast slide-in
- Do not use red for anything other than over-target states — red carries strong negative meaning in this context
