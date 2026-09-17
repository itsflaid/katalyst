---
name: Executive Precision
colors:
  surface: '#fdf9f0'
  surface-dim: '#dddad1'
  surface-bright: '#fdf9f0'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f7f3ea'
  surface-container: '#f1eee5'
  surface-container-high: '#ece8df'
  surface-container-highest: '#e6e2d9'
  on-surface: '#1c1c16'
  on-surface-variant: '#45464f'
  inverse-surface: '#31302b'
  inverse-on-surface: '#f4f0e7'
  outline: '#767680'
  outline-variant: '#c6c5d0'
  surface-tint: '#4f5c8e'
  primary: '#000f3f'
  on-primary: '#ffffff'
  primary-container: '#172554'
  on-primary-container: '#808dc2'
  inverse-primary: '#b7c4fd'
  secondary: '#565e74'
  on-secondary: '#ffffff'
  secondary-container: '#dae2fd'
  on-secondary-container: '#5c647a'
  tertiary: '#001905'
  on-tertiary: '#ffffff'
  tertiary-container: '#003010'
  on-tertiary-container: '#1aa54c'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#dce1ff'
  primary-fixed-dim: '#b7c4fd'
  on-primary-fixed: '#071747'
  on-primary-fixed-variant: '#374475'
  secondary-fixed: '#dae2fd'
  secondary-fixed-dim: '#bec6e0'
  on-secondary-fixed: '#131b2e'
  on-secondary-fixed-variant: '#3f465c'
  tertiary-fixed: '#7ffc97'
  tertiary-fixed-dim: '#62df7d'
  on-tertiary-fixed: '#002109'
  on-tertiary-fixed-variant: '#005320'
  background: '#fdf9f0'
  on-background: '#1c1c16'
  surface-variant: '#e6e2d9'
typography:
  headline-xl:
    fontFamily: Plus Jakarta Sans
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-xl-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 26px
    fontWeight: '700'
    lineHeight: 34px
    letterSpacing: -0.01em
  headline-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 32px
    letterSpacing: -0.015em
  headline-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 16px
    fontWeight: '600'
    lineHeight: 24px
  body-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  body-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
  label-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
    letterSpacing: 0.01em
  label-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.02em
  label-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 11px
    fontWeight: '600'
    lineHeight: 14px
    letterSpacing: 0.04em
  num-display:
    fontFamily: Plus Jakarta Sans
    fontSize: 28px
    fontWeight: '700'
    lineHeight: 32px
    letterSpacing: -0.02em
  num-cell:
    fontFamily: Plus Jakarta Sans
    fontSize: 13px
    fontWeight: '600'
    lineHeight: 18px
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  gutter: 1rem
  gutter-desktop: 1.5rem
  margin: 1rem
  margin-tablet: 1.5rem
  margin-desktop: 2rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2rem
---

## Brand & Style

This design system delivers a reliable, high-clarity business intelligence and decision-support environment tailored specifically for micro, small, and medium enterprise (UMKM) operators. The target audience requires actionable clarity over complex data abstractions. The visual style conveys institutional stability, fiscal prudence, and operational velocity.

The aesthetic fuses modern corporate clarity with disciplined utility:
- **Style Archetype:** Modern Corporate & Functional Minimalist.
- **Structural Integrity:** Crisp rectangular surfaces, controlled visual boundaries, structured dense tables, and deliberate spacing.
- **Atmosphere:** Rational, trustworthy, authoritative, and direct. The interface strips away non-functional decorative motifs, artificial gradients, saturated ambient blurs, and whimsical illustrations in favor of tabular readability, high data contrast, and unmistakable status signifiers.

## Colors

The palette establishes an authoritative financial visual hierarchy, grounding operational metrics with unambiguous semantic markers:

- **Primary Canvas & Surfaces:** The foundation is canvas `#F7F3EA` (Warm Cream), providing a warmer, lower-strain alternative to harsh white for extended data review. Surface containers and cards use pure `#FFFFFF` to float clearly off the canvas.
- **Structural Tones:** Primary ink and key actions operate through `#172554` (Deep Blue Navy), accompanied by `#0F172A` (Slate Dark Navy) for headings and high-density labels.
- **Supporting Neutral Text:** Secondary descriptions, table header labels, and metadata use `#64748B` (Muted Slate).
- **Structural Dividers:** Subtle perimeter borders utilize `#E6E0D4` against the warm canvas and `#E2E8F0` inside internal card compartments.
- **Semantic Performance Spectrum:**
  - *Growth / Liquidity (Positive):* `#16A34A` foreground with `#DCFCE7` soft surface background for positive trends, margins, and healthy revenue indicators.
  - *Operational Risk / Review (Warning):* `#F59E0B` (Amber) for pending settlements, stock thresholds, or delayed payables.
  - *Critical Deficit / Loss (Negative):* `#DC2626` (Red) for immediate cash-flow deficits, losses, and failed synchronizations.

## Typography

Typography prioritizes tabular legibility, rapid scannability, and hierarchical weight over decorative expression.

- **Typeface Selection:** Plus Jakarta Sans is deployed across headlines, body copy, and UI metadata. Its geometric structure and balanced open counters maintain clarity at dense data scales (11px–13px) while presenting stable headings.
- **Numeric Discipline:** Numbers in financial reports, ledger rows, and KPI cards must use tabular/monospaced numeric settings (`font-variant-numeric: tabular-nums`) to preserve column alignment and rapid vertical comparisons.
- **Hierarchy & Case:** Section labels, table headers, and metric categories use small uppercase or high-weight medium labels (`label-sm`, `label-md`) with subtle positive tracking to distinguish administrative structure from transactional values.

## Layout & Spacing

The interface employs a disciplined, content-dense fluid grid designed for analytical review and rapid operational tasks:

- **Grid Structure:**
  - **Desktop (>= 1280px):** 12-column grid with `1.5rem` gutters and a maximum content constrain of `1440px` centered within a `2rem` outer margin.
  - **Tablet (768px - 1279px):** 8-column layout with `1rem` gutters and `1.5rem` side margins.
  - **Mobile (< 768px):** 4-column flow with `1rem` margins and `0.75rem` internal module gaps.
- **Rhythm & Stacking:** Micro-spacing scales along an explicit 4px baseline (`0.25rem`). Data dense layouts rely on compact vertical spacing (`space-sm` for table rows, `space-md` for interior card padding) to maximize vertical information density per screen without creating visual tension.

## Elevation & Depth

Visual depth is achieved through crisp, physical layering rather than diffuse blur or heavy dropshadows:

- **Base Canvas:** The foundational canvas color `#F7F3EA` serves as Level 0.
- **Surface Containment:** Cards, data panels, and toolbars are assigned Level 1 using `#FFFFFF` with a 1px uniform perimeter border of `#E6E0D4` or `#E2E8F0`. Shadows are minimal and controlled: `0 1px 2px 0 rgba(15, 23, 42, 0.05)`.
- **Floating Overlays & Menus:** Dropdown selectors, filters, date pickers, and tooltips represent Level 2: background `#FFFFFF`, border `1px solid #CBD5E1`, and a crisp elevation offset: `0 4px 6px -1px rgba(15, 23, 42, 0.08), 0 2px 4px -2px rgba(15, 23, 42, 0.04)`.
- **Modals & Dialogs:** Critical intervention windows utilize Level 3: `0 10px 15px -3px rgba(15, 23, 42, 0.12)`, anchored by a semi-opaque neutral backdrop tint (`#0F172A` at 40% opacity).
- **Prohibitions:** Diffuse ambient glows, blurred glass backdrops, colored drop shadows, and neomorphic extrusions are strictly excluded to preserve data clarity.

## Shapes

The geometric architecture is rational, compact, and structured:

- **Radius Token Application:**
  - Standard base radius (`0.25rem` / `4px`) is utilized for inputs, table cells, metric badges, and interactive buttons.
  - Medium radius (`0.375rem` - `0.5rem` / `6px` - `8px`) is the absolute maximum, reserved exclusively for primary panel containers, analytical cards, and dialog frames.
- **Border Treatment:** All interactive panels and containers maintain an unbroken 1px solid rule (`#E2E8F0` or `#E6E0D4`). No rounded pill buttons (`rounded-full`) are permitted; controls must preserve solid structural corners to maintain an institutional aesthetic.

## Components

### Buttons
- **Primary Action:** Solid background `#172554`, label text `#FFFFFF`, 1px border `#172554`. Corner radius `4px`. Hover state shifts to `#0F172A`. Active state scales down opacity to 90%.
- **Secondary / Outline:** Background `#FFFFFF`, text `#0F172A`, 1px solid border `#CBD5E1`. Hover shifts background to `#F8FAFC`.
- **Destructive:** Solid background `#DC2626`, text `#FFFFFF`, border `#DC2626`. Hover state shifts to `#B91C1C`.
- **Sizing:** Standard input height 36px (`padding: 0.5rem 1rem`), compact 30px (`padding: 0.25rem 0.75rem`).

### Form Inputs & Selectors
- **Text Inputs:** Solid `#FFFFFF` fill, 1px border `#CBD5E1`, corner radius `4px`, text `#0F172A`. Placeholder in `#94A3B8`.
- **Focus State:** 1px border `#172554` with a crisp outer ring `0 0 0 2px rgba(23, 37, 84, 0.15)`. No ambient glow.
- **Table Filters & Dropdowns:** Flat white background, compact 32px height, sharp Chevron-down indicator `#64748B`.

### Data Cards & KPI Panels
- **Structure:** Background `#FFFFFF`, border `1px solid #E6E0D4`, corner radius `6px`, padding `1.25rem`.
- **Header:** Secondary label in uppercase (`11px`, `#64748B`), paired with contextual timeframe text.
- **Data Value:** Primary metric set in `num-display` (`#0F172A`), directly aligned with a delta badge.

### Status Badges & Chips
- **Positive Health:** Background `#DCFCE7`, text `#16A34A`, border `1px solid #86EFAC`. Radius `4px`.
- **Attention / Due:** Background `#FEF3C7`, text `#B45309`, border `1px solid #FCD34D`.
- **Negative / Critical:** Background `#FEE2E2`, text `#DC2626`, border `1px solid #FCA5A5`.
- **Neutral / Informational:** Background `#F1F5F9`, text `#475569`, border `1px solid #E2E8F0`.

### Data Tables
- **Header Row:** Background `#F8FAFC`, border-bottom `1px solid #CBD5E1`. Text `#475569`, font weight `600`, size `12px`, letter spacing `0.02em`.
- **Body Rows:** Background `#FFFFFF`, border-bottom `1px solid #F1F5F9`. Alternating row zebra fill is disabled in favor of clean 1px division rules. Row hover state: `#F8FAFC`.
- **Numeric Cells:** Monospaced tabular alignment, right-aligned with standard padding `0.5rem 0.75rem`.

### Selection Controls (Checkboxes & Radios)
- **Checkboxes:** 16px square, radius `3px`, 1px border `#94A3B8`. Checked state: background `#172554`, check mark `#FFFFFF`.
- **Radio Buttons:** 16px circle, 1px border `#94A3B8`. Selected state: `#172554` border with inner solid circular dot.