import React, { useState, useEffect, Suspense } from 'react';
import { Layout } from './components/Layout';
import { AuthModal } from './components/AuthModal';
const WayfinderLanding = React.lazy(() => import('./components/WayfinderLanding').then(m => ({ default: m.WayfinderLanding })));
const PolandLanding = React.lazy(() => import('./components/PolandLanding').then(m => ({ default: m.PolandLanding })));
const CityPage = React.lazy(() => import('./components/CityPage').then(m => ({ default: m.CityPage })));
const PracticalPage = React.lazy(() => import('./components/PracticalPage').then(m => ({ default: m.PracticalPage })));
const PrivateHub = React.lazy(() => import('./components/PrivateHub').then(m => ({ default: m.PrivateHub })));
const AdminView = React.lazy(() => import('./components/admin/AdminView').then(m => ({ default: m.AdminView })));

// Simple client-side router
function App() {
  const [currentPath, setCurrentPath] = useState(window.location.pathname + window.location.search);


  useEffect(() => {
    const handlePopState = () => setCurrentPath(window.location.pathname + window.location.search);
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Scroll restoration: scroll to top on route change (unless city route or scroll target is present)
  useEffect(() => {
    const isCityRoute = currentPath.includes('/cities/');
    const isScrollTarget = currentPath.includes('scroll=') || currentPath.includes('#');
    if (!isCityRoute && !isScrollTarget) {
      window.scrollTo(0, 0);
    }
  }, [currentPath]);

  const renderRoute = () => {
    // Route matching with normalized path
    const pathOnly = currentPath.split('?')[0].toLowerCase();
    const normalizedPath = (pathOnly === '/' || pathOnly === '' || pathOnly === '/index.html') 
      ? '/wayfinder' 
      : (pathOnly.startsWith('/wayfinder') ? pathOnly : `/wayfinder${pathOnly.startsWith('/') ? pathOnly : '/' + pathOnly}`);

    // Root - go straight to Poland landing (single active journey)
    if (normalizedPath === '/wayfinder' || normalizedPath === '/wayfinder/') {
      return <PolandLanding />;
    }

    // Destinations gallery (future use when multiple journeys exist)
    if (normalizedPath === '/wayfinder/destinations') {
      return <WayfinderLanding />;
    }

    if (normalizedPath === '/wayfinder/poland-christmas-2026' || normalizedPath === '/wayfinder/poland-christmas-2026/') {
      return <PolandLanding />;
    }

    // Retired standalone pages - redirect to PolandLanding
    if (
      normalizedPath === '/wayfinder/poland-christmas-2026/route' ||
      normalizedPath === '/wayfinder/poland-christmas-2026/rail' ||
      normalizedPath === '/wayfinder/poland-christmas-2026/markets' ||
      normalizedPath === '/wayfinder/poland-christmas-2026/stays-and-food'
    ) {
      window.history.replaceState({}, '', '/wayfinder/poland-christmas-2026');
      return <PolandLanding />;
    }

    // Itinerary/timeline aliases redirect to PrivateHub
    if (
      normalizedPath === '/wayfinder/poland-christmas-2026/itinerary' ||
      normalizedPath === '/wayfinder/poland-christmas-2026/timeline'
    ) {
      window.history.replaceState({}, '', '/wayfinder/poland-christmas-2026/private');
      return <PrivateHub currentPath="/wayfinder/poland-christmas-2026/private" />;
    }

    // Expenses / budget aliases redirect to PrivateHub expenses tab
    if (
      normalizedPath === '/wayfinder/poland-christmas-2026/expenses' ||
      normalizedPath === '/wayfinder/poland-christmas-2026/budget' ||
      normalizedPath === '/wayfinder/poland-christmas-2026/ledger'
    ) {
      window.history.replaceState({}, '', '/wayfinder/poland-christmas-2026/private/expenses');
      return <PrivateHub currentPath="/wayfinder/poland-christmas-2026/private/expenses" />;
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

    if (normalizedPath.startsWith('/wayfinder/poland-christmas-2026/private')) {
      return <PrivateHub currentPath={normalizedPath} />;
    }

    if (normalizedPath === '/wayfinder/gmail-callback' || normalizedPath === '/wayfinder/gmail-callback/') {
      window.history.replaceState({}, '', '/wayfinder/poland-christmas-2026/private/documents');
      return <PrivateHub currentPath="/wayfinder/poland-christmas-2026/private/documents" />;
    }

    if (
      normalizedPath === '/wayfinder/admin' ||
      normalizedPath === '/wayfinder/admin/' ||
      normalizedPath === '/wayfinder/poland-christmas-2026/admin' ||
      normalizedPath === '/wayfinder/poland-christmas-2026/admin/'
    ) {
      return <AdminView />;
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
