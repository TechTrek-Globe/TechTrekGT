import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Compass, Map, User, LogOut, ShieldCheck, ChevronRight, Menu, X, Coins, ArrowLeftRight } from 'lucide-react';
import { CurrencyConverterModal } from './CurrencyConverterModal';
import { useExchangeRate } from '../hooks/useExchangeRate';
import wayfinderHeaderBanner from '../assets/wayfinder-header-banner.png';

export function Layout({ children }) {
  const { user, isAuthenticated, setIsAuthModalOpen, logout } = useAuth();
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
  const isMainLanding = pathOnly === '/' || pathOnly === '' || pathOnly === '/wayfinder' || pathOnly === '/wayfinder/' || pathOnly === '/index.html';
  const showCurrencyConverter = !isMainLanding;

  const navLinks = [
    { label: 'Destinations', href: '/wayfinder' },
    { label: 'Poland 2026', href: '/wayfinder/poland-christmas-2026' },
  ];

  const pushRoute = (e, path) => {
    e.preventDefault();
    window.history.pushState({}, '', path);
    setCurrentPath(path);
    window.dispatchEvent(new PopStateEvent('popstate'));
    setMobileMenuOpen(false);
  };

  return (
    <div className="min-h-screen flex flex-col font-sans bg-slate-950">
      {/* --- Full-Width Top Header Banner (Like Outpost) --- */}
      <header style={{ width: '100%', flexShrink: 0, overflow: 'hidden', height: '182px', display: 'flex', justifyContent: 'center', alignItems: 'center', borderBottom: '1px solid rgba(180,130,20,0.3)', backgroundColor: '#000', position: 'relative', zIndex: 60 }}>
        <img
          src={wayfinderHeaderBanner}
          alt="TechTrek Wayfinder - Plan • Explore • Navigate • Discover"
          style={{ height: '100%', width: '100%', objectFit: 'contain', objectPosition: 'center', display: 'block' }}
        />
      </header>

      {/* Background glow effects */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute top-0 right-0 w-[800px] h-[600px] bg-wf-blue/10 rounded-full blur-[120px] mix-blend-screen transform translate-x-1/3 -translate-y-1/3" />
        <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-wf-evergreen/10 rounded-full blur-[100px] mix-blend-screen transform -translate-x-1/3 translate-y-1/3" />
      </div>

      <header className="sticky top-0 z-50 glass-panel border-b border-white/5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-8">
            <a href="/wayfinder" onClick={(e) => pushRoute(e, '/wayfinder')} className="flex items-center space-x-2.5 group">
              <div className="p-2 rounded-xl bg-gradient-to-br from-wf-blue to-wf-navy-mid border border-wf-blue-lt/30 shadow-lg group-hover:shadow-wf-blue/20 transition-all">
                <Compass className="w-5 h-5 text-wf-cream" />
              </div>
              <div>
                <div className="text-lg font-black tracking-tight text-white flex items-center space-x-1">
                  <span>TechTrek</span>
                  <span className="gradient-amber">Wayfinder</span>
                </div>
                <div className="text-[9px] font-semibold text-wf-muted uppercase tracking-widest -mt-1">
                  Travel Operations
                </div>
              </div>
            </a>

            <nav className="hidden md:flex items-center space-x-1 border-l border-white/10 pl-8">
              {navLinks.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  onClick={(e) => pushRoute(e, link.href)}
                  className="px-3 py-1.5 rounded-lg text-sm font-medium text-wf-text hover:text-white hover:bg-white/5 transition-colors"
                >
                  {link.label}
                </a>
              ))}
            </nav>
          </div>

          <div className="hidden md:flex items-center space-x-4">
            {/* Quick Currency Converter Trigger (Desktop) - Only show when trip is selected */}
            {showCurrencyConverter && (
              <button
                onClick={() => setIsConverterOpen(!isConverterOpen)}
                className="flex items-center space-x-2 px-3 py-1.5 rounded-xl bg-wf-amber/10 border border-wf-amber/30 text-wf-amber text-sm font-bold hover:bg-wf-amber/20 transition-all shadow-sm active:scale-95 group"
                title="Open Currency Converter"
              >
                <Coins className="w-4 h-4 text-wf-amber group-hover:rotate-12 transition-transform" />
                <span>Currency Converter</span>
                <span className="text-xs bg-wf-amber/20 px-1.5 py-0.5 rounded-md font-semibold text-wf-cream">
                  {symbol} {rate.toFixed(2)}
                </span>
              </button>
            )}

            {isAuthenticated ? (
              <div className="flex items-center space-x-3">
                <a
                  href="/wayfinder/poland-christmas-2026/private"
                  onClick={(e) => pushRoute(e, '/wayfinder/poland-christmas-2026/private')}
                  className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-wf-navy border border-wf-blue/30 text-wf-blue-lt text-sm font-medium hover:bg-wf-navy-lt transition-colors"
                >
                  <ShieldCheck className="w-4 h-4" />
                  <span>Private Hub</span>
                </a>
                <div className="h-6 w-px bg-white/10 mx-1" />
                <button
                  onClick={logout}
                  className="flex items-center space-x-1.5 px-3 py-1.5 text-sm font-medium text-wf-muted hover:text-white transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Sign Out</span>
                </button>
              </div>
            ) : (
              <button
                onClick={() => setIsAuthModalOpen(true)}
                className="flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white text-sm font-medium transition-colors"
              >
                <User className="w-4 h-4 text-wf-blue-lt" />
                <span>Sign In</span>
              </button>
            )}
          </div>

          {/* Mobile top bar items: Currency button + Mobile menu button */}
          <div className="md:hidden flex items-center space-x-2">
            {showCurrencyConverter && (
              <button
                onClick={() => setIsConverterOpen(!isConverterOpen)}
                className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded-xl bg-wf-amber/10 border border-wf-amber/30 text-wf-amber text-xs font-bold active:scale-95"
                title="Open Currency Converter"
              >
                <Coins className="w-4 h-4 text-wf-amber" />
                <span>Currency Converter</span>
              </button>
            )}

            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 rounded-lg text-wf-muted hover:text-white hover:bg-white/5"
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        {mobileMenuOpen && (
          <div className="md:hidden glass-panel border-t border-white/5 py-2 px-4 space-y-1">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={(e) => pushRoute(e, link.href)}
                className="block px-3 py-2 rounded-lg text-base font-medium text-wf-text hover:text-white hover:bg-white/5"
              >
                {link.label}
              </a>
            ))}

            {showCurrencyConverter && (
              <button
                onClick={() => { setIsConverterOpen(true); setMobileMenuOpen(false); }}
                className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-base font-medium text-wf-amber hover:bg-white/5 text-left"
              >
                <span className="flex items-center space-x-2">
                  <Coins className="w-5 h-5" />
                  <span>Currency Converter</span>
                </span>
                <span className="text-xs bg-wf-amber/20 px-2 py-0.5 rounded-full font-bold">
                  {symbol} {rate.toFixed(2)}
                </span>
              </button>
            )}

            <div className="h-px bg-white/10 my-2" />
            {isAuthenticated ? (
              <>
                <a
                  href="/wayfinder/poland-christmas-2026/private"
                  onClick={(e) => pushRoute(e, '/wayfinder/poland-christmas-2026/private')}
                  className="flex items-center space-x-2 px-3 py-2 rounded-lg text-base font-medium text-wf-blue-lt hover:bg-white/5"
                >
                  <ShieldCheck className="w-5 h-5" />
                  <span>Private Hub</span>
                </a>
                <button
                  onClick={logout}
                  className="w-full flex items-center space-x-2 px-3 py-2 rounded-lg text-base font-medium text-wf-muted hover:text-white hover:bg-white/5 text-left"
                >
                  <LogOut className="w-5 h-5" />
                  <span>Sign Out</span>
                </button>
              </>
            ) : (
              <button
                onClick={() => { setIsAuthModalOpen(true); setMobileMenuOpen(false); }}
                className="w-full flex items-center space-x-2 px-3 py-2 rounded-lg text-base font-medium text-white hover:bg-white/5 text-left"
              >
                <User className="w-5 h-5 text-wf-blue-lt" />
                <span>Sign In</span>
              </button>
            )}
          </div>
        )}
      </header>

      <main className="flex-1 relative z-10 w-full flex flex-col">
        {children}
      </main>

      {/* Global Full-Screen Currency Converter Modal */}
      <CurrencyConverterModal
        isOpen={isConverterOpen}
        onClose={() => setIsConverterOpen(false)}
      />

      <footer className="border-t border-white/5 py-8 bg-wf-navy/80 backdrop-blur-md relative z-10 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center space-x-2">
            <Compass className="w-5 h-5 text-wf-blue-lt" />
            <span className="text-sm font-semibold text-white tracking-wide">TechTrek Wayfinder</span>
          </div>
          <div className="text-xs text-wf-muted">
            &copy; {new Date().getFullYear()} TechTrekGT. Smart routes. Memorable places.
          </div>
        </div>
      </footer>
    </div>
  );
}
