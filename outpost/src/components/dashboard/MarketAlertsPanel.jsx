import React, { useState, useEffect } from 'react';
import { Bell, BellRing, Check, TrendingUp, TrendingDown, RefreshCw, AlertCircle, ExternalLink } from 'lucide-react';
import { getApiUrl } from '../../utils/api';

export function MarketAlertsPanel() {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  
  const fetchAlerts = async () => {
    try {
      const res = await fetch(getApiUrl('/api/market-alerts'), { credentials: 'include' });
      const data = await res.json();
      if (res.ok && data.alerts) {
        setAlerts(data.alerts);
      }
    } catch (err) {
      setError('Failed to load alerts.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAlerts();
  }, []);

  const handleMarkRead = async (id) => {
    try {
      setAlerts(prev => prev.filter(a => a.id !== id));
      await fetch(getApiUrl(`/api/market-alerts/${id}`), {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_read: true })
      });
    } catch (err) {
      console.error(err);
    }
  };

  const handleRefreshAll = async () => {
    setRefreshing(true);
    try {
      await fetch(getApiUrl('/api/market-alerts/refresh-all'), {
        method: 'POST',
        credentials: 'include'
      });
      // Set a timeout to refetch alerts after background job has had some time
      setTimeout(fetchAlerts, 10000); 
    } catch (err) {
      console.error(err);
    } finally {
      setRefreshing(false);
    }
  };

  if (loading) return (
    <div className="glass-card-light rounded-2xl p-6 border border-slate-700/50 flex items-center justify-center min-h-[200px]">
      <RefreshCw className="w-6 h-6 text-slate-500 animate-spin" />
    </div>
  );

  return (
    <div className="glass-card-light rounded-2xl border border-slate-700/50 overflow-hidden flex flex-col h-full">
      <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/50 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 font-black relative">
            <Bell className="w-4 h-4" />
            {alerts.length > 0 && (
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse border border-slate-900"></span>
            )}
          </div>
          <div>
            <h3 className="text-sm font-black text-slate-100 flex items-center gap-2">
              Market Value Alerts
            </h3>
            <p className="text-[11px] text-slate-400">Live eBay comp anomalies</p>
          </div>
        </div>
        <button 
          onClick={handleRefreshAll}
          disabled={refreshing}
          className="p-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-slate-200 transition-colors border border-slate-700 disabled:opacity-50"
          title="Refresh Comps for Active Inventory (Runs in background)"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin text-amber-400' : ''}`} />
        </button>
      </div>

      <div className="p-4 flex-1 overflow-y-auto space-y-3">
        {error && (
          <div className="p-3 rounded-xl bg-red-950/40 border border-red-800/40 text-red-400 text-[11px] flex items-center gap-1.5">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            {error}
          </div>
        )}
        
        {alerts.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center text-slate-500 py-8">
            <BellRing className="w-8 h-8 text-slate-700 mb-3" />
            <p className="text-sm font-semibold text-slate-400">No new alerts</p>
            <p className="text-[11px]">Your inventory pricing is aligned with recent comps.</p>
          </div>
        ) : (
          alerts.map(alert => (
            <div key={alert.id} className="p-3 bg-slate-900/80 rounded-xl border border-slate-800 flex flex-col gap-2 relative group hover:border-amber-500/30 transition-colors">
              <div className="flex justify-between items-start gap-2">
                <div className="flex items-start gap-2 flex-1 min-w-0">
                  {alert.alert_type === 'SPIKE' ? (
                    <TrendingUp className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
                  ) : (
                    <TrendingDown className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
                  )}
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-200 truncate pr-6">{alert.item_name}</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      {alert.alert_type === 'SPIKE' ? 'Spiked' : 'Dropped'} {(alert.percentage_change * 100).toFixed(0)}% from your target.
                    </p>
                  </div>
                </div>
                
                <button 
                  onClick={() => handleMarkRead(alert.id)}
                  className="w-6 h-6 rounded-md bg-slate-800 text-slate-400 hover:text-amber-300 hover:bg-slate-700 flex items-center justify-center transition-colors absolute top-2 right-2 opacity-0 group-hover:opacity-100"
                  title="Dismiss alert"
                >
                  <Check className="w-3.5 h-3.5" />
                </button>
              </div>
              
              <div className="flex items-center gap-2 mt-1">
                <span className="px-2 py-1 bg-slate-950 rounded-lg text-[10px] font-mono text-slate-500 border border-slate-800">
                  Old: <span className="text-slate-300">${alert.old_value.toFixed(2)}</span>
                </span>
                <span className="px-2 py-1 bg-amber-500/10 rounded-lg text-[10px] font-mono text-amber-500 border border-amber-500/20">
                  New Avg: <span className="font-bold">${alert.new_value.toFixed(2)}</span>
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
