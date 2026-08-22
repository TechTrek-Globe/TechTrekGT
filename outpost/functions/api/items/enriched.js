import { requireAuth, withAuth, ok, err } from '../../utils/guard.js';
import { cleanItemName, cleanAthleteName } from '../../utils/auction.js';

/**
 * Parses the "Image: <url>" fragment out of the notes column.
 * AmazonItemModal stores notes as pipe-delimited: "Order ID: ... | ASIN: ... | Image: https://..."
 */
function parseImageFromNotes(notes) {
  if (!notes) return null;
  const match = String(notes).match(/\bImage:\s*(https?:\/\/[^\s|]+)/i);
  return match ? match[1].trim() : null;
}

/**
 * Parses a clean user-facing note by stripping the auto-injected Amazon meta tokens.
 */
function parseUserNote(notes) {
  if (!notes) return null;
  let cleaned = String(notes)
    .replace(/Order ID:\s*[\d-]+\s*\|?\s*/gi, '')
    .replace(/ASIN:\s*[A-Z0-9]{10}\s*\|?\s*/gi, '')
    .replace(/Image:\s*https?:\/\/[^\s|]+\s*\|?\s*/gi, '')
    .replace(/Imported from Amazon\s*/gi, '')
    .replace(/^\s*\|\s*|\s*\|\s*$/g, '')
    .trim();
  return cleaned || null;
}

function cleanEbaySearchQuery(itemName, athlete, authenticator) {
  let text = String(itemName || '').trim();

  text = text.replace(/^(?:item\s*#?|lot\s*#?|#)\s*\d{4,12}(?:\s*[-\u2013\u2014:]\s*|\s+)?/gi, '');
  text = text.replace(/^\d{5,12}\s*[-\u2013\u2014:]\s*/g, '');
  text = text.replace(/^\d{5,12}\s+/g, '');

  text = text.replace(/\bcompatible\s+(?:with\s+)?[\w\s,/&-]*/gi, '');
  text = text.replace(/\bfits?\s+(?:for\s+)?[\w\s,/&-]*/gi, '');
  text = text.replace(/\bfor\s+[A-Z][\w\s,/&-]*/g, '');
  text = text.replace(/\bwith\s+[A-Z][\w\s,/&-]*/g, '');

  text = text.replace(/\b(?!(?:19|20)\d{2})\d{4,}\b/g, '');
  text = text.replace(/\s+/g, ' ').trim();

  if (athlete && athlete.trim()) {
    const cleanAthlete = athlete.replace(/^\d{5,12}\s+/, '').trim();
    if (cleanAthlete && !text.toLowerCase().includes(cleanAthlete.toLowerCase())) {
      text = `${cleanAthlete} ${text}`;
    }
  }

  if (authenticator && authenticator.trim() && authenticator.toLowerCase() !== 'other') {
    const cleanAuth = authenticator.replace(/#.*$/, '').trim();
    if (cleanAuth && !text.toLowerCase().includes(cleanAuth.toLowerCase())) {
      text = `${text} ${cleanAuth}`;
    }
  }

  text = text.replace(/[^\w\s-]/g, '').replace(/\s+/g, ' ').trim();

  const words = text.split(' ').filter(w => w.length > 1);
  const uniqueWords = [];
  const seen = new Set();
  for (const w of words) {
    const lower = w.toLowerCase();
    if (!seen.has(lower)) {
      seen.add(lower);
      uniqueWords.push(w);
    }
    if (uniqueWords.length >= 12) break;
  }

  return uniqueWords.join(' ');
}

function buildEbaySearchUrl(itemName, athlete, authenticator) {
  const query = cleanEbaySearchQuery(itemName, athlete, authenticator);
  return `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(query)}&LH_Sold=1&LH_Complete=1`;
}

// ============================================================
// GET /api/items/enriched
//   Returns items with comp data pre-joined, paginated.
//   Query params: status, invoice_id, q, page, limit
// ============================================================

export async function onRequestGet(context) {
  const { request, env } = context;
  return withAuth(async () => {
    const payload = await requireAuth(request, env);
    if (!env.DB) return err('Database not available', 500);

    const url = new URL(request.url);
    const status     = url.searchParams.get('status') || '';
    const invoice_id = url.searchParams.get('invoice_id') || '';
    const q          = url.searchParams.get('q') || '';
    const page       = Math.max(1, parseInt(url.searchParams.get('page') || '1'));
    const limit      = Math.min(200, Math.max(1, parseInt(url.searchParams.get('limit') || '50')));
    const offset     = (page - 1) * limit;

    // Build dynamic WHERE clauses
    const conditions = ['i.user_id = ?'];
    const bindings   = [payload.userId];

    if (status) {
      if (status === 'active') {
        conditions.push("i.status IN ('Available', 'Listed')");
      } else {
        conditions.push('i.status = ?');
        bindings.push(status);
      }
    }
    if (invoice_id) { conditions.push('i.invoice_id = ?'); bindings.push(invoice_id); }
    if (q) {
      conditions.push('(i.item_name LIKE ? OR i.athlete_person LIKE ? OR i.category LIKE ? OR i.cert_number LIKE ? OR i.authenticator LIKE ?)');
      const like = `%${q}%`;
      bindings.push(like, like, like, like, like);
    }

    const whereClause = conditions.join(' AND ');

    const countRow = await env.DB.prepare(
      `SELECT COUNT(*) AS total FROM auction_items i WHERE ${whereClause}`
    ).bind(...bindings).first();

    const rows = await env.DB.prepare(`
      SELECT
        i.*,
        inv.invoice_ref,
        inv.discount  AS inv_discount,
        inv.shipping  AS inv_shipping,
        inv.tax       AS inv_tax,
        c.id          AS comp_id,
        c.comp_1,
        c.comp_2,
        c.comp_3,
        c.manual_avg,
        c.live_avg,
        c.ebay_search_url AS comp_ebay_search_url,
        c.recommended_list_price,
        c.updated_at  AS comp_updated_at
      FROM auction_items i
      LEFT JOIN auction_invoices inv ON inv.id = i.invoice_id
      LEFT JOIN auction_comps c ON i.id = c.item_id AND c.user_id = i.user_id
      WHERE ${whereClause}
      ORDER BY i.created_at DESC
      LIMIT ? OFFSET ?
    `).bind(...bindings, limit, offset).all();

    const enrichedItems = (rows.results || []).map(row => {
      const isAmazon = typeof row.invoice_ref === 'string' && row.invoice_ref.startsWith('AMAZON-');
      const imageUrl = parseImageFromNotes(row.notes);
      const userNote = parseUserNote(row.notes);
      const searchUrl = buildEbaySearchUrl(row.item_name, row.athlete_person, row.authenticator);

      return {
        ...row,
        item_name: cleanItemName(row.item_name),
        athlete_person: cleanAthleteName(row.athlete_person),
        ebay_search_url: searchUrl,
        image_url: imageUrl,
        user_note: userNote,
        is_amazon: isAmazon
      };
    });

    return ok({
      items: enrichedItems,
      pagination: {
        total: countRow?.total || 0,
        page,
        limit,
        pages: Math.ceil((countRow?.total || 0) / limit)
      }
    });
  });
}
