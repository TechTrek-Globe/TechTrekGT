import { requireAuth, withAuth, ok, err } from '../../utils/guard.js';
import { fetchWithTimeout } from '../ebay/tokenHelper.js';
import { generateEbayListingHtml, wrapEbayFullTemplate, scrubCustomJerseyClaims, escapeHtml, stripInternalTrackingNotes, sanitizeListingHtml } from '../../../src/utils/ebayTemplate.js';
import {
  SUPPORTED_PLATFORMS,
  PLATFORM_RULES_REGISTRY,
  getPlatformRules,
  computeUtf16Length,
  sanitizeNoEmDash,
  detectItemVariantFlags,
  buildPlatformPayload,
  validatePlatformPayload,
  buildPlatformSystemPrompt,
  normalizeListingTitleTokens
} from '../../../src/utils/platformListingRules.js';

/**
 * Extracts plain text from Gemini API response structures.
 * Supports both the modern Interactions API format and the generateContent format.
 *
 * @param {object} data
 * @returns {string}
 */
function extractTextFromGeminiResponse(data) {
  if (!data || typeof data !== 'object') return '';

  // 1. Direct output_text convenience property
  if (typeof data.output_text === 'string' && data.output_text.trim()) {
    return data.output_text.trim();
  }

  // 2. Interactions API steps schema
  if (Array.isArray(data.steps)) {
    const textParts = [];
    for (const step of data.steps) {
      if (step.type === 'model_output' && Array.isArray(step.content)) {
        for (const item of step.content) {
          if (item.type === 'text' && typeof item.text === 'string') {
            textParts.push(item.text);
          }
        }
      }
    }
    if (textParts.length > 0) {
      return textParts.join('').trim();
    }
  }

  // 3. Classic generateContent candidates schema
  if (Array.isArray(data.candidates) && data.candidates[0]?.content?.parts) {
    const partsText = data.candidates[0].content.parts
      .map(p => (typeof p.text === 'string' ? p.text : ''))
      .join('');
    if (partsText.trim()) {
      return partsText.trim();
    }
  }

  return '';
}

const GEMINI_MODELS = [
  { id: 'gemini-3.5-flash-lite', timeoutMs: 8000 },
  { id: 'gemini-3.8-flash', timeoutMs: 10000 },
  { id: 'gemini-2.5-flash', timeoutMs: 10000 }
];
const TRANSIENT_GEMINI_STATUSES = new Set([429, 500, 502, 503, 504]);
const TOTAL_GEMINI_BUDGET_MS = 14000;

function buildGeminiUpstreamError(status, lastError) {
  if (status === 401 || status === 403) {
    return Object.assign(
      new Error(`Gemini API authentication failed (${status}). Please check GEMINI_API_KEY configuration.`),
      { statusCode: 502 }
    );
  }
  if (status === 429) {
    return Object.assign(
      new Error('Gemini API rate limit exceeded (429). Please wait a moment and try again.'),
      { statusCode: 429 }
    );
  }
  if (status === 503) {
    return Object.assign(
      new Error('Gemini AI service is temporarily overloaded (503). Please try again in a few moments.'),
      { statusCode: 503 }
    );
  }
  if (status === 400 || status === 404) {
    return Object.assign(
      new Error(`Gemini API request rejected (${status}). Please verify model and request configuration.`),
      { statusCode: 502 }
    );
  }
  if (status && status >= 500) {
    return Object.assign(
      new Error(`Gemini AI service returned an upstream error (${status}). Please try again.`),
      { statusCode: 502 }
    );
  }
  if (lastError && (lastError.isTimeout || lastError.name === 'TimeoutError' || /timeout/i.test(lastError.message))) {
    return Object.assign(
      new Error('AI generation timed out after 15 seconds. Please try again.'),
      { statusCode: 504, isTimeout: true }
    );
  }
  if (lastError) {
    return Object.assign(
      new Error(lastError.message || 'Failed to communicate with AI generation service.'),
      { statusCode: 500 }
    );
  }
  return Object.assign(
    new Error('Gemini API returned an empty response. Please try again.'),
    { statusCode: 502 }
  );
}

/**
 * Calls Google Gemini API using gemini-3.5-flash-lite (primary) with gemini-3.8-flash and
 * gemini-2.5-flash fallbacks, exponential backoff on transient 429/503 responses,
 * fetchWithTimeout (AUDIT-003 15s max), and header-only API key transmission.
 */
async function callGeminiWithFallback(apiKey, systemInstruction, userPrompt, responseMimeType = null) {
  let generatedText = '';
  const cleanApiKey = apiKey.trim();
  const startedAt = Date.now();
  let lastStatus = null;
  let lastError = null;

  const getRemainingBudgetMs = () => TOTAL_GEMINI_BUDGET_MS - (Date.now() - startedAt);
  const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  const callGenerateContent = async (model, timeoutMs = 15000) => {
    const clampedTimeout = Math.max(1000, Math.min(15000, timeoutMs));
    const generateContentUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
    const bodyPayload = {
      systemInstruction: {
        parts: [{ text: systemInstruction }]
      },
      contents: [
        {
          role: 'user',
          parts: [{ text: userPrompt }]
        }
      ]
    };
    if (responseMimeType) {
      bodyPayload.generationConfig = { responseMimeType };
    }
    return fetchWithTimeout(generateContentUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': cleanApiKey
      },
      body: JSON.stringify(bodyPayload)
    }, clampedTimeout);
  };

  for (let mIdx = 0; mIdx < GEMINI_MODELS.length && !generatedText; mIdx++) {
    const { id: modelId, timeoutMs } = GEMINI_MODELS[mIdx];
    // Allow 1 backoff retry on the primary model for transient 429/503 spikes when budget permits
    const maxAttempts = mIdx === 0 ? 2 : 1;

    for (let attempt = 0; attempt < maxAttempts && !generatedText; attempt++) {
      const remaining = getRemainingBudgetMs();
      if (remaining <= 1000) break;

      if (attempt > 0 || mIdx > 0) {
        const backoffMs = Math.min(800, 350 * Math.pow(2, attempt) + Math.floor(Math.random() * 150));
        if (remaining - backoffMs > 1500) {
          await sleep(backoffMs);
        }
      }

      const callTimeout = Math.min(timeoutMs, Math.max(1000, getRemainingBudgetMs()));
      try {
        const res = await callGenerateContent(modelId, callTimeout);
        if (res.ok) {
          const data = await res.json().catch(() => ({}));
          generatedText = extractTextFromGeminiResponse(data);
          if (generatedText) break;
          console.warn(`[generate-ebay-details] ${modelId} returned 200 OK with empty text.`);
          break;
        }

        lastStatus = res.status;
        const errBody = await res.text().catch(() => '');
        console.warn(`[generate-ebay-details] ${modelId} attempt ${attempt + 1} returned ${res.status}: ${errBody.slice(0, 200)}`);

        // Auth or client request errors will not succeed on retry or alternate models
        if (res.status === 401 || res.status === 403) {
          throw buildGeminiUpstreamError(res.status, null);
        }
        if (!TRANSIENT_GEMINI_STATUSES.has(res.status)) {
          break;
        }
      } catch (apiErr) {
        if (apiErr.statusCode && apiErr.statusCode !== 504) {
          throw apiErr;
        }
        lastError = apiErr;
        console.warn(`[generate-ebay-details] ${modelId} attempt ${attempt + 1} exception: ${apiErr.message}`);
      }
    }
  }

  if (!generatedText || !generatedText.trim()) {
    throw buildGeminiUpstreamError(lastStatus, lastError);
  }

  return generatedText;
}

/**
 * Generates context-aware eBay listing HTML cards (Condition and Key Details)
 * using the Google Gemini API (gemini-3.5-flash-lite with gemini-3.8-flash / gemini-2.5-flash fallbacks).
 *
 * @param {object} env - Cloudflare Worker env (GEMINI_API_KEY)
 * @param {object} itemData - Item details and notes
 * @returns {Promise<{ success: boolean, html: string }>}
 */
export async function generateAiListingDetails(env, itemData = {}) {
  const rawApiKey = env?.GEMINI_API_KEY || (typeof process !== 'undefined' ? process.env?.GEMINI_API_KEY : '');
  const apiKey = (rawApiKey || '').trim().replace(/^['"]+|['"]+$/g, '');
  if (!apiKey) {
    throw Object.assign(new Error('AI generation service is not configured (missing GEMINI_API_KEY).'), { statusCode: 503 });
  }

  const {
    title = '',
    brand = '',
    productType = '',
    itemSubtype = '',
    color = '',
    condition = '',
    conditionHeader = '',
    conditionSubheader = '',
    authType = '',
    framingStatus = '',
    frameDimensions = '',
    inkColor = '',
    dimensions = '',
    notes = '',
    specs = '',
    features = ''
  } = itemData;

  const trimmedTitle = String(title || '').trim();
  const trimmedNotes = String(notes || '').trim();

  if (!trimmedTitle && !trimmedNotes) {
    throw Object.assign(new Error('Item title or notes are required to generate AI listing details.'), { statusCode: 400 });
  }

  // Format specs into human-readable string if array/object
  let specsText = '';
  if (typeof specs === 'string') {
    specsText = specs.trim();
  } else if (Array.isArray(specs)) {
    specsText = specs.map(s => (s?.label && s?.value ? `${s.label}: ${s.value}` : String(s))).join('\n');
  } else if (specs && typeof specs === 'object') {
    specsText = Object.entries(specs).map(([k, v]) => `${k}: ${v}`).join('\n');
  }

  // Format features into string if array
  let featuresText = '';
  if (typeof features === 'string') {
    featuresText = features.trim();
  } else if (Array.isArray(features)) {
    featuresText = features.map(f => String(f).trim()).filter(Boolean).join('\n');
  }

  // Construct prompt for Gemini API
  const flags = detectItemVariantFlags(itemData, itemData);
  const systemInstruction = [
    'You are a professional, high-volume eBay copywriter for TechTrek Outpost covering all item types (sports memorabilia, music/entertainment collectibles, electronics, tools, vintage glass, apparel, and general goods).',
    'Your task is to generate ONLY the Block 2 Clean White Specifications Card ("Item Details & Specifications") HTML.',
    'Rules:',
    '1. Match the exact high-contrast inline styling of Block 2 (NEVER output dark #111111 wrappers, NEVER include <span property="description">, and NEVER output a duplicate Authentication section):',
    '   - Wrap the card in: <div style="background-color: #ffffff; border: 1px solid #dddddd; color: #111111; padding: 18px; margin-bottom: 15px; border-radius: 6px;">',
    '   - Heading MUST be: <h3 style="color: #111111; margin: 0 0 10px 0; padding-bottom: 6px; border-bottom: 2px solid #b37a16;">Item Details &amp; Specifications</h3>',
    '   - Bullet list MUST use: <ul style="margin: 0; padding-left: 20px; color: #111111; line-height: 1.7;"><li><strong>Label:</strong> Value</li></ul> (omit empty or N/A rows).',
    '   - If adding a brief condition/feature paragraph inside the white card, use: <p style="margin: 0 0 10px 0; color: #111111;">...</p>',
    '   - Lead paragraph phrasing: If adding a lead paragraph, use format-neutral, grammatically correct phrasing: "This listing features a custom..." (NEVER use "auction", and NEVER use "an custom" - always use "a custom" and "this listing").',
    '   - Disclosure Placement: NEVER include any "Custom Jersey Disclosure" or "Collector Disclosure" paragraph in Block 2 (disclosures are handled automatically in Block 4 What\'s Included & Collector Notes). Keep Block 2 strictly focused on Item Details & Specifications.',
    '2. Custom Jersey Anti-Spoofing Rule: NEVER claim "official [Team] jersey", "authentic jersey", or mention Nike, Adidas, Mitchell & Ness, Reebok, Fanatics, NFL, MLB, NBA, NHL, or NCAA unless the item is explicitly marked as an official licensed retail/on-field brand. Describe custom jerseys strictly as custom stitched collectible display jerseys.',
    '3. Strict Punctuation Rule: NEVER use em dashes or en dashes anywhere. Use standard hyphens (-), colons (:), or parentheses () exclusively.',
    '4. Output ONLY the raw HTML code for the single Block 2 <div> element. Do NOT output markdown code fences (no ```html), do not output outer page wrappers or commentary.',
    '5. Strict Privacy Rule: NEVER include internal warehouse, auction, or inventory tracking references (such as "Inventory tracked:", "Lot #", "Item #", "Order ID", "ASIN", invoice numbers, or internal stock identifiers) anywhere in the output.'
  ].join('\n');

  const cleanNotes = stripInternalTrackingNotes(trimmedNotes);

  const promptLines = [
    `Item Title: ${trimmedTitle || 'Authentic Item'}`,
    brand.trim() ? `Brand: ${brand.trim()}` : null,
    productType.trim() ? `Product Type / Category: ${productType.trim()}${itemSubtype.trim() ? ` (${itemSubtype.trim()})` : ''}` : null,
    color.trim() ? `Color: ${color.trim()}` : null,
    condition.trim() ? `Condition: ${condition.trim()}` : null,
    (conditionHeader.trim() || conditionSubheader.trim())
      ? `Condition Notes: ${[conditionHeader.trim(), conditionSubheader.trim()].filter(Boolean).join(' : ')}`
      : null,
    authType.trim() ? `Authentication Tier: ${authType.trim()}` : null,
    framingStatus.trim() ? `Display / Framing: ${framingStatus.trim()}${frameDimensions.trim() ? ` (${frameDimensions.trim()})` : ''}` : null,
    inkColor.trim() ? `Ink Color: ${inkColor.trim()}` : null,
    dimensions.trim() ? `Dimensions: ${dimensions.trim()}` : null,
    flags.isCustomJersey ? 'Variant Flag: Custom Stitched Collectible Jersey (never use official/authentic jersey or pro brand names)' : null,
    specsText ? `Technical Specifications:\n${specsText}` : null,
    featuresText ? `Features / Highlights:\n${featuresText}` : null,
    cleanNotes ? `Seller Notes / Raw Description:\n${cleanNotes}` : null
  ].filter(Boolean);

  const userPrompt = promptLines.join('\n\n');
  const generatedText = await callGeminiWithFallback(apiKey, systemInstruction, userPrompt);

  // Sanitize markdown fences, HTML tags/attributes, and whitespace
  const withoutFences = generatedText.replace(/^```(?:html)?\s*/i, '').replace(/```$/i, '').trim();
  let sanitizedHtml = sanitizeListingHtml(withoutFences);

  // Strip any leaked internal tracking or warehouse lot metadata
  sanitizedHtml = stripInternalTrackingNotes(sanitizedHtml);
  if (flags.isCustomJersey) {
    sanitizedHtml = scrubCustomJerseyClaims(sanitizedHtml);
  }

  // Normalize grammar and format-neutral phrasing
  sanitizedHtml = sanitizedHtml
    .replace(/\b(?:This|In\s+this)\s+auction\s+features\s+an?\s+custom\b/gi, 'This listing features a custom')
    .replace(/\bThis\s+auction\s+features\s+an\b/gi, 'This listing features a')
    .replace(/\bThis\s+auction\s+features\b/gi, 'This listing features')
    .replace(/\bIn\s+this\s+auction\b/gi, 'In this listing')
    .replace(/\bin\s+this\s+auction\b/gi, 'in this listing')
    .replace(/\ban\s+custom\b/gi, 'a custom')
    .replace(/\bthis\s+auction\b/gi, 'this listing');

  // Strip duplicate custom jersey disclosure from Block 2
  sanitizedHtml = sanitizedHtml
    .replace(/<p\b[^>]*>\s*(?:<strong>)?\s*(?:(?:Collectible\s+)?Custom\s+Jersey\s+Disclosure|Collector\s+Disclosure):?[\s\S]*?<\/p>\s*/gi, '')
    .replace(/<div\b[^>]*>\s*(?:<strong>)?\s*(?:(?:Collectible\s+)?Custom\s+Jersey\s+Disclosure|Collector\s+Disclosure):?[\s\S]*?<\/div>\s*/gi, '');

  return {
    success: true,
    html: sanitizedHtml
  };
}

/**
 * Generates a policy-compliant, platform-specific structured JSON listing payload
 * for ebay, facebook, mercari, whatnot, or reverb using Gemini + deterministic rules fallback.
 */
export async function generateAiPlatformListing(env, itemData = {}) {
  const rawApiKey = env?.GEMINI_API_KEY || (typeof process !== 'undefined' ? process.env?.GEMINI_API_KEY : '');
  const apiKey = (rawApiKey || '').trim().replace(/^['"]+|['"]+$/g, '');
  if (!apiKey) {
    throw Object.assign(new Error('AI generation service is not configured (missing GEMINI_API_KEY).'), { statusCode: 503 });
  }

  const normPlatform = String(itemData.platform || 'ebay').toLowerCase().trim();
  if (!SUPPORTED_PLATFORMS.includes(normPlatform)) {
    throw Object.assign(new Error(`Unsupported platform "${normPlatform}". Supported: ${SUPPORTED_PLATFORMS.join(', ')}`), { statusCode: 400 });
  }

  const trimmedTitle = String(itemData.title || itemData.item_name || '').trim();
  const trimmedNotes = String(itemData.notes || itemData.description || '').trim();
  if (!trimmedTitle && !trimmedNotes) {
    throw Object.assign(new Error('Item title or notes are required to generate AI listing details.'), { statusCode: 400 });
  }

  const rules = getPlatformRules(normPlatform);
  const systemInstruction = buildPlatformSystemPrompt(normPlatform);
  const cleanNotes = stripInternalTrackingNotes(trimmedNotes);
  const flags = detectItemVariantFlags(itemData, itemData);

  const promptLines = [
    `Target Platform: ${rules.name} (${normPlatform})`,
    `Title: ${trimmedTitle}`,
    itemData.athlete ? `Signer / Athlete / Artist: ${itemData.athlete}` : null,
    itemData.teamOrBand ? `Team / Band / Franchise: ${itemData.teamOrBand}` : null,
    itemData.sportOrGenre ? `Sport / Genre: ${itemData.sportOrGenre}` : null,
    itemData.productType ? `Base Item Type: ${itemData.productType}` : null,
    itemData.brand ? `Brand: ${itemData.brand}` : null,
    itemData.condition ? `Condition: ${itemData.condition}` : null,
    itemData.authenticator ? `Authenticator: ${itemData.authenticator}` : null,
    itemData.certNumber ? `Cert #: ${itemData.certNumber}` : null,
    itemData.inscription ? `Inscription / Milestone: ${itemData.inscription}` : null,
    itemData.size ? `Wearable Size: ${itemData.size}` : null,
    itemData.targetNet ? `Target Net Payout USD: ${itemData.targetNet}` : null,
    flags.isCustomJersey ? 'Variant Flag: Custom Stitched Jersey (zero protected brands)' : null,
    flags.isPickguardSignedGuitar ? 'Variant Flag: Signed Pickguard mounted to generic display acoustic guitar' : null,
    cleanNotes ? `Item Notes:\n${cleanNotes}` : null
  ].filter(Boolean);

  const rawText = await callGeminiWithFallback(apiKey, systemInstruction, promptLines.join('\n'), 'application/json');
  const cleanedJsonText = rawText.replace(/^```(?:json)?\s*/i, '').replace(/```$/i, '').trim();

  let aiJson = {};
  try {
    aiJson = JSON.parse(cleanedJsonText);
  } catch {
    aiJson = {};
  }

  // Build deterministic baseline payload and merge valid AI fields cleanly
  const { payload: baseline } = buildPlatformPayload(normPlatform, itemData, itemData);
  const merged = {
    ...baseline,
    ...(aiJson && typeof aiJson === 'object' ? aiJson : {})
  };

  // Enforce deterministic pricing, logistics, brand nulling, and sanitization invariants
  merged.pricing_guidance = baseline.pricing_guidance;
  if (baseline.logistics) merged.logistics = baseline.logistics;
  if (baseline.shipping_profile) merged.shipping_profile = baseline.shipping_profile;
  if (normPlatform === 'facebook' && (flags.isCustomJersey || flags.isPickguardSignedGuitar || flags.isUnbrandedGuitar)) {
    merged.brand = null;
  }

  merged.title = normalizeListingTitleTokens(
    sanitizeNoEmDash(stripInternalTrackingNotes(String(merged.title || baseline.title))),
    itemData
  );
  if (computeUtf16Length(merged.title) > 80 || !merged.title) {
    merged.title = baseline.title;
  }

  if (normPlatform === 'facebook') {
    merged.relist_title = normalizeListingTitleTokens(
      sanitizeNoEmDash(stripInternalTrackingNotes(String(merged.relist_title || baseline.relist_title))),
      itemData,
      { authVerb: 'Autographed' }
    );
    if (computeUtf16Length(merged.relist_title) > 80 || !merged.relist_title) {
      merged.relist_title = baseline.relist_title;
    }
    merged.char_count = computeUtf16Length(merged.title);
  } else if (normPlatform === 'ebay') {
    merged.ebay_char_count = computeUtf16Length(merged.title);
  } else {
    merged.title_char_count = computeUtf16Length(merged.title);
  }

  if (normPlatform === 'ebay') {
    if (aiJson && typeof aiJson.description_html === 'string' && aiJson.description_html.trim()) {
      const rawAiDesc = aiJson.description_html.trim();
      let middleHtml = rawAiDesc;
      const startMarker = 'ADD LISTING INFO HERE';
      const endMarker = 'END LISTING INFO HERE';
      if (rawAiDesc.includes(startMarker) && rawAiDesc.includes(endMarker)) {
        const startIdx = rawAiDesc.indexOf('-->', rawAiDesc.indexOf(startMarker));
        const endIdx = rawAiDesc.lastIndexOf('<!--', rawAiDesc.indexOf(endMarker));
        if (startIdx !== -1 && endIdx > startIdx) {
          middleHtml = rawAiDesc.slice(startIdx + 3, endIdx).trim();
        }
      }
      let cleanMiddle = sanitizeNoEmDash(stripInternalTrackingNotes(sanitizeListingHtml(middleHtml)));
      if (flags.isCustomJersey) {
        cleanMiddle = scrubCustomJerseyClaims(cleanMiddle);
      }
      const wrappedInsert = generateEbayListingHtml({
        ...itemData,
        title: merged.title,
        aiGeneratedMiddleSection: cleanMiddle
      });
      merged.insert_html = wrappedInsert;
      merged.description_html = wrapEbayFullTemplate(wrappedInsert, itemData);
    } else {
      merged.description_html = baseline.description_html;
      merged.insert_html = baseline.insert_html;
    }
  } else if (merged.description_html) {
    merged.description_html = sanitizeNoEmDash(stripInternalTrackingNotes(sanitizeListingHtml(merged.description_html)));
    if (flags.isCustomJersey) {
      merged.description_html = scrubCustomJerseyClaims(merged.description_html);
    }
    if (!/\bsmoke[\s-]?free\b/i.test(merged.description_html)) {
      merged.description_html += '\n<p><strong>Care &amp; Storage:</strong> Smoke-Free Collection.</p>';
    }
  }

  if (merged.description_plain_text) {
    merged.description_plain_text = sanitizeNoEmDash(stripInternalTrackingNotes(String(merged.description_plain_text).replace(/<[^>]+>/g, ' ')));
    if (flags.isCustomJersey) {
      merged.description_plain_text = scrubCustomJerseyClaims(merged.description_plain_text);
    }
    if (!/\bsmoke[\s-]?free\b/i.test(merged.description_plain_text)) {
      const smokeNote = 'Smoke-Free Collection.';
      if (normPlatform === 'mercari') {
        const tagMatch = merged.description_plain_text.match(/\n\n(#\S+(?:\s+#\S+)*)$/);
        if (tagMatch) {
          const bodyPart = merged.description_plain_text.slice(0, tagMatch.index).trim();
          const candidate = `${bodyPart}\n• Storage: ${smokeNote}${tagMatch[0]}`;
          if (candidate.length <= 1000) {
            merged.description_plain_text = candidate;
          }
        } else if ((merged.description_plain_text.length + smokeNote.length + 1) <= 1000) {
          merged.description_plain_text = `${merged.description_plain_text}\n${smokeNote}`;
        }
      } else {
        merged.description_plain_text = `${merged.description_plain_text}\n• Storage: ${smokeNote}`;
      }
    }
    if (normPlatform === 'mercari' && merged.description_plain_text.length > 1000) {
      merged.description_plain_text = baseline.description_plain_text;
    }
  }

  const validation = validatePlatformPayload(normPlatform, merged, itemData);
  merged.validation_passed = validation.passed;

  return {
    success: true,
    platform: normPlatform,
    rules_version: '2026.1',
    payload: merged,
    validation,
    html: merged.description_html || ''
  };
}

/**
 * POST /api/ai/generate-ebay-details
 *
 * Supports two modes:
 * 1) Default legacy mode: returns { success, html } with eBay Condition and Key Details cards.
 * 2) Multi-platform mode (mode === 'platform_listing' or responseFormat === 'json'):
 *    returns { success, platform, payload, validation, html }.
 */
export async function onRequestPost(context) {
  const { request, env } = context;

  return withAuth(async () => {
    // Authenticate user via JWT session cookie / token_version check
    await requireAuth(request, env);

    const rawApiKey = env.GEMINI_API_KEY || (typeof process !== 'undefined' ? process.env?.GEMINI_API_KEY : '');
    const apiKey = (rawApiKey || '').trim().replace(/^['"]+|['"]+$/g, '');
    if (!apiKey) {
      return err('AI generation service is not configured (missing GEMINI_API_KEY).', 503);
    }

    const body = await request.json().catch(() => ({}));
    const trimmedTitle = String(body?.title || body?.item_name || '').trim();
    const trimmedNotes = String(body?.notes || body?.description || '').trim();

    if (!trimmedTitle && !trimmedNotes) {
      return err('Item title or notes are required to generate AI listing details.', 400);
    }

    try {
      if (body?.mode === 'platform_listing' || (body?.platform && body?.responseFormat === 'json')) {
        const result = await generateAiPlatformListing(env, body);
        return ok(result);
      }
      const result = await generateAiListingDetails(env, body);
      return ok(result);
    } catch (e) {
      const status = e.statusCode || (e.isTimeout ? 504 : 500);
      return err(e.message, status);
    }
  });
}

