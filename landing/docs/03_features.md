# Landing Hub - Platform Features and Gateway Capabilities

## 1. Central API Gateway Integration Services

The Central API Gateway layer within Landing Hub encapsulates critical external third-party integrations, eliminating duplicate credential storage and redundant network fetches across sub-applications.

### 1.1 eBay Marketplace Insights and Comps Search

The eBay comps engine in [landing/src/gateway/ebay.js](file:///e:/TechTrekGT/landing/src/gateway/ebay.js) provides official, real-time sold comparable pricing for physical inventory:

- API Integration: Connects to the eBay Marketplace Insights API (buy/marketplace_insights/v1_beta/item_sales/search) with fallbacks to the eBay Browse API.
- Query Normalization: Applies automated query relaxation via relaxQuery to remove noisy grading labels (gem mint, rc, patch auto, authenticated) and hashtags when initial exact searches return sparse results.
- Price Normalization: Parses gross sale prices, shipping fees, transaction dates, and item conditions, converting raw eBay payloads into standardized schema objects matching the Outpost auction_comps structure.
- Option A Persistence Contract: The gateway acts strictly as a retrieval and formatting pipeline, returning clean JSON to the client. The invoking application (such as Outpost) retains authority over persisting comps to D1 via its own local endpoints.

### 1.2 eBay OAuth Authorization Code Grant (ACG) Lifecycle

The gateway manages the full user OAuth lifecycle in [landing/src/gateway/ebayOAuth.js](file:///e:/TechTrekGT/landing/src/gateway/ebayOAuth.js) for authenticated seller operations:

- Authorization Initiation: The /api/ebay/oauth/start endpoint generates cryptographically secure state parameters containing user IDs and timestamps, encrypted using AES-GCM via [landing/src/gateway/tokenCrypto.js](file:///e:/TechTrekGT/landing/src/gateway/tokenCrypto.js).
- Redirect Handling: The /api/ebay/oauth/callback endpoint decrypts and validates the state parameter, exchanges the authorization code for access and refresh tokens, and stores encrypted tokens in the D1 database table ebay_oauth_tokens.
- Status Telemetry: The /api/ebay/oauth/status endpoint checks token validity and expiration without revealing secret values to the browser.
- RFC 7009 Token Revocation: The /api/ebay/oauth/disconnect endpoint executes token revocation at eBay (identity/v1/oauth2/token/revoke) before purging credential records from D1, ensuring complete session termination.

### 1.3 eBay Webhook Verification and Notification Engine

The gateway hosts the central webhook receiver in [landing/src/gateway/ebayWebhook.js](file:///e:/TechTrekGT/landing/src/gateway/ebayWebhook.js) for eBay marketplace notifications:

- Challenge Verification: Responds to eBay GET verification handshakes by computing SHA-256 HMAC hashes over the challengeCode, endpoint URL, and verification token.
- Event Ingestion: Receives POST marketplace account deletion, item sold, or policy change events, logging signatures and routing alerts to relevant internal tables.

### 1.4 eBay Finances and Listings API Proxies

The gateway coordinates authenticated seller analytics and financial accounting:

- Finances Proxy: Routes requests to /api/ebay/finances via [landing/src/gateway/ebayFinances.js](file:///e:/TechTrekGT/landing/src/gateway/ebayFinances.js), fetching transaction-level gross earnings, marketplace withholdings, and processing fees.
- Listings Proxy: Routes requests to /api/ebay/listings via [landing/src/gateway/ebayListings.js](file:///e:/TechTrekGT/landing/src/gateway/ebayListings.js), retrieving seller listing summaries and inventory counts.

### 1.5 Amazon Product Detail Scraper Cascade

The Amazon fetch service in [landing/src/gateway/amazon.js](file:///e:/TechTrekGT/landing/src/gateway/amazon.js) extracts structured product metadata from ASINs and URLs:

- Multi-Tier Extraction Cascade: Employs a prioritized waterfall strategy. Tier 1 executes via an external scraping proxy using SCRAPER_API_KEY. If the primary proxy encounters throttling or captcha blocks, Tier 2 executes direct worker fetches with rotated User-Agent headers.
- HTML Normalization: Uses regex-based extractors to extract item titles, primary high-resolution image URLs, list prices, category breadcrumbs, and availability status.
- Client Sanitization: Returns sanitized JSON with fallback placeholders, protecting downstream inventory intake forms from malformed payloads.

## 2. Landing Hub Portal Features

The public interface of Landing Hub serves as the primary navigation cockpit for the entire TechTrekGT domain.

### 2.1 Dynamic Destination Cards

The main cards grid presents all satellite applications in a responsive visual hierarchy:

- TechTrek Finance: Personal budget operating system card with quick badges for Budget Tracking, Dashboards, and Goals.
- TechTrek Outpost: Resale operations tracker card with badges for Inventory Intake, eBay Sync, and Profit Tracking.
- Vine Scout: Amazon Vine catalog and tax intelligence card with badges for ETV Tracking, Tier Progress, and Item Analytics.
- Wayfinder: Winter travel companion card highlighting Christmas markets, dual-verified POIs, and logistics.
- BigWorm: Secure remote desktop portal card emphasizing encrypted terminal and workstation access.
- Sprig Bourbon: Sommelier curation card highlighting unicorn tracking, value scores, and proof discovery.

### 2.2 Aesthetic Visual Architecture

- Hero Header: Implements a panoramic visual header with dark gradient overlays, system brand pill badges, and active operational status badges.
- Glassmorphic Cards: Each destination card incorporates custom border glows tailored to its application brand colors (blue for Finance, amber for Outpost, emerald for VineScout, cyan for BigWorm, and warm brass for Bourbon).
- Performance Optimization: High-priority hero image loading using fetchpriority="high", responsive image scaling, and lazy loading for off-screen logos and icons.
