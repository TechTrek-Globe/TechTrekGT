-- Wayfinder Mock Seed Data

-- Insert Journey
INSERT INTO wayfinder_journeys (id, slug, title, status, created_by)
VALUES ('poland-christmas-2026', 'poland-christmas-2026', 'Poland: A Christmas Journey', 'planned', 'local-user')
ON CONFLICT (id) DO NOTHING;

-- Insert Mock Itinerary Items
INSERT INTO wayfinder_itinerary_items (id, journey_id, user_id, item_type, title, notes, local_date, local_time, provider)
VALUES 
('item-001', 'poland-christmas-2026', 'local-user', 'flight', 'Outbound Flight (DL74 / DL9208)', 'ATL to AMS, then AMS to KRK', '2026-12-03', '20:10:00', 'Delta Airlines'),
('item-002', 'poland-christmas-2026', 'local-user', 'hotel', 'Hotel Stary (Kraków)', 'Check-in to Old Town base. Walking distance to Rynek.', '2026-12-04', '15:00:00', 'Hotel Stary'),
('item-003', 'poland-christmas-2026', 'local-user', 'rail', 'IC Train: Kraków to Wrocław', 'Direct IC train. 1st Class.', '2026-12-07', '11:30:00', 'PKP Intercity'),
('item-004', 'poland-christmas-2026', 'local-user', 'hotel', 'The Bridge Wrocław MGallery', 'Check-in to Cathedral Island base.', '2026-12-07', '14:30:00', 'Accor'),
('item-005', 'poland-christmas-2026', 'local-user', 'booking', 'Wieliczka Salt Mine Tour', 'Guided tour of the historic salt mine.', '2026-12-06', '10:00:00', 'Wieliczka')
ON CONFLICT (id) DO NOTHING;
