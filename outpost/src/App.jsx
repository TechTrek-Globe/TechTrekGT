import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AuthPage } from './components/AuthPage';
import { AppLayout } from './components/AppLayout';
import { DashboardView } from './components/DashboardView';
import { InventoryView } from './components/InventoryView';
import { SalesLogView } from './components/SalesLogView';
import { PricingIntelligenceView } from './components/PricingIntelligenceView';
import { SettingsView } from './components/SettingsView';

const VIEWS = ['dashboard', 'inventory', 'sales', 'pricing', 'settings'];

function getViewFromPathname(pathname) {
  const path = (pathname || '').toLowerCase().replace(/\/$/, '');
  for (const v of VIEWS) {
    if (path === `/outpost/${v}` || path === `/auction/${v}`) return v;
  }
  return 'dashboard';
}

function MainContent({ pathname, navigateTo }) {
  const { isAuthenticated } = useAuth();
  const [activeView, setActiveView] = useState(() => getViewFromPathname(pathname));

  // Sync view from URL
  useEffect(() => {
    const normalized = (pathname || '').toLowerCase().replace(/\/$/, '');
    if (!isAuthenticated) {
      if (normalized !== '/outpost' && normalized !== '/auction') {
        window.history.replaceState({}, '', '/outpost');
        navigateTo('/outpost');
      }
      return;
    }
    if (normalized === '/outpost' || normalized === '/auction') {
      navigateTo('/outpost/dashboard');
      return;
    }
    const v = getViewFromPathname(normalized);
    if (v && v !== activeView) setActiveView(v);
  }, [pathname, isAuthenticated]);

  if (!isAuthenticated) {
    return (
      <AuthPage
        onAuthSuccess={() => navigateTo('/outpost/dashboard')}
      />
    );
  }

  const handleNavigate = (view) => {
    setActiveView(view);
    navigateTo(`/outpost/${view}`);
  };

  return (
    <AppLayout activeView={activeView} onNavigate={handleNavigate}>
      {activeView === 'dashboard' && <DashboardView onNavigate={handleNavigate} />}
      {activeView === 'inventory' && <InventoryView />}
      {activeView === 'sales' && <SalesLogView />}
      {activeView === 'pricing' && <PricingIntelligenceView />}
      {activeView === 'settings' && <SettingsView />}
    </AppLayout>
  );
}

export default function App() {
  const [pathname, setPathname] = useState(
    () => typeof window !== 'undefined' ? window.location.pathname : '/outpost'
  );

  useEffect(() => {
    const handlePopState = () => setPathname(window.location.pathname);
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigateTo = (path) => {
    if (typeof window !== 'undefined') {
      if (window.location.pathname !== path) {
        window.history.pushState({}, '', path);
      }
      setPathname(path);
    }
  };

  return (
    <AuthProvider>
      <MainContent pathname={pathname} navigateTo={navigateTo} />
    </AuthProvider>
  );
}
