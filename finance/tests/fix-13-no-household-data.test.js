import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { parseSpreadsheet } from '../src/utils/spreadsheetParser.js';

describe('FIX-13: Remove household data from source', () => {
  const SRC_DIR = path.resolve('src');

  function scanFiles(dir, fileList = []) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        scanFiles(fullPath, fileList);
      } else if (/\.(js|jsx|json)$/.test(entry.name)) {
        fileList.push(fullPath);
      }
    }
    return fileList;
  }

  it('ensures no household digits (7071, 3223, 9575) exist in any src file', () => {
    const files = scanFiles(SRC_DIR);
    const bannedDigits = ['7071', '3223', '9575'];
    for (const file of files) {
      const content = fs.readFileSync(file, 'utf-8');
      for (const banned of bannedDigits) {
        assert.equal(
          content.includes(banned),
          false,
          `File ${file} must not contain banned household digit: ${banned}`
        );
      }
    }
  });

  it('ensures no personal earner IDs (person-jon, person-ronnie) or bank name (usaa) exist in src', () => {
    const files = scanFiles(SRC_DIR);
    const bannedPhrases = ['person-jon', 'person-ronnie', 'usaa'];
    for (const file of files) {
      const lower = fs.readFileSync(file, 'utf-8').toLowerCase();
      for (const phrase of bannedPhrases) {
        assert.equal(
          lower.includes(phrase),
          false,
          `File ${file} must not contain banned phrase: ${phrase}`
        );
      }
    }
  });

  it('import of a generic CSV creates no hardcoded accounts or people', () => {
    const genericCsv = `Date,Description,Amount\n2026-10-01,Groceries,-54.20\n2026-10-02,Coffee,-4.50\n`;
    const result = parseSpreadsheet(genericCsv, 'statement.csv');

    assert.equal(result.success, true);
    assert.deepEqual(result.budget.accounts, [], 'Generic CSV must not create hardcoded accounts');
    assert.deepEqual(result.budget.people, [], 'Generic CSV must not create hardcoded people');
    assert.equal(result.budget.bills.length, 0, 'Generic CSV without budget structure must not create hardcoded bills');
  });

  it('verifies AccountsPeoplePanel uses generic goals-vs-bills coverage indicator without $1,600 check', () => {
    const panelSrc = fs.readFileSync(path.join(SRC_DIR, 'components/settings/AccountsPeoplePanel.jsx'), 'utf-8');
    assert.equal(panelSrc.includes('1600'), false, 'AccountsPeoplePanel must not include hardcoded 1600 amount');
    assert.equal(panelSrc.includes('isMortgageHoaVerified'), false, 'AccountsPeoplePanel must not include isMortgageHoaVerified');
    assert.equal(panelSrc.includes('totalBillsMonthlyForPerson'), true, 'AccountsPeoplePanel must compute totalBillsMonthlyForPerson');
    assert.equal(panelSrc.includes('Goals vs. Bills Coverage'), true, 'AccountsPeoplePanel must display generic Goals vs. Bills Coverage');
  });

  it('verifies spreadsheetParser does not perform keyword account matching for bills, mortgage, or hoa', () => {
    const parserSrc = fs.readFileSync(path.join(SRC_DIR, 'utils/spreadsheetParser.js'), 'utf-8');
    assert.equal(
      parserSrc.includes("norm.includes('bills') && key.includes('bills')"),
      false,
      'spreadsheetParser must not match accounts by "bills" keyword'
    );
    assert.equal(
      parserSrc.includes("norm.includes('mortgage') && key.includes('mortgage')"),
      false,
      'spreadsheetParser must not match accounts by "mortgage" keyword'
    );
    assert.equal(
      parserSrc.includes("norm.includes('hoa') && key.includes('hoa')"),
      false,
      'spreadsheetParser must not match accounts by "hoa" keyword'
    );
  });
});
