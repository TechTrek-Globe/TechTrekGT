# Poland 2026 Itinerary and Wrocław Accommodation Plan

## Scope

Update the Wayfinder itinerary and lodging data for the December 2026 Poland trip. Keep the implementation in pure JavaScript/JSX, preserve the existing `window.history.pushState` routing and dark-mode-first Tailwind conventions, and make surgical changes only.

## Implementation Steps

1. Review `wayfinder/ARCHITECTURE.md`, the workspace-level `ARCHITECTURE.md`, and the relevant existing itinerary, lodging/accommodation, and state/mock-data modules to identify the current source of truth and date/day-index conventions.
2. Update the Wrocław lodging record to the confirmed booking:
   - Altus Palace Wrocław
   - Website: https://www.hotelaltuspalace.pl
   - Phone: +48 717475000
   - Email: info@hotelaltuspalace.pl
   - Guest: Jon
   - Stay: 2026-12-07 through 2026-12-09; check-in December 7 from 15:00, check-out December 9
3. Keep the actual Wrocław booking details behind sign-in. Signed-out users must not receive or see the hotel name, contact details, guest name, or booking/check-in details; show only the existing signed-out/locked state pattern. Enforce this at the data/API boundary as well as in the UI, following the app's existing authentication and authorization conventions.
4. Rebalance the itinerary as a continuous timeline:
   - Wrocław: December 7–9, 2026
   - Poznań: 1 night, December 9–10, 2026
   - Gdańsk: 3 nights, December 10–13, 2026
   - Realign all later city dates, day indices, and transfer/travel markers to follow these dates without gaps or overlaps. Preserve other itinerary durations unless continuity requires their dates to move.
5. Update the smallest set of existing UI/data surfaces needed so Timeline, Itinerary, Lodging, booking cards, date badges, city night counts, and transit connections all derive or display consistent dates. Avoid duplicating schedule constants when the existing architecture has a shared data source.
6. Add or adjust focused tests only where an existing test pattern covers itinerary continuity, lodging display, or signed-out data access; do not introduce TypeScript or a new routing library.

## Verification Checklist

- Confirm the stay boundaries and check-in/check-out details in Wrocław lodging data and booking views.
- Confirm signed-out users cannot access actual Wrocław booking details through either the UI or data/API responses, while signed-in users can.
- Confirm Poznań is exactly one night and Gdańsk exactly three nights.
- Check consecutive itinerary dates, day indices, and transfer markers from the Wrocław stay through every subsequent destination.
- Check Timeline, Itinerary, and Lodging views for matching date badges and night counts.
- Run the narrowest relevant existing tests, followed by the Wayfinder project's available build or lint check if applicable.
- Review the final diff to ensure only itinerary/lodging data and directly affected UI/tests changed.

## Approval Gate

Do not modify source code until the user explicitly responds with: **Plan approved**.
