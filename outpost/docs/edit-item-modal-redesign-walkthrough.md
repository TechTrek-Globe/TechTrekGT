# EditItemModal Redesign - Walkthrough & Verification

**Project:** TechTrekGT Outpost Tracker (`techtrekgt.com/outpost`)  
**Scope:** Multi-API Integration (eBay Browse API, Sell Account Fulfillment Policy API, Sell Marketing Campaign API & Trading API) for automatic extraction of business policy shipping rates ($15.95) and campaign ad rates (7%)  
**Deployment Status:** Verified & Deployed live to Cloudflare Workers (Version ID: `f9574cad-2eb9-487b-9d2c-c5374d14e0e3`)  

---

## 1. Multi-API Fallback Architecture

To ensure 100% reliable retrieval regardless of how an item is configured on eBay:

### 1.1 Live Shipping Rate Extraction (`buyerShippingCost` = $15.95)
1. **eBay Trading API (`GetItem`):**
   - Direct `<ShippingServiceCost>` / `<ShippingCost>` tags.
   - Regex extraction from `<ShippingProfileName>` (e.g. `"Flat Rate $15.95 (2 listings)"` -> `$15.95`).
2. **eBay Buy Browse API (`/buy/browse/v1/item/v1|{itemId}|0`):**
   - Direct query to the public marketplace endpoint, reading `shippingOptions[0].shippingCost.value` directly.
3. **eBay Sell Account Fulfillment Policy API (`/sell/account/v1/fulfillment_policy`):**
   - Queries the seller's active fulfillment policies on `EBAY_US` and extracts `shippingServices[0].shippingCost.value` by profile ID or policy name.

### 1.2 Live Promoted Listing Ad Rate (`autoPromotedRate` = 7.0%)
1. **Trading API XML:** Reads `<BidPercentage>`, `<AdRate>`, `<PromotedRate>` tags.
2. **Sell Marketing Campaign API (`/sell/marketing/v1/ad_campaign`):**
   - Iterates through seller campaigns and queries `/ad_campaign/{id}/ad?listing_ids={itemId}`.
   - Fallback to campaign-level `fundingStrategy.bidPercentage` (capturing general/standard campaigns like `"Campaign 06/30/2026 04:18:46"` configured at `7%`).

---

## 2. Verification & Deployment Results

- **Vite Production Build:** `npm run build` completed in `3.22s` with 0 errors.
- **Cloudflare Deployment:** `wrangler deploy` uploaded and activated Version ID: `f9574cad-2eb9-487b-9d2c-c5374d14e0e3`.
- **Live Endpoint:** `https://techtrekgt.com/outpost`
