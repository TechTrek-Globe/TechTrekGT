import React, { useEffect, useRef } from 'react';
import { ShieldCheck, Lock, Loader2, ArrowLeft, LogIn } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export function ProtectedRoute({
  children,
  requireAdmin = false,
  title = 'Sign In Required',
  description = 'This section contains private travel documents, confirmed bookings, and expedition tools. Sign in to continue.'
}) {
  const { user, isAuthenticated, isLoading, setIsAuthModalOpen } = useAuth();
  const hasAutoPromptedRef = useRef(false);

  useEffect(() => {
    if (isAuthenticated) {
      hasAutoPromptedRef.current = false;
      return;
    }
    if (!isLoading && !isAuthenticated && !hasAutoPromptedRef.current) {
      hasAutoPromptedRef.current = true;
      setIsAuthModalOpen(true);
    }
  }, [isLoading, isAuthenticated, setIsAuthModalOpen]);

  const navigatePublic = (e, path = '/wayfinder/poland-christmas-2026') => {
    if (e) e.preventDefault();
    window.history.pushState({}, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 min-h-[55vh] text-center">
        <Loader2 className="w-8 h-8 text-sky-400 animate-spin mb-3" />
        <p className="text-sm text-wf-muted font-medium">Verifying session...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="max-w-xl mx-auto px-4 sm:px-6 py-12 flex-1 flex flex-col items-center justify-center min-h-[60vh]">
        <div className="w-full glass-panel p-8 sm:p-10 rounded-3xl border border-white/10 text-center shadow-2xl space-y-6 animate-fade-in">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-sky-500/15 border border-sky-400/30 flex items-center justify-center text-sky-400 shadow-lg">
            <ShieldCheck className="w-8 h-8" />
          </div>

          <div className="space-y-2">
            <span className="inline-block px-3 py-0.5 rounded-full bg-sky-500/10 border border-sky-400/25 text-sky-300 text-[11px] font-bold uppercase tracking-wider">
              Protected Area
            </span>
            <h2 className="text-2xl font-bold text-white">{title}</h2>
            <p className="text-sm text-wf-muted leading-relaxed">
              {description}
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => setIsAuthModalOpen(true)}
              className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-gradient-to-r from-wf-blue to-wf-blue-lt hover:opacity-90 text-white font-semibold text-sm flex items-center justify-center space-x-2 shadow-lg transition-all cursor-pointer"
            >
              <LogIn className="w-4 h-4" />
              <span>Sign In / Create Account</span>
            </button>

            <a
              href="/wayfinder/poland-christmas-2026"
              onClick={(e) => navigatePublic(e, '/wayfinder/poland-christmas-2026')}
              className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-200 hover:text-white font-medium text-sm flex items-center justify-center space-x-1.5 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Return to Public Guide</span>
            </a>
          </div>
        </div>
      </div>
    );
  }

  if (requireAdmin) {
    const isAdmin = Boolean(user?.isAdmin || user?.role === 'admin');
    if (!isAdmin) {
      return (
        <div className="flex flex-col items-center justify-center p-8 sm:p-12 text-center min-h-[60vh] max-w-lg mx-auto">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400 mb-4 shadow-lg shadow-rose-950/30">
            <Lock className="w-8 h-8" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Access Denied</h2>
          <p className="text-slate-400 text-sm mb-6">
            Administrator privileges are required to view the Wayfinder Admin Panel and manage API key entitlements.
          </p>
          <button
            type="button"
            onClick={(e) => navigatePublic(e, '/wayfinder/poland-christmas-2026')}
            className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white font-medium text-sm transition-all border border-slate-700/60 cursor-pointer"
          >
            Return to Poland Guide
          </button>
        </div>
      );
    }
  }

  return children;
}

export default ProtectedRoute;

