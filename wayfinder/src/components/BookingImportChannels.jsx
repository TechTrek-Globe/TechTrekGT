import React, { useState, useEffect, useCallback } from 'react';
import { getApiUrl } from '../utils/api';
import { useWayfinder } from '../context/WayfinderContext';
import {
  Mail, Inbox, Copy, Check, RefreshCw,
  ShieldCheck, AlertCircle, Loader2, CheckCircle2, Sparkles
} from 'lucide-react';

export function BookingImportChannels() {
  const { fetchItinerary, fetchDocuments } = useWayfinder();

  // Email Inbox state
  const [inbox, setInbox] = useState(null);
  const [isLoadingInbox, setIsLoadingInbox] = useState(false);
  const [isProvisioning, setIsProvisioning] = useState(false);
  const [copied, setCopied] = useState(false);
  const [inboxError, setInboxError] = useState(null);

  // Load Email Inbox
  const loadInbox = useCallback(async () => {
    setIsLoadingInbox(true);
    setInboxError(null);
    try {
      const res = await fetch(getApiUrl('/api/wayfinder/email-inboxes?journey_id=poland-christmas-2026'), {
        credentials: 'include'
      });
      if (res.ok) {
        const data = await res.json();
        setInbox(data.inbox || null);
      } else {
        const err = await res.json();
        setInboxError(err.error || 'Failed to check email inbox');
      }
    } catch (err) {
      setInboxError(err.message);
    } finally {
      setIsLoadingInbox(false);
    }
  }, []);

  // Provision Email Inbox
  const provisionInbox = async () => {
    setIsProvisioning(true);
    setInboxError(null);
    try {
      const res = await fetch(getApiUrl('/api/wayfinder/email-inboxes'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ journey_id: 'poland-christmas-2026' })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to provision dedicated inbox');
      setInbox(data.inbox);
    } catch (err) {
      setInboxError(err.message);
    } finally {
      setIsProvisioning(false);
    }
  };

  useEffect(() => {
    loadInbox();
  }, [loadInbox]);

  const handleCopy = () => {
    if (!inbox?.email_address) return;
    navigator.clipboard.writeText(inbox.email_address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRefresh = () => {
    loadInbox();
    if (fetchItinerary) fetchItinerary('poland-christmas-2026');
    if (fetchDocuments) fetchDocuments('poland-christmas-2026');
  };

  return (
    <div className="glass-panel p-6 sm:p-8 rounded-3xl border border-white/10 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/10 pb-4">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center space-x-2">
            <Mail className="w-5 h-5 text-sky-400" />
            <span>Automated Booking Confirmation Ingestion</span>
          </h2>
          <p className="text-xs text-wf-muted mt-0.5">
            Forward your travel reservations to your private inbox to automatically parse check-ins, trains, and flights into your itinerary.
          </p>
        </div>

        <button
          onClick={handleRefresh}
          className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white text-xs font-medium flex items-center space-x-1.5 transition-colors self-start sm:self-auto shrink-0"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Refresh</span>
        </button>
      </div>

      <div className="max-w-3xl mx-auto">
        {/* Dedicated Forwarding Address Card */}
        <div className="bg-wf-navy/60 border border-white/10 rounded-2xl p-6 flex flex-col justify-between space-y-5 shadow-lg">
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-sky-500/20 border border-sky-500/30 text-sky-300 flex items-center justify-center">
                  <Inbox className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-white">Trip Forwarding Inbox</h3>
                  <span className="text-[11px] text-sky-400 font-medium">Cloudflare Email Routing (Native Worker)</span>
                </div>
              </div>
              {inbox && (
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center space-x-1">
                  <CheckCircle2 className="w-3 h-3" />
                  <span>Active</span>
                </span>
              )}
            </div>

            <p className="text-xs sm:text-sm text-wf-muted leading-relaxed mb-4">
              Forward booking confirmation emails directly to your unique trip inbox. Incoming emails are automatically parsed by the Cloudflare edge worker and attached directly to your Poland 2026 schedule.
            </p>

            {inboxError && (
              <div className="mb-4 p-3 rounded-xl bg-rose-950/60 border border-rose-800/80 text-rose-300 text-xs flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                <span>{inboxError}</span>
              </div>
            )}

            {inbox ? (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300 flex items-center space-x-1.5">
                    <Sparkles className="w-3 h-3 text-sky-400" />
                    <span>Your Dedicated Ingestion Address</span>
                  </label>
                  <div className="flex items-center space-x-2 bg-wf-navy-mid/90 border border-white/10 rounded-xl p-2.5">
                    <input
                      type="text"
                      readOnly
                      value={inbox.email_address}
                      className="w-full bg-transparent text-white font-mono text-xs sm:text-sm px-2 focus:outline-none select-all"
                    />
                    <button
                      onClick={handleCopy}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition-all shrink-0 cursor-pointer ${
                        copied
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                          : 'bg-white/10 hover:bg-white/20 text-white border border-white/10'
                      }`}
                    >
                      {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copied ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs text-wf-muted pt-1">
                  <div className="bg-white/5 rounded-xl p-3 border border-white/5">
                    <span className="text-slate-400 block text-[10px] uppercase tracking-wider mb-0.5">Processed</span>
                    <span className="text-white font-bold text-base">{inbox.emails_received || 0}</span> confirmed bookings
                  </div>
                  <div className="bg-white/5 rounded-xl p-3 border border-white/5">
                    <span className="text-slate-400 block text-[10px] uppercase tracking-wider mb-0.5">Last Activity</span>
                    <span className="text-white font-bold text-xs truncate block mt-1">
                      {inbox.last_received_at ? new Date(inbox.last_received_at).toLocaleDateString() : 'None yet'}
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-4">
                <button
                  onClick={provisionInbox}
                  disabled={isProvisioning || isLoadingInbox}
                  className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-sky-500 to-sky-600 hover:from-sky-400 hover:to-sky-500 text-white text-xs sm:text-sm font-semibold flex items-center justify-center space-x-2 shadow-lg transition-all disabled:opacity-50 cursor-pointer"
                >
                  {isProvisioning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                  <span>{isProvisioning ? 'Generating Dedicated Address...' : 'Generate Dedicated Trip Inbox'}</span>
                </button>
              </div>
            )}
          </div>

          <div className="pt-3 border-t border-white/5 flex items-center justify-between text-[11px] text-slate-400">
            <span className="flex items-center space-x-1">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>Token-Scoped Access Security</span>
            </span>
            <span>Supports Booking.com, PKP Intercity, Accor, Delta</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default BookingImportChannels;
