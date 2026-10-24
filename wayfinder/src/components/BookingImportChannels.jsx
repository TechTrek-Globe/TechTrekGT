import React, { useState, useEffect, useCallback } from 'react';
import { getApiUrl } from '../utils/api';
import { useWayfinder } from '../context/WayfinderContext';
import {
  Mail, Inbox, Copy, Check, RefreshCw, ExternalLink,
  ShieldCheck, AlertCircle, Loader2, Calendar, Sparkles, LogOut, CheckCircle2
} from 'lucide-react';

export function BookingImportChannels() {
  const { fetchItinerary, fetchDocuments } = useWayfinder();

  // Email Inbox state
  const [inbox, setInbox] = useState(null);
  const [isLoadingInbox, setIsLoadingInbox] = useState(false);
  const [isProvisioning, setIsProvisioning] = useState(false);
  const [copied, setCopied] = useState(false);
  const [inboxError, setInboxError] = useState(null);

  // Gmail OAuth state
  const [gmailStatus, setGmailStatus] = useState(null);
  const [isLoadingGmail, setIsLoadingGmail] = useState(false);
  const [isSyncingGmail, setIsSyncingGmail] = useState(false);
  const [isDisconnectingGmail, setIsDisconnectingGmail] = useState(false);
  const [gmailMessage, setGmailMessage] = useState(null);
  const [gmailError, setGmailError] = useState(null);

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

  // Load Gmail Connection Status
  const loadGmailStatus = useCallback(async () => {
    setIsLoadingGmail(true);
    setGmailError(null);
    try {
      const res = await fetch(getApiUrl('/api/wayfinder/gmail?journey_id=poland-christmas-2026'), {
        credentials: 'include'
      });
      if (res.ok) {
        const data = await res.json();
        setGmailStatus(data);
      } else {
        const err = await res.json();
        setGmailError(err.error || 'Failed to check Gmail status');
      }
    } catch (err) {
      setGmailError(err.message);
    } finally {
      setIsLoadingGmail(false);
    }
  }, []);

  // Initiate Gmail OAuth
  const connectGmail = async () => {
    setGmailError(null);
    try {
      const res = await fetch(getApiUrl('/api/wayfinder/gmail/connect'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ journey_id: 'poland-christmas-2026' })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to initiate Gmail OAuth');
      if (data.auth_url) {
        window.location.href = data.auth_url;
      }
    } catch (err) {
      setGmailError(err.message);
    }
  };

  // Sync Gmail Messages
  const syncGmail = async () => {
    setIsSyncingGmail(true);
    setGmailError(null);
    setGmailMessage(null);
    try {
      const res = await fetch(getApiUrl('/api/wayfinder/gmail/sync'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ journey_id: 'poland-christmas-2026' })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to sync Gmail bookings');
      setGmailMessage(`Sync complete: ${data.imported_count || 0} confirmations parsed and saved.`);
      await loadGmailStatus();
      await fetchItinerary('poland-christmas-2026');
      await fetchDocuments('poland-christmas-2026');
    } catch (err) {
      setGmailError(err.message);
    } finally {
      setIsSyncingGmail(false);
    }
  };

  // Disconnect Gmail
  const disconnectGmail = async () => {
    if (!window.confirm('Disconnect Gmail account from Poland 2026 journey?')) return;
    setIsDisconnectingGmail(true);
    setGmailError(null);
    try {
      const res = await fetch(getApiUrl('/api/wayfinder/gmail/poland-christmas-2026'), {
        method: 'DELETE',
        credentials: 'include'
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to disconnect Gmail');
      }
      setGmailMessage('Gmail account disconnected.');
      await loadGmailStatus();
    } catch (err) {
      setGmailError(err.message);
    } finally {
      setIsDisconnectingGmail(false);
    }
  };

  const handleCopy = () => {
    if (!inbox?.email_address) return;
    navigator.clipboard.writeText(inbox.email_address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  useEffect(() => {
    loadInbox();
    loadGmailStatus();
  }, [loadInbox, loadGmailStatus]);

  return (
    <div className="glass-panel p-6 sm:p-8 rounded-3xl border border-white/10 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/10">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center space-x-2">
            <Sparkles className="w-5 h-5 text-amber-400" />
            <span>Automated Booking Importers</span>
          </h2>
          <p className="text-xs sm:text-sm text-wf-muted mt-1">
            Import flight, hotel, and attraction bookings automatically via dedicated email forwarding or Google OAuth.
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={() => { loadInbox(); loadGmailStatus(); }}
            className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-wf-muted hover:text-white text-xs font-medium flex items-center space-x-1.5 transition-colors"
            title="Refresh status"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Channel 1: Dedicated Forwarding Address */}
        <div className="bg-wf-navy/60 border border-white/10 rounded-2xl p-5 flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center space-x-2.5">
                <div className="w-9 h-9 rounded-xl bg-sky-500/20 border border-sky-500/30 text-sky-300 flex items-center justify-center">
                  <Inbox className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-white">Trip Forwarding Inbox</h3>
                  <span className="text-[11px] text-sky-400 font-medium">Cloudflare Email Routing</span>
                </div>
              </div>
              {inbox && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center space-x-1">
                  <CheckCircle2 className="w-3 h-3" />
                  <span>Active</span>
                </span>
              )}
            </div>

            <p className="text-xs text-wf-muted leading-relaxed mb-4">
              Forward booking confirmation emails directly to your unique trip inbox. Incoming emails are automatically parsed by the Cloudflare edge worker and attached to your schedule.
            </p>

            {inboxError && (
              <div className="mb-4 p-3 rounded-xl bg-rose-950/60 border border-rose-800/80 text-rose-300 text-xs flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                <span>{inboxError}</span>
              </div>
            )}

            {inbox ? (
              <div className="space-y-3">
                <div className="flex items-center space-x-2 bg-wf-navy-mid/90 border border-white/10 rounded-xl p-2.5">
                  <input
                    type="text"
                    readOnly
                    value={inbox.email_address}
                    className="w-full bg-transparent text-white font-mono text-xs sm:text-sm px-2 focus:outline-none select-all"
                  />
                  <button
                    onClick={handleCopy}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition-all shrink-0 ${
                      copied
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                        : 'bg-white/10 hover:bg-white/20 text-white border border-white/10'
                    }`}
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copied ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2 text-[11px] text-wf-muted pt-1">
                  <div className="bg-white/5 rounded-lg p-2 border border-white/5">
                    <span className="text-slate-400 block text-[10px] uppercase tracking-wider">Processed</span>
                    <span className="text-white font-semibold text-sm">{inbox.emails_received || 0}</span> emails
                  </div>
                  <div className="bg-white/5 rounded-lg p-2 border border-white/5">
                    <span className="text-slate-400 block text-[10px] uppercase tracking-wider">Last Activity</span>
                    <span className="text-white font-semibold text-xs truncate block">
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
                  className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-sky-500 to-sky-600 hover:from-sky-400 hover:to-sky-500 text-white text-xs font-semibold flex items-center justify-center space-x-2 shadow-lg transition-all disabled:opacity-50"
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
              <span>Token-Scoped Access</span>
            </span>
            <span>Supports Booking.com, PKP, Accor</span>
          </div>
        </div>

        {/* Channel 2: Gmail API Integration */}
        <div className="bg-wf-navy/60 border border-white/10 rounded-2xl p-5 flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center space-x-2.5">
                <div className="w-9 h-9 rounded-xl bg-rose-500/20 border border-rose-500/30 text-rose-300 flex items-center justify-center">
                  <Mail className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-white">Gmail Trip Sync</h3>
                  <span className="text-[11px] text-rose-400 font-medium">Trip-Date Scoped OAuth</span>
                </div>
              </div>
              {gmailStatus?.connected && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center space-x-1">
                  <CheckCircle2 className="w-3 h-3" />
                  <span>Connected</span>
                </span>
              )}
            </div>

            <p className="text-xs text-wf-muted leading-relaxed mb-4">
              Securely connects to your Gmail with read-only access strictly bounded to your trip window (Nov 20: Dec 14, 2026). Unrelated personal messages are completely ignored.
            </p>

            {gmailError && (
              <div className="mb-4 p-3 rounded-xl bg-rose-950/60 border border-rose-800/80 text-rose-300 text-xs flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                <span>{gmailError}</span>
              </div>
            )}

            {gmailMessage && (
              <div className="mb-4 p-3 rounded-xl bg-emerald-950/60 border border-emerald-800/80 text-emerald-300 text-xs flex items-center space-x-2">
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                <span>{gmailMessage}</span>
              </div>
            )}

            {gmailStatus?.connected ? (
              <div className="space-y-3">
                <div className="bg-wf-navy-mid/90 border border-white/10 rounded-xl p-3 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-400">Account:</span>
                    <span className="text-white font-medium">{gmailStatus.connected_email || 'Connected'}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-400">Last Synced:</span>
                    <span className="text-slate-300">
                      {gmailStatus.last_synced_at ? new Date(gmailStatus.last_synced_at).toLocaleString() : 'Never'}
                    </span>
                  </div>
                </div>

                <div className="flex items-center space-x-2 pt-1">
                  <button
                    onClick={syncGmail}
                    disabled={isSyncingGmail}
                    className="flex-1 py-2 px-3 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-white text-xs font-semibold flex items-center justify-center space-x-1.5 shadow transition-all disabled:opacity-50"
                  >
                    {isSyncingGmail ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                    <span>{isSyncingGmail ? 'Syncing...' : 'Sync Trip Bookings'}</span>
                  </button>
                  <button
                    onClick={disconnectGmail}
                    disabled={isDisconnectingGmail}
                    className="py-2 px-3 rounded-xl bg-white/5 hover:bg-rose-500/20 text-wf-muted hover:text-rose-300 border border-white/10 text-xs font-medium flex items-center space-x-1 transition-colors disabled:opacity-50"
                    title="Disconnect Google account"
                  >
                    {isDisconnectingGmail ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LogOut className="w-3.5 h-3.5" />}
                    <span>Disconnect</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-center py-4">
                {gmailStatus?.configured === false ? (
                  <div className="p-4 bg-amber-500/10 border border-amber-500/25 rounded-2xl text-left space-y-3">
                    <div className="flex items-center space-x-2 text-amber-300">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span className="text-xs font-semibold">Google Cloud Credentials Required</span>
                    </div>
                    <p className="text-[11px] text-amber-200/80 leading-relaxed">
                      To enable 1-click trip booking sync directly from Gmail, create OAuth 2.0 Web Client credentials in Google Cloud Console and set them in Cloudflare secrets.
                    </p>
                    <div className="bg-black/30 border border-white/10 rounded-xl p-2.5 text-[11px] font-mono text-slate-300 space-y-1">
                      <div className="text-[10px] text-slate-400 uppercase tracking-wider font-sans">Authorized Redirect URI</div>
                      <div className="text-amber-200 select-all break-all">https://techtrekgt.com/wayfinder/gmail-callback</div>
                    </div>
                    <div className="text-[11px] text-slate-400 pt-1">
                      Run in terminal: <code className="text-white bg-white/10 px-1 py-0.5 rounded font-mono text-[10px]">wrangler secret put GOOGLE_CLIENT_ID</code>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={connectGmail}
                    disabled={isLoadingGmail}
                    className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-rose-500 to-rose-600 hover:from-rose-400 hover:to-rose-500 text-white text-xs font-semibold flex items-center justify-center space-x-2 shadow-lg transition-all disabled:opacity-50"
                  >
                    <Mail className="w-4 h-4" />
                    <span>Connect Gmail Account</span>
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="pt-3 border-t border-white/5 flex items-center justify-between text-[11px] text-slate-400">
            <span className="flex items-center space-x-1">
              <Calendar className="w-3.5 h-3.5 text-rose-400" />
              <span>Nov 20: Dec 14, 2026 Window</span>
            </span>
            <span>AES-256 Encrypted</span>
          </div>
        </div>
      </div>
    </div>
  );
}
