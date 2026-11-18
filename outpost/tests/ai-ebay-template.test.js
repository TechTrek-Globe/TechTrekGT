import test from 'node:test';
import assert from 'node:assert/strict';
import { generateEbayListingHtml, stripInternalTrackingNotes, escapeHtml, sanitizeListingHtml } from '../src/utils/ebayTemplate.js';
import { generateEbayCopy } from '../src/utils/listingCopyGenerator.js';
import { COMPILED_ROUTES, matchRoute } from '../src/worker.js';
import { onRequestPost as generateEbayDetailsHandler } from '../functions/api/ai/generate-ebay-details.js';
import { createToken } from '../functions/utils/auth.js';

test('[AI-001] eBay Listing HTML Generator with AI Middle Section', async (t) => {
  await t.test('stripInternalTrackingNotes strips inventory tracking and warehouse numbers', () => {
    assert.equal(stripInternalTrackingNotes('Inventory tracked: Lot #12862710, Item #8183938'), '');
    assert.equal(stripInternalTrackingNotes('Lot #12862710 · Item #8183938'), '');
    assert.equal(stripInternalTrackingNotes('Lot #11120149 · Item #6973424'), '');
    assert.equal(stripInternalTrackingNotes('Authentic hand signed puck with Fanatics hologram. Lot #12862710 · Item #8183938'), 'Authentic hand signed puck with Fanatics hologram.');
    assert.equal(stripInternalTrackingNotes('Order ID: 111-2212343-5265805 | ASIN: B0GRFNV381 | Imported via VineScout'), '');
    assert.equal(stripInternalTrackingNotes('ASIN: B0FNWQPFPC | Brand New in Box'), 'Brand New in Box');
  });

  await t.test('Never includes internal inventory tracking notes in generateEbayListingHtml', () => {
    const item = {
      title: 'Thatcher Demko Signed Canucks Logo Hockey Puck',
      notes: 'Inventory tracked: Lot #12862710, Item #8183938'
    };
    const html = generateEbayListingHtml(item);
    assert.ok(!html.includes('12862710'), 'Must not include Lot number');
    assert.ok(!html.includes('8183938'), 'Must not include Item number');
    assert.ok(!html.includes('Inventory tracked'), 'Must not include Inventory tracked label');
  });

  await t.test('Never includes internal lot or item numbers in generateEbayCopy textBody or htmlBody', () => {
    const item = {
      item_name: 'Thatcher Demko Signed Canucks Logo Hockey Puck',
      notes: 'Lot #12862710 · Item #8183938'
    };
    const copy = generateEbayCopy(item, {
      description: 'Inventory tracked: Lot #12862710, Item #8183938'
    });
    assert.ok(!copy.textBody.includes('12862710'), 'Plain text must not contain Lot number');
    assert.ok(!copy.textBody.includes('8183938'), 'Plain text must not contain Item number');
    assert.ok(!copy.textBody.includes('Inventory tracked'), 'Plain text must not contain Inventory tracked');
    assert.ok(!copy.htmlBody.includes('12862710'), 'HTML body must not contain Lot number');
    assert.ok(!copy.htmlBody.includes('8183938'), 'HTML body must not contain Item number');
    assert.ok(!copy.htmlBody.includes('Inventory tracked'), 'HTML body must not contain Inventory tracked');
  });
  await t.test('Falls back to static high-contrast cards when aiGeneratedMiddleSection is absent', () => {
    const item = {
      title: 'Kemimoto UTV Windshield',
      brand: 'Kemimoto',
      condition: 'Brand New',
      features: ['Polycarbonate', 'Scratch-resistant']
    };

    const html = generateEbayListingHtml(item);
    assert.ok(html.includes('background-color: #ffffff; color: #111111;'), 'Outer insert wrapper uses high-contrast dark text on white background');
    assert.ok(!html.startsWith('<div style="font-family: Arial, Helvetica, sans-serif; color:#ffffff'), 'Must not set white text on unstyled wrapper');
    assert.ok(html.includes('background-color: #faf6ee; border: 1px solid #e2c992; color: #111111;'), 'Includes Block 1 Light Gold Tint Summary Card');
    assert.ok(html.includes('<span property="description">'), 'Includes Schema.org property="description" span in Block 1');
    assert.ok(html.includes('>Item Details &amp; Specifications</h3>'), 'Includes Clean White Specifications Card heading');
    assert.ok(html.includes('>Key Features</h3>'), 'Includes Dark Key Features Card heading for non-autographed item with features');
    assert.ok(!html.includes('>Authentication</h3>'), 'Omits Authentication Card on non-autographed general merchandise');
    assert.ok(html.includes('<li>Polycarbonate</li>'), 'Should include feature bullets in Key Features');
    assert.ok(html.includes("What's Included &amp; Buyer Notes</h3>"), "Should include What's Included & Buyer Notes card");
  });

  await t.test('Injects dynamic AI middle section when aiGeneratedMiddleSection is provided', () => {
    const aiBlock = `<div style="background-color: #ffffff; border: 1px solid #dddddd; color: #111111; padding: 18px; margin-bottom: 15px; border-radius: 6px;">
  <h3 style="color: #111111; margin: 0 0 12px 0; padding-bottom: 8px; border-bottom: 2px solid #b37a16;">Item Specifications</h3>
  <ul style="margin: 0; padding-left: 20px; color: #111111;">
    <li><strong>Brand:</strong> Kemimoto</li>
  </ul>
</div>
<div style="background-color: #111111; border: 1px solid #333333; color: #e0e0e0; padding: 18px; margin-bottom: 15px; border-radius: 6px;">
  <h3 style="color: #f1c15b; margin-top: 0;">Key Features</h3>
  <p style="margin-bottom: 10px; color: #e0e0e0;">Pristine unopened condition in factory packaging.</p>
  <ul style="margin: 0; padding-left: 20px; color: #e0e0e0;">
    <li>Precision molded for Yamaha Rhino</li>
    <li>Heavy duty scratch resistant surface</li>
  </ul>
</div>`;

    const item = {
      title: 'Kemimoto UTV Windshield',
      aiGeneratedMiddleSection: aiBlock
    };

    const html = generateEbayListingHtml(item);
    assert.ok(html.includes('Pristine unopened condition in factory packaging.'), 'Contains AI Condition text');
    assert.ok(html.includes('Precision molded for Yamaha Rhino'), 'Contains AI Key Features text');
    assert.ok(html.includes("What's Included &amp; Buyer Notes</h3>"), 'Still includes trailing Block 4 card');
  });

  await t.test('generateEbayCopy passes options.aiGeneratedMiddleSection through to insertHtml and htmlBody', () => {
    const aiBlock = `<div class="ai-custom-card">Custom AI Output</div>`;
    const item = {
      item_name: 'Test Collectible',
      condition: 'Like New'
    };

    const copy = generateEbayCopy(item, {
      aiGeneratedMiddleSection: aiBlock
    });

    assert.ok(copy.insertHtml.includes('<div class="ai-custom-card">Custom AI Output</div>'));
    assert.ok(copy.htmlBody.includes('<div class="ai-custom-card">Custom AI Output</div>'));
    assert.ok(copy.htmlBody.includes('<!-- =======================================================\n       ADD LISTING INFO HERE'));
    assert.ok(copy.htmlBody.includes('https://i.ebayimg.com/images/g/fe4AAeSwSO1q8G1~/s-l1600.webp'), 'Contains updated header banner image');
    assert.ok(copy.htmlBody.includes('Browse All Listings'), 'Contains compact dark footer strip with link');
  });

  await t.test('Route registration in src/worker.js resolves POST /api/ai/generate-ebay-details', () => {
    const match = matchRoute('POST', '/api/ai/generate-ebay-details');
    assert.ok(match.handler, 'Handler should be defined');
    assert.equal(match.route.auth, 'session', 'Route auth should be session');
    assert.equal(match.route.pattern, '/api/ai/generate-ebay-details');
  });

  await t.test('generateEbayDetailsHandler rejects requests without title or notes with 400', async () => {
    const mockEnv = {
      JWT_SECRET: 'test-secret',
      GEMINI_API_KEY: 'test-key'
    };
    const token = await createToken({ userId: 'usr-123', tv: 1 }, mockEnv.JWT_SECRET);
    const req = new Request('http://localhost:3001/api/ai/generate-ebay-details', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': `auth_token=${token}`
      },
      body: JSON.stringify({ title: '', notes: '' })
    });

    const res = await generateEbayDetailsHandler({ request: req, env: mockEnv });
    assert.equal(res.status, 400);
    const data = await res.json();
    assert.equal(data.error, 'Item title or notes are required to generate AI listing details.');
  });

  await t.test('generateEbayDetailsHandler returns 503 if GEMINI_API_KEY is missing', async () => {
    const mockEnv = {
      JWT_SECRET: 'test-secret'
    };
    const token = await createToken({ userId: 'usr-123', tv: 1 }, mockEnv.JWT_SECRET);
    const req = new Request('http://localhost:3001/api/ai/generate-ebay-details', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': `auth_token=${token}`
      },
      body: JSON.stringify({ title: 'Vintage Camera' })
    });

    const res = await generateEbayDetailsHandler({ request: req, env: mockEnv });
    assert.equal(res.status, 503);
    const data = await res.json();
    assert.ok(data.error.includes('missing GEMINI_API_KEY'));
  });

  await t.test('escapeHtml neutralizes HTML special characters', () => {
    assert.equal(escapeHtml('<script>alert("XSS")</script> & \'test\''), '&lt;script&gt;alert(&quot;XSS&quot;)&lt;/script&gt; &amp; &#39;test&#39;');
    assert.equal(escapeHtml(null), '');
    assert.equal(escapeHtml(undefined), '');
  });

  await t.test('sanitizeListingHtml neutralizes XSS payloads while preserving safe markup', () => {
    const malicious = '<div style="color:red;"><script>alert(1)</script><p>Safe text</p><img src=x onerror=alert(2)><a href="javascript:alert(3)">Click</a><iframe src="//evil.com"></iframe></div>';
    const cleaned = sanitizeListingHtml(malicious);
    assert.ok(!cleaned.includes('<script>'), 'Must strip script tags');
    assert.ok(!cleaned.includes('alert(1)'), 'Must strip script contents');
    assert.ok(!cleaned.includes('onerror='), 'Must strip on* attributes');
    assert.ok(!cleaned.includes('javascript:'), 'Must strip javascript: schemes');
    assert.ok(!cleaned.includes('<iframe'), 'Must strip iframe tags');
    assert.ok(cleaned.includes('<p>Safe text</p>'), 'Must preserve safe paragraph markup');
  });

  await t.test('generateEbayCopy truncates titles on word boundaries <= 80 characters without mid-word cuts', () => {
    const item = {
      item_name: 'Very Long Comprehensive Product Title With Many Descriptive Keywords That Exceeds Eighty Characters Easily'
    };
    const copy = generateEbayCopy(item);
    assert.ok(copy.title.length <= 80, `Title length (${copy.title.length}) must be <= 80`);
    assert.ok(!copy.title.endsWith('...'), 'Must not truncate with ellipsis');
    // Ensure last character is not part of a broken word (matches end of a full word)
    const words = item.item_name.split(' ');
    const titleWords = copy.title.split(' ');
    assert.equal(titleWords[titleWords.length - 1], words[titleWords.length - 1], 'Last word in title must be a whole word from source');
  });

  await t.test('generateEbayCopy with enforcePlatformRules retains Schema.org wrapper, high-contrast cards, and delimiters', () => {
    const item = {
      item_name: 'Brock Bowers Signed Georgia Bulldogs Custom Stitched Jersey',
      category: 'Sports Memorabilia',
      athlete_person: 'Brock Bowers',
      team_or_band: 'Georgia Bulldogs',
      authenticator: 'Beckett',
      cert_number: '4W782426',
      inscription: 'Go Dawgs',
      size: 'XL',
      is_wearable: true,
      is_custom_jersey: true,
      condition: 'Brand New'
    };
    const copy = generateEbayCopy(item, { enforcePlatformRules: true });
    assert.ok(copy.htmlBody.includes('vocab="https://schema.org/" typeof="Product"'), 'Includes Schema.org Product wrapper');
    assert.ok(copy.htmlBody.includes('background-color: #ffffff; color: #111111;'), 'Outer wrapper sets #ffffff bg and #111111 text');
    assert.ok(copy.htmlBody.includes('alt=""'), 'Top store banner uses empty alt="" for SEO prioritization');
    assert.ok(copy.htmlBody.includes('https://i.ebayimg.com/images/g/fe4AAeSwSO1q8G1~/s-l1600.webp'), 'Includes header banner');
    assert.ok(copy.htmlBody.includes('<!-- =======================================================\n       ADD LISTING INFO HERE'), 'Includes ADD LISTING INFO HERE delimiter');
    assert.ok(copy.htmlBody.includes('<!-- =======================================================\n       END LISTING INFO HERE'), 'Includes END LISTING INFO HERE delimiter');
    assert.ok(copy.htmlBody.includes('Browse All Listings'), 'Includes compact dark footer');
    assert.ok(copy.insertHtml.includes('background-color: #111111'), 'Includes dark card background');
    assert.ok(copy.insertHtml.includes('color: #f1c15b'), 'Includes gold heading accent');
    assert.ok(copy.insertHtml.includes('background-color: #faf6ee; border: 1px solid #e2c992'), 'Includes Block 1 Light Gold Tint card');
    assert.ok(copy.insertHtml.includes('<span property="description">'), 'Includes Block 1 property="description" span');
    assert.ok(copy.insertHtml.includes('>Item Details &amp; Specifications</h3>'), 'Includes Clean White Specifications section card');
    assert.ok(copy.insertHtml.includes('>Authentication</h3>'), 'Includes Authentication section card');
    assert.ok(copy.insertHtml.includes("What's Included &amp; Collector Notes</h3>"), 'Includes Block 4 Collector Notes card');
    assert.ok(copy.insertHtml.includes('Verify serial number 4W782426 directly in the Beckett online certification database.'), 'Includes plain text certification database verification instruction');
    assert.equal(/<a\b[^>]*href=["']https?:\/\/(?!www\.ebay\.com)/i.test(copy.htmlBody), false, 'Must not contain external hyperlinks per eBay Links Policy');
    assert.ok(copy.textBody.includes('ITEM:'), 'Includes structured textBody');
    assert.ok(copy.payload, 'Includes platform payload');
    assert.equal(copy.validation.passed, true, 'Platform validation passed');
  });

  await t.test('Strips duplicate <span property="description">, dark wrappers, and duplicate Authentication blocks from AI middle HTML', () => {
    const dirtyAiBlock = `<div style="background-color: #111111; color: #e0e0e0; padding: 18px;">
  <p style="color: #e0e0e0;"><span property="description">Duplicate AI summary</span></p>
  <h3 style="color: #f1c15b;">Authentication &amp; Quality</h3>
  <ul style="color: #e0e0e0;"><li>JSA Certified #ABC123</li></ul>
  <p>Official Braves jersey ready for display.</p>
</div>`;
    const copy = generateEbayCopy({
      item_name: 'Ronald Acuna Jr. Signed Braves Custom Jersey',
      athlete_person: 'Ronald Acuna Jr.',
      team_or_band: 'Braves',
      authenticator: 'JSA',
      cert_number: 'ABC123',
      is_custom_jersey: true,
      is_wearable: true,
      size: 'XL'
    }, {
      enforcePlatformRules: true,
      aiGeneratedMiddleSection: dirtyAiBlock
    });

    const descSpanMatches = copy.htmlBody.match(/property="description"/g) || [];
    assert.equal(descSpanMatches.length, 1, 'Must have strictly ONE <span property="description"> in final eBay HTML');
    const authHeadings = copy.htmlBody.match(/>Authentication[^<]*<\/h3>/gi) || [];
    assert.equal(authHeadings.length, 1, 'Must have strictly ONE Authentication heading (Block 3)');
    assert.ok(copy.htmlBody.includes('>Item Details &amp; Specifications</h3>'), 'Block 2 uses Clean White Specifications heading');
    assert.equal(/\bofficial\b/i.test(copy.htmlBody), false, 'Must strip official jersey claim on custom jersey');
    assert.ok(copy.htmlBody.includes('Custom stitched display jersey'), 'Includes Block 4 custom jersey disclosure');
  });

  await t.test('Strips duplicate Item Details & Specifications heading, removes duplicate disclosure from Block 2, and fixes grammar', () => {
    const aiWithDuplicateHeadingAndDisclosure = `<div>
  <h3>Item Details &amp; Specifications</h3>
  <p>This auction features an custom stitched Atlanta Braves jersey.</p>
  <ul>
    <li><strong>Player:</strong> Ronald Acuna Jr.</li>
    <li><strong>Team:</strong> Atlanta Braves</li>
  </ul>
  <p><strong>Collectible Custom Jersey Disclosure:</strong> This is a custom jersey not affiliated with MLB.</p>
</div>`;

    const copy = generateEbayCopy({
      item_name: 'Ronald Acuna Jr. Signed Braves Custom Jersey',
      athlete_person: 'Ronald Acuna Jr.',
      team_or_band: 'Braves',
      authenticator: 'JSA',
      cert_number: 'ABC123',
      is_custom_jersey: true,
      is_wearable: true,
      size: 'XL'
    }, {
      enforcePlatformRules: true,
      aiGeneratedMiddleSection: aiWithDuplicateHeadingAndDisclosure
    });

    // 1. Exactly ONE "Item Details & Specifications" heading in the entire template (Block 2)
    const specHeadings = copy.htmlBody.match(/Item Details &amp; Specifications/gi) || [];
    assert.equal(specHeadings.length, 1, 'Must have strictly ONE Item Details & Specifications heading in HTML');

    // 2. Grammar and format-neutral phrasing fixed
    assert.ok(copy.htmlBody.includes('This listing features a custom stitched'), 'Must replace "This auction features an custom" with "This listing features a custom"');
    assert.equal(/\bThis auction features\b/i.test(copy.htmlBody), false, 'Must not contain "This auction features"');
    assert.equal(/\ban custom\b/i.test(copy.htmlBody), false, 'Must not contain "an custom"');

    // 3. Custom jersey disclosure removed from Block 2 and rendered cleanly once in Block 4
    const disclosureMatches = copy.htmlBody.match(/Collector Disclosure: Custom stitched display jersey/g) || [];
    assert.equal(disclosureMatches.length, 1, 'Must render collector disclosure strictly once in Block 4');
    assert.equal(/Collectible Custom Jersey Disclosure/i.test(copy.htmlBody), false, 'Must strip duplicate Collectible Custom Jersey Disclosure from Block 2');
  });
});

