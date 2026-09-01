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
      id: 'acc-bills-checking',
      name: 'Bills Checking',
      type: 'checking',
      startingBalance: 1250.00,
      saveExtraMonthly: 0,
      enableExtraSavings: true,
      overflowSplits: {
        'person-jon': 100
      },
      saveExtraSplits: {
        'person-jon': 100
      },
      color: 'blue',
      notes: 'Primary household operating and recurring bills account'
    },
    {
      id: 'acc-mortgage-checking',
      name: 'Mortgage Checking',
      type: 'checking',
      startingBalance: 3500.00,
      saveExtraMonthly: 0,
      enableExtraSavings: true,
      overflowSplits: {
        'person-jon': 50,
        'person-ronnie': 50
      },
      saveExtraSplits: {
        'person-jon': 50,
        'person-ronnie': 50
      },
      color: 'emerald',
      notes: 'Dedicated mortgage escrow and P&I payment account'
    },
    {
      id: 'acc-hoa-savings',
      name: 'HOA Savings',
      type: 'savings',
      startingBalance: 1000.00,
      saveExtraMonthly: 0,
      enableExtraSavings: true,
      overflowSplits: {
        'person-jon': 50,
        'person-ronnie': 50
      },
      saveExtraSplits: {
        'person-jon': 50,
        'person-ronnie': 50
      },
      color: 'purple',
      notes: 'HOA reserve and community dues savings account'
    }
  ],

  people: [
    {
      id: 'person-jon',
      name: 'Jon',
      role: 'Primary Earner',
      payFrequency: 'semi-monthly',
      payDay1: 15,
      payDay2: 'last',
      grossPerPay: 4200.00,
      netPerPay: 963.08,
      accountAllocations: {},
      color: 'purple'
    },
    {
      id: 'person-ronnie',
      name: 'Ronnie',
      role: 'Partner / Earner',
      payFrequency: 'monthly',
      payDay1: 1,
      grossPerPay: 3800.00,
      netPerPay: 2850.00,
      accountAllocations: {},
      color: 'emerald'
    },
    {
      id: 'person-gym',
      name: 'Gym',
      role: 'Secondary Earner',
      payFrequency: 'bi-weekly',
      payDay1: 15,
      payDay2: 'last',
      grossPerPay: 2500.00,
      netPerPay: 1900.00,
      accountAllocations: {},
      color: 'blue'
    }
  ],

  fundingGoals: [
    {
      id: 'goal-bills-jon-1',
      contributorId: 'person-jon',
      accountId: 'acc-bills-checking',
      name: 'Bills Checking Base (Semi-Monthly)',
      amountPerPay: 85.00
    },
    {
      id: 'goal-bills-jon-2',
      contributorId: 'person-jon',
      accountId: 'acc-bills-checking',
      name: 'Bills Checking Buffer (Monthly)',
      amountPerPay: 78.08
    },
    {
      id: 'goal-bills-gym-1',
      contributorId: 'person-gym',
      accountId: 'acc-bills-checking',
      name: 'Gym Membership Share',
      amountPerPay: 11.25
    },
    {
      id: 'goal-mortgage-jon',
      contributorId: 'person-jon',
      accountId: 'acc-mortgage-checking',
      name: 'Mortgage Contribution',
      amountPerPay: 689.00
    },
    {
      id: 'goal-mortgage-ronnie',
      contributorId: 'person-ronnie',
      accountId: 'acc-mortgage-checking',
      name: 'Mortgage Contribution',
      amountPerPay: 1378.00
    },
    {
      id: 'goal-hoa-jon',
      contributorId: 'person-jon',
      accountId: 'acc-hoa-savings',
      name: 'HOA Reserve Contribution',
      amountPerPay: 111.00
    },
    {
      id: 'goal-hoa-ronnie',
      contributorId: 'person-ronnie',
      accountId: 'acc-hoa-savings',
      name: 'HOA Reserve Contribution',
      amountPerPay: 222.00
    }
  ],

  bills: [
    {
      id: 'bill-mortgage',
      accountId: 'acc-mortgage-checking',
      name: 'Primary Mortgage P&I and Escrow',
      amount: 2756.00,
      period: 'Monthly',
      dueDay: 1,
      paymentSource: 'Auto Pay',
      notes: 'Suburban home mortgage auto-debit',
      matchingKey: 'MORTGAGE, ESCROW, CHASE MORTGAGE',
      splits: {
        'person-jon': 50,
        'person-ronnie': 50
      }
    },
    {
      id: 'bill-hoa',
      accountId: 'acc-hoa-savings',
      name: 'HOA Monthly Assessment',
      amount: 444.00,
      period: 'Monthly',
      dueDay: 1,
      paymentSource: 'Auto Pay',
      notes: 'Community dues and master maintenance',
      matchingKey: 'HOA DUES, HOA ASSESSMENT',
      splits: {
        'person-jon': 50,
        'person-ronnie': 50
      }
    },
    {
      id: 'bill-power',
      accountId: 'acc-bills-checking',
      name: 'Metro Electric & Energy',
      amount: 165.00,
      period: 'Monthly',
      dueDay: 12,
      paymentSource: 'Auto Pay',
      notes: 'City power grid utility bill',
      matchingKey: 'METRO ELECTRIC, GA POWER, POWER BILL',
      splits: {
        'person-jon': 100,
        'person-ronnie': 0,
        'person-gym': 0
      }
    },
    {
      id: 'bill-internet',
      accountId: 'acc-bills-checking',
      name: 'Fiber Gigabit Internet',
      amount: 85.00,
      period: 'Monthly',
      dueDay: 18,
      paymentSource: 'Auto Pay',
      notes: 'High-speed 1Gbps fiber broadband',
      matchingKey: 'FIBER GIGABIT, COMCAST, XFINITY',
      splits: {
        'person-jon': 100,
        'person-ronnie': 0,
        'person-gym': 0
      }
    },
    {
      id: 'bill-gym-dues',
      accountId: 'acc-bills-checking',
      name: 'Gym Club Assessment',
      amount: 22.50,
      period: 'Monthly',
      dueDay: 5,
      paymentSource: 'Auto Pay',
      notes: 'Shared athletic facility monthly fee',
      matchingKey: 'GYM CLUB, FITNESS, DUES',
      splits: {
        'person-jon': 0,
        'person-ronnie': 0,
        'person-gym': 100
      }
    }
  ],

  loan: {
    description: 'Suburban Home Mortgage',
    principal: 320000.00,
    annualInterestRate: 5.75,
    termMonths: 360,
    monthlyPayment: 2756.00,
    extraPayment: 0,
    startDate: '2024-03-01'
  }
};
