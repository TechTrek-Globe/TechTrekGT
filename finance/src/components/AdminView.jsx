import React, { useState, useEffect } from 'react';
import {
  Shield,
  Users,
  CheckCircle,
  Lock,
  Database,
  Calendar,
  AlertTriangle,
  RefreshCw,
  Trash2,
  UserMinus,
  Crown,
  Check
} from 'lucide-react';
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
  const [actionSuccess, setActionSuccess] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [updatingUserId, setUpdatingUserId] = useState(null);
  const [deletingUserId, setDeletingUserId] = useState(null);
  const [disconnectingUserId, setDisconnectingUserId] = useState(null);

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
    } catch {
      setError('Network error: unable to reach admin endpoint.');
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
    setActionSuccess(null);
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
      setActionSuccess(`Account status updated to ${nextStatus} for ${targetUser.email}.`);
      await fetchStats();
    } catch (err) {
      setActionError(err.message || 'Failed to update user status.');
    } finally {
      setUpdatingUserId(null);
    }
  };

  const handleDeleteUser = async (targetUser) => {
    const isSelf = targetUser.id === user?.id;
    const confirmPrompt = isSelf
      ? `CRITICAL WARNING: You are about to permanently delete your OWN administrator account (${targetUser.email}).\n\nAll your budgets, backups, shares, and sessions will be deleted immediately, and you will be signed out.\n\nAre you sure you want to proceed?`
      : `Permanently delete user account "${targetUser.email}" (${targetUser.name})?\n\nThis cannot be undone and will permanently remove all their budgets, backups, shares, and invitations across the platform.`;

    if (!window.confirm(confirmPrompt)) return;

    setDeletingUserId(targetUser.id);
    setActionError(null);
    setActionSuccess(null);
    try {
      const res = await apiFetch('/api/admin/user-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: targetUser.id })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || `Failed to delete user account (HTTP ${res.status})`);
      }

      if (data.isSelf || isSelf) {
        window.location.href = '/finance';
        return;
      }

      setActionSuccess(data.message || `Account for ${targetUser.email} has been permanently deleted.`);
      await fetchStats();
    } catch (err) {
      setActionError(err.message || 'Failed to delete user account.');
    } finally {
      setDeletingUserId(null);
    }
  };

  const handleDisconnectUser = async (targetUserId, ledgerId, targetEmail) => {
    if (!window.confirm(`Disconnect "${targetEmail || targetUserId}" from this ledger? They will lose access immediately.`)) return;

    setDisconnectingUserId(targetUserId);
    setActionError(null);
    setActionSuccess(null);
    try {
      const res = await apiFetch('/api/admin/ledger-membership/remove', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ledgerId: ledgerId || user?.id,
          userId: targetUserId
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || `Failed to disconnect user (HTTP ${res.status})`);
      }
      setActionSuccess(data.message || 'User disconnected from ledger.');
      await fetchStats();
    } catch (err) {
      setActionError(err.message || 'Failed to disconnect user.');
    } finally {
      setDisconnectingUserId(null);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  const financeUsers = stats?.financeUsers || stats?.users || [];
  const ledgers = stats?.ledgers || [];

  const activeCount = financeUsers.filter(u => (u.status || 'Active') === 'Active').length;
  const lockedCount = financeUsers.filter(u => u.status === 'Locked' || u.status === 'Suspended').length;
  const backedUpCount = financeUsers.filter(u => u.backupCount > 0).length;

  return (
    <div className={`min-h-full w-full px-4 sm:px-6 py-6 space-y-6 ${isLight ? 'text-slate-900' : 'text-slate-100'}`}>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
            <Shield className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <h1 className="text-lg font-black tracking-tight flex items-center gap-2">
              <span>Admin Dashboard</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 uppercase tracking-widest font-bold">
                Finance OS
              </span>
            </h1>
            <p className={`text-xs ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
              Tenant isolation, user governance, ledger collaboration, and account lifecycle management
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
        <span>Viewing as <strong>{user?.email}</strong> : Admin access granted</span>
      </div>

      {/* Notifications */}
      {actionSuccess && (
        <div className="flex items-start gap-3 p-3.5 rounded-xl bg-emerald-950/40 border border-emerald-800/50 text-emerald-300 text-xs">
          <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
          <p className="font-semibold">{actionSuccess}</p>
        </div>
      )}

      {actionError && (
        <div className="flex items-start gap-3 p-3.5 rounded-xl bg-rose-950/40 border border-rose-800/50 text-rose-300 text-xs">
          <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
          <p className="font-semibold">{actionError}</p>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-3 p-4 rounded-2xl bg-rose-950/40 border border-rose-800/50 text-rose-400 text-xs">
          <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-sm">Failed to load admin stats</p>
            <p className="text-xs mt-0.5 opacity-80">{error}</p>
          </div>
        </div>
      )}

      {/* Stat cards */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard icon={Users} label="Finance Accounts" value={financeUsers.length} color="bg-blue-500/10 text-blue-400" />
          <StatCard icon={CheckCircle} label="Active" value={activeCount} color="bg-emerald-500/10 text-emerald-400" />
          <StatCard icon={Database} label="With Backups" value={backedUpCount} color="bg-violet-500/10 text-violet-400" />
          <StatCard icon={Lock} label="Locked/Suspended" value={lockedCount} color="bg-rose-500/10 text-rose-400" />
        </div>
      )}

      {/* Ledgers & Collaborator Groups Panel */}
      {ledgers.length > 0 && (
        <div className={`rounded-2xl border overflow-hidden shadow-lg ${isLight ? 'border-slate-200 bg-white' : 'border-slate-800/60 bg-slate-900/60'}`}>
          <div className={`px-5 py-3.5 border-b flex items-center justify-between ${
            isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/80 border-slate-800/60'
          }`}>
            <div className="flex items-center gap-2">
              <Database className="w-4 h-4 text-sky-400" />
              <span className="text-xs font-bold uppercase tracking-widest text-slate-300">
                Household Ledgers &amp; Collaborator Groups
              </span>
            </div>
            <span className="text-[11px] text-slate-500">
              {ledgers.length} Active {ledgers.length === 1 ? 'Ledger' : 'Ledgers'}
            </span>
          </div>

          <div className="p-5 space-y-4">
            {ledgers.map(l => (
              <div key={l.id} className="p-4 rounded-xl border border-slate-800/80 bg-slate-950/60 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800/50 pb-2.5">
                  <div className="flex items-center gap-2.5">
                    <Crown className="w-4 h-4 text-amber-400" />
                    <div>
                      <h3 className="text-sm font-bold text-white">{l.name}</h3>
                      <p className="text-[11px] text-slate-400">Owner: <strong>{l.ownerName}</strong> ({l.ownerEmail})</p>
                    </div>
                  </div>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800/80 text-slate-400 border border-slate-700/60">
                    ID: {l.id}
                  </span>
                </div>

                {/* Collaborators list */}
                <div>
                  <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
                    Active Collaborators ({l.collaborators.length})
                  </p>
                  {l.collaborators.length === 0 ? (
                    <p className="text-xs text-slate-500 italic">No external collaborators associated with this ledger yet.</p>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {l.collaborators.map(c => (
                        <div key={c.userId} className="flex items-center justify-between p-2.5 rounded-lg bg-slate-900/90 border border-slate-800 text-xs">
                          <div>
                            <p className="font-semibold text-slate-200">{c.name || c.email}</p>
                            <p className="text-[10px] text-slate-400 font-mono">{c.email}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                              c.role === 'admin'
                                ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
                                : c.role === 'editor'
                                  ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/40'
                                  : 'bg-slate-800 text-slate-300 border border-slate-700'
                            }`}>
                              {c.role}
                            </span>
                            <button
                              onClick={() => handleDisconnectUser(c.userId, l.id, c.email)}
                              disabled={disconnectingUserId === c.userId}
                              title="Disconnect collaborator"
                              className="p-1 rounded text-slate-400 hover:text-rose-400 hover:bg-rose-950/30 transition-colors"
                            >
                              <UserMinus className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Finance Accounts Table */}
      <div className={`rounded-2xl border overflow-hidden shadow-lg ${isLight ? 'border-slate-200' : 'border-slate-800/60'}`}>
        <div className={`px-5 py-3.5 border-b flex items-center justify-between ${
          isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/80 border-slate-800/60'
        }`}>
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-blue-400" />
            <span className="text-xs font-bold uppercase tracking-widest text-slate-300">
              Finance Accounts ({financeUsers.length})
            </span>
          </div>
          <p className="text-[11px] text-slate-500">
            Active user accounts registered or collaborating on Finance budgets
          </p>
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
                <th className="text-center px-4 py-3">Delete</th>
              </tr>
            </thead>
            <tbody className={`divide-y ${isLight ? 'divide-slate-100' : 'divide-slate-800/40'}`}>
              {financeUsers.map((u) => (
                <tr key={u.id} className={`transition-colors ${isLight ? 'hover:bg-slate-50' : 'hover:bg-slate-900/40'}`}>
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
                            ? 'bg-rose-950/40 hover:bg-rose-900/60 text-rose-400 border-rose-800/50'
                            : 'bg-emerald-950/40 hover:bg-emerald-900/60 text-emerald-400 border-emerald-800/50'
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
                      u.backupCount > 0 ? 'bg-emerald-950/60 text-emerald-400' : 'bg-slate-800 text-slate-600'
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
                  <td className="px-4 py-3.5 text-center">
                    <button
                      onClick={() => handleDeleteUser(u)}
                      disabled={deletingUserId === u.id}
                      title={`Permanently delete ${u.email}`}
                      className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-950/40 border border-transparent hover:border-rose-900/50 transition-colors disabled:opacity-40"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
              {financeUsers.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-5 py-10 text-center text-sm text-slate-500">
                    No Finance accounts found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
