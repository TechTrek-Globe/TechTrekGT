// Pure SPA path normalization, legacy alias resolution, and navigation helpers.

export function parseWayfinderLocation(pathnameWithSearch, currentHash = '') {
  const [rawPathPart, rawSearchPart] = (pathnameWithSearch || '/wayfinder').split('?');
  const searchSuffix = rawSearchPart ? `?${rawSearchPart}` : '';
  const hashSuffix = currentHash || (typeof window !== 'undefined' ? window.location.hash || '' : '');
  const rawNormalizedPath =
    rawPathPart === '/' || rawPathPart === '' || rawPathPart === '/index.html'
      ? '/wayfinder'
      : rawPathPart.toLowerCase().startsWith('/wayfinder')
        ? `/wayfinder${rawPathPart.slice('/wayfinder'.length)}`
        : `/wayfinder${rawPathPart.startsWith('/') ? rawPathPart : `/${rawPathPart}`}`;

  return {
    rawNormalizedPath,
    normalizedPath: rawNormalizedPath.toLowerCase(),
    searchSuffix,
    hashSuffix,
  };
}

export function resolveCanonicalRedirect(pathnameWithSearch, currentHash = '') {
  const { rawNormalizedPath, normalizedPath, searchSuffix, hashSuffix } = parseWayfinderLocation(
    pathnameWithSearch,
    currentHash
  );

  if (
    normalizedPath === '/wayfinder/poland-christmas-2026/route' ||
    normalizedPath === '/wayfinder/poland-christmas-2026/rail' ||
    normalizedPath === '/wayfinder/poland-christmas-2026/markets' ||
    normalizedPath === '/wayfinder/poland-christmas-2026/stays-and-food' ||
    normalizedPath === '/wayfinder/route' ||
    normalizedPath === '/wayfinder/rail' ||
    normalizedPath === '/wayfinder/markets' ||
    normalizedPath === '/wayfinder/stays-and-food'
  ) {
    return `/wayfinder/poland-christmas-2026${hashSuffix}`;
  }

  if (
    normalizedPath === '/wayfinder/poland-christmas-2026/itinerary' ||
    normalizedPath === '/wayfinder/poland-christmas-2026/timeline' ||
    normalizedPath === '/wayfinder/itinerary' ||
    normalizedPath === '/wayfinder/timeline'
  ) {
    return `/wayfinder/poland-christmas-2026/private${searchSuffix}${hashSuffix}`;
  }

  if (
    normalizedPath === '/wayfinder/poland-christmas-2026/expenses' ||
    normalizedPath === '/wayfinder/poland-christmas-2026/budget' ||
    normalizedPath === '/wayfinder/poland-christmas-2026/ledger' ||
    normalizedPath === '/wayfinder/expenses' ||
    normalizedPath === '/wayfinder/budget' ||
    normalizedPath === '/wayfinder/ledger'
  ) {
    return `/wayfinder/poland-christmas-2026/private/expenses${searchSuffix}${hashSuffix}`;
  }

  if (normalizedPath === '/wayfinder/poland-christmas-2026/packing' || normalizedPath === '/wayfinder/packing') {
    return `/wayfinder/poland-christmas-2026/private/packing${searchSuffix}${hashSuffix}`;
  }

  if (
    normalizedPath === '/wayfinder/documents' ||
    normalizedPath.startsWith('/wayfinder/documents/') ||
    normalizedPath === '/wayfinder/poland-christmas-2026/documents' ||
    normalizedPath.startsWith('/wayfinder/poland-christmas-2026/documents/')
  ) {
    const rawSuffix = normalizedPath.startsWith('/wayfinder/poland-christmas-2026/documents')
      ? rawNormalizedPath.slice('/wayfinder/poland-christmas-2026/documents'.length)
      : rawNormalizedPath.slice('/wayfinder/documents'.length);
    const cleanSuffix = rawSuffix === '/' ? '' : rawSuffix.replace(/\/+$/, '');
    return `/wayfinder/poland-christmas-2026/private/documents${cleanSuffix}${searchSuffix}${hashSuffix}`;
  }

  if (
    normalizedPath === '/wayfinder/poland-2026/docs' ||
    normalizedPath.startsWith('/wayfinder/poland-2026/docs/') ||
    normalizedPath === '/wayfinder/poland-christmas-2026/poland-2026/docs' ||
    normalizedPath.startsWith('/wayfinder/poland-christmas-2026/poland-2026/docs/')
  ) {
    return `/wayfinder/poland-christmas-2026/private/documents${searchSuffix}${hashSuffix}`;
  }

  if (normalizedPath === '/wayfinder/private' || normalizedPath.startsWith('/wayfinder/private/')) {
    const rawSub = rawNormalizedPath.slice('/wayfinder/private'.length);
    const cleanSub = rawSub === '/' ? '' : rawSub.replace(/\/+$/, '');
    return `/wayfinder/poland-christmas-2026/private${cleanSub}${searchSuffix}${hashSuffix}`;
  }

  if (normalizedPath === '/wayfinder/gmail-callback' || normalizedPath === '/wayfinder/gmail-callback/') {
    return `/wayfinder/poland-christmas-2026/private/documents${hashSuffix}`;
  }

  return null;
}

export function navigateTo(path, { replace = false } = {}) {
  if (typeof window === 'undefined') return;
  if (replace) {
    window.history.replaceState({}, '', path);
  } else {
    window.history.pushState({}, '', path);
  }
  window.dispatchEvent(new PopStateEvent('popstate'));
}
