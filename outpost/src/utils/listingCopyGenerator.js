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
  const bannerUrl = isSports 
    ? 'https://raw.githubusercontent.com/TechTrek-Globe/TechTrekGT/main/outpost/public/ebay-banner-sports.png'
    : 'https://raw.githubusercontent.com/TechTrek-Globe/TechTrekGT/main/outpost/public/ebay-banner-collectibles.jpg';

  // Modern Responsive HTML Template for eBay Description Editor
  const htmlBody = `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 750px; margin: 0 auto; background: #0f172a; color: #f8fafc; border-radius: 16px; overflow: hidden; border: 1px solid #334155;">
  <!-- Header Image Banner -->
  <div style="width: 100%; overflow: hidden; border-bottom: 1px solid #334155;">
    <img src="${bannerUrl}" alt="TechTrek Outpost Banner" style="width: 100%; display: block; height: auto; border: 0;" />
  </div>

  <!-- Header Banner -->
  <div style="background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%); padding: 24px 28px; border-bottom: 2px solid #f59e0b;">
    <span style="font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 1.5px; color: #f59e0b;">TechTrek Outpost · Authentic Memorabilia</span>
    <h1 style="font-size: 20px; font-weight: 900; color: #ffffff; margin: 6px 0 0 0; line-height: 1.3;">${item.item_name}</h1>
  </div>

  <!-- Specs Grid -->
  <div style="padding: 24px 28px;">
    <div style="background: #1e293b; border-radius: 12px; padding: 18px; border: 1px solid #334155; margin-bottom: 20px;">
      <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
        ${athlete ? `<tr><td style="padding: 6px 0; color: #94a3b8; width: 35%;">Athlete / Subject:</td><td style="padding: 6px 0; color: #ffffff; font-weight: 700;">${athlete}</td></tr>` : ''}
        <tr><td style="padding: 6px 0; color: #94a3b8;">Category:</td><td style="padding: 6px 0; color: #ffffff; font-weight: 700;">${category}</td></tr>
        <tr><td style="padding: 6px 0; color: #94a3b8;">Authenticator / Grade:</td><td style="padding: 6px 0; color: #f59e0b; font-weight: 800;">${authenticator} ${certNumber ? `(#${certNumber})` : ''}</td></tr>
        ${certUrl ? `<tr><td style="padding: 6px 0; color: #94a3b8;">Cert Verification:</td><td style="padding: 6px 0;"><a href="${certUrl}" target="_blank" style="color: #38bdf8; text-decoration: underline; font-weight: 700;">Verify Online ↗</a></td></tr>` : ''}
        <tr><td style="padding: 6px 0; color: #94a3b8;">Condition:</td><td style="padding: 6px 0; color: #10b981; font-weight: 700;">${condition}</td></tr>
      </table>
    </div>

    <!-- Description Details -->
    <h3 style="font-size: 14px; font-weight: 800; text-transform: uppercase; color: #f59e0b; letter-spacing: 1px; margin: 20px 0 8px 0;">Authentication & Quality</h3>
    <ul style="font-size: 13px; color: #cbd5e1; line-height: 1.7; padding-left: 20px; margin: 0 0 20px 0;">
      <li>100% Guaranteed Authentic signed collectible piece.</li>
      ${certNumber ? `<li>Tamper-evident certification registered with <strong>${authenticator}</strong>.</li>` : ''}
      <li>Carefully inspected and stored in temperature-controlled, smoke-free conditions.</li>
      <li>Actual item pictured in listing photos.</li>
    </ul>

    <!-- Shipping Section -->
    <h3 style="font-size: 14px; font-weight: 800; text-transform: uppercase; color: #38bdf8; letter-spacing: 1px; margin: 20px 0 8px 0;">Fast & Secure Shipping</h3>
    <p style="font-size: 13px; color: #cbd5e1; line-height: 1.6; margin: 0 0 20px 0;">
      ${shippingPolicy} Every collectible is individually protected in reinforced packaging to prevent any transit damage.
    </p>

    <!-- Return Policy -->
    <h3 style="font-size: 14px; font-weight: 800; text-transform: uppercase; color: #10b981; letter-spacing: 1px; margin: 20px 0 8px 0;">Peace of Mind Guarantee</h3>
    <p style="font-size: 13px; color: #cbd5e1; line-height: 1.6; margin: 0;">
      ${returnPolicy}
    </p>
  </div>

  <!-- Footer -->
  <div style="background: #090d16; padding: 14px 28px; text-align: center; border-top: 1px solid #1e293b; font-size: 11px; color: #64748b;">
    TechTrek Outpost · Verified Sports Memorabilia & Collectibles
  </div>
</div>
`.trim();

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
