import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import { Compass, User, LogOut, ShieldCheck, Menu, X, Coins, Settings, Backpack, Globe, Calendar } from 'lucide-react';
import { CurrencyConverterModal } from './CurrencyConverterModal';
import { SettingsModal } from './SettingsModal';
import { BottomTabBar } from './BottomTabBar';
import { useExchangeRate } from '../hooks/useExchangeRate';
import wayfinderHeaderBanner from '../assets/wayfinder-header-banner-new.png';

export function Layout({ children }) {
  const { user, isAuthenticated, setIsAuthModalOpen, logout } = useAuth();
  const { isSettingsOpen, setIsSettingsOpen } = useSettings();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isConverterOpen, setIsConverterOpen] = useState(false);
  const [currentPath, setCurrentPath] = useState(() => window.location.pathname);
  const { activeCurrency } = useExchangeRate();
  const { symbol = 'zł', rate = 3.73 } = activeCurrency || {};

  React.useEffect(() => {
    const handlePopState = () => setCurrentPath(window.location.pathname);
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

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
    <div className="min-h-screen flex flex-col font-sans bg-slate-950 w-full max-w-full overflow-x-hidden">
      {/* --- Full-Width Top Header Banner --- */}
      <header className="w-full flex-shrink-0 bg-black relative z-[60] border-b border-[#b48214]/30 flex justify-center items-center pb-1 px-4 overflow-hidden safe-pt">
        <img
          src={wayfinderHeaderBanner}
          alt="TechTrek Wayfinder - Plan • Explore • Navigate • Discover"
          className="h-40 sm:h-52 md:h-60 w-auto max-w-full object-contain block relative -mb-5 sm:-mb-7 md:-mb-8 z-[60] drop-shadow-2xl translate-x-0"
          fetchPriority="high"
        />
      </header>

      {/* Background glow effects - Radial gradients instead of CSS blur() for massive iOS performance boost */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute top-0 right-0 w-[800px] h-[600px] bg-[radial-gradient(circle_at_center,rgba(45,106,159,0.15)_0%,transparent_70%)] mix-blend-screen transform translate-x-1/3 -translate-y-1/3" />
        <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-[radial-gradient(circle_at_center,rgba(30,92,58,0.15)_0%,transparent_70%)] mix-blend-screen transform -translate-x-1/3 translate-y-1/3" />
      </div>

      <header className="sticky top-0 z-40 glass-panel border-b border-white/5 w-full max-w-full">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 h-14 flex items-center justify-between min-w-0">
          <div className="flex items-center space-x-3 sm:space-x-4 shrink-0 min-w-0">
            <a href="/wayfinder" onClick={(e) => pushRoute(e, '/wayfinder')} className="flex items-center space-x-2 group shrink-0">
              <div className="p-1.5 rounded-xl bg-gradient-to-br from-wf-blue to-wf-navy-mid border border-wf-blue-lt/30 shadow-lg group-hover:shadow-wf-blue/20 transition-all">
                <Compass className="w-4 h-4 text-wf-cream" />
              </div>
              <div className="min-w-0">
                <div className="text-sm sm:text-base font-black tracking-tight text-white flex items-center space-x-1">
                  <span>TechTrek</span>
                  <span className="gradient-amber">Wayfinder</span>
                </div>
                <div className="text-[8px] font-semibold text-wf-muted uppercase tracking-widest -mt-1 hidden sm:block">
                  Travel Operations
                </div>
              </div>
            </a>
          </div>

          {/* Desktop right-side actions */}
          <div className="hidden md:flex items-center space-x-1 lg:space-x-2 shrink-0">
            {/* TechTrekGT Launch Pad */}
            <a
              href="https://techtrekgt.com"
              className="flex items-center space-x-1.5 px-2 lg:px-3 py-2 rounded-xl bg-slate-900/80 hover:bg-slate-800 border border-slate-700/60 hover:border-wf-blue/50 text-slate-200 hover:text-white text-xs lg:text-sm font-semibold transition-all shadow-sm group min-h-[40px]"
              title="Return to TechTrekGT Main Launch Pad"
            >
              <Globe className="w-3.5 h-3.5 lg:w-4 lg:h-4 text-wf-blue-lt group-hover:scale-110 transition-transform" />
              <span className="hidden lg:inline">Launch Pad</span>
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

            {/* Schedule link */}
            <a
              href="/wayfinder/poland-christmas-2026?scroll=journey-sequence"
              onClick={(e) => {
                e.preventDefault();
                const isMain = currentPath === '/wayfinder' || currentPath === '/wayfinder/' || currentPath.startsWith('/wayfinder/poland-christmas-2026');
                const el = document.getElementById('journey-sequence');
                if (isMain && el) {
                  const y = Math.max(0, el.getBoundingClientRect().top + window.pageYOffset - 80);
                  window.scrollTo({ top: y, behavior: 'smooth' });
                } else {
                  pushRoute(e, '/wayfinder/poland-christmas-2026?scroll=journey-sequence');
                }
              }}
              className="flex items-center space-x-1.5 px-2 lg:px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-slate-200 text-xs lg:text-sm font-bold hover:text-white hover:bg-white/10 transition-all shadow-sm min-h-[40px]"
              title="10-Day Expedition Schedule"
            >
              <Calendar className="w-3.5 h-3.5 lg:w-4 lg:h-4 text-amber-400" />
              <span className="hidden lg:inline">Schedule</span>
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
                <span className="text-[10px] lg:text-xs bg-wf-amber/20 px-1.5 py-0.5 rounded-md font-semibold text-wf-cream">
                  {symbol} {rate.toFixed(2)}
                </span>
              </button>
            )}

            {isAuthenticated ? (
              <div className="flex items-center space-x-1 lg:space-x-2">
                <a
                  href="/wayfinder/poland-christmas-2026/private"
                  onClick={(e) => pushRoute(e, '/wayfinder/poland-christmas-2026/private')}
                  className="flex items-center space-x-1.5 px-2 lg:px-2.5 py-2 rounded-lg bg-wf-navy border border-wf-blue/30 text-wf-blue-lt text-xs lg:text-sm font-medium hover:bg-wf-navy-lt transition-colors min-h-[40px]"
                  title="Private Hub"
                >
                  <ShieldCheck className="w-3.5 h-3.5 lg:w-4 lg:h-4" />
                  <span className="hidden lg:inline">Private Hub</span>
                </a>
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

          {/* Mobile top bar: Currency button + settings shortcut */}
          <div className="md:hidden flex items-center space-x-2">
            <button
              onClick={() => setIsConverterOpen(!isConverterOpen)}
              className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded-xl bg-wf-amber/10 border border-wf-amber/30 text-wf-amber text-xs font-bold active:scale-95"
              title="Open Currency Converter"
            >
              <Coins className="w-4 h-4 text-wf-amber" />
              <span className="text-[10px] bg-wf-amber/20 px-1.5 py-0.5 rounded-md font-semibold text-wf-cream">{symbol} {rate.toFixed(2)}</span>
            </button>
            <button
              onClick={() => setIsSettingsOpen(true)}
              className="p-2 rounded-lg text-wf-muted hover:text-white hover:bg-white/5 min-h-[44px] min-w-[44px] flex items-center justify-center"
              aria-label="Settings"
            >
              <Settings className="w-5 h-5" />
            </button>
          </div>
        </div>


      </header>

      <main className="flex-1 relative z-10 w-full max-w-full flex flex-col overflow-x-hidden pb-20 md:pb-0">
        {children}
      </main>

      {/* Mobile persistent bottom tab bar */}
      <BottomTabBar currentPath={currentPath} onOpenConverter={() => setIsConverterOpen(true)} />

      {/* Global Full-Screen Currency Converter Modal */}
      <CurrencyConverterModal
        isOpen={isConverterOpen}
        onClose={() => setIsConverterOpen(false)}
      />

      {/* Global Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />

      <footer className="border-t border-white/5 pt-8 pb-6 bg-wf-navy/80 backdrop-blur-md relative z-10 mt-auto safe-pb">
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
