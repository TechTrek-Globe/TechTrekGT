/**
 * Canonical list and set of allowed root keys for budget state persistence and synchronization.
 * FIN-AUDIT: Extracted from worker.js into shared utility to decouple client contexts from server Worker module.
 */

export const ALLOWED_BUDGET_KEYS_LIST = [
  'accounts',
  'people',
  'bills',
  'transactions',
  'lineItems',
  'fundingGoals',
  'loans',
  'loan',
  'dailyMatrix',
  'dashboardWidgets',
  'theme',
  'hideDashboardHeader',
  'categories',
  'schemaVersion'
];

export const ALLOWED_BUDGET_KEYS = new Set(ALLOWED_BUDGET_KEYS_LIST);

