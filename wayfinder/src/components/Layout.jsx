import React, { Suspense, lazy, useState, useRef, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import { Compass, Home, User, LogOut, ShieldCheck, Shield, Menu, X, Coins, Settings, Backpack, Globe, Calendar, ChevronDown, FileText, Receipt, CheckSquare } from 'lucide-react';
import { BottomTabBar } from './BottomTabBar';
import { OfflineSyncBadge } from './common/OfflineSyncBadge';
import wayfinderHeaderBanner from '../assets/wayfinder-header-banner-new.png';

const CurrencyConverterModal = lazy(() =>
  import('./CurrencyConverterModal').then((m) => ({ default: m.CurrencyConverterModal }))
);
const SettingsModal = lazy(() =>
  import('./SettingsModal').then((m) => ({ default: m.SettingsModal }))
);

export function Layout({ children }) {
  const { user, isAuthenticated, setIsAuthModalOpen, logout } = useAuth();
  const { isSettingsOpen, setIsSettingsOpen } = useSettings();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isConverterOpen, setIsConverterOpen] = useState(false);
  const [isHubDropdownOpen, setIsHubDropdownOpen] = useState(false);
  const hubDropdownRef = useRef(null);
  const [currentPath, setCurrentPath] = useState(() => window.location.pathname + window.location.search);

  React.useEffect(() => {
    const handlePopState = () => setCurrentPath(window.location.pathname + window.location.search);
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (hubDropdownRef.current && !hubDropdownRef.current.contains(e.target)) {
        setIsHubDropdownOpen(false);
      }
    };
    if (isHubDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isHubDropdownOpen]);

  const pathOnly = (currentPath || '').split('?')[0].toLowerCase();
  const isMainLanding = pathOnly === '/' || pathOnly === '' || pathOnly === '/wayfinder' || pathOnly === '/wayfinder/' || pathOnly === '/index.html' || pathOnly === '/wayfinder/poland-christmas-2026' || pathOnly === '/wayfinder/poland-christmas-2026/';
  const showCurrencyConverter = true;

  const pushRoute = (e, path) => {
    e.preventDefault();
    window.history.pushState({}, '', path);
    setCurrentPath(path);
    window.dispatchEvent(new PopStateEvent('popstate'));
    setMobileMenuOpen(false);
  };

  return (
    <div className="min-h-screen min-h-[100dvh] flex flex-col font-sans bg-slate-950 w-full max-w-full overflow-x-clip">
      {/* Background glow effects - Radial gradients without expensive blend compositing */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute top-0 right-0 w-[800px] h-[600px] bg-[radial-gradient(circle_at_center,rgba(45,106,159,0.14)_0%,transparent_70%)] transform translate-x-1/3 -translate-y-1/3" />
        <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-[radial-gradient(circle_at_center,rgba(30,92,58,0.14)_0%,transparent_70%)] transform -translate-x-1/3 translate-y-1/3" />
      </div>

      {/* Sticky Top Navigation Bar: Locked in view on all pages */}
      <header className="sticky top-0 z-50 bg-slate-950/95 backdrop-blur-xl border-b border-[#b48214]/30 w-full max-w-full shadow-xl pt-[env(safe-area-inset-top,0px)]">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 h-14 sm:h-16 flex items-center justify-between min-w-0">
          {/* Brand Logo Banner: enlarged and spills over the bottom border */}
          <div className="flex items-start shrink-0 min-w-0 self-stretch pt-1 sm:pt-1.5 relative z-30">
            <a
              href="/wayfinder"
              onClick={(e) => pushRoute(e, '/wayfinder')}
              className="flex items-start group shrink-0 focus:outline-none relative"
              title="TechTrek Wayfinder - Travel Operations"
            >
              <img
                src={wayfinderHeaderBanner}
                alt="TechTrek Wayfinder - Plan • Explore • Navigate • Discover"
                className="h-14 sm:h-18 md:h-20 lg:h-22 w-auto object-contain block drop-shadow-[0_10px_20px_rgba(0,0,0,0.85)] filter group-hover:scale-[1.02] transition-transform duration-200 -mb-4 sm:-mb-6 md:-mb-8 lg:-mb-9 pointer-events-auto origin-top-left"
                fetchPriority="high"
              />
            </a>
          </div>

          {/* Desktop right-side actions */}
          <div className="hidden md:flex items-center space-x-1 lg:space-x-2 shrink-0">

            {/* Explicit Home link (Overview Map & 5 City Cards) */}
            <a
              href="/wayfinder/poland-christmas-2026"
              onClick={(e) => pushRoute(e, '/wayfinder/poland-christmas-2026')}
              className={`flex items-center space-x-1.5 px-2 lg:px-3 py-2 rounded-xl border text-xs lg:text-sm font-bold transition-all shadow-sm min-h-[40px] ${
                isMainLanding
                  ? 'bg-amber-500/15 border-amber-400/40 text-amber-300'
                  : 'bg-white/5 border-white/10 text-slate-200 hover:text-white hover:bg-white/10'
              }`}
              title="Trip Home (Map & City Cards)"
            >
              <Home className="w-3.5 h-3.5 lg:w-4 lg:h-4 text-amber-400" />
              <span className="hidden lg:inline">Home</span>
            </a>

            {/* Practical Guide link */}
            <a
              href="/wayfinder/poland-christmas-2026/practical"
              onClick={(e) => pushRoute(e, '/wayfinder/poland-christmas-2026/practical')}
              className="flex items-center space-x-1.5 px-2 lg:px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-slate-200 text-xs lg:text-sm font-bold hover:text-white hover:bg-white/10 transition-all shadow-sm min-h-[40px]"
              title="Practical Guide"
            >
              <Backpack className="w-3.5 h-3.5 lg:w-4 lg:h-4 text-amber-400" />
              <span className="hidden lg:inline">Practical</span>
            </a>

            {/* Itinerary link: opens Private Hub Itinerary directly when signed in */}
            <a
              href={isAuthenticated ? '/wayfinder/poland-christmas-2026/private' : '/wayfinder/poland-christmas-2026?scroll=journey-sequence'}
              onClick={(e) => {
                e.preventDefault();
                if (isAuthenticated) {
                  pushRoute(e, '/wayfinder/poland-christmas-2026/private');
                  return;
                }
                const isMain = currentPath === '/wayfinder' || currentPath === '/wayfinder/' || currentPath.startsWith('/wayfinder/poland-christmas-2026');
                const el = document.getElementById('journey-sequence');
                if (isMain && el) {
                  const y = Math.max(0, el.getBoundingClientRect().top + window.pageYOffset - 80);
                  window.scrollTo({ top: y, behavior: 'smooth' });
                } else {
                  pushRoute(e, '/wayfinder/poland-christmas-2026?scroll=journey-sequence');
                }
              }}
              className={`flex items-center space-x-1.5 px-2 lg:px-3 py-2 rounded-xl border text-xs lg:text-sm font-bold transition-all shadow-sm min-h-[40px] ${
                isAuthenticated && (pathOnly === '/wayfinder/poland-christmas-2026/private' || pathOnly === '/wayfinder/poland-christmas-2026/private/')
                  ? 'bg-amber-500/15 border-amber-400/40 text-amber-300'
                  : 'bg-white/5 border-white/10 text-slate-200 hover:text-white hover:bg-white/10'
              }`}
              title={isAuthenticated ? 'Day-by-Day Itinerary (Private Hub)' : '10-Day Expedition Itinerary'}
            >
              <Calendar className="w-3.5 h-3.5 lg:w-4 lg:h-4 text-amber-400" />
              <span className="hidden lg:inline">Itinerary</span>
            </a>

            {/* Currency Converter */}
            {showCurrencyConverter && (
              <button
                onClick={() => setIsConverterOpen(!isConverterOpen)}
                className="flex items-center space-x-1.5 px-2 lg:px-2.5 py-2 rounded-xl bg-wf-amber/10 border border-wf-amber/30 text-wf-amber text-xs lg:text-sm font-bold hover:bg-wf-amber/20 transition-all shadow-sm active:scale-95 group min-h-[40px]"
                title="Open Currency Converter"
              >
                <Coins className="w-3.5 h-3.5 lg:w-4 lg:h-4 text-wf-amber group-hover:rotate-12 transition-transform" />
                <span className="hidden lg:inline">Currency Converter</span>
              </button>
            )}

            {/* Offline Mutation Queue & Sync Badge */}
            <OfflineSyncBadge />

            {isAuthenticated ? (
              <div className="flex items-center space-x-1 lg:space-x-2">
                {/* Private Hub Dropdown Menu */}
                <div className="relative" ref={hubDropdownRef}>
                  <button
                    type="button"
                    onClick={() => setIsHubDropdownOpen((prev) => !prev)}
                    className={`flex items-center space-x-1.5 px-2 lg:px-2.5 py-2 rounded-xl border text-xs lg:text-sm font-medium transition-all shadow-sm min-h-[40px] ${
                      pathOnly.startsWith('/wayfinder/poland-christmas-2026/private')
                        ? 'bg-wf-navy border-wf-blue/50 text-white shadow-sky-500/20'
                        : 'bg-wf-navy/60 border-wf-blue/30 text-wf-blue-lt hover:bg-wf-navy-lt hover:text-white'
                    }`}
                    title="Private Operations Hub Menu"
                    aria-expanded={isHubDropdownOpen}
                  >
                    <ShieldCheck className="w-3.5 h-3.5 lg:w-4 lg:h-4 text-emerald-400" />
                    <span className="hidden lg:inline">Private Hub</span>
                    <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${isHubDropdownOpen ? 'rotate-180 text-white' : ''}`} />
                  </button>

                  {isHubDropdownOpen && (
                    <div className="absolute right-0 mt-2 w-56 rounded-2xl bg-slate-950/95 backdrop-blur-xl border border-white/10 shadow-2xl p-1.5 z-50 animate-fade-in space-y-0.5">
                      <div className="px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-slate-400 border-b border-white/5 flex items-center justify-between">
                        <span>Private Hub Tools</span>
                        <span className="text-emerald-400 font-mono text-[9px]">Verified</span>
                      </div>
                      <a
                        href="/wayfinder/poland-christmas-2026/private"
                        onClick={(e) => {
                          setIsHubDropdownOpen(false);
                          pushRoute(e, '/wayfinder/poland-christmas-2026/private');
                        }}
                        className="flex items-center space-x-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-slate-200 hover:text-white hover:bg-white/10 transition-colors"
                      >
                        <Calendar className="w-4 h-4 text-amber-400 shrink-0" />
                        <div>
                          <div className="leading-tight">Daily Itinerary</div>
                          <div className="text-[10px] text-slate-400 font-normal">Day-by-day scroll & bookings</div>
                        </div>
                      </a>
                      <a
                        href="/wayfinder/poland-christmas-2026/private/documents"
                        onClick={(e) => {
                          setIsHubDropdownOpen(false);
                          pushRoute(e, '/wayfinder/poland-christmas-2026/private/documents');
                        }}
                        className="flex items-center space-x-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-slate-200 hover:text-white hover:bg-white/10 transition-colors"
                      >
                        <FileText className="w-4 h-4 text-sky-400 shrink-0" />
                        <div>
                          <div className="leading-tight">Documents & Tickets</div>
                          <div className="text-[10px] text-slate-400 font-normal">PDF vault & email imports</div>
                        </div>
                      </a>
                      <a
                        href="/wayfinder/poland-christmas-2026/private/packing"
                        onClick={(e) => {
                          setIsHubDropdownOpen(false);
                          pushRoute(e, '/wayfinder/poland-christmas-2026/private/packing');
                        }}
                        className="flex items-center space-x-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-slate-200 hover:text-white hover:bg-white/10 transition-colors"
                      >
                        <Backpack className="w-4 h-4 text-emerald-400 shrink-0" />
                        <div>
                          <div className="leading-tight">Packing List</div>
                          <div className="text-[10px] text-slate-400 font-normal">Winter essentials sync</div>
                        </div>
                      </a>
                      <a
                        href="/wayfinder/poland-christmas-2026/private/expenses"
                        onClick={(e) => {
                          setIsHubDropdownOpen(false);
                          pushRoute(e, '/wayfinder/poland-christmas-2026/private/expenses');
                        }}
                        className="flex items-center space-x-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-slate-200 hover:text-white hover:bg-white/10 transition-colors"
                      >
                        <Receipt className="w-4 h-4 text-amber-400 shrink-0" />
                        <div>
                          <div className="leading-tight">Expense Ledger</div>
                          <div className="text-[10px] text-slate-400 font-normal">Shared costs & settlements</div>
                        </div>
                      </a>
                    </div>
                  )}
                </div>

                {(user?.isAdmin || user?.role === 'admin') && (
                  <a
                    href="/wayfinder/admin"
                    onClick={(e) => pushRoute(e, '/wayfinder/admin')}
                    className="flex items-center space-x-1.5 px-2 lg:px-2.5 py-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs lg:text-sm font-semibold hover:bg-amber-500/20 transition-all min-h-[40px] shadow-sm"
                    title="System Administration & Key Entitlements"
                  >
                    <Shield className="w-3.5 h-3.5 lg:w-4 lg:h-4 text-amber-400" />
                    <span className="hidden lg:inline">Admin</span>
                  </a>
                )}
                <div className="h-5 lg:h-6 w-px bg-white/10 mx-0.5" />
                <button
                  onClick={() => setIsSettingsOpen(true)}
                  className="flex items-center space-x-1 px-1.5 lg:px-2.5 py-2 text-xs lg:text-sm font-medium text-wf-muted hover:text-white transition-colors min-h-[40px]"
                  title="Settings"
                >
                  <Settings className="w-3.5 h-3.5 lg:w-4 lg:h-4" />
                </button>
                <button
                  onClick={logout}
                  className="flex items-center space-x-1 px-1.5 lg:px-2.5 py-2 text-xs lg:text-sm font-medium text-wf-muted hover:text-white transition-colors min-h-[40px]"
                  title="Sign Out"
                >
                  <LogOut className="w-3.5 h-3.5 lg:w-4 lg:h-4" />
                  <span className="hidden lg:inline">Sign Out</span>
                </button>
              </div>
            ) : (
              <div className="flex items-center space-x-1 lg:space-x-2">
                <button
                  onClick={() => setIsSettingsOpen(true)}
                  className="flex items-center space-x-1 px-1.5 lg:px-2.5 py-2 text-xs lg:text-sm font-medium text-wf-muted hover:text-white transition-colors min-h-[40px]"
                  title="Settings"
                >
                  <Settings className="w-3.5 h-3.5 lg:w-4 lg:h-4" />
                </button>
                <button
                  onClick={() => setIsAuthModalOpen(true)}
                  className="flex items-center space-x-1.5 px-2.5 lg:px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white text-xs lg:text-sm font-medium transition-colors min-h-[40px]"
                  title="Sign In"
                >
                  <User className="w-3.5 h-3.5 lg:w-4 lg:h-4 text-wf-blue-lt" />
                  <span className="hidden sm:inline">Sign In</span>
                </button>
              </div>
            )}
          </div>

          {/* Mobile top bar: Offline Sync + Currency button + settings shortcut */}
          <div className="md:hidden flex items-center space-x-1.5 sm:space-x-2">
            <OfflineSyncBadge />
            <button
              onClick={() => setIsConverterOpen(!isConverterOpen)}
              className="flex items-center justify-center p-2 min-h-[44px] min-w-[44px] rounded-xl bg-wf-amber/10 border border-wf-amber/30 text-wf-amber text-xs font-bold active:scale-95"
              title="Open Currency Converter"
              aria-label="Open Currency Converter"
            >
              <Coins className="w-5 h-5 text-wf-amber" />
            </button>
            <button
              onClick={() => setIsSettingsOpen(true)}
              className="p-2 rounded-lg text-wf-muted hover:text-white hover:bg-white/5 min-h-[44px] min-w-[44px] flex items-center justify-center"
              aria-label="Settings"
            >
              <Settings className="w-5 h-5" />
            </button>
            {(user?.isAdmin || user?.role === 'admin') && (
              <a
                href="/wayfinder/admin"
                onClick={(e) => pushRoute(e, '/wayfinder/admin')}
                className="p-2 rounded-lg text-amber-400 hover:text-amber-300 hover:bg-white/5 min-h-[44px] min-w-[44px] flex items-center justify-center"
                aria-label="Admin Dashboard"
                title="Admin Dashboard"
              >
                <Shield className="w-5 h-5" />
              </a>
            )}
          </div>
        </div>


      </header>

      <main className="flex-1 relative z-10 w-full max-w-full flex flex-col overflow-x-clip pb-24 md:pb-0">
        {children}
      </main>

      {/* Mobile persistent bottom tab bar */}
      <BottomTabBar currentPath={currentPath} onOpenConverter={() => setIsConverterOpen(true)} />

      {/* Global Full-Screen Currency Converter Modal (lazy-loaded on demand) */}
      {isConverterOpen && (
        <Suspense fallback={null}>
          <CurrencyConverterModal
            isOpen={isConverterOpen}
            onClose={() => setIsConverterOpen(false)}
          />
        </Suspense>
      )}

      {/* Global Settings Modal (lazy-loaded on demand) */}
      {isSettingsOpen && (
        <Suspense fallback={null}>
          <SettingsModal
            isOpen={isSettingsOpen}
            onClose={() => setIsSettingsOpen(false)}
          />
        </Suspense>
      )}

      <footer className="border-t border-white/5 pt-8 pb-24 md:pb-8 bg-wf-navy/80 backdrop-blur-md relative z-10 mt-auto safe-pb">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <Compass className="w-5 h-5 text-wf-blue-lt" />
              <span className="text-sm font-semibold text-white tracking-wide">TechTrek Wayfinder</span>
            </div>
            <span className="text-white/20">|</span>
            <a
              href="https://techtrekgt.com"
              className="text-xs text-wf-blue-lt hover:text-white flex items-center gap-1 transition-colors"
            >
              <Globe className="w-3.5 h-3.5" />
              <span>TechTrekGT Launch Pad</span>
            </a>
          </div>
          <div className="text-xs text-wf-muted">
            &copy; {new Date().getFullYear()} TechTrekGT. Smart routes. Memorable places.
          </div>
        </div>
      </footer>
    </div>
  );
}
