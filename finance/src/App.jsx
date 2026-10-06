import React, { useState, useEffect, useCallback } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { BudgetMetadataProvider } from './context/BudgetMetadataContext';
import { LedgerDataProvider } from './context/LedgerDataContext';
import { useBudgetMetadataState } from './context/BudgetContext';
import { AppLayout } from './components/AppLayout';
import { LandingPage } from './components/LandingPage';

const SettingsModal = React.lazy(() => import('./components/SettingsModal').then(m => ({ default: m.SettingsModal })));
const SettingsView = React.lazy(() => import('./components/SettingsView').then(m => ({ default: m.SettingsView })));
const DashboardView = React.lazy(() => import('./components/DashboardView').then(m => ({ default: m.DashboardView })));
const MainBudgetView = React.lazy(() => import('./components/MainBudgetView').then(m => ({ default: m.MainBudgetView })));
const LedgerView = React.lazy(() => import('./components/LedgerView').then(m => ({ default: m.LedgerView })));
const AmortizationView = React.lazy(() => import('./components/AmortizationView').then(m => ({ default: m.AmortizationView })));
const AuthPage = React.lazy(() => import('./components/AuthPage').then(m => ({ default: m.AuthPage })));
const AuthModal = React.lazy(() => import('./components/AuthModal'));
const AdminView = React.lazy(() => import('./components/AdminView').then(m => ({ default: m.AdminView })));

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("Uncaught runtime error:", error, errorInfo);
  }

  handleReload = () => {
    window.location.href = window.location.origin + window.location.pathname + '?v=' + Date.now();
  };

  handleReset = () => {
    try {
      localStorage.removeItem('personal_budget_app_data_v1');
      sessionStorage.clear();
      if (typeof window !== 'undefined' && window.indexedDB) {
        const req = window.indexedDB.deleteDatabase('TechTrekFinanceDB');
        req.onsuccess = req.onerror = req.onblocked = () => {
          window.location.href = window.location.origin + window.location.pathname + '?v=' + Date.now();
        };
        setTimeout(() => {
          window.location.href = window.location.origin + window.location.pathname + '?v=' + Date.now();
        }, 300);
        return;
      }
    } catch (e) {}
    window.location.href = window.location.origin + window.location.pathname + '?v=' + Date.now();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-6 text-center font-sans">
          <div className="max-w-xl p-8 rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl space-y-4 text-left">
            <h2 className="text-xl font-black text-rose-400 text-center">Something went wrong</h2>
            <p className="text-xs text-slate-400 text-center">
              An unexpected error occurred while loading the application. You can reload the page or reset the app cache to restore defaults.
            </p>
            
            {this.state.error && (
              <div className="p-3 rounded-xl bg-slate-950 border border-rose-900/50 text-[11px] font-mono text-rose-300 overflow-x-auto max-h-40">
                <p className="font-bold">{this.state.error.toString()}</p>
                {this.state.error.stack && (
                  <pre className="text-[10px] text-slate-400 mt-1 whitespace-pre-wrap">{this.state.error.stack}</pre>
                )}
              </div>
            )}

            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                onClick={this.handleReload}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-xl"
              >
                Reload Page
              </button>
              <button
                onClick={this.handleReset}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl border border-slate-700"
              >
                Reset App Cache &amp; Reload
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function getViewFromPathname(pathname) {
  const path = (pathname || '').toLowerCase().replace(/\/$/, '');
  if (path === '/finance/ledger') return 'ledger';
  if (path === '/finance/main-budget' || path === '/finance/bills') return 'main_budget';
  if (path === '/finance/amortization') return 'amortization';
  if (path === '/finance/settings') return 'settings';
  if (path === '/finance/admin') return 'admin';
  return 'dashboard';
}

function MainContent({ pathname, navigateTo, onNavigateHome }) {
  const { isSettingsOpen } = useBudgetMetadataState();
  const { isAuthenticated, isLoading, user } = useAuth();

  const normalized = (pathname || '').toLowerCase().replace(/\/$/, '');
  const activeView = getViewFromPathname(normalized);

  // Synchronize view state and URL pathname based on auth state
  useEffect(() => {
    if (isLoading) return;

    if (!isAuthenticated) {
      if (normalized.startsWith('/finance') && normalized !== '/finance') {
        if (typeof window !== 'undefined') {
          window.history.replaceState({}, '', '/finance');
        }
        navigateTo('/finance');
      }
      return;
    }

    if (normalized === '/finance' || normalized === '/finance/login' || normalized === '') {
      navigateTo('/finance/dashboard');
      return;
    }
  }, [normalized, isAuthenticated, isLoading, navigateTo]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-2 border-blue-500/30 border-t-blue-400 rounded-full animate-spin" />
          <p className="text-slate-500 text-xs font-mono tracking-widest uppercase">Verifying session...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <React.Suspense fallback={<div className="p-4 text-gray-400">Loading view...</div>}>
        <AuthPage
          onNavigateHome={onNavigateHome}
          onAuthSuccess={() => navigateTo('/finance/dashboard')}
        />
      </React.Suspense>
    );
  }

  const handleNavigateView = (viewId) => {
    if (viewId === 'main_budget') {
      navigateTo('/finance/main-budget');
    } else {
      navigateTo(`/finance/${viewId}`);
    }
  };

  return (
    <AppLayout activeView={activeView} onNavigateHome={onNavigateHome} onNavigateView={handleNavigateView}>
      <React.Suspense fallback={<div className="p-4 text-gray-400">Loading view...</div>}>
        {activeView === 'dashboard'   && <DashboardView onNavigateView={handleNavigateView} />}
        {activeView === 'main_budget' && <MainBudgetView onNavigateView={handleNavigateView} />}
        {activeView === 'ledger'      && <LedgerView onNavigateView={handleNavigateView} />}
        {activeView === 'amortization'&& <AmortizationView onNavigateView={handleNavigateView} />}
        {activeView === 'settings'    && <SettingsView onNavigateView={handleNavigateView} />}
        {activeView === 'admin'       && (
          user?.isAdmin ? (
            <AdminView />
          ) : (
            <div className="flex flex-col items-center justify-center p-12 text-center min-h-[50vh]">
              <div className="max-w-md p-8 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-xl space-y-4">
                <div className="w-12 h-12 mx-auto rounded-full bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400">
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </div>
                <h3 className="text-lg font-bold text-slate-100">Access Denied</h3>
                <p className="text-sm text-slate-400">
                  Administrator privileges are required to view this section.
                </p>
                <button
                  type="button"
                  onClick={() => handleNavigateView('dashboard')}
                  className="w-full py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium text-sm rounded-xl transition-all cursor-pointer"
                >
                  Return to Dashboard
                </button>
              </div>
            </div>
          )
        )}
        {isSettingsOpen && <SettingsModal />}
        <AuthModal />
      </React.Suspense>
    </AppLayout>
  );
}

import { logState } from './utils/logger';

function getRouteFromPathname(pathname) {
  const path = (pathname || '').toLowerCase().replace(/\/$/, '');
  if (path === '/finance' || path.startsWith('/finance/')) {
    return 'finance';
  }
  return 'landing';
}

export default function App() {
  const [pathname, setPathname] = useState(() => (typeof window !== 'undefined' ? window.location.pathname : '/'));
  const route = getRouteFromPathname(pathname);

  useEffect(() => {
    logState('APP_INIT', `Finance application initialized on route: ${route}`, { route, pathname });
  }, []);

  useEffect(() => {
    const handlePopState = () => {
      const newPath = window.location.pathname;
      logState('ROUTER_POPSTATE', `Browser popstate event navigated to: ${newPath}`, { pathname: newPath, view: getViewFromPathname(newPath) });
      setPathname(newPath);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigateTo = useCallback((path) => {
    if (typeof window !== 'undefined') {
      logState('ROUTER_PUSHSTATE', `SPA pushState navigation: ${window.location.pathname} -> ${path}`, {
        from: window.location.pathname,
        to: path,
        targetView: getViewFromPathname(path)
      });
      if (window.location.pathname !== path) {
        window.history.pushState({}, '', path);
      }
      setPathname(path);
    }
  }, []);

  return (
    <ErrorBoundary>
      {route === 'landing' ? (
        <LandingPage onNavigate={navigateTo} />
      ) : (
        <AuthProvider>
          <BudgetMetadataProvider>
            <LedgerDataProvider>
              <MainContent pathname={pathname} navigateTo={navigateTo} onNavigateHome={() => navigateTo('/')} />
            </LedgerDataProvider>
          </BudgetMetadataProvider>
        </AuthProvider>
      )}
    </ErrorBoundary>
  );
}

