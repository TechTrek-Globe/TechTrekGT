/**
 * SKU Generation Utility for TechTrek Outpost
 * Generates unique, structured, human-readable SKUs formatted as OP-YYMMDD-XXXX
 * (e.g. OP-260901-A4F2)
 */

export function generateSku(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  const yy = String(d.getFullYear()).slice(-2);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  
  // 4-character random alphanumeric suffix (avoiding confusing chars like O/0, I/1)
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let rand = '';
  for (let i = 0; i < 4; i++) {
    rand += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  
  return `OP-${yy}${mm}${dd}-${rand}`;
}

/**
 * Generate a candidate SKU and verify uniqueness against the database for the given user.
 * If a collision is found, loops up to maxAttempts (default 5) to generate a non-colliding SKU.
 * Optionally tracks seenSkus (Set or Array) within an in-flight batch to prevent intra-batch duplicates.
 * An optional generatorFn can be supplied to facilitate deterministic testing of collision regeneration.
 *
 * @param {object} db - D1 Database binding
 * @param {string|number} userId - Authenticated user ID
 * @param {Date|string} [date] - Acquisition date or reference date
 * @param {number} [maxAttempts=5] - Maximum regeneration attempts before falling back
 * @param {Set<string>|Array<string>} [seenSkus=null] - Optional collection of SKUs already assigned in current batch
 * @param {Function} [generatorFn=generateSku] - SKU candidate generator function
 * @returns {Promise<string>} Unique SKU
 */
export async function generateUniqueSku(
  db,
  userId,
  date = new Date(),
  maxAttempts = 5,
  seenSkus = null,
  generatorFn = generateSku
) {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const candidate = generatorFn(date);

    // Check intra-batch collisions if a tracking set was passed
    const isSeen = seenSkus && (typeof seenSkus.has === 'function' ? seenSkus.has(candidate) : seenSkus.includes(candidate));
    if (isSeen) {
      continue;
    }

    // If no db or userId context, return candidate
    if (!db || !userId) {
      if (seenSkus) {
        if (typeof seenSkus.add === 'function') seenSkus.add(candidate);
        else seenSkus.push(candidate);
      }
      return candidate;
    }

    // Query DB for existing item with this SKU for the same user
    const existing = await db.prepare(
      'SELECT id FROM auction_items WHERE user_id = ? AND sku = ? LIMIT 1'
    ).bind(userId, candidate).first();

    if (!existing) {
      if (seenSkus) {
        if (typeof seenSkus.add === 'function') seenSkus.add(candidate);
        else seenSkus.push(candidate);
      }
      return candidate;
    }
  }

  // Fallback: If max attempts reached, append high-entropy suffix to guarantee uniqueness
  const fallback = `${generatorFn(date)}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
  if (seenSkus) {
    if (typeof seenSkus.add === 'function') seenSkus.add(fallback);
    else seenSkus.push(fallback);
  }
  return fallback;
}

