import { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext.jsx';
import { VScoutProvider } from './context/VScoutContext.jsx';
import AppLayout from './components/AppLayout.jsx';
import AuthPage from './components/AuthPage.jsx';
import DashboardView from './components/DashboardView.jsx';
import ItemsView from './components/ItemsView.jsx';
import OrdersView from './components/OrdersView.jsx';
import TaxView from './components/TaxView.jsx';
import SettingsView from './components/SettingsView.jsx';

// Hand-rolled SPA router matching TechTrekGT pattern
function Router() {
  const { user, loading } = useAuth();
  const [currentView, setCurrentView] = useState(() => {
    const p = window.location.pathname.replace('/vinescout', '').replace(/^\/+/, '');
    return p || 'dashboard';
  });

  useEffect(() => {
    const handlePopState = () => {
      const p = window.location.pathname.replace('/vinescout', '').replace(/^\/+/, '');
      setCurrentView(p || 'dashboard');
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigate = (view) => {
    const newPath = view === 'dashboard' ? '/vinescout/' : `/vinescout/${view}`;
    window.history.pushState(null, '', newPath);
    setCurrentView(view);
    window.scrollTo(0, 0);
  };

  if (loading) return null; // App stays blank during initial SSO cookie check
  if (!user) return <AuthPage />;

  return (
    <VScoutProvider>
      <AppLayout currentView={currentView} onViewChange={navigate}>
        {currentView === 'dashboard' && <DashboardView onViewChange={navigate} />}
        {currentView === 'items'     && <ItemsView />}
        {currentView === 'orders'    && <OrdersView />}
        {currentView === 'tax'       && <TaxView />}
        {currentView === 'settings'  && <SettingsView />}
      </AppLayout>
    </VScoutProvider>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Router />
    </AuthProvider>
  );
}
