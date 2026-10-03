import React, { useState, useEffect } from 'react';
import { Shield, Users, CheckCircle, Lock, Database, Calendar, AlertTriangle, RefreshCw } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useBudget } from '../context/BudgetContext';
import { apiFetch } from '../utils/api';

function StatusBadge({ status }) {
  const isSuspended = status === 'Suspended' || status === 'Locked';
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${
      isSuspended
        ? 'bg-rose-950/60 text-rose-400 border border-rose-800/50'
        : 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/50'
    }`}>
      {isSuspended
        ? <Lock className="w-2.5 h-2.5" />
        : <CheckCircle className="w-2.5 h-2.5" />
      }
      {status || 'Active'}
    </span>
  );
}

function StatCard({ icon: Icon, label, value, color }) {
  return (
    <div className="flex items-center gap-4 p-4 rounded-2xl bg-slate-900 border border-slate-800/60 shadow-lg">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${color}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-widest">{label}</p>
        <p className="text-2xl font-black text-slate-100 leading-tight">{value}</p>
      </div>
    </div>
  );
}

export function AdminView() {
  const { user } = useAuth();
  const { theme } = useBudget();
  const isLight = theme === 'light';

  const [stats, setStats] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [updatingUserId, setUpdatingUserId] = useState(null);
  const [actionError, setActionError] = useState(null);

  const fetchStats = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await apiFetch('/api/admin/stats');
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || `Request failed (HTTP ${res.status})`);
        setStats(null);
      } else {
        setStats(data);
      }
    } catch (err) {
      setError('Network error - unable to reach admin endpoint.');
      setStats(null);
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleStatus = async (targetUser) => {
    const currentStatus = targetUser.status || 'Active';
    const nextStatus = currentStatus === 'Active' ? 'Suspended' : 'Active';
    const promptMsg = nextStatus === 'Suspended'
      ? `Suspend user account "${targetUser.email}"? This will invalidate their active sessions.`
      : `Reactivate user account "${targetUser.email}"?`;
    if (!window.confirm(promptMsg)) return;

    setUpdatingUserId(targetUser.id);
    setActionError(null);
    try {
      const res = await apiFetch('/api/admin/user-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: targetUser.id, status: nextStatus })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || `Failed to update status (HTTP ${res.status})`);
      }
      await fetchStats();
    } catch (err) {
      setActionError(err.message || 'Failed to update user status.');
    } finally {
      setUpdatingUserId(null);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  const activeCount = stats?.users?.filter(u => (u.status || 'Active') === 'Active').length ?? 0;
  const lockedCount = stats?.users?.filter(u => u.status === 'Locked' || u.status === 'Suspended').length ?? 0;
  const backedUpCount = stats?.users?.filter(u => u.backupCount > 0).length ?? 0;

  const cardBase = isLight
    ? 'bg-white border-slate-200 text-slate-900'
    : 'bg-slate-900 border-slate-800/60 text-slate-100';

  return (
    <div className={`min-h-full w-full px-4 sm:px-6 py-6 space-y-6 ${isLight ? 'text-slate-900' : 'text-slate-100'}`}>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
            <Shield className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <h1 className="text-lg font-black tracking-tight">Admin Dashboard</h1>
            <p className={`text-xs ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
              System-wide user statistics and financial record counts
            </p>
          </div>
        </div>
        <button
          onClick={fetchStats}
          disabled={isLoading}
          aria-label="Refresh admin stats"
          className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors ${
            isLight
              ? 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-700'
              : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-300'
          } disabled:opacity-50`}
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Access guard banner */}
      <div className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-medium border ${
        isLight
          ? 'bg-amber-50 border-amber-200 text-amber-800'
          : 'bg-amber-950/30 border-amber-800/40 text-amber-300'
      }`}>
        <Shield className="w-3.5 h-3.5 flex-shrink-0" />
        <span>Viewing as <strong>{user?.email}</strong> - Admin access granted</span>
      </div>

      {/* Error state */}
      {error && (
        <div className={`flex items-start gap-3 p-4 rounded-2xl border ${
          isLight
            ? 'bg-rose-50 border-rose-200 text-rose-700'
            : 'bg-rose-950/40 border-rose-800/50 text-rose-400'
        }`}>
          <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-sm">Failed to load admin stats</p>
            <p className="text-xs mt-0.5 opacity-80">{error}</p>
          </div>
        </div>
      )}

      {/* Action error */}
      {actionError && (
        <div className={`flex items-start gap-3 p-4 rounded-2xl border ${
          isLight
            ? 'bg-rose-50 border-rose-200 text-rose-700'
            : 'bg-rose-950/40 border-rose-800/50 text-rose-400'
        }`}>
          <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-sm">Action failed</p>
            <p className="text-xs mt-0.5 opacity-80">{actionError}</p>
          </div>
        </div>
      )}

      {/* Loading skeleton */}
      {isLoading && !stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className={`h-20 rounded-2xl animate-pulse ${isLight ? 'bg-slate-200' : 'bg-slate-800'}`} />
          ))}
        </div>
      )}

      {/* Stat cards */}
      {stats && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <StatCard icon={Users}        label="Total Users"   value={stats.totalUsers}   color="bg-blue-500/10 text-blue-400" />
            <StatCard icon={CheckCircle}  label="Active"        value={activeCount}         color="bg-emerald-500/10 text-emerald-400" />
            <StatCard icon={Lock}         label="Locked/Suspended" value={lockedCount}      color="bg-rose-500/10 text-rose-400" />
            <StatCard icon={Database}     label="With Backups"  value={backedUpCount}       color="bg-violet-500/10 text-violet-400" />
          </div>

          {/* User table */}
          <div className={`rounded-2xl border overflow-hidden shadow-lg ${isLight ? 'border-slate-200' : 'border-slate-800/60'}`}>
            <div className={`px-5 py-3.5 border-b flex items-center gap-2 ${
              isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/60 border-slate-800/60'
            }`}>
              <Users className="w-4 h-4 text-slate-400" />
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-widest">All Accounts ({stats.totalUsers})</span>
            </div>

            <div className={`overflow-x-auto ${isLight ? 'bg-white' : 'bg-slate-950'}`}>
              <table className="w-full text-sm">
                <thead>
                  <tr className={`text-[11px] font-semibold uppercase tracking-widest border-b ${
                    isLight ? 'text-slate-500 border-slate-200 bg-slate-50' : 'text-slate-500 border-slate-800/60 bg-slate-900/40'
                  }`}>
                    <th className="text-left px-5 py-3">Name</th>
                    <th className="text-left px-5 py-3">Email</th>
                    <th className="text-left px-4 py-3">Status</th>
                    <th className="text-left px-4 py-3">Actions</th>
                    <th className="text-center px-4 py-3">Backups</th>
                    <th className="text-left px-4 py-3">Last Backup</th>
                    <th className="text-left px-4 py-3">Member Since</th>
                  </tr>
                </thead>
                <tbody className={`divide-y ${isLight ? 'divide-slate-100' : 'divide-slate-800/40'}`}>
                  {stats.users.map((u) => (
                    <tr key={u.id} className={`transition-colors ${
                      isLight ? 'hover:bg-slate-50' : 'hover:bg-slate-900/40'
                    }`}>
                      <td className="px-5 py-3.5">
                        <span className="font-semibold text-sm">{u.name}</span>
                        <p className={`text-[10px] font-mono mt-0.5 ${isLight ? 'text-slate-400' : 'text-slate-600'}`}>
                          {u.id}
                        </p>
                      </td>
                      <td className={`px-5 py-3.5 text-xs font-mono ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
                        {u.email}
                      </td>
                      <td className="px-4 py-3.5">
                        <StatusBadge status={u.status} />
                      </td>
                      <td className="px-4 py-3.5">
                        {u.id === user?.id ? (
                          <span className="text-[11px] text-slate-500 italic">Current User</span>
                        ) : (
                          <button
                            onClick={() => handleToggleStatus(u)}
                            disabled={updatingUserId === u.id}
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors ${
                              (u.status || 'Active') === 'Active'
                                ? (isLight
                                    ? 'bg-rose-50 hover:bg-rose-100 text-rose-700 border-rose-200'
                                    : 'bg-rose-950/40 hover:bg-rose-900/60 text-rose-400 border-rose-800/50')
                                : (isLight
                                    ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-200'
                                    : 'bg-emerald-950/40 hover:bg-emerald-900/60 text-emerald-400 border-emerald-800/50')
                            } disabled:opacity-50`}
                          >
                            {updatingUserId === u.id
                              ? 'Updating...'
                              : (u.status || 'Active') === 'Active'
                                ? 'Suspend'
                                : 'Activate'
                            }
                          </button>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${
                          u.backupCount > 0
                            ? (isLight ? 'bg-emerald-100 text-emerald-700' : 'bg-emerald-950/60 text-emerald-400')
                            : (isLight ? 'bg-slate-100 text-slate-400' : 'bg-slate-800 text-slate-600')
                        }`}>
                          {u.backupCount}
                        </span>
                      </td>
                      <td className={`px-4 py-3.5 text-xs ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                        {u.lastBackupAt
                          ? new Date(u.lastBackupAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                          : <span className="text-slate-600 italic">No backup</span>
                        }
                      </td>
                      <td className={`px-4 py-3.5 text-xs ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3 opacity-50" />
                          {u.createdAt
                            ? new Date(u.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                            : '-'
                          }
                        </span>
                      </td>
                    </tr>
                  ))}
                  {stats.users.length === 0 && (
                    <tr>
                      <td colSpan={7} className={`px-5 py-10 text-center text-sm ${isLight ? 'text-slate-400' : 'text-slate-600'}`}>
                        No user accounts found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
