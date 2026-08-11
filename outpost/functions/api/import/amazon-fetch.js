import { requireAuth, withAuth, ok, err } from '../../utils/guard.js';

/**
 * POST /api/import/amazon-fetch
 *
 * Scrapes product title, price, main image, and category from a public Amazon DP URL or ASIN.
 * Also parses Order IDs if an Amazon order URL is provided.
 */

export async function onRequestPost(context) {
  const { request, env } = context;
  return withAuth(async () => {
    await requireAuth(request, env);

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
    let price = null;
    let image = null;
    let category = null;

    // 3. If ASIN found, attempt to scrape product page
    if (asin) {
      try {
        const fetchUrl = `https://www.amazon.com/dp/${asin}`;
        const res = await fetch(fetchUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9'
          }
        });

        if (res.ok) {
          const html = await res.text();

          // Title extraction
          const titleMatch = html.match(/<span[^>]*id=["']productTitle["'][^>]*>([\s\S]*?)<\/span>/i)
            || html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i)
            || html.match(/<title>([\s\S]*?)<\/title>/i);

          if (titleMatch) {
            let rawTitle = titleMatch[1].replace(/<[^>]+>/g, '').trim();
            // Strip common "Amazon.com: " prefix or trailing site name
            rawTitle = rawTitle.replace(/^Amazon\.com\s*:\s*/i, '').replace(/\s*:\s*Amazon\.com.*$/i, '').trim();
            if (rawTitle && !rawTitle.toLowerCase().includes('robot check') && !rawTitle.toLowerCase().includes('something went wrong')) {
              title = rawTitle;
            }
          }

          // Image extraction
          const imgMatch = html.match(/<img[^>]*id=["']landingImage["'][^>]*data-old-hires=["']([^"']+)["']/i)
            || html.match(/<img[^>]*id=["']landingImage["'][^>]*src=["']([^"']+)["']/i)
            || html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i);

          if (imgMatch && !imgMatch[1].includes('captcha')) {
            image = imgMatch[1];
          }

          // Price extraction
          const priceMatch = html.match(/<span[^>]*class=["'][^"']*a-offscreen[^"']*["'][^>]*>\s*\$([\d.,]+)\s*<\/span>/i)
            || html.match(/class=["']a-price-whole["']>([\d.,]+)<\/span>/i);

          if (priceMatch) {
            const parsedPrice = parseFloat(priceMatch[1].replace(/,/g, ''));
            if (!isNaN(parsedPrice) && parsedPrice > 0) {
              price = parsedPrice;
            }
          }
        }
      } catch (err) {
        console.warn('Amazon fetch error:', err);
      }
    }

    return ok({
      asin,
      orderId,
      title: title || null,
      price: price || null,
      image: image || null,
      category: category || 'Other',
      url: asin ? `https://www.amazon.com/dp/${asin}` : (orderId ? `https://www.amazon.com/gp/your-account/order-details?orderID=${orderId}` : trimmed)
    });
  });
}
