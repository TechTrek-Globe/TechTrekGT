import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { Home, PackageSearch, Receipt, Calculator, Settings, LogOut, Menu, X, Leaf } from 'lucide-react';

export default function AppLayout({ children, currentView, onViewChange }) {
  const { user, logout } = useAuth();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Close mobile menu on view change
  useEffect(() => { setIsMobileMenuOpen(false); }, [currentView]);

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: Home },
    { id: 'items',     label: 'Catalog',   icon: PackageSearch },
    { id: 'orders',    label: 'Orders',    icon: Receipt },
    { id: 'tax',       label: 'Tax & ETV', icon: Calculator },
    { id: 'settings',  label: 'Settings',  icon: Settings },
  ];

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-surface">
      {/* Mobile Header */}
      <div className="md:hidden flex items-center justify-between p-4 border-b border-surface-border bg-surface-card">
        <div className="flex items-center gap-2">
          <Leaf className="w-6 h-6 text-vs-500" />
          <span className="font-bold text-lg text-white">VScout</span>
        </div>
        <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="text-slate-300 hover:text-white">
          {isMobileMenuOpen ? <X /> : <Menu />}
        </button>
      </div>

      {/* Sidebar Navigation */}
      <nav className={`
        ${isMobileMenuOpen ? 'block' : 'hidden'} 
        md:flex flex-col w-full md:w-64 border-r border-surface-border bg-surface-card 
        md:h-screen md:sticky md:top-0 shrink-0
      `}>
        <div className="hidden md:flex items-center gap-3 p-6 border-b border-surface-border">
          <div className="w-10 h-10 rounded-xl bg-vs-500/10 flex items-center justify-center border border-vs-500/20">
            <Leaf className="w-6 h-6 text-vs-500" />
          </div>
          <span className="font-bold text-xl text-white tracking-tight">VScout</span>
        </div>

        <div className="flex-1 px-3 py-6 space-y-1 overflow-y-auto">
          {navItems.map(item => {
            const Icon = item.icon;
            const isActive = currentView === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onViewChange(item.id)}
                className={`w-full vs-nav-link ${isActive ? 'active' : ''}`}
              >
                <Icon className="w-5 h-5" />
                {item.label}
              </button>
            );
          })}
        </div>

        <div className="p-4 border-t border-surface-border mt-auto">
          <div className="mb-4 px-2">
            <div className="text-sm font-medium text-slate-200">{user?.name || 'User'}</div>
            <div className="text-xs text-slate-500 truncate">{user?.email}</div>
          </div>
          <button 
            onClick={logout}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Sign out
          </button>
        </div>
      </nav>

      {/* Main Content Area */}
      <main className="flex-1 p-4 md:p-8 min-w-0 animate-fade-in-up">
        <div className="max-w-6xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
