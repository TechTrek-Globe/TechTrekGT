import test from 'node:test';
import assert from 'node:assert/strict';
import { generateEbayListingHtml } from '../src/utils/ebayTemplate.js';
import { generateEbayCopy } from '../src/utils/listingCopyGenerator.js';
import { COMPILED_ROUTES, matchRoute } from '../src/worker.js';
import { onRequestPost as generateEbayDetailsHandler } from '../functions/api/ai/generate-ebay-details.js';
import { createToken } from '../functions/utils/auth.js';

test('[AI-001] eBay Listing HTML Generator with AI Middle Section', async (t) => {
  await t.test('Falls back to static Condition and Key Details cards when aiGeneratedMiddleSection is absent', () => {
    const item = {
      title: 'Kemimoto UTV Windshield',
      brand: 'Kemimoto',
      condition: 'Brand New',
      features: ['Polycarbonate', 'Scratch-resistant']
    };

    const html = generateEbayListingHtml(item);
    assert.ok(html.includes('>Condition</h3>'), 'Should include static Condition card heading');
    assert.ok(html.includes('>Key Details</h3>'), 'Should include static Key Details card heading');
    assert.ok(html.includes('<li>Polycarbonate</li>'), 'Should include feature bullets in Key Details');
    assert.ok(html.includes("What's Included</h3>"), "Should include What's Included card");
  });

  await t.test('Injects dynamic AI middle section when aiGeneratedMiddleSection is provided', () => {
    const aiBlock = `<div style="background-color:rgb(17,17,17); border:1px solid rgb(51,51,51); padding:18px; margin-bottom:15px; border-radius:6px;">
  <h3 style="color:rgb(241,193,91); margin-top:0;">Condition</h3>
  <p style="margin-bottom:0; color:#e0e0e0;">Pristine unopened condition in factory packaging.</p>
</div>
<div style="background-color:rgb(17,17,17); border:1px solid rgb(51,51,51); padding:18px; margin-bottom:15px; border-radius:6px;">
  <h3 style="color:rgb(241,193,91); margin-top:0;">Key Details</h3>
  <ul style="margin:0; padding-left:20px; color:#e0e0e0;">
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
    assert.ok(html.includes('Precision molded for Yamaha Rhino'), 'Contains AI Key Details text');
    assert.ok(html.includes("What's Included</h3>"), 'Still includes trailing cards');
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
    assert.ok(copy.htmlBody.includes('<!-- =======================================================\n       ADD Lising INFO HERE'));
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
});

