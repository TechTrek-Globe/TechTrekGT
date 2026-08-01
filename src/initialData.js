export const DEFAULT_DASHBOARD_WIDGETS = [
  { id: 'kpi_hero', title: 'Key Financial Summary', description: 'Total Cash, Net Monthly Income, Monthly Expenses, Net Cash Flow, Savings Rate', category: 'Financial Vitals', visible: true, width: 'full' },
  { id: 'transfer_summary', title: 'Account Funding & Transfer Breakdown', description: 'Calculates transfer amounts per earner allocation for each account', category: 'Core Transfers', visible: true, width: 'full' },
  { id: 'account_cards', title: 'Account Balances Snapshot', description: 'Cards showing current balance, monthly obligations, and projected end balance', category: 'Account Vitals', visible: true, width: 'half' },
  { id: 'upcoming_bills', title: 'Upcoming Bills Timeline', description: 'List of upcoming bills due with days remaining countdown badges', category: 'Bills & Schedules', visible: true, width: 'third' },
  { id: 'expenses_pie', title: 'Expenses by Account (Pie Chart)', description: 'Visual distribution of monthly bill expenses across your accounts', category: 'Charts & Analytics', visible: true, width: 'third' },
  { id: 'proj_vs_actual', title: 'Projected vs Actual Spending (Bar Chart)', description: 'Bar chart comparing planned budget vs actual monthly spending', category: 'Charts & Analytics', visible: true, width: 'half' },
  { id: 'budget_health', title: 'Budget Health Score & Vitals', description: 'Radial SVG health score gauge and financial checklist', category: 'Financial Vitals', visible: true, width: 'third' },
  { id: 'earner_splits', title: 'Earner Income & Contribution Splits', description: 'Per-person monthly income and bill split contribution shares', category: 'Earner Splits', visible: true, width: 'half' },
  { id: 'recent_activity', title: 'Payday & Deposit Activity', description: 'Preview of upcoming payday deposits and scheduled bill deductions', category: 'Ledger & Cash Flow', visible: false, width: 'third' }
];

export const initialBudgetData = {
  lineItems: [],
  accounts: [],
  people: [],
  bills: [],
  loans: [],
  dashboardWidgets: DEFAULT_DASHBOARD_WIDGETS,
  theme: 'dark',
  hideDashboardHeader: false
};
