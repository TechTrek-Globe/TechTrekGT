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
  const htmlBody = `<div style="font-family: Arial, Helvetica, sans-serif; color: #222222; max-width: 900px; margin: 0 auto; box-shadow: 0 4px 12px rgba(0,0,0,0.08); border-radius: 8px; border: 1px solid #d8d8d8; background-color: #ffffff; overflow: hidden;">

<div style="background-color: #111111; padding: 4%; text-align: center;">
<img src="https://raw.githubusercontent.com/TechTrek-Globe/TechTrekGT/main/outpost/public/ebay-banner-sports.png" alt="TechTrek Outpost - Authentic Signed Memorabilia" style="margin: 10px auto 28px auto; text-align: center; max-width: 100%; height: auto; display: block;">
<h1 style="font-size: 28px; margin: 0; color: #ffffff; line-height: 1.25;">
${title}
</h1>
<h2 style="font-size: 18px; margin: 10px 0 0 0; color: #b37a16; font-weight: bold;">
${inscription ? `"${inscription}" Inscription | ` : ''}${authenticator} Authentication${certNumber ? ` | Cert #${certNumber}` : ''}
</h2>
</div>

<div style="margin: 22px 4%; padding: 16px; background-color: #f7f2e8; border: 1px solid #d6b56d; text-align: center; border-radius: 6px;">
<div style="font-size: 20px; font-weight: bold; color: #111111;">
Authenticated Memorabilia You Can Verify
</div>
<div style="font-size: 15px; margin-top: 8px; color: #333333;">
This autograph has been authenticated by ${authenticator} and includes a ${authType} hologram.
</div>
</div>

<div style="padding: 10px 4% 0 4%;">
<h3 style="font-size: 20px; color: #111111; border-bottom: 2px solid #b37a16; padding-bottom: 6px;">
Item Description
</h3>

<p style="font-size: 16px; line-height: 1.6;">
Offered here is a <strong>${item.item_name}</strong> hand-signed by ${athlete}.${inscription ? ` The item includes ${athlete}'s <strong>"${inscription}" inscription</strong>.` : ''}
</p>
${additionalDescription ? `
<p style="font-size: 16px; line-height: 1.6;">
${additionalDescription}
</p>` : ''}
</div>

<div style="margin: 22px 4%; padding: 18px; border: 2px solid #b37a16; background-color: #fffaf0; border-radius: 6px;">
<h3 style="font-size: 22px; color: #111111; margin-top: 0; text-align: center;">
Authentication Details
</h3>

<table style="width: 100%; border-collapse: collapse; font-size: 16px; text-align: left;">
<tr>
<th scope="row" style="padding: 8px; border-bottom: 1px solid #e5d3a4; width: 35%;">Authentication Company</th>
<td style="padding: 8px; border-bottom: 1px solid #e5d3a4;">${authenticator}</td>
</tr>
<tr>
<th scope="row" style="padding: 8px; border-bottom: 1px solid #e5d3a4;">Authentication Type</th>
<td style="padding: 8px; border-bottom: 1px solid #e5d3a4;">${authType}</td>
</tr>
<tr>
<th scope="row" style="padding: 8px; border-bottom: 1px solid #e5d3a4;">Certification Number</th>
<td style="padding: 8px; border-bottom: 1px solid #e5d3a4;"><strong>${certNumber}</strong></td>
</tr>
<tr>
<th scope="row" style="padding: 8px;">Verification</th>
<td style="padding: 8px;">Verify directly through the official ${authenticator} authentication lookup using certification number <strong>${certNumber}</strong>.</td>
</tr>
</table>

<div style="margin-top: 16px; padding: 14px; background-color: #ffffff; border: 1px solid #dddddd; text-align: center; border-radius: 4px;">
<div style="font-size: 17px; font-weight: bold; color: #111111;">
${authenticator} Certification Number: ${certNumber}
</div>
<div style="font-size: 14px; color: #555555; margin-top: 6px;">
To verify, visit the official ${authenticator} website and enter the certification number above.
</div>
</div>
</div>

<div style="padding: 0 4%;">
<h3 style="font-size: 20px; color: #111111; border-bottom: 2px solid #b37a16; padding-bottom: 6px;">
Item Details
</h3>

<table style="width: 100%; border-collapse: collapse; font-size: 16px; margin-bottom: 20px; text-align: left;">
<tr>
<th scope="row" style="padding: 9px; border-bottom: 1px solid #eeeeee; width: 35%;">Player</th>
<td style="padding: 9px; border-bottom: 1px solid #eeeeee;">${athlete}</td>
</tr>
<tr>
<th scope="row" style="padding: 9px; border-bottom: 1px solid #eeeeee;">Item</th>
<td style="padding: 9px; border-bottom: 1px solid #eeeeee;">${item.item_name}</td>
</tr>
<tr>
<th scope="row" style="padding: 9px; border-bottom: 1px solid #eeeeee;">Autograph</th>
<td style="padding: 9px; border-bottom: 1px solid #eeeeee;">Hand Signed</td>
</tr>
${inscription ? `<tr>
<th scope="row" style="padding: 9px; border-bottom: 1px solid #eeeeee;">Inscription</th>
<td style="padding: 9px; border-bottom: 1px solid #eeeeee;">"${inscription}"</td>
</tr>` : ''}
<tr>
<th scope="row" style="padding: 9px; border-bottom: 1px solid #eeeeee;">Authentication</th>
<td style="padding: 9px; border-bottom: 1px solid #eeeeee;">${authType}</td>
</tr>
<tr>
<th scope="row" style="padding: 9px; border-bottom: 1px solid #eeeeee;">Certification Number</th>
<td style="padding: 9px; border-bottom: 1px solid #eeeeee;">${certNumber}</td>
</tr>
<tr>
<th scope="row" style="padding: 9px;">Condition</th>
<td style="padding: 9px;">Please review all photos carefully. The item pictured is the exact item you will receive.</td>
</tr>
</table>
</div>

<div style="margin: 22px 4%; padding: 16px; background-color: #f7f7f7; border: 1px solid #dddddd; text-align: center; border-radius: 6px;">
  <h3 style="font-size: 19px; color: #111111; margin-top: 0;">Explore More Inventory</h3>
  <p style="font-size: 15px; line-height: 1.6; color: #333333; margin-bottom: 0;">
    <a href="https://www.ebay.com/sch/i.html?_ssn=tt_globetrotter" target="_blank" style="color: #b37a16; text-decoration: none; font-weight: bold;">
      Click here to visit the TechTrek Outpost eBay shop for more authenticated memorabilia.
    </a>
  </p>
</div>

<div style="margin: 22px 4%; padding: 18px; background-color: #111111; color: #ffffff; border-radius: 6px;">
<h3 style="font-size: 22px; margin-top: 0; color: #f1c15b; text-align: center;">
Why Buy From TechTrek Outpost?
</h3>

<p style="font-size: 16px; line-height: 1.6; text-align: center; color: #ffffff;">
At TechTrek Outpost, we focus on authentic, collector-focused memorabilia with clear authentication details and careful packaging.
</p>

<table style="width: 100%; border-collapse: collapse; font-size: 15px; color: #ffffff; margin-top: 12px; text-align: left;">
<tr>
<td style="padding: 8px; width: 50%;">&#10003; Authenticated memorabilia only</td>
<td style="padding: 8px; width: 50%;">&#10003; Third-party authentication details provided</td>
</tr>
<tr>
<td style="padding: 8px;">&#10003; Exact item shown in photos</td>
<td style="padding: 8px;">&#10003; Professionally packaged with care</td>
</tr>
<tr>
<td style="padding: 8px;">&#10003; Clear certification information</td>
<td style="padding: 8px;">&#10003; Collector-friendly buying experience</td>
</tr>
</table>
</div>

<div style="padding: 0 4% 10px 4%;">
<h3 style="font-size: 20px; color: #111111; border-bottom: 2px solid #b37a16; padding-bottom: 6px;">
Shipping &amp; Handling
</h3>

<p style="font-size: 16px; line-height: 1.6;">
This collectible will be carefully packaged to help ensure it arrives safely and in the condition shown in the listing photos.
</p>
</div>

<div style="margin: 22px 4%; padding: 16px; background-color: #fff4f4; border: 1px solid #d8a6a6; border-radius: 6px;">
<h3 style="font-size: 19px; color: #111111; margin-top: 0;">
Please Review Photos
</h3>

<p style="font-size: 15px; line-height: 1.6; margin-bottom: 0;">
Please review all listing photos carefully for condition, autograph placement, inscription, and authentication details.
The item shown in the photos is the exact item you will receive.
</p>
</div>

<div style="background-color: #111111; color: #f1c15b; padding: 16px; text-align: center; font-size: 14px;">
TechTrek Outpost | Authentic Memorabilia | Carefully Sourced | Securely Packaged
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
