import { requireAuth, withAuth, ok, err } from '../../utils/guard.js';
import { fetchWithTimeout } from '../ebay/tokenHelper.js';

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
 * POST /api/ai/generate-ebay-details
 *
 * Dynamically generates context-aware eBay listing HTML cards (Condition and Key Details)
 * using the Google Gemini API (gemini-3.5-flash-lite with gemini-3.5-flash fallback).
 *
 * Headers: Cookie: auth_token=...
 * Body:
 * {
 *   title: string,
 *   brand?: string,
 *   productType?: string,
 *   condition?: string,
 *   conditionHeader?: string,
 *   conditionSubheader?: string,
 *   notes?: string,
 *   specs?: string | array | object,
 *   features?: string | array
 * }
 */
export async function onRequestPost(context) {
  const { request, env } = context;

  return withAuth(async () => {
    // Authenticate user via JWT session cookie / token_version check
    await requireAuth(request, env);

    const apiKey = env.GEMINI_API_KEY;
    if (!apiKey || typeof apiKey !== 'string' || !apiKey.trim()) {
      return err('AI generation service is not configured (missing GEMINI_API_KEY).', 503);
    }

    const body = await request.json().catch(() => ({}));
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
    } = body;

    const trimmedTitle = String(title || '').trim();
    const trimmedNotes = String(notes || '').trim();

    if (!trimmedTitle && !trimmedNotes) {
      return err('Item title or notes are required to generate AI listing details.', 400);
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
    const systemInstruction = [
      'You are a professional, high-volume eBay copywriter for TechTrek Outpost.',
      'Your task is to generate a clean, modern HTML block consisting of exactly two cards: "Condition" and "Key Details".',
      'Rules:',
      '1. Match the exact dark-theme inline styling of our listing template:',
      '   - Each card MUST be wrapped in: <div style="background-color:rgb(17,17,17); border:1px solid rgb(51,51,51); padding:18px; margin-bottom:15px; border-radius:6px;">',
      '   - The Condition card heading MUST be: <h3 style="color:rgb(241,193,91); margin-top:0;">Condition</h3>',
      '   - The Key Details card heading MUST be: <h3 style="color:rgb(241,193,91); margin-top:0;">Key Details</h3>',
      '   - Body paragraphs MUST use: <p style="margin-bottom:0; color:#e0e0e0;">...</p>',
      '   - Bullet lists in Key Details MUST use: <ul style="margin:0; padding-left:20px; color:#e0e0e0;"><li>...</li></ul>',
      '2. In the Condition card, provide an accurate, reassuring description based on the provided condition, headline, and notes. Highlight that photos depict the exact item.',
      '3. In the Key Details card, provide 4 to 6 strong, bulleted specifications or features relevant to buyers based on the provided title, brand, specs, and features.',
      '4. Strict Punctuation Rule: NEVER use em dashes anywhere. Use standard hyphens (-), colons (:), or parentheses exclusively.',
      '5. Output ONLY the raw HTML code for the two card <div> elements. Do NOT output markdown code fences (no ```html), do not output outer page wrappers or commentary.'
    ].join('\n');

    const promptLines = [
      `Item Title: ${trimmedTitle || 'Authentic Item'}`,
      brand.trim() ? `Brand: ${brand.trim()}` : null,
      productType.trim() ? `Product Type / Category: ${productType.trim()}` : null,
      condition.trim() ? `Condition: ${condition.trim()}` : null,
      (conditionHeader.trim() || conditionSubheader.trim())
        ? `Condition Notes: ${[conditionHeader.trim(), conditionSubheader.trim()].filter(Boolean).join(' : ')}`
        : null,
      specsText ? `Technical Specifications:\n${specsText}` : null,
      featuresText ? `Features / Highlights:\n${featuresText}` : null,
      trimmedNotes ? `Seller Notes / Raw Description:\n${trimmedNotes}` : null
    ].filter(Boolean);

    const userPrompt = promptLines.join('\n\n');

    let generatedText = '';
    const cleanApiKey = apiKey.trim();

    const callGenerateContent = async (model, timeoutMs = 12000) => {
      const generateContentUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(cleanApiKey)}`;
      return fetchWithTimeout(generateContentUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': cleanApiKey
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: systemInstruction }]
          },
          contents: [
            {
              role: 'user',
              parts: [{ text: userPrompt }]
            }
          ]
        })
      }, timeoutMs);
    };

    try {
      // Primary attempt: gemini-3.5-flash-lite for fast, low-latency generation (~1-2s)
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
          return err(`Gemini API request failed (${fallbackRes.status}). Please check API key configuration.`, 502);
        }
      }
    } catch (apiErr) {
      if (apiErr.isTimeout || apiErr.name === 'TimeoutError' || /timeout/i.test(apiErr.message)) {
        return new Response(JSON.stringify({
          success: false,
          error: 'AI generation timed out after 15 seconds. Please try again.'
        }), {
          status: 504,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      console.error('[generate-ebay-details] Network exception:', apiErr);
      return err(apiErr.message || 'Failed to communicate with AI generation service.', 500);
    }

    if (!generatedText || !generatedText.trim()) {
      return err('Gemini API returned an empty response. Please try again.', 502);
    }

    // Sanitize markdown fences and whitespace
    let sanitizedHtml = generatedText.trim()
      .replace(/^```(?:html)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    // Enforce strict zero em-dash invariant
    sanitizedHtml = sanitizedHtml.replace(/[\u2014\u2013]/g, '-');

    return ok({
      success: true,
      html: sanitizedHtml
    });
  });
}

