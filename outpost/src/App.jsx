import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { InventoryProvider } from './context/InventoryContext';
import { AuthPage } from './components/AuthPage';
import { AppLayout } from './components/AppLayout';
function lazyWithRetry(componentImport) {
  return React.lazy(async () => {
    try {
      return await componentImport();
    } catch (error) {
      const isChunkError =
        error?.message?.includes('dynamically imported module') ||
        error?.message?.includes('Failed to fetch') ||
        error?.name === 'ChunkLoadError';

      if (isChunkError && typeof window !== 'undefined') {
        const lastAttempt = Number(sessionStorage.getItem('outpost_chunk_reload_attempt') || '0');
        const now = Date.now();
        if (!lastAttempt || now - lastAttempt > 10000) {
          sessionStorage.setItem('outpost_chunk_reload_attempt', String(now));
          window.location.reload();
          return new Promise(() => {});
        }
      }
      throw error;
    }
  });
}

if (typeof window !== 'undefined') {
  window.addEventListener('vite:preloadError', (event) => {
    event.preventDefault();
    const lastAttempt = Number(sessionStorage.getItem('outpost_chunk_reload_attempt') || '0');
    const now = Date.now();
    if (!lastAttempt || now - lastAttempt > 10000) {
      sessionStorage.setItem('outpost_chunk_reload_attempt', String(now));
      window.location.reload();
    }
  });
}

const DashboardView = lazyWithRetry(() => import('./components/DashboardView').then(m => ({ default: m.DashboardView })));
const InventoryHubView = lazyWithRetry(() => import('./components/InventoryHubView').then(m => ({ default: m.InventoryHubView })));
const SalesLogView = lazyWithRetry(() => import('./components/SalesLogView').then(m => ({ default: m.SalesLogView })));
const SettingsView = lazyWithRetry(() => import('./components/SettingsView').then(m => ({ default: m.SettingsView })));
const AdminView = lazyWithRetry(() => import('./components/AdminView').then(m => ({ default: m.AdminView })));

const VIEWS = ['dashboard', 'inventory', 'sales', 'settings', 'admin'];

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
    const isChunkError =
      error?.message?.includes('dynamically imported module') ||
      error?.message?.includes('Failed to fetch') ||
      error?.name === 'ChunkLoadError';
    if (isChunkError && typeof window !== 'undefined') {
      const lastAttempt = Number(sessionStorage.getItem('outpost_chunk_reload_attempt') || '0');
      const now = Date.now();
      if (!lastAttempt || now - lastAttempt > 10000) {
        sessionStorage.setItem('outpost_chunk_reload_attempt', String(now));
        window.location.reload();
      }
    }
  }
  render() {
    if (this.state.hasError) {
      const isChunkError =
        this.state.error?.message?.includes('dynamically imported module') ||
        this.state.error?.message?.includes('Failed to fetch') ||
        this.state.error?.name === 'ChunkLoadError';

      return (
        <div className="p-6 max-w-xl mx-auto my-8 glass-card rounded-2xl border border-red-500/30 text-slate-200">
          <div className="flex items-center gap-3 text-red-400 font-bold text-lg mb-2">
            <span>{isChunkError ? 'New Outpost Version Available' : 'Component Rendering Error'}</span>
          </div>
          <p className="text-xs font-mono text-red-300 bg-red-950/60 p-3 rounded-lg mb-4 overflow-x-auto">
            {isChunkError
              ? 'A newer version of Outpost was deployed while this tab was open. Refreshing to load the latest components.'
              : (this.state.error?.toString() || 'Unknown error occurred')}
          </p>
          <button
            onClick={() => { this.setState({ hasError: false }); window.location.reload(); }}
            className="btn-primary py-2 px-4 text-xs font-semibold"
          >
            {isChunkError ? 'Refresh Outpost' : 'Reload Page'}
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function MainContent({ pathname, navigateTo }) {
  const { user, isAuthenticated, isLoading } = useAuth();
  const [activeView, setActiveView] = useState(() => getViewFromPathname(pathname));

  // Sync view from URL
  useEffect(() => {
    if (isLoading) return;
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
    
    if (v === 'admin') {
      const adminEmail = import.meta.env.VITE_ADMIN_EMAIL || 'jgk1865@gmail.com';
      if (user?.email?.toLowerCase() !== adminEmail.toLowerCase()) {
        setActiveView('dashboard');
        window.history.replaceState({}, '', '/outpost/dashboard');
        return;
      }
    }

    if (v === 'dashboard' && (normalized === '/outpost/pricing' || normalized === '/auction/pricing')) {
      console.info('Pricing view has been consolidated into Inventory. Redirecting...');
      setActiveView('inventory');
      window.history.replaceState({}, '', '/outpost/inventory');
      return;
    }
    if (v && v !== activeView) setActiveView(v);
  }, [pathname, isAuthenticated, isLoading]);

  // Reset reload attempt latch once the app is stably rendered
  useEffect(() => {
    if (isAuthenticated && !isLoading) {
      const timer = setTimeout(() => {
        if (typeof window !== 'undefined') {
          sessionStorage.removeItem('outpost_chunk_reload_attempt');
        }
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [isAuthenticated, isLoading, activeView]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-2 border-amber-500/30 border-t-amber-400 rounded-full animate-spin" />
          <p className="text-slate-500 text-xs font-mono tracking-widest uppercase">Verifying session...</p>
        </div>
      </div>
    );
  }

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
    <InventoryProvider>
      <AppLayout activeView={activeView} onNavigate={handleNavigate}>
        <ErrorBoundary key={activeView}>
          <React.Suspense fallback={
            <div className="flex items-center justify-center p-12">
              <div className="w-8 h-8 border-2 border-amber-500/30 border-t-amber-400 rounded-full animate-spin" />
            </div>
          }>
            {activeView === 'dashboard' && <DashboardView onNavigate={handleNavigate} />}
            {activeView === 'inventory' && <InventoryHubView onNavigate={handleNavigate} />}
            {activeView === 'sales' && <SalesLogView onNavigate={handleNavigate} />}
            {activeView === 'settings' && <SettingsView />}
            {activeView === 'admin' && <AdminView />}
          </React.Suspense>
        </ErrorBoundary>
      </AppLayout>
    </InventoryProvider>
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
