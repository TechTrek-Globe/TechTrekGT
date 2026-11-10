// Normalized Relational Storage Utility for Outpost Tracker (outpost-db)
// Security Mandate: All database operations MUST use strict positional '?' bindings (FIN-AUDIT-001).
//
// @deprecated - Zero callers across application. JSON-blob strategy on auction_items.attributes
// is canonical. These normalized child tables (auction_item_images, auction_item_specs,
// auction_item_platform_listings, ebay_reconciliation_fee_lines) remain empty in production.
// Retained as dormant stub for future relational migrations; do not remove or call on hot path.

/**
 * Builds D1 prepared statements to decompose attributes (images, specs, features)
 * and cross-platform listing IDs into normalized relational tables.
 */
export function buildItemMediaAndSpecsStatements(db, userId, itemId, rawAttributes, rawOtherPlatformIds) {
  const stmts = [];
  if (!db || !userId || !itemId) return stmts;

  let attributes = rawAttributes;
  if (typeof attributes === 'string') {
    try {
      attributes = JSON.parse(attributes);
    } catch {
      attributes = {};
    }
  }
  if (!attributes || typeof attributes !== 'object') {
    attributes = {};
  }

  // 1. Multi-image gallery normalization
  const candidateImages = Array.isArray(attributes.image_urls)
    ? attributes.image_urls
    : (Array.isArray(attributes.images) ? attributes.images : []);

  if (candidateImages.length > 0) {
    stmts.push(db.prepare('DELETE FROM auction_item_images WHERE item_id = ?').bind(itemId));
    for (let i = 0; i < candidateImages.length; i++) {
      const url = typeof candidateImages[i] === 'string' ? candidateImages[i].trim() : '';
      if (!url) continue;
      const isPrimary = i === 0 ? 1 : 0;
      stmts.push(
        db.prepare(
          `INSERT INTO auction_item_images (
            item_id, user_id, sort_order, image_url, is_primary
          ) VALUES (?, ?, ?, ?, ?)`
        ).bind(itemId, userId, i, url, isPrimary)
      );
    }
  }

  // 2. Item Specifics / Aspects normalization
  const candidateSpecs = attributes.specs && typeof attributes.specs === 'object'
    ? attributes.specs
    : (attributes.aspects && typeof attributes.aspects === 'object' ? attributes.aspects : null);

  if (candidateSpecs && !Array.isArray(candidateSpecs)) {
    stmts.push(db.prepare("DELETE FROM auction_item_specs WHERE item_id = ? AND spec_type = 'aspect'").bind(itemId));
    let sortOrder = 0;
    for (const [key, val] of Object.entries(candidateSpecs)) {
      if (val === undefined || val === null) continue;
      const specKey = String(key).trim();
      const specVal = typeof val === 'object' ? JSON.stringify(val) : String(val).trim();
      if (!specKey) continue;
      stmts.push(
        db.prepare(
          `INSERT INTO auction_item_specs (
            item_id, user_id, spec_type, spec_key, spec_value, sort_order
          ) VALUES (?, ?, 'aspect', ?, ?, ?)`
        ).bind(itemId, userId, specKey, specVal, sortOrder++)
      );
    }
  }

  // 3. Bullet feature points normalization
  const candidateFeatures = Array.isArray(attributes.features)
    ? attributes.features
    : (Array.isArray(attributes.bullet_points) ? attributes.bullet_points : []);

  if (candidateFeatures.length > 0) {
    stmts.push(db.prepare("DELETE FROM auction_item_specs WHERE item_id = ? AND spec_type = 'feature'").bind(itemId));
    for (let i = 0; i < candidateFeatures.length; i++) {
      const feat = typeof candidateFeatures[i] === 'string' ? candidateFeatures[i].trim() : '';
      if (!feat) continue;
      stmts.push(
        db.prepare(
          `INSERT INTO auction_item_specs (
            item_id, user_id, spec_type, spec_key, spec_value, sort_order
          ) VALUES (?, ?, 'feature', ?, ?, ?)`
        ).bind(itemId, userId, `feature_${i}`, feat, i)
      );
    }
  }

  // 4. Cross-platform listing identifiers normalization
  let otherPlatformIds = rawOtherPlatformIds;
  if (typeof otherPlatformIds === 'string') {
    try {
      otherPlatformIds = JSON.parse(otherPlatformIds);
    } catch {
      otherPlatformIds = null;
    }
  }

  if (otherPlatformIds && typeof otherPlatformIds === 'object') {
    stmts.push(db.prepare('DELETE FROM auction_item_platform_listings WHERE item_id = ?').bind(itemId));
    if (Array.isArray(otherPlatformIds)) {
      for (const entry of otherPlatformIds) {
        if (!entry || typeof entry !== 'object') continue;
        const platform = String(entry.platform || entry.platform_name || '').trim();
        const externalId = String(entry.id || entry.external_listing_id || '').trim();
        const url = entry.url || entry.listing_url || null;
        if (platform && externalId) {
          stmts.push(
            db.prepare(
              `INSERT INTO auction_item_platform_listings (
                item_id, user_id, platform_name, external_listing_id, listing_url, status
              ) VALUES (?, ?, ?, ?, ?, 'Listed')`
            ).bind(itemId, userId, platform, externalId, url)
          );
        }
      }
    } else {
      for (const [platform, externalIdVal] of Object.entries(otherPlatformIds)) {
        if (!externalIdVal) continue;
        const platformName = String(platform).trim();
        const externalId = String(externalIdVal).trim();
        if (platformName && externalId) {
          stmts.push(
            db.prepare(
              `INSERT INTO auction_item_platform_listings (
                item_id, user_id, platform_name, external_listing_id, listing_url, status
              ) VALUES (?, ?, ?, ?, NULL, 'Listed')`
            ).bind(itemId, userId, platformName, externalId)
          );
        }
      }
    }
  }

  return stmts;
}

/**
 * Reconstructs normalized media, specs, features, and external platform IDs
 * for an inventory item.
 */
export async function getItemMediaAndSpecs(db, itemId) {
  if (!db || !itemId) {
    return { image_urls: [], specs: {}, features: [], other_platform_listing_ids: {} };
  }

  try {
    const [imagesRes, specsRes, listingsRes] = await Promise.all([
      db.prepare('SELECT image_url FROM auction_item_images WHERE item_id = ? ORDER BY sort_order ASC').bind(itemId).all().catch(() => ({ results: [] })),
      db.prepare('SELECT spec_type, spec_key, spec_value FROM auction_item_specs WHERE item_id = ? ORDER BY sort_order ASC').bind(itemId).all().catch(() => ({ results: [] })),
      db.prepare('SELECT platform_name, external_listing_id FROM auction_item_platform_listings WHERE item_id = ?').bind(itemId).all().catch(() => ({ results: [] }))
    ]);

    const imageUrls = (imagesRes?.results || []).map((r) => r.image_url);
    const specs = {};
    const features = [];

    for (const row of specsRes?.results || []) {
      if (row.spec_type === 'aspect') {
        specs[row.spec_key] = row.spec_value;
      } else if (row.spec_type === 'feature') {
        features.push(row.spec_value);
      }
    }

    const otherPlatformIds = {};
    for (const row of listingsRes?.results || []) {
      otherPlatformIds[row.platform_name] = row.external_listing_id;
    }

    return {
      image_urls: imageUrls,
      specs,
      features,
      other_platform_listing_ids: otherPlatformIds
    };
  } catch {
    return { image_urls: [], specs: {}, features: [], other_platform_listing_ids: {} };
  }
}

