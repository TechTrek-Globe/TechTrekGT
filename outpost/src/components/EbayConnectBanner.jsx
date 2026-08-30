import React, { useState, useEffect, useCallback } from 'react';
import {
  ShoppingBag, CheckCircle2, XCircle, AlertTriangle, ExternalLink,
  RefreshCw, Search, Loader2, Unlink
} from 'lucide-react';
import { getEbayOAuthStatus, findEbayListings } from '../utils/auctionApi';

const GATEWAY_BASE =
  typeof window !== 'undefined' && window.location.hostname === 'localhost'
    ? 'http://localhost:8787'
    : 'https://techtrekgt.com';

/**
 * EbayConnectBanner
 *
 * Displays in Settings > eBay Integration section.
 * Shows OAuth connection status, connect/disconnect controls,
 * and the "Find Active Listings" discovery trigger.
 *
 * Props:
 *   onFindListings(matches) - called with fuzzy match results for ListingMatchReviewModal
 */
export function EbayConnectBanner({ onFindListings }) {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [finding, setFinding] = useState(false);
  const [error, setError] = useState('');

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getEbayOAuthStatus();
      setStatus(data);
    } catch (e) {
      if (!e.message?.includes('not connected')) setError(e.message);
      setStatus({ connected: false });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    // Auto-reload status if user just returned from OAuth redirect
    const params = new URLSearchParams(window.location.search);
    if (params.get('ebay') === 'connected') {
      fetchStatus();
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [fetchStatus]);

  const handleConnect = () => {
    window.location.href = `${GATEWAY_BASE}/api/ebay/oauth/start`;
  };

  const handleDisconnect = async () => {
    if (!window.confirm('Disconnect your eBay account? Webhooks and fee reconciliation will stop working.')) return;
    try {
      await fetch(`${GATEWAY_BASE}/api/ebay/oauth/disconnect`, {
        method: 'DELETE',
        credentials: 'include'
      });
      setStatus({ connected: false });
    } catch (e) {
      setError(`Disconnect failed: ${e.message}`);
    }
  };

  const handleFindListings = async () => {
    setFinding(true);
    setError('');
    try {
      const data = await findEbayListings();
      if (onFindListings) onFindListings(data.matches || []);
      // Reflect the refreshed timestamp in local state without a full refetch
      setStatus(prev => prev ? { ...prev, last_refreshed_at: new Date().toISOString() } : prev);
    } catch (e) {
      const msg = e.message || '';
      if (msg.includes('sell.inventory') || msg.includes('scope approval')) {
        setError('eBay Sell Inventory scope not approved. Apply for sell.inventory.readonly at developer.ebay.com.');
      } else if (msg.includes('not connected') || msg.includes('refresh token has expired')) {
        setError('eBay token expired or disconnected. Please disconnect and reconnect your account.');
      } else if (msg.includes('Endpoint not found') || msg.includes('gateway')) {
        setError('Backend routing error. Please contact support.');
      } else {
        setError(`Listing discovery failed: ${msg}`);
      }
    } finally {
      setFinding(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-slate-500 text-xs py-2">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        Checking eBay connection...
      </div>
    );
  }

  if (!status?.connected) {
    return (
      <div className="p-4 rounded-xl bg-slate-900 border border-slate-700 space-y-3">
        <div className="flex items-center gap-2">
          <ShoppingBag className="w-4 h-4 text-amber-400" />
          <span className="text-sm font-bold text-white">eBay Integration</span>
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-400 border border-slate-700">NOT CONNECTED</span>
        </div>
        <p className="text-xs text-slate-400">
          Connect your eBay seller account to enable real-time webhook notifications,
          automatic fee reconciliation via the Finances API, and active listing discovery.
        </p>
        {error && (
          <div className="flex items-center gap-1.5 text-xs text-red-400">
            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" /> {error}
          </div>
        )}
        <button
          id="ebay-connect-btn"
          onClick={handleConnect}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 transition-all shadow-sm"
        >
          <ShoppingBag className="w-3.5 h-3.5" />
          Connect eBay Account
        </button>
      </div>
    );
  }

  const daysLeft = status.days_until_expiry ?? 99;

  return (
    <div className="p-4 rounded-xl bg-slate-900 border border-slate-700 space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <ShoppingBag className="w-4 h-4 text-green-400" />
          <span className="text-sm font-bold text-white">eBay Integration</span>
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-green-500/10 text-green-400 border border-green-500/20">CONNECTED</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            id="ebay-find-listings-btn"
            onClick={handleFindListings}
            disabled={finding}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 border border-blue-500/20 transition-all disabled:opacity-50"
          >
            {finding ? <Loader2 className="w-3 h-3 animate-spin" /> : <Search className="w-3 h-3" />}
            {finding ? 'Searching...' : 'Find Listings'}
          </button>
          <button
            id="ebay-refresh-status-btn"
            onClick={fetchStatus}
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-slate-800 transition-all"
            title="Refresh status"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          <button
            id="ebay-disconnect-btn"
            onClick={handleDisconnect}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-red-400 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 transition-all"
          >
            <Unlink className="w-3 h-3" /> Disconnect
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
        <InfoCell label="eBay Account" value={status.ebay_user_id || 'Connected'} icon={<CheckCircle2 className="w-3 h-3 text-green-400" />} />
        <InfoCell label="Token Expires" value={`${daysLeft}d`} icon={daysLeft < 30 ? <AlertTriangle className="w-3 h-3 text-amber-400" /> : <CheckCircle2 className="w-3 h-3 text-green-400" />} />
        <InfoCell label="Connected" value={status.connected_at ? new Date(status.connected_at).toLocaleDateString() : '-'} />
        <InfoCell label="Last Refresh" value={status.last_refreshed_at ? new Date(status.last_refreshed_at).toLocaleDateString() : 'Never'} />
      </div>

      {daysLeft < 30 && (
        <div className="flex items-center gap-2 p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300">
          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
          Refresh token expires in {daysLeft} days. Disconnect and reconnect before it expires to maintain webhook access.
        </div>
      )}

      <div className="text-[10px] text-slate-500">
        Scopes: {(status.scopes || '').split(' ').filter(Boolean).length} active
        {' '}
        {!(status.scopes || '').includes('sell.finances') && (
          <span className="text-amber-400 ml-1">
            (sell.finances pending approval - fee reconciliation unavailable until approved)
          </span>
        )}
      </div>

      {status.scope_flags && !status.scope_flags.has_sell_inventory && (
        <div className="flex items-center gap-2 p-2.5 rounded-lg bg-blue-500/10 border border-blue-500/20 text-xs text-blue-300">
          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
          Listing discovery requires <strong>sell.inventory.readonly</strong> scope approval at
          {' '}<a href="https://developer.ebay.com" target="_blank" rel="noopener noreferrer" className="underline">developer.ebay.com</a>.
        </div>
      )}

      {error && (
        <div className="flex items-center gap-1.5 text-xs text-red-400">
          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" /> {error}
        </div>
      )}
    </div>
  );
}

function InfoCell({ label, value, icon }) {
  return (
    <div className="space-y-0.5">
      <div className="text-slate-500 text-[10px] uppercase tracking-wide">{label}</div>
      <div className="flex items-center gap-1 text-slate-200 font-semibold">
        {icon}{value}
      </div>
    </div>
  );
}
