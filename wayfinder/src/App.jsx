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
    // Route matching
    const path = currentPath.toLowerCase();

    // Wayfinder Root Landing
    if (path === '/wayfinder' || path === '/wayfinder/') {
      return <WayfinderLanding />;
    }

    if (path === '/wayfinder/poland-christmas-2026' || path === '/wayfinder/poland-christmas-2026/') {
      return <PolandLanding />;
    }

    if (path === '/wayfinder/poland-christmas-2026/route' || path === '/wayfinder/poland-christmas-2026/rail') {
      return <RouteVisualization />;
    }

    if (path === '/wayfinder/poland-christmas-2026/markets') {
      return <MarketsPage />;
    }

    if (path === '/wayfinder/poland-christmas-2026/stays-and-food') {
      return <StaysAndFoodPage />;
    }

    if (path === '/wayfinder/poland-christmas-2026/practical') {
      return <PracticalPage />;
    }

    if (path.startsWith('/wayfinder/poland-christmas-2026/cities/')) {
      const cityId = path.split('/').pop();
      return <CityPage cityId={cityId} />;
    }

    if (path.startsWith('/wayfinder/poland-christmas-2026/private')) {
      return <PrivateHub currentPath={path} />;
    }

    // Other Poland 2026 routes will go here once built
    if (path.startsWith('/wayfinder/poland-christmas-2026')) {
      return (
        <div className="flex-1 flex items-center justify-center text-wf-muted p-8">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-white mb-2">Poland 2026 Route</h2>
            <p>Component under construction: {path}</p>
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
