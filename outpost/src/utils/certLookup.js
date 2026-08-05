/**
 * Certificate verification lookup utility for memorabilia & trading cards.
 * Generates direct official verification URLs based on authenticator company and cert ID.
 */

export const AUTHENTICATORS = [
  { id: 'PSA', name: 'PSA (Professional Sports Authenticator)', badgeColor: 'bg-red-500/10 text-red-400 border-red-500/30' },
  { id: 'Beckett', name: 'Beckett (BGS / BAS)', badgeColor: 'bg-blue-500/10 text-blue-400 border-blue-500/30' },
  { id: 'JSA', name: 'JSA (James Spence Authentication)', badgeColor: 'bg-amber-500/10 text-amber-400 border-amber-500/30' },
  { id: 'ACOA', name: 'ACOA (AutographCOA)', badgeColor: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' },
  { id: 'SGC', name: 'SGC (Sportscard Guaranty)', badgeColor: 'bg-purple-500/10 text-purple-400 border-purple-500/30' },
  { id: 'CGC', name: 'CGC (Certified Guaranty Company)', badgeColor: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30' },
  { id: 'Fanatics', name: 'Fanatics Authentic', badgeColor: 'bg-rose-500/10 text-rose-400 border-rose-500/30' },
  { id: 'Upper Deck', name: 'Upper Deck (UDA)', badgeColor: 'bg-orange-500/10 text-orange-400 border-orange-500/30' },
  { id: 'Tristar', name: 'Tristar Productions', badgeColor: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30' },
  { id: 'Steiner', name: 'Steiner Sports', badgeColor: 'bg-slate-500/10 text-slate-300 border-slate-500/30' },
  { id: 'Other', name: 'Other / Custom', badgeColor: 'bg-slate-800 text-slate-400 border-slate-700' }
];

/**
 * Returns direct official cert lookup URL if supported, or null.
 *
 * @param {string} authenticator
 * @param {string} certNumber
 * @returns {string|null}
 */
export function getCertVerificationUrl(authenticator, certNumber) {
  if (!certNumber) return null;
  const cleanCert = String(certNumber).trim().replace(/#/g, '');
  if (!cleanCert) return null;

  const auth = String(authenticator || '').toLowerCase().trim();

  // PSA
  if (auth.includes('psa')) {
    return `https://www.psacard.com/cert/${encodeURIComponent(cleanCert)}`;
  }

  // Beckett / BGS / BAS
  if (auth.includes('beckett') || auth.includes('bgs') || auth.includes('bas')) {
    return `https://www.beckett.com/grading/cert-verification?cert_number=${encodeURIComponent(cleanCert)}`;
  }

  // JSA (James Spence)
  if (auth.includes('jsa') || auth.includes('spence')) {
    return `https://www.spenceloa.com/verify-authenticity?certNo=${encodeURIComponent(cleanCert)}`;
  }

  // ACOA (AutographCOA)
  if (auth.includes('acoa') || auth.includes('autographcoa')) {
    return `https://www.autographcoa.com/cert/${encodeURIComponent(cleanCert)}/`;
  }

  // SGC
  if (auth.includes('sgc')) {
    return `https://www.gosgc.com/cert-code-lookup/${encodeURIComponent(cleanCert)}`;
  }

  // CGC
  if (auth.includes('cgc')) {
    return `https://www.cgccomics.com/certlookup/${encodeURIComponent(cleanCert)}`;
  }

  // Fanatics Authentic
  if (auth.includes('fanatics')) {
    return `https://www.fanaticsauthentic.com/verify-authenticity?certNo=${encodeURIComponent(cleanCert)}`;
  }

  // Tristar
  if (auth.includes('tristar')) {
    return `https://www.tristarauthentic.com/verify-authenticity.html?cert=${encodeURIComponent(cleanCert)}`;
  }

  // Upper Deck
  if (auth.includes('upper deck') || auth.includes('uda')) {
    return `https://www.upperdeck.com/Customer-Care/Memorabilia-Authentication.aspx`;
  }

  return null;
}

/**
 * Returns formatting metadata (badge style, display name) for an authenticator
 * @param {string} authenticator
 */
export function getAuthenticatorMeta(authenticator) {
  const auth = String(authenticator || '').toLowerCase().trim();
  const match = AUTHENTICATORS.find(a => auth.includes(a.id.toLowerCase()));
  if (match) return match;
  return {
    id: authenticator || 'Uncertified',
    name: authenticator || 'Uncertified',
    badgeColor: 'bg-slate-800 text-slate-400 border-slate-700'
  };
}
