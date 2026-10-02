import React, { useState, useEffect, useRef } from 'react';
import { Search, Loader2, Database, AlertCircle } from 'lucide-react';
import { fetchEbayCatalog } from '../../utils/auctionApi';

export function CatalogSearchDropdown({ onSelectProduct }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef(null);
  const debounceRef = useRef(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const searchReqIdRef = useRef(0);
  const searchCatalog = async (searchTerm) => {
    const reqId = ++searchReqIdRef.current;
    if (!searchTerm || searchTerm.length < 3) {
      setResults([]);
      setError(null);
      setIsOpen(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetchEbayCatalog(searchTerm);
      if (reqId === searchReqIdRef.current) {
        if (res && res.products) {
          setResults(res.products);
          setIsOpen(res.products.length > 0);
        } else {
          setResults([]);
          setIsOpen(false);
        }
      }
    } catch (err) {
      if (reqId === searchReqIdRef.current) {
        setError('Failed to fetch catalog: ' + err.message);
        setResults([]);
      }
    } finally {
      if (reqId === searchReqIdRef.current) {
        setLoading(false);
      }
    }
  };

  const handleInputChange = (e) => {
    const val = e.target.value;
    setQuery(val);
    
    if (debounceRef.current) clearTimeout(debounceRef.current);
    
    debounceRef.current = setTimeout(() => {
      searchCatalog(val);
    }, 500);
  };

  const handleSelect = (product) => {
    setQuery('');
    setIsOpen(false);
    onSelectProduct(product);
  };

  return (
    <div className="relative mb-4" ref={wrapperRef}>
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          {loading ? (
            <Loader2 className="w-4 h-4 text-amber-500 animate-spin" />
          ) : (
            <Database className="w-4 h-4 text-amber-500" />
          )}
        </div>
        <input
          type="text"
          value={query}
          onChange={handleInputChange}
          placeholder="Search eBay Catalog (e.g. 'Sony WH-1000XM4' or UPC)..."
          className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-900/80 border border-amber-500/30 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500 shadow-inner focus:ring-1 focus:ring-amber-500/50 transition-all"
        />
        <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
          <Search className="w-4 h-4 text-slate-500" />
        </div>
      </div>

      {error && (
        <div className="mt-1 text-[11px] text-red-400 flex items-center gap-1">
          <AlertCircle className="w-3 h-3" /> {error}
        </div>
      )}

      {isOpen && results.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-slate-900 border border-amber-500/40 rounded-xl shadow-xl max-h-60 overflow-y-auto overflow-x-hidden">
          {results.map((product) => (
            <button
              key={product.epid}
              onClick={() => handleSelect(product)}
              className="w-full flex items-start gap-3 p-3 hover:bg-slate-800 border-b border-slate-800/50 last:border-0 transition-colors text-left"
            >
              <div className="w-12 h-12 shrink-0 bg-slate-950 rounded border border-slate-800 overflow-hidden flex items-center justify-center">
                {product.image ? (
                  <img src={product.image} alt={product.title} className="w-full h-full object-contain" />
                ) : (
                  <Database className="w-5 h-5 text-slate-600" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-slate-200 truncate">{product.title}</p>
                <div className="text-[10px] text-slate-400 mt-1 flex flex-wrap gap-x-2 gap-y-1">
                  <span className="font-mono text-amber-500/80">ePID: {product.epid}</span>
                  {/* Extract some key aspects to show */}
                  {product.aspects && product.aspects.filter(a => ['Brand', 'Model', 'Color'].includes(a.name)).map(a => (
                    <span key={a.name}>{a.name}: {a.values?.[0] || 'Unknown'}</span>
                  ))}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
