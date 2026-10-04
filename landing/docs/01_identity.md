# Landing Hub - Product Identity and Central Gateway Persona

## 1. Product Overview and Core Mission

Landing Hub is the primary domain entry point and central gateway for the TechTrekGT ecosystem, hosted at techtrekgt.com. It fulfills a dual operational role: serving as the public-facing platform showcase and command center, while concurrently operating as the programmatic Central API Gateway for all external third-party integrations across the multi-application platform.

The core mission of Landing Hub is to provide a single, unified digital command center. It presents an intuitive portal connecting users to all satellite applications (Finance OS, Outpost Tracker, VineScout, Wayfinder, BigWorm, and Bourbon Sommelier), while offloading complex third-party API proxying, OAuth handshakes, and transient credential caching away from individual sub-applications into a centralized serverless layer.

## 2. Product Personas and Usage Archetypes

Landing Hub serves two distinct operational personas within the TechTrekGT platform:

- Platform Navigator and Explorer: An end-user seeking immediate access to their personal financial operating system, resale operations, travel logistics, remote workstations, or spirits catalogs. The user expects an instantaneous, zero-latency interface showcasing operational system status and direct navigation paths.
- Central API Gateway Proxy: A background infrastructure persona that mediates between client-side satellite applications and external third-party services. Sub-applications such as Outpost Tracker and VineScout delegate their external API requests to the gateway, ensuring that API secrets, OAuth access tokens, and rate limits remain secure and centralized.

## 3. Aesthetic Philosophy and Design Tokens

Landing Hub uses a high-contrast dark space aesthetic characterized by deep backgrounds, warm amber accents, and glowing card borders:

- Color Palette: Built on custom CSS properties defined in [landing/style.css](file:///e:/TechTrekGT/landing/style.css). Deep background tones (--bg-primary: #07090e, --bg-card: #0f1523) provide the canvas for subtle card borders (--card-border: rgba(255, 255, 255, 0.08)) and ambient amber highlights (--color-amber: #f59e0b).
- Typography: Implements the Inter typeface family from Google Fonts, spanning weights from light (300) to black (900), configured with tabular numerals and crisp line spacing.
- Visual Hierarchy: The hero banner showcases a panoramic command center visualization, reinforced by a glowing operational status indicator pill and dynamic platform destination cards.
- Interactive Feedback: Destination cards feature hardware-accelerated hover transformations, custom radial glow effects tailored to each sub-application brand, and keyboard accessibility indicators.

## 4. Multi-Application Ecosystem Navigation

The landing page interface organizes the ecosystem into purpose-built destination cards:

- Finance: Direct launch to techtrekgt.com/finance for budget tracking, net worth analytics, and account reconciliations.
- Outpost: Direct launch to techtrekgt.com/outpost for high-velocity resale intake, SKU assignment, and sales tracking.
- Vine Scout: Direct launch to techtrekgt.com/vinescout for Amazon Vine cataloging and estimated tax value tracking.
- Wayfinder: Direct launch to techtrekgt.com/wayfinder for curated international travel logistics and winter itineraries.
- BigWorm: Direct launch to bigworm.techtrekgt.com for secure, browser-based remote desktop access.
- Bourbon: Direct launch to techtrekgt.com/bourbon for Sprig Bourbon Sommelier curation and secondary value tracking.

## 5. Central Gateway Identity and Architectural Role

Beyond its user interface, Landing Hub acts as the security and proxy gateway for techtrekgt.com:

- Shared Domain Root: Mounted at techtrekgt.com and techtrekgt.com/*, intercepting all requests before resolving static content.
- Gateway Routing Priority: When incoming paths match the /api/* pattern, the worker bypasses static asset delivery and routes requests directly to specialized gateway handlers in [landing/src/gateway/](file:///e:/TechTrekGT/landing/src/gateway/).
- Security Boundary: Enforces Single Sign-On (SSO) authentication across incoming gateway requests using a shared JWT secret, shielding upstream providers (eBay, Amazon) from unauthenticated traffic.
