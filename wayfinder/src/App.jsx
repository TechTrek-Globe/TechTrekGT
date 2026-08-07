import React, { useState, useEffect } from 'react';
import { Layout } from './components/Layout';
import { AuthModal } from './components/AuthModal';
import { WayfinderLanding } from './components/WayfinderLanding';
import { PolandLanding } from './components/PolandLanding';
import { CityPage } from './components/CityPage';
import { RouteVisualization } from './components/RouteVisualization';
import { MarketsPage } from './components/MarketsPage';
import { StaysAndFoodPage } from './components/StaysAndFoodPage';
import { PracticalPage } from './components/PracticalPage';
import { PrivateHub } from './components/PrivateHub';

// Simple client-side router
function App() {
  const [currentPath, setCurrentPath] = useState(window.location.pathname);

  useEffect(() => {
    const handlePopState = () => setCurrentPath(window.location.pathname);
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const renderRoute = () => {
    // Route matching with normalized path
    const path = currentPath.toLowerCase();
    const normalizedPath = (path === '/' || path === '' || path === '/index.html') 
      ? '/wayfinder' 
      : (path.startsWith('/wayfinder') ? path : `/wayfinder${path.startsWith('/') ? path : '/' + path}`);

    // Wayfinder Root Landing
    if (normalizedPath === '/wayfinder' || normalizedPath === '/wayfinder/') {
      return <WayfinderLanding />;
    }

    if (normalizedPath === '/wayfinder/poland-christmas-2026' || normalizedPath === '/wayfinder/poland-christmas-2026/') {
      return <PolandLanding />;
    }

    if (normalizedPath === '/wayfinder/poland-christmas-2026/route' || normalizedPath === '/wayfinder/poland-christmas-2026/rail') {
      return <RouteVisualization />;
    }

    if (normalizedPath === '/wayfinder/poland-christmas-2026/markets') {
      return <MarketsPage />;
    }

    if (normalizedPath === '/wayfinder/poland-christmas-2026/stays-and-food') {
      return <StaysAndFoodPage />;
    }

    if (normalizedPath === '/wayfinder/poland-christmas-2026/practical') {
      return <PracticalPage />;
    }

    if (normalizedPath.startsWith('/wayfinder/poland-christmas-2026/cities/')) {
      const pathSuffix = normalizedPath.replace(/\/wayfinder\/poland-christmas-2026\/cities\/?/, '');
      const parts = pathSuffix.split('/');
      const cityId = parts[0];
      const subPage = parts[1] || 'overview';
      return <CityPage cityId={cityId} subPage={subPage} />;
    }

    if (normalizedPath.startsWith('/wayfinder/poland-christmas-2026/private')) {
      return <PrivateHub currentPath={normalizedPath} />;
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
      {renderRoute()}
      <AuthModal />
    </Layout>
  );
}

export default App;
