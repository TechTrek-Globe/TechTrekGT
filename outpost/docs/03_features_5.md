# TechTrek Outpost Feature Registry (v5 Snapshot)

## Multi-Platform Listing Optimization & Validation Engine (`LIST-003`)

Updated `ListingCopyModal`, `listingCopyGenerator`, `platformListingRules`, `src/worker.js`, and `functions/api/ai/generate-ebay-details.js` to dynamically apply all 5 marketplace rule sets:

- **Supported Platforms**: `ebay`, `facebook`, `mercari`, `whatnot`, `reverb` (`SUPPORTED_PLATFORMS` in `src/utils/platformListingRules.js`).
- **Title & Token Rules**:
  - Strict `<= 80` UTF-16 code units (`computeUtf16Length`) targeting platform-specific optimal ranges with front-loaded signer + item keywords in the first 50-60 characters.
  - Independent conditional wearable `Size` token (`S`, `M`, `L`, `XL`, `2XL`, `3XL`, `48`, `50`, `52`, `54`, `56`) injected only when the item is wearable apparel/jersey and omitted completely for guitars, pickguards, balls, helmets, CDs, drumheads, and photos. Never emits `Size:` or `Sz.`.
  - Independent single literal trailing category/subject emoji preceded by 1 space; hard-blocklist hype emojis and hype words (`LOOK`, `WOW`, `RARE`, `HTF`, `MUST SEE`, `MINT`, `NICE`, `INVEST`, `NR`, `NO LOWBALLS`) rejected by validator.
  - Zero em dashes (`\u2014`) or en dashes (`\u2013`), and zero internal lot/warehouse/ASIN leakage (`stripInternalTrackingNotes` in `src/utils/ebayTemplate.js`).
- **Authentication & Brand Anti-Spoofing**:
  - Approved authenticators (`JSA`, `PSA/DNA`, `Beckett/BAS`, `Fanatics`, `B.A.M.`, `UDA`, `Steiner`, `SWAU`, `Schwartz`, MLB/NFL/NBA Authenticated) with direct lookup URL routing (`src/utils/certLookup.js`), including updated Beckett verification address (`https://www.beckett-authentication.com/get-data/${certNumber}`); banned COA issuers rejected in `validatePlatformPayload`.
  - Protected jersey tokens (`Nike`, `Adidas`, `Mitchell & Ness`, `Reebok`, `Fanatics`, `Authentic`, `Official`, `NFL`, `MLB`, `NBA`, `NHL`, `NCAA`) scrubbed on custom stitched jerseys (`brand: null` on Facebook, `"No Brand"` on Mercari, `"Unbranded"` on eBay/Whatnot).
  - Protected guitar maker tokens (`Fender`, `Gibson`, `Martin`, `Taylor`, `Epiphone`) scrubbed on unbranded/pickguard display guitars while preserving multi-word artist/signer names such as `Taylor Swift` (`brand: null` on Facebook, `"Unbranded"` + `"Custom Display Acoustic Guitar"` on Reverb).
- **Platform-Specific Fee Math, Formatting & Logistics**:
  - **eBay (`ebay`)**: Semantic HTML (`<p>`, `<ul>`, `<li>`, `<strong>`) with meta hook, item specifics, category lock, and `ceil((net + 0.40) / 0.864 * 1.12)` suggested price.
  - **Facebook Marketplace (`facebook`)**: Plain text + `relist_title` (`<= 80` UTF-16) for 14-day refresh, `brand: null` on custom jerseys and unbranded guitars, Tier 1 (`Local Police Precinct lot or QuikTrip (QT) Safe Place lot`) vs Tier 2 (`Mason Mill Park`) meetup routing, `["Cash", "Apple Pay"]` local payment methods, `12-20` lowercase `product_tags`, and `ceil(net * 1.15)` list price.
  - **Mercari (`mercari`)**: Plain text only (`<= 1000` chars), zero HTML, zero URLs, `brand: "No Brand"` on custom jerseys, `8-12` hashtags, and `ceil(net * 1.18)` Smart Offers/Promote price.
  - **Whatnot (`whatnot`)**: Live-show scannable bullet notes, packed weight tier (`8-12 oz`, `1-2 lbs`, `3-5 lbs`, `8-12 lbs`), BIN vs Live Auction recommendation, and `ceil((net + 0.30) / 0.891 * 1.12)` BIN price.
  - **Reverb (`reverb`)**: Clean HTML, double title + Block 1 pickguard disclosure, `3-day` handling, `< 48 inches` double-box note, and `ceil((net + 0.49) / 0.9181 * 1.12)` suggested price.
