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

/**
 * Calls Google Gemini API using gemini-3.5-flash-lite (primary) with gemini-3.5-flash (fallback),
 * enforcing fetchWithTimeout (AUDIT-003 15s max) and header-only API key transmission.
 */
async function callGeminiWithFallback(apiKey, systemInstruction, userPrompt, responseMimeType = null) {
  let generatedText = '';
  const cleanApiKey = apiKey.trim();

  const callGenerateContent = async (model, timeoutMs = 15000) => {
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
    }, timeoutMs);
  };

  try {
    // Primary attempt: gemini-3.5-flash-lite for fast, low-latency generation
    try {
      const primaryRes = await callGenerateContent('gemini-3.5-flash-lite', 10000);
      if (primaryRes.ok) {
        const data = await primaryRes.json().catch(() => ({}));
        generatedText = extractTextFromGeminiResponse(data);
      } else {
        const errBody = await primaryRes.text().catch(() => '');
        console.warn(`[generate-ebay-details] Primary gemini-3.5-flash-lite returned ${primaryRes.status}: ${errBody.slice(0, 200)}. Falling back to gemini-3.5-flash.`);
      }
    } catch (primaryErr) {
      console.warn(`[generate-ebay-details] Primary gemini-3.5-flash-lite exception: ${primaryErr.message}. Falling back to gemini-3.5-flash.`);
    }

    // Secondary attempt fallback: gemini-3.5-flash if primary attempt produced no text
    if (!generatedText) {
      const fallbackRes = await callGenerateContent('gemini-3.5-flash', 15000);
      if (fallbackRes.ok) {
        const fallbackData = await fallbackRes.json().catch(() => ({}));
        generatedText = extractTextFromGeminiResponse(fallbackData);
      } else {
        const fallbackErr = await fallbackRes.text().catch(() => '');
        console.error(`[generate-ebay-details] Fallback gemini-3.5-flash failed (${fallbackRes.status}):`, fallbackErr.slice(0, 300));
        throw Object.assign(new Error(`Gemini API request failed (${fallbackRes.status}). Please check API key configuration.`), { statusCode: 502 });
      }
    }
  } catch (apiErr) {
    if (apiErr.statusCode) throw apiErr;
    if (apiErr.isTimeout || apiErr.name === 'TimeoutError' || /timeout/i.test(apiErr.message)) {
      throw Object.assign(new Error('AI generation timed out after 15 seconds. Please try again.'), { statusCode: 504, isTimeout: true });
    }
    console.error('[generate-ebay-details] Network exception:', apiErr);
    throw Object.assign(new Error(apiErr.message || 'Failed to communicate with AI generation service.'), { statusCode: 500 });
  }

  if (!generatedText || !generatedText.trim()) {
    throw Object.assign(new Error('Gemini API returned an empty response. Please try again.'), { statusCode: 502 });
  }

  return generatedText;
}

/**
 * Generates context-aware eBay listing HTML cards (Condition and Key Details)
 * using the Google Gemini API (gemini-3.5-flash-lite with gemini-3.5-flash fallback).
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
    condition = '',
    conditionHeader = '',
    conditionSubheader = '',
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
    '2. Custom Jersey Anti-Spoofing Rule: NEVER claim "official [Team] jersey", "authentic jersey", or mention Nike, Adidas, Mitchell & Ness, Reebok, Fanatics, NFL, MLB, NBA, NHL, or NCAA unless the item is explicitly marked as an official licensed retail/on-field brand. Describe custom jerseys strictly as custom stitched collectible display jerseys.',
    '3. Strict Punctuation Rule: NEVER use em dashes or en dashes anywhere. Use standard hyphens (-), colons (:), or parentheses () exclusively.',
    '4. Output ONLY the raw HTML code for the single Block 2 <div> element. Do NOT output markdown code fences (no ```html), do not output outer page wrappers or commentary.',
    '5. Strict Privacy Rule: NEVER include internal warehouse, auction, or inventory tracking references (such as "Inventory tracked:", "Lot #", "Item #", "Order ID", "ASIN", invoice numbers, or internal stock identifiers) anywhere in the output.'
  ].join('\n');

  const cleanNotes = stripInternalTrackingNotes(trimmedNotes);

  const promptLines = [
    `Item Title: ${trimmedTitle || 'Authentic Item'}`,
    brand.trim() ? `Brand: ${brand.trim()}` : null,
    productType.trim() ? `Product Type / Category: ${productType.trim()}` : null,
    condition.trim() ? `Condition: ${condition.trim()}` : null,
    (conditionHeader.trim() || conditionSubheader.trim())
      ? `Condition Notes: ${[conditionHeader.trim(), conditionSubheader.trim()].filter(Boolean).join(' : ')}`
      : null,
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
  }

  if (merged.description_plain_text) {
    merged.description_plain_text = sanitizeNoEmDash(stripInternalTrackingNotes(String(merged.description_plain_text).replace(/<[^>]+>/g, ' ')));
    if (flags.isCustomJersey) {
      merged.description_plain_text = scrubCustomJerseyClaims(merged.description_plain_text);
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

