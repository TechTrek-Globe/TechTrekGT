import { getCertVerificationUrl } from './certLookup';

/**
 * Generate multi-channel formatted listing copy for sports cards, memorabilia, and general/Amazon inventory.
 */

export function generateEbayCopy(item, options = {}) {
  const athlete = (item.athlete_person || '').trim();
  const category = (item.category || 'General').trim();
  const rawAuth = (item.authenticator || '').trim();
  const certNumber = item.cert_number ? String(item.cert_number).trim() : '';
  const isCertified = Boolean(rawAuth && !['Raw', 'Uncertified', 'None', 'Other', 'N/A'].includes(rawAuth));
  const authenticator = isCertified ? rawAuth : '';
  const certUrl = (isCertified && certNumber) ? getCertVerificationUrl(authenticator, certNumber) : null;
  const condition = options.condition || 'Brand New / Excellent';
  const shippingPolicy = options.shippingPolicy || 'Ships securely in bubble mailer / box with tracking within 1 business day.';
  const returnPolicy = options.returnPolicy || '30-Day Returns accepted if item is in original unaltered condition.';
  const isAutographed = Boolean(athlete || isCertified || item.inscription);

  // Optimized eBay Title (80 character max)
  let title = `${item.item_name || ''}`;
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
    `ITEM: ${item.item_name}`
  ];
  if (athlete) {
    textLines.push(`ATHLETE / SUBJECT: ${athlete}`);
  }
  if (category) {
    textLines.push(`CATEGORY: ${category}`);
  }
  if (isCertified || certNumber) {
    textLines.push(`AUTHENTICATION / GRADING: ${authenticator || 'Certified'}${certNumber ? ` (Cert #${certNumber})` : ''}`);
  }
  if (certUrl) {
    textLines.push(`OFFICIAL CERT VERIFICATION: ${certUrl}`);
  }
  textLines.push('', `CONDITION: ${condition}`, '');

  if (isAutographed) {
    textLines.push(
      'ABOUT THIS PIECE:',
      '- 100% Guaranteed Authentic signed piece from a smoke-free collection.',
      certNumber && isCertified ? `- Certified and recorded under ${authenticator} database.` : null,
      '- Photos show the exact item you will receive.'
    );
  } else {
    textLines.push(
      'ABOUT THIS ITEM:',
      '- 100% Genuine, authentic item in excellent condition.',
      '- Photos show the exact item you will receive.'
    );
  }

  textLines.push(
    '',
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

  const inscription = item.inscription || '';
  const authType = item.auth_type || authenticator;
  const additionalDescription = item.additional_description || '';

  // Build table rows dynamically
  const tableRows = [
    `<tr>
<td style="width: 38%; padding: 9px; background-color: #f5f5f5; color: #111111; border-bottom: 1px solid #dddddd; font-weight: bold; vertical-align: top;">Item</td>
<td style="padding: 9px; background-color: #ffffff; color: #111111; border-bottom: 1px solid #dddddd; vertical-align: top;">${item.item_name}</td>
</tr>`
  ];

  if (category) {
    tableRows.push(`<tr>
<td style="padding: 9px; background-color: #f5f5f5; color: #111111; border-bottom: 1px solid #dddddd; font-weight: bold; vertical-align: top;">Category</td>
<td style="padding: 9px; background-color: #ffffff; color: #111111; border-bottom: 1px solid #dddddd; vertical-align: top;">${category}</td>
</tr>`);
  }

  if (condition) {
    tableRows.push(`<tr>
<td style="padding: 9px; background-color: #f5f5f5; color: #111111; border-bottom: 1px solid #dddddd; font-weight: bold; vertical-align: top;">Condition</td>
<td style="padding: 9px; background-color: #ffffff; color: #111111; border-bottom: 1px solid #dddddd; vertical-align: top;">${condition}</td>
</tr>`);
  }

  if (athlete) {
    tableRows.push(`<tr>
<td style="padding: 9px; background-color: #f5f5f5; color: #111111; border-bottom: 1px solid #dddddd; font-weight: bold; vertical-align: top;">Player / Subject</td>
<td style="padding: 9px; background-color: #ffffff; color: #111111; border-bottom: 1px solid #dddddd; vertical-align: top;">${athlete}</td>
</tr>`);
  }

  if (isAutographed && athlete) {
    tableRows.push(`<tr>
<td style="padding: 9px; background-color: #f5f5f5; color: #111111; border-bottom: 1px solid #dddddd; font-weight: bold; vertical-align: top;">Signature</td>
<td style="padding: 9px; background-color: #ffffff; color: #111111; border-bottom: 1px solid #dddddd; vertical-align: top;">Hand-signed by ${athlete}</td>
</tr>`);
  }

  if (inscription) {
    tableRows.push(`<tr>
<td style="padding: 9px; background-color: #f5f5f5; color: #111111; border-bottom: 1px solid #dddddd; font-weight: bold; vertical-align: top;">Inscription</td>
<td style="padding: 9px; background-color: #ffffff; color: #111111; border-bottom: 1px solid #dddddd; vertical-align: top;">"${inscription}"</td>
</tr>`);
  }

  if (isCertified || certNumber) {
    tableRows.push(`<tr>
<td style="padding: 9px; background-color: #f5f5f5; color: #111111; font-weight: bold; vertical-align: top;">Authentication</td>
<td style="padding: 9px; background-color: #ffffff; color: #111111; vertical-align: top;">${authType || authenticator || 'Certified'}${certNumber ? ` (Cert #${certNumber})` : ''}</td>
</tr>`);
  }

  // eBay listing HTML template
  const htmlBody = `<div style="width:100%;font-family:Arial,Helvetica,sans-serif;">

<div style="border-bottom: 1px solid #dddddd;">
<img src="https://i.ebayimg.com/images/g/sZwAAeSwMwFqexk1/s-l1600.webp" alt="TechTrek Outpost" width="800" height="200" style="max-width:100%;height:auto;display:block;margin:0 auto;">
</div>

<div style="padding: 18px 24px; text-align: center; background-color: #f7f2e8; border-bottom: 2px solid #b37a16; color: #111111;">
<h2 style="margin: 0; color: #111111; font-family: Arial, Helvetica, sans-serif; font-size: 25px; line-height: 1.3;">
${item.item_name}
</h2>
<p style="margin: 8px 0 0; color: #7a5000; font-size: 17px; line-height: 1.4; font-weight: bold;">
${isAutographed
  ? `${authenticator ? `${authenticator} Authenticated` : 'Authentic Collectible'}${certNumber ? ` | Cert ${certNumber}` : ''}${inscription ? ` | "${inscription}"` : ''}`
  : `${category ? `${category} | ` : ''}${condition || 'Brand New / Genuine'}`}
</p>
</div>

<div style="padding: 22px 28px; background-color: #ffffff; color: #111111;">
<h3 style="margin: 0 0 12px; color: #111111; border-bottom: 2px solid #b37a16; padding-bottom: 6px; font-size: 20px; line-height: 1.4;">
Item Description
</h3>
<p style="margin: 0; color: #111111; font-size: 16px; line-height: 1.6;">
${isAutographed
  ? `Offered is the exact ${item.item_name} shown in the listing photographs${athlete ? `, hand-signed by ${athlete}` : ''}.`
  : `Offered is the exact ${item.item_name} shown in the listing photographs in ${condition.toLowerCase()} condition.`}
</p>
${additionalDescription ? `<p style="margin: 8px 0 0; color: #111111; font-size: 16px; line-height: 1.6;">
${additionalDescription}
</p>` : ''}
</div>

${isCertified && certNumber ? `<div style="margin: 0 28px 22px; padding: 16px; background-color: #fffaf0; color: #111111; border: 2px solid #b37a16;">
<h3 style="margin: 0 0 10px; color: #111111; font-size: 20px; line-height: 1.4;">
${authenticator} Authentication Services
</h3>
<p style="margin: 0; color: #111111; font-size: 16px; line-height: 1.6;">
This item has been authenticated by ${authenticator}. According to the record for <strong>${certNumber}</strong>, the signature is guaranteed genuine. The matching tamper-evident hologram is attached to the item.
</p>
</div>` : ''}

<div style="padding: 0 28px 22px; background-color: #ffffff; color: #111111;">
<h3 style="margin: 0 0 12px; color: #111111; border-bottom: 2px solid #b37a16; padding-bottom: 6px; font-size: 20px; line-height: 1.4;">
Item Details
</h3>
<table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #ffffff; color: #111111; font-size: 15px;">
<tbody>
${tableRows.join('\n')}
</tbody>
</table>
</div>

${athlete ? `<div style="padding: 0 28px 22px; background-color: #ffffff; color: #111111;">
<h3 style="margin: 0 0 12px; color: #111111; border-bottom: 2px solid #b37a16; padding-bottom: 6px; font-size: 20px; line-height: 1.4;">
About ${athlete}
</h3>
<p style="margin: 0; color: #111111; font-size: 16px; line-height: 1.6;">
${additionalDescription || `${athlete} is a renowned athlete and highly sought-after autograph in the hobby.`}
</p>
</div>` : ''}

<div style="margin: 0 28px 22px; padding: 16px; background-color: #f5f5f5; color: #111111; border: 1px solid #cccccc;">
<h3 style="margin: 0 0 10px; color: #111111; font-size: 19px; line-height: 1.4;">
Condition
</h3>
<p style="margin: 0; color: #111111; font-size: 16px; line-height: 1.6;">
Please review all photographs for the precise condition of the item. The exact items shown in the photographs are what the buyer will receive.
</p>
</div>

<div style="padding: 0 28px 22px; background-color: #ffffff; color: #111111;">
<h3 style="margin: 0 0 10px; color: #111111; border-bottom: 2px solid #b37a16; padding-bottom: 6px; font-size: 20px; line-height: 1.4;">
Included in the Sale
</h3>
<p style="margin: 0; color: #111111; font-size: 16px; line-height: 1.6;">
${isAutographed
  ? `One ${item.item_name}${athlete ? ` hand-signed by ${athlete}` : ''}${authenticator ? ` with the attached ${authenticator} hologram` : ''}${certNumber ? ` (Cert ${certNumber})` : ''}.`
  : `One ${item.item_name} as pictured.`}
</p>
</div>

<div style="margin: 0 28px 22px; padding: 16px; background-color: #fffaf0; color: #111111; border: 2px solid #b37a16;">
<h3 style="margin: 0 0 10px; color: #111111; font-size: 20px; line-height: 1.4;">
Returns &amp; Guarantee
</h3>
<p style="margin: 0 0 10px; color: #111111; font-size: 16px; line-height: 1.6;">
This listing is backed by eBay Money Back Guarantee. If the item does not arrive, arrives damaged, or does not match the listing description, buyers are protected on every purchase.
</p>
<p style="margin: 0; color: #111111; font-size: 16px; line-height: 1.6;">
Returns are accepted within 14 days of delivery. The item must be returned in the same condition as received. Please contact us before opening a return so we can help directly.
</p>
</div>

<div style="margin: 0 28px 22px; padding: 18px; background-color: #111111; color: #ffffff; border: 1px solid #333333;">
<h3 style="margin: 0 0 12px; color: #f1c15b; font-size: 22px; line-height: 1.4; text-align: center;">
Why Buy From TechTrek Outpost?
</h3>
<p style="margin: 0 0 14px; color: #ffffff; font-size: 16px; line-height: 1.6; text-align: center;">
We focus on clear item details, accurate condition information, helpful photographs, and careful packing.
</p>
<table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #111111; color: #ffffff; font-size: 15px;">
<tbody>
<tr>
<td style="width: 50%; padding: 8px; background-color: #111111; color: #ffffff; vertical-align: top;">&#10003; Clear item descriptions</td>
<td style="width: 50%; padding: 8px; background-color: #111111; color: #ffffff; vertical-align: top;">&#10003; Relevant product details provided</td>
</tr>
<tr>
<td style="padding: 8px; background-color: #111111; color: #ffffff; vertical-align: top;">&#10003; Condition information clearly stated</td>
<td style="padding: 8px; background-color: #111111; color: #ffffff; vertical-align: top;">&#10003; Included contents identified</td>
</tr>
<tr>
<td style="padding: 8px; background-color: #111111; color: #ffffff; vertical-align: top;">&#10003; Exact-item photos when applicable</td>
<td style="padding: 8px; background-color: #111111; color: #ffffff; vertical-align: top;">&#10003; Items carefully packed for shipment</td>
</tr>
</tbody>
</table>
</div>

<div style="padding: 0 28px 24px; background-color: #ffffff; color: #111111;">
<h3 style="margin: 0 0 10px; color: #111111; border-bottom: 2px solid #b37a16; padding-bottom: 6px; font-size: 20px; line-height: 1.4;">
Shipping
</h3>
<p style="margin: 0; color: #111111; font-size: 16px; line-height: 1.6;">
${shippingPolicy}
</p>
</div>

<div style="padding: 22px 28px; text-align: center; background-color: #f7f2e8; color: #111111; border-top: 1px solid #d6b56d;">
<h3 style="margin: 0 0 8px; color: #111111; font-size: 20px; line-height: 1.4;">
Explore More from TechTrek Outpost
</h3>
<p style="margin: 0 0 15px; color: #333333; font-size: 15px; line-height: 1.5;">
Browse our other available items.
</p>
<a href="https://www.ebay.com/usr/tt_globetrotter" target="_blank" rel="noopener noreferrer" style="display: inline-block; padding: 12px 22px; background-color: #b37a16; color: #ffffff; text-decoration: none; font-size: 16px; font-weight: bold; border: 2px solid #8a5c0d;">
View Our Other Listings
</a>
</div>

<div style="padding: 16px 24px; text-align: center; background-color: #111111; color: #ffffff; font-size: 14px; line-height: 1.5;">
<strong style="color: #f1c15b;">TechTrek Outpost</strong>
<span style="color: #ffffff;"> | Clear Item Details | Exact-Item Photos | Carefully Packed</span>
</div>

</div>`.trim();

  return { title, textBody, htmlBody };
}

export function generateWhatnotCopy(item) {
  const athlete = (item.athlete_person || '').trim();
  const rawAuth = (item.authenticator || '').trim();
  const isCertified = Boolean(rawAuth && !['Raw', 'Uncertified', 'None', 'Other', 'N/A'].includes(rawAuth));
  const authenticator = isCertified ? rawAuth : '';
  const cert = item.cert_number ? `Cert #${item.cert_number}` : '';

  const title = `${item.item_name}${authenticator ? ` ${authenticator}` : ''}`.trim();
  const notes = [
    `🔥 ${item.item_name}`,
    athlete ? `⭐ Athlete: ${athlete}` : null,
    item.category ? `📦 Category: ${item.category}` : null,
    (authenticator || cert) ? `🛡️ Auth: ${authenticator || 'Certified'} ${cert}`.trim() : null,
    `📦 Ships next-day securely packed!`
  ].filter(Boolean).join('\n');

  return { title, notes };
}

export function generateMercariCopy(item) {
  const athlete = (item.athlete_person || '').trim();
  const rawAuth = (item.authenticator || '').trim();
  const isCertified = Boolean(rawAuth && !['Raw', 'Uncertified', 'None', 'Other', 'N/A'].includes(rawAuth));
  const authenticator = isCertified ? rawAuth : '';
  const certNumber = item.cert_number ? `#${item.cert_number}` : '';

  let title = `${item.item_name}${authenticator ? ` ${authenticator}` : ''}${certNumber ? ` ${certNumber}` : ''}`.trim();
  if (title.length > 80) title = title.substring(0, 80).trim();

  const cleanTags = [
    item.category,
    athlete ? athlete.replace(/\s+/g, '') : '',
    authenticator,
    athlete ? 'Memorabilia' : 'Retail',
    athlete ? 'Autograph' : ''
  ].filter(Boolean);

  const hashtags = cleanTags.map(t => `#${t}`).join(' ');

  const descriptionLines = [
    item.item_name,
    ''
  ];
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

export function generateSocialCopy(item) {
  const athlete = (item.athlete_person || '').trim();
  const rawAuth = (item.authenticator || '').trim();
  const isCertified = Boolean(rawAuth && !['Raw', 'Uncertified', 'None', 'Other', 'N/A'].includes(rawAuth));
  const authenticator = isCertified ? rawAuth : '';
  const certNumber = item.cert_number ? `#${item.cert_number}` : '';

  const tags = [
    'TechTrekOutpost',
    item.category?.replace(/\s+/g, ''),
    athlete ? athlete.replace(/[^a-zA-Z0-9]/g, '') : '',
    athlete ? 'TheHobby' : 'Deals',
    athlete ? 'AutographCollection' : 'OnlineShopping',
    authenticator
  ].filter(Boolean).map(t => `#${t}`).join(' ');

  const captionLines = [
    `🚨 AVAILABLE NOW: ${item.item_name}`,
    ''
  ];
  if (athlete) captionLines.push(`⭐ Subject: ${athlete}`);
  if (item.category) captionLines.push(`🏷️ Category: ${item.category}`);
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
