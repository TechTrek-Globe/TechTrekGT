import React, { useState, useEffect, Suspense } from 'react';
import { Layout } from './components/Layout';
import { AuthModal } from './components/AuthModal';
import { ProtectedRoute } from './components/ProtectedRoute';
import { parseWayfinderLocation, resolveCanonicalRedirect, navigateTo } from './utils/router';
const WayfinderLanding = React.lazy(() => import('./components/WayfinderLanding').then(m => ({ default: m.WayfinderLanding })));
const PolandLanding = React.lazy(() => import('./components/PolandLanding').then(m => ({ default: m.PolandLanding })));
const CityPage = React.lazy(() => import('./components/CityPage').then(m => ({ default: m.CityPage })));
const PracticalPage = React.lazy(() => import('./components/PracticalPage').then(m => ({ default: m.PracticalPage })));
const PrivateHub = React.lazy(() => import('./components/PrivateHub').then(m => ({ default: m.PrivateHub })));
const AdminView = React.lazy(() => import('./components/admin/AdminView').then(m => ({ default: m.AdminView })));
const InviteClaim = React.lazy(() => import('./components/InviteClaim').then(m => ({ default: m.InviteClaim })));

// Simple client-side router
function App() {
  const [currentPath, setCurrentPath] = useState(window.location.pathname + window.location.search);


  useEffect(() => {
    const handlePopState = () => setCurrentPath(window.location.pathname + window.location.search);
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const canonicalRedirect = resolveCanonicalRedirect(currentPath);

  useEffect(() => {
    if (!canonicalRedirect || typeof window === 'undefined') return;
    const currentFull = window.location.pathname + window.location.search + window.location.hash;
    if (currentFull !== canonicalRedirect) {
      navigateTo(canonicalRedirect, { replace: true });
    }
  }, [canonicalRedirect]);

  // Scroll restoration: scroll to top on route change (unless city route or scroll target is present)
  useEffect(() => {
    const isCityRoute = currentPath.includes('/cities/');
    const isScrollTarget = currentPath.includes('scroll=') || currentPath.includes('#');
    if (!isCityRoute && !isScrollTarget) {
      window.scrollTo(0, 0);
    }
  }, [currentPath]);

  const renderRoute = () => {
    const { rawNormalizedPath, normalizedPath } = parseWayfinderLocation(currentPath);

    // Root - go straight to Poland landing (single active journey)
    if (normalizedPath === '/wayfinder' || normalizedPath === '/wayfinder/') {
      return <PolandLanding />;
    }

    // Shared agenda invitation claim
    if (normalizedPath === '/wayfinder/invite' || normalizedPath === '/wayfinder/invite/') {
      return <InviteClaim />;
    }

    // Destinations gallery (future use when multiple journeys exist)
    if (normalizedPath === '/wayfinder/destinations') {
      return <WayfinderLanding />;
    }

    if (normalizedPath === '/wayfinder/poland-christmas-2026' || normalizedPath === '/wayfinder/poland-christmas-2026/') {
      return <PolandLanding />;
    }

    // Retired standalone pages - render canonical PolandLanding while useEffect normalizes URL
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
      return <PolandLanding />;
    }

    // Protected itinerary/timeline aliases -> PrivateHub
    if (
      normalizedPath === '/wayfinder/poland-christmas-2026/itinerary' ||
      normalizedPath === '/wayfinder/poland-christmas-2026/timeline' ||
      normalizedPath === '/wayfinder/itinerary' ||
      normalizedPath === '/wayfinder/timeline'
    ) {
      const target = '/wayfinder/poland-christmas-2026/private';
      return (
        <ProtectedRoute
          title="Private Itinerary & Bookings"
          description="Sign in to view your personalized 10-day timeline, private reservations, and travel confirmations."
        >
          <PrivateHub currentPath={target} />
        </ProtectedRoute>
      );
    }

    // Protected expenses/budget/ledger aliases -> PrivateHub expenses tab
    if (
      normalizedPath === '/wayfinder/poland-christmas-2026/expenses' ||
      normalizedPath === '/wayfinder/poland-christmas-2026/budget' ||
      normalizedPath === '/wayfinder/poland-christmas-2026/ledger' ||
      normalizedPath === '/wayfinder/expenses' ||
      normalizedPath === '/wayfinder/budget' ||
      normalizedPath === '/wayfinder/ledger'
    ) {
      const target = '/wayfinder/poland-christmas-2026/private/expenses';
      return (
        <ProtectedRoute
          title="Shared Expense Ledger"
          description="Sign in to access group trip expenses, currency splits, and settle-up balances."
        >
          <PrivateHub currentPath={target} />
        </ProtectedRoute>
      );
    }

    // Protected packing aliases -> PrivateHub packing tab
    if (
      normalizedPath === '/wayfinder/poland-christmas-2026/packing' ||
      normalizedPath === '/wayfinder/packing'
    ) {
      const target = '/wayfinder/poland-christmas-2026/private/packing';
      return (
        <ProtectedRoute
          title="Packing Checklist & Luggage Budget"
          description="Sign in to sync your winter expedition packing checklist and luggage weights across devices."
        >
          <PrivateHub currentPath={target} />
        </ProtectedRoute>
      );
    }

    // Protected document vault aliases and specific document IDs
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
      const target = `/wayfinder/poland-christmas-2026/private/documents${cleanSuffix}`;
      return (
        <ProtectedRoute
          title="Private Travel Document Vault"
          description="Sign in to access securely stored travel vouchers, booking PDFs, and reservation details."
        >
          <PrivateHub currentPath={target} />
        </ProtectedRoute>
      );
    }

    // Intercept unbundled /Poland-2026/docs/* SPA fallbacks so they never render a raw 404
    if (
      normalizedPath === '/wayfinder/poland-2026/docs' ||
      normalizedPath.startsWith('/wayfinder/poland-2026/docs/') ||
      normalizedPath === '/wayfinder/poland-christmas-2026/poland-2026/docs' ||
      normalizedPath.startsWith('/wayfinder/poland-christmas-2026/poland-2026/docs/')
    ) {
      const target = '/wayfinder/poland-christmas-2026/private/documents';
      return (
        <ProtectedRoute
          title="Private Travel Document Vault"
          description="Sign in to inspect travel documents or attach local booking files inside your Private Hub."
        >
          <PrivateHub currentPath={target} />
        </ProtectedRoute>
      );
    }

    if (normalizedPath === '/wayfinder/poland-christmas-2026/practical') {
      return <PracticalPage />;
    }

    if (normalizedPath.startsWith('/wayfinder/poland-christmas-2026/cities/')) {
      const pathSuffix = normalizedPath.replace(/\/wayfinder\/poland-christmas-2026\/cities\/?/, '');
      const parts = pathSuffix.split('/');
      const cityId = parts[0];
      const rawSub = (parts[1] || 'overview').toLowerCase();
      let subPage = 'overview';
      if (['history', 'timeline', 'history-timeline', 'chronological'].includes(rawSub)) {
        subPage = 'history';
      } else if (['attractions', 'sights', 'must-see', 'must-see-sights'].includes(rawSub)) {
        subPage = 'attractions';
      } else if (['markets', 'market', 'christmas-markets'].includes(rawSub)) {
        subPage = 'markets';
      } else if (['restaurants', 'food', 'dining', 'top-restaurants', 'food-drink', 'drinks', 'bars', 'pubs', 'breweries'].includes(rawSub)) {
        subPage = 'restaurants';
      } else if (['hotels', 'hotel', 'stays', 'lodging', 'accommodations'].includes(rawSub)) {
        subPage = 'hotels';
      } else if (['lgbtq', 'gay', 'queer', 'lgbt', 'lgbtq-guide'].includes(rawSub)) {
        subPage = 'lgbtq';
      }
      return <CityPage key={`${cityId}-${subPage}`} cityId={cityId} subPage={subPage} />;
    }

    // Shorthand /wayfinder/private* canonicalizes into the active expedition Private Hub
    if (normalizedPath === '/wayfinder/private' || normalizedPath.startsWith('/wayfinder/private/')) {
      const rawSub = rawNormalizedPath.slice('/wayfinder/private'.length);
      const cleanSub = rawSub === '/' ? '' : rawSub.replace(/\/+$/, '');
      const target = `/wayfinder/poland-christmas-2026/private${cleanSub}`;
      return (
        <ProtectedRoute>
          <PrivateHub currentPath={target} />
        </ProtectedRoute>
      );
    }

    if (
      normalizedPath === '/wayfinder/poland-christmas-2026/private' ||
      normalizedPath.startsWith('/wayfinder/poland-christmas-2026/private/')
    ) {
      return (
        <ProtectedRoute>
          <PrivateHub currentPath={rawNormalizedPath} />
        </ProtectedRoute>
      );
    }

    if (normalizedPath === '/wayfinder/gmail-callback' || normalizedPath === '/wayfinder/gmail-callback/') {
      const target = '/wayfinder/poland-christmas-2026/private/documents';
      return (
        <ProtectedRoute
          title="Private Travel Document Vault"
          description="Sign in to access your trip documents and forwarding inbox settings."
        >
          <PrivateHub currentPath={target} />
        </ProtectedRoute>
      );
    }

    if (
      normalizedPath === '/wayfinder/admin' ||
      normalizedPath === '/wayfinder/admin/' ||
      normalizedPath === '/wayfinder/poland-christmas-2026/admin' ||
      normalizedPath === '/wayfinder/poland-christmas-2026/admin/'
    ) {
      return (
        <ProtectedRoute
          requireAdmin
          title="Administrator Sign In Required"
          description="Sign in with an administrator account to access system diagnostics, user management, and API key entitlements."
        >
          <AdminView />
        </ProtectedRoute>
      );
    }

    // Other Poland 2026 routes will go here once built
    if (normalizedPath.startsWith('/wayfinder/poland-christmas-2026')) {
      return (
        <div className="flex-1 flex items-center justify-center text-wf-muted p-8">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-white mb-2">Poland 2026 Route</h2>
            <p>Component under construction: {normalizedPath}</p>
          </div>
        </div>
      );
    }

    // 404 Fallback
    return (
      <div className="flex-1 flex items-center justify-center text-wf-muted p-8">
        <div className="text-center">
          <h2 className="text-3xl font-bold text-white mb-2">404 - Not Found</h2>
          <p>The travel guide you're looking for doesn't exist.</p>
        </div>
      </div>
    );
  };

  return (
    <Layout>
      <Suspense fallback={
        <div className="flex-1 flex items-center justify-center p-8 min-h-[50vh]">
          <div className="text-center animate-pulse">
            <h2 className="text-xl font-semibold text-wf-muted">Loading route...</h2>
          </div>
        </div>
      }>
        {renderRoute()}
      </Suspense>
      <AuthModal />
    </Layout>
  );
}

export default App;
