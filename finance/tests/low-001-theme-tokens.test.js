import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import tailwindConfig from '../tailwind.config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('LOW-001: CSS Variable Theme Tokens Tests', () => {
  const indexCssPath = path.resolve(__dirname, '../src/index.css');
  const indexCssContent = fs.readFileSync(indexCssPath, 'utf8');

  test('index.css declares :root default dark theme tokens', () => {
    assert.match(indexCssContent, /--brand-500:\s*#3b82f6/);
    assert.match(indexCssContent, /--color-primary:\s*#3b82f6/);
    assert.match(indexCssContent, /--color-secondary:\s*#64748b/);
    assert.match(indexCssContent, /--color-success:\s*#10b981/);
    assert.match(indexCssContent, /--color-warning:\s*#f59e0b/);
    assert.match(indexCssContent, /--color-danger:\s*#ef4444/);
    assert.match(indexCssContent, /--color-accent:\s*#f59e0b/);
    assert.match(indexCssContent, /--color-bg-base:\s*#050811/);
    assert.match(indexCssContent, /--color-bg-surface:\s*#0f172a/);
    assert.match(indexCssContent, /--color-text-primary:\s*#f8fafc/);
    assert.match(indexCssContent, /--color-border:\s*#1e293b/);
    assert.match(indexCssContent, /--panel-bg:\s*rgba\(8,\s*12,\s*22,\s*0\.85\)/);
  });

  test('index.css declares html.light / :root.light theme tokens', () => {
    assert.match(indexCssContent, /html\.light,\s*:root\.light/);
    assert.match(indexCssContent, /--color-primary:\s*#2563eb/);
    assert.match(indexCssContent, /--color-success:\s*#059669/);
    assert.match(indexCssContent, /--color-warning:\s*#d97706/);
    assert.match(indexCssContent, /--color-danger:\s*#dc2626/);
    assert.match(indexCssContent, /--color-bg-base:\s*#f8fafc/);
    assert.match(indexCssContent, /--color-bg-surface:\s*#ffffff/);
    assert.match(indexCssContent, /--color-text-primary:\s*#0f172a/);
    assert.match(indexCssContent, /--color-border:\s*#cbd5e1/);
  });

  test('index.css glassmorphism classes consume CSS variables with fallbacks', () => {
    assert.match(indexCssContent, /\.glass-panel\s*\{\s*background:\s*var\(--panel-bg/);
    assert.match(indexCssContent, /\.glass-card\s*\{\s*background:\s*var\(--card-bg/);
  });

  test('tailwind.config.js maps theme color tokens to CSS variables', () => {
    const { colors } = tailwindConfig.theme.extend;
    assert.ok(colors, 'extend.colors should be defined');

    // Brand mapping
    assert.ok(colors.brand[500].includes('var(--brand-500'));

    // Semantic tokens
    assert.ok(colors.primary.DEFAULT.includes('var(--color-primary'));
    assert.ok(colors.secondary.DEFAULT.includes('var(--color-secondary'));
    assert.ok(colors.success.DEFAULT.includes('var(--color-success'));
    assert.ok(colors.warning.DEFAULT.includes('var(--color-warning'));
    assert.ok(colors.danger.DEFAULT.includes('var(--color-danger'));
    assert.ok(colors.accent.DEFAULT.includes('var(--color-accent'));

    // Surface and text tokens
    assert.ok(colors.surface.DEFAULT.includes('var(--color-bg-surface'));
    assert.ok(colors.surface.base.includes('var(--color-bg-base'));
    assert.ok(colors['theme-text'].DEFAULT.includes('var(--color-text-primary'));
    assert.ok(colors['theme-border'].DEFAULT.includes('var(--color-border'));
  });
});
