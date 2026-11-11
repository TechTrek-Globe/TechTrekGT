import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useWayfinder } from '../context/WayfinderContext';
import { ShieldCheck, Shield, FileText, CalendarClock, Backpack, Calendar, Receipt, Users } from 'lucide-react';
import { ItineraryView } from './ItineraryView';
import { DocumentCenter } from './DocumentCenter';
import { PackingManager } from './packing/PackingManager';
import { ExpenseLedger } from './budget/ExpenseLedger';
import { CalendarSubscribeModal } from './calendar/CalendarSubscribeModal';
import { ShareAgendaModal } from './ShareAgendaModal';
import { getApiUrl } from '../utils/api';

const AGENDA_REF = 'poland-christmas-2026';

export function PrivateHub({ currentPath }) {
  const { user, isAuthenticated, setIsAuthModalOpen } = useAuth();
  const [isCalendarModalOpen, setIsCalendarModalOpen] = useState(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const { agendaAccess, refreshAgendaAccess } = useWayfinder();
  const agendaRole = agendaAccess.role;
  const permissions = agendaAccess.permissions;

  // Re-resolve the caller's role on mount only if not yet loaded
  useEffect(() => {
    if (isAuthenticated && !agendaAccess.loaded) refreshAgendaAccess();
  }, [isAuthenticated, agendaAccess.loaded, refreshAgendaAccess]);

  const isCollaborator = agendaRole === 'viewer' || agendaRole === 'editor';
  const canShare = agendaRole === 'owner' || agendaRole === 'admin';
  
  const pushRoute = (e, path) => {
    e.preventDefault();
    window.history.pushState({}, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  const pathClean = (currentPath || '').split('?')[0];
  const privateIdx = pathClean.toLowerCase().indexOf('/private');
  const subRaw = privateIdx !== -1 ? pathClean.slice(privateIdx + '/private'.length) : '';
  const subParts = subRaw.split('/').filter(Boolean);
  const firstSeg = (subParts[0] || '').toLowerCase();

  const isPacking = firstSeg === 'packing';
  const isExpenses = firstSeg === 'expenses' || firstSeg === 'budget' || firstSeg === 'ledger';
  const isDocs = firstSeg === 'documents' || (subParts.length > 0 && !isPacking && !isExpenses);

  let routeDocId = null;
  if (firstSeg === 'documents' && subParts.length > 1) {
    try { routeDocId = decodeURIComponent(subParts.slice(1).join('/')); } catch (_) { routeDocId = subParts.slice(1).join('/'); }
  } else if (firstSeg && !['documents', 'packing', 'expenses', 'budget', 'ledger'].includes(firstSeg)) {
    try { routeDocId = decodeURIComponent(subParts.join('/')); } catch (_) { routeDocId = subParts.join('/'); }
  }
  if (!routeDocId && typeof window !== 'undefined') {
    const qDoc = new URLSearchParams(window.location.search).get('doc');
    if (qDoc) routeDocId = qDoc;
  }

  // Authenticated but not linked to this agenda (role 'none') or role could not be verified
  const isRoleLoading = isAuthenticated && !agendaAccess.loaded;
  const isLocked = isAuthenticated && agendaAccess.loaded && !permissions.itinerary;
  const forbiddenTab = isAuthenticated && permissions.itinerary && (
    (isExpenses && !permissions.expenses) ||
    (isDocs && !permissions.documents) ||
    (isPacking && !permissions.packing)
  );
  const [deniedNotice, setDeniedNotice] = useState(false);

  // Deep link to a tab the role cannot access: redirect to the itinerary
  useEffect(() => {
    if (!forbiddenTab) return undefined;
    setDeniedNotice(true);
    window.history.replaceState({}, '', '/wayfinder/poland-christmas-2026/private');
    window.dispatchEvent(new PopStateEvent('popstate'));
    return undefined;
  }, [forbiddenTab]);

  if (!isAuthenticated) {
    return (
      <div className="max-w-xl mx-auto px-4 sm:px-6 py-12 flex-1 flex flex-col items-center justify-center min-h-[60vh]">
        <div className="w-full glass-panel p-8 sm:p-10 rounded-3xl border border-white/10 text-center space-y-5 shadow-2xl">
          <div className="w-16 h-16 mx-auto rounded-full bg-wf-navy-mid border border-white/10 flex items-center justify-center text-wf-blue-lt">
            <ShieldCheck className="w-8 h-8" />
          </div>
          <h2 className="text-2xl font-bold text-white">Private Operations Hub</h2>
          <p className="text-sm text-wf-muted">
            Sign in to access your private 10-day itinerary overlay, travel documents, packing sync, and shared expense ledger.
          </p>
          <button
            type="button"
            onClick={() => setIsAuthModalOpen(true)}
            className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-wf-blue to-wf-blue-lt hover:opacity-90 text-white font-medium shadow-lg hover-lift cursor-pointer"
          >
            Sign In / Create Account
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full flex flex-col">
      {/* Sub-toolbar docked directly under the main header */}
      <div className="w-full bg-slate-900/95 backdrop-blur-xl border-b border-white/10 shadow-lg relative z-20">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-2 flex items-center justify-between gap-2.5">
          {/* Compact Private Hub Identity */}
          <div className="flex items-center gap-2 shrink-0">
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 text-xs sm:text-sm font-bold shadow-sm">
              <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
              <span className="tracking-wide">Private Hub</span>
            </div>
            <div className="hidden md:flex items-center gap-2 text-xs text-slate-400 font-medium">
              <span className="text-slate-600">•</span>
              <span>Poland Christmas 2026</span>
              {agendaRole && agendaRole !== 'owner' && (
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-sky-500/15 text-sky-300 border border-sky-500/25 capitalize font-medium">
                  {agendaRole}
                </span>
              )}
            </div>
          </div>

          {/* Subview Nav Toolbar: fits horizontally with zero scroll */}
          <div className="flex items-center gap-1 sm:gap-1.5 bg-wf-navy-mid/90 p-1 rounded-xl border border-white/10 shrink-0">
            <a
              href="/wayfinder/poland-christmas-2026/private"
              onClick={(e) => pushRoute(e, '/wayfinder/poland-christmas-2026/private')}
              className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-colors whitespace-nowrap ${!isDocs && !isPacking && !isExpenses ? 'bg-wf-blue text-white shadow-md' : 'text-wf-muted hover:text-white hover:bg-white/5'}`}
            >
              <CalendarClock className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-sky-400" />
              <span>Itinerary</span>
            </a>
            {(!isAuthenticated || permissions.packing) && (
            <a
              href="/wayfinder/poland-christmas-2026/private/packing"
              onClick={(e) => pushRoute(e, '/wayfinder/poland-christmas-2026/private/packing')}
              className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-colors whitespace-nowrap ${isPacking ? 'bg-wf-blue text-white shadow-md' : 'text-wf-muted hover:text-white hover:bg-white/5'}`}
            >
              <Backpack className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-400" />
              <span>Packing<span className="hidden lg:inline"> List</span></span>
            </a>
            )}
            {(!isAuthenticated || permissions.expenses) && (
            <a
              href="/wayfinder/poland-christmas-2026/private/expenses"
              onClick={(e) => pushRoute(e, '/wayfinder/poland-christmas-2026/private/expenses')}
              className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-colors whitespace-nowrap ${isExpenses ? 'bg-wf-blue text-white shadow-md' : 'text-wf-muted hover:text-white hover:bg-white/5'}`}
            >
              <Receipt className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-400" />
              <span>Expense<span className="hidden lg:inline"> Ledger</span></span>
            </a>
            )}
            {(!isAuthenticated || permissions.documents) && (
            <a
              href="/wayfinder/poland-christmas-2026/private/documents"
              onClick={(e) => pushRoute(e, '/wayfinder/poland-christmas-2026/private/documents')}
              className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-colors whitespace-nowrap ${isDocs ? 'bg-wf-blue text-white shadow-md' : 'text-wf-muted hover:text-white hover:bg-white/5'}`}
            >
              <FileText className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-cyan-400" />
              <span>Documents</span>
            </a>
            )}
            {isAuthenticated && permissions.itinerary && (
              <button
                onClick={() => setIsCalendarModalOpen(true)}
                className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-colors whitespace-nowrap text-amber-300 hover:text-white hover:bg-amber-500/20 border border-amber-500/30"
                title="Subscribe or Export Trip Calendar"
              >
                <Calendar className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-400" />
                <span><span className="hidden sm:inline">Sync </span>Calendar</span>
              </button>
            )}
            {canShare && (
              <button
                onClick={() => setIsShareModalOpen(true)}
                className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-colors whitespace-nowrap text-sky-300 hover:text-white hover:bg-sky-500/20 border border-sky-500/30"
                title="Invite collaborators to this agenda"
              >
                <Users className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-sky-400" />
                <span>Share</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 w-full">
        {/* Render Subview */}
        {deniedNotice && !isLocked && (
          <div className="mb-4 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs sm:text-sm">
            That section is not available for your role on this agenda.
          </div>
        )}
        {isRoleLoading ? (
          <div className="flex items-center justify-center py-16 text-wf-muted text-sm">Verifying agenda access...</div>
        ) : isLocked ? (
          <NoAccessPanel role={agendaRole} onRetry={refreshAgendaAccess} pushRoute={pushRoute} />
        ) : forbiddenTab ? null : isPacking ? (
          <PackingManager />
        ) : isExpenses ? (
          <ExpenseLedger />
        ) : isDocs ? (
          <DocumentCenter initialDocId={routeDocId} agendaRole={agendaRole} />
        ) : (
          <ItineraryView />
        )}
      </div>

      {canShare && (
        <ShareAgendaModal
          isOpen={isShareModalOpen}
          onClose={() => setIsShareModalOpen(false)}
          agendaId={AGENDA_REF}
          agendaTitle="Poland Christmas 2026"
        />
      )}

      {/* Calendar Subscription & Export Modal */}
      <CalendarSubscribeModal
        isOpen={isCalendarModalOpen}
        onClose={() => setIsCalendarModalOpen(false)}
      />
    </div>
  );
}

function NoAccessPanel({ role, onRetry, pushRoute }) {
  const unverified = role === null;
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 sm:p-12 text-center rounded-2xl glass-panel border border-white/10 animate-fade-in my-8">
      <div className="w-16 h-16 rounded-full bg-wf-navy-mid border border-white/10 flex items-center justify-center mb-6 text-amber-400">
        <Shield className="w-8 h-8" />
      </div>
      <h2 className="text-2xl font-bold text-white mb-2">
        {unverified ? 'Unable to Verify Access' : 'No Shared Agendas Linked'}
      </h2>
      <p className="text-wf-muted mb-6 max-w-md">
        {unverified
          ? 'We could not confirm your access to this private agenda. Check your connection and try again.'
          : 'Your account is not linked to the Poland Christmas 2026 private agenda. Ask the trip organizer for an invite, then open the invite link from your email to join.'}
      </p>
      <div className="flex flex-col sm:flex-row gap-3">
        <a
          href="/wayfinder/poland-christmas-2026"
          onClick={(e) => pushRoute(e, '/wayfinder/poland-christmas-2026')}
          className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-wf-blue to-wf-blue-lt hover:opacity-90 text-white font-medium shadow-lg hover-lift"
        >
          Explore the Public Guide
        </a>
        <button
          onClick={onRetry}
          className="px-6 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/15 text-slate-200 font-medium"
        >
          {unverified ? 'Retry' : 'I Just Claimed an Invite'}
        </button>
      </div>
    </div>
  );
}
