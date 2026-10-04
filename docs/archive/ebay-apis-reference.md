# [ARCHIVED] Core eBay Sell APIs Reference & Protocol Guide

This document defines the official reference guide, endpoint architectures, primary functions, and capabilities for the Core eBay Sell APIs used across the TechTrekGT Outpost ecosystem.

---

## 1. Quick Reference Matrix

| API Area | Primary Function | What You Can Pull or Process | Primary Endpoints & Scopes |
| :--- | :--- | :--- | :--- |
| **Inventory API** | Listings and stock | Pull current stock levels, create item records, push custom HTML listing templates, and publish items as live fixed-price or auction offers. | `/sell/inventory/v1/inventory_item`<br>`/sell/inventory/v1/offer`<br>Scope: `sell.inventory`, `sell.inventory.readonly` |
| **Fulfillment API** | Post-sale logistics | Pull detailed buyer order information, process shipments, and upload tracking numbers. | `/sell/fulfillment/v1/order`<br>`/sell/fulfillment/v1/order/{id}/shipping_fulfillment`<br>Scope: `sell.fulfillment`, `sell.fulfillment.readonly` |
| **Finances API** | Revenue and costs | Pull seller payout statuses, detailed breakdowns of order earnings, listing fees, buyer refunds, and shipping label costs. | `/sell/finances/v1/transaction`<br>`/sell/finances/v1/payout`<br>Scope: `sell.finances`, `sell.finances.readonly` |
| **Analytics API** | Performance metrics | Pull traffic reports on how often buyers view your listings, track customer service metrics, and monitor your seller standard profile. | `/sell/analytics/v1/traffic_report`<br>`/sell/analytics/v1/customer_service_metric`<br>Scope: `sell.analytics.readonly` |
| **Account API** | Store foundation | Pull and configure your overarching business policies for payments, returns, and fulfillment rules. | `/sell/account/v1/fulfillment_policy`<br>`/sell/account/v1/return_policy`<br>`/sell/account/v1/payment_policy`<br>Scope: `sell.account`, `sell.account.readonly` |
| **Marketing API** | Promoted listings | Pull data on ad campaigns and manage promotions to increase item visibility. | `/sell/marketing/v1/ad_campaign`<br>`/sell/marketing/v1/ad_campaign/{id}/ad`<br>Scope: `sell.marketing`, `sell.marketing.readonly` |

---

## 2. Deep Dive: API Capabilities & Outpost Ingestion Rules

### 1. Inventory API
* **Primary Function:** Listings, inventory locations, and item offers.
* **Capabilities:**
  - Retrieve current stock levels and inventory item records.
  - Create and manage inventory item records (title, description, aspects, images, condition).
  - Create offers and publish them to live fixed-price or auction formats on eBay marketplaces.
  - Synchronize SKU-based inventory with Outpost local items.

### 2. Fulfillment API
* **Primary Function:** Order processing, post-sale logistics, and order status.
* **Capabilities:**
  - Ingest buyer shipping addresses, order lines, and payment statuses.
  - Create shipping fulfillments and upload tracking numbers back to eBay.
  - Automatically reconcile sold listings with Outpost sales records and inventory depletions.

### 3. Finances API
* **Primary Function:** Seller finances, payouts, transaction fees, and net revenue.
* **Capabilities:**
  - Ingest granular fee breakdowns (Final Value Fees, fixed order fees, regulatory operating fees).
  - Retrieve shipping label costs purchased through eBay.
  - Reconcile actual bank payouts and dispute/refund deductions against COGS for real-time ROI auditing.

### 4. Analytics API
* **Primary Function:** Buyer traffic reports, click-through rates, and performance benchmarks.
* **Critical Protocol Rules:**
  - **Filter Nesting:** The `date_range` MUST be passed inside the `filter` parameter (e.g. `filter=marketplace_ids:{EBAY_US},listing_ids:{ID},date_range:[YYYYMMDD..YYYYMMDD]`).
  - **Pacific Time & Lag:** Query date boundaries in Pacific Time (`America/Los_Angeles`) with a 1-day reporting lag (ending yesterday T-1). Future dates trigger `error 50018`.
  - **Valid Metrics:** Supported metric keys include `LISTING_IMPRESSION_TOTAL`, `LISTING_IMPRESSION_SEARCH_RESULTS_PAGE`, `LISTING_VIEWS_TOTAL`, `CLICK_THROUGH_RATE`, and `SALES_CONVERSION_RATE`.

### 5. Account API
* **Primary Function:** Business policies, sales tax tables, and fulfillment policies.
* **Capabilities:**
  - Ingest seller fulfillment policies (shipping services, handling time).
  - Ingest return policies and payment preferences.
  - Configure default listing rules.

### 6. Marketing API
* **Primary Function:** Promoted Listings campaigns, ad rates, and promotional discounts.
* **Capabilities:**
  - Query active Promoted Listings Standard ad rates and campaign IDs.
  - Read dynamic suggested ad rates for specific item categories.
  - Feed real-time ad fee rates into the Outpost Live Fee Engine to calculate net margins.

---

## 3. Mandatory Protocol for eBay API Issues
Whenever investigating, implementing, or debugging an eBay API feature in TechTrekGT:
1. Always reference this document (`outpost/docs/ebay-apis-reference.md`) first to identify the correct API family, required OAuth scopes, and endpoint formats.
2. Confirm the user's OAuth token row in `ebay_oauth_tokens` has the matching scope enabled.
3. Validate query parameter encoding and timezone boundaries before dispatching REST requests.
