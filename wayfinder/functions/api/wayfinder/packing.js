// GET  /api/wayfinder/packing?journey_id=
// POST /api/wayfinder/packing (add item or preset action)
// PUT  /api/wayfinder/packing/:id (update item)
// DELETE /api/wayfinder/packing/:id (delete item)

import { generateId } from '../../utils/id.js';

const CHECKED_LIMIT_KG = 23.0; // standard transatlantic baggage allowance
const CARRYON_LIMIT_KG = 8.0;  // standard European cabin baggage limit

const POLAND_WINTER_2026_PRESET = [
  // Thermal Clothing & Layers
  { category: 'clothing', name: 'Merino Wool Thermal Top (Base Layer)', quantity: 2, weight_grams: 220, bag_type: 'checked', notes: '200+ gsm 100% merino wool for sub-zero warmth' },
  { category: 'clothing', name: 'Merino Wool Thermal Leggings / Bottoms', quantity: 2, weight_grams: 200, bag_type: 'checked', notes: 'Worn under trousers on market evenings' },
  { category: 'clothing', name: 'Heavyweight Fleece / Wool Mid-Layer Sweater', quantity: 2, weight_grams: 450, bag_type: 'checked', notes: 'Traps body heat during long outdoor walking tours' },
  { category: 'clothing', name: 'Insulated Waterproof Down Parka (-10°C rated)', quantity: 1, weight_grams: 1200, bag_type: 'checked', notes: 'Windproof with deep hood for Baltic gales in Gdańsk' },
  { category: 'clothing', name: 'Weatherproof Shell Pants', quantity: 1, weight_grams: 400, bag_type: 'checked', notes: 'Waterproof outer layer for snowy days' },
  { category: 'clothing', name: 'Thermal Merino Wool Socks (Heavy Cushion)', quantity: 4, weight_grams: 80, bag_type: 'checked', notes: 'Cushioned for 15,000+ daily cobblestone steps' },
  { category: 'clothing', name: 'Fleece-Lined Winter Beanie Hat', quantity: 2, weight_grams: 75, bag_type: 'carryon', notes: 'One active, one dry backup in daypack' },
  { category: 'clothing', name: 'Touchscreen-Compatible Winter Gloves', quantity: 1, weight_grams: 120, bag_type: 'carryon', notes: 'Use phone for photos without exposing bare skin' },
  { category: 'clothing', name: 'Heavy Waterproof Insulated Mittens', quantity: 1, weight_grams: 180, bag_type: 'checked', notes: 'Sub-zero backup for freezing evening markets' },
  { category: 'clothing', name: 'Thermal Neck Gaiter / Wool Scarf', quantity: 1, weight_grams: 150, bag_type: 'carryon', notes: 'Essential wind seal around coat collar' },

  // Footwear & Snow Traction
  { category: 'footwear', name: 'Waterproof Winter Walking Boots (Grip Sole)', quantity: 1, weight_grams: 1350, bag_type: 'checked', notes: 'Thinsulate-lined with deep rubber winter lugs' },
  { category: 'footwear', name: 'Yaktrax / Ice Grippers (For Icy Cobblestones)', quantity: 1, weight_grams: 320, bag_type: 'checked', notes: 'Saves ankles on slick Old Town ice in Wrocław & Kraków' },
  { category: 'footwear', name: 'Casual City Sneakers / Evening Indoor Shoes', quantity: 1, weight_grams: 750, bag_type: 'checked', notes: 'For hotel lounges and restaurant dinners' },
  { category: 'footwear', name: 'Moisture-Wicking Sock Liners', quantity: 4, weight_grams: 40, bag_type: 'checked', notes: 'Blister prevention system when doubled with wool socks' },

  // Winter Gear & Accessories
  { category: 'gear', name: 'Adhesive Hand & Toe Warmers (10-Pack)', quantity: 1, weight_grams: 400, bag_type: 'checked', notes: 'Keep in coat pockets for evening market stalls' },
  { category: 'gear', name: 'Vacuum Insulated Travel Thermos (500ml)', quantity: 1, weight_grams: 310, bag_type: 'carryon', notes: 'Hot spiced tea on intercity PKP train journeys' },
  { category: 'gear', name: 'Windproof Compact Travel Umbrella', quantity: 1, weight_grams: 290, bag_type: 'carryon', notes: 'Strong gust-resistant ribs for coastal Gdańsk rain/sleet' },
  { category: 'gear', name: 'Water-Resistant Daypack (18-22L)', quantity: 1, weight_grams: 450, bag_type: 'personal', notes: 'Carries spare layers, purchases, and camera' },
  { category: 'gear', name: 'TSA-Approved Luggage Locks', quantity: 2, weight_grams: 60, bag_type: 'personal', notes: 'Secures bags during train luggage rack storage' },

  // Electronics & Converters
  { category: 'electronics', name: 'European Type C/E Plug Adapters (Poland 230V)', quantity: 2, weight_grams: 45, bag_type: 'carryon', notes: 'Round 2-pin grounded plugs for Polish wall outlets' },
  { category: 'electronics', name: '10,000mAh Cold-Resistant USB-C Power Bank', quantity: 1, weight_grams: 240, bag_type: 'carryon', notes: 'Lithium battery - MUST remain in cabin carry-on' },
  { category: 'electronics', name: '65W GaN Multi-Port USB-C Fast Charger', quantity: 1, weight_grams: 160, bag_type: 'carryon', notes: 'Charges laptop, phone, and camera from one hotel socket' },
  { category: 'electronics', name: 'Braided USB-C & Lightning Cables (1m & 2m)', quantity: 3, weight_grams: 35, bag_type: 'carryon', notes: 'Durable nylon braiding resistant to cold-cracking' },
  { category: 'electronics', name: 'Noise-Canceling Wireless Earbuds / Headphones', quantity: 1, weight_grams: 180, bag_type: 'personal', notes: 'Essential for transatlantic flight DL9208 and PKP trains' },

  // Travel Documents & Money
  { category: 'documents', name: 'Passport & Waterproof Document Sleeve', quantity: 1, weight_grams: 80, bag_type: 'personal', notes: 'Keep physical document + color photocopy in personal bag' },
  { category: 'documents', name: 'Delta Flight DL9208 Confirmation & Boarding Passes', quantity: 1, weight_grams: 20, bag_type: 'personal', notes: 'Saved in Wayfinder Vault and printed backup' },
  { category: 'documents', name: 'PKP Intercity Rail Reservations (1st Class)', quantity: 1, weight_grams: 20, bag_type: 'personal', notes: 'Printed barcodes for conductor inspection aboard IC/EIP' },
  { category: 'documents', name: 'Emergency Polish Złoty Cash (300-500 PLN)', quantity: 1, weight_grams: 30, bag_type: 'personal', notes: 'For small market stalls, restrooms, and church donations' },
  { category: 'documents', name: 'International Travel Medical Insurance Card', quantity: 1, weight_grams: 25, bag_type: 'personal', notes: 'Emergency assistance contacts and policy number' },
  { category: 'documents', name: 'Hotel Check-In Vouchers (Kraków to Gdańsk)', quantity: 1, weight_grams: 30, bag_type: 'personal', notes: 'Physical vouchers with confirmed reservation numbers' },

  // Winter Toiletries & Medical
  { category: 'toiletries', name: 'Heavy Barrier Cold Cream / Face Balm (TSA size)', quantity: 1, weight_grams: 90, bag_type: 'carryon', notes: 'Prevents winter windburn and dry cracking' },
  { category: 'toiletries', name: 'Beeswax Extreme Cold Defense Lip Balm (SPF 15+)', quantity: 2, weight_grams: 25, bag_type: 'personal', notes: 'One in personal pocket, one in toiletry bag' },
  { category: 'toiletries', name: 'Travel First Aid & Cold / Flu Medicine Kit', quantity: 1, weight_grams: 140, bag_type: 'carryon', notes: 'Paracetamol, ibuprofen, throat lozenges, electrolytes' },
  { category: 'toiletries', name: 'Blister Relief Moleskin & Bandages', quantity: 1, weight_grams: 60, bag_type: 'carryon', notes: 'Emergency foot care for multi-mile cobblestone walking' },
  { category: 'toiletries', name: 'Antiseptic Hand Sanitizer & Cleansing Wipes', quantity: 2, weight_grams: 55, bag_type: 'personal', notes: 'Before dining on street food at market stalls' },

  // Christmas Market Treasures & Gifts
  { category: 'gifts', name: 'Toruń UNESCO Pierniki (Decorated Gingerbread)', quantity: 1, weight_grams: 350, bag_type: 'checked', notes: 'Fragile holiday gift - wrap securely between wool sweaters' },
  { category: 'gifts', name: 'Handcrafted Glass Polish Christmas Baubles', quantity: 2, weight_grams: 120, bag_type: 'carryon', notes: 'Delicate hand-blown ornaments - transport in cabin' },
  { category: 'gifts', name: 'Baltic Sea Amber Keepsake / Jewelry (Gdańsk)', quantity: 1, weight_grams: 65, bag_type: 'personal', notes: 'Certified natural amber from Mariacka Street studios' },
  { category: 'gifts', name: 'Smoked Highland Oscypek Cheese (Vacuum-Sealed)', quantity: 1, weight_grams: 300, bag_type: 'checked', notes: 'Purchased at Kraków Rynek market for holiday feast' }
];

async function ensureTable(db) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS wayfinder_packing_items (
      id              TEXT PRIMARY KEY,
      journey_id      TEXT NOT NULL,
      user_id         TEXT NOT NULL,
      category        TEXT NOT NULL DEFAULT 'clothing',
      name            TEXT NOT NULL,
      quantity        INTEGER NOT NULL DEFAULT 1,
      weight_grams    INTEGER DEFAULT 0,
      is_packed       INTEGER NOT NULL DEFAULT 0,
      is_shared       INTEGER NOT NULL DEFAULT 0,
      assigned_to     TEXT,
      bag_type        TEXT NOT NULL DEFAULT 'checked',
      notes           TEXT,
      sort_order      INTEGER NOT NULL DEFAULT 0,
      created_at      TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (journey_id)  REFERENCES wayfinder_journeys(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id)     REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_wf_packing_journey ON wayfinder_packing_items(journey_id);
    CREATE INDEX IF NOT EXISTS idx_wf_packing_user    ON wayfinder_packing_items(user_id);
  `);
}

function computeStats(items) {
  let totalItems = 0;
  let packedItems = 0;
  let totalWeightGrams = 0;
  let checkedWeightGrams = 0;
  let carryonWeightGrams = 0;
  let personalWeightGrams = 0;

  const byCategory = {};

  for (const item of items) {
    const qty = Math.max(1, parseInt(item.quantity, 10) || 1);
    const itemWeight = Math.max(0, parseInt(item.weight_grams, 10) || 0) * qty;
    const isPacked = item.is_packed === 1;

    totalItems += qty;
    if (isPacked) packedItems += qty;

    totalWeightGrams += itemWeight;
    if (item.bag_type === 'checked') checkedWeightGrams += itemWeight;
    else if (item.bag_type === 'carryon') carryonWeightGrams += itemWeight;
    else if (item.bag_type === 'personal') personalWeightGrams += itemWeight;
    else checkedWeightGrams += itemWeight; // fallback

    const cat = item.category || 'other';
    if (!byCategory[cat]) {
      byCategory[cat] = {
        category: cat,
        total_items: 0,
        packed_items: 0,
        weight_grams: 0,
        weight_kg: 0
      };
    }
    byCategory[cat].total_items += qty;
    if (isPacked) byCategory[cat].packed_items += qty;
    byCategory[cat].weight_grams += itemWeight;
    byCategory[cat].weight_kg = Math.round((byCategory[cat].weight_grams / 1000) * 100) / 100;
  }

  const packPercentage = totalItems > 0 ? Math.round((packedItems / totalItems) * 100) : 0;
  const checkedWeightKg = Math.round((checkedWeightGrams / 1000) * 100) / 100;
  const carryonWeightKg = Math.round((carryonWeightGrams / 1000) * 100) / 100;
  const personalWeightKg = Math.round((personalWeightGrams / 1000) * 100) / 100;
  const totalWeightKg = Math.round((totalWeightGrams / 1000) * 100) / 100;

  return {
    total_items: totalItems,
    packed_items: packedItems,
    pack_percentage: packPercentage,
    total_weight_grams: totalWeightGrams,
    total_weight_kg: totalWeightKg,
    checked_weight_kg: checkedWeightKg,
    carryon_weight_kg: carryonWeightKg,
    personal_weight_kg: personalWeightKg,
    checked_limit_kg: CHECKED_LIMIT_KG,
    carryon_limit_kg: CARRYON_LIMIT_KG,
    checked_utilization_pct: Math.min(100, Math.round((checkedWeightKg / CHECKED_LIMIT_KG) * 100)),
    carryon_utilization_pct: Math.min(100, Math.round((carryonWeightKg / CARRYON_LIMIT_KG) * 100)),
    by_category: byCategory
  };
}

function safeItem(row) {
  return {
    id: row.id,
    journey_id: row.journey_id,
    user_id: row.user_id,
    category: row.category,
    name: row.name,
    quantity: row.quantity,
    weight_grams: row.weight_grams,
    is_packed: row.is_packed === 1,
    is_shared: row.is_shared === 1,
    assigned_to: row.assigned_to || '',
    bag_type: row.bag_type || 'checked',
    notes: row.notes || '',
    sort_order: row.sort_order || 0,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

export async function handlePacking(context, url, method) {
  const { env, user, request } = context;
  const parts = url.pathname.split('/').filter(Boolean);
  const idx = parts.indexOf('packing');
  const pathId = idx !== -1 ? (parts[idx + 1] || null) : null;

  try {
    if (!env.DB) return json({ error: 'Database not available' }, 503);
    await ensureTable(env.DB);

    const journeyId = url.searchParams.get('journey_id') || url.searchParams.get('journeyId') || 'poland-christmas-2026';

    // --- GET /api/wayfinder/packing ---
    if (method === 'GET') {
      const rows = await env.DB.prepare(
        `SELECT * FROM wayfinder_packing_items 
         WHERE journey_id = ? AND (user_id = ? OR is_shared = 1)
         ORDER BY sort_order ASC, category ASC, created_at ASC`
      ).bind(journeyId, user.userId).all();

      const items = (rows.results || []).map(safeItem);
      const stats = computeStats(items);

      return json({
        journey_id: journeyId,
        items,
        stats,
        preset_available: POLAND_WINTER_2026_PRESET.length
      });
    }

    // --- POST /api/wayfinder/packing ---
    if (method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const action = body.action || '';

      // Action: Apply Poland Winter 2026 Preset
      if (action === 'apply_preset') {
        const statements = [];
        let sortOrder = 0;

        for (const presetItem of POLAND_WINTER_2026_PRESET) {
          const id = generateId();
          statements.push(
            env.DB.prepare(
              `INSERT INTO wayfinder_packing_items 
               (id, journey_id, user_id, category, name, quantity, weight_grams, is_packed, is_shared, assigned_to, bag_type, notes, sort_order)
               VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, '', ?, ?, ?)`
            ).bind(
              id,
              journeyId,
              user.userId,
              presetItem.category,
              presetItem.name,
              presetItem.quantity,
              presetItem.weight_grams,
              presetItem.bag_type,
              presetItem.notes,
              sortOrder++
            )
          );
        }

        if (statements.length > 0) {
          await env.DB.batch(statements);
        }

        const freshRows = await env.DB.prepare(
          `SELECT * FROM wayfinder_packing_items 
           WHERE journey_id = ? AND (user_id = ? OR is_shared = 1)
           ORDER BY sort_order ASC, category ASC, created_at ASC`
        ).bind(journeyId, user.userId).all();

        const items = (freshRows.results || []).map(safeItem);
        return json({
          success: true,
          message: `Added ${POLAND_WINTER_2026_PRESET.length} winter expedition packing items.`,
          items,
          stats: computeStats(items)
        });
      }

      // Action: Clear All Packed Items
      if (action === 'clear_packed') {
        await env.DB.prepare(
          `DELETE FROM wayfinder_packing_items WHERE journey_id = ? AND user_id = ? AND is_packed = 1`
        ).bind(journeyId, user.userId).run();

        const freshRows = await env.DB.prepare(
          `SELECT * FROM wayfinder_packing_items 
           WHERE journey_id = ? AND (user_id = ? OR is_shared = 1)
           ORDER BY sort_order ASC, category ASC, created_at ASC`
        ).bind(journeyId, user.userId).all();

        const items = (freshRows.results || []).map(safeItem);
        return json({ success: true, items, stats: computeStats(items) });
      }

      // Action: Toggle All Packed State
      if (action === 'toggle_all') {
        const targetState = body.is_packed ? 1 : 0;
        const targetCategory = body.category;

        if (targetCategory) {
          await env.DB.prepare(
            `UPDATE wayfinder_packing_items SET is_packed = ?, updated_at = datetime('now')
             WHERE journey_id = ? AND user_id = ? AND category = ?`
          ).bind(targetState, journeyId, user.userId, targetCategory).run();
        } else {
          await env.DB.prepare(
            `UPDATE wayfinder_packing_items SET is_packed = ?, updated_at = datetime('now')
             WHERE journey_id = ? AND user_id = ?`
          ).bind(targetState, journeyId, user.userId).run();
        }

        const freshRows = await env.DB.prepare(
          `SELECT * FROM wayfinder_packing_items 
           WHERE journey_id = ? AND (user_id = ? OR is_shared = 1)
           ORDER BY sort_order ASC, category ASC, created_at ASC`
        ).bind(journeyId, user.userId).all();

        const items = (freshRows.results || []).map(safeItem);
        return json({ success: true, items, stats: computeStats(items) });
      }

      // Default: Create Single Packing Item
      const name = (body.name || '').trim();
      if (!name) return json({ error: 'Item name is required' }, 400);

      const id = generateId();
      const category = body.category || 'clothing';
      const quantity = Math.max(1, parseInt(body.quantity, 10) || 1);
      const weightGrams = Math.max(0, parseInt(body.weight_grams, 10) || 0);
      const bagType = body.bag_type || 'checked';
      const isShared = body.is_shared ? 1 : 0;
      const assignedTo = (body.assigned_to || '').trim();
      const notes = (body.notes || '').trim();

      await env.DB.prepare(
        `INSERT INTO wayfinder_packing_items
         (id, journey_id, user_id, category, name, quantity, weight_grams, is_packed, is_shared, assigned_to, bag_type, notes, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, 999)`
      ).bind(id, journeyId, user.userId, category, name, quantity, weightGrams, isShared, assignedTo, bagType, notes).run();

      const created = await env.DB.prepare('SELECT * FROM wayfinder_packing_items WHERE id = ?').bind(id).first();
      return json({ success: true, item: safeItem(created) }, 201);
    }

    // --- PUT /api/wayfinder/packing/:id ---
    if (method === 'PUT') {
      if (!pathId) return json({ error: 'Item ID required' }, 400);
      const body = await request.json().catch(() => ({}));

      const existing = await env.DB.prepare(
        'SELECT * FROM wayfinder_packing_items WHERE id = ? AND (user_id = ? OR is_shared = 1)'
      ).bind(pathId, user.userId).first();

      if (!existing) return json({ error: 'Item not found or permission denied' }, 404);

      const isPacked = body.is_packed !== undefined ? (body.is_packed ? 1 : 0) : existing.is_packed;
      const name = body.name !== undefined ? body.name.trim() : existing.name;
      const category = body.category !== undefined ? body.category : existing.category;
      const quantity = body.quantity !== undefined ? Math.max(1, parseInt(body.quantity, 10) || 1) : existing.quantity;
      const weightGrams = body.weight_grams !== undefined ? Math.max(0, parseInt(body.weight_grams, 10) || 0) : existing.weight_grams;
      const bagType = body.bag_type !== undefined ? body.bag_type : existing.bag_type;
      const isShared = body.is_shared !== undefined ? (body.is_shared ? 1 : 0) : existing.is_shared;
      const assignedTo = body.assigned_to !== undefined ? body.assigned_to.trim() : existing.assigned_to;
      const notes = body.notes !== undefined ? body.notes.trim() : existing.notes;
      const sortOrder = body.sort_order !== undefined ? parseInt(body.sort_order, 10) : existing.sort_order;

      await env.DB.prepare(
        `UPDATE wayfinder_packing_items 
         SET name = ?, category = ?, quantity = ?, weight_grams = ?, is_packed = ?, is_shared = ?, 
             assigned_to = ?, bag_type = ?, notes = ?, sort_order = ?, updated_at = datetime('now')
         WHERE id = ?`
      ).bind(name, category, quantity, weightGrams, isPacked, isShared, assignedTo, bagType, notes, sortOrder, pathId).run();

      const updated = await env.DB.prepare('SELECT * FROM wayfinder_packing_items WHERE id = ?').bind(pathId).first();
      return json({ success: true, item: safeItem(updated) });
    }

    // --- DELETE /api/wayfinder/packing/:id ---
    if (method === 'DELETE') {
      if (!pathId) return json({ error: 'Item ID required' }, 400);

      const existing = await env.DB.prepare(
        'SELECT * FROM wayfinder_packing_items WHERE id = ? AND (user_id = ? OR is_shared = 1)'
      ).bind(pathId, user.userId).first();

      if (!existing) return json({ error: 'Item not found or permission denied' }, 404);

      await env.DB.prepare('DELETE FROM wayfinder_packing_items WHERE id = ?').bind(pathId).run();
      return json({ success: true, deleted_id: pathId });
    }

    return json({ error: `Method ${method} not allowed` }, 405);
  } catch (err) {
    console.error('[packing] error:', err);
    return json({ error: 'Internal server error', details: err.message }, 500);
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
