import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { getApiUrl } from '../utils/api';
import { Users, Package, AlertTriangle, ShieldCheck, CheckCircle2, Lock, ChevronLeft, ChevronRight } from 'lucide-react';

export function AdminView() {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);

  // Fallback check, though App.jsx should protect the route
  const isAdmin = user?.email?.toLowerCase() === (import.meta.env.VITE_ADMIN_EMAIL || 'jgk1865@gmail.com').toLowerCase();

  useEffect(() => {
    let active = true;
    if (!isAdmin) {
      setError('Forbidden: Admin access only.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');

    const fetchStats = async () => {
      try {
        const res = await fetch(getApiUrl(`/api/admin/stats?page=${page}&limit=${limit}`), {
          credentials: 'include'
        });
        const data = await res.json();
        
        if (!res.ok) {
          throw new Error(data.error || 'Failed to fetch admin stats');
        }
        
        if (active) setStats(data);
      } catch (err) {
        if (active) setError(err.message);
      } finally {
        if (active) setLoading(false);
      }
    };

    fetchStats();
    return () => {
      active = false;
    };
  }, [isAdmin, page, limit]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[50vh]">
        <div className="animate-pulse flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-amber-500 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-slate-400 text-sm font-medium">Loading System Stats...</p>
        </div>
      </div>
    );
  }

  if (error || !isAdmin) {
    return (
      <div className="flex-1 p-6">
        <div className="max-w-2xl mx-auto bg-red-500/10 border border-red-500/20 rounded-2xl p-6 flex flex-col items-center justify-center text-center">
          <AlertTriangle className="w-12 h-12 text-red-400 mb-3" />
          <h2 className="text-xl font-bold text-red-300 mb-2">Access Denied</h2>
          <p className="text-slate-400 text-sm">{error || 'You do not have permission to view this page.'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <header className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <div className="p-2 bg-amber-500/20 rounded-xl border border-amber-500/30">
            <ShieldCheck className="w-6 h-6 text-amber-400" />
          </div>
          <h1 className="text-2xl font-black text-slate-100 tracking-tight">Admin Dashboard</h1>
        </div>
        <p className="text-sm text-slate-400 font-medium ml-12">
          System-wide user and inventory overview
        </p>
      </header>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6 flex-shrink-0">
        <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl p-5 flex flex-col justify-between">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-blue-500/20 rounded-lg">
              <Users className="w-5 h-5 text-blue-400" />
            </div>
            <h3 className="text-sm font-semibold text-slate-300">Total Users</h3>
          </div>
          <p className="text-3xl font-black text-slate-100 mt-2">{stats.total_users || 0}</p>
        </div>
        
        <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl p-5 flex flex-col justify-between">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-emerald-500/20 rounded-lg">
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
            </div>
            <h3 className="text-sm font-semibold text-slate-300">Active Accounts</h3>
          </div>
          <p className="text-3xl font-black text-slate-100 mt-2">{stats.active_users || 0}</p>
        </div>
        
        <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl p-5 flex flex-col justify-between">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-red-500/20 rounded-lg">
              <Lock className="w-5 h-5 text-red-400" />
            </div>
            <h3 className="text-sm font-semibold text-slate-300">Locked Accounts</h3>
          </div>
          <p className="text-3xl font-black text-slate-100 mt-2">{stats.locked_users || 0}</p>
        </div>

        <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl p-5 flex flex-col justify-between">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-amber-500/20 rounded-lg">
              <Package className="w-5 h-5 text-amber-400" />
            </div>
            <h3 className="text-sm font-semibold text-slate-300">Total Items Stored</h3>
          </div>
          <p className="text-3xl font-black text-slate-100 mt-2">{stats.total_items || 0}</p>
        </div>
      </div>

      {/* User Table */}
      <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl flex-1 flex flex-col min-h-0 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-800/60 bg-slate-950/40">
          <h2 className="text-base font-bold text-slate-200">User Accounts List</h2>
        </div>
        <div className="overflow-x-auto overflow-y-auto flex-1">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-slate-900/80 sticky top-0 backdrop-blur-sm shadow-sm z-10">
              <tr>
                <th className="px-5 py-3 font-semibold text-slate-400 text-xs uppercase tracking-wider">Email</th>
                <th className="px-5 py-3 font-semibold text-slate-400 text-xs uppercase tracking-wider">Name</th>
                <th className="px-5 py-3 font-semibold text-slate-400 text-xs uppercase tracking-wider">Status</th>
                <th className="px-5 py-3 font-semibold text-slate-400 text-xs uppercase tracking-wider text-right">Items Stored</th>
                <th className="px-5 py-3 font-semibold text-slate-400 text-xs uppercase tracking-wider text-right">Joined</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/40">
              {stats.users?.map((u) => (
                <tr key={u.id} className="hover:bg-slate-800/40 transition-colors">
                  <td className="px-5 py-3 text-slate-300 font-medium">{u.email}</td>
                  <td className="px-5 py-3 text-slate-400">{u.name}</td>
                  <td className="px-5 py-3">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold ${
                      u.status === 'Active' 
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                        : 'bg-red-500/10 text-red-400 border border-red-500/20'
                    }`}>
                      {u.status === 'Active' ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
                      {u.status || 'Active'}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-slate-300 font-bold text-right">{u.item_count || 0}</td>
                  <td className="px-5 py-3 text-slate-500 text-right text-xs">
                    {new Date(u.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
              {(!stats.users || stats.users.length === 0) && (
                <tr>
                  <td colSpan="5" className="px-5 py-8 text-center text-slate-500">No users found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Controls */}
        {stats?.pagination && stats.pagination.pages > 1 && (
          <div className="px-5 py-3 border-t border-slate-800/60 bg-slate-950/40 flex items-center justify-between text-xs text-slate-400">
            <div>
              Showing {((stats.pagination.page - 1) * stats.pagination.limit) + 1} to{' '}
              {Math.min(stats.pagination.page * stats.pagination.limit, stats.pagination.total)} of{' '}
              {stats.pagination.total} users
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={stats.pagination.page <= 1}
                onClick={() => setPage(p => Math.max(1, p - 1))}
                className="px-2.5 py-1 rounded-lg bg-slate-800 text-slate-200 border border-slate-700 disabled:opacity-40 hover:bg-slate-700 transition-all flex items-center gap-1"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                Previous
              </button>
              <span className="font-mono text-slate-300 px-1">
                Page {stats.pagination.page} of {stats.pagination.pages}
              </span>
              <button
                type="button"
                disabled={stats.pagination.page >= stats.pagination.pages}
                onClick={() => setPage(p => Math.min(stats.pagination.pages, p + 1))}
                className="px-2.5 py-1 rounded-lg bg-slate-800 text-slate-200 border border-slate-700 disabled:opacity-40 hover:bg-slate-700 transition-all flex items-center gap-1"
              >
                Next
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
