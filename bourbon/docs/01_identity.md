# Sprig Bourbon Sommelier - Product Identity and Sommelier Persona

## 1. Product Overview and Core Mission

Sprig Bourbon Sommelier (also recognized as Unicorn Finder and home of the Brown Water Society) is the spirits curation, valuation, and pour recommendation platform within the TechTrekGT ecosystem, hosted at techtrekgt.com/bourbon/*.

The core mission of Bourbon Sommelier is to bring mathematical precision and connoisseur insight to whiskey discovery. By dynamically analyzing the relationship between bar pour prices, bottle Manufacturer Suggested Retail Prices (MSRP), secondary market allocations, proof, and mashbills, Bourbon Sommelier empowers whiskey enthusiasts to identify exceptional values, avoid overpriced pours, and hunt elusive unicorn bottles.

## 2. Target Personas and Connoisseur Archetypes

Bourbon Sommelier is tailored for spirits lovers spanning from casual bar patrons to seasoned collectors:

- The Unicorn Hunter: A dedicated whiskey enthusiast searching for rare, allocated bottles (such as George T. Stagg, Pappy Van Winkle, William Larue Weller, or Eagle Rare 17) whose market value vastly exceeds their retail price. They evaluate every pour against secondary replacement cost.
- The Value-Conscious Bar Patron: A discerning drinker at Sprig or partner venues looking to maximize their dollar. They want to know whether a fifteen-dollar pour is a steal for a barrel-proof allocated whiskey or an inflated markup on an everyday shelf staple.
- Mashbill and Profile Explorer: A palate explorer interested in specific grain bills (high-rye, wheated, traditional corn mash), distillation regions, barrel finishes (sherry, port, toasted oak), and proof ranges (from 80-proof sippers to hazmat barrel-proof powerhouses).
- The Hospitality Sommelier: A bartender or beverage director who needs instant reference notes on mashbills, distilleries of origin, aging statements, and flavor profiles to make informed pour recommendations to guests.

## 3. Visual Aesthetics and Design Philosophy

Bourbon Sommelier features a luxurious, warm aesthetic inspired by Kentucky rickhouses, copper pot stills, and dark mahogany bars:

- Rich Whiskey Color Palette: Defined in [bourbon/src/index.css](file:///e:/TechTrekGT/bourbon/src/index.css) and [bourbon/tailwind.config.js](file:///e:/TechTrekGT/bourbon/tailwind.config.js). Rooted in deep char-coal backgrounds (#0a0705), warm amber glows (--color-bourbon-amber: #d97706), vintage brass accents (--color-bourbon-brass: #b45309), and aged oak borders.
- Atmospheric Glassmorphism: Cards mimic smoked glass backbars, featuring subtle amber rim-lighting, velvety shadows, and polished gold typography.
- Spirits Iconography: Incorporates custom glassware icons, barrels, wheat stalks, and flame badges from lucide-react.
- Tier Badges: Instantly recognizable color-coded badges for valuation classifications: purple-gold gradients for Unicorns, emerald for Strong Buys, amber for Fair Pours, and muted stone for Weak Values.

## 4. Curatorial Philosophy and Value Metrics

The platform replaces subjective marketing hype with transparent metrics:

- Value Score Algorithm: A proprietary formula evaluating the ratio between Sprig bar pour prices and true bottle market replacement cost. A high value score highlights pours that are underpriced relative to their secondary market scarcity.
- Mashbill Transparency: Demystifies source distilleries, identifying contracted brands, sourcing relationships, and parent distilling conglomerates (such as Buffalo Trace, Heaven Hill, Barton 1792, and Jim Beam).
- Resilient Offline Catalog: Guarantees that whether a patron is in a subterranean whiskey cellar with zero mobile reception or browsing online, the complete catalog, notes, and prices remain fully accessible.
