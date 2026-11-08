/**
 * eBay HTML Listing Generator for Outpost Tracker
 * Generates an advanced dark-theme, modular card layout compatible with
 * eBay Sell Inventory API and Outpost inventory schema.
 */

export const generateEbayListingHtml = (item = {}) => {
  // Parse Outpost attributes if stored as JSON string
  let parsedAttrs = {};
  if (typeof item.attributes === 'string') {
    try {
      parsedAttrs = JSON.parse(item.attributes);
    } catch {
      parsedAttrs = {};
    }
  } else if (item.attributes && typeof item.attributes === 'object') {
    parsedAttrs = item.attributes;
  }

  // Dynamic mapping with Outpost inventory schema fallbacks
  const title = (item.title || item.item_name || parsedAttrs.title || 'Authentic Collectible').trim();
  const description = (item.description || item.notes || item.additional_description || parsedAttrs.description || '').trim();
  const conditionDetails = (
    item.conditionDetails ||
    item.condition_details ||
    (item.condition ? `Condition: ${item.condition}. Please review all photos carefully for the exact condition, quality, and details.` : null) ||
    parsedAttrs.conditionDetails ||
    'Please review all photos carefully for the exact condition, quality, and details.'
  ).trim();

  const brand = (item.brand || parsedAttrs.brand || '').trim();
  const model = (item.model || parsedAttrs.model || '').trim();

  // Handle features (array, string, or parsed attributes)
  let rawFeatures = item.features || parsedAttrs.features || [];
  if (typeof rawFeatures === 'string') {
    rawFeatures = rawFeatures.split('\n').map(f => f.trim().replace(/^[-•*]\s*/, '')).filter(Boolean);
  }
  const features = Array.isArray(rawFeatures) ? rawFeatures.filter(Boolean) : [];

  // Intelligently resolve authentication:
  // 1. Explicit authentication object provided
  // 2. Outpost schema fields: authenticator, cert_number, athlete_person, auth_type
  let authentication = null;
  if (item.authentication && typeof item.authentication === 'object') {
    authentication = item.authentication;
  } else {
    const rawAuth = (item.authenticator || parsedAttrs.authenticator || '').trim();
    const certNum = (item.certNumber || item.cert_number || parsedAttrs.cert_number || '').trim();
    const athlete = (item.athlete || item.athlete_person || parsedAttrs.athlete_person || '').trim();
    const authType = (item.authType || item.auth_type || parsedAttrs.auth_type || (athlete ? `Witnessed / Autograph (${athlete})` : 'Professional Certification')).trim();

    const isCertified = Boolean(rawAuth && !['Raw', 'Uncertified', 'None', 'Other', 'N/A', ''].includes(rawAuth));
    const isAutographed = Boolean(athlete || isCertified || item.inscription || parsedAttrs.inscription);

    if (isCertified || (isAutographed && certNum)) {
      authentication = {
        provider: rawAuth || 'Certified Authentication',
        certNumber: certNum || 'N/A',
        type: authType || 'Witnessed'
      };
    }
  }

  // Handle included items (array, string, or parsed attributes)
  let rawIncluded = item.includedItems || item.included_items || item.includedInSale || parsedAttrs.included_items || [];
  if (typeof rawIncluded === 'string') {
    rawIncluded = rawIncluded.split('\n').map(i => i.trim().replace(/^[-•*]\s*/, '')).filter(Boolean);
  }
  const includedItems = Array.isArray(rawIncluded) ? rawIncluded.filter(Boolean) : [];

  // Build Key Details list
  const keyDetailsList = features.length > 0 
    ? features.map(f => `<li>${f}</li>`).join('') 
    : `<li>Brand: ${brand || 'N/A'}</li><li>Model: ${model || 'N/A'}</li><li>The item pictured is the exact item you will receive</li>`;

  // Build Authentication block (Conditional)
  const authBlock = authentication ? `
  <div style="background-color:rgb(17,17,17); border:1px solid rgb(51,51,51); padding:18px; margin-bottom:15px; border-radius:6px;">
    <h3 style="color:rgb(241,193,91); margin-top:0;">Authentication</h3>
    <p style="color:#e0e0e0; margin-bottom:10px;">This item has been professionally authenticated.</p>
    <ul style="margin:0; padding-left:20px; color:#e0e0e0;">
      <li>Authentication: ${authentication.provider}</li>
      <li>Certification Number: ${authentication.certNumber}</li>
      <li>Details: ${authentication.type}</li>
    </ul>
  </div>` : '';

  // Build Included Items list
  const includedList = includedItems.length > 0
    ? includedItems.map(i => `<li>${i}</li>`).join('')
    : `<li>${title}</li><li>Exact item shown in the photos</li>`;

  return `
<div style="font-family: Arial, Helvetica, sans-serif; color:#ffffff; max-width:900px; margin:0 auto; line-height:1.5;">

  <!-- Header Banner -->
  <div style="background-color:rgb(17,17,17); border:1px solid rgb(214,181,109); padding:18px; margin-bottom:15px; border-radius:6px; text-align:center;">
    <h2 style="color:rgb(241,193,91); margin-top:0;">${title}</h2>
    <p style="margin-bottom:0; color:#e0e0e0;">${description}</p>
  </div>

  <!-- Condition Section -->
  <div style="background-color:rgb(17,17,17); border:1px solid rgb(51,51,51); padding:18px; margin-bottom:15px; border-radius:6px;">
    <h3 style="color:rgb(241,193,91); margin-top:0;">Condition</h3>
    <p style="margin-bottom:0; color:#e0e0e0;">${conditionDetails}</p>
  </div>

  <!-- Key Details Section -->
  <div style="background-color:rgb(17,17,17); border:1px solid rgb(51,51,51); padding:18px; margin-bottom:15px; border-radius:6px;">
    <h3 style="color:rgb(241,193,91); margin-top:0;">Key Details</h3>
    <ul style="margin:0; padding-left:20px; color:#e0e0e0;">
      ${keyDetailsList}
    </ul>
  </div>

  ${authBlock}

  <!-- Included Items Section -->
  <div style="background-color:rgb(17,17,17); border:1px solid rgb(51,51,51); padding:18px; border-radius:6px;">
    <h3 style="color:rgb(241,193,91); margin-top:0;">What's Included</h3>
    <ul style="margin:0; padding-left:20px; color:#e0e0e0;">
      ${includedList}
    </ul>
  </div>

</div>
  `.trim();
};
