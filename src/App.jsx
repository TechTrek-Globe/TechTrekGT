import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { BudgetMetadataProvider } from './context/BudgetMetadataContext';
import { LedgerDataProvider } from './context/LedgerDataContext';
import { useBudget } from './context/BudgetContext';
import { AppLayout } from './components/AppLayout';
import { SettingsModal } from './components/SettingsModal';
import { SettingsView } from './components/SettingsView';
import { DashboardView } from './components/DashboardView';
import { MainBudgetView } from './components/MainBudgetView';
import { LedgerView } from './components/LedgerView';
import { AmortizationView } from './components/AmortizationView';
import { LandingPage } from './components/LandingPage';
import AuthModal from './components/AuthModal';
import { Lock } from 'lucide-react';

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

function MainContent() {
  const { activeView, isSettingsOpen } = useBudget();
  const { isAuthenticated } = useAuth();

  if (!isAuthenticated) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center p-8 text-center">
        <div className="max-w-md w-full p-8 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-2xl backdrop-blur-xl text-center space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-slate-800/90 border border-slate-700/80 mx-auto flex items-center justify-center text-emerald-400 shadow-inner">
            <Lock className="w-6 h-6" />
          </div>
          <h2 className="text-xl font-bold text-slate-100">Authentication Required</h2>
          <p className="text-xs text-slate-400">
            Please sign in with your TechTrek account credentials to access your personal dashboard and ledger.
          </p>
        </div>
        <AuthModal />
      </div>
    );
  }

  return (
    <>
      {activeView === 'dashboard'   && <DashboardView />}
      {activeView === 'main_budget' && <MainBudgetView />}
      {activeView === 'ledger'      && <LedgerView />}
      {activeView === 'amortization'&& <AmortizationView />}
      {activeView === 'settings'    && <SettingsView />}
      {isSettingsOpen && <SettingsModal />}
      <AuthModal />
    </>
  );
}

function getRouteFromPathname(pathname) {
  const path = (pathname || (typeof window !== 'undefined' ? window.location.pathname : '')).toLowerCase();
  if (path === '/finance' || path.startsWith('/finance/')) {
    return 'finance';
  }
  return 'landing';
}

export default function App() {
  const [route, setRoute] = useState(getRouteFromPathname);

  useEffect(() => {
    const handlePopState = () => {
      setRoute(getRouteFromPathname(window.location.pathname));
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigateTo = (path) => {
    if (typeof window !== 'undefined') {
      window.history.pushState({}, '', path);
      setRoute(getRouteFromPathname(path));
    }
  };

  return (
    <ErrorBoundary>
      {route === 'landing' ? (
        <LandingPage onNavigate={navigateTo} />
      ) : (
        <AuthProvider>
          <BudgetMetadataProvider>
            <LedgerDataProvider>
              <AppLayout onNavigateHome={() => navigateTo('/')}>
                <MainContent />
              </AppLayout>
            </LedgerDataProvider>
          </BudgetMetadataProvider>
        </AuthProvider>
      )}
    </ErrorBoundary>
  );
}
