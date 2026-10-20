import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('BUG-009: Clean ESM Syntax & Import Hoisting Invariants', () => {

  function getMidFileImports(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');

    let foundFirstNonImport = false;
    const midFileImports = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // Skip comments, empty lines, and docblocks
      if (!line || line.startsWith('//') || line.startsWith('/*') || line.startsWith('*')) {
        continue;
      }

      if (line.startsWith('import ') && !line.includes('import(')) {
        if (foundFirstNonImport) {
          midFileImports.push({ lineNum: i + 1, statement: line });
        }
      } else {
        foundFirstNonImport = true;
      }
    }

    return midFileImports;
  }

  it('verifies src/App.jsx contains zero mid-file static import statements', () => {
    const appPath = path.resolve(__dirname, '../src/App.jsx');
    const violations = getMidFileImports(appPath);
    expect(violations, `Found mid-file imports in App.jsx: ${JSON.stringify(violations)}`).toEqual([]);
  });

  it('verifies src/utils/indexedDB.js contains zero mid-file static import statements', () => {
    const idbPath = path.resolve(__dirname, '../src/utils/indexedDB.js');
    const violations = getMidFileImports(idbPath);
    expect(violations, `Found mid-file imports in indexedDB.js: ${JSON.stringify(violations)}`).toEqual([]);
  });
});
