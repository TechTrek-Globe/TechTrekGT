import { getCertVerificationUrl } from './certLookup';

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

  if (options.description) {
    textLines.push('ITEM DESCRIPTION:', options.description, '');
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
  const additionalDescription = options.description || item.additional_description || '';

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

  // Middle section (between delimiters) - only this gets copied for HTML description
  const insertHtml = `<div style="padding: 26px 28px 12px; background-color: rgb(255, 255, 255); color: rgb(17, 17, 17); box-sizing: border-box;">
  <h1 style="margin: 0px 0px 8px; color: rgb(17, 17, 17); font-size: 30px; line-height: 1.3; text-align: center;">
    ${titleInput}
  </h1>
  ${subtitle ? `<p style="margin: 0px; color: rgb(85, 85, 85); font-size: 17px; line-height: 1.6; text-align: center;">
    ${subtitle}
  </p>` : ''}
</div>

<div style="margin: 10px 28px 22px; padding: 14px 18px; background-color: rgb(247, 242, 232); color: rgb(17, 17, 17); border: 1px solid rgb(214, 181, 109); box-sizing: border-box; text-align: center;">
  <strong style="color: rgb(138, 92, 13); font-size: 17px; line-height: 1.5;">
    ${conditionHeader}
  </strong>
  <div style="margin-top: 4px; color: rgb(51, 51, 51); font-size: 15px; line-height: 1.5;">
    ${conditionSubheader}
  </div>
</div>

<div style="padding: 0px 28px 22px; background-color: rgb(255, 255, 255); color: rgb(17, 17, 17); box-sizing: border-box;">
  <h3 style="margin: 0px 0px 10px; color: rgb(17, 17, 17); border-bottom: 2px solid rgb(179, 122, 22); padding-bottom: 6px; font-size: 20px; line-height: 1.4;">
    Item Description
  </h3>
  <p style="margin: 0px 0px 14px; color: rgb(17, 17, 17); font-size: 16px; line-height: 1.7;">
    ${isAutographed
      ? `Offered is the exact ${titleInput} shown in the listing photographs${athlete ? `, hand-signed by ${athlete}` : ''}.`
      : `Offered is the ${condition.toLowerCase()} ${brand ? `${brand} ` : ''}${titleInput} shown in the listing photographs.`}
  </p>
  ${additionalDescription ? `<p style="margin: 0px; color: rgb(17, 17, 17); font-size: 16px; line-height: 1.7;">
    ${additionalDescription}
  </p>` : ''}
</div>

<div style="margin: 0px 28px 22px; padding: 18px; background-color: rgb(247, 242, 232); color: rgb(17, 17, 17); border: 1px solid rgb(214, 181, 109); box-sizing: border-box;">
  <h3 style="margin: 0px 0px 10px; color: rgb(17, 17, 17); border-bottom: 2px solid rgb(179, 122, 22); padding-bottom: 6px; font-size: 20px; line-height: 1.4;">
    Condition
  </h3>
  <p style="margin: 0px 0px 12px; color: rgb(17, 17, 17); font-size: 16px; line-height: 1.7;">
    ${isAutographed
      ? 'Authentic piece in excellent condition. Please review all photographs for the precise condition of the item and autograph.'
      : `${condition}. Item is in original condition, exactly as shown in photographs.`}
  </p>
  <p style="margin: 0px; color: rgb(51, 51, 51); font-size: 15px; line-height: 1.6;">
    Please review all listing photographs for the precise condition of the item and packaging. The buyer will receive the exact item shown in the listing photographs.
  </p>
</div>

${compatibility.length > 0 ? `<div style="padding: 0px 28px 22px; background-color: rgb(255, 255, 255); color: rgb(17, 17, 17); box-sizing: border-box;">
  <h3 style="margin: 0px 0px 10px; color: rgb(17, 17, 17); border-bottom: 2px solid rgb(179, 122, 22); padding-bottom: 6px; font-size: 20px; line-height: 1.4;">
    Vehicle Compatibility
  </h3>
  <table role="presentation" style="width: 100%; border-collapse: collapse; color: rgb(17, 17, 17); font-size: 15px;">
    <tbody>
${compatibility.map(c => `      <tr>
        <td style="width: 34%; padding: 11px; background-color: rgb(247, 242, 232); color: rgb(17, 17, 17); border: 1px solid rgb(214, 181, 109); font-weight: bold; vertical-align: top;">
          ${c.label}
        </td>
        <td style="padding: 11px; background-color: rgb(255, 255, 255); color: rgb(17, 17, 17); border: 1px solid rgb(221, 221, 221); vertical-align: top;">
          ${c.value}
        </td>
      </tr>`).join('\n')}
    </tbody>
  </table>
  <p style="margin: 12px 0px 0px; color: rgb(51, 51, 51); font-size: 15px; line-height: 1.6;">
    Buyers should confirm the vehicle model and model year before purchase.
  </p>
</div>` : ''}

<div style="padding: 0px 28px 22px; background-color: rgb(255, 255, 255); color: rgb(17, 17, 17); box-sizing: border-box;">
  <h3 style="margin: 0px 0px 10px; color: rgb(17, 17, 17); border-bottom: 2px solid rgb(179, 122, 22); padding-bottom: 6px; font-size: 20px; line-height: 1.4;">
    Item Details
  </h3>
  <table role="presentation" style="width: 100%; border-collapse: collapse; color: rgb(17, 17, 17); font-size: 15px;">
    <tbody>
${tableRowsHtml}
    </tbody>
  </table>
</div>

${features.length > 0 ? `<div style="padding: 0px 28px 22px; background-color: rgb(255, 255, 255); color: rgb(17, 17, 17); box-sizing: border-box;">
  <h3 style="margin: 0px 0px 10px; color: rgb(17, 17, 17); border-bottom: 2px solid rgb(179, 122, 22); padding-bottom: 6px; font-size: 20px; line-height: 1.4;">
    Product Features
  </h3>
  <ul style="margin: 0px 0px 0px 20px; padding: 0px; color: rgb(17, 17, 17); font-size: 16px; line-height: 1.8;">
${features.map(f => `    <li style="margin-bottom: 5px;">${f}</li>`).join('\n')}
  </ul>
</div>` : ''}

${isCertified && certNumber ? `<div style="margin: 0px 28px 22px; padding: 18px; background-color: rgb(247, 242, 232); color: rgb(17, 17, 17); border: 1px solid rgb(214, 181, 109); box-sizing: border-box;">
  <h3 style="margin: 0px 0px 10px; color: rgb(17, 17, 17); border-bottom: 2px solid rgb(179, 122, 22); padding-bottom: 6px; font-size: 20px; line-height: 1.4;">
    ${authenticator} Authentication Services
  </h3>
  <p style="margin: 0px; color: rgb(17, 17, 17); font-size: 16px; line-height: 1.7;">
    This item has been authenticated by ${authenticator}. According to the record for <strong>${certNumber}</strong>, the signature is guaranteed genuine. The matching tamper-evident hologram is attached to the item.
  </p>
</div>` : ''}

${athlete ? `<div style="padding: 0px 28px 22px; background-color: rgb(255, 255, 255); color: rgb(17, 17, 17); box-sizing: border-box;">
  <h3 style="margin: 0px 0px 10px; color: rgb(17, 17, 17); border-bottom: 2px solid rgb(179, 122, 22); padding-bottom: 6px; font-size: 20px; line-height: 1.4;">
    About ${athlete}
  </h3>
  <p style="margin: 0px; color: rgb(17, 17, 17); font-size: 16px; line-height: 1.7;">
    ${additionalDescription || `${athlete} is a renowned athlete and highly sought-after autograph in the hobby.`}
  </p>
</div>` : ''}

<div style="margin: 0px 28px 22px; padding: 18px; background-color: rgb(17, 17, 17); color: rgb(255, 255, 255); border: 1px solid rgb(51, 51, 51); box-sizing: border-box;">
  <h3 style="margin: 0px 0px 10px; color: rgb(241, 193, 91); font-size: 20px; line-height: 1.4;">
    Included in the Sale
  </h3>
  <p style="margin: 0px 0px 10px; color: rgb(255, 255, 255); font-size: 16px; line-height: 1.7;">
    ${options.includedInSale || (isAutographed
      ? `One ${titleInput}${athlete ? ` hand-signed by ${athlete}` : ''}${authenticator ? ` with the attached ${authenticator} hologram` : ''}${certNumber ? ` (Cert ${certNumber})` : ''}.`
      : `One unopened ${brand ? `${brand} ` : ''}${titleInput} package in its original box.`)}
  </p>
  <p style="margin: 0px; color: rgb(221, 221, 221); font-size: 15px; line-height: 1.6;">
    Items are packaged securely with care to ensure safe transit and delivery.
  </p>
</div>

<div style="padding: 0px 28px 24px; background-color: rgb(255, 255, 255); color: rgb(17, 17, 17); box-sizing: border-box;">
  <h3 style="margin: 0px 0px 10px; color: rgb(17, 17, 17); border-bottom: 2px solid rgb(179, 122, 22); padding-bottom: 6px; font-size: 20px; line-height: 1.4;">
    Returns &amp; Guarantee
  </h3>
  <p style="margin: 0px; color: rgb(17, 17, 17); font-size: 16px; line-height: 1.7;">
    ${returnPolicy || 'This purchase is backed by eBay Money Back Guarantee. Buyers are protected if the item does not arrive, arrives damaged, or does not match the listing description.'}
  </p>
</div>`.trim();

  // Full HTML Preview (includes header banner, delimiters, middle insertHtml, and footer)
  const htmlBody = `<div style="width:100%;font-family:Arial,Helvetica,sans-serif;">

  <div style="border-bottom: 1px solid rgb(221, 221, 221); box-sizing: border-box;">
    <img src="https://i.ebayimg.com/images/g/sZwAAeSwMwFqexk1/s-l1600.webp" alt="TechTrek Outpost" width="800" height="200" style="max-width:100%;height:auto;display:block;margin:0 auto;">
  </div>

<!-- =======================================================
       ADD Lising INFO HERE
======================================================= -->

${insertHtml}

<!-- =======================================================
       END Lising INFO HERE
======================================================= -->

  <div style="margin: 0px 28px 22px; padding: 18px; background-color: rgb(17, 17, 17); color: rgb(255, 255, 255); border: 1px solid rgb(51, 51, 51); box-sizing: border-box;">
    <h3 style="margin: 0px 0px 12px; color: rgb(241, 193, 91); font-size: 22px; line-height: 1.4; text-align: center;">
      Why Buy From TechTrek Outpost?
    </h3>
    <p style="margin: 0px 0px 14px; color: rgb(255, 255, 255); font-size: 16px; line-height: 1.6; text-align: center;">
      We focus on clear item details, accurate condition information, helpful photographs, and careful packing.
    </p>
    <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: rgb(17, 17, 17); color: rgb(255, 255, 255); font-size: 15px;">
      <tbody>
        <tr>
          <td style="width: 50%; padding: 8px; background-color: rgb(17, 17, 17); color: rgb(255, 255, 255); vertical-align: top;">
            &#10003; Clear item descriptions
          </td>
          <td style="width: 50%; padding: 8px; background-color: rgb(17, 17, 17); color: rgb(255, 255, 255); vertical-align: top;">
            &#10003; Relevant product details provided
          </td>
        </tr>
        <tr>
          <td style="padding: 8px; background-color: rgb(17, 17, 17); color: rgb(255, 255, 255); vertical-align: top;">
            &#10003; Condition information clearly stated
          </td>
          <td style="padding: 8px; background-color: rgb(17, 17, 17); color: rgb(255, 255, 255); vertical-align: top;">
            &#10003; Included contents identified
          </td>
        </tr>
        <tr>
          <td style="padding: 8px; background-color: rgb(17, 17, 17); color: rgb(255, 255, 255); vertical-align: top;">
            &#10003; Exact-item photos when applicable
          </td>
          <td style="padding: 8px; background-color: rgb(17, 17, 17); color: rgb(255, 255, 255); vertical-align: top;">
            &#10003; Items carefully packed for shipment
          </td>
        </tr>
      </tbody>
    </table>
  </div>

  <div style="padding: 22px 28px; text-align: center; background-color: rgb(247, 242, 232); color: rgb(17, 17, 17); border-top: 1px solid rgb(214, 181, 109); box-sizing: border-box;">
    <h3 style="margin: 0px 0px 8px; color: rgb(17, 17, 17); font-size: 20px; line-height: 1.4;">
      Explore More from TechTrek Outpost
    </h3>
    <p style="margin: 0px 0px 15px; color: rgb(51, 51, 51); font-size: 15px; line-height: 1.5;">
      Browse our other available items.
    </p>
    <a href="https://www.ebay.com/usr/tt_globetrotter" target="_blank" rel="noopener noreferrer" style="display: inline-block; padding: 12px 22px; background-color: rgb(179, 122, 22); color: rgb(255, 255, 255); text-decoration: none; font-size: 16px; font-weight: bold; border: 2px solid rgb(138, 92, 13);">
      View Our Other Listings
    </a>
  </div>

  <div style="padding: 16px 24px; text-align: center; background-color: rgb(17, 17, 17); color: rgb(255, 255, 255); font-size: 14px; line-height: 1.5; box-sizing: border-box;">
    <strong style="color: rgb(241, 193, 91);">TechTrek Outpost</strong>
    <span style="color: rgb(255, 255, 255);"> | Clear Item Details | Exact-Item Photos | Carefully Packed</span>
  </div>

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
  const notes = [
    `🔥 ${titleInput}`,
    brand ? `🏷️ Brand: ${brand}` : null,
    athlete ? `⭐ Athlete: ${athlete}` : null,
    item.category ? `📦 Category: ${item.category}` : null,
    (authenticator || cert) ? `🛡️ Auth: ${authenticator || 'Certified'} ${cert}`.trim() : null,
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
