import { getCertVerificationUrl } from './certLookup';

/**
 * Generate multi-channel formatted listing copy for sports cards and memorabilia.
 */

export function generateEbayCopy(item, options = {}) {
  const athlete = item.athlete_person || '';
  const category = item.category || 'Memorabilia';
  const authenticator = item.authenticator || 'Uncertified';
  const certNumber = item.cert_number ? String(item.cert_number).trim() : '';
  const certUrl = getCertVerificationUrl(authenticator, certNumber);
  const condition = options.condition || 'Brand New / Excellent';
  const shippingPolicy = options.shippingPolicy || 'Ships securely in bubble mailer / box with tracking within 1 business day.';
  const returnPolicy = options.returnPolicy || '30-Day Returns accepted if item is in original unaltered condition.';

  // Optimized eBay Title (80 character max)
  let title = `${item.item_name || ''}`;
  if (authenticator && authenticator !== 'Raw' && authenticator !== 'Uncertified' && !title.includes(authenticator)) {
    title += ` ${authenticator}`;
  }
  if (certNumber && !title.includes(certNumber)) {
    title += ` #${certNumber}`;
  }
  if (title.length > 80) {
    title = title.substring(0, 80).trim();
  }

  // Plain Text Version
  const textBody = [
    `ITEM: ${item.item_name}`,
    `ATHLETE / SUBJECT: ${athlete || 'N/A'}`,
    `CATEGORY: ${category}`,
    `AUTHENTICATION / GRADING: ${authenticator}${certNumber ? ` (Cert #${certNumber})` : ''}`,
    certUrl ? `OFFICIAL CERT VERIFICATION: ${certUrl}` : '',
    '',
    `CONDITION: ${condition}`,
    '',
    'ABOUT THIS PIECE:',
    `- 100% Guaranteed Authentic signed memorabilia from a smoke-free collection.`,
    certNumber ? `- Certified and recorded under ${authenticator} database.` : '',
    `- Photos show the exact item you will receive.`,
    '',
    'SHIPPING & HANDLING:',
    `- ${shippingPolicy}`,
    `- Packaged with extreme care to preserve grade and condition.`,
    '',
    'RETURN POLICY:',
    `- ${returnPolicy}`,
    '',
    'Thank you for viewing TechTrek Outpost inventory!'
  ].filter(line => line !== null).join('\n');

  const isSports = category.toLowerCase().includes('sport') ||
                   category.toLowerCase().includes('card') ||
                   category.toLowerCase().includes('memorabilia') ||
                   athlete.trim().length > 0;

  const inscription = item.inscription || '';
  const authType = item.auth_type || authenticator;
  const additionalDescription = item.additional_description || '';

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
${authenticator} Authenticated${certNumber ? ` | Cert ${certNumber}` : ''}${inscription ? ` | "${inscription}"` : ''}
</p>
</div>

<div style="padding: 22px 28px; background-color: #ffffff; color: #111111;">
<h3 style="margin: 0 0 12px; color: #111111; border-bottom: 2px solid #b37a16; padding-bottom: 6px; font-size: 20px; line-height: 1.4;">
Item Description
</h3>
<p style="margin: 0; color: #111111; font-size: 16px; line-height: 1.6;">
Offered is the exact item shown in the listing photographs, hand-signed by ${athlete}.${additionalDescription ? ` ${additionalDescription}` : ''}
</p>
</div>

<div style="margin: 0 28px 22px; padding: 16px; background-color: #fffaf0; color: #111111; border: 2px solid #b37a16;">
<h3 style="margin: 0 0 10px; color: #111111; font-size: 20px; line-height: 1.4;">
${authenticator} Authentication Services
</h3>
<p style="margin: 0; color: #111111; font-size: 16px; line-height: 1.6;">
This item has been authenticated by ${authenticator}. According to the record for <strong>${certNumber}</strong>, the signature is guaranteed genuine. The matching tamper-evident hologram is attached to the item.
</p>
</div>

<div style="padding: 0 28px 22px; background-color: #ffffff; color: #111111;">
<h3 style="margin: 0 0 12px; color: #111111; border-bottom: 2px solid #b37a16; padding-bottom: 6px; font-size: 20px; line-height: 1.4;">
Item Details
</h3>
<table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #ffffff; color: #111111; font-size: 15px;">
<tbody>
<tr>
<td style="width: 38%; padding: 9px; background-color: #f5f5f5; color: #111111; border-bottom: 1px solid #dddddd; font-weight: bold; vertical-align: top;">Player</td>
<td style="padding: 9px; background-color: #ffffff; color: #111111; border-bottom: 1px solid #dddddd; vertical-align: top;">${athlete}</td>
</tr>
<tr>
<td style="padding: 9px; background-color: #f5f5f5; color: #111111; border-bottom: 1px solid #dddddd; font-weight: bold; vertical-align: top;">Item</td>
<td style="padding: 9px; background-color: #ffffff; color: #111111; border-bottom: 1px solid #dddddd; vertical-align: top;">${item.item_name}</td>
</tr>
<tr>
<td style="padding: 9px; background-color: #f5f5f5; color: #111111; border-bottom: 1px solid #dddddd; font-weight: bold; vertical-align: top;">Signature</td>
<td style="padding: 9px; background-color: #ffffff; color: #111111; border-bottom: 1px solid #dddddd; vertical-align: top;">Hand-signed by ${athlete}</td>
</tr>
${inscription ? `<tr>
<td style="padding: 9px; background-color: #f5f5f5; color: #111111; border-bottom: 1px solid #dddddd; font-weight: bold; vertical-align: top;">Inscription</td>
<td style="padding: 9px; background-color: #ffffff; color: #111111; border-bottom: 1px solid #dddddd; vertical-align: top;">"${inscription}"</td>
</tr>` : ''}
<tr>
<td style="padding: 9px; background-color: #f5f5f5; color: #111111; font-weight: bold; vertical-align: top;">Authentication</td>
<td style="padding: 9px; background-color: #ffffff; color: #111111; vertical-align: top;">${authType}</td>
</tr>
</tbody>
</table>
</div>

<div style="padding: 0 28px 22px; background-color: #ffffff; color: #111111;">
<h3 style="margin: 0 0 12px; color: #111111; border-bottom: 2px solid #b37a16; padding-bottom: 6px; font-size: 20px; line-height: 1.4;">
About ${athlete}
</h3>
<p style="margin: 0; color: #111111; font-size: 16px; line-height: 1.6;">
${additionalDescription || `${athlete} is a renowned athlete and highly sought-after autograph in the hobby.`}
</p>
</div>

<div style="margin: 0 28px 22px; padding: 16px; background-color: #f5f5f5; color: #111111; border: 1px solid #cccccc;">
<h3 style="margin: 0 0 10px; color: #111111; font-size: 19px; line-height: 1.4;">
Condition
</h3>
<p style="margin: 0; color: #111111; font-size: 16px; line-height: 1.6;">
Please review all photographs for the precise condition of the item, autograph, and authentication hologram. The exact items shown in the photographs are what the buyer will receive.
</p>
</div>

<div style="padding: 0 28px 22px; background-color: #ffffff; color: #111111;">
<h3 style="margin: 0 0 10px; color: #111111; border-bottom: 2px solid #b37a16; padding-bottom: 6px; font-size: 20px; line-height: 1.4;">
Included in the Sale
</h3>
<p style="margin: 0; color: #111111; font-size: 16px; line-height: 1.6;">
One ${item.item_name} hand-signed by ${athlete} with the attached ${authenticator} hologram${certNumber ? ` (Cert ${certNumber})` : ''}.
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
Returns are accepted within 14 days of delivery. The item and authentication hologram must be returned in the same condition as received. Please contact us before opening a return so we can help directly.
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
  const athlete = item.athlete_person || '';
  const authenticator = item.authenticator || 'Raw';
  const cert = item.cert_number ? `Cert #${item.cert_number}` : '';

  const title = `${item.item_name} ${authenticator !== 'Raw' ? authenticator : ''}`.trim();
  const notes = [
    `🔥 ${item.item_name}`,
    athlete ? `⭐ Athlete: ${athlete}` : null,
    `🛡️ Auth: ${authenticator} ${cert}`,
    `📦 Ships next-day bubble wrapped!`
  ].filter(Boolean).join('\n');

  return { title, notes };
}

export function generateMercariCopy(item) {
  const athlete = item.athlete_person || '';
  const authenticator = item.authenticator || '';
  const certNumber = item.cert_number ? `#${item.cert_number}` : '';

  const title = `${item.item_name} ${authenticator} ${certNumber}`.trim().substring(0, 80);

  const cleanTags = [
    item.category,
    athlete ? athlete.replace(/\s+/g, '') : '',
    authenticator,
    'Memorabilia',
    'Autograph'
  ].filter(Boolean);

  const hashtags = cleanTags.map(t => `#${t}`).join(' ');

  const description = [
    item.item_name,
    '',
    athlete ? `Athlete: ${athlete}` : '',
    `Category: ${item.category || 'Collectibles'}`,
    authenticator ? `Authentication: ${authenticator} ${certNumber}` : '',
    'Condition: Excellent, exactly as pictured.',
    'Fast & secure shipping with tracking.',
    '',
    hashtags
  ].filter(line => line !== null).join('\n');

  return { title, description, hashtags };
}

export function generateSocialCopy(item) {
  const athlete = item.athlete_person || '';
  const authenticator = item.authenticator || '';
  const certNumber = item.cert_number ? `#${item.cert_number}` : '';

  const tags = [
    'TheHobby',
    'SportsMemorabilia',
    'AutographCollection',
    item.category?.replace(/\s+/g, ''),
    athlete ? athlete.replace(/[^a-zA-Z0-9]/g, '') : '',
    authenticator,
    'TechTrekOutpost',
    'CardCollector'
  ].filter(Boolean).map(t => `#${t}`).join(' ');

  const caption = [
    `🚨 AVAILABLE NOW: ${item.item_name}`,
    '',
    athlete ? `⭐ Subject: ${athlete}` : '',
    authenticator ? `🛡️ Certified by: ${authenticator} ${certNumber}` : '',
    `💰 DM for pricing or link in bio to purchase!`,
    '',
    `📦 Packed safe & shipped fast with tracking.`,
    '',
    tags
  ].filter(Boolean).join('\n');

  return { caption, tags };
}
