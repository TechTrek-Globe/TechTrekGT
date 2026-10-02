import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('HIGH-002: Tailwind Configuration and CSS Variables', () => {
  const tailwindConfigPath = path.resolve('./tailwind.config.js');
  const indexCssPath = path.resolve('./src/index.css');

  it('tailwind.config.js contains no static hex codes in brand palette', () => {
    const configContent = fs.readFileSync(tailwindConfigPath, 'utf8');
    const brandMatch = configContent.match(/brand:\s*\{([^}]+)\}/s);
    assert.ok(brandMatch, 'tailwind.config.js should define a brand color palette');

    const brandBlock = brandMatch[1];
    assert.ok(!brandBlock.includes('#'), 'brand palette must not contain static hex codes');
  });

  it('tailwind.config.js defines all brand shades using rgb(var(--color-brand-*) / <alpha-value>)', () => {
    const configContent = fs.readFileSync(tailwindConfigPath, 'utf8');
    const shades = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900'];

    for (const shade of shades) {
      const expectedPattern = new RegExp(`${shade}:\\s*['"]rgb\\(var\\(--color-brand-${shade}\\)\\s*/\\s*<alpha-value>\\)['"]`);
      assert.ok(
        expectedPattern.test(configContent),
        `tailwind.config.js should map brand shade ${shade} to rgb(var(--color-brand-${shade}) / <alpha-value>)`
      );
    }
  });

  it('src/index.css defines all --color-brand-* variables within :root', () => {
    const indexCssContent = fs.readFileSync(indexCssPath, 'utf8');
    assert.ok(indexCssContent.includes(':root'), 'src/index.css must declare a :root block');

    const shades = {
      50: '255 251 235',
      100: '254 243 199',
      200: '253 230 138',
      300: '252 211 77',
      400: '251 191 36',
      500: '245 158 11',
      600: '217 119 6',
      700: '180 83 9',
      800: '146 64 14',
      900: '120 53 15'
    };

    for (const [shade, rgb] of Object.entries(shades)) {
      const varDecl = `--color-brand-${shade}: ${rgb};`;
      assert.ok(
        indexCssContent.includes(varDecl),
        `src/index.css must define ${varDecl}`
      );
    }
  });

  it('src/index.css utility classes reference CSS variables instead of hardcoded hex / rgb values', () => {
    const indexCssContent = fs.readFileSync(indexCssPath, 'utf8');

    assert.ok(
      indexCssContent.includes('rgb(var(--color-brand-500) / 0.18)'),
      'glow-amber should reference --color-brand-500'
    );
    assert.ok(
      indexCssContent.includes('rgb(var(--color-brand-300))'),
      'text-gradient-amber should reference --color-brand-300'
    );
    assert.ok(
      indexCssContent.includes('rgb(var(--color-brand-500) / 0.4)'),
      'custom scrollbar thumb should reference --color-brand-500'
    );
  });
});
