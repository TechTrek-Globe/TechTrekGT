import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import parser from '@babel/parser';
import traverse from '@babel/traverse';

describe('Client Bundle & Import Integrity [task T-13]', () => {
  const standardGlobals = new Set([
    'window', 'document', 'console', 'fetch', 'setTimeout', 'clearTimeout',
    'setInterval', 'clearInterval', 'sessionStorage', 'localStorage', 'URL',
    'URLSearchParams', 'Response', 'Request', 'Headers', 'Date', 'Math',
    'Number', 'String', 'Boolean', 'Array', 'Object', 'Promise', 'Error',
    'JSON', 'crypto', 'encodeURI', 'encodeURIComponent', 'decodeURIComponent',
    'parseInt', 'parseFloat', 'isNaN', 'isFinite', 'RegExp', 'Set', 'Map',
    'WeakMap', 'WeakSet', 'alert', 'confirm', 'prompt', 'navigator', 'location',
    'btoa', 'atob', 'Blob', 'FileReader', 'FormData', 'CustomEvent', 'Event',
    'React', 'process', 'import', 'globalThis', 'undefined', 'Infinity', 'NaN',
    'Symbol', 'BigInt', 'Proxy', 'Reflect', 'ArrayBuffer', 'Uint8Array',
    'Uint16Array', 'Uint32Array', 'Int8Array', 'Int16Array', 'Int32Array',
    'Float32Array', 'Float64Array', 'DataView', 'performance', 'requestAnimationFrame',
    'cancelAnimationFrame', 'MutationObserver', 'ResizeObserver', 'IntersectionObserver',
    'PopStateEvent', 'HTMLRewriter'
  ]);

  function walk(dir) {
    let results = [];
    const list = fs.readdirSync(dir);
    for (const file of list) {
      const fullPath = path.join(dir, file);
      const stat = fs.statSync(fullPath);
      if (stat && stat.isDirectory()) {
        results = results.concat(walk(fullPath));
      } else if (fullPath.endsWith('.jsx') || fullPath.endsWith('.js')) {
        results.push(fullPath);
      }
    }
    return results;
  }

  it('AuthPage explicitly imports useEffect hook', () => {
    const authPageCode = fs.readFileSync(path.resolve('./src/components/AuthPage.jsx'), 'utf8');
    const importMatch = authPageCode.match(/import\s+(?:React,\s*)?\{[^}]*useEffect[^}]*\}\s*from\s*['"]react['"]/);
    assert.ok(importMatch, 'AuthPage.jsx must explicitly import useEffect from react');
  });

  it('every source file in src/ has zero undeclared identifier references', () => {
    const files = walk(path.resolve('./src'));
    const undeclaredFound = [];
    const traverseFn = traverse.default || traverse;

    for (const file of files) {
      const code = fs.readFileSync(file, 'utf8');
      const ast = parser.parse(code, {
        sourceType: 'module',
        plugins: ['jsx']
      });

      traverseFn(ast, {
        ReferencedIdentifier(p) {
          const name = p.node.name;
          if (standardGlobals.has(name)) return;
          if (!p.scope.hasBinding(name)) {
            undeclaredFound.push({ file: path.relative('.', file), name, line: p.node.loc?.start?.line });
          }
        }
      });
    }

    assert.deepEqual(undeclaredFound, [], `Found undeclared identifiers in client source: ${JSON.stringify(undeclaredFound)}`);
  });

  it('TaxReportModal uses Blob URL for CSV export rather than fragile data URIs [task T-16]', () => {
    const taxModalCode = fs.readFileSync(path.resolve('./src/components/TaxReportModal.jsx'), 'utf8');
    assert.ok(taxModalCode.includes('new Blob(['), 'TaxReportModal must use new Blob for CSV content');
    assert.ok(taxModalCode.includes('URL.createObjectURL(blob)'), 'TaxReportModal must use URL.createObjectURL for robust CSV download');
    assert.ok(!taxModalCode.includes('data:text/csv'), 'TaxReportModal must not use data:text/csv data URIs');
  });
});
