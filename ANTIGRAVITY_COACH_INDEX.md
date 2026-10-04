# TechTrekGT - Workspace Index & Coach Map

> FORBIDDEN: Do not search for, read, or generate ARCHITECTURE.md files. The architectural source of truth is strictly distributed across the docs/01_identity.md, docs/02_arch.md, docs/03_features.md, and docs/04_state.md files.
>
> Mandatory Rule: The agent MUST read root docs/04_state.md AND the target app's docs/04_state.md, docs/01_identity.md, docs/02_arch.md, and docs/03_features.md before modifying code. Upon completion, the agent MUST update the local docs/03_features.md and docs/04_state.md across all applications.

---

## Global Architectural Pillars

All sub-applications within the TechTrekGT workspace adhere to the following shared foundation:

- Language & Runtime: Pure JavaScript (ESM) across all apps. No TypeScript or external compiler steps.
- Frontend Architecture: React with Vite build tooling (landing hub uses lightweight static HTML/CSS/JS).
- Styling: Tailwind CSS utility styling with dark-mode first palettes.
- Client Routing: Hand-rolled custom SPA routing using window.history.pushState and popstate listeners. No react-router-dom.
- Backend Services: Cloudflare Workers (ESM format) and functions API routing deployed independently per project.
- Database Layer: Shared Cloudflare D1 SQLite database (personal-budget-db).
- Authentication & Security: Shared Single Sign-On (SSO) JWT authentication using HttpOnly cookies with WebCrypto PBKDF2 password hashing.

---

## Sub-Application Index

### 1. Landing Hub (`landing`)
- Directory Path: [e:/TechTrekGT/landing](file:///e:/TechTrekGT/landing)
- Core Purpose: The primary domain root and central marketing portal for techtrekgt.com, serving as the navigational launchpad across all platform sub-services.
- Documentation Reference: [docs/01_identity.md](file:///e:/TechTrekGT/landing/docs/01_identity.md), [docs/02_arch.md](file:///e:/TechTrekGT/landing/docs/02_arch.md), [docs/03_features.md](file:///e:/TechTrekGT/landing/docs/03_features.md), [docs/04_state.md](file:///e:/TechTrekGT/landing/docs/04_state.md)

### 2. Finance OS (`finance`)
- Directory Path: [e:/TechTrekGT/finance](file:///e:/TechTrekGT/finance)
- Core Purpose: A multi-user personal finance platform featuring daily income matrices, bill schedules, account ledgers, and amortization calculators.
- Documentation Reference: [docs/01_identity.md](file:///e:/TechTrekGT/finance/docs/01_identity.md), [docs/02_arch.md](file:///e:/TechTrekGT/finance/docs/02_arch.md), [docs/03_features.md](file:///e:/TechTrekGT/finance/docs/03_features.md), [docs/04_state.md](file:///e:/TechTrekGT/finance/docs/04_state.md)

### 3. Outpost Tracker (`outpost`)
- Directory Path: [e:/TechTrekGT/outpost](file:///e:/TechTrekGT/outpost)
- Core Purpose: An inventory, auction operations, and resale tracker supporting invoice document ingestion, platform comps, and consignment management.
- Documentation Reference: [docs/01_identity.md](file:///e:/TechTrekGT/outpost/docs/01_identity.md), [docs/02_arch.md](file:///e:/TechTrekGT/outpost/docs/02_arch.md), [docs/03_features.md](file:///e:/TechTrekGT/outpost/docs/03_features.md), [docs/04_state.md](file:///e:/TechTrekGT/outpost/docs/04_state.md)

### 4. Wayfinder Guide (`wayfinder`)
- Directory Path: [e:/TechTrekGT/wayfinder](file:///e:/TechTrekGT/wayfinder)
- Core Purpose: A dedicated travel guide and expedition planner for Poland Christmas 2026 featuring public itineraries, Christmas market guides, transit maps, and private credential vaults.
- Documentation Reference: [docs/01_identity.md](file:///e:/TechTrekGT/wayfinder/docs/01_identity.md), [docs/02_arch.md](file:///e:/TechTrekGT/wayfinder/docs/02_arch.md), [docs/03_features.md](file:///e:/TechTrekGT/wayfinder/docs/03_features.md), [docs/04_state.md](file:///e:/TechTrekGT/wayfinder/docs/04_state.md)

### 5. Bigworm Gateway (`bigworm`)
- Directory Path: [e:/TechTrekGT/bigworm](file:///e:/TechTrekGT/bigworm)
- Core Purpose: A secure remote desktop portal and authentication bridge providing client access to Apache Guacamole instances via Cloudflare Tunnels.
- Documentation Reference: [docs/01_identity.md](file:///e:/TechTrekGT/bigworm/docs/01_identity.md), [docs/02_arch.md](file:///e:/TechTrekGT/bigworm/docs/02_arch.md), [docs/03_features.md](file:///e:/TechTrekGT/bigworm/docs/03_features.md), [docs/04_state.md](file:///e:/TechTrekGT/bigworm/docs/04_state.md)

### 6. Bourbon Tracker (`bourbon`)
- Directory Path: [e:/TechTrekGT/bourbon](file:///e:/TechTrekGT/bourbon)
- Core Purpose: A bourbon inventory tracking and hunting application.
- Documentation Reference: [docs/01_identity.md](file:///e:/TechTrekGT/bourbon/docs/01_identity.md), [docs/02_arch.md](file:///e:/TechTrekGT/bourbon/docs/02_arch.md), [docs/03_features.md](file:///e:/TechTrekGT/bourbon/docs/03_features.md), [docs/04_state.md](file:///e:/TechTrekGT/bourbon/docs/04_state.md)

### 7. Root Documentation Suite (`docs`)
- Directory Path: [e:/TechTrekGT/docs](file:///e:/TechTrekGT/docs)
- Core Purpose: Global system identity, architecture, features, and operational state across all sub-apps.
- Documentation Reference: [docs/01_identity.md](file:///e:/TechTrekGT/docs/01_identity.md), [docs/02_arch.md](file:///e:/TechTrekGT/docs/02_arch.md), [docs/03_features.md](file:///e:/TechTrekGT/docs/03_features.md), [docs/04_state.md](file:///e:/TechTrekGT/docs/04_state.md)
