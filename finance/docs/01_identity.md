# Finance OS - Product Identity & Design Tokens

## 1. Product Overview & Core Mission

Finance OS serves as the personal budgeting, cash flow forecasting, and multi-account projection engine for the TechTrekGT ecosystem. Deployed as a dedicated Cloudflare Worker mounted at techtrekgt.com/finance/*, the application bridges daily transaction tracking with multi-year financial projections.

The mission of Finance OS is to eliminate floating-point inaccuracies and financial uncertainty by providing exact-penny balance calculations, automated paycheck allocations, split-earner distributions, and an offline-first architecture backed by optimistic Cloudflare D1 database synchronization.

## 2. Target Persona & User Archetype

The primary user persona for Finance OS is the detail-oriented household financial manager operating in a multi-earner environment:

- Cash Flow Planner: Manages multi-account liquidity across 365-day projection horizons, preventing overdrafts through advance bill scheduling and running balance matrix analysis.
- Split-Earner Manager: Balances joint and individual expenses, allocating fixed and variable paychecks with cent-exact earner credits and extra savings distributions.
- Debt & Amortization Strategist: Tracks amortized loan balances, funding goals, and interest calculations with transparent amortization schedules.
- Sovereign Data Owner: Demands local-first responsiveness with zero data lock-in, leveraging client-side IndexedDB caching alongside authenticated cloud backup snapshots.

## 3. Visual Aesthetics & Design Philosophy

Finance OS employs a professional, data-dense interface designed for clarity and rapid visual parsing:

- Dark-Mode Canvas: Deep slate and navy surface foundations reduce eye strain during extended financial planning sessions.
- Clear Status Semantics: Standardized functional colors communicate financial health instantaneously (emerald green for positive balances and inflows, crimson red for debits and overdraft risks, amber for pending allocations).
- Data Density & Legibility: Clean tabular grid layouts featuring Google Fonts Inter for UI labels and monospace numerical figures to maintain strict column alignment across currency tables.
- Distinguishable Brand Anchor: Anchored by a calm, authoritative blue color palette (--brand-500 through --brand-900), visually distinguishing Finance OS from the amber-accented Outpost resale workspace.

## 4. Design Tokens & Styling Specification

All visual styles are derived from root CSS custom properties declared in the application styling system and mapped through Tailwind CSS.

### 4.1 Brand Palette (Blue Accent Series)

The primary brand palette provides harmonious blue tones across controls, interactive elements, and focused states:

- --brand-50: #f0f7ff (Subtle blue tint)
- --brand-100: #e0effe (Light blue highlight)
- --brand-500: #3b82f6 (Primary interactive blue)
- --brand-600: #2563eb (Primary hover state)
- --brand-700: #1d4ed8 (Primary active state)
- --brand-900: #1e3a8a (Deep navy brand shadow)

### 4.2 Functional Theme Colors

Functional status tokens communicate state across the daily matrix, bills list, and account widgets:

- Primary:
  - Default: var(--color-primary, #3b82f6)
  - Hover: var(--color-primary-hover, #2563eb)
  - Active: var(--color-primary-active, #1d4ed8)
  - Foreground: var(--color-primary-foreground, #ffffff)

- Secondary:
  - Default: var(--color-secondary, #64748b)
  - Hover: var(--color-secondary-hover, #475569)
  - Foreground: var(--color-secondary-foreground, #f8fafc)

- Success (Positive cash flow, credits, verified states):
  - Default: var(--color-success, #10b981)
  - Hover: var(--color-success-hover, #059669)
  - Foreground: var(--color-success-foreground, #ffffff)

- Warning (Approaching thresholds, pending verification, alerts):
  - Default: var(--color-warning, #f59e0b)
  - Hover: var(--color-warning-hover, #d97706)
  - Foreground: var(--color-warning-foreground, #ffffff)

- Danger (Overdraft warnings, failed validations, destructive actions):
  - Default: var(--color-danger, #ef4444)
  - Hover: var(--color-danger-hover, #dc2626)
  - Foreground: var(--color-danger-foreground, #ffffff)

- Accent (Highlights and secondary focal points):
  - Default: var(--color-accent, #f59e0b)
  - Hover: var(--color-accent-hover, #d97706)
  - Foreground: var(--color-accent-foreground, #ffffff)

### 4.3 Surface & Background Hierarchy

A layered surface hierarchy provides visual depth across cards, modals, and tables:

- Base Canvas: var(--color-bg-base, #050811) - Deepest background layer
- Default Surface: var(--color-bg-surface, #0f172a) - Primary card and panel surface
- Subtle Surface: var(--color-bg-subtle, #1e293b) - Nested containers and table header rows
- Elevated Surface: var(--color-bg-elevated, #1e293b) - Dropdown menus and floating modals

### 4.4 Typography & Text Semantics

Hierarchical text contrast ensures legibility across dense numerical reports:

- Primary Text: var(--color-text-primary, #f8fafc) - Main headings, active values, and primary labels
- Secondary Text: var(--color-text-secondary, #94a3b8) - Supporting descriptions, metadata, and column titles
- Muted Text: var(--color-text-muted, #64748b) - Disabled inputs, timestamps, and placeholders
- Inverted Text: var(--color-text-inverted, #0f172a) - Text placed upon high-contrast light surfaces

### 4.5 Border & Focus Tokens

Border tokens define container separation without visual noise:

- Default Border: var(--color-border, #1e293b) - Standard component outlines
- Subtle Border: var(--color-border-subtle, rgba(255, 255, 255, 0.08)) - Table row dividers
- Focus Border: var(--color-border-focus, #3b82f6) - Active input focus rings

## 5. UI Components & Iconography Standards

- Iconography: Integrated with lucide-react (^0.469.0), utilizing consistent 16px and 20px glyphs for actions, navigation, and account types.
- Modals & Overlays: Backed by subtle backdrop blur with escape key dismissal and focus retention.
- Responsive Behavior: Adaptive sidebar navigation collapsing to mobile bottom sheets on narrow viewports while preserving data table scroll integrity.
