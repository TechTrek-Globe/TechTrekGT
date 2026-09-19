import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../utils/api.js';
import { formatCurrency, formatDate, etvColor, vineCategoryLabel, vineCategoryBadgeClass, formatRating, truncate } from '../utils/formatters.js';
import { Search, ChevronLeft, ChevronRight, Loader2, Image as ImageIcon } from 'lucide-react';

export default function ItemsView() {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  
  // Filters
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [reviewed, setReviewed] = useState('');
  const [sort, setSort] = useState('date_added');
  const [dir, setDir] = useState('desc');

  const limit = 50;

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const q = new URLSearchParams({
        page: String(page), limit: String(limit), sort, dir
      });
      if (search) q.set('search', search);
      if (category) q.set('category', category);
      if (reviewed) q.set('reviewed', reviewed);

      const res = await apiFetch(`/api/vinescout/items?${q.toString()}`);
      setItems(res.items || []);
      setTotal(res.total || 0);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [page, search, category, reviewed, sort, dir]);

  useEffect(() => {
    const t = setTimeout(fetchItems, 300); // debounce search
    return () => clearTimeout(t);
  }, [fetchItems]);

  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Catalog</h1>
          <p className="text-sm text-slate-400">Manage your synced Amazon Vine items.</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input 
              type="text" placeholder="Search title or ASIN..." 
              value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
              className="vs-input pl-9 w-64"
            />
          </div>
          <select className="vs-select w-36" value={category} onChange={e => { setCategory(e.target.value); setPage(1); }}>
            <option value="">All Categories</option>
            <option value="REGULAR">Regular</option>
            <option value="AFA">AFA</option>
            <option value="RFY">RFY</option>
            <option value="LAST_CHANCE">Last Chance</option>
          </select>
          <select className="vs-select w-36" value={reviewed} onChange={e => { setReviewed(e.target.value); setPage(1); }}>
            <option value="">Review Status</option>
            <option value="1">Reviewed</option>
            <option value="0">Pending</option>
          </select>
          <select className="vs-select w-40" value={`${sort}-${dir}`} onChange={e => { 
            const [s, d] = e.target.value.split('-');
            setSort(s); setDir(d); setPage(1); 
          }}>
            <option value="date_added-desc">Newest First</option>
            <option value="date_added-asc">Oldest First</option>
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
                <th className="w-12 text-center">Img</th>
                <th>Item Details</th>
                <th className="w-24">Category</th>
                <th className="w-24 text-right">ETV</th>
                <th className="w-28 text-center">Status</th>
                <th className="w-24 text-center">Rating</th>
                <th className="w-28 text-right">Date Added</th>
              </tr>
            </thead>
            <tbody>
              {loading && items.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-12"><Loader2 className="w-6 h-6 animate-spin mx-auto text-vs-500" /></td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-12 text-slate-500">No items found. Try syncing from the extension.</td></tr>
              ) : (
                items.map(item => (
                  <tr key={item.id}>
                    <td className="text-center py-2">
                      {item.image_url ? (
                        <img src={item.image_url} alt="thumbnail" className="w-10 h-10 object-contain rounded bg-white p-0.5 mx-auto" loading="lazy" />
                      ) : (
                        <div className="w-10 h-10 bg-surface flex items-center justify-center rounded mx-auto border border-surface-border"><ImageIcon className="w-4 h-4 text-slate-600"/></div>
                      )}
                    </td>
                    <td>
                      <div className="font-medium text-slate-200" title={item.title}>{truncate(item.title, 55)}</div>
                      <div className="text-xs text-slate-500 font-mono mt-0.5">
                        <a href={`https://www.amazon.com/dp/${item.asin}`} target="_blank" rel="noreferrer" className="hover:text-vs-400 hover:underline">{item.asin}</a>
                        {item.order_id && <span className="ml-2 pl-2 border-l border-surface-border">Order: {item.order_id}</span>}
                      </div>
                    </td>
                    <td>
                      <span className={vineCategoryBadgeClass(item.vine_category)}>{vineCategoryLabel(item.vine_category)}</span>
                    </td>
                    <td className={`text-right font-mono font-medium ${etvColor(item.etv)}`}>
                      {formatCurrency(item.etv)}
                    </td>
                    <td className="text-center">
                      {item.review_written ? 
                        <span className="vs-badge-green">Reviewed</span> : 
                        <span className="vs-badge-gray">Pending</span>}
                    </td>
                    <td className="text-center text-amber-400 font-medium">
                      {item.review_written ? formatRating(item.rating) : '-'}
                    </td>
                    <td className="text-right text-slate-400 whitespace-nowrap">
                      {formatDate(item.date_added)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        
        {/* Pagination */}
        <div className="p-4 border-t border-surface-border flex items-center justify-between bg-surface/50">
          <div className="text-sm text-slate-400">
            Showing <span className="font-medium text-white">{items.length > 0 ? (page - 1) * limit + 1 : 0}</span> to <span className="font-medium text-white">{Math.min(page * limit, total)}</span> of <span className="font-medium text-white">{total}</span>
          </div>
          <div className="flex gap-2">
            <button 
              className="vs-btn-ghost px-3 py-1"
              disabled={page === 1 || loading}
              onClick={() => setPage(p => p - 1)}
            ><ChevronLeft className="w-4 h-4"/></button>
            <button 
              className="vs-btn-ghost px-3 py-1"
              disabled={page >= totalPages || loading}
              onClick={() => setPage(p => p + 1)}
            ><ChevronRight className="w-4 h-4"/></button>
          </div>
        </div>
      </div>
    </div>
  );
}
