# Outpost Tracker - Product Identity & Auction Persona

## 1. Product Overview & Core Mission

Outpost Tracker (also known as Auction Operations Tracker) is the high-velocity resale management, procurement intake, and cross-channel sales reconciliation engine within the TechTrekGT platform. Mounted at techtrekgt.com/outpost/* (with legacy redirects from /auction/* and uppercase aliases), Outpost powers the commercial lifecycle of physical and digital goods from initial acquisition to final customer delivery and tax reporting.

The core mission of Outpost Tracker is to turn chaotic multi-channel resale into a structured, highly automated workflow. It provides real-time tracking of Cost of Goods Sold (COGS), multi-source invoice parsing, automated SKU assignment, live eBay Sell API integration, pricing comp analysis, and cent-exact net profit calculations.

## 2. Target Persona & Auction Workflow Archetype

Outpost Tracker is custom-tailored for the high-volume reseller, estate auction operator, and e-commerce inventory specialist:

- High-Volume Procurement Specialist: Ingests bulk inventory across vendor invoices, PDF manifests, and Amazon receipts, rapidly transforming line items into serialized internal inventory.
- Dynamic Pricing & Comps Analyst: Monitors real-time market value across eBay active listings, historical sales data, and platform fees to establish competitive pricing and protect profit margins.
- Channel Operations Manager: Manages active listings, item revisions, and stock counts across eBay and local channels, pushing SKU updates directly through authenticated seller APIs.
- Financial & Tax Reconciler: Reconciles gross marketplace payments against merchant fees, shipping labels, and acquisition costs, generating deterministic Schedule C tax reports and ROI analytics.

## 3. The End-to-End Auction Workflow Lifecycle

Outpost structures inventory operations across five synchronized operational phases:

1. Acquisition & Intake:
   - Ingests supplier invoices through PDF parsing (pdfjs-dist) or tabular spreadsheets (xlsx).
   - Generates deterministic, collision-free internal SKUs via automated numbering algorithms.
   - Attaches supplier details, order dates, and purchase costs to establish exact COGS baselines.

2. Cataloging & Asset Enrichment:
   - Assigns standardized categories, platform tags, and item condition classifications.
   - Enriches inventory records with external image previews, ASIN metadata, and eBay listing identifiers.
   - Links items to parent invoices to maintain chain-of-custody auditability.

3. Pricing & Market Intelligence:
   - Queries real-time market comps to evaluate competitive price distributions.
   - Employs dynamic price alert tracking to signal margin degradation or surging demand.
   - Provides spreadsheet-like inline table editing for rapid adjustments to list prices and reserves.

4. Multi-Channel Listing & eBay Synchronization:
   - Interfaces directly with eBay Sell APIs to monitor active listings and push title, price, or SKU updates.
   - Ingests seller traffic reports and view telemetry to measure listing conversion rates.
   - Detects external sales and matches sold items against internal inventory.

5. Sale Settlement & Tax Reporting:
   - Records sales proceeds, destination platform, buyer payments, and variable marketplace transaction fees.
   - Dynamically calculates net proceeds, dollar net profit, and blended Return on Investment (ROI).
   - Exports clean Schedule C tax log summaries, separating gross receipts, cost of goods, and deductible shipping expenses.

## 4. Visual Aesthetics & Design Philosophy

Outpost Tracker utilizes an industrial, high-contrast tactical aesthetic built for speed, visual clarity, and high data density:

- Amber Tactical Accent Palette: Grounded in a rich amber and gold spectrum (--color-brand-50 through --color-brand-900), visually distinguishing Outpost from the cool blue tone of Finance OS.
- Ambient Depth & Glows: Incorporates subtle ambient amber glows (.glow-amber, .glow-amber-sm), dark glassmorphic cards (.glass-card), and subtle background grid lines (.bg-grid-pattern).
- Developer-Tool Ergonomics: Features a keyboard-first global command palette (Ctrl+K / Cmd+K), modal-free inline table grid cell editing, and persistent status indicators.
- Numerical Precision: Tabular figures with suppressed browser number spinners prevent layout shifting and formatting collisions with currency and percentage symbols.

## 5. Design Tokens & Styling Specification

All styles derive from root CSS custom properties declared in [outpost/src/index.css](file:///e:/TechTrekGT/outpost/src/index.css) and consumed by [outpost/tailwind.config.js](file:///e:/TechTrekGT/outpost/tailwind.config.js).

### 5.1 Root Amber Brand Tokens

Brand colors are declared as space-separated RGB channel triplets to enable Tailwind CSS alpha-value modifier interpolation:

- --color-brand-50: 255 251 235 (Subtle amber highlight)
- --color-brand-100: 254 243 199 (Light amber accent)
- --color-brand-200: 253 230 138 (Soft amber border)
- --color-brand-300: 252 211 77 (Warm text accent)
- --color-brand-400: 251 191 36 (Vibrant amber badge)
- --color-brand-500: 245 158 11 (Primary brand amber anchor)
- --color-brand-600: 217 119 6 (Interactive hover amber)
- --color-brand-700: 180 83 9 (Interactive active amber)
- --color-brand-800: 146 64 14 (Deep amber container outline)
- --color-brand-900: 120 53 15 (Dark amber shadow layer)

### 5.2 Tailwind Utility Integration

The brand tokens are mapped in tailwind.config.js using standard CSS custom property function notation: rgb(var(--color-brand-<shade>) / <alpha-value>). This permits flexible opacity classes across the interface:

- bg-brand-500/10: Light translucent card background
- border-brand-500/20: Subtle glass card outline
- text-brand-400: High-contrast amber typography
- hover:bg-brand-500/20: Interactive row hover feedback

### 5.3 Custom Utility Classes

- .glow-amber: Deep box shadow combining 20px and 60px amber glow layers for focal cards and active badges.
- .glow-amber-sm: Subtle 12px amber shadow for interactive inputs and highlighted table cells.
- .text-gradient-amber: 135-degree linear gradient transitioning from brand-300 through brand-600 with webkit-clipped text fills.
- .bg-grid-pattern: 40px by 40px grid matrix applied to the canvas background for structural depth.
- .glass-card: Frosted backdrop blur (16px) over rgba(15, 23, 42, 0.7) dark slate with subtle amber border.
- .glass-card-light: Lightweight 8px backdrop blur over rgba(30, 41, 59, 0.5) with slate borders.

## 6. UI Components & Interaction Standards

- Global Command Palette: Instant keyboard-driven navigation (Cmd+K / Ctrl+K), fuzzy search, and SKU lookup via AbortController-managed API queries.
- Inline Grid Editing: Double-click or Enter to edit table cells in place, with Tab advancement, Escape cancelation, and optimistic state recalculation.
- Custom Scrollbars: Dark-themed slate track with translucent amber thumb accents.
- Responsive Behavior: Collapses multi-column tables to responsive cards on mobile viewports (< 640px) while maintaining full data mutation capabilities.
