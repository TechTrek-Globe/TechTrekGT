import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { ShieldCheck, Shield, FileText, CalendarClock, Backpack, Calendar, Receipt } from 'lucide-react';
import { ItineraryView } from './ItineraryView';
import { DocumentCenter } from './DocumentCenter';
import { PackingManager } from './packing/PackingManager';
import { ExpenseLedger } from './budget/ExpenseLedger';
import { CalendarSubscribeModal } from './calendar/CalendarSubscribeModal';

export function PrivateHub({ currentPath }) {
  const { user, isAuthenticated, setIsAuthModalOpen } = useAuth();
  const [isCalendarModalOpen, setIsCalendarModalOpen] = useState(false);
  
  const pushRoute = (e, path) => {
    e.preventDefault();
    window.history.pushState({}, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  const isDocs = currentPath.includes('/documents');
  const isPacking = currentPath.includes('/packing');
  const isExpenses = currentPath.includes('/expenses') || currentPath.includes('/budget');

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
      {/* Private Hub Header & Nav */}
      <div className="mb-8 border-b border-white/10 pb-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-white flex items-center space-x-3">
              <ShieldCheck className="w-8 h-8 text-emerald-400" />
              <span>Private Operations Hub</span>
            </h1>
            <p className="text-wf-muted mt-2">Poland Christmas 2026</p>
          </div>
          
          <div className="flex items-center space-x-2 bg-wf-navy-mid p-1 rounded-xl border border-white/5 overflow-x-auto">
            <a
              href="/wayfinder/poland-christmas-2026/private"
              onClick={(e) => pushRoute(e, '/wayfinder/poland-christmas-2026/private')}
              className={`flex items-center space-x-2 px-3.5 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${!isDocs && !isPacking && !isExpenses ? 'bg-wf-blue text-white shadow-md' : 'text-wf-muted hover:text-white hover:bg-white/5'}`}
            >
              <CalendarClock className="w-4 h-4" />
              <span>Itinerary</span>
            </a>
            <a
              href="/wayfinder/poland-christmas-2026/private/packing"
              onClick={(e) => pushRoute(e, '/wayfinder/poland-christmas-2026/private/packing')}
              className={`flex items-center space-x-2 px-3.5 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${isPacking ? 'bg-wf-blue text-white shadow-md' : 'text-wf-muted hover:text-white hover:bg-white/5'}`}
            >
              <Backpack className="w-4 h-4" />
              <span>Packing List</span>
            </a>
            <a
              href="/wayfinder/poland-christmas-2026/private/expenses"
              onClick={(e) => pushRoute(e, '/wayfinder/poland-christmas-2026/private/expenses')}
              className={`flex items-center space-x-2 px-3.5 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${isExpenses ? 'bg-wf-blue text-white shadow-md' : 'text-wf-muted hover:text-white hover:bg-white/5'}`}
            >
              <Receipt className="w-4 h-4 text-amber-400" />
              <span>Expense Ledger</span>
            </a>
            <a
              href="/wayfinder/poland-christmas-2026/private/documents"
              onClick={(e) => pushRoute(e, '/wayfinder/poland-christmas-2026/private/documents')}
              className={`flex items-center space-x-2 px-3.5 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${isDocs ? 'bg-wf-blue text-white shadow-md' : 'text-wf-muted hover:text-white hover:bg-white/5'}`}
            >
              <FileText className="w-4 h-4" />
              <span>Documents</span>
            </a>
            <button
              onClick={() => setIsCalendarModalOpen(true)}
              className="flex items-center space-x-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap text-amber-300 hover:text-white hover:bg-amber-500/20 border border-amber-500/30"
              title="Subscribe or Export Trip Calendar"
            >
              <Calendar className="w-4 h-4 text-amber-400" />
              <span>Sync Calendar</span>
            </button>
            {(user?.isAdmin || user?.role === 'admin') && (
              <a
                href="/wayfinder/admin"
                onClick={(e) => pushRoute(e, '/wayfinder/admin')}
                className="flex items-center space-x-2 px-3 py-2 rounded-lg text-sm font-semibold transition-colors whitespace-nowrap text-amber-300 hover:text-white hover:bg-amber-500/20 border border-amber-500/30 shadow-sm"
                title="System Administration & Key Entitlements"
              >
                <Shield className="w-4 h-4 text-amber-400" />
                <span>Admin</span>
              </a>
            )}
          </div>
        </div>
      </div>

      {/* Render Subview */}
      {isPacking ? (
        <PackingManager />
      ) : isExpenses ? (
        <ExpenseLedger />
      ) : isDocs ? (
        !isAuthenticated ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 sm:p-12 text-center rounded-2xl glass-panel border border-white/10 animate-fade-in my-8">
            <div className="w-16 h-16 rounded-full bg-wf-navy-mid border border-white/10 flex items-center justify-center mb-6 text-wf-blue-lt">
              <ShieldCheck className="w-8 h-8" />
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">Private Documents & Vault</h2>
            <p className="text-wf-muted mb-6 max-w-md">
              Sign in to access securely imported travel documents, OCR extraction tools, and private booking records.
            </p>
            <button
              onClick={() => setIsAuthModalOpen(true)}
              className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-wf-blue to-wf-blue-lt hover:opacity-90 text-white font-medium shadow-lg hover-lift"
            >
              Sign In / Create Account
            </button>
          </div>
        ) : (
          <DocumentCenter />
        )
      ) : (
        <>
          {!isAuthenticated && (
            <div className="mb-6 p-4 rounded-2xl bg-wf-blue/10 border border-wf-blue/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-fade-in">
              <div className="flex items-center space-x-3">
                <ShieldCheck className="w-5 h-5 text-sky-400 shrink-0" />
                <p className="text-xs sm:text-sm text-slate-200">
                  Viewing public schedule. <span className="text-slate-400">Sign in to overlay private tickets, reservations, and travel documents.</span>
                </p>
              </div>
              <button
                onClick={() => setIsAuthModalOpen(true)}
                className="px-3.5 py-1.5 rounded-xl bg-sky-500/20 hover:bg-sky-500/30 border border-sky-400/40 text-sky-300 hover:text-white text-xs font-semibold shrink-0 transition-colors"
              >
                Sign In
              </button>
            </div>
          )}
          <ItineraryView />
        </>
      )}

      {/* Calendar Subscription & Export Modal */}
      <CalendarSubscribeModal
        isOpen={isCalendarModalOpen}
        onClose={() => setIsCalendarModalOpen(false)}
      />
    </div>
  );
}
