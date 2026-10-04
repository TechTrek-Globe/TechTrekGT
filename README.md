# TechTrekGT - Monorepo

Five independently deployed Cloudflare Workers applications sharing a single Git repository and a single Cloudflare D1 database (`personal-budget-db`).

---

## Apps

| App | Directory | Production URL | Local Port | Responsibility |
|-----|-----------|---------------|------------|----------------|
| **Landing** *(Main Site)* | [`landing/`](./landing/) | `techtrekgt.com` | `wrangler dev` (static) | Platform hub & marketing entry point |
| Finance (Budget OS) | [`finance/`](./finance/) | `techtrekgt.com/finance/*` | `:3000` | Personal budget tracker with cloud vault sync |
| Outpost (Auction Tracker) | [`outpost/`](./outpost/) | `techtrekgt.com/outpost/*` | `:3001` | Resale & auction operations tracker |
| Wayfinder (Travel Guide) | [`wayfinder/`](./wayfinder/) | `techtrekgt.com/wayfinder/*` | `:5174` | Poland Christmas 2026 travel guide |
| Bigworm (Remote Desktop) | [`bigworm/`](./bigworm/) | `bigworm.techtrekgt.com` | `:5173` | Secure remote desktop portal via Guacamole |

> **`landing/`** is the primary domain root (`techtrekgt.com`). All other apps are independently deployed Workers mounted at sub-paths or sub-domains.

---

## Dev

Each app is fully self-contained with its own `package.json`, `vite.config.js`, and `wrangler.jsonc`. You **must** `cd` into the specific project directory before running any command.

```powershell
# Landing (static - no build step)
cd landing
wrangler dev          # http://localhost:8787

# Finance
cd finance
npm install
npm run dev           # http://localhost:3000

# Outpost
cd outpost
npm install
npm run dev           # http://localhost:3001

# Wayfinder
cd wayfinder
npm install
npm run dev           # http://localhost:5174

# Bigworm
cd bigworm
npm install
npm run dev           # http://localhost:5173
```

### Local Secrets

Each React app reads from a `.dev.vars` file (git-ignored). Copy the example and fill in real values:

```powershell
cd <project>
copy .dev.vars.example .dev.vars
# Edit .dev.vars - JWT_SECRET must match across all apps for SSO to work
```

---

## Build & Deploy

```powershell
# Landing (static assets only)
cd landing
wrangler deploy

# Finance
cd finance
npm run build
npm run deploy

# Outpost
cd outpost
npm run build
npm run deploy

# Wayfinder
cd wayfinder
npm run build
npm run deploy

# Bigworm
cd bigworm
npm run build
npm run deploy
```

---

## Structure

```
TechTrekGT/
  landing/          - Platform hub & main domain (static HTML/CSS/JS, no build step)
  finance/          - Budget OS (React 19 + Vite + Cloudflare Worker + D1)
  outpost/          - Auction Tracker (React 19 + Vite + Cloudflare Worker + D1)
  wayfinder/        - Poland Christmas 2026 travel guide (React 19 + Vite + Cloudflare Worker + D1)
  bigworm/          - Secure remote desktop portal (React 19 + Vite + Cloudflare Worker + Guacamole)
  bourbon/          - Bourbon tracker (React 19 + Vite + Cloudflare Worker + D1)
  docs/             - System documentation suite (01_identity.md, 02_arch.md, 03_features.md, 04_state.md)
```

### Shared Infrastructure

| Resource | Value |
|----------|-------|
| D1 Database | `personal-budget-db` (ID: `10f220d4-1c10-49e9-b63e-5d4cb08d599f`) |
| Auth | Shared `JWT_SECRET` + HttpOnly cookies (SSO across all React apps) |
| Deploy | Wrangler per-project (`wrangler.jsonc` in each directory) |
| CI/CD | Manual (`npm run deploy`) - no automated pipeline |
