import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AuthPage } from './components/AuthPage';
import { AppLayout } from './components/AppLayout';
import { DashboardView } from './components/DashboardView';
import { InventoryView } from './components/InventoryView';
import { SalesLogView } from './components/SalesLogView';

const VIEWS = ['dashboard', 'inventory', 'sales', 'pricing', 'settings'];

function getViewFromPathname(pathname) {
  const path = (pathname || '').toLowerCase().replace(/\/$/, '');
  for (const v of VIEWS) {
    if (path === `/auction/${v}`) return v;
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
      if (normalized !== '/auction') {
        window.history.replaceState({}, '', '/auction');
        navigateTo('/auction');
      }
      return;
    }
    if (normalized === '/auction') {
      navigateTo('/auction/dashboard');
      return;
    }
    const v = getViewFromPathname(normalized);
    if (v && v !== activeView) setActiveView(v);
  }, [pathname, isAuthenticated]);

  if (!isAuthenticated) {
    return (
      <AuthPage
        onAuthSuccess={() => navigateTo('/auction/dashboard')}
      />
    );
  }

  const handleNavigate = (view) => {
    setActiveView(view);
    navigateTo(`/auction/${view}`);
  };

  return (
    <AppLayout activeView={activeView} onNavigate={handleNavigate}>
      {activeView === 'dashboard' && <DashboardView />}
      {activeView === 'inventory' && <InventoryView />}
      {activeView === 'sales' && <SalesLogView />}
      {activeView === 'pricing' && (
        <div className="flex items-center justify-center h-64 text-slate-500 text-sm">
          Pricing Intelligence — Phase 5
        </div>
      )}
      {activeView === 'settings' && (
        <div className="flex items-center justify-center h-64 text-slate-500 text-sm">
          Settings — Phase 5
        </div>
      )}
    </AppLayout>
  );
}

export default function App() {
  const [pathname, setPathname] = useState(
    () => typeof window !== 'undefined' ? window.location.pathname : '/auction'
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
