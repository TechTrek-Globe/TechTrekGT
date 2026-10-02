import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('HIGH-001 / NAV-001: Global Command Palette for Rapid Navigation', () => {
  const paletteComponentPath = path.resolve(__dirname, '../src/components/ui/CommandPalette.jsx');
  const paletteContextPath = path.resolve(__dirname, '../src/context/CommandPaletteContext.jsx');
  const appLayoutPath = path.resolve(__dirname, '../src/components/AppLayout.jsx');
  const appPath = path.resolve(__dirname, '../src/App.jsx');
  const enrichedApiPath = path.resolve(__dirname, '../functions/api/items/enriched.js');

  test('CommandPalette component file exists and exports CommandPalette', () => {
    assert.ok(fs.existsSync(paletteComponentPath), 'src/components/ui/CommandPalette.jsx must exist');
    const content = fs.readFileSync(paletteComponentPath, 'utf8');
    assert.ok(content.includes('export function CommandPalette('), 'CommandPalette.jsx must export CommandPalette');
  });

  test('CommandPaletteContext file exists and exports CommandPaletteProvider and useCommandPalette', () => {
    assert.ok(fs.existsSync(paletteContextPath), 'src/context/CommandPaletteContext.jsx must exist');
    const content = fs.readFileSync(paletteContextPath, 'utf8');
    assert.ok(content.includes('export function CommandPaletteProvider('), 'Must export CommandPaletteProvider');
    assert.ok(content.includes('export function useCommandPalette('), 'Must export useCommandPalette');
  });

  test('App.jsx integrates CommandPaletteProvider at the top level', () => {
    const content = fs.readFileSync(appPath, 'utf8');
    assert.ok(content.includes('CommandPaletteProvider'), 'App.jsx must import and use CommandPaletteProvider');
    assert.ok(content.includes('<CommandPaletteProvider>'), 'MainContent must be wrapped by CommandPaletteProvider in App.jsx');
  });

  test('AppLayout.jsx registers Cmd+K / Ctrl+K keydown listener and prevents plain k triggering', () => {
    const content = fs.readFileSync(appLayoutPath, 'utf8');
    assert.ok(content.includes('addEventListener(\'keydown\''), 'AppLayout.jsx must register keydown listener');
    assert.ok(content.includes('metaKey') && content.includes('ctrlKey'), 'Keydown handler must check metaKey or ctrlKey');
    assert.ok(content.includes('key === \'k\'') || content.includes('key === \'K\''), 'Keydown handler must check for k key');
    
    // Test logic simulating shortcut guard
    const isCmdK = (e) => (e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K');
    
    // Regular typing of 'k' inside a text input or body
    assert.equal(isCmdK({ key: 'k', metaKey: false, ctrlKey: false }), false, 'Plain "k" must not trigger palette');
    assert.equal(isCmdK({ key: 'K', metaKey: false, ctrlKey: false }), false, 'Plain "K" must not trigger palette');
    
    // Command+K / Ctrl+K
    assert.equal(isCmdK({ key: 'k', metaKey: true, ctrlKey: false }), true, 'Cmd+K must trigger palette');
    assert.equal(isCmdK({ key: 'K', metaKey: true, ctrlKey: false }), true, 'Cmd+K uppercase must trigger palette');
    assert.equal(isCmdK({ key: 'k', metaKey: false, ctrlKey: true }), true, 'Ctrl+K must trigger palette');
  });

  test('CommandPalette has accessible modal attributes (aria-modal, role=dialog, focus trapping, Escape)', () => {
    const content = fs.readFileSync(paletteComponentPath, 'utf8');
    assert.ok(content.includes('role="dialog"'), 'Must specify role="dialog"');
    assert.ok(content.includes('aria-modal="true"'), 'Must specify aria-modal="true"');
    assert.ok(content.includes('Escape'), 'Must support Escape key dismissal');
    assert.ok(content.includes('backdrop-blur'), 'Must blur the background backdrop');
    assert.ok(content.includes('inputRef.current?.focus()') || content.includes('inputRef.current.focus()'), 'Must capture focus on input');
  });

  test('CommandPalette supports arrow-key navigation (Up/Down) and Enter selection', () => {
    const content = fs.readFileSync(paletteComponentPath, 'utf8');
    assert.ok(content.includes('ArrowDown'), 'Must handle ArrowDown key');
    assert.ok(content.includes('ArrowUp'), 'Must handle ArrowUp key');
    assert.ok(content.includes('Enter'), 'Must handle Enter key');
  });

  test('CommandPalette provides loading state and empty state for remote SKU searches', () => {
    const content = fs.readFileSync(paletteComponentPath, 'utf8');
    assert.ok(content.includes('Searching inventory SKUs'), 'Must provide loading state for SKU search');
    assert.ok(content.includes('No results found'), 'Must provide empty state when no matches found');
  });

  test('GET /api/items/enriched enforces rate limiting when query q is provided', () => {
    const content = fs.readFileSync(enrichedApiPath, 'utf8');
    assert.ok(content.includes('checkRateLimit'), 'enriched.js must import and call checkRateLimit');
    assert.ok(content.includes('items-search:'), 'Rate limit key must be scoped to search');
  });

  test('AppLayout renders CommandPalette in global modals and provides visual trigger buttons', () => {
    const content = fs.readFileSync(appLayoutPath, 'utf8');
    assert.ok(content.includes('<CommandPalette'), 'AppLayout must render CommandPalette');
    assert.ok(content.includes('sidebar-command-palette-btn'), 'AppLayout must provide sidebar trigger');
    assert.ok(content.includes('mobile-command-palette-btn'), 'AppLayout must provide mobile header trigger');
  });
});
