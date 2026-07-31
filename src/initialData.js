export const initialBudgetData = {
  // Line items track actual vs projected per bill-month
  lineItems: [],
  accounts: [
    {
      id: 'acc-1',
      name: 'USAA Bills Checking - 7071',
      type: 'checking',
      startingBalance: 257.50,
      extraStartingBalance: 0,
      saveExtraMonthly: 0,
      enableExtraSavings: false,
      color: 'blue',
      notes: 'Personal expenses & subscriptions'
    },
    {
      id: 'acc-2',
      name: 'USAA Mortgage Checking - 3223',
      type: 'checking',
      startingBalance: 200.00,
      extraStartingBalance: 100.00,
      saveExtraMonthly: 200.00,
      enableExtraSavings: true,
      color: 'purple',
      notes: 'Joint mortgage & household utilities (50/50)'
    },
    {
      id: 'acc-3',
      name: 'USAA HOA Savings - 9575',
      type: 'savings',
      startingBalance: 150.00,
      extraStartingBalance: 100.00,
      saveExtraMonthly: 50.00,
      enableExtraSavings: true,
      color: 'emerald',
      notes: 'HOA Dues & Reserve Fund (50/50)'
    }
  ],
  people: [
    {
      id: 'person-1',
      name: 'Jon Kemp',
      role: 'Primary Earner',
      payFrequency: 'bi-weekly',
      payDay1: 15,
      payDay2: 'last',
      grossPerPay: 2850.00,
      netPerPay: 2200.00,
      color: 'blue'
    },
    {
      id: 'person-2',
      name: 'Ronnie',
      role: 'Household Partner',
      payFrequency: 'monthly',
      payDay1: 1,
      grossPerPay: 3000.00,
      netPerPay: 2400.00,
      color: 'purple'
    }
  ],
  bills: [
    {
      id: 'bill-1',
      name: 'Cell Phone Service',
      amount: 120.00,
      period: 'Monthly',
      accountId: 'acc-1',
      dueDay: 17,
      paymentSource: 'Wells Fargo Credit',
      notes: 'Auto Pay set for 17th of each month.',
      splits: { 'person-1': 100, 'person-2': 0 }
    },
    {
      id: 'bill-2',
      name: 'Gym Membership',
      amount: 50.00,
      period: 'Monthly',
      accountId: 'acc-1',
      dueDay: 18,
      paymentSource: 'Bank of America VISA',
      notes: 'Auto Pay set for 18th of each month.',
      splits: { 'person-1': 100, 'person-2': 0 }
    },
    {
      id: 'bill-3',
      name: 'Vehicle Insurance',
      amount: 180.00,
      period: 'Monthly',
      accountId: 'acc-1',
      dueDay: 5,
      paymentSource: 'USAA Bills Checking',
      notes: 'Semi-Annual policy allocated monthly.',
      splits: { 'person-1': 100, 'person-2': 0 }
    },
    {
      id: 'bill-4',
      name: 'Mortgage - Regular Payment',
      amount: 1650.00,
      period: 'Monthly',
      accountId: 'acc-2',
      dueDay: 1,
      paymentSource: 'Auto Pay Mortgage Checking',
      notes: 'Main mortgage principal & interest',
      splits: { 'person-1': 50, 'person-2': 50 }
    },
    {
      id: 'bill-5',
      name: 'Mortgage - Extra Payment',
      amount: 200.00,
      period: 'Monthly',
      accountId: 'acc-2',
      dueDay: 1,
      paymentSource: 'Auto Pay Mortgage Checking',
      notes: 'Extra principal payoff',
      splits: { 'person-1': 50, 'person-2': 50 }
    },
    {
      id: 'bill-6',
      name: 'YouTube TV (Zack)',
      amount: 75.00,
      period: 'Monthly',
      accountId: 'acc-2',
      dueDay: 10,
      paymentSource: 'Mortgage Checking',
      notes: 'Pay via ZELLE to Zack',
      splits: { 'person-1': 50, 'person-2': 50 }
    },
    {
      id: 'bill-7',
      name: 'Water / Sewer',
      amount: 85.00,
      period: 'Monthly',
      accountId: 'acc-2',
      dueDay: 12,
      paymentSource: 'Auto Pay From Checking',
      notes: 'County utility',
      splits: { 'person-1': 50, 'person-2': 50 }
    },
    {
      id: 'bill-8',
      name: 'Georgia Power - Electricity',
      amount: 145.00,
      period: 'Monthly',
      accountId: 'acc-2',
      dueDay: 20,
      paymentSource: 'Auto Pay From Checking',
      notes: 'Monthly electric power',
      splits: { 'person-1': 50, 'person-2': 50 }
    },
    {
      id: 'bill-9',
      name: 'Natural Gas',
      amount: 65.00,
      period: 'Monthly',
      accountId: 'acc-2',
      dueDay: 22,
      paymentSource: 'Auto Pay From Checking',
      notes: 'Georgia Natural Gas',
      splits: { 'person-1': 50, 'person-2': 50 }
    },
    {
      id: 'bill-10',
      name: 'Comcast Cable',
      amount: 90.00,
      period: 'Monthly',
      accountId: 'acc-2',
      dueDay: 25,
      paymentSource: 'Auto Pay From Checking',
      notes: 'Xfinity Broadband Internet',
      splits: { 'person-1': 50, 'person-2': 50 }
    },
    {
      id: 'bill-11',
      name: 'HOA Semi-Annual Assessment',
      amount: 50.00,
      period: 'Monthly',
      accountId: 'acc-3',
      dueDay: 15,
      paymentSource: 'USAA HOA Savings',
      notes: 'Semi-Annual assessment ($300 twice/yr)',
      splits: { 'person-1': 50, 'person-2': 50 }
    },
    {
      id: 'bill-12',
      name: 'HOA Payment Fee',
      amount: 2.00,
      period: 'Monthly',
      accountId: 'acc-3',
      dueDay: 15,
      paymentSource: 'USAA HOA Savings',
      notes: 'Portal payment fee',
      splits: { 'person-1': 50, 'person-2': 50 }
    },
    {
      id: 'bill-13',
      name: 'HOA - Extra Payments',
      amount: 50.00,
      period: 'Monthly',
      accountId: 'acc-3',
      dueDay: 1,
      paymentSource: 'USAA HOA Savings',
      notes: 'Reserve accumulation',
      splits: { 'person-1': 50, 'person-2': 50 }
    }
  ],
  loan: {
    description: 'Home Loan Mortgage',
    principal: 285000,
    annualInterestRate: 6.25,
    termMonths: 360,
    monthlyPayment: 1756.20,
    extraPayment: 200,
    startDate: '2024-01-01'
  }
};
