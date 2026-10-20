/**
 * Test budget fixtures for Playwright E2E and chaos testing.
 */

export const MOCK_E2E_BUDGET = {
  schemaVersion: 8,
  theme: 'dark',
  accounts: [
    {
      id: 'acc_e2e_checking',
      name: 'Primary Checking',
      type: 'checking',
      startingBalance: 3500.00,
      extraStartingBalance: 500.00,
      enableExtraSavings: true,
      isArchived: false,
      color: 'blue'
    },
    {
      id: 'acc_e2e_savings',
      name: 'High Yield Savings',
      type: 'savings',
      startingBalance: 12000.00,
      extraStartingBalance: 0,
      enableExtraSavings: false,
      isArchived: false,
      color: 'green'
    }
  ],
  people: [
    {
      id: 'usr_e2e_1',
      name: 'Morgan',
      role: 'Earner',
      payFrequency: 'semi-monthly',
      payDay1: '1st',
      payDay2: '15th',
      depositAccount: 'acc_e2e_checking',
      accountAllocations: { 'acc_e2e_checking': 2800.00 }
    }
  ],
  bills: [
    {
      id: 'bill_e2e_rent',
      name: 'Apartment Lease',
      amount: 1950.00,
      dueDay: 1,
      period: 'Monthly',
      accountId: 'acc_e2e_checking',
      isArchived: false
    },
    {
      id: 'bill_e2e_internet',
      name: 'Fiber Internet',
      amount: 85.00,
      dueDay: 18,
      period: 'Monthly',
      accountId: 'acc_e2e_checking',
      isArchived: false
    }
  ],
  fundingGoals: [
    {
      id: 'goal_e2e_vacation',
      name: 'Summer Vacation',
      targetAmount: 3000.00,
      currentAmount: 1200.00,
      accountId: 'acc_e2e_savings',
      contributorId: 'usr_e2e_1'
    }
  ],
  dailyMatrix: {
    'acc_e2e_checking_2026-01_1_bill_bill_e2e_rent': 1950.00,
    'acc_e2e_checking_2026-01_18_bill_bill_e2e_internet': 85.00,
    'acc_e2e_checking_2026-01_1_credit_usr_e2e_1': 2800.00
  }
};
