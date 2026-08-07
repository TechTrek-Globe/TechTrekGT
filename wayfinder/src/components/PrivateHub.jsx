import React from 'react';
import { useAuth } from '../context/AuthContext';
import { ShieldCheck, FileText, CalendarClock } from 'lucide-react';
import { ItineraryView } from './ItineraryView';
import { DocumentCenter } from './DocumentCenter';

export function PrivateHub({ currentPath }) {
  const { isAuthenticated, setIsAuthModalOpen } = useAuth();
  
  const pushRoute = (e, path) => {
    e.preventDefault();
    window.history.pushState({}, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  if (!isAuthenticated) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center animate-fade-in">
        <div className="w-16 h-16 rounded-full bg-wf-navy-mid border border-white/10 flex items-center justify-center mb-6 text-wf-blue-lt">
          <ShieldCheck className="w-8 h-8" />
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">Private Operations Hub</h2>
        <p className="text-wf-muted mb-6 max-w-md">
          Sign in to access exact dates, live reservations, and securely imported travel documents.
        </p>
        <button
          onClick={() => setIsAuthModalOpen(true)}
          className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-wf-blue to-wf-blue-lt hover:opacity-90 text-white font-medium shadow-lg hover-lift"
        >
          Sign In / Create Account
        </button>
      </div>
    );
  }

  const isDocs = currentPath.includes('/documents');

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
          
          <div className="flex items-center space-x-2 bg-wf-navy-mid p-1 rounded-xl border border-white/5">
            <a
              href="/wayfinder/poland-christmas-2026/private"
              onClick={(e) => pushRoute(e, '/wayfinder/poland-christmas-2026/private')}
              className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${!isDocs ? 'bg-wf-blue text-white shadow-md' : 'text-wf-muted hover:text-white hover:bg-white/5'}`}
            >
              <CalendarClock className="w-4 h-4" />
              <span>Itinerary</span>
            </a>
            <a
              href="/wayfinder/poland-christmas-2026/private/documents"
              onClick={(e) => pushRoute(e, '/wayfinder/poland-christmas-2026/private/documents')}
              className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${isDocs ? 'bg-wf-blue text-white shadow-md' : 'text-wf-muted hover:text-white hover:bg-white/5'}`}
            >
              <FileText className="w-4 h-4" />
              <span>Documents</span>
            </a>
          </div>
        </div>
      </div>

      {/* Render Subview */}
      {isDocs ? <DocumentCenter /> : <ItineraryView />}
    </div>
  );
}
