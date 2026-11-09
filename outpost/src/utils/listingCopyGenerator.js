import { getCertVerificationUrl } from './certLookup.js';
import { generateEbayListingHtml, stripInternalTrackingNotes } from './ebayTemplate.js';

export { generateEbayListingHtml, stripInternalTrackingNotes };

/**
 * Generate multi-channel formatted listing copy for sports cards, memorabilia, and general/Amazon inventory.
 */

export function generateEbayCopy(item, options = {}) {
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
  let title = titleInput;
  if (isCertified && authenticator && !title.includes(authenticator)) {
    title += ` ${authenticator}`;
  }
  if (certNumber && !title.includes(certNumber)) {
    title += ` #${certNumber}`;
  }
  if (title.length > 80) {
    title = title.substring(0, 80).trim();
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

  const rawDescription = (options.description || '').trim();
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
          ${r.label}
        </td>
        <td style="padding: 11px; background-color: rgb(255, 255, 255); color: rgb(17, 17, 17); border: 1px solid rgb(221, 221, 221); vertical-align: top;">
          ${r.value}
        </td>
      </tr>`).join('\n');

  // Generate modular dark-theme card layout (between delimiters)
  const insertHtml = generateEbayListingHtml({
    title: titleInput,
    description: cleanDescription || additionalDescription,
    conditionDetails: options.conditionHeader && options.conditionSubheader
      ? `${options.conditionHeader}: ${options.conditionSubheader}`
      : (condition ? `${condition}. Please review all photos carefully for the exact condition, quality, and details.` : undefined),
    brand,
    model: options.model || (specs.find(s => s.label.toLowerCase() === 'model')?.value || ''),
    features,
    authentication: (isCertified && certNumber) ? {
      provider: authenticator,
      certNumber,
      type: authType || (athlete ? `Witnessed (${athlete})` : 'Witnessed')
    } : null,
    includedItems: options.includedInSale ? [options.includedInSale] : [],
    aiGeneratedMiddleSection: options.aiGeneratedMiddleSection || item.aiGeneratedMiddleSection || ''
  });

  // Full HTML Preview (includes header banner, delimiters, middle insertHtml, and compact footer)
  const htmlBody = `<div style="max-width: 900px; margin: 0 auto; font-family: Arial, Helvetica, sans-serif; color: #222222; box-sizing: border-box; line-height: 1.5;">

  <!-- Header Banner -->
  <div style="width: 100%; margin-bottom: 20px; border-bottom: 2px solid #e5e5e5; padding-bottom: 12px; box-sizing: border-box;">
    <img src="https://i.ebayimg.com/images/g/fe4AAeSwSO1q8G1~/s-l1600.webp" alt="TechTrek Outpost" width="950" height="100" style="max-width: 100%; height: auto; display: block; margin: 0 auto; border-radius: 4px;">
  </div>

  <!-- Content Container -->
  <div style="font-size: 15px; color: #333333; margin-bottom: 20px; box-sizing: border-box;">

<!-- =======================================================
       ADD LISTING INFO HERE
======================================================= -->

${insertHtml}

<!-- =======================================================
       END LISTING INFO HERE
======================================================= -->

  </div>

  <!-- Compact Dark Footer Strip -->
  <table role="presentation" style="width: 100%; background-color: #111111; border-radius: 6px; padding: 12px 16px; margin-top: 24px; border-collapse: collapse; box-sizing: border-box;">
    <tbody>
      <tr>
        <td style="color: #ffffff; font-size: 13px; font-family: Arial, Helvetica, sans-serif; text-align: left; vertical-align: middle;">
          <strong style="color: #f1c15b;">TechTrek Outpost</strong> &nbsp;|&nbsp; Clear Item Details &nbsp;•&nbsp; Exact Photos &nbsp;•&nbsp; Carefully Packed
        </td>
        <td style="text-align: right; vertical-align: middle;">
          <a href="https://www.ebay.com/usr/tt_globetrotter" target="_blank" rel="noopener noreferrer" style="display: inline-block; padding: 7px 15px; background-color: #b37a16; color: #ffffff !important; text-decoration: none; font-size: 12px; font-weight: bold; border-radius: 4px; white-space: nowrap; font-family: Arial, Helvetica, sans-serif;">
            Browse All Listings
          </a>
        </td>
      </tr>
    </tbody>
  </table>

</div>`.trim();

  return { title, textBody, htmlBody, insertHtml };
}

export function generateWhatnotCopy(item, options = {}) {
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

export function generateMercariCopy(item, options = {}) {
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
