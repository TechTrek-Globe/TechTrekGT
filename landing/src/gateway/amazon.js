import { requireGatewayAuth, withGatewayAuth, ok, err } from './guard.js';

/**
 * POST /api/amazon/fetch
 *
 * Scrapes product title, price, main image, category, specs, and features
 * from a public Amazon DP URL or ASIN.
 * Supports optional external proxy (SCRAPER_API_KEY or AMAZON_SCRAPER_URL).
 *
 * Extracted from outpost/functions/api/import/amazon-fetch.js.
 * Secrets now live in landing/.dev.vars (not outpost).
 */

export async function onRequestPost(context) {
  const { request, env } = context;
  return withGatewayAuth(async () => {
    await requireGatewayAuth(request, env);

    const body = await request.json().catch(() => ({}));
    const { input } = body;

    if (!input || !input.trim()) {
      return err('Please enter an Amazon URL, ASIN, or Order ID.');
    }

    const trimmed = input.trim();

    // 1. Extract Order ID
    const orderMatch = trimmed.match(/\b(\d{3}-\d{7}-\d{7})\b/);
    const orderId = orderMatch ? orderMatch[1] : null;

    // 2. Extract ASIN
    let asin = null;
    const asinMatch = trimmed.match(/\/(?:dp|gp\/product|asin)\/([A-Z0-9]{10})/i)
      || trimmed.match(/[?&]pd_rd_i=([A-Z0-9]{10})/i)
      || trimmed.match(/[?&]asin=([A-Z0-9]{10})/i);

    if (asinMatch) {
      asin = asinMatch[1].toUpperCase();
    } else if (/^[A-Z0-9]{10}$/i.test(trimmed)) {
      asin = trimmed.toUpperCase();
    }

    let title = null;
    let brand = null;
    let price = null;
    let image = null;
    let category = null;
    let description = null;
    const features = [];
    const specs = {};

    if (asin) {
      const amazonDirectUrl = `https://www.amazon.com/dp/${asin}`;
      let html = '';
      let fetchSuccess = false;

      // Tier 1: External Scraper API (if SCRAPER_API_KEY or AMAZON_SCRAPER_URL configured in landing/.dev.vars)
      if (env?.SCRAPER_API_KEY || env?.AMAZON_SCRAPER_URL) {
        try {
          const proxyUrl = env.AMAZON_SCRAPER_URL
            ? `${env.AMAZON_SCRAPER_URL}?url=${encodeURIComponent(amazonDirectUrl)}`
            : `https://api.scraperapi.com?api_key=${env.SCRAPER_API_KEY}&url=${encodeURIComponent(amazonDirectUrl)}&country_code=us`;

          const proxyRes = await fetch(proxyUrl, {
            headers: { 'Accept': 'text/html,application/xhtml+xml,application/xml' }
          });
          if (proxyRes.ok) {
            const rawHtml = await proxyRes.text();
            if (rawHtml && !rawHtml.includes('validateCaptcha') && !rawHtml.includes('api-services-support@amazon.com')) {
              html = rawHtml;
              fetchSuccess = true;
            }
          }
        } catch (proxyErr) {
          console.warn('[amazon gateway] Scraper proxy error:', proxyErr);
        }
      }

      // Tier 2: Direct Worker Fetch with Endpoint Cascade
      if (!fetchSuccess) {
        const candidateUrls = [
          `https://www.amazon.com/dp/${asin}`,
          `https://www.amazon.com/gp/aw/d/${asin}`
        ];

        const defaultHeaders = {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache',
          'Sec-Ch-Ua': '"Chromium";v="128", "Not;A=Brand";v="24", "Google Chrome";v="128"',
          'Sec-Ch-Ua-Mobile': '?0',
          'Sec-Ch-Ua-Platform': '"Windows"',
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'none',
          'Sec-Fetch-User': '?1',
          'Upgrade-Insecure-Requests': '1'
        };

        for (const targetUrl of candidateUrls) {
          try {
            const res = await fetch(targetUrl, { headers: defaultHeaders });
            if (res.ok) {
              const candidateHtml = await res.text();
              const isBlocked = /robot check/i.test(candidateHtml)
                || /validateCaptcha/i.test(candidateHtml)
                || /automated access/i.test(candidateHtml)
                || /api-services-support@amazon\.com/i.test(candidateHtml)
                || candidateHtml.includes('To discuss automated access to Amazon data please contact');

              if (!isBlocked && candidateHtml.length > 2000) {
                html = candidateHtml;
                fetchSuccess = true;
                break;
              }
            }
          } catch (fetchErr) {
            console.warn(`[amazon gateway] Direct fetch failed for ${targetUrl}:`, fetchErr);
          }
        }
      }

      if (!fetchSuccess || !html) {
        return new Response(JSON.stringify({
          success: false,
          error: 'AMAZON_BLOCKED',
          message: 'Automated lookup challenged by Amazon bot protection. Use 1-Click Amazon Tab & Smart Paste below.',
          asin,
          orderId,
          url: `https://www.amazon.com/dp/${asin}`
        }), {
          status: 422,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // HTML Extraction
      const titleMatch = html.match(/<span[^>]*id=["']productTitle["'][^>]*>([\s\S]*?)<\/span>/i)
        || html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i)
        || html.match(/<title>([\s\S]*?)<\/title>/i);

      if (titleMatch) {
        let rawTitle = titleMatch[1].replace(/<[^>]+>/g, '').trim();
        rawTitle = rawTitle.replace(/^Amazon\.com\s*:\s*/i, '').replace(/\s*:\s*Amazon\.com.*$/i, '').trim();
        if (rawTitle && !rawTitle.toLowerCase().includes('robot check') && !rawTitle.toLowerCase().includes('something went wrong')) {
          title = rawTitle;
        }
      }

      if (!title) {
        return new Response(JSON.stringify({
          success: false,
          error: 'AMAZON_BLOCKED',
          message: 'Automated lookup challenged by Amazon bot protection. Use 1-Click Amazon Tab & Smart Paste below.',
          asin,
          orderId,
          url: `https://www.amazon.com/dp/${asin}`
        }), {
          status: 422,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Brand extraction
      const brandRowMatch = html.match(/<tr[^>]*class=["'][^"']*po-brand[^"']*["'][^>]*>[\s\S]*?<td[^>]*class=["'][^"']*a-span9[^"']*["'][^>]*>[\s\S]*?<span[^>]*class=["'][^"']*a-size-base[^"']*["'][^>]*>([\s\S]*?)<\/span>/i);
      if (brandRowMatch) { brand = brandRowMatch[1].replace(/<[^>]+>/g, '').trim(); }
      if (!brand) {
        const bylineMatch = html.match(/<a[^>]*id=["']bylineInfo["'][^>]*>([\s\S]*?)<\/a>/i);
        if (bylineMatch) {
          let bText = bylineMatch[1].replace(/<[^>]+>/g, '').trim();
          bText = bText.replace(/^(?:Brand|Visit the)\s*:\s*/i, '').replace(/\s+Store$/i, '').trim();
          if (bText) brand = bText;
        }
      }

      // Features extraction
      const featureBulletsMatch = html.match(/<div[^>]*id=["'](?:feature-bullets|featurebullets_feature_div)["'][^>]*>([\s\S]*?)<\/div>/i);
      if (featureBulletsMatch) {
        const itemMatches = featureBulletsMatch[1].matchAll(/<span[^>]*class=["']a-list-item["'][^>]*>([\s\S]*?)<\/span>/gi);
        for (const match of itemMatches) {
          const cleanText = match[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
          if (cleanText && !cleanText.toLowerCase().includes('make sure this fits') && !features.includes(cleanText)) {
            features.push(cleanText);
          }
        }
      }

      // Product Overview Specs
      const overviewMatch = html.match(/<div[^>]*id=["']productOverview_feature_div["'][^>]*>([\s\S]*?)<\/div>/i);
      if (overviewMatch) {
        const rowMatches = overviewMatch[1].matchAll(/<tr[^>]*>[\s\S]*?<td[^>]*class=["'][^"']*a-span3[^"']*["'][^>]*>[\s\S]*?<span[^>]*>([\s\S]*?)<\/span>[\s\S]*?<td[^>]*class=["'][^"']*a-span9[^"']*["'][^>]*>[\s\S]*?<span[^>]*>([\s\S]*?)<\/span>[\s\S]*?<\/tr>/gi);
        for (const rm of rowMatches) {
          const key = rm[1].replace(/<[^>]+>/g, '').trim();
          const val = rm[2].replace(/<[^>]+>/g, '').trim();
          if (key && val) {
            specs[key] = val;
            if (key.toLowerCase() === 'brand' && !brand) brand = val;
          }
        }
      }

      // Product Description
      const descMatch = html.match(/<div[^>]*id=["']productDescription["'][^>]*>([\s\S]*?)<\/div>/i);
      if (descMatch) {
        const cleanDesc = descMatch[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        if (cleanDesc && cleanDesc.length > 20) description = cleanDesc;
      }

      // Image extraction
      const imgMatch = html.match(/<img[^>]*id=["']landingImage["'][^>]*data-old-hires=["']([^"']+)["']/i)
        || html.match(/<img[^>]*id=["']landingImage["'][^>]*src=["']([^"']+)["']/i)
        || html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i);
      if (imgMatch && !imgMatch[1].includes('captcha')) { image = imgMatch[1]; }

      // Price extraction
      const priceMatch = html.match(/<span[^>]*class=["'][^"']*a-offscreen[^"']*["'][^>]*>\s*\$([\d.,]+)\s*<\/span>/i)
        || html.match(/class=["']a-price-whole["']>([\d.,]+)<\/span>/i);
      if (priceMatch) {
        const parsedPrice = parseFloat(priceMatch[1].replace(/,/g, ''));
        if (!isNaN(parsedPrice) && parsedPrice > 0) { price = parsedPrice; }
      }
    }

    return ok({
      success: true,
      asin,
      orderId,
      title: title || null,
      brand: brand || null,
      features: features.length > 0 ? features : null,
      specs: Object.keys(specs).length > 0 ? specs : null,
      description: description || null,
      price: price || null,
      image: image || null,
      category: category || 'Other',
      url: asin
        ? `https://www.amazon.com/dp/${asin}`
        : (orderId ? `https://www.amazon.com/gp/your-account/order-details?orderID=${orderId}` : trimmed)
    });
  });
}
