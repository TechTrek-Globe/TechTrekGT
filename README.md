# TechTrekGT - Monorepo

Three independently deployed Cloudflare Workers apps sharing a single Git repository.

---

## Apps

| Domain | Directory | URL | Port |
|--------|-----------|-----|------|
| Finance (Budget OS) | [`finance/`](./finance/) | `techtrekgt.com`, `techtrekgt.com/finance/*` | 3000 |
| Outpost (Auction Tracker) | [`outpost/`](./outpost/) | `techtrekgt.com/outpost/*` | 3001 |

## Dev

Each app is fully self-contained with its own `package.json`, `vite.config.js`, and `wrangler.jsonc`.

```powershell
# Finance
cd finance
npm install
npm run dev       # http://localhost:3000

# Outpost
cd outpost
npm install
npm run dev       # http://localhost:3001
```

## Build & Deploy

```powershell
# Finance
cd finance
npm run build
npm run deploy

# Outpost
cd outpost
npm run build
npm run deploy
```

## Structure

```
TechTrekGT/
  finance/          - Budget OS (React + Vite + Cloudflare Worker + D1)
  outpost/          - Auction Tracker (React + Vite + Cloudflare Worker + D1)
  _orphaned-archive/ - Legacy files pending review before permanent deletion
```
