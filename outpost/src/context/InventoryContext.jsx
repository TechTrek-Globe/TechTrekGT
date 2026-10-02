import React, { createContext, useContext, useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { getEnrichedItems, getPlatforms, updateItem, getSyncSettings, updateSyncSettings, syncAllEbayItems, getVineScoutCatalog } from '../utils/auctionApi';
import { getApiUrl } from '../utils/api';
import { getStoredUserSettings, DEFAULT_CATEGORIES } from '../utils/userSettings';
import { computeFeeBreakdown } from '../utils/feeEngine';

const InventoryContext = createContext();

/**
 * InventoryProvider - unified state owner for items, comps, platforms,
 * filters, pagination, sorting, and user settings.
 */
export function InventoryProvider({ children }) {
  // --- Core Data ---
  const [items, setItems] = useState([]);
  const [platforms, setPlatforms] = useState([]);
  const [pagination, setPagination] = useState({ total: 0, page: 1, pages: 1 });

  // --- Filters ---
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [listingFormatFilter, setListingFormatFilter] = useState('All');
  const [listingStatusFilter, setListingStatusFilter] = useState('All');

  // --- Sort & Sort Presets ---
  // sortPreset: 'default' | 'margin-desc' | 'margin-asc' | 'price-desc' | 'price-asc' | 'date-newest' | 'date-oldest' | 'custom'
  const [sortPreset, setSortPreset] = useState('default');
  const [sortConfig, setSortConfig] = useState({ key: 'created_at', direction: 'desc' });

  // --- UI State ---
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pendingSaleItem, setPendingSaleItem] = useState(null);

  // --- User Settings (column visibility, widths, category order) ---
  const [userSettings, setUserSettings] = useState(getStoredUserSettings);

  // --- Sync Engine State ---
  const [syncSettings, setSyncSettings] = useState(null);
  const [ebaySyncing, setEbaySyncing] = useState(false);
  const [vscoutSyncing, setVscoutSyncing] = useState(false);

  // Debounce search input (300ms)
  const debounceTimerRef = useRef(null);
  useEffect(() => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, [search]);

  // Listen for settings changes dispatched from SettingsView
  useEffect(() => {
    const handleSettingsUpdate = (e) => {
      if (e.detail) setUserSettings(e.detail);
    };
    window.addEventListener('outpost-settings-updated', handleSettingsUpdate);
    return () => window.removeEventListener('outpost-settings-updated', handleSettingsUpdate);
  }, []);

  // --- Derived platform options ---
  const platformOptions = useMemo(() => {
    const custom = Array.isArray(platforms) ? platforms.map(p => (typeof p === 'string' ? p : (p?.name || ''))).filter(Boolean) : [];
    const defaults = ['eBay', 'Pristine Auction', 'Mercari', 'Whatnot', 'Private Sale', 'Other'];
    return Array.from(new Set([...custom, ...defaults]));
  }, [platforms]);

  // --- Derived category options ---
  const categoryOptions = useMemo(() => {
    const configured = userSettings?.categoryOrder || DEFAULT_CATEGORIES;
    const itemCats = items.map(it => it.category).filter(Boolean);
    return Array.from(new Set([...configured, ...itemCats]));
  }, [userSettings?.categoryOrder, items]);

  // --- Computed item metrics & sorting ---
  //
  // T-10 item 5: `_computedFloor` is GONE. It came from feeEngine's second,
  // divergent break-even formula, so the grid could show a floor the server
  // never persisted - two contradictory floors for one item. The authoritative
  // floor is the server-computed `min_sell_price` (or the user's explicit
  // `floor_price`). The remaining fields are margin/profit previews, labelled
  // as such in the UI, and are not persisted.
  const enrichedItemsWithMetrics = useMemo(() => {
    return items.map(it => {
      const breakdown = computeFeeBreakdown(it);
      return {
        ...it,
        _computedMargin: breakdown.marginPct,
        _computedNetProfit: breakdown.netProfit,
        _computedMarginHealth: breakdown.marginHealth,
      };
    });
  }, [items]);

  // Client-side quick sort for instant visual responsiveness
  const sortedItems = useMemo(() => {
    if (!sortConfig.key) return enrichedItemsWithMetrics;

    return [...enrichedItemsWithMetrics].sort((a, b) => {
      // Default sort preset: prioritize 'Listed' items at the top on initial page load / default view
      if (sortPreset === 'default' || (sortConfig.key === 'created_at' && sortConfig.direction === 'desc')) {
        const isListedA = (a.status || '').toLowerCase() === 'listed' ? 1 : 0;
        const isListedB = (b.status || '').toLowerCase() === 'listed' ? 1 : 0;
        if (isListedA !== isListedB) {
          return isListedB - isListedA;
        }
      }

      let valA;
      let valB;

      if (sortConfig.key === 'margin') {
        valA = a._computedMargin;
        valB = b._computedMargin;
      } else if (sortConfig.key === 'net_profit') {
        valA = a._computedNetProfit;
        valB = b._computedNetProfit;
      } else {
        valA = a[sortConfig.key];
        valB = b[sortConfig.key];
      }

      if (valA == null) valA = '';
      if (valB == null) valB = '';

      if (typeof valA === 'number' && typeof valB === 'number') {
        return sortConfig.direction === 'asc' ? valA - valB : valB - valA;
      }

      const strA = String(valA).toLowerCase();
      const strB = String(valB).toLowerCase();
      if (strA < strB) return sortConfig.direction === 'asc' ? -1 : 1;
      if (strA > strB) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, [enrichedItemsWithMetrics, sortConfig, sortPreset]);

  // --- Status counts ---
  const statusCounts = useMemo(() => {
    const counts = {};
    items.forEach(it => {
      const s = it.status || 'Available';
      counts[s] = (counts[s] || 0) + 1;
    });
    return counts;
  }, [items]);

  // --- Data Fetching ---
  const fetchRequestIdRef = useRef(0);
  const fetchItems = useCallback(async (page = 1) => {
    const reqId = ++fetchRequestIdRef.current;
    setLoading(true);
    setError('');
    try {
      const params = { page, limit: 50 };
      if (debouncedSearch) params.q = debouncedSearch;
      if (statusFilter) params.status = statusFilter;
      if (categoryFilter && categoryFilter !== 'All') params.category = categoryFilter;
      if (listingFormatFilter && listingFormatFilter !== 'All') params.listing_format = listingFormatFilter;
      if (listingStatusFilter && listingStatusFilter !== 'All') params.listing_status = listingStatusFilter;

      // Server sort mapping
      if (sortConfig.key && sortConfig.key !== 'margin' && sortConfig.key !== 'net_profit') {
        params.sort_by = sortConfig.key;
        params.sort_dir = sortConfig.direction;
      }

      const data = await getEnrichedItems(params);
      if (reqId === fetchRequestIdRef.current) {
        setItems(data.items || []);
        setPagination(data.pagination || { total: 0, page: 1, pages: 1 });
      }
    } catch (e) {
      if (reqId === fetchRequestIdRef.current) {
        setError(e.message);
      }
    } finally {
      if (reqId === fetchRequestIdRef.current) {
        setLoading(false);
      }
    }
  }, [debouncedSearch, statusFilter, categoryFilter, listingFormatFilter, listingStatusFilter, sortConfig]);

  const fetchPlatforms = useCallback(async () => {
    try {
      const res = await fetch(getApiUrl('/api/platforms'), { credentials: 'include' });
      if (res.ok) {
        const d = await res.json();
        setPlatforms(d.platforms || []);
      }
    } catch (e) {
      console.warn('[InventoryContext] fetchPlatforms failed:', e);
    }
  }, []);

  // Initial data load
  useEffect(() => {
    let active = true;
    fetchPlatforms();
    getSyncSettings()
      .then(d => {
        if (active) setSyncSettings(d.settings || d);
      })
      .catch(err => {
        console.warn('[InventoryContext] getSyncSettings failed:', err);
      });
    return () => {
      active = false;
    };
  }, [fetchPlatforms]);

  useEffect(() => {
    fetchItems(1);
  }, [debouncedSearch, statusFilter, categoryFilter, listingFormatFilter, listingStatusFilter, sortConfig.key, sortConfig.direction]);

  // --- Sync Engine Handlers ---
  const handleSyncEbay = useCallback(async () => {
    if (ebaySyncing) return;
    setEbaySyncing(true);
    try {
      const res = await syncAllEbayItems();
      const updated = await getSyncSettings();
      setSyncSettings(updated.settings || updated);
      fetchItems(1);
      if (res && res.success === false) {
        throw new Error(res.error || 'eBay sync reported failure');
      }
      return res;
    } catch (e) {
      console.warn('[InventoryContext] eBay auto-sync error:', e);
      try {
        const updated = await getSyncSettings();
        setSyncSettings(updated.settings || updated);
      } catch (_) {}
      throw e;
    } finally {
      setEbaySyncing(false);
    }
  }, [ebaySyncing, fetchItems]);

  const handleSyncVScout = useCallback(async () => {
    if (vscoutSyncing) return;
    setVscoutSyncing(true);
    try {
      await getVineScoutCatalog();
      const updated = await getSyncSettings();
      setSyncSettings(updated.settings || updated);
    } catch (e) {
      console.warn('[InventoryContext] VScout auto-sync error:', e);
    } finally {
      setVscoutSyncing(false);
    }
  }, [vscoutSyncing]);

  // Auto-polling loop - runs app-wide while InventoryProvider is mounted
  const syncIntervalRef = useRef([]);
  useEffect(() => {
    // Clear any previous intervals
    syncIntervalRef.current.forEach(clearInterval);
    syncIntervalRef.current = [];

    if (!syncSettings) return;

    if (syncSettings.ebay_auto_sync) {
      const ms = (syncSettings.ebay_sync_interval_m || 30) * 60 * 1000;
      syncIntervalRef.current.push(setInterval(handleSyncEbay, ms));
    }
    if (syncSettings.vscout_auto_sync) {
      const ms = (syncSettings.vscout_sync_interval_m || 60) * 60 * 1000;
      syncIntervalRef.current.push(setInterval(handleSyncVScout, ms));
    }

    return () => {
      syncIntervalRef.current.forEach(clearInterval);
      syncIntervalRef.current = [];
    };
  }, [syncSettings?.ebay_auto_sync, syncSettings?.ebay_sync_interval_m,
      syncSettings?.vscout_auto_sync, syncSettings?.vscout_sync_interval_m]);

  // --- Optimistic Local Updates ---
  const updateItemLocal = useCallback((id, patch) => {
    setItems(prev => prev.map(it => it.id === id ? { ...it, ...patch } : it));
  }, []);

  /**
   * Save a field update to the server and merge the response
   */
  const handleFieldSave = useCallback(async (id, patch) => {
    const res = await updateItem(id, patch);
    const merged = { ...patch, ...(res?.item || res || {}) };
    updateItemLocal(id, merged);
    return res;
  }, [updateItemLocal]);

  const refreshAll = useCallback(() => {
    fetchItems(pagination.page);
  }, [fetchItems, pagination.page]);

  // --- Sort handler from table column click ---
  const handleSort = useCallback((key) => {
    if (key === 'actions') return;
    setSortPreset('custom');
    setSortConfig(prev => {
      if (prev.key === key) {
        return { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' };
      }
      return { key, direction: 'asc' };
    });
  }, []);

  // --- Sort preset selector handler ---
  const applySortPreset = useCallback((preset) => {
    setSortPreset(preset);
    switch (preset) {
      case 'margin-desc':
        setSortConfig({ key: 'margin', direction: 'desc' });
        break;
      case 'margin-asc':
        setSortConfig({ key: 'margin', direction: 'asc' });
        break;
      case 'price-desc':
        setSortConfig({ key: 'current_list_price', direction: 'desc' });
        break;
      case 'price-asc':
        setSortConfig({ key: 'current_list_price', direction: 'asc' });
        break;
      case 'date-newest':
        setSortConfig({ key: 'created_at', direction: 'desc' });
        break;
      case 'date-oldest':
        setSortConfig({ key: 'created_at', direction: 'asc' });
        break;
      case 'default':
      default:
        setSortConfig({ key: 'created_at', direction: 'desc' });
        break;
    }
  }, []);

  const value = useMemo(() => ({
    // Data
    items,
    setItems,
    sortedItems,
    platforms,
    platformOptions,
    categoryOptions,
    pagination,
    statusCounts,
    // Filters
    search, setSearch,
    statusFilter, setStatusFilter,
    categoryFilter, setCategoryFilter,
    listingFormatFilter, setListingFormatFilter,
    listingStatusFilter, setListingStatusFilter,
    // Sorting
    sortConfig, handleSort,
    sortPreset, applySortPreset,
    // UI
    loading, error,
    pendingSaleItem, setPendingSaleItem,
    // Settings
    userSettings, setUserSettings,
    // Sync Engine
    syncSettings, setSyncSettings,
    ebaySyncing, vscoutSyncing,
    handleSyncEbay, handleSyncVScout,
    // Actions
    fetchItems,
    fetchPlatforms,
    refreshAll,
    updateItemLocal,
    handleFieldSave,
  }), [
    items, sortedItems, platforms, platformOptions, categoryOptions,
    pagination, statusCounts,
    search, statusFilter, categoryFilter, listingFormatFilter, listingStatusFilter,
    sortConfig, sortPreset, applySortPreset,
    loading, error, pendingSaleItem,
    userSettings,
    syncSettings, ebaySyncing, vscoutSyncing, handleSyncEbay, handleSyncVScout,
    fetchItems, fetchPlatforms, refreshAll, updateItemLocal, handleFieldSave, handleSort,
  ]);

  return (
    <InventoryContext.Provider value={value}>
      {children}
    </InventoryContext.Provider>
  );
}

export function useInventory() {
  const ctx = useContext(InventoryContext);
  if (!ctx) throw new Error('useInventory must be used within an InventoryProvider');
  return ctx;
}

