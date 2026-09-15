// Currency formatters
export function formatCurrency(value, currency = 'USD') {
  const n = parseFloat(value);
  if (isNaN(n)) return '$0.00';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(n);
}

// ETV with color classification
export function etvColor(etv) {
  const n = parseFloat(etv) || 0;
  if (n >= 100) return 'text-vs-400';
  if (n >= 50)  return 'text-amber-400';
  if (n >= 20)  return 'text-slate-200';
  return 'text-surface-muted';
}

// Date formatters
export function formatDate(dateStr) {
  if (!dateStr) return '-';
  try {
    return new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'short', day: 'numeric' }).format(new Date(dateStr));
  } catch (_) {
    return dateStr;
  }
}

export function formatDateTime(dateStr) {
  if (!dateStr) return '-';
  try {
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit'
    }).format(new Date(dateStr));
  } catch (_) {
    return dateStr;
  }
}

// Vine category labels
const CATEGORY_LABELS = {
  REGULAR:     'Regular',
  LAST_CHANCE: 'Last Chance',
  RFY:         'RFY',
  AFA:         'AFA'
};
export function vineCategoryLabel(cat) {
  return CATEGORY_LABELS[cat] || cat || '-';
}

export function vineCategoryBadgeClass(cat) {
  switch (cat) {
    case 'LAST_CHANCE': return 'vs-badge-red';
    case 'AFA':         return 'vs-badge-yellow';
    case 'RFY':         return 'vs-badge-gray';
    default:            return 'vs-badge-green'; // REGULAR
  }
}

// Star rating display
export function formatRating(rating) {
  if (rating === null || rating === undefined) return '-';
  const n = parseFloat(rating);
  if (isNaN(n)) return '-';
  return `${n.toFixed(1)} ★`;
}

// Truncate long strings
export function truncate(str, maxLen = 60) {
  if (!str) return '';
  return str.length > maxLen ? `${str.slice(0, maxLen)}…` : str;
}

// ETV tax estimate (simplified 24% marginal + 15.3% SE for display only)
export function estimateTax(etv, settings) {
  const n = parseFloat(etv) || 0;
  if (n === 0) return 0;
  const marginal = settings?.se_tax_rate ? parseFloat(settings.se_tax_rate) : 0.153;
  const state    = settings?.state_tax_rate ? parseFloat(settings.state_tax_rate) : 0;
  const federal  = 0.24;
  return Math.round(n * (federal + state + marginal) * 100) / 100;
}
