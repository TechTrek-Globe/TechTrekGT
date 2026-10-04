# TechTrekGT Platform Identity and Ecosystem Overview

## 1. Platform Mission and Ecosystem Purpose

TechTrekGT is a unified multi-application personal and commercial cloud ecosystem hosted on techtrekgt.com. The platform consolidates personal wealth management, high-velocity resale operations, e-commerce telemetry, travel intelligence, remote desktop infrastructure, and curated catalog discovery into a cohesive serverless architecture.

The core engineering objective of TechTrekGT is to deliver enterprise-grade performance, strict data isolation, and low operational overhead using modern edge computing. Instead of deploying a monolithic full-stack server or complex microservice orchestration, TechTrekGT deploys independent Cloudflare Workers operating under a shared security perimeter, centralized API gateway, and shared relational database.

## 2. The 6-App Portfolio and Landing Hub

The TechTrekGT ecosystem consists of a central landing hub and gateway alongside six domain-specific satellite applications:

- Landing Hub (landing/): The primary domain root hosted at techtrekgt.com. It serves as the platform showcase, application launcher, and Central API Gateway routing shared external API integrations and proxies.
- Finance OS (finance/): A comprehensive personal budget tracker, multi-account ledger, and amortization platform mounted at techtrekgt.com/finance/*. Features encrypted cloud vault backups and debounced database synchronization.
- Outpost Tracker (outpost/): A high-velocity resale inventory, procurement intake, and multi-channel sales reconciliation engine mounted at techtrekgt.com/outpost/*. Features automated SKU assignment, live eBay Sell API integration, and Schedule C tax reporting.
- VineScout (vinescout/): An Amazon Vine analytics, item cataloging, and Estimated Tax Value (ETV) tracking portal mounted at techtrekgt.com/vinescout/*.
- Wayfinder (wayfinder/): A curated international travel companion and winter itinerary guide for Poland 2026 mounted at techtrekgt.com/wayfinder/*. Enforces dual-verified venue coordinates and rich local media caching.
- BigWorm Portal (bigworm/): A secure browser-accessible remote desktop gateway mounted at bigworm.techtrekgt.com. Bridges web clients to internal Apache Guacamole instances via Cloudflare Tunnel.
- Bourbon Sommelier (bourbon/): A spirits curation guide and unicorn allocation tracker for the Brown Water Society mounted at techtrekgt.com/bourbon/*. Powered by edge-cached spreadsheet catalogs with static fallback data.

## 3. Domain Routing and Ingress Architecture

All traffic ingress is managed through Cloudflare DNS and route bindings, mapping subpaths and subdomains to designated Worker instances:

| Application | Domain and Subpath Route | Worker Identifier | Runtime Layer |
|-------------|--------------------------|-------------------|---------------|
| Landing Hub | techtrekgt.com and techtrekgt.com/* | techtrek-landing | Static Assets + Central Gateway Worker |
| Finance OS | techtrekgt.com/finance and techtrekgt.com/finance/* | techtrek-budget | React 19 SPA + Cloudflare Worker |
| Outpost Tracker | techtrekgt.com/outpost* (and uppercase/legacy aliases) | techtrek-outpost | React 19 SPA + Cloudflare Worker |
| VineScout | techtrekgt.com/vinescout and techtrekgt.com/vinescout/* | techtrek-vinescout | React 19 SPA + Cloudflare Worker |
| Wayfinder | techtrekgt.com/wayfinder and techtrekgt.com/wayfinder/* | techtrek-wayfinder | React 19 SPA + Cloudflare Worker |
| BigWorm Portal | bigworm.techtrekgt.com (custom subdomain) | techtrek-bigworm | React 19 SPA + Guacamole Proxy Worker |
| Bourbon Sommelier | techtrekgt.com/bourbon and techtrekgt.com/bourbon/* | techtrek-bourbon | React 19 SPA + Cloudflare Worker |

### 3.1 Subpath Routing Resolution

Satellite applications mounted at subpaths (/finance, /outpost, /vinescout, /wayfinder, /bourbon) execute behind Cloudflare route matching rules. When a user requests a path under a satellite prefix, Cloudflare directs the request to that specific application Worker.

The Landing Worker (techtrek-landing) binds the wildcard root route techtrekgt.com/*. It serves requests not intercepted by satellite subpath routes, resolving marketing pages and static assets, while routing un-prefixed /api/* requests through its Central Gateway engine.

### 3.2 Subdomain Routing Isolation

BigWorm executes on the dedicated subdomain bigworm.techtrekgt.com. This provides strict browser origin separation for remote desktop sessions, isolating canvas rendering and WebSockets from root domain cookie contexts.

## 4. Shared Security Perimeter

The TechTrekGT platform enforces a defense-in-depth security perimeter across all applications:

### 4.1 Single Sign-On (SSO) Foundation

All applications authenticate against a shared user registry in Cloudflare D1. Authentication tokens are cryptographically signed using a shared JWT secret (JWT_SECRET) provisioned across all Worker environments. A user authenticating in one application gains authorized access across all ecosystem tools without re-authenticating.

### 4.2 Secure Cookie Transport

Session tokens are transmitted exclusively via HttpOnly, Secure, SameSite=Strict cookies. Client-side JavaScript running in the browser cannot read or manipulate authentication tokens, preventing session theft through cross-site scripting (XSS). All fetch requests across sub-applications include credentials: 'include'.

### 4.3 Edge Security Headers

Every Worker response injects a standardized suite of HTTP security headers:

- Content-Security-Policy (CSP): default-src 'self' with strict script source gating, cryptographic nonce injection for dynamic scripts, and explicit domain allowlisting for external assets.
- Strict-Transport-Security (HSTS): Enforces HTTPS connections across all production domains with max-age=31536000 and includeSubDomains.
- X-Content-Type-Options: nosniff to prevent MIME type sniffing.
- X-Frame-Options: DENY to prevent clickjacking and iframe embedding.
- Referrer-Policy: strict-origin-when-cross-origin to limit referrer data exposure.
- Permissions-Policy: Explicitly blocks browser access to camera, microphone, geolocation, and payment APIs.

### 4.4 CORS and Origin Isolation

Cross-Origin Resource Sharing (CORS) policies are environment-gated:

- Production: Strictly restricts allowed origins to https://techtrekgt.com and authenticated subdomains.
- Development: Restricts allowed origins to localhost and 127.0.0.1 on designated development ports (3000, 3001, 5173, 5174, 5175, 5176, 8787). Wildcard CORS origins are forbidden.

### 4.5 Dual-Layer Rate Limiting and Bot Deterrence

Critical authentication endpoints enforce dual-layer rate limiting:

- IP-Layer Limiting: Evaluates CF-Connecting-IP before body parsing to rapidly reject volumetric attacks.
- Account-Layer Limiting: Evaluates normalized email identifiers after body parsing to prevent distributed credential stuffing attacks across rotating proxy IPs.
- Cloudflare Turnstile: Server-side token validation on public authentication routes prevents automated bot submissions.
