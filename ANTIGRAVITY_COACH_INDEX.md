# TechTrekGT - Workspace Index & Coach Map

> **Mandatory Disclaimer:** The broad details in this document are for general context only. The `ARCHITECTURE.md` located within each specific project directory is the absolute source of truth and must always be read before writing or modifying code.

---

## Global Architectural Pillars

All sub-applications within the TechTrekGT workspace adhere to the following shared foundation:

- **Language & Runtime:** Pure JavaScript (ESM) across all apps. No TypeScript or external compiler steps.
- **Frontend Architecture:** React with Vite build tooling (landing hub uses lightweight static HTML/CSS/JS).
- **Styling:** Tailwind CSS utility styling with dark-mode first palettes.
- **Client Routing:** Hand-rolled custom SPA routing using `window.history.pushState` and `popstate` listeners. No `react-router-dom`.
- **Backend Services:** Cloudflare Workers (ESM format) and functions API routing deployed independently per project.
- **Database Layer:** Shared Cloudflare D1 SQLite database (`personal-budget-db`).
- **Authentication & Security:** Shared Single Sign-On (SSO) JWT authentication using HttpOnly cookies with WebCrypto PBKDF2 password hashing.

---

## Sub-Application Index

### 1. Landing Hub (`landing`)
- **Directory Path:** [`e:/TechTrekGT/landing`](file:///e:/TechTrekGT/landing)
- **Core Purpose:** The primary domain root and central marketing portal for `techtrekgt.com`, serving as the navigational launchpad across all platform sub-services.
- **Architecture Reference:** [Workspace ARCHITECTURE.md](file:///e:/TechTrekGT/ARCHITECTURE.md)

### 2. Finance OS (`finance`)
- **Directory Path:** [`e:/TechTrekGT/finance`](file:///e:/TechTrekGT/finance)
- **Core Purpose:** A multi-user personal finance platform featuring daily income matrices, bill schedules, account ledgers, and amortization calculators.
- **Architecture Reference:** [finance/ARCHITECTURE.md](file:///e:/TechTrekGT/finance/ARCHITECTURE.md) (and [Workspace ARCHITECTURE.md](file:///e:/TechTrekGT/ARCHITECTURE.md))

### 3. Outpost Tracker (`outpost`)
- **Directory Path:** [`e:/TechTrekGT/outpost`](file:///e:/TechTrekGT/outpost)
- **Core Purpose:** An inventory, auction operations, and resale tracker supporting invoice document ingestion, platform comps, and consignment management.
- **Architecture Reference:** [Workspace ARCHITECTURE.md](file:///e:/TechTrekGT/ARCHITECTURE.md)

### 4. Wayfinder Guide (`wayfinder`)
- **Directory Path:** [`e:/TechTrekGT/wayfinder`](file:///e:/TechTrekGT/wayfinder)
- **Core Purpose:** A dedicated travel guide and expedition planner for Poland Christmas 2026 featuring public itineraries, Christmas market guides, transit maps, and private credential vaults.
- **Architecture Reference:** [wayfinder/ARCHITECTURE.md](file:///e:/TechTrekGT/wayfinder/ARCHITECTURE.md) (and [Workspace ARCHITECTURE.md](file:///e:/TechTrekGT/ARCHITECTURE.md))

### 5. Bigworm Gateway (`bigworm`)
- **Directory Path:** [`e:/TechTrekGT/bigworm`](file:///e:/TechTrekGT/bigworm)
- **Core Purpose:** A secure remote desktop portal and authentication bridge providing client access to Apache Guacamole instances via Cloudflare Tunnels.
- **Architecture Reference:** [Workspace ARCHITECTURE.md](file:///e:/TechTrekGT/ARCHITECTURE.md)

### 6. Vine Scout (`vinescout`)
- **Directory Path:** [`e:/Vine/VineScout`](file:///e:/Vine/VineScout)
- **Core Purpose:** A Chromium MV3 Amazon Vine shopping assistant utilizing Pure Vanilla JavaScript, a zero-bundler architecture, chunked local storage, and custom tax reconciliation logic.
- **Architecture Reference:** [docs/ARCHITECTURE.md](file:///e:/Vine/VineScout/docs/ARCHITECTURE.md) (and [vinescout-rules.md](file:///e:/Vine/VineScout/.agents/rules/vinescout-rules.md))
