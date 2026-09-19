import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../utils/api.js';
import { formatCurrency, formatDate, etvColor } from '../utils/formatters.js';
import { ChevronLeft, ChevronRight, Loader2, ArrowUpRight } from 'lucide-react';

export default function OrdersView() {
  const [orders, setOrders] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState('order_date');
  const [dir, setDir] = useState('desc');

  const limit = 50;

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const q = new URLSearchParams({ page: String(page), limit: String(limit), sort, dir });
      const res = await apiFetch(`/api/vinescout/orders?${q.toString()}`);
      setOrders(res.orders || []);
      setTotal(res.total || 0);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [page, sort, dir]);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Order History</h1>
          <p className="text-sm text-slate-400">Your Amazon orders synced from the extension.</p>
        </div>
        
        <div className="flex items-center gap-3">
          <select className="vs-select w-48" value={`${sort}-${dir}`} onChange={e => { 
            const [s, d] = e.target.value.split('-');
            setSort(s); setDir(d); setPage(1); 
          }}>
            <option value="order_date-desc">Newest Orders</option>
            <option value="order_date-asc">Oldest Orders</option>
            <option value="etv-desc">Highest ETV</option>
            <option value="etv-asc">Lowest ETV</option>
          </select>
        </div>
      </div>

      <div className="vs-card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="vs-table">
            <thead>
              <tr>
                <th className="w-40">Order Date</th>
                <th className="w-48">Order Number</th>
                <th>ASIN / Item ID</th>
                <th className="w-32 text-center">Status</th>
                <th className="w-24 text-right">ETV</th>
              </tr>
            </thead>
            <tbody>
              {loading && orders.length === 0 ? (
                <tr><td colSpan={5} className="text-center py-12"><Loader2 className="w-6 h-6 animate-spin mx-auto text-vs-500" /></td></tr>
              ) : orders.length === 0 ? (
                <tr><td colSpan={5} className="text-center py-12 text-slate-500">No orders synced yet.</td></tr>
              ) : (
                orders.map(order => (
                  <tr key={order.id}>
                    <td className="whitespace-nowrap text-slate-300">
                      {formatDate(order.order_date)}
                    </td>
                    <td className="font-mono text-sm">
                      <a href={`https://www.amazon.com/gp/your-account/order-details?orderID=${order.order_id}`} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-vs-400 hover:text-vs-300">
                        {order.order_id}
                        <ArrowUpRight className="w-3 h-3 opacity-70" />
                      </a>
                    </td>
                    <td className="font-mono text-sm text-slate-400">
                      {order.asin || order.item_id || '-'}
                    </td>
                    <td className="text-center">
                      <span className={`vs-badge ${
                        order.status === 'Shipped' || order.status === 'Delivered' ? 'bg-vs-900 text-vs-300' :
                        order.status === 'Cancelled' || order.status === 'Returned' ? 'bg-red-900 text-red-300' :
                        'bg-slate-700 text-slate-300'
                      }`}>
                        {order.status || 'Unknown'}
                      </span>
                    </td>
                    <td className={`text-right font-mono font-medium ${etvColor(order.etv)}`}>
                      {formatCurrency(order.etv)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        
        <div className="p-4 border-t border-surface-border flex items-center justify-between bg-surface/50">
          <div className="text-sm text-slate-400">
            Showing <span className="font-medium text-white">{orders.length > 0 ? (page - 1) * limit + 1 : 0}</span> to <span className="font-medium text-white">{Math.min(page * limit, total)}</span> of <span className="font-medium text-white">{total}</span>
          </div>
          <div className="flex gap-2">
            <button className="vs-btn-ghost px-3 py-1" disabled={page === 1 || loading} onClick={() => setPage(p => p - 1)}><ChevronLeft className="w-4 h-4"/></button>
            <button className="vs-btn-ghost px-3 py-1" disabled={page >= totalPages || loading} onClick={() => setPage(p => p + 1)}><ChevronRight className="w-4 h-4"/></button>
          </div>
        </div>
      </div>
    </div>
  );
}
