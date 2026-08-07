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

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary caught error:", error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="p-6 max-w-xl mx-auto my-8 glass-card rounded-2xl border border-red-500/30 text-slate-200">
          <div className="flex items-center gap-3 text-red-400 font-bold text-lg mb-2">
            <span>Component Rendering Error</span>
          </div>
          <p className="text-xs font-mono text-red-300 bg-red-950/60 p-3 rounded-lg mb-4 overflow-x-auto">
            {this.state.error?.toString() || 'Unknown error occurred'}
          </p>
          <button
            onClick={() => { this.setState({ hasError: false }); window.location.reload(); }}
            className="btn-primary py-2 px-4 text-xs"
          >
            Reload Page
          </button>
        </div>
      );
    }
    return this.props.children;
  }
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
      <ErrorBoundary key={activeView}>
        {activeView === 'dashboard' && <DashboardView onNavigate={handleNavigate} />}
        {activeView === 'inventory' && <InventoryView />}
        {activeView === 'sales' && <SalesLogView />}
        {activeView === 'pricing' && <PricingIntelligenceView />}
        {activeView === 'settings' && <SettingsView />}
      </ErrorBoundary>
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
