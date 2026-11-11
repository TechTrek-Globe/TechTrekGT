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
  Check,
  UserPlus,
  UserMinus,
  Crown,
  Link2,
  Trash2,
  Mail
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { apiFetch } from '../../utils/api';

function TripRoleBadge({ role }) {
  if (role === 'owner') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm">
        <Crown className="w-2.5 h-2.5 text-amber-400" /> Owner
      </span>
    );
  }
  if (role === 'admin') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-sky-500/20 text-sky-300 border border-sky-500/40 shadow-sm">
        <Shield className="w-2.5 h-2.5 text-sky-400" /> Admin
      </span>
    );
  }
  if (role === 'editor') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 shadow-sm">
        Editor
      </span>
    );
  }
  if (role === 'viewer') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-slate-800 text-slate-300 border border-slate-700 shadow-sm">
        Viewer
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium text-slate-500 border border-slate-800 bg-slate-900/60">
      Not Linked
    </span>
  );
}

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
  const { user, isAuthenticated, isLoading: authLoading, setIsAuthModalOpen } = useAuth();
  const [stats, setStats] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionSuccess, setActionSuccess] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [updatingKeyUserId, setUpdatingKeyUserId] = useState(null);
  const [updatingStatusUserId, setUpdatingStatusUserId] = useState(null);
  const [updatingTripUserId, setUpdatingTripUserId] = useState(null);
  const [updatingPlatformRoleUserId, setUpdatingPlatformRoleUserId] = useState(null);
  const [deletingUserId, setDeletingUserId] = useState(null);
  const [addMemberRoles, setAddMemberRoles] = useState({});
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

  const handleUpdateTripMembership = async (journeyId, targetUserId, newRole) => {
    setUpdatingTripUserId(targetUserId);
    setActionError(null);
    setActionSuccess(null);
    try {
      const res = await apiFetch('/api/wayfinder/admin/trip-membership', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agendaId: journeyId, userId: targetUserId, role: newRole })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || `Failed to update trip membership (HTTP ${res.status})`);
      }
      setActionSuccess(data.message || `Updated trip role to ${newRole}.`);
      await fetchStats();
    } catch (err) {
      setActionError(err.message || 'Failed to update trip membership.');
    } finally {
      setUpdatingTripUserId(null);
    }
  };

  const handleRemoveTripMembership = async (journeyId, targetUserId, targetEmail) => {
    if (!window.confirm(`Move "${targetEmail || targetUserId}" back to Unaffiliated? They will be detached from this trip and lose access to the Private Hub.`)) return;
    setUpdatingTripUserId(targetUserId);
    setActionError(null);
    setActionSuccess(null);
    try {
      const res = await apiFetch('/api/wayfinder/admin/trip-membership/remove', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agendaId: journeyId, userId: targetUserId })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || `Failed to move user to unaffiliated (HTTP ${res.status})`);
      }
      setActionSuccess(data.message || 'User moved back to unaffiliated.');
      await fetchStats();
    } catch (err) {
      setActionError(err.message || 'Failed to move user to unaffiliated.');
    } finally {
      setUpdatingTripUserId(null);
    }
  };

  const handleTogglePlatformRole = async (targetUser) => {
    const isCurrentlyAdmin = Boolean(targetUser.isAdmin || targetUser.role === 'admin');
    const nextRole = isCurrentlyAdmin ? 'user' : 'admin';
    const promptMsg = isCurrentlyAdmin
      ? `Demote "${targetUser.email}" from Platform Admin to standard User?`
      : `Promote "${targetUser.email}" to Platform Admin? They will have administrative access across the platform.`;
    if (!window.confirm(promptMsg)) return;

    setUpdatingPlatformRoleUserId(targetUser.id);
    setActionError(null);
    setActionSuccess(null);
    try {
      const res = await apiFetch('/api/wayfinder/admin/user-role', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: targetUser.id, role: nextRole })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || `Failed to update platform role (HTTP ${res.status})`);
      }
      setActionSuccess(data.message || `Platform role updated to ${nextRole.toUpperCase()}.`);
      await fetchStats();
    } catch (err) {
      setActionError(err.message || 'Failed to update platform role.');
    } finally {
      setUpdatingPlatformRoleUserId(null);
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

  const handleDeleteUser = async (targetUser) => {
    const isSelf = targetUser.id === user?.id;
    const confirmPrompt = isSelf
      ? `CRITICAL WARNING: You are about to permanently delete your OWN administrator account (${targetUser.email}).\n\nAll your personal documents, bookings, packing items, and active sessions will be erased immediately, and you will be signed out.\n\nAre you sure you want to proceed?`
      : `Permanently delete user account "${targetUser.email}" (${targetUser.name})?\n\nThis cannot be undone and will permanently remove all their personal bookings, documents, packing lists, and trip memberships.`;

    if (!window.confirm(confirmPrompt)) return;

    setDeletingUserId(targetUser.id);
    setActionError(null);
    setActionSuccess(null);

    try {
      const res = await apiFetch('/api/wayfinder/admin/user-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: targetUser.id })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || `Failed to delete user account (HTTP ${res.status})`);
      }

      if (data.isSelf || isSelf) {
        window.location.href = '/wayfinder/poland-christmas-2026';
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

  const isAdmin = Boolean(user?.isAdmin || user?.role === 'admin');

  useEffect(() => {
    if (!authLoading && isAuthenticated && isAdmin) {
      fetchStats();
    }
  }, [authLoading, isAuthenticated, isAdmin]);

  if (authLoading) {
    return (
      <div className="flex flex-col items-center justify-center p-8 sm:p-12 text-center min-h-[60vh] max-w-lg mx-auto">
        <RefreshCw className="w-8 h-8 text-sky-400 animate-spin mb-3" />
        <p className="text-slate-400 text-sm">Verifying administrator session...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex flex-col items-center justify-center p-8 sm:p-12 text-center min-h-[60vh] max-w-lg mx-auto">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400 mb-4 shadow-lg">
          <Lock className="w-8 h-8" />
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">Administrator Sign In Required</h2>
        <p className="text-slate-400 text-sm mb-6">
          Sign in with an administrator account to access system diagnostics, user management, and API key entitlements.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => setIsAuthModalOpen(true)}
            className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-wf-blue to-wf-blue-lt hover:opacity-90 text-white font-semibold text-sm transition-all shadow-lg cursor-pointer"
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => {
              window.history.pushState({}, '', '/wayfinder/poland-christmas-2026');
              window.dispatchEvent(new PopStateEvent('popstate'));
            }}
            className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white font-medium text-sm transition-all border border-slate-700/60 cursor-pointer"
          >
            Return to Poland Guide
          </button>
        </div>
      </div>
    );
  }

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

      {/* Trips & Collaborator Groups Overview */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Compass className="w-5 h-5 text-amber-400" />
            <div>
              <h2 className="text-base font-bold text-white tracking-tight">Trips &amp; Collaborator Groups</h2>
              <p className="text-xs text-slate-400">Manage trip affiliations, invitations, and collaborator roles (Viewer, Editor, Admin)</p>
            </div>
          </div>
        </div>

        {stats?.trips && stats.trips.length > 0 ? (
          <div className="grid grid-cols-1 gap-6">
            {stats.trips.map((trip) => {
              return (
                <div key={trip.id} className="rounded-2xl border border-white/10 bg-slate-900/90 shadow-2xl overflow-hidden backdrop-blur-xl">
                  {/* Trip Card Header */}
                  <div className="px-5 py-4 border-b border-white/10 bg-slate-950/60 flex flex-col md:flex-row md:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
                        <Compass className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-bold text-white">{trip.name}</h3>
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
                            {trip.id}
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 flex items-center gap-1.5 mt-0.5">
                          <Crown className="w-3 h-3 text-amber-400" />
                          <span>Owner: <strong className="text-slate-200">{trip.owner?.name || 'Unknown'}</strong> ({trip.owner?.email})</span>
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-slate-800/80 text-slate-300 border border-slate-700">
                        {((trip.owner ? 1 : 0) + (trip.collaborators?.length || 0))} Tied ({trip.collaborators?.length || 0} Collaborator{trip.collaborators?.length === 1 ? '' : 's'})
                      </span>
                      <span className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-slate-800/80 text-slate-300 border border-slate-700">
                        {trip.pendingInvites?.length || 0} Pending Invite{trip.pendingInvites?.length === 1 ? '' : 's'}
                      </span>
                    </div>
                  </div>

                  <div className="p-5 grid grid-cols-1 lg:grid-cols-12 gap-6">
                    {/* Tied Collaborators List (left 7 cols) */}
                    <div className="lg:col-span-7 space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                          <Users className="w-3.5 h-3.5 text-sky-400" />
                          <span>Tied Accounts ({((trip.owner ? 1 : 0) + (trip.collaborators?.length || 0))})</span>
                        </h4>
                        <span className="text-[11px] text-slate-400">
                          1 Owner &bull; {trip.collaborators?.length || 0} Collaborator{trip.collaborators?.length === 1 ? '' : 's'}
                        </span>
                      </div>

                      <div className="space-y-2">
                        {/* Owner Account Row */}
                        {trip.owner && (
                          <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-amber-950/20 border border-amber-500/20">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-white truncate">{trip.owner.name || 'Owner'}</span>
                                <TripRoleBadge role="owner" />
                              </div>
                              <p className="text-[11px] font-mono text-amber-200/80 truncate">{trip.owner.email}</p>
                            </div>
                            <span className="text-[10px] font-bold text-amber-300 uppercase tracking-wider bg-amber-500/20 px-2 py-0.5 rounded border border-amber-500/30">
                              Trip Creator
                            </span>
                          </div>
                        )}

                        {/* Collaborator Account Rows */}
                        {trip.collaborators && trip.collaborators.length > 0 ? (
                          trip.collaborators.map((c) => {
                            const isUpdating = updatingTripUserId === c.userId;
                            return (
                              <div
                                key={c.userId}
                                className="flex items-center justify-between gap-3 p-3 rounded-xl bg-slate-950/40 border border-white/5 hover:border-white/10 transition-colors"
                              >
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs font-bold text-white truncate">{c.name || 'User'}</span>
                                    <TripRoleBadge role={c.role} />
                                  </div>
                                  <p className="text-[11px] font-mono text-slate-400 truncate">{c.email}</p>
                                </div>

                                <div className="flex items-center gap-2 shrink-0">
                                  {/* Role Dropdown */}
                                  <select
                                    value={c.role}
                                    disabled={isUpdating}
                                    onChange={(e) => {
                                      if (e.target.value === 'none') {
                                        handleRemoveTripMembership(trip.id, c.userId, c.email);
                                      } else {
                                        handleUpdateTripMembership(trip.id, c.userId, e.target.value);
                                      }
                                    }}
                                    className="bg-slate-800 border border-slate-700 text-slate-200 text-xs rounded-lg px-2 py-1 focus:outline-none focus:border-amber-400/60 disabled:opacity-50"
                                  >
                                    <option value="viewer">Viewer</option>
                                    <option value="editor">Editor</option>
                                    <option value="admin">Admin</option>
                                    <option value="none">Unaffiliate (Remove)</option>
                                  </select>

                                  {/* Unaffiliate Button */}
                                  <button
                                    onClick={() => handleRemoveTripMembership(trip.id, c.userId, c.email)}
                                    disabled={isUpdating}
                                    title="Move back to unaffiliated"
                                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold text-rose-300 bg-rose-950/40 hover:bg-rose-900/60 border border-rose-800/50 transition-colors disabled:opacity-50"
                                  >
                                    <UserMinus className="w-3.5 h-3.5" />
                                    <span className="hidden sm:inline">Unaffiliate</span>
                                  </button>
                                </div>
                              </div>
                            );
                          })
                        ) : null}
                      </div>

                      {/* Pending Invites if any */}
                      {trip.pendingInvites && trip.pendingInvites.length > 0 && (
                        <div className="mt-4 pt-3 border-t border-white/5 space-y-2">
                          <h5 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                            <Mail className="w-3 h-3 text-amber-400" />
                            <span>Pending Invitations ({trip.pendingInvites.length})</span>
                          </h5>
                          <div className="space-y-1.5">
                            {trip.pendingInvites.map((inv) => (
                              <div key={inv.id} className="flex items-center justify-between text-xs p-2 rounded-lg bg-amber-950/20 border border-amber-900/30">
                                <span className="font-mono text-amber-200/90">{inv.email}</span>
                                <span className="text-[10px] uppercase font-bold text-amber-400/80 bg-amber-900/40 px-2 py-0.5 rounded">
                                  Invited as {inv.role}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Unaffiliated Accounts (right 5 cols) */}
                    <div className="lg:col-span-5 space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                          <UserPlus className="w-3.5 h-3.5 text-amber-400" />
                          <span>Unaffiliated Accounts ({trip.unaffiliatedUsers?.length || 0})</span>
                        </h4>
                      </div>

                      {trip.unaffiliatedUsers && trip.unaffiliatedUsers.length > 0 ? (
                        <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                          {trip.unaffiliatedUsers.map((u) => {
                            const selectedRoleKey = `${trip.id}_${u.id}`;
                            const selectedRole = addMemberRoles[selectedRoleKey] || 'viewer';
                            const isUpdating = updatingTripUserId === u.id;

                            return (
                              <div
                                key={u.id}
                                className="p-3 rounded-xl bg-slate-950/40 border border-white/5 space-y-2 hover:border-white/10 transition-colors"
                              >
                                <div className="flex items-center justify-between">
                                  <div className="min-w-0">
                                    <p className="text-xs font-bold text-white truncate">{u.name || 'User'}</p>
                                    <p className="text-[11px] font-mono text-slate-400 truncate">{u.email}</p>
                                  </div>
                                  <span className="text-[10px] font-semibold text-slate-500 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
                                    Separate
                                  </span>
                                </div>

                                <div className="flex items-center gap-2 pt-1">
                                  <select
                                    value={selectedRole}
                                    disabled={isUpdating}
                                    onChange={(e) => {
                                      setAddMemberRoles(prev => ({ ...prev, [selectedRoleKey]: e.target.value }));
                                    }}
                                    className="bg-slate-800 border border-slate-700 text-slate-200 text-xs rounded-lg px-2 py-1 flex-1 focus:outline-none focus:border-amber-400/60 disabled:opacity-50"
                                  >
                                    <option value="viewer">Tie as Viewer</option>
                                    <option value="editor">Tie as Editor</option>
                                    <option value="admin">Tie as Admin</option>
                                  </select>

                                  <button
                                    onClick={() => handleUpdateTripMembership(trip.id, u.id, selectedRole)}
                                    disabled={isUpdating}
                                    className="flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-semibold bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 transition-all disabled:opacity-50"
                                  >
                                    <Link2 className="w-3 h-3" />
                                    <span>{isUpdating ? 'Tying...' : 'Tie to Trip'}</span>
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="p-4 rounded-xl bg-slate-950/30 border border-dashed border-slate-800 text-center">
                          <p className="text-xs text-slate-500">All registered accounts are currently tied to this trip.</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="p-6 rounded-2xl bg-slate-900/60 border border-white/5 text-center text-slate-400 text-xs">
            No active trips discovered in database.
          </div>
        )}
      </div>

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
                <th className="px-4 py-3.5">Platform Role</th>
                <th className="px-4 py-3.5">Poland Trip Role</th>
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
                const isUpdatingTrip = updatingTripUserId === u.id;
                const isUpdatingPlatform = updatingPlatformRoleUserId === u.id;

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

                    {/* Platform Role */}
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-1.5">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                          u.isAdmin
                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                            : 'bg-slate-800 text-slate-400 border border-slate-700'
                        }`}>
                          {u.role || 'user'}
                        </span>
                        {!isCurrentUser && (
                          <button
                            onClick={() => handleTogglePlatformRole(u)}
                            disabled={isUpdatingPlatform}
                            title={u.isAdmin ? 'Demote to standard User' : 'Promote to Platform Admin'}
                            className="p-1 rounded text-slate-400 hover:text-amber-300 hover:bg-slate-800 transition-colors disabled:opacity-50"
                          >
                            <Shield className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </td>

                    {/* Poland Trip Role */}
                    <td className="px-4 py-3.5">
                      {u.polandRole === 'owner' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/40">
                          <Crown className="w-2.5 h-2.5 text-amber-400" /> Owner
                        </span>
                      ) : u.polandRole && u.polandRole !== 'none' ? (
                        <div className="flex items-center gap-1.5">
                          <select
                            value={u.polandRole}
                            disabled={isUpdatingTrip}
                            onChange={(e) => {
                              if (e.target.value === 'none') {
                                handleRemoveTripMembership('poland-christmas-2026', u.id, u.email);
                              } else {
                                handleUpdateTripMembership('poland-christmas-2026', u.id, e.target.value);
                              }
                            }}
                            className="bg-slate-800 border border-slate-700 text-slate-200 text-xs rounded-lg px-2 py-0.5 focus:outline-none focus:border-amber-400/60 disabled:opacity-50"
                          >
                            <option value="viewer">Viewer</option>
                            <option value="editor">Editor</option>
                            <option value="admin">Admin</option>
                            <option value="none">Unaffiliate (Remove)</option>
                          </select>
                          <button
                            onClick={() => handleRemoveTripMembership('poland-christmas-2026', u.id, u.email)}
                            disabled={isUpdatingTrip}
                            title="Move back to unaffiliated"
                            className="p-1 rounded text-slate-400 hover:text-rose-400 hover:bg-rose-950/40 transition-colors disabled:opacity-50"
                          >
                            <UserMinus className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] text-slate-500 italic">Unaffiliated</span>
                          <button
                            onClick={() => handleUpdateTripMembership('poland-christmas-2026', u.id, 'viewer')}
                            disabled={isUpdatingTrip}
                            title="Tie to Poland Christmas 2026 trip as Viewer"
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors disabled:opacity-50"
                          >
                            <Link2 className="w-2.5 h-2.5" />
                            <span>Tie to Trip</span>
                          </button>
                        </div>
                      )}
                    </td>

                    {/* Status Badge */}
                    <td className="px-4 py-3.5">
                      <StatusBadge status={u.status} />
                    </td>

                    {/* Status Action */}
                    <td className="px-4 py-3.5">
                      {isCurrentUser ? (
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] text-slate-500 italic">Current User</span>
                          <button
                            onClick={() => handleDeleteUser(u)}
                            disabled={deletingUserId === u.id}
                            title="Delete your own administrator account"
                            className="px-2 py-0.5 rounded text-[10px] font-bold text-rose-400 bg-rose-950/40 hover:bg-rose-900/60 border border-rose-800/50 transition-colors disabled:opacity-50 flex items-center gap-1"
                          >
                            <Trash2 className="w-2.5 h-2.5 text-rose-400" />
                            <span>Delete</span>
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => handleToggleStatus(u)}
                            disabled={updatingStatusUserId === u.id || deletingUserId === u.id}
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
                          <button
                            onClick={() => handleDeleteUser(u)}
                            disabled={deletingUserId === u.id || updatingStatusUserId === u.id}
                            title={`Permanently delete ${u.email}`}
                            className="p-1 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-950/40 border border-transparent hover:border-rose-800/50 transition-colors disabled:opacity-50"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
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
                  <td colSpan={10} className="px-5 py-10 text-center text-slate-400">
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
