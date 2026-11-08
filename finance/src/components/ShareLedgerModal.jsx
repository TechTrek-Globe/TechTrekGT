import React, { useCallback, useEffect, useState } from 'react';
import { X, Copy, Check, Loader2, Send, Trash2, Users, Shield, ShieldAlert, Mail } from 'lucide-react';
import { apiFetch } from '../utils/api';
import { useAuth } from '../context/AuthContext';

async function callLedgerApi(path, options = {}) {
  const res = await apiFetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Request failed (HTTP ${res.status})`);
  }
  return data;
}

export function ShareLedgerModal({ isOpen, onClose, ledgerId, ledgerTitle }) {
  const { user } = useAuth();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('viewer');
  const [invites, setInvites] = useState([]);
  const [shares, setShares] = useState([]);
  const [myRole, setMyRole] = useState(null);
  const [created, setCreated] = useState(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const targetId = ledgerId || user?.id || 'default';
  const basePath = `/api/finance/ledgers/${encodeURIComponent(targetId)}`;

  const refresh = useCallback(async () => {
    try {
      const data = await callLedgerApi(`${basePath}/invites`);
      setInvites(data.invites || []);
      setShares(data.shares || []);
      setMyRole(data.myRole || null);
    } catch (err) {
      setError(err.message);
    }
  }, [basePath]);

  useEffect(() => {
    if (isOpen) {
      setCreated(null);
      setError('');
      refresh();
    }
  }, [isOpen, refresh]);

  if (!isOpen) return null;

  const sendInvite = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    setCopied(false);
    try {
      const data = await callLedgerApi(`${basePath}/invites`, {
        method: 'POST',
        body: JSON.stringify({ email, role })
      });
      setCreated(data);
      setEmail('');
      refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const copyLink = async (link) => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Copy failed. Select the link and copy it manually.');
    }
  };

  const act = async (fn) => {
    setError('');
    try {
      await fn();
      await refresh();
    } catch (err) {
      setError(err.message);
    }
  };

  const revoke = (id) => act(() => callLedgerApi(`${basePath}/invites/${encodeURIComponent(id)}`, { method: 'DELETE' }));
  const removeShare = (uid) => act(() => callLedgerApi(`${basePath}/shares/${encodeURIComponent(uid)}`, { method: 'DELETE' }));
  const changeRole = (uid, newRole) => act(() => callLedgerApi(`${basePath}/shares/${encodeURIComponent(uid)}`, {
    method: 'PUT',
    body: JSON.stringify({ role: newRole })
  }));

  const roleOptions = myRole === 'owner' ? ['viewer', 'editor', 'admin'] : ['viewer', 'editor'];
  const pending = invites.filter((i) => i.status === 'pending' && !i.is_expired);
  const inputClass = 'w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:border-blue-500';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-lg max-h-[90vh] overflow-y-auto bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-2xl space-y-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between pb-3 border-b border-slate-800">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Users className="w-5 h-5 text-blue-400" /> Share Budget Ledger
            </h2>
            {ledgerTitle && <p className="text-xs text-slate-400 mt-0.5">{ledgerTitle}</p>}
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs">
            {error}
          </div>
        )}

        <form onSubmit={sendInvite} className="flex flex-col sm:flex-row gap-2">
          <input
            type="email"
            required
            placeholder="collaborator@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={`${inputClass} flex-1`}
          />
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className={`${inputClass} sm:w-32 capitalize`}
          >
            {roleOptions.map((r) => (
              <option key={r} value={r} className="bg-slate-900 text-white capitalize">{r}</option>
            ))}
          </select>
          <button
            type="submit"
            disabled={busy}
            className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer shadow-lg shadow-blue-900/30 shrink-0"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Invite
          </button>
        </form>

        {created && (
          <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 space-y-2">
            <p className="text-xs text-emerald-300">
              {created.emailSent
                ? `Invitation successfully emailed to ${created.email}.`
                : `Email notification could not be delivered. Share the direct link below:`}
            </p>
            <div className="flex gap-2">
              <input
                readOnly
                value={created.inviteLink}
                onFocus={(e) => e.target.select()}
                className={`${inputClass} flex-1 text-xs font-mono text-emerald-200`}
              />
              <button
                type="button"
                onClick={() => copyLink(created.inviteLink)}
                className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs flex items-center gap-1.5 cursor-pointer shrink-0"
              >
                {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <p className="text-[11px] text-slate-400">
              This link is single-use and expires on {created.expiresAt}.
            </p>
          </div>
        )}

        <div>
          <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">Active Collaborators</h3>
          {shares.length === 0 ? (
            <p className="text-xs text-slate-500">No external collaborators linked yet.</p>
          ) : (
            <ul className="space-y-1.5">
              {shares.map((s) => (
                <li
                  key={s.user_id}
                  className="flex items-center justify-between gap-2 text-sm text-slate-200 bg-slate-950/70 border border-slate-800 rounded-xl px-3 py-2.5"
                >
                  <div className="truncate min-w-0">
                    <p className="text-xs font-medium text-white truncate">{s.name || s.email}</p>
                    {s.name && <p className="text-[11px] text-slate-400 truncate">{s.email}</p>}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <select
                      value={s.role}
                      disabled={s.role === 'admin' && myRole !== 'owner'}
                      onChange={(e) => changeRole(s.user_id, e.target.value)}
                      className="bg-slate-900 border border-slate-700 rounded-lg text-xs text-slate-200 px-2 py-1 focus:outline-none capitalize disabled:opacity-50"
                    >
                      {['viewer', 'editor', ...(myRole === 'owner' || s.role === 'admin' ? ['admin'] : [])].map((r) => (
                        <option key={r} value={r} className="bg-slate-900 text-white capitalize">{r}</option>
                      ))}
                    </select>
                    <button
                      onClick={() => removeShare(s.user_id)}
                      disabled={s.role === 'admin' && myRole !== 'owner'}
                      className="text-rose-400 hover:text-rose-300 disabled:opacity-30 p-1 cursor-pointer transition-colors"
                      title="Remove collaborator"
                      aria-label="Remove collaborator"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">Pending Invitations</h3>
          {pending.length === 0 ? (
            <p className="text-xs text-slate-500">No pending invitations.</p>
          ) : (
            <ul className="space-y-1.5">
              {pending.map((i) => (
                <li
                  key={i.id}
                  className="flex items-center justify-between gap-2 text-sm text-slate-200 bg-slate-950/70 border border-slate-800 rounded-xl px-3 py-2.5"
                >
                  <div className="truncate min-w-0">
                    <p className="text-xs text-slate-200 truncate">{i.invited_email}</p>
                    <p className="text-[10px] text-slate-500 capitalize">Role: {i.role} • Expires: {new Date(i.expires_at).toLocaleDateString()}</p>
                  </div>
                  <button
                    onClick={() => revoke(i.id)}
                    className="text-xs text-rose-400 hover:text-rose-300 font-medium px-2 py-1 rounded bg-rose-500/10 border border-rose-500/20 cursor-pointer transition-colors"
                  >
                    Revoke
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

