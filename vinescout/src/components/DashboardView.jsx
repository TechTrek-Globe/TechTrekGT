import { useState, useEffect } from 'react';
import { apiFetch } from '../utils/api.js';
import { formatCurrency, formatDateTime } from '../utils/formatters.js';
import { Package, Receipt, Calculator, AlertCircle, RefreshCw } from 'lucide-react';

export default function DashboardView({ onViewChange }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchStats = async () => {
    setLoading(true);
    try {
      const [itemsRes, ordersRes] = await Promise.all([
        apiFetch('/api/vinescout/items?limit=1'),
        apiFetch('/api/vinescout/orders?limit=1')
      ]);
      setStats({
        totalItems: itemsRes.total || 0,
        totalOrders: ordersRes.total || 0,
        lastSync: itemsRes.items?.[0]?.updated_at || null
      });
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchStats(); }, []);

  if (loading) {
    return <div className="flex items-center justify-center h-64"><RefreshCw className="w-8 h-8 animate-spin text-vs-500" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Overview</h1>
          <p className="text-sm text-slate-400">Welcome to your Amazon Vine analytics portal.</p>
        </div>
        <div className="text-right">
          <div className="text-xs font-medium text-surface-muted uppercase tracking-wider mb-1">Last Synced</div>
          <div className="text-sm text-slate-200 bg-surface-card px-3 py-1.5 rounded-lg border border-surface-border">
            {formatDateTime(stats?.lastSync)}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="vs-metric vs-glow relative overflow-hidden cursor-pointer hover:border-vs-500/50 transition-colors" onClick={() => onViewChange('items')}>
          <div className="absolute top-0 right-0 p-4 opacity-10"><Package className="w-16 h-16 text-vs-400" /></div>
          <span className="vs-metric-label flex items-center gap-2"><Package className="w-4 h-4 text-vs-500"/> Total Items Scraped</span>
          <span className="vs-metric-value text-4xl mt-2">{stats?.totalItems?.toLocaleString() || 0}</span>
          <div className="mt-4 text-xs text-slate-400">Active items in catalog</div>
        </div>

        <div className="vs-metric relative overflow-hidden cursor-pointer hover:border-vs-500/50 transition-colors" onClick={() => onViewChange('orders')}>
          <div className="absolute top-0 right-0 p-4 opacity-10"><Receipt className="w-16 h-16 text-vs-400" /></div>
          <span className="vs-metric-label flex items-center gap-2"><Receipt className="w-4 h-4 text-vs-500"/> Total Orders</span>
          <span className="vs-metric-value text-4xl mt-2">{stats?.totalOrders?.toLocaleString() || 0}</span>
          <div className="mt-4 text-xs text-slate-400">Synced from order history</div>
        </div>

        <div className="vs-metric relative overflow-hidden cursor-pointer hover:border-vs-500/50 transition-colors" onClick={() => onViewChange('tax')}>
          <div className="absolute top-0 right-0 p-4 opacity-10"><Calculator className="w-16 h-16 text-vs-400" /></div>
          <span className="vs-metric-label flex items-center gap-2"><Calculator className="w-4 h-4 text-vs-500"/> Tax Settings</span>
          <span className="vs-metric-value text-xl mt-2 text-vs-300">Configured</span>
          <div className="mt-4 text-xs text-slate-400">Calculations ready</div>
        </div>
      </div>

      <div className="vs-card mt-8 bg-gradient-to-br from-surface-card to-vs-950/30">
        <div className="flex gap-4 items-start">
          <div className="p-3 bg-vs-900/50 rounded-xl border border-vs-500/20"><AlertCircle className="w-6 h-6 text-vs-400" /></div>
          <div>
            <h3 className="text-lg font-semibold text-white mb-2">How to sync your data</h3>
            <p className="text-slate-300 text-sm leading-relaxed mb-4">
              VScout is a dual-system platform. Your data is scraped automatically by the <strong>VScout Chrome Extension</strong> while you browse Amazon Vine. To see your latest data here:
            </p>
            <ol className="list-decimal list-inside text-sm text-slate-400 space-y-2 ml-2">
              <li>Open the VScout extension popup in Chrome.</li>
              <li>Go to the <strong>Dashboard</strong>.</li>
              <li>Click the <strong>☁️ Push to VScout Portal</strong> button in the settings list.</li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}
