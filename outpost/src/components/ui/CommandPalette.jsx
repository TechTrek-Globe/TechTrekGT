import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Search,
  LayoutDashboard,
  Package,
  ShoppingCart,
  Settings,
  ShieldCheck,
  ArrowRightLeft,
  FileSpreadsheet,
  RefreshCw,
  LogOut,
  Globe,
  Tag,
  Loader2,
  CornerDownLeft,
  X,
  ExternalLink,
  Box
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useInventory } from '../../context/InventoryContext';
import { useCommandPalette } from '../../context/CommandPaletteContext';
import { getEnrichedItems } from '../../utils/auctionApi';
import { fmtCurrency } from '../../utils/formulaPreview';

/**
 * Fuzzy match helper that scores match quality:
 * Exact = 100, Prefix = 80, Word Start = 60, Substring = 40, Subsequence = >0.
 */
function scoreFuzzyMatch(text, query) {
  if (!query) return { match: true, score: 0 };
  const str = (text || '').toLowerCase();
  const q = query.toLowerCase().trim();

  if (str === q) return { match: true, score: 100 };
  if (str.startsWith(q)) return { match: true, score: 80 };

  const words = str.split(/[\s\-_/]+/);
  if (words.some(w => w.startsWith(q))) return { match: true, score: 60 };

  const idx = str.indexOf(q);
  if (idx !== -1) return { match: true, score: 40 - idx };

  let qIdx = 0;
  let score = 0;
  let consecutive = 0;
  for (let i = 0; i < str.length && qIdx < q.length; i++) {
    if (str[i] === q[qIdx]) {
      qIdx++;
      consecutive++;
      score += 5 + (consecutive * 3);
    } else {
      consecutive = 0;
    }
  }

  if (qIdx === q.length) {
    return { match: true, score };
  }
  return { match: false, score: 0 };
}

/**
 * CommandPalette Component
 * Global keyboard-first navigation and fuzzy search modal (Cmd+K / Ctrl+K).
 */
export function CommandPalette({
  isOpen: propIsOpen,
  onClose: propOnClose,
  onNavigate,
  onOpenFinanceSync,
  onOpenTaxReport
}) {
  const { user, logout } = useAuth();
  const inventoryContext = useInventory();
  const { isOpen: ctxIsOpen, closePalette: ctxClosePalette } = useCommandPalette();

  const isOpen = propIsOpen !== undefined ? propIsOpen : ctxIsOpen;
  const handleClose = useCallback(() => {
    if (propOnClose) propOnClose();
    if (ctxClosePalette) ctxClosePalette();
  }, [propOnClose, ctxClosePalette]);

  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [skuResults, setSkuResults] = useState([]);
  const [isSearchingSkus, setIsSearchingSkus] = useState(false);

  const inputRef = useRef(null);
  const dialogRef = useRef(null);
  const resultsContainerRef = useRef(null);
  const previousFocusRef = useRef(null);
  const abortControllerRef = useRef(null);
  const skuCacheRef = useRef(new Map());

  const adminEmail = import.meta.env.VITE_ADMIN_EMAIL || 'jgk1865@gmail.com';
  const isAdmin = user?.email?.toLowerCase() === adminEmail.toLowerCase();

  // Static routes and tools catalog
  const staticActions = useMemo(() => {
    const list = [
      {
        id: 'route-dashboard',
        type: 'route',
        category: 'Navigation',
        title: 'Dashboard',
        subtitle: 'Overview, analytics & KPIs',
        icon: LayoutDashboard,
        keywords: 'home stats overview analytics kpi metrics',
        action: () => onNavigate && onNavigate('dashboard')
      },
      {
        id: 'route-inventory',
        type: 'route',
        category: 'Navigation',
        title: 'Inventory & Pricing',
        subtitle: 'Manage items, catalog, comps & list prices',
        icon: Package,
        keywords: 'items catalog stock products listings prices floor margins',
        action: () => onNavigate && onNavigate('inventory')
      },
      {
        id: 'route-sales',
        type: 'route',
        category: 'Navigation',
        title: 'Sales Log',
        subtitle: 'Track sold inventory, profits & payout fees',
        icon: ShoppingCart,
        keywords: 'orders sold transactions profits revenue history payouts',
        action: () => onNavigate && onNavigate('sales')
      },
      {
        id: 'route-settings',
        type: 'route',
        category: 'Navigation',
        title: 'Settings',
        subtitle: 'Account configuration, eBay OAuth & sync settings',
        icon: Settings,
        keywords: 'config preferences ebay credentials account api integrations profile',
        action: () => onNavigate && onNavigate('settings')
      },
      {
        id: 'action-finance-sync',
        type: 'action',
        category: 'Quick Actions',
        title: 'Finance Sync',
        subtitle: 'Transfer sales and reconcile with personal budget',
        icon: ArrowRightLeft,
        keywords: 'finance budget sync transfer reconcile export money',
        action: () => onOpenFinanceSync && onOpenFinanceSync()
      },
      {
        id: 'action-tax-report',
        type: 'action',
        category: 'Quick Actions',
        title: 'Tax / Schedule C Report',
        subtitle: 'Generate annual IRS Schedule C breakdown & CSV export',
        icon: FileSpreadsheet,
        keywords: 'tax 1040 schedule c deductions writeoffs irs csv export',
        action: () => onOpenTaxReport && onOpenTaxReport()
      },
      {
        id: 'action-sync-ebay',
        type: 'action',
        category: 'Quick Actions',
        title: 'Sync eBay Store',
        subtitle: 'Refresh active listings, orders & sync fees',
        icon: RefreshCw,
        keywords: 'ebay refresh sync all listings orders sales fetch',
        action: async () => {
          if (inventoryContext?.handleSyncEbay) {
            await inventoryContext.handleSyncEbay();
          }
        }
      },
      {
        id: 'action-launchpad',
        type: 'external',
        category: 'Navigation',
        title: 'TechTrekGT Launch Pad',
        subtitle: 'Return to platform root hub',
        icon: Globe,
        keywords: 'main site hub home techtrekgt external launch pad',
        action: () => {
          if (typeof window !== 'undefined') {
            window.location.href = 'https://techtrekgt.com';
          }
        }
      },
      {
        id: 'action-logout',
        type: 'action',
        category: 'Account',
        title: 'Sign Out',
        subtitle: `Signed in as ${user?.email || 'User'}`,
        icon: LogOut,
        keywords: 'logout signout exit disconnect account',
        action: () => logout && logout()
      }
    ];

    if (isAdmin) {
      list.splice(4, 0, {
        id: 'route-admin',
        type: 'route',
        category: 'Navigation',
        title: 'Admin Control Center',
        subtitle: 'Platform user management and system metrics',
        icon: ShieldCheck,
        keywords: 'admin users security authorization stats system accounts',
        action: () => onNavigate && onNavigate('admin')
      });
    }

    return list;
  }, [onNavigate, onOpenFinanceSync, onOpenTaxReport, inventoryContext, user, logout, isAdmin]);

  // Filter static actions based on user query
  const filteredStaticActions = useMemo(() => {
    const trimmed = query.trim();
    if (!trimmed) return staticActions;

    return staticActions
      .map(item => {
        const titleMatch = scoreFuzzyMatch(item.title, trimmed);
        const keywordMatch = scoreFuzzyMatch(item.keywords, trimmed);
        const subMatch = scoreFuzzyMatch(item.subtitle, trimmed);
        const bestScore = Math.max(
          titleMatch.match ? titleMatch.score + 10 : 0,
          keywordMatch.match ? keywordMatch.score : 0,
          subMatch.match ? subMatch.score - 5 : 0
        );
        const isMatch = titleMatch.match || keywordMatch.match || subMatch.match;
        return { item, isMatch, score: bestScore };
      })
      .filter(r => r.isMatch)
      .sort((a, b) => b.score - a.score)
      .map(r => r.item);
  }, [staticActions, query]);

  // Debounced remote SKU search
  useEffect(() => {
    const trimmed = query.trim();
    if (!isOpen || !trimmed) {
      setSkuResults([]);
      setIsSearchingSkus(false);
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      return;
    }

    // Check in-memory cache first
    const cacheKey = trimmed.toLowerCase();
    if (skuCacheRef.current.has(cacheKey)) {
      setSkuResults(skuCacheRef.current.get(cacheKey));
      setIsSearchingSkus(false);
      return;
    }

    setIsSearchingSkus(true);

    const timer = setTimeout(async () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      const controller = typeof window !== 'undefined' && window.AbortController ? new window.AbortController() : null;
      abortControllerRef.current = controller;

      try {
        const data = await getEnrichedItems(
          { q: trimmed, limit: 8 },
          { signal: controller.signal }
        );
        const items = data?.items || [];
        // Cache up to 60 queries
        if (skuCacheRef.current.size > 60) {
          const firstKey = skuCacheRef.current.keys().next().value;
          skuCacheRef.current.delete(firstKey);
        }
        skuCacheRef.current.set(cacheKey, items);
        setSkuResults(items);
      } catch (err) {
        if (err.name !== 'AbortError') {
          console.error('[CommandPalette] SKU search error:', err);
          setSkuResults([]);
        }
      } finally {
        setIsSearchingSkus(false);
      }
    }, 250);

    return () => {
      clearTimeout(timer);
    };
  }, [query, isOpen]);

  // Map dynamic SKU results into result items
  const formattedSkuItems = useMemo(() => {
    return skuResults.map(item => ({
      id: `sku-${item.id}`,
      type: 'sku',
      category: 'Inventory & SKUs',
      title: item.item_name || 'Unnamed Item',
      subtitle: item.sku ? `SKU: ${item.sku}` : (item.category || 'Inventory Item'),
      badge: item.sku,
      status: item.status,
      price: item.current_list_price != null ? fmtCurrency(item.current_list_price) : (item.actual_sell_price != null ? fmtCurrency(item.actual_sell_price) : null),
      icon: Box,
      action: () => {
        if (onNavigate) onNavigate('inventory');
        if (inventoryContext?.setSearch) {
          inventoryContext.setSearch(item.sku || item.item_name || '');
        }
      }
    }));
  }, [skuResults, onNavigate, inventoryContext]);

  // Combined flat results array for arrow key navigation
  const flatResults = useMemo(() => {
    return [...filteredStaticActions, ...formattedSkuItems];
  }, [filteredStaticActions, formattedSkuItems]);

  // Reset selected index when results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [query, flatResults.length]);

  // Focus management & keyboard trapping
  useEffect(() => {
    if (isOpen) {
      previousFocusRef.current = document.activeElement;
      setQuery('');
      setSelectedIndex(0);
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    } else {
      if (previousFocusRef.current && typeof previousFocusRef.current.focus === 'function') {
        previousFocusRef.current.focus();
      }
    }
  }, [isOpen]);

  // Scroll active item into view
  useEffect(() => {
    if (!resultsContainerRef.current) return;
    const selectedEl = resultsContainerRef.current.querySelector('[data-selected="true"]');
    if (selectedEl && typeof selectedEl.scrollIntoView === 'function') {
      selectedEl.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  // Execute an item action and close palette
  const executeItem = useCallback((item) => {
    if (!item) return;
    handleClose();
    try {
      item.action();
    } catch (e) {
      console.error('[CommandPalette] failed to execute item action:', e);
    }
  }, [handleClose]);

  // Key navigation handler inside modal
  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      handleClose();
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (flatResults.length > 0) {
        setSelectedIndex(prev => (prev + 1) % flatResults.length);
      }
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (flatResults.length > 0) {
        setSelectedIndex(prev => (prev - 1 + flatResults.length) % flatResults.length);
      }
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      if (flatResults[selectedIndex]) {
        executeItem(flatResults[selectedIndex]);
      }
      return;
    }

    // Focus trap on Tab
    if (e.key === 'Tab') {
      e.preventDefault();
      inputRef.current?.focus();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-start sm:items-center justify-center p-0 sm:p-4 overflow-y-auto animate-in fade-in duration-150"
      onClick={handleClose}
      role="presentation"
    >
      {/* Modal Dialog Card */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Global Command Palette"
        id="global-command-palette"
        onClick={e => e.stopPropagation()}
        onKeyDown={handleKeyDown}
        className="w-full h-full sm:h-auto sm:max-h-[85vh] sm:max-w-2xl bg-slate-900 border-0 sm:border border-slate-700/80 sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden text-slate-200"
      >
        {/* Search Input Bar */}
        <div className="relative flex items-center px-4 py-3.5 border-b border-slate-800 bg-slate-950/60 flex-shrink-0">
          <Search className="w-5 h-5 text-amber-400/90 flex-shrink-0 mr-3" />
          <input
            ref={inputRef}
            type="text"
            id="command-palette-input"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Type a command, route, tool, or search SKU..."
            className="w-full bg-transparent text-slate-100 placeholder-slate-500 text-sm sm:text-base font-medium outline-none focus:outline-none pr-16"
            autoComplete="off"
            spellCheck="false"
          />

          <div className="flex items-center gap-1.5 flex-shrink-0">
            <kbd className="hidden sm:inline-flex items-center justify-center px-2 py-0.5 text-[10px] font-mono font-bold text-slate-400 bg-slate-800/90 border border-slate-700/80 rounded-md">
              ESC
            </kbd>
            <button
              type="button"
              id="command-palette-close-btn"
              onClick={handleClose}
              title="Close (Escape)"
              className="p-1 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Results Container */}
        <div
          ref={resultsContainerRef}
          id="command-palette-results"
          className="flex-1 overflow-y-auto max-h-[calc(100vh-140px)] sm:max-h-[460px] p-2 space-y-1"
        >
          {/* Loading remote SKU indicator */}
          {isSearchingSkus && (
            <div className="flex items-center gap-2 px-3 py-2 text-xs font-semibold text-amber-400/90 bg-amber-500/10 rounded-lg border border-amber-500/20 mb-1">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>Searching inventory SKUs...</span>
            </div>
          )}

          {/* Empty State */}
          {flatResults.length === 0 && !isSearchingSkus && (
            <div className="px-6 py-12 text-center text-slate-400">
              <Search className="w-8 h-8 mx-auto mb-2 text-slate-600" />
              <p className="text-sm font-semibold text-slate-300">
                No results found {query.trim() ? `for "${query.trim()}"` : ''}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Try searching for standard routes, tools, SKUs, or item titles.
              </p>
            </div>
          )}

          {/* Render Items */}
          {flatResults.map((item, index) => {
            const isSelected = index === selectedIndex;
            const Icon = item.icon || Tag;

            // Show Category Header if first item of category
            const prevItem = flatResults[index - 1];
            const isNewCategory = !prevItem || prevItem.category !== item.category;

            return (
              <React.Fragment key={item.id}>
                {isNewCategory && (
                  <div className="px-3 pt-2.5 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    {item.category}
                  </div>
                )}
                <div
                  role="option"
                  aria-selected={isSelected}
                  data-selected={isSelected ? 'true' : 'false'}
                  id={`palette-item-${index}`}
                  onClick={() => executeItem(item)}
                  onMouseEnter={() => setSelectedIndex(index)}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-left cursor-pointer transition-colors duration-100 ${
                    isSelected
                      ? 'bg-amber-500/15 border-l-2 border-amber-400 text-slate-100 shadow-sm'
                      : 'text-slate-300 hover:bg-slate-800/60 border-l-2 border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                        isSelected
                          ? 'bg-amber-500/20 text-amber-400'
                          : 'bg-slate-800/80 text-slate-400'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-sm font-semibold truncate ${isSelected ? 'text-amber-200' : 'text-slate-200'}`}>
                          {item.title}
                        </span>

                        {item.badge && (
                          <span className="px-1.5 py-0.5 text-[10px] font-mono font-bold bg-amber-500/20 border border-amber-500/30 text-amber-300 rounded">
                            {item.badge}
                          </span>
                        )}

                        {item.status && (
                          <span className={`px-1.5 py-0.2 text-[10px] font-medium rounded ${
                            item.status === 'Listed'
                              ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                              : item.status === 'Sold'
                              ? 'bg-blue-500/15 text-blue-400 border border-blue-500/30'
                              : 'bg-slate-800 text-slate-400 border border-slate-700'
                          }`}>
                            {item.status}
                          </span>
                        )}
                      </div>

                      {item.subtitle && (
                        <p className="text-xs text-slate-400 truncate mt-0.5">
                          {item.subtitle}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 ml-3 flex-shrink-0">
                    {item.price && (
                      <span className="text-xs font-mono font-bold text-slate-300">
                        {item.price}
                      </span>
                    )}

                    {item.type === 'external' ? (
                      <ExternalLink className="w-3.5 h-3.5 text-slate-500" />
                    ) : isSelected ? (
                      <CornerDownLeft className="w-3.5 h-3.5 text-amber-400" />
                    ) : null}
                  </div>
                </div>
              </React.Fragment>
            );
          })}
        </div>

        {/* Modal Footer Shortcuts */}
        <div className="hidden sm:flex items-center justify-between px-4 py-2 bg-slate-950/80 border-t border-slate-800/80 text-[11px] text-slate-500 flex-shrink-0">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <kbd className="px-1 py-0.5 bg-slate-800 rounded font-mono text-slate-400 text-[10px]">↑</kbd>
              <kbd className="px-1 py-0.5 bg-slate-800 rounded font-mono text-slate-400 text-[10px]">↓</kbd>
              <span>to navigate</span>
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-slate-800 rounded font-mono text-slate-400 text-[10px]">↵</kbd>
              <span>to select</span>
            </span>
          </div>

          <div className="flex items-center gap-1 font-mono text-[10px] text-slate-500">
            <span>Outpost Command Palette</span>
          </div>
        </div>
      </div>
    </div>
  );
}
