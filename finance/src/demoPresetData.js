// 100% Fake Demo Preset Data for Testing & Previewing

const currentMonthKey = new Date().toISOString().substring(0, 7); // "YYYY-MM"

export const fakeDemoBudgetData = {
  lineItems: [
    { billId: 'bill-demo-1', monthKey: currentMonthKey, actualAmount: 2100.00, updatedAt: Date.now() },
    { billId: 'bill-demo-2', monthKey: currentMonthKey, actualAmount: 158.40, updatedAt: Date.now() },
    { billId: 'bill-demo-3', monthKey: currentMonthKey, actualAmount: 85.00, updatedAt: Date.now() },
    { billId: 'bill-demo-4', monthKey: currentMonthKey, actualAmount: 612.30, updatedAt: Date.now() },
    { billId: 'bill-demo-5', monthKey: currentMonthKey, actualAmount: 45.00, updatedAt: Date.now() },
    { billId: 'bill-demo-6', monthKey: currentMonthKey, actualAmount: 480.00, updatedAt: Date.now() }
  ],

  accounts: [
    {
      id: 'acc-demo-1',
      name: 'Apex Main Checking - 4092',
      type: 'checking',
      saveExtraMonthly: 150.00,
      enableExtraSavings: true,
      color: 'blue',
      notes: 'Primary household operational checking account'
    },
    {
      id: 'acc-demo-2',
      name: 'High-Yield Emergency Savings',
      type: 'savings',
      saveExtraMonthly: 500.00,
      enableExtraSavings: true,
      color: 'emerald',
      notes: '6-month reserve buffer at 4.75% APY'
    },
    {
      id: 'acc-demo-3',
      name: 'Sapphire Rewards Credit Card',
      type: 'credit',
      saveExtraMonthly: 0,
      enableExtraSavings: false,
      color: 'purple',
      notes: 'Automated recurring bills and daily points card'
    }
  ],

  people: [
    {
      id: 'person-demo-1',
      name: 'Alex Rivera',
      role: 'Lead UX Designer',
      payFrequency: 'bi-weekly',
      payDay1: 15,
      payDay2: 'last',
      grossPerPay: 3600.00,
      netPerPay: 2750.00,
      accountAllocations: {
        'acc-demo-1': 'remaining',
        'acc-demo-2': 500.00
      },
      color: 'purple'
    },
    {
      id: 'person-demo-2',
      name: 'Taylor Morgan',
      role: 'Software Architect',
      payFrequency: 'bi-weekly',
      payDay1: 15,
      payDay2: 'last',
      grossPerPay: 4200.00,
      netPerPay: 3150.00,
      accountAllocations: {
        'acc-demo-1': 'remaining',
        'acc-demo-2': 750.00
      },
      color: 'emerald'
    }
  ],

  bills: [
    {
      id: 'bill-demo-1',
      accountId: 'acc-demo-1',
      name: 'Luxury Apartment Rent',
      amount: 2100.00,
      period: 'Monthly',
      dueDay: 1,
      paymentSource: 'Auto Pay',
      notes: 'Downtown loft 2BR lease',
      matchingKey: 'APARTMENT RENT, LOFT 2BR, RENT PAYMENT',
      splits: {
        'person-demo-1': 50,
        'person-demo-2': 50
      }
    },
    {
      id: 'bill-demo-2',
      accountId: 'acc-demo-1',
      name: 'Metro Electric & Energy',
      amount: 165.00,
      period: 'Monthly',
      dueDay: 12,
      paymentSource: 'Auto Pay',
      notes: 'City power grid utility bill',
      matchingKey: 'METRO ELECTRIC, GA POWER, POWER BILL',
      splits: {
        'person-demo-1': 50,
        'person-demo-2': 50
      }
    },
    {
      id: 'bill-demo-3',
      accountId: 'acc-demo-3',
      name: 'Fiber Gigabit Internet',
      amount: 85.00,
      period: 'Monthly',
      dueDay: 18,
      paymentSource: 'Credit Card',
      notes: 'High-speed 1Gbps fiber broadband',
      matchingKey: 'FIBER GIGABIT, COMCAST, XFINITY',
      splits: {
        'person-demo-1': 50,
        'person-demo-2': 50
      }
    },
    {
      id: 'bill-demo-4',
      accountId: 'acc-demo-3',
      name: 'Whole Foods Grocery Fund',
      amount: 650.00,
      period: 'Monthly',
      dueDay: 5,
      paymentSource: 'Credit Card',
      notes: 'Estimated monthly shared food budget',
      matchingKey: 'WHOLE FOODS, GROCERY',
      splits: {
        'person-demo-1': 50,
        'person-demo-2': 50
      }
    },
    {
      id: 'bill-demo-5',
      accountId: 'acc-demo-3',
      name: 'StreamMax & Music Subscriptions',
      amount: 45.00,
      period: 'Monthly',
      dueDay: 22,
      paymentSource: 'Credit Card',
      notes: 'Shared family entertainment pass',
      matchingKey: 'STREAMMAX, YOUTUBE, SPOTIFY',
      splits: {
        'person-demo-1': 50,
        'person-demo-2': 50
      }
    },
    {
      id: 'bill-demo-6',
      accountId: 'acc-demo-1',
      name: 'Tesla EV Lease Payment',
      amount: 480.00,
      period: 'Monthly',
      dueDay: 15,
      paymentSource: 'Auto Pay',
      notes: 'Taylor direct vehicle financing',
      matchingKey: 'TESLA LEASE, TESLA FINANCE',
      splits: {
        'person-demo-1': 0,
        'person-demo-2': 100
      }
    },
    {
      id: 'bill-demo-7',
      accountId: 'acc-demo-1',
      name: 'Auto Insurance Premium',
      amount: 750.00,
      period: 'Semi-Annual',
      dueDay: 10,
      dueMonths: [3, 9],
      paymentSource: 'Auto Pay',
      notes: 'Bi-annual vehicle coverage (March & September)',
      matchingKey: 'PROGRESSIVE, AUTO INSURANCE, GEICO',
      splits: {
        'person-demo-1': 50,
        'person-demo-2': 50
      }
    },
    {
      id: 'bill-demo-8',
      accountId: 'acc-demo-1',
      name: 'Amazon Prime & Cloud Vault',
      amount: 179.00,
      period: 'Annual',
      dueDay: 20,
      dueMonths: [11],
      paymentSource: 'Credit Card',
      notes: 'Annual membership renewal (November)',
      matchingKey: 'AMAZON PRIME, CLOUD VAULT',
      splits: {
        'person-demo-1': 50,
        'person-demo-2': 50
      }
    }
  ],

  loan: {
    description: 'Suburban Home Mortgage',
    principal: 320000.00,
    annualInterestRate: 5.75,
    termMonths: 360,
    monthlyPayment: 1867.45,
    extraPayment: 250.00,
    startDate: '2024-03-01'
  }
};
