import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Backpack, CheckCircle2, Circle, Plus, Trash2, RefreshCw,
  Luggage, ShieldAlert, Sparkles, Filter, ChevronDown, ChevronUp,
  Search, Info, CheckSquare, Square, AlertCircle, ShoppingBag,
  Layers, Lock, Download, Weight, Compass, ArrowRight, Scale, Settings
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useSettings } from '../../context/SettingsContext';
import { getApiUrl } from '../../utils/api';
import { formatWeight } from '../Formatters';

const CATEGORIES = [
  { id: 'clothing', label: 'Thermal Clothing & Layers', icon: '🧥', color: 'amber' },
  { id: 'footwear', label: 'Footwear & Snow Traction', icon: '🥾', color: 'emerald' },
  { id: 'gear', label: 'Winter Gear & Daypacks', icon: '🎒', color: 'sky' },
  { id: 'electronics', label: 'Electronics & Adapters', icon: '⚡', color: 'purple' },
  { id: 'documents', label: 'Travel Documents & Cash', icon: '📄', color: 'rose' },
  { id: 'toiletries', label: 'Winter Toiletries & First Aid', icon: '🧴', color: 'teal' },
  { id: 'gifts', label: 'Market Gifts & Souvenirs', icon: '🎁', color: 'yellow' }
];

const BAG_TYPES = [
  { id: 'checked', label: 'Checked Bag', icon: '🧳', maxKg: 23.0 },
  { id: 'carryon', label: 'Cabin Carry-On', icon: '💼', maxKg: 8.0 },
  { id: 'personal', label: 'Personal Daypack', icon: '🎒', maxKg: 5.0 }
];

const LOCAL_STORAGE_KEY = 'wayfinder_offline_packing_v1';

export function PackingManager() {
  const { isAuthenticated, user, setIsAuthModalOpen } = useAuth();
  const { settings, updateSettings, openSettings } = useSettings();
  const isLbs = (settings?.weight || 'lbs') === 'lbs';
  
  const [items, setItems] = useState([]);
  const [backendStats, setBackendStats] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState('all'); // all, open, packed
  const [bagFilter, setBagFilter] = useState('all');       // all, checked, carryon, personal
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedCategories, setExpandedCategories] = useState({
    clothing: true,
    footwear: true,
    gear: true,
    electronics: true,
    documents: true,
    toiletries: true,
    gifts: true
  });

  // New item modal / form state
  const [isAddingItem, setIsAddingItem] = useState(false);
  const [newItemName, setNewItemName] = useState('');
  const [newItemCategory, setNewItemCategory] = useState('clothing');
  const [newItemBag, setNewItemBag] = useState('checked');
  const [newItemQuantity, setNewItemQuantity] = useState(1);
  const [newItemWeight, setNewItemWeight] = useState(150);
  const [newItemNotes, setNewItemNotes] = useState('');

  // Fetch items from backend if authenticated, or read from localStorage
  const loadItems = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    if (isAuthenticated) {
      try {
        const res = await fetch(getApiUrl('/api/wayfinder/packing?journey_id=poland-christmas-2026'), {
          credentials: 'include'
        });
        if (res.ok) {
          const data = await res.json();
          setItems(data.items || []);
          setBackendStats(data.stats || null);
        } else {
          throw new Error('Failed to load packing checklist');
        }
      } catch (err) {
        console.error('Packing fetch error:', err);
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
    } else {
      // Local fallback for guest travelers
      try {
        const local = localStorage.getItem(LOCAL_STORAGE_KEY);
        if (local) {
          setItems(JSON.parse(local));
        } else {
          setItems([]);
        }
      } catch (e) {
        setItems([]);
      }
      setIsLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  // Persist locally for guests
  const updateLocalItems = (newItems) => {
    setItems(newItems);
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(newItems));
    } catch (e) {}
  };

  // 1-Click Load Poland Winter 2026 Preset
  const handleApplyPreset = async () => {
    if (isAuthenticated) {
      setIsSaving(true);
      try {
        const res = await fetch(getApiUrl('/api/wayfinder/packing'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            journey_id: 'poland-christmas-2026',
            action: 'apply_preset'
          })
        });
        if (res.ok) {
          const data = await res.json();
          setItems(data.items || []);
          setBackendStats(data.stats || null);
        } else {
          throw new Error('Failed to load preset');
        }
      } catch (err) {
        alert(err.message);
      } finally {
        setIsSaving(false);
      }
    } else {
      // Load sample preset locally
      setIsSaving(true);
      try {
        // Fetch preset from API endpoint directly (it doesn't mutate D1 if unauthenticated, or we load client preset)
        const res = await fetch(getApiUrl('/api/wayfinder/packing?journey_id=poland-christmas-2026'));
        // If not authenticated, we can trigger auth or seed local storage
        setIsAuthModalOpen(true);
      } finally {
        setIsSaving(false);
      }
    }
  };

  // Toggle item packed state
  const handleTogglePacked = async (item) => {
    const updatedStatus = !item.is_packed;
    const optimistic = items.map(i => i.id === item.id ? { ...i, is_packed: updatedStatus } : i);
    setItems(optimistic);

    if (isAuthenticated) {
      try {
        await fetch(getApiUrl(`/api/wayfinder/packing/${item.id}`), {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ is_packed: updatedStatus })
        });
      } catch (err) {
        console.error('Failed to toggle packed status:', err);
      }
    } else {
      updateLocalItems(optimistic);
    }
  };

  // Update item quantity
  const handleUpdateQuantity = async (item, delta) => {
    const newQty = Math.max(1, (item.quantity || 1) + delta);
    const optimistic = items.map(i => i.id === item.id ? { ...i, quantity: newQty } : i);
    setItems(optimistic);

    if (isAuthenticated) {
      try {
        await fetch(getApiUrl(`/api/wayfinder/packing/${item.id}`), {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ quantity: newQty })
        });
      } catch (err) {
        console.error('Failed to update quantity:', err);
      }
    } else {
      updateLocalItems(optimistic);
    }
  };

  // Delete item
  const handleDeleteItem = async (itemId) => {
    const optimistic = items.filter(i => i.id !== itemId);
    setItems(optimistic);

    if (isAuthenticated) {
      try {
        await fetch(getApiUrl(`/api/wayfinder/packing/${itemId}`), {
          method: 'DELETE',
          credentials: 'include'
        });
      } catch (err) {
        console.error('Failed to delete item:', err);
      }
    } else {
      updateLocalItems(optimistic);
    }
  };

  // Toggle all in category
  const handleToggleCategory = async (catId, currentAllPacked) => {
    const targetState = !currentAllPacked;
    const optimistic = items.map(i => i.category === catId ? { ...i, is_packed: targetState } : i);
    setItems(optimistic);

    if (isAuthenticated) {
      try {
        await fetch(getApiUrl('/api/wayfinder/packing'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            journey_id: 'poland-christmas-2026',
            action: 'toggle_all',
            category: catId,
            is_packed: targetState
          })
        });
      } catch (err) {
        console.error('Failed to bulk toggle category:', err);
      }
    } else {
      updateLocalItems(optimistic);
    }
  };

  // Add custom item
  const handleCreateItem = async (e) => {
    e.preventDefault();
    if (!newItemName.trim()) return;

    const parsedInputWeight = parseFloat(newItemWeight) || 0;
    const computedGrams = isLbs 
      ? Math.round(parsedInputWeight * 28.3495) // input in oz converted to grams
      : Math.max(0, Math.round(parsedInputWeight));

    const newItemPayload = {
      journey_id: 'poland-christmas-2026',
      name: newItemName.trim(),
      category: newItemCategory,
      bag_type: newItemBag,
      quantity: Math.max(1, parseInt(newItemQuantity, 10) || 1),
      weight_grams: computedGrams,
      notes: newItemNotes.trim()
    };

    if (isAuthenticated) {
      setIsSaving(true);
      try {
        const res = await fetch(getApiUrl('/api/wayfinder/packing'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(newItemPayload)
        });
        if (res.ok) {
          const data = await res.json();
          setItems(prev => [...prev, data.item]);
          setIsAddingItem(false);
          setNewItemName('');
          setNewItemNotes('');
        }
      } catch (err) {
        alert(err.message);
      } finally {
        setIsSaving(false);
      }
    } else {
      const offlineItem = {
        id: 'local_' + Date.now(),
        ...newItemPayload,
        is_packed: false
      };
      updateLocalItems([...items, offlineItem]);
      setIsAddingItem(false);
      setNewItemName('');
      setNewItemNotes('');
    }
  };

  // Clear all packed items
  const handleClearPacked = async () => {
    if (!confirm('Remove all checked/packed items from your checklist?')) return;

    const optimistic = items.filter(i => !i.is_packed);
    setItems(optimistic);

    if (isAuthenticated) {
      try {
        await fetch(getApiUrl('/api/wayfinder/packing'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            journey_id: 'poland-christmas-2026',
            action: 'clear_packed'
          })
        });
      } catch (err) {
        console.error('Failed to clear packed:', err);
      }
    } else {
      updateLocalItems(optimistic);
    }
  };

  // Compute live client-side telemetry stats
  const stats = useMemo(() => {
    let totalItems = 0;
    let packedItems = 0;
    let totalWeightG = 0;
    let checkedWeightG = 0;
    let carryonWeightG = 0;
    let personalWeightG = 0;

    const byCat = {};

    for (const item of items) {
      const qty = Math.max(1, parseInt(item.quantity, 10) || 1);
      const wt = Math.max(0, parseInt(item.weight_grams, 10) || 0) * qty;
      const isPk = !!item.is_packed;

      totalItems += qty;
      if (isPk) packedItems += qty;

      totalWeightG += wt;
      if (item.bag_type === 'checked') checkedWeightG += wt;
      else if (item.bag_type === 'carryon') carryonWeightG += wt;
      else if (item.bag_type === 'personal') personalWeightG += wt;
      else checkedWeightG += wt;

      const c = item.category || 'other';
      if (!byCat[c]) byCat[c] = { total: 0, packed: 0, weightG: 0 };
      byCat[c].total += qty;
      if (isPk) byCat[c].packed += qty;
      byCat[c].weightG += wt;
    }

    const pct = totalItems > 0 ? Math.round((packedItems / totalItems) * 100) : 0;
    const checkedLimit = isLbs ? 50.7 : 23.0;
    const carryonLimit = isLbs ? 17.6 : 8.0;
    const checkedKg = Math.round((checkedWeightG / 1000) * 100) / 100;
    const carryonKg = Math.round((carryonWeightG / 1000) * 100) / 100;
    const totalKg = Math.round((totalWeightG / 1000) * 100) / 100;

    const checkedVal = isLbs ? Math.round((checkedWeightG * 0.00220462) * 10) / 10 : checkedKg;
    const carryonVal = isLbs ? Math.round((carryonWeightG * 0.00220462) * 10) / 10 : carryonKg;
    const totalVal = isLbs ? Math.round((totalWeightG * 0.00220462) * 10) / 10 : totalKg;
    const checkedRemaining = Math.max(0, Math.round((checkedLimit - checkedVal) * 10) / 10);
    const unitLabel = isLbs ? 'lbs' : 'kg';

    return {
      totalItems,
      packedItems,
      pct,
      checkedWeightG,
      carryonWeightG,
      checkedKg,
      carryonKg,
      totalKg,
      checkedVal,
      carryonVal,
      totalVal,
      checkedLimit,
      carryonLimit,
      checkedRemaining,
      unitLabel,
      isOverChecked: checkedVal > checkedLimit,
      isNearChecked: checkedVal > (checkedLimit * 0.85),
      isOverCarryon: carryonVal > carryonLimit,
      byCat
    };
  }, [items, isLbs]);

  // Filter items
  const filteredItems = useMemo(() => {
    return items.filter(item => {
      // Status filter
      if (statusFilter === 'open' && item.is_packed) return false;
      if (statusFilter === 'packed' && !item.is_packed) return false;

      // Bag filter
      if (bagFilter !== 'all' && item.bag_type !== bagFilter) return false;

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = (item.name || '').toLowerCase().includes(q);
        const matchNotes = (item.notes || '').toLowerCase().includes(q);
        if (!matchName && !matchNotes) return false;
      }

      return true;
    });
  }, [items, statusFilter, bagFilter, searchQuery]);

  // Group filtered items by category
  const groupedItems = useMemo(() => {
    const groups = {};
    for (const cat of CATEGORIES) {
      groups[cat.id] = [];
    }
    for (const item of filteredItems) {
      const catId = item.category || 'clothing';
      if (!groups[catId]) groups[catId] = [];
      groups[catId].push(item);
    }
    return groups;
  }, [filteredItems]);

  const toggleCategoryExpand = (catId) => {
    setExpandedCategories(prev => ({ ...prev, [catId]: !prev[catId] }));
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Top Banner / Auth Sync Alert */}
      {!isAuthenticated && (
        <div className="p-4 rounded-2xl bg-gradient-to-r from-amber-500/15 via-slate-900 to-sky-500/15 border border-amber-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-lg">
          <div className="flex items-center space-x-3">
            <Sparkles className="w-5 h-5 text-amber-400 shrink-0" />
            <p className="text-xs sm:text-sm text-slate-200">
              <span className="font-bold text-amber-300">Offline Checklist Active:</span> Items are saved in your local browser session. Sign in to sync your winter gear and luggage weight across devices.
            </p>
          </div>
          <button
            onClick={() => setIsAuthModalOpen(true)}
            className="px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black shrink-0 transition-colors shadow-md"
          >
            Sign In to Sync
          </button>
        </div>
      )}

      {/* Luggage Weight Budgeting & Progress Header Card */}
      <div className="glass-panel p-5 sm:p-6 rounded-3xl border border-white/10 bg-gradient-to-br from-wf-navy-mid/95 via-slate-900 to-slate-950 shadow-2xl space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-white/10 pb-5">
          <div>
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-300 shadow-lg">
                <Backpack className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center space-x-2">
                  <span>Winter Expedition Packing & Weight Budget</span>
                </h2>
                <p className="text-xs text-slate-300 mt-0.5">
                  Pre-configured for sub-zero Polish winter weather, holiday markets, and international airline baggage limits
                </p>
              </div>
            </div>
          </div>

          {/* Quick Action Buttons */}
          <div className="flex items-center space-x-2 shrink-0 flex-wrap gap-y-2">
            {/* Quick Unit Switcher & Settings Shortcut */}
            <div className="flex items-center bg-slate-950/80 rounded-xl border border-white/10 p-0.5 shadow-sm">
              <button
                type="button"
                onClick={() => updateSettings({ weight: 'lbs' })}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${isLbs ? 'bg-amber-500 text-slate-950 shadow' : 'text-slate-400 hover:text-white'}`}
                title="Display weights in pounds and ounces"
              >
                lbs / oz
              </button>
              <button
                type="button"
                onClick={() => updateSettings({ weight: 'kg' })}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${!isLbs ? 'bg-amber-500 text-slate-950 shadow' : 'text-slate-400 hover:text-white'}`}
                title="Display weights in kilograms and grams"
              >
                kg / g
              </button>
              <button
                type="button"
                onClick={openSettings}
                className="p-1.5 ml-0.5 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                title="Open Travel Preferences & Unit Settings"
              >
                <Settings className="w-3.5 h-3.5" />
              </button>
            </div>

            <button
              onClick={handleApplyPreset}
              disabled={isSaving}
              className="px-3.5 py-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/40 text-amber-300 hover:text-white text-xs font-bold transition-all flex items-center space-x-1.5 shadow-md active:scale-95 disabled:opacity-50"
              title="Loads the 37-item curated Poland Winter gear checklist"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSaving ? 'animate-spin' : ''}`} />
              <span>{items.length === 0 ? 'Load Winter 2026 Preset' : 'Append Winter Preset'}</span>
            </button>

            <button
              onClick={() => setIsAddingItem(!isAddingItem)}
              className="px-3.5 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-black transition-all flex items-center space-x-1.5 shadow-md active:scale-95"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Custom Item</span>
            </button>

            {stats.packedItems > 0 && (
              <button
                onClick={handleClearPacked}
                className="px-3 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-300 text-xs font-semibold transition-colors flex items-center space-x-1"
                title="Remove packed items from checklist"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Clear Packed ({stats.packedItems})</span>
              </button>
            )}
          </div>
        </div>

        {/* Dual Baggage Telemetry Meters (Checked vs Cabin) */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Checked Baggage Budget */}
          <div className="p-4 rounded-2xl bg-slate-950/80 border border-amber-500/30 relative overflow-hidden shadow-inner flex flex-col justify-between">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center space-x-2">
                <Luggage className="w-4 h-4 text-amber-400" />
                <span className="text-xs font-bold uppercase tracking-wider text-slate-300">Checked Suitcase</span>
              </div>
              <span className={`text-xs font-black px-2 py-0.5 rounded-full ${stats.isOverChecked ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40' : stats.isNearChecked ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40' : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'}`}>
                {stats.checkedVal} {stats.unitLabel} / {stats.checkedLimit} {stats.unitLabel}
              </span>
            </div>

            {/* Progress Bar */}
            <div className="w-full bg-slate-800 rounded-full h-2.5 overflow-hidden my-2 border border-white/5">
              <div 
                className={`h-full transition-all duration-500 rounded-full ${stats.isOverChecked ? 'bg-rose-500' : stats.isNearChecked ? 'bg-amber-500' : 'bg-emerald-400'}`}
                style={{ width: `${Math.min(100, Math.round((stats.checkedVal / stats.checkedLimit) * 100))}%` }}
              />
            </div>

            <p className="text-[11px] text-slate-400 flex items-center justify-between">
              <span>{stats.checkedRemaining > 0 ? `${stats.checkedRemaining} ${stats.unitLabel} remaining buffer` : `⚠️ Exceeds ${stats.checkedLimit} ${stats.unitLabel} airline limit`}</span>
              <span className="text-amber-300 font-semibold">{Math.round((stats.checkedVal / stats.checkedLimit) * 100)}% allowance</span>
            </p>
          </div>

          {/* Cabin Carry-On Budget */}
          <div className="p-4 rounded-2xl bg-slate-950/80 border border-sky-500/30 relative overflow-hidden shadow-inner flex flex-col justify-between">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center space-x-2">
                <ShoppingBag className="w-4 h-4 text-sky-400" />
                <span className="text-xs font-bold uppercase tracking-wider text-slate-300">Cabin Carry-On</span>
              </div>
              <span className={`text-xs font-black px-2 py-0.5 rounded-full ${stats.isOverCarryon ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40' : 'bg-sky-500/20 text-sky-300 border border-sky-500/40'}`}>
                {stats.carryonVal} {stats.unitLabel} / {stats.carryonLimit} {stats.unitLabel}
              </span>
            </div>

            {/* Progress Bar */}
            <div className="w-full bg-slate-800 rounded-full h-2.5 overflow-hidden my-2 border border-white/5">
              <div 
                className={`h-full transition-all duration-500 rounded-full ${stats.isOverCarryon ? 'bg-rose-500' : 'bg-sky-400'}`}
                style={{ width: `${Math.min(100, Math.round((stats.carryonVal / stats.carryonLimit) * 100))}%` }}
              />
            </div>

            <p className="text-[11px] text-slate-400 flex items-center justify-between">
              <span>Lithium batteries & delicate baubles</span>
              <span className="text-sky-300 font-semibold">{Math.round((stats.carryonVal / stats.carryonLimit) * 100)}% allowance</span>
            </p>
          </div>

          {/* Overall Packing Readiness */}
          <div className="p-4 rounded-2xl bg-slate-950/80 border border-emerald-500/30 relative overflow-hidden shadow-inner flex flex-col justify-between md:col-span-2 lg:col-span-1">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center space-x-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span className="text-xs font-bold uppercase tracking-wider text-slate-300">Packing Readiness</span>
              </div>
              <span className="text-xs font-black px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                {stats.packedItems} / {stats.totalItems} Packed
              </span>
            </div>

            {/* Progress Bar */}
            <div className="w-full bg-slate-800 rounded-full h-2.5 overflow-hidden my-2 border border-white/5">
              <div 
                className="h-full transition-all duration-500 rounded-full bg-gradient-to-r from-emerald-500 to-emerald-300"
                style={{ width: `${stats.pct}%` }}
              />
            </div>

            <p className="text-[11px] text-slate-400 flex items-center justify-between">
              <span>{stats.pct === 100 ? '🎉 Ready for Poland!' : `${stats.totalItems - stats.packedItems} items left to pack`}</span>
              <span className="text-emerald-400 font-bold">{stats.pct}% Complete</span>
            </p>
          </div>
        </div>

        {/* Add Item Modal / Inline Drawer */}
        {isAddingItem && (
          <form onSubmit={handleCreateItem} className="p-4 sm:p-5 rounded-2xl bg-slate-950 border border-sky-400/40 space-y-4 animate-scale-up">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h3 className="text-sm font-bold text-white flex items-center space-x-2">
                <Plus className="w-4 h-4 text-sky-400" />
                <span>Add Custom Item to Checklist</span>
              </h3>
              <button 
                type="button" 
                onClick={() => setIsAddingItem(false)}
                className="text-slate-400 hover:text-white text-xs font-bold px-2 py-1"
              >
                Cancel
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {/* Item Name */}
              <div className="sm:col-span-2">
                <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wider block mb-1">
                  Item Description *
                </label>
                <input
                  type="text"
                  placeholder="e.g. Polish Phrasebook or Extra Wool Scarf"
                  value={newItemName}
                  onChange={(e) => setNewItemName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-white/10 text-white text-xs focus:outline-none focus:border-sky-400"
                  required
                  autoFocus
                />
              </div>

              {/* Category */}
              <div>
                <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wider block mb-1">
                  Category
                </label>
                <select
                  value={newItemCategory}
                  onChange={(e) => setNewItemCategory(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-white/10 text-white text-xs focus:outline-none focus:border-sky-400"
                >
                  {CATEGORIES.map(c => (
                    <option key={c.id} value={c.id}>{c.icon} {c.label}</option>
                  ))}
                </select>
              </div>

              {/* Bag Assignment */}
              <div>
                <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wider block mb-1">
                  Baggage Location
                </label>
                <select
                  value={newItemBag}
                  onChange={(e) => setNewItemBag(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-white/10 text-white text-xs focus:outline-none focus:border-sky-400"
                >
                  {BAG_TYPES.map(b => (
                    <option key={b.id} value={b.id}>{b.icon} {b.label}</option>
                  ))}
                </select>
              </div>

              {/* Quantity */}
              <div>
                <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wider block mb-1">
                  Quantity
                </label>
                <input
                  type="number"
                  min="1"
                  max="99"
                  value={newItemQuantity}
                  onChange={(e) => setNewItemQuantity(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-white/10 text-white text-xs focus:outline-none focus:border-sky-400"
                />
              </div>

              {/* Weight in Grams / Ounces */}
              <div>
                <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wider block mb-1">
                  Est. Weight ({isLbs ? 'Ounces each' : 'Grams each'})
                </label>
                <input
                  type="number"
                  min="0"
                  step={isLbs ? "0.1" : "10"}
                  value={newItemWeight}
                  onChange={(e) => setNewItemWeight(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-white/10 text-white text-xs focus:outline-none focus:border-sky-400"
                />
              </div>

              {/* Notes */}
              <div className="sm:col-span-2">
                <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wider block mb-1">
                  Notes / Packing Advice (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Keep in coat pocket for Christmas market walks"
                  value={newItemNotes}
                  onChange={(e) => setNewItemNotes(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-white/10 text-white text-xs focus:outline-none focus:border-sky-400"
                />
              </div>
            </div>

            <div className="flex justify-end space-x-2 pt-2">
              <button
                type="button"
                onClick={() => setIsAddingItem(false)}
                className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-bold"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="px-5 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-black shadow-md disabled:opacity-50"
              >
                Save Item
              </button>
            </div>
          </form>
        )}

        {/* Filter and Search Bar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2">
          {/* Status Pills */}
          <div className="flex items-center space-x-1 bg-slate-950/80 p-1 rounded-xl border border-white/10 text-xs overflow-x-auto">
            <button
              onClick={() => setStatusFilter('all')}
              className={`px-3 py-1.5 rounded-lg font-bold transition-colors whitespace-nowrap ${statusFilter === 'all' ? 'bg-amber-500 text-slate-950 shadow-sm' : 'text-slate-400 hover:text-white'}`}
            >
              All ({items.length})
            </button>
            <button
              onClick={() => setStatusFilter('open')}
              className={`px-3 py-1.5 rounded-lg font-bold transition-colors whitespace-nowrap ${statusFilter === 'open' ? 'bg-amber-500 text-slate-950 shadow-sm' : 'text-slate-400 hover:text-white'}`}
            >
              To Pack ({items.filter(i => !i.is_packed).length})
            </button>
            <button
              onClick={() => setStatusFilter('packed')}
              className={`px-3 py-1.5 rounded-lg font-bold transition-colors whitespace-nowrap ${statusFilter === 'packed' ? 'bg-amber-500 text-slate-950 shadow-sm' : 'text-slate-400 hover:text-white'}`}
            >
              Packed ({items.filter(i => i.is_packed).length})
            </button>
          </div>

          {/* Bag Filter Pills */}
          <div className="flex items-center space-x-1 bg-slate-950/80 p-1 rounded-xl border border-white/10 text-xs overflow-x-auto">
            <button
              onClick={() => setBagFilter('all')}
              className={`px-2.5 py-1.5 rounded-lg font-semibold transition-colors whitespace-nowrap ${bagFilter === 'all' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-white'}`}
            >
              All Bags
            </button>
            <button
              onClick={() => setBagFilter('checked')}
              className={`px-2.5 py-1.5 rounded-lg font-semibold transition-colors whitespace-nowrap flex items-center space-x-1 ${bagFilter === 'checked' ? 'bg-slate-800 text-amber-300' : 'text-slate-400 hover:text-white'}`}
            >
              <span>🧳</span>
              <span>Checked</span>
            </button>
            <button
              onClick={() => setBagFilter('carryon')}
              className={`px-2.5 py-1.5 rounded-lg font-semibold transition-colors whitespace-nowrap flex items-center space-x-1 ${bagFilter === 'carryon' ? 'bg-slate-800 text-sky-300' : 'text-slate-400 hover:text-white'}`}
            >
              <span>💼</span>
              <span>Carry-On</span>
            </button>
            <button
              onClick={() => setBagFilter('personal')}
              className={`px-2.5 py-1.5 rounded-lg font-semibold transition-colors whitespace-nowrap flex items-center space-x-1 ${bagFilter === 'personal' ? 'bg-slate-800 text-emerald-300' : 'text-slate-400 hover:text-white'}`}
            >
              <span>🎒</span>
              <span>Daypack</span>
            </button>
          </div>

          {/* Search Box */}
          <div className="relative min-w-[200px]">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search gear or notes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-slate-950/90 border border-white/10 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-400"
            />
          </div>
        </div>
      </div>

      {/* Empty State */}
      {items.length === 0 && !isLoading && (
        <div className="glass-panel p-8 sm:p-12 text-center rounded-3xl border border-white/10 space-y-4">
          <div className="w-16 h-16 rounded-3xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-300 mx-auto shadow-xl">
            <Backpack className="w-8 h-8" />
          </div>
          <h3 className="text-xl font-bold text-white">Your Winter Packing Checklist is Empty</h3>
          <p className="text-slate-300 text-sm max-w-md mx-auto">
            Load the verified Poland Winter 2026 expedition preset pre-populated with thermal base layers, sub-zero down parkas, ice grips, and plug converters.
          </p>
          <button
            onClick={handleApplyPreset}
            disabled={isSaving}
            className="px-6 py-3 rounded-2xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-sm font-black shadow-xl hover-lift active:scale-95 transition-all inline-flex items-center space-x-2"
          >
            <Sparkles className="w-4 h-4" />
            <span>Load Curated Winter 2026 Preset (37 Items)</span>
          </button>
        </div>
      )}

      {/* Category Accordion Cards */}
      <div className="space-y-4">
        {CATEGORIES.map(cat => {
          const catItems = groupedItems[cat.id] || [];
          if (catItems.length === 0 && (searchQuery || statusFilter !== 'all' || bagFilter !== 'all')) {
            return null; // Hide empty category when filtering
          }

          const isExpanded = !!expandedCategories[cat.id];
          const packedCount = catItems.filter(i => i.is_packed).length;
          const totalCount = catItems.length;
          const allPacked = totalCount > 0 && packedCount === totalCount;
          const catWeightG = catItems.reduce((acc, i) => acc + (Math.max(0, parseInt(i.weight_grams, 10) || 0) * (i.quantity || 1)), 0);
          const catWeightDisplay = isLbs 
            ? `${(catWeightG * 0.00220462).toFixed(1)} lbs` 
            : `${(catWeightG / 1000).toFixed(1)} kg`;

          return (
            <div 
              key={cat.id} 
              className="glass-panel rounded-2xl border border-white/10 overflow-hidden shadow-lg transition-colors bg-slate-900/60"
            >
              {/* Category Header */}
              <div 
                onClick={() => toggleCategoryExpand(cat.id)}
                className="p-4 sm:p-5 flex items-center justify-between cursor-pointer hover:bg-white/5 transition-colors select-none"
              >
                <div className="flex items-center space-x-3">
                  <span className="text-2xl" role="img" aria-label={cat.label}>{cat.icon}</span>
                  <div>
                    <h3 className="text-base sm:text-lg font-bold text-white flex items-center space-x-2">
                      <span>{cat.label}</span>
                      {totalCount > 0 && (
                        <span className={`text-xs px-2 py-0.5 rounded-full font-bold border ${allPacked ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' : 'bg-slate-800 text-slate-300 border-white/10'}`}>
                          {packedCount}/{totalCount} packed
                        </span>
                      )}
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Subtotal: ~{catWeightDisplay}
                    </p>
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  {totalCount > 0 && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleToggleCategory(cat.id, allPacked);
                      }}
                      className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-[11px] font-semibold text-slate-300 hover:text-white border border-white/10 transition-colors"
                      title={allPacked ? 'Uncheck all items in category' : 'Check all items in category'}
                    >
                      {allPacked ? 'Uncheck All' : 'Check All'}
                    </button>
                  )}
                  <button className="text-slate-400 hover:text-white p-1">
                    {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              {/* Items List */}
              {isExpanded && (
                <div className="border-t border-white/10 divide-y divide-white/5">
                  {catItems.length === 0 ? (
                    <div className="p-4 text-xs text-slate-400 text-center italic">
                      No items in this category matching current filters.
                    </div>
                  ) : (
                    catItems.map(item => {
                      const isPk = !!item.is_packed;
                      const qty = item.quantity || 1;
                      const wt = (item.weight_grams || 0) * qty;

                      return (
                        <div 
                          key={item.id}
                          className={`p-3.5 sm:p-4 flex items-start sm:items-center justify-between gap-3 transition-colors ${isPk ? 'bg-emerald-500/5' : 'hover:bg-white/5'}`}
                        >
                          {/* Checkbox and Item Name */}
                          <div className="flex items-start sm:items-center space-x-3 min-w-0 flex-1">
                            <button
                              onClick={() => handleTogglePacked(item)}
                              className={`p-1 rounded-lg transition-transform active:scale-90 ${isPk ? 'text-emerald-400' : 'text-slate-400 hover:text-white'}`}
                              title={isPk ? 'Mark unpacked' : 'Mark packed'}
                            >
                              {isPk ? (
                                <CheckCircle2 className="w-5 h-5 text-emerald-400 fill-emerald-500/20" />
                              ) : (
                                <Circle className="w-5 h-5" />
                              )}
                            </button>

                            <div className="min-w-0 flex-1">
                              <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                                <span className={`text-sm font-medium ${isPk ? 'line-through text-slate-400' : 'text-white'}`}>
                                  {item.name}
                                </span>
                                {qty > 1 && (
                                  <span className="px-1.5 py-0.5 rounded-md bg-slate-800 text-amber-300 border border-amber-500/30 text-[10px] font-bold">
                                    {qty}x
                                  </span>
                                )}
                                <span className="px-2 py-0.5 rounded-md bg-slate-950/80 text-slate-300 border border-white/10 text-[10px] font-semibold">
                                  {item.bag_type === 'checked' ? '🧳 Checked' : item.bag_type === 'carryon' ? '💼 Carry-On' : '🎒 Daypack'}
                                </span>
                                {wt > 0 && (
                                  <span className="text-[10px] text-slate-400 font-mono">
                                    {formatWeight(wt, isLbs ? 'lbs' : 'kg')}
                                  </span>
                                )}
                              </div>
                              {item.notes && (
                                <p className="text-xs text-slate-400 mt-0.5 leading-relaxed line-clamp-1">
                                  {item.notes}
                                </p>
                              )}
                            </div>
                          </div>

                          {/* Stepper & Actions */}
                          <div className="flex items-center space-x-2 shrink-0">
                            {/* Quantity Adjuster */}
                            <div className="flex items-center bg-slate-950/90 rounded-lg border border-white/10 px-1 py-0.5 text-xs">
                              <button
                                onClick={() => handleUpdateQuantity(item, -1)}
                                disabled={qty <= 1}
                                className="px-1.5 text-slate-400 hover:text-white disabled:opacity-30 font-bold"
                                title="Decrease quantity"
                              >
                                -
                              </button>
                              <span className="px-1 font-mono text-slate-200 text-[11px] min-w-[16px] text-center">
                                {qty}
                              </span>
                              <button
                                onClick={() => handleUpdateQuantity(item, 1)}
                                className="px-1.5 text-slate-400 hover:text-white font-bold"
                                title="Increase quantity"
                              >
                                +
                              </button>
                            </div>

                            {/* Delete Button */}
                            <button
                              onClick={() => handleDeleteItem(item.id)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                              title="Delete item"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
