import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getPersonBillMonthlyPortionForAccount,
  getAccountSaveExtraPersonPortion
} from '../src/utils/paydayUtils.js';
import { round2 } from '../src/utils/formatters.js';

test('FIX-26: getAccountSaveExtraPersonPortion computes monthly surplus directly to eliminate $0.01 premature rounding drift', () => {
  const accounts = [
    { id: 'acc-mortgage', name: 'USAA Mortgage' },
    { id: 'acc-hoa', name: 'USAA HOA Savings' }
  ];
  const personRonnie = {
    id: 'person-ronnie',
    name: 'Ronnie',
    payFrequency: 'monthly',
    netPerPay: 1600,
    accountAllocations: { 'acc-mortgage': 1378, 'acc-hoa': 222 }
  };
  const bills = [
    { id: '1', accountId: 'acc-mortgage', name: 'Emory Parc - Mortgage', amount: 2036.51, period: 'Monthly', splits: { 'person-ronnie': 50 } },
    { id: '2', accountId: 'acc-mortgage', name: 'Youtube TV Zack', amount: 36.5, period: 'Monthly', splits: { 'person-ronnie': 50 } },
    { id: '3', accountId: 'acc-mortgage', name: 'Water/Sewer', amount: 70, period: 'Monthly', splits: { 'person-ronnie': 50 } },
    { id: '4', accountId: 'acc-mortgage', name: 'Georgia Power', amount: 175, period: 'Monthly', splits: { 'person-ronnie': 50 } },
    { id: '5', accountId: 'acc-mortgage', name: 'Natural Gas', amount: 76, period: 'Monthly', splits: { 'person-ronnie': 50 } },
    { id: '6', accountId: 'acc-mortgage', name: 'Comcast Cable', amount: 51.2, period: 'Monthly', splits: { 'person-ronnie': 50 } },
    { id: '7', accountId: 'acc-hoa', name: 'HOA Dues Payment', amount: 2350, period: 'Semi-Annual', splits: { 'person-ronnie': 50 } },
    { id: '8', accountId: 'acc-hoa', name: 'HOA Payment Fee', amount: 3.95, period: 'Semi-Annual', splits: { 'person-ronnie': 50 } }
  ];
  const budget = { accounts, people: [personRonnie], bills, fundingGoals: [] };

  const mortBills = getPersonBillMonthlyPortionForAccount(personRonnie, 'acc-mortgage', budget);
  const hoaBills = getPersonBillMonthlyPortionForAccount(personRonnie, 'acc-hoa', budget);
  const mortSavings = getAccountSaveExtraPersonPortion(accounts[0], personRonnie, budget);
  const hoaSavings = getAccountSaveExtraPersonPortion(accounts[1], personRonnie, budget);

  assert.equal(mortBills, 1222.61, 'Mortgage monthly bills should be $1,222.61');
  assert.equal(hoaBills, 196.16, 'HOA monthly bills should be $196.16');
  assert.equal(mortSavings, 155.39, 'Mortgage monthly extra savings should be $155.39');
  assert.equal(hoaSavings, 25.84, 'HOA monthly extra savings should be $25.84');

  const totalMort = round2(mortBills + mortSavings);
  const totalHoa = round2(hoaBills + hoaSavings);
  assert.equal(totalMort, 1378.00, 'Mortgage total obligation must equal allocated deposit $1,378.00');
  assert.equal(totalHoa, 222.00, 'HOA total obligation must equal allocated deposit $222.00');

  const totalObligations = round2(totalMort + totalHoa);
  assert.equal(totalObligations, 1600.00, 'Total monthly obligation must equal exact monthly deposit $1,600.00 with zero .01 drift');
});
