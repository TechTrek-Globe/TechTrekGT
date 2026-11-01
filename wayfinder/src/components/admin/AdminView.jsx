import React, { useState, useEffect } from 'react';
import {
  Shield,
  Users,
  CheckCircle,
  Lock,
  Calendar,
  AlertTriangle,
  RefreshCw,
  Key,
  KeyRound,
  FileText,
  Compass,
  Search,
  Check
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { apiFetch } from '../../utils/api';

function StatusBadge({ status }) {
  const isSuspended = status === 'Suspended' || status === 'Locked';
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${
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

function ApiKeyBadge({ isEnabled }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${
      isEnabled
        ? 'bg-amber-950/60 text-amber-300 border border-amber-800/50'
        : 'bg-slate-800/70 text-slate-400 border border-slate-700/60'
    }`}>
      <Key className="w-2.5 h-2.5" />
      {isEnabled ? 'Enabled' : 'Disabled'}
    </span>
  );
}

function StatCard({ icon: Icon, label, value, color, bgGlow }) {
  return (
    <div className="flex items-center gap-4 p-4 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-xl backdrop-blur-md relative overflow-hidden group">
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${color} ${bgGlow} transition-transform group-hover:scale-105`}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">{label}</p>
        <p className="text-2xl font-black text-white leading-tight mt-0.5">{value}</p>
      </div>
    </div>
  );
}

export function AdminView() {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionSuccess, setActionSuccess] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [updatingKeyUserId, setUpdatingKeyUserId] = useState(null);
  const [updatingStatusUserId, setUpdatingStatusUserId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');

  const fetchStats = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await apiFetch('/api/wayfinder/admin/stats');
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || `Request failed (HTTP ${res.status})`);
        setStats(null);
      } else {
        setStats(data);
      }
    } catch {
      setError('Network error: unable to connect to admin endpoint.');
      setStats(null);
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleApiKey = async (targetUser) => {
    const nextEnabled = !targetUser.apiKeyEnabled;
    const promptMsg = nextEnabled
      ? `Enable Gemini AI API Key access for account "${targetUser.email}"?`
      : `Disable Gemini AI API Key access for account "${targetUser.email}"? Their document parsing will fall back to heuristic extraction.`;
    if (!window.confirm(promptMsg)) return;

    setUpdatingKeyUserId(targetUser.id);
    setActionError(null);
    setActionSuccess(null);

    try {
      const res = await apiFetch('/api/wayfinder/admin/user-api-access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: targetUser.id, enabled: nextEnabled })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || `Failed to update API key access (HTTP ${res.status})`);
      }
      setActionSuccess(data.message || `API key access ${nextEnabled ? 'enabled' : 'disabled'} for ${targetUser.email}.`);
      await fetchStats();
    } catch (err) {
      setActionError(err.message || 'Failed to update API key entitlement.');
    } finally {
      setUpdatingKeyUserId(null);
    }
  };

  const handleToggleStatus = async (targetUser) => {
    const currentStatus = targetUser.status || 'Active';
    const nextStatus = currentStatus === 'Active' ? 'Suspended' : 'Active';
    const promptMsg = nextStatus === 'Suspended'
      ? `Suspend account "${targetUser.email}"? This will invalidate active sessions.`
      : `Reactivate account "${targetUser.email}"?`;
    if (!window.confirm(promptMsg)) return;

    setUpdatingStatusUserId(targetUser.id);
    setActionError(null);
    setActionSuccess(null);

    try {
      const res = await apiFetch('/api/wayfinder/admin/user-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: targetUser.id, status: nextStatus })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || `Failed to update status (HTTP ${res.status})`);
      }
      setActionSuccess(data.message || `Account status updated to ${nextStatus}.`);
      await fetchStats();
    } catch (err) {
      setActionError(err.message || 'Failed to update user status.');
    } finally {
      setUpdatingStatusUserId(null);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  const isAdmin = Boolean(user?.isAdmin || user?.role === 'admin');

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center p-8 sm:p-12 text-center min-h-[60vh] max-w-lg mx-auto">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400 mb-4 shadow-lg shadow-rose-950/30">
          <Lock className="w-8 h-8" />
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">Access Denied</h2>
        <p className="text-slate-400 text-sm mb-6">
          Administrator privileges are required to view the Wayfinder Admin Panel and manage API key entitlements.
        </p>
        <button
          onClick={() => {
            window.history.pushState({}, '', '/wayfinder/poland-christmas-2026');
            window.dispatchEvent(new PopStateEvent('popstate'));
          }}
          className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white font-medium text-sm transition-all border border-slate-700/60"
        >
          Return to Poland Guide
        </button>
      </div>
    );
  }

  const filteredUsers = (stats?.users || []).filter(u => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      (u.name || '').toLowerCase().includes(q) ||
      (u.email || '').toLowerCase().includes(q) ||
      (u.id || '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-6">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center shadow-lg shadow-amber-950/40">
            <Shield className="w-6 h-6 text-amber-400" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-2">
              <span>Admin Dashboard</span>
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 font-semibold uppercase tracking-wider">
                Wayfinder
              </span>
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Account governance, user metrics, and Gemini AI API Key entitlements
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchStats}
            disabled={isLoading}
            aria-label="Refresh admin statistics"
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-800/90 hover:bg-slate-700 border border-slate-700 text-slate-200 transition-all shadow-sm disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Access Guard Banner */}
      <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-xs font-medium bg-amber-950/30 border border-amber-800/40 text-amber-300 shadow-sm">
        <Shield className="w-4 h-4 text-amber-400 shrink-0" />
        <span>Authenticated as <strong>{user?.email}</strong> : Administrator access active</span>
      </div>

      {/* Notifications */}
      {actionSuccess && (
        <div className="flex items-start gap-3 p-4 rounded-xl bg-emerald-950/40 border border-emerald-800/50 text-emerald-300 text-xs">
          <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-semibold">{actionSuccess}</p>
          </div>
        </div>
      )}

      {actionError && (
        <div className="flex items-start gap-3 p-4 rounded-xl bg-rose-950/40 border border-rose-800/50 text-rose-300 text-xs">
          <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-semibold">{actionError}</p>
          </div>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-3 p-4 rounded-xl bg-rose-950/40 border border-rose-800/50 text-rose-300 text-xs">
          <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-semibold">Failed to load administrative data</p>
            <p className="mt-0.5 opacity-80">{error}</p>
          </div>
        </div>
      )}

      {/* Stat Cards */}
      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            icon={Users}
            label="Total Accounts"
            value={stats.totalUsers}
            color="text-blue-400"
            bgGlow="bg-blue-500/10 border border-blue-500/20"
          />
          <StatCard
            icon={CheckCircle}
            label="Active Accounts"
            value={stats.activeCount}
            color="text-emerald-400"
            bgGlow="bg-emerald-500/10 border border-emerald-500/20"
          />
          <StatCard
            icon={Key}
            label="API Key Enabled"
            value={stats.apiKeyEnabledCount}
            color="text-amber-400"
            bgGlow="bg-amber-500/10 border border-amber-500/20"
          />
          <StatCard
            icon={Lock}
            label="Suspended Accounts"
            value={stats.suspendedCount}
            color="text-rose-400"
            bgGlow="bg-rose-500/10 border border-rose-500/20"
          />
        </div>
      )}

      {/* Wayfinder Operational Metrics */}
      {stats?.stats && (
        <div className="p-4 rounded-2xl bg-slate-900/60 border border-white/5 flex flex-wrap items-center justify-between gap-4 text-xs text-slate-300">
          <div className="flex items-center gap-2">
            <Compass className="w-4 h-4 text-amber-400" />
            <span>Active Journeys: <strong className="text-white">{stats.stats.totalJourneys}</strong></span>
          </div>
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-sky-400" />
            <span>Documents Vault: <strong className="text-white">{stats.stats.totalDocuments}</strong></span>
          </div>
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-indigo-400" />
            <span>Itinerary Milestones: <strong className="text-white">{stats.stats.totalItineraryItems}</strong></span>
          </div>
        </div>
      )}

      {/* Accounts Governance Table */}
      <div className="rounded-2xl border border-white/10 bg-slate-900/90 shadow-2xl overflow-hidden backdrop-blur-xl">
        <div className="px-5 py-4 border-b border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-950/50">
          <div className="flex items-center gap-2.5">
            <Users className="w-4 h-4 text-amber-400" />
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-200">
              Registered Accounts ({filteredUsers.length})
            </h2>
          </div>
          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search name, email, ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl bg-slate-800/80 border border-slate-700 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-400/60 transition-colors"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-white/5 text-[11px] font-bold uppercase tracking-wider text-slate-400 bg-slate-950/40">
                <th className="px-5 py-3.5">Name & User ID</th>
                <th className="px-4 py-3.5">Email</th>
                <th className="px-4 py-3.5">Role</th>
                <th className="px-4 py-3.5">Account Status</th>
                <th className="px-4 py-3.5">Status Action</th>
                <th className="px-4 py-3.5">API Key Access</th>
                <th className="px-4 py-3.5">API Entitlement Action</th>
                <th className="px-4 py-3.5 text-center">Docs</th>
                <th className="px-4 py-3.5">Member Since</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filteredUsers.map((u) => {
                const isCurrentUser = u.id === user?.id;
                return (
                  <tr key={u.id} className="hover:bg-white/[0.02] transition-colors">
                    {/* Name & ID */}
                    <td className="px-5 py-3.5">
                      <span className="font-bold text-white text-sm">{u.name}</span>
                      <p className="text-[10px] font-mono text-slate-500 mt-0.5">{u.id}</p>
                    </td>

                    {/* Email */}
                    <td className="px-4 py-3.5 font-mono text-slate-300">
                      {u.email}
                    </td>

                    {/* Role */}
                    <td className="px-4 py-3.5">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                        u.isAdmin
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                          : 'bg-slate-800 text-slate-400 border border-slate-700'
                      }`}>
                        {u.role || 'user'}
                      </span>
                    </td>

                    {/* Status Badge */}
                    <td className="px-4 py-3.5">
                      <StatusBadge status={u.status} />
                    </td>

                    {/* Status Action */}
                    <td className="px-4 py-3.5">
                      {isCurrentUser ? (
                        <span className="text-[11px] text-slate-500 italic">Current User</span>
                      ) : (
                        <button
                          onClick={() => handleToggleStatus(u)}
                          disabled={updatingStatusUserId === u.id}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-all ${
                            (u.status || 'Active') === 'Active'
                              ? 'bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 border-rose-800/50'
                              : 'bg-emerald-950/40 hover:bg-emerald-900/60 text-emerald-300 border-emerald-800/50'
                          } disabled:opacity-50`}
                        >
                          {updatingStatusUserId === u.id
                            ? 'Updating...'
                            : (u.status || 'Active') === 'Active'
                              ? 'Suspend'
                              : 'Activate'
                          }
                        </button>
                      )}
                    </td>

                    {/* API Key Status */}
                    <td className="px-4 py-3.5">
                      <ApiKeyBadge isEnabled={u.apiKeyEnabled} />
                    </td>

                    {/* API Entitlement Toggle Action */}
                    <td className="px-4 py-3.5">
                      <button
                        onClick={() => handleToggleApiKey(u)}
                        disabled={updatingKeyUserId === u.id}
                        className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-[11px] font-semibold border transition-all shadow-sm ${
                          u.apiKeyEnabled
                            ? 'bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 border-rose-800/50'
                            : 'bg-amber-950/40 hover:bg-amber-900/60 text-amber-300 border-amber-700/50'
                        } disabled:opacity-50`}
                      >
                        <KeyRound className="w-3 h-3" />
                        <span>
                          {updatingKeyUserId === u.id
                            ? 'Updating...'
                            : u.apiKeyEnabled
                              ? 'Disable Key'
                              : 'Enable Key'
                          }
                        </span>
                      </button>
                    </td>

                    {/* Docs */}
                    <td className="px-4 py-3.5 text-center">
                      <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-slate-800 text-slate-300 border border-slate-700">
                        {u.documentCount}
                      </span>
                    </td>

                    {/* Member Since */}
                    <td className="px-4 py-3.5 text-slate-400">
                      {u.createdAt
                        ? new Date(u.createdAt).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric'
                          })
                        : '-'
                      }
                    </td>
                  </tr>
                );
              })}

              {filteredUsers.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-5 py-10 text-center text-slate-400">
                    No matching user accounts found.
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
