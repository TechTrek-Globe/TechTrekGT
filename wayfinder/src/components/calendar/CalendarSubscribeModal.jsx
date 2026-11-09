import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { getApiUrl } from '../../utils/api';
import { 
  Calendar, Download, Copy, Check, ExternalLink, RefreshCw, 
  ShieldCheck, Smartphone, Sparkles, Clock, Plane, Train, 
  Building, X, Radio, AlertCircle
} from 'lucide-react';

export function CalendarSubscribeModal({ isOpen, onClose }) {
  const { isAuthenticated, setIsAuthModalOpen } = useAuth();
  const [tokenData, setTokenData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isRotating, setIsRotating] = useState(false);
  const [copiedKey, setCopiedKey] = useState(null);
  const [error, setError] = useState(null);

  // Fetch or generate token for authenticated users
  useEffect(() => {
    if (!isOpen) return;

    if (isAuthenticated) {
      fetchToken();
    } else {
      setTokenData(null);
    }
  }, [isOpen, isAuthenticated]);

  const fetchToken = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(getApiUrl('/api/wayfinder/calendar/token?journey_id=poland-christmas-2026'), {
        credentials: 'include'
      });
      if (res.ok) {
        const data = await res.json();
        setTokenData(data);
      } else {
        setError('Failed to fetch calendar token');
      }
    } catch (err) {
      console.error('[calendar] failed to fetch token:', err);
      setError('Network error checking calendar subscription');
    } finally {
      setIsLoading(false);
    }
  };

  const generateOrRotateToken = async (rotate = false) => {
    if (rotate) setIsRotating(true);
    setError(null);
    try {
      const res = await fetch(getApiUrl('/api/wayfinder/calendar/token'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          journey_id: 'poland-christmas-2026',
          feed_name: 'Poland Christmas 2026',
          rotate
        })
      });

      if (res.ok) {
        const data = await res.json();
        setTokenData(data);
      } else {
        const errData = await res.json().catch(() => ({}));
        setError(errData.error || 'Failed to update calendar token');
      }
    } catch (err) {
      console.error('[calendar] token generation error:', err);
      setError('Network error updating calendar token');
    } finally {
      setIsRotating(false);
    }
  };

  const copyToClipboard = (text, key) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => {
      setCopiedKey(null);
    }, 2500);
  };

  const downloadDirectIcs = () => {
    const downloadUrl = getApiUrl('/api/wayfinder/calendar/export.ics?journey_id=poland-christmas-2026');
    window.location.href = downloadUrl;
  };

  if (!isOpen || !isAuthenticated) return null;

  const urls = tokenData?.urls || {};
  const feedUrl = urls.feed_url || '';
  const webcalUrl = urls.webcal_url || '';
  const googleUrl = urls.google_url || '';
  const outlookUrl = urls.outlook_url || '';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-950/80 backdrop-blur-md animate-fade-in">
      <div 
        className="relative w-full max-w-2xl bg-gradient-to-b from-slate-900 to-wf-navy border border-white/15 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-scale-in"
        role="dialog"
        aria-modal="true"
        aria-labelledby="calendar-modal-title"
      >
        {/* Header Bar */}
        <div className="p-5 sm:p-6 border-b border-white/10 flex items-start justify-between bg-wf-navy-mid/60">
          <div className="flex items-center space-x-3.5">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-amber-400/25 to-amber-600/20 border border-amber-400/40 flex items-center justify-center text-amber-300 shadow-inner">
              <Calendar className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 id="calendar-modal-title" className="text-xl sm:text-2xl font-black text-white tracking-tight">
                  Subscribe & Export Calendar
                </h2>
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-400/30 text-emerald-300 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1">
                  <Radio className="w-2.5 h-2.5 animate-pulse text-emerald-400" />
                  <span>Live Feed</span>
                </span>
              </div>
              <p className="text-xs sm:text-sm text-slate-300 mt-0.5">
                Poland Christmas 2026 Itinerary, Intercity Rail & Flights
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-6 text-sm text-slate-200">
          {/* Trip Summary Telemetry Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div className="p-3 rounded-2xl bg-white/5 border border-white/10 flex flex-col">
              <span className="text-[11px] font-semibold text-wf-muted flex items-center gap-1.5 mb-1">
                <Calendar className="w-3.5 h-3.5 text-amber-400" />
                <span>Expedition</span>
              </span>
              <span className="text-xs sm:text-sm font-bold text-white">10 Days • 9 Nights</span>
              <span className="text-[10px] text-slate-400">Dec 4 - Dec 13, 2026</span>
            </div>

            <div className="p-3 rounded-2xl bg-white/5 border border-white/10 flex flex-col">
              <span className="text-[11px] font-semibold text-wf-muted flex items-center gap-1.5 mb-1">
                <Plane className="w-3.5 h-3.5 text-sky-400" />
                <span>Inbound Flight</span>
              </span>
              <span className="text-xs sm:text-sm font-bold text-white">Delta DL9208</span>
              <span className="text-[10px] text-slate-400">Touchdown 13:30 CET</span>
            </div>

            <div className="p-3 rounded-2xl bg-white/5 border border-white/10 flex flex-col">
              <span className="text-[11px] font-semibold text-wf-muted flex items-center gap-1.5 mb-1">
                <Train className="w-3.5 h-3.5 text-amber-400" />
                <span>Rail Transfers</span>
              </span>
              <span className="text-xs sm:text-sm font-bold text-white">PKP Intercity</span>
              <span className="text-[10px] text-slate-400">5 Scenic Rail Legs</span>
            </div>

            <div className="p-3 rounded-2xl bg-white/5 border border-white/10 flex flex-col">
              <span className="text-[11px] font-semibold text-wf-muted flex items-center gap-1.5 mb-1">
                <Clock className="w-3.5 h-3.5 text-purple-400" />
                <span>Timezone</span>
              </span>
              <span className="text-xs sm:text-sm font-bold text-white">CET (UTC+1)</span>
              <span className="text-[10px] text-slate-400">Europe/Warsaw</span>
            </div>
          </div>

          {/* Unauthenticated Guest Callout */}
          {!isAuthenticated && (
            <div className="p-4 rounded-2xl bg-wf-blue/15 border border-wf-blue/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start space-x-3">
                <ShieldCheck className="w-5 h-5 text-sky-400 shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-xs sm:text-sm font-bold text-white">
                    Public Itinerary Mode Active
                  </h4>
                  <p className="text-xs text-slate-300 mt-0.5">
                    You can download the public 10-day Poland itinerary snapshot right now. Sign in to generate a private live subscription feed with your confirmed Delta flight DL9208 and hotel vouchers.
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  onClose();
                  setIsAuthModalOpen(true);
                }}
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-wf-blue to-wf-blue-lt hover:opacity-90 text-white text-xs font-bold shrink-0 transition-opacity shadow-md"
              >
                Sign In / Register
              </button>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="p-3.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* SECTION 1: 1-Click Live Subscriptions */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs sm:text-sm font-bold text-white flex items-center space-x-2">
                <Smartphone className="w-4 h-4 text-amber-400" />
                <span>1-Click Calendar Subscription (Live Auto-Sync)</span>
              </h3>
              {tokenData?.poll_count !== undefined && (
                <span className="text-[11px] text-slate-400">
                  Polled <span className="text-amber-300 font-bold">{tokenData.poll_count}</span> times
                </span>
              )}
            </div>

            {isAuthenticated ? (
              isLoading ? (
                <div className="p-6 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center space-x-2 text-wf-muted text-xs">
                  <RefreshCw className="w-4 h-4 animate-spin text-amber-400" />
                  <span>Checking secure feed credentials...</span>
                </div>
              ) : !feedUrl ? (
                <div className="p-4 rounded-2xl bg-white/5 border border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h4 className="text-xs sm:text-sm font-bold text-white">Generate Your Private Live Feed</h4>
                    <p className="text-xs text-slate-300 mt-0.5">
                      Create a unique subscription token to sync your Poland 2026 itinerary with Apple, Google, or Outlook Calendar.
                    </p>
                  </div>
                  <button
                    onClick={() => generateOrRotateToken(false)}
                    disabled={isRotating}
                    className="px-4 py-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/40 text-amber-300 text-xs font-bold shrink-0 transition-colors"
                  >
                    {isRotating ? 'Generating...' : 'Enable Live Feed'}
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {/* Apple Calendar / iOS / macOS */}
                  <a
                    href={webcalUrl}
                    className="p-3.5 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 hover:border-amber-400/50 flex flex-col items-center text-center group transition-all"
                  >
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-slate-800 to-slate-900 border border-white/15 flex items-center justify-center text-white mb-2 group-hover:scale-105 transition-transform shadow-sm">
                      <Calendar className="w-5 h-5 text-amber-300" />
                    </div>
                    <span className="text-xs font-bold text-white group-hover:text-amber-300 transition-colors">
                      Apple Calendar
                    </span>
                    <span className="text-[10px] text-slate-400 mt-0.5">
                      iOS, iPadOS & Mac
                    </span>
                  </a>

                  {/* Google Calendar */}
                  <a
                    href={googleUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-3.5 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 hover:border-sky-400/50 flex flex-col items-center text-center group transition-all"
                  >
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-sky-950 to-slate-900 border border-sky-400/30 flex items-center justify-center text-sky-400 mb-2 group-hover:scale-105 transition-transform shadow-sm">
                      <ExternalLink className="w-5 h-5" />
                    </div>
                    <span className="text-xs font-bold text-white group-hover:text-sky-300 transition-colors">
                      Google Calendar
                    </span>
                    <span className="text-[10px] text-slate-400 mt-0.5">
                      Android & Web
                    </span>
                  </a>

                  {/* Outlook / Microsoft 365 */}
                  <a
                    href={outlookUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-3.5 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 hover:border-purple-400/50 flex flex-col items-center text-center group transition-all"
                  >
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-950 to-slate-900 border border-purple-400/30 flex items-center justify-center text-purple-400 mb-2 group-hover:scale-105 transition-transform shadow-sm">
                      <ExternalLink className="w-5 h-5" />
                    </div>
                    <span className="text-xs font-bold text-white group-hover:text-purple-300 transition-colors">
                      Outlook 365
                    </span>
                    <span className="text-[10px] text-slate-400 mt-0.5">
                      Windows & Web
                    </span>
                  </a>
                </div>
              )
            ) : (
              <div className="p-4 rounded-2xl bg-white/5 border border-white/10 text-center space-y-2">
                <p className="text-xs text-slate-300">
                  Live calendar subscription requires an authenticated session to generate a secure, private token.
                </p>
                <button
                  onClick={() => {
                    onClose();
                    setIsAuthModalOpen(true);
                  }}
                  className="px-4 py-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/40 text-amber-300 text-xs font-bold transition-colors"
                >
                  Sign In to Enable Live Sync
                </button>
              </div>
            )}
          </div>

          {/* SECTION 2: Copy Feed Link (Manual URL Subscription) */}
          {isAuthenticated && feedUrl && (
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
                <span>Direct Feed URL (For Any Calendar Client):</span>
                {copiedKey === 'feed' && (
                  <span className="text-emerald-400 text-[11px] font-bold flex items-center gap-1">
                    <Check className="w-3.5 h-3.5" />
                    <span>Copied to Clipboard!</span>
                  </span>
                )}
              </label>

              <div className="flex items-center gap-2">
                <div className="flex-1 bg-slate-950/70 border border-white/10 rounded-xl px-3.5 py-2 text-xs font-mono text-slate-300 truncate select-all">
                  {feedUrl}
                </div>
                <button
                  onClick={() => copyToClipboard(feedUrl, 'feed')}
                  className="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-white text-xs font-bold flex items-center gap-1.5 transition-colors shrink-0"
                >
                  {copiedKey === 'feed' ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                  <span>Copy Link</span>
                </button>
              </div>
              <p className="text-[11px] text-wf-muted">
                Paste into your calendar app under "Add Calendar from URL" or "Subscribe to Calendar".
              </p>
            </div>
          )}

          {/* SECTION 3: Direct Snapshot File Download */}
          <div className="p-4 rounded-2xl bg-gradient-to-r from-amber-500/10 via-slate-900 to-wf-navy-mid border border-amber-500/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start space-x-3">
              <div className="p-2 rounded-xl bg-amber-500/20 text-amber-300 border border-amber-500/30 shrink-0">
                <Download className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs sm:text-sm font-bold text-white">
                  Offline Snapshot (.ics File)
                </h4>
                <p className="text-xs text-slate-300 mt-0.5">
                  Download a standalone RFC 5545 iCalendar file to manually import events once into your local calendar software.
                </p>
              </div>
            </div>

            <button
              onClick={downloadDirectIcs}
              className="px-4 py-2.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/40 text-amber-300 hover:text-white text-xs font-bold flex items-center justify-center space-x-2 transition-colors shrink-0 shadow-sm"
            >
              <Download className="w-4 h-4" />
              <span>Download .ics</span>
            </button>
          </div>

          {/* SECTION 4: Token Management & Security */}
          {isAuthenticated && tokenData?.has_token && (
            <div className="pt-2 border-t border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-400">
              <div className="flex items-center space-x-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>
                  Feed Token Active • {tokenData.last_polled_at ? `Last sync: ${new Date(tokenData.last_polled_at).toLocaleTimeString()}` : 'Ready to sync'}
                </span>
              </div>

              <button
                onClick={() => generateOrRotateToken(true)}
                disabled={isRotating}
                className="inline-flex items-center space-x-1.5 text-slate-400 hover:text-amber-300 transition-colors disabled:opacity-50 text-[11px]"
                title="Generates a new token if your calendar link was shared or compromised"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isRotating ? 'animate-spin text-amber-400' : ''}`} />
                <span>Rotate Private Token</span>
              </button>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 sm:p-5 border-t border-white/10 flex items-center justify-end bg-wf-navy-mid/40">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs sm:text-sm font-bold transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
