import React, { createContext, useContext, useState, useCallback, useEffect, useMemo } from 'react';
import { getEnrichedItems, getPlatforms, updateItem } from '../utils/auctionApi';
import { getApiUrl } from '../utils/api';
import { getStoredUserSettings, saveUserSettings, DEFAULT_CATEGORIES } from '../utils/userSettings';

const InventoryContext = createContext();

/**
 * InventoryProvider - unified state owner for items, comps, platforms,
 * filters, pagination, sorting, and user settings.
 *
 * Replaces the independent useState/useEffect data fetching that previously
 * lived inside both InventoryView and PricingIntelligenceView.
 */
export function InventoryProvider({ children }) {
  // --- Core Data ---
  const [items, setItems] = useState([]);
  const [platforms, setPlatforms] = useState([]);
  const [pagination, setPagination] = useState({ total: 0, page: 1, pages: 1 });

  // --- Filters ---
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });

  // --- UI State ---
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // --- User Settings (column visibility, widths, category order) ---
  const [userSettings, setUserSettings] = useState(getStoredUserSettings);

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

  // --- Sorted items ---
  const sortedItems = useMemo(() => {
    if (!sortConfig.key) return items;
    return [...items].sort((a, b) => {
      let valA = a[sortConfig.key];
      let valB = b[sortConfig.key];
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
  }, [items, sortConfig]);

  // --- Status counts ---
  const statusCounts = useMemo(() => {
    const counts = {};
    items.forEach(it => {
      counts[it.status] = (counts[it.status] || 0) + 1;
    });
    return counts;
  }, [items]);

  // --- Data Fetching ---
  const fetchItems = useCallback(async (page = 1) => {
    setLoading(true);
    setError('');
    try {
      const params = { page, limit: 50 };
      if (search) params.q = search;
      if (statusFilter) params.status = statusFilter;
      const data = await getEnrichedItems(params);
      setItems(data.items || []);
      setPagination(data.pagination || { total: 0, page: 1, pages: 1 });
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter]);

  const fetchPlatforms = useCallback(async () => {
    try {
      const res = await fetch(getApiUrl('/api/platforms'), { credentials: 'include' });
      if (res.ok) {
        const d = await res.json();
        setPlatforms(d.platforms || []);
      }
    } catch (e) { /* silent */ }
  }, []);

  // Initial data load
  useEffect(() => { fetchPlatforms(); }, []);
  useEffect(() => { fetchItems(1); }, [search, statusFilter]);

  // --- Optimistic Local Updates ---
  const updateItemLocal = useCallback((id, patch) => {
    setItems(prev => prev.map(it => it.id === id ? { ...it, ...patch } : it));
  }, []);

  /**
   * Save a field update to the server and merge the response
   * (which includes recalculated min_sell_price, suggested_list_price, days_on_market).
   */
  const handleFieldSave = useCallback(async (id, patch) => {
    const res = await updateItem(id, patch);
    const merged = { ...patch };
    if (res?.min_sell_price !== undefined) merged.min_sell_price = res.min_sell_price;
    if (res?.suggested_list_price !== undefined) merged.suggested_list_price = res.suggested_list_price;
    if (res?.days_on_market !== undefined) merged.days_on_market = res.days_on_market;
    updateItemLocal(id, merged);
    return res;
  }, [updateItemLocal]);

  const refreshAll = useCallback(() => {
    fetchItems(pagination.page);
  }, [fetchItems, pagination.page]);

  // --- Sort handler ---
  const handleSort = useCallback((key) => {
    if (key === 'actions') return;
    setSortConfig(prev => {
      if (prev.key === key) {
        return { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' };
      }
      return { key, direction: 'asc' };
    });
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
    sortConfig, handleSort,
    // UI
    loading, error,
    // Settings
    userSettings, setUserSettings,
    // Actions
    fetchItems,
    fetchPlatforms,
    refreshAll,
    updateItemLocal,
    handleFieldSave,
  }), [
    items, sortedItems, platforms, platformOptions, categoryOptions,
    pagination, statusCounts,
    search, statusFilter, categoryFilter, sortConfig,
    loading, error,
    userSettings,
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
