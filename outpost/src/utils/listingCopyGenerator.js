import { getCertVerificationUrl } from './certLookup.js';
import { generateEbayListingHtml, wrapEbayFullTemplate, stripInternalTrackingNotes, escapeHtml, sanitizeListingHtml } from './ebayTemplate.js';
import {
  SUPPORTED_PLATFORMS,
  PLATFORM_RULES_REGISTRY,
  getPlatformRules,
  computeUtf16Length,
  buildPlatformPayload,
  validatePlatformPayload,
  normalizeListingTitleTokens
} from './platformListingRules.js';

export {
  generateEbayListingHtml,
  stripInternalTrackingNotes,
  escapeHtml,
  sanitizeListingHtml,
  SUPPORTED_PLATFORMS,
  PLATFORM_RULES_REGISTRY,
  getPlatformRules,
  computeUtf16Length,
  buildPlatformPayload,
  validatePlatformPayload
};

/**
 * Generate multi-channel formatted listing copy for sports cards, memorabilia, and general/Amazon inventory.
 */

export function generateEbayCopy(item = {}, options = {}) {
  let platformPayload = null;
  let platformValidation = null;
  if (options.enforcePlatformRules) {
    const built = buildPlatformPayload('ebay', item, options);
    platformPayload = built.payload;
    platformValidation = built.validation;
  }
  const athlete = (options.athlete || item.athlete_person || '').trim();
  const category = (options.category || item.category || 'General').trim();
  const rawAuth = (options.authenticator || item.authenticator || '').trim();
  const certNumber = (options.certNumber || item.cert_number) ? String(options.certNumber || item.cert_number).trim() : '';
  const isCertified = Boolean(rawAuth && !['Raw', 'Uncertified', 'None', 'Other', 'N/A'].includes(rawAuth));
  const authenticator = isCertified ? rawAuth : '';
  const certUrl = (isCertified && certNumber) ? getCertVerificationUrl(authenticator, certNumber) : null;
  const isAutographed = Boolean(athlete || isCertified || options.inscription || item.inscription);

  const titleInput = (options.title || item.item_name || '').trim();
  const brand = (options.brand || '').trim();
  const productType = (options.productType || '').trim();
  const subtitle = (options.subtitle || (isAutographed
    ? `${authenticator ? `${authenticator} Authenticated` : 'Authentic Autograph'}${certNumber ? ` | Cert #${certNumber}` : ''}${item.inscription ? ` | "${item.inscription}"` : ''}`
    : `${category ? `${category}` : ''}${athlete ? ` | ${athlete}` : ''}`)).trim();

  const condition = options.condition || 'Brand New / Excellent';
  const isNew = condition.toLowerCase().includes('brand new') || condition.toLowerCase().includes('new');
  const conditionHeader = (options.conditionHeader || (isAutographed ? 'AUTHENTIC SIGNED MEMORABILIA' : (isNew ? 'BRAND NEW IN ORIGINAL UNOPENED BOX' : `${condition.toUpperCase()}`))).trim();
  const conditionSubheader = (options.conditionSubheader || (isAutographed ? 'Guaranteed Authentic • Smoke-Free Collection' : (isNew ? 'Never installed or used • Original Condition' : 'Carefully inspected and stored'))).trim();

  const shippingPolicy = options.shippingPolicy || 'Ships securely in bubble mailer / box with tracking within 1 business day.';
  const returnPolicy = options.returnPolicy || '30-Day Returns accepted if item is in original unaltered condition.';

  // Feature Bullet Points
  let features = [];
  if (Array.isArray(options.features)) {
    features = options.features.filter(Boolean);
  } else if (typeof options.features === 'string' && options.features.trim()) {
    features = options.features.split('\n').map(s => s.trim().replace(/^[-•*]\s*/, '')).filter(Boolean);
  }

  // Specifications
  let specs = [];
  if (Array.isArray(options.specs)) {
    specs = options.specs.filter(s => s && s.label && s.value);
  } else if (options.specs && typeof options.specs === 'object') {
    specs = Object.entries(options.specs).map(([label, value]) => ({ label, value: String(value) }));
  }

  // Vehicle Compatibility
  let compatibility = [];
  if (Array.isArray(options.compatibility)) {
    compatibility = options.compatibility.filter(c => c && c.label && c.value);
  } else if (options.compatibility && typeof options.compatibility === 'object') {
    compatibility = Object.entries(options.compatibility).map(([label, value]) => ({ label, value: String(value) }));
  }

  // Optimized eBay Title (80 character max)
  let title = platformPayload?.title || normalizeListingTitleTokens(titleInput, item, options);
  if (!platformPayload) {
    if (isCertified && authenticator && !title.toLowerCase().includes(authenticator.toLowerCase())) {
      title += ` ${authenticator}`;
    }
    if (certNumber && !title.includes(certNumber)) {
      title += ` #${certNumber}`;
    }
    title = normalizeListingTitleTokens(title, item, options);
    if (title.length > 80) {
      const truncated = title.substring(0, 80);
      const lastSpace = truncated.lastIndexOf(' ');
      title = (lastSpace > 40 ? truncated.substring(0, lastSpace) : truncated).trim();
    }
  }

  // Plain Text Version
  const textLines = [
    `ITEM: ${titleInput}`
  ];
  if (brand) {
    textLines.push(`BRAND: ${brand}`);
  }
  if (productType) {
    textLines.push(`PRODUCT TYPE: ${productType}`);
  }
  if (athlete) {
    textLines.push(`ATHLETE / SUBJECT: ${athlete}`);
  }
  if (category) {
    textLines.push(`CATEGORY: ${category}`);
  }
  if (isCertified || certNumber) {
    textLines.push(`AUTHENTICATION: ${authenticator || 'Certified'}${certNumber ? ` (Cert #${certNumber})` : ''}`);
  }
  if (certUrl) {
    textLines.push(`OFFICIAL CERT VERIFICATION: ${certUrl}`);
  }
  textLines.push('', `CONDITION: ${condition}`, '');

  if (features.length > 0) {
    textLines.push('KEY FEATURES:');
    features.forEach(f => textLines.push(`- ${f}`));
    textLines.push('');
  }

  const rawDescription = (options.description || options.notes || item.description || item.notes || '').trim();
  const cleanDescription = stripInternalTrackingNotes(rawDescription);

  if (cleanDescription) {
    textLines.push('ITEM DESCRIPTION:', cleanDescription, '');
  } else if (isAutographed) {
    textLines.push(
      'ABOUT THIS PIECE:',
      '- 100% Guaranteed Authentic signed piece from a smoke-free collection.',
      certNumber && isCertified ? `- Certified and recorded under ${authenticator} database.` : null,
      '- Photos show the exact item you will receive.',
      ''
    );
  } else {
    textLines.push(
      'ABOUT THIS ITEM:',
      `- 100% Genuine, authentic ${brand ? `${brand} ` : ''}item in ${condition.toLowerCase()} condition.`,
      '- Photos show the exact item you will receive.',
      ''
    );
  }

  textLines.push(
    'SHIPPING & HANDLING:',
    `- ${shippingPolicy}`,
    '- Packaged with extreme care for safe arrival.',
    '',
    'RETURN POLICY:',
    `- ${returnPolicy}`,
    '',
    'Thank you for viewing TechTrek Outpost inventory!'
  );
  const textBody = textLines.filter(line => line !== null).join('\n');

  const inscription = options.inscription || item.inscription || '';
  const authType = options.authType || item.auth_type || authenticator;
  const additionalDescription = cleanDescription || stripInternalTrackingNotes(item.additional_description || '');

  // Build Item Details Table Rows
  const itemDetailsRows = [];
  if (brand) {
    itemDetailsRows.push({ label: 'Brand', value: brand });
  }
  if (productType) {
    itemDetailsRows.push({ label: 'Product Type', value: productType });
  } else {
    itemDetailsRows.push({ label: 'Item', value: titleInput });
  }
  if (category) {
    itemDetailsRows.push({ label: 'Category', value: category });
  }
  if (condition) {
    itemDetailsRows.push({ label: 'Condition', value: condition });
  }
  if (athlete) {
    itemDetailsRows.push({ label: 'Player / Subject', value: athlete });
  }
  if (isAutographed && athlete) {
    itemDetailsRows.push({ label: 'Signature', value: `Hand-signed by ${athlete}` });
  }
  if (inscription) {
    itemDetailsRows.push({ label: 'Inscription', value: `"${inscription}"` });
  }
  if (isCertified || certNumber) {
    itemDetailsRows.push({ label: 'Authentication', value: `${authType || authenticator || 'Certified'}${certNumber ? ` (Cert #${certNumber})` : ''}` });
  }
  // Add any custom specs not already included
  specs.forEach(s => {
    if (!itemDetailsRows.some(r => r.label.toLowerCase() === s.label.toLowerCase())) {
      itemDetailsRows.push({ label: s.label, value: s.value });
    }
  });

  const tableRowsHtml = itemDetailsRows.map(r => `      <tr>
        <td style="width: 34%; padding: 11px; background-color: rgb(247, 242, 232); color: rgb(17, 17, 17); border: 1px solid rgb(214, 181, 109); font-weight: bold; vertical-align: top;">
          ${escapeHtml(r.label)}
        </td>
        <td style="padding: 11px; background-color: rgb(255, 255, 255); color: rgb(17, 17, 17); border: 1px solid rgb(221, 221, 221); vertical-align: top;">
          ${escapeHtml(r.value)}
        </td>
      </tr>`).join('\n');

  // Generate modular card layout (between delimiters), reusing platformPayload HTML when enforced
  const insertHtml = platformPayload?.insert_html || generateEbayListingHtml({
    ...item,
    title,
    description: cleanDescription || additionalDescription,
    condition,
    conditionHeader: options.conditionHeader,
    conditionSubheader: options.conditionSubheader,
    conditionDetails: options.conditionHeader && options.conditionSubheader
      ? `${options.conditionHeader}: ${options.conditionSubheader}`
      : (condition ? `${condition}. Please review all photos carefully for the exact condition, quality, and details.` : undefined),
    brand: (options.isCustomJersey || item.is_custom_jersey || platformPayload?.item_specifics?.Brand === 'Unbranded') ? 'Unbranded' : brand,
    model: options.model || (specs.find(s => s.label.toLowerCase() === 'model')?.value || item.model || ''),
    productType: productType || item.product_type || category,
    category,
    sportOrGenre: options.sportOrGenre || item.sport_genre || '',
    athlete,
    teamOrBand: options.teamOrBand || item.team_or_band || '',
    inscription,
    size: options.size || item.size || '',
    isWearable: options.isWearable ?? item.is_wearable,
    isCustomJersey: options.isCustomJersey ?? item.is_custom_jersey,
    isPickguardSignedGuitar: options.isPickguardSignedGuitar ?? item.is_pickguard_guitar,
    specs,
    features,
    authentication: (isCertified && certNumber) ? {
      provider: authenticator,
      certNumber,
      type: authType || (athlete ? `Witnessed (${athlete})` : 'Witnessed'),
      verificationUrl: null
    } : null,
    includedItems: options.includedInSale ? [options.includedInSale] : [],
    aiGeneratedMiddleSection: options.aiGeneratedMiddleSection || item.aiGeneratedMiddleSection || ''
  });

  // Full HTML Preview (includes Schema.org Product wrapper, header banner, delimiters, middle insertHtml, and compact footer)
  const htmlBody = platformPayload?.description_html || wrapEbayFullTemplate(insertHtml, options);

  if (platformPayload) {
    platformPayload.description_html = htmlBody;
    platformPayload.insert_html = insertHtml;
    platformPayload.description_plain_text = textBody;
  }

  const rawPrice = options.price ?? item.current_list_price ?? item.suggested_list_price ?? item.min_sell_price ?? item.unit_price ?? 0;
  const numPrice = Number(rawPrice) || 0;
  const priceFormatted = numPrice > 0 ? `$${numPrice.toFixed(2)}` : '';

  return {
    title,
    subtitle,
    price: priceFormatted,
    textBody,
    htmlBody,
    insertHtml,
    itemDetailsRows,
    tableRowsHtml,
    payload: platformPayload,
    validation: platformValidation
  };
}

export function generateFacebookCopy(item = {}, options = {}) {
  if (options.enforcePlatformRules) {
    const { payload, validation } = buildPlatformPayload('facebook', item, options);
    const listPrice = payload.pricing_guidance?.suggested_list_price ?? 0;
    return {
      title: payload.title,
      relistTitle: payload.relist_title,
      price: `$${Number(listPrice).toFixed(2)}`,
      description: payload.description_plain_text,
      textBody: payload.description_plain_text,
      payload,
      validation
    };
  }
  const titleInput = (options.title || item.item_name || '').trim();
  const brand = (options.brand || '').trim();
  const condition = options.condition || item.condition || 'Brand New / Excellent';
  const athlete = (options.athlete || item.athlete_person || '').trim();
  const rawAuth = (options.authenticator || item.authenticator || '').trim();
  const certNumber = (options.certNumber || item.cert_number) ? String(options.certNumber || item.cert_number).trim() : '';
  const isCertified = Boolean(rawAuth && !['Raw', 'Uncertified', 'None', 'Other', 'N/A'].includes(rawAuth));
  const authenticator = isCertified ? rawAuth : '';

  // Calculate or format asking price
  const rawPrice = options.localPrice ?? options.price ?? item.current_list_price ?? item.suggested_list_price ?? item.unit_price ?? 0;
  const numPrice = Number(rawPrice) || 0;
  const priceFormatted = numPrice > 0 ? `$${numPrice.toFixed(0)}` : '';
  const priceExact = numPrice > 0 ? `$${numPrice.toFixed(2)}` : '$0.00';

  // Optimized Facebook Marketplace Title (up to 100 chars, readable)
  let title = titleInput;
  if (brand && !title.toLowerCase().includes(brand.toLowerCase())) {
    title = `${brand} - ${title}`;
  }
  if (condition.toLowerCase().includes('brand new') && !title.toLowerCase().includes('new')) {
    title = `${title} (New)`;
  }
  if (title.length > 100) {
    const truncated = title.substring(0, 100);
    const lastSpace = truncated.lastIndexOf(' ');
    title = (lastSpace > 50 ? truncated.substring(0, lastSpace) : truncated).trim();
  }

  // Feature Bullet Points
  let features = [];
  if (Array.isArray(options.features)) {
    features = options.features.filter(Boolean);
  } else if (typeof options.features === 'string' && options.features.trim()) {
    features = options.features.split('\n').map(s => s.trim().replace(/^[-•*]\s*/, '')).filter(Boolean);
  }

  const rawDescription = (options.description || options.notes || item.description || item.notes || '').trim();
  const cleanDescription = stripInternalTrackingNotes(rawDescription);

  const pickupLocation = options.pickupLocation || 'Public meeting location / local pickup';
  const paymentTerms = options.paymentTerms || 'Cash, Venmo, or Zelle accepted upon pickup';

  const bodyLines = [
    titleInput,
    priceFormatted ? `Price: ${priceFormatted} (${priceExact})` : null,
    `Condition: ${condition}`,
    ''
  ];

  if (athlete) {
    bodyLines.push(`Athlete / Subject: ${athlete}`);
  }
  if (isCertified || certNumber) {
    bodyLines.push(`Authentication: ${authenticator || 'Certified'}${certNumber ? ` (Cert #${certNumber})` : ''}`);
    bodyLines.push('100% Guaranteed authentic.');
  }

  if (features.length > 0) {
    bodyLines.push('', 'Highlights & Features:');
    features.forEach(f => bodyLines.push(`• ${f}`));
  }

  if (cleanDescription) {
    bodyLines.push('', 'Details:', cleanDescription);
  }

  bodyLines.push(
    '',
    'Local Pickup & Terms:',
    `• ${pickupLocation}`,
    `• ${paymentTerms}`,
    '• First come, first served. Serious inquiries only. No trades.',
    '',
    'Feel free to message with any questions. Thanks for looking!'
  );

  const textBody = bodyLines.filter(line => line !== null).join('\n');
  const description = textBody;

  return { title, price: priceExact, description, textBody };
}

export function generateWhatnotCopy(item = {}, options = {}) {
  if (options.enforcePlatformRules) {
    const { payload, validation } = buildPlatformPayload('whatnot', item, options);
    return {
      title: payload.title,
      notes: payload.description_plain_text,
      payload,
      validation
    };
  }
  const titleInput = (options.title || item.item_name || '').trim();
  const athlete = (options.athlete || item.athlete_person || '').trim();
  const rawAuth = (options.authenticator || item.authenticator || '').trim();
  const isCertified = Boolean(rawAuth && !['Raw', 'Uncertified', 'None', 'Other', 'N/A'].includes(rawAuth));
  const authenticator = isCertified ? rawAuth : '';
  const cert = (options.certNumber || item.cert_number) ? `Cert #${options.certNumber || item.cert_number}` : '';
  const brand = (options.brand || '').trim();

  const title = `${titleInput}${authenticator ? ` ${authenticator}` : ''}`.trim();
  const customNotes = stripInternalTrackingNotes(options.notes || options.description || '');
  const notes = [
    `🔥 ${titleInput}`,
    brand ? `🏷️ Brand: ${brand}` : null,
    athlete ? `⭐ Athlete: ${athlete}` : null,
    item.category ? `📦 Category: ${item.category}` : null,
    (authenticator || cert) ? `🛡️ Auth: ${authenticator || 'Certified'} ${cert}`.trim() : null,
    customNotes || null,
    `📦 Ships next-day securely packed!`
  ].filter(Boolean).join('\n');

  return { title, notes };
}

export function generateMercariCopy(item = {}, options = {}) {
  if (options.enforcePlatformRules) {
    const { payload, validation } = buildPlatformPayload('mercari', item, options);
    return {
      title: payload.title,
      description: payload.description_plain_text,
      hashtags: (payload.hashtags || []).join(' '),
      payload,
      validation
    };
  }
  const titleInput = (options.title || item.item_name || '').trim();
  const athlete = (options.athlete || item.athlete_person || '').trim();
  const rawAuth = (options.authenticator || item.authenticator || '').trim();
  const isCertified = Boolean(rawAuth && !['Raw', 'Uncertified', 'None', 'Other', 'N/A'].includes(rawAuth));
  const authenticator = isCertified ? rawAuth : '';
  const certNumber = (options.certNumber || item.cert_number) ? `#${options.certNumber || item.cert_number}` : '';
  const brand = (options.brand || '').trim();
  const cleanDesc = stripInternalTrackingNotes(options.description || '');

  let title = `${titleInput}${authenticator ? ` ${authenticator}` : ''}${certNumber ? ` ${certNumber}` : ''}`.trim();
  if (title.length > 80) title = title.substring(0, 80).trim();

  const cleanTags = [
    item.category,
    brand ? brand.replace(/\s+/g, '') : '',
    athlete ? athlete.replace(/\s+/g, '') : '',
    authenticator,
    athlete ? 'Memorabilia' : 'Retail',
    athlete ? 'Autograph' : ''
  ].filter(Boolean);

  const hashtags = cleanTags.map(t => `#${t}`).join(' ');

  const descriptionLines = [
    titleInput,
    ''
  ];
  if (cleanDesc) descriptionLines.push(cleanDesc, '');
  if (brand) descriptionLines.push(`Brand: ${brand}`);
  if (athlete) descriptionLines.push(`Athlete / Subject: ${athlete}`);
  if (item.category) descriptionLines.push(`Category: ${item.category}`);
  if (authenticator || certNumber) descriptionLines.push(`Authentication: ${authenticator || 'Certified'} ${certNumber}`.trim());
  descriptionLines.push(
    'Condition: Excellent, exactly as pictured.',
    'Fast & secure shipping with tracking.',
    ''
  );
  if (hashtags) descriptionLines.push(hashtags);

  const description = descriptionLines.join('\n');
  return { title, description, hashtags };
}

export function generateSocialCopy(item, options = {}) {
  const titleInput = (options.title || item.item_name || '').trim();
  const athlete = (options.athlete || item.athlete_person || '').trim();
  const rawAuth = (options.authenticator || item.authenticator || '').trim();
  const isCertified = Boolean(rawAuth && !['Raw', 'Uncertified', 'None', 'Other', 'N/A'].includes(rawAuth));
  const authenticator = isCertified ? rawAuth : '';
  const certNumber = (options.certNumber || item.cert_number) ? `#${options.certNumber || item.cert_number}` : '';
  const brand = (options.brand || '').trim();
  const cleanDesc = stripInternalTrackingNotes(options.description || '');

  const tags = [
    'TechTrekOutpost',
    item.category?.replace(/\s+/g, ''),
    brand ? brand.replace(/\s+/g, '') : '',
    athlete ? athlete.replace(/[^a-zA-Z0-9]/g, '') : '',
    athlete ? 'TheHobby' : 'Deals',
    athlete ? 'AutographCollection' : 'OnlineShopping',
    authenticator
  ].filter(Boolean).map(t => `#${t}`).join(' ');

  const captionLines = [
    `🚨 AVAILABLE NOW: ${titleInput}`,
    ''
  ];
  if (cleanDesc) captionLines.push(cleanDesc, '');
  if (brand) captionLines.push(`🏷️ Brand: ${brand}`);
  if (athlete) captionLines.push(`⭐ Subject: ${athlete}`);
  if (item.category) captionLines.push(`📦 Category: ${item.category}`);
  if (authenticator || certNumber) captionLines.push(`🛡️ Certified by: ${authenticator || 'Certified'} ${certNumber}`.trim());
  captionLines.push(
    '💰 DM for pricing or link in bio to purchase!',
    '',
    '📦 Packed safe & shipped fast with tracking.',
    ''
  );
  if (tags) captionLines.push(tags);

  const caption = captionLines.join('\n');
  return { caption, tags };
}

export function generateReverbCopy(item = {}, options = {}) {
  const { payload, validation } = buildPlatformPayload('reverb', item, options);
  return {
    title: payload.title,
    htmlBody: payload.description_html,
    textBody: payload.description_html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
    payload,
    validation
  };
}

export function generatePlatformListing(platform = 'ebay', item = {}, options = {}) {
  const normPlatform = String(platform || 'ebay').toLowerCase().trim();
  return buildPlatformPayload(normPlatform, item, options);
}
