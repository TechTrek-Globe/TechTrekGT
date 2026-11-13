import React, { useCallback, useEffect, useState } from 'react';
import { X, Copy, Check, Loader2, Send, Trash2, Users } from 'lucide-react';
import { getApiUrl } from '../utils/api';
import { useEscapeKey } from '../hooks/useEscapeKey';

async function call(path, options = {}) {
  const res = await fetch(getApiUrl(path), {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (HTTP ${res.status})`);
  return data;
}

export function ShareAgendaModal({ isOpen, onClose, agendaId, agendaTitle }) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('viewer');
  const [invites, setInvites] = useState([]);
  const [shares, setShares] = useState([]);
  const [myRole, setMyRole] = useState(null);
  const [created, setCreated] = useState(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const base = `/api/wayfinder/agendas/${encodeURIComponent(agendaId)}`;

  const refresh = useCallback(async () => {
    try {
      const data = await call(`${base}/invites`);
      setInvites(data.invites || []);
      setShares(data.shares || []);
      setMyRole(data.myRole || null);
    } catch (err) {
      setError(err.message);
    }
  }, [base]);

  useEffect(() => {
    if (isOpen) {
      setCreated(null);
      setError('');
      refresh();
    }
  }, [isOpen, refresh]);

  useEscapeKey(isOpen, onClose);

  if (!isOpen) return null;

  const sendInvite = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    setCopied(false);
    try {
      const data = await call(`${base}/invites`, { method: 'POST', body: JSON.stringify({ email, role }) });
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
    } catch (err) {
      setError('Copy failed. Select the link and copy it manually.');
    }
  };

  const act = async (fn) => {
    setError('');
    try { await fn(); await refresh(); } catch (err) { setError(err.message); }
  };

  const revoke = (id) => act(() => call(`${base}/invites/${id}`, { method: 'DELETE' }));
  const removeShare = (uid) => act(() => call(`${base}/shares/${encodeURIComponent(uid)}`, { method: 'DELETE' }));
  const changeRole = (uid, newRole) => act(() => call(`${base}/shares/${encodeURIComponent(uid)}`, { method: 'PUT', body: JSON.stringify({ role: newRole }) }));

  const roleOptions = myRole === 'owner' ? ['viewer', 'editor', 'admin'] : ['viewer', 'editor'];
  const pending = invites.filter((i) => i.status === 'pending' && !i.is_expired);
  const field = 'w-full px-3 py-2 bg-wf-navy-mid border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-wf-blue';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto glass-panel border border-white/10 rounded-2xl p-5 sm:p-6 bg-slate-900" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2"><Users className="w-5 h-5 text-sky-400" /> Share agenda</h2>
            {agendaTitle && <p className="text-xs text-wf-muted mt-0.5">{agendaTitle}</p>}
          </div>
          <button onClick={onClose} className="text-wf-muted hover:text-white" aria-label="Close"><X className="w-5 h-5" /></button>
        </div>

        {error && <p className="text-red-400 text-sm mb-3">{error}</p>}

        <form onSubmit={sendInvite} className="flex flex-col sm:flex-row gap-2 mb-4">
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="invitee@example.com" className={`${field} flex-1`} />
          <select value={role} onChange={(e) => setRole(e.target.value)} className={`${field} sm:w-28`}>
            {roleOptions.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          <button type="submit" disabled={busy} className="px-4 py-2 rounded-xl bg-wf-blue text-white text-sm font-medium flex items-center justify-center gap-1.5 disabled:opacity-50">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Invite
          </button>
        </form>

        {created && (
          <div className="mb-4 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30">
            <p className="text-xs text-emerald-300 mb-2">
              {created.emailSent ? `Invitation sent to ${created.email} from no-reply@techtrekgt.com.` : `Email could not be delivered${created.emailError ? ` (${created.emailError})` : ''}. Share the link manually below:`}
            </p>
            <div className="flex gap-2">
              <input readOnly value={created.inviteLink} onFocus={(e) => e.target.select()} className={`${field} flex-1 text-xs`} />
              <button type="button" onClick={() => copyLink(created.inviteLink)} className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs flex items-center gap-1.5">
                {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />} {copied ? 'Copied' : 'Copy link'}
              </button>
            </div>
            <p className="text-[11px] text-wf-muted mt-2">This link is shown once. Expires {created.expiresAt}.</p>
          </div>
        )}

        <h3 className="text-xs font-semibold text-wf-cream uppercase tracking-wide mb-2">Collaborators</h3>
        {shares.length === 0 && <p className="text-xs text-wf-muted mb-3">No collaborators yet.</p>}
        <ul className="space-y-1.5 mb-4">
          {shares.map((s) => (
            <li key={s.user_id} className="flex items-center justify-between gap-2 text-sm text-slate-200 bg-white/5 rounded-lg px-3 py-2">
              <span className="truncate">{s.name || s.email}<span className="text-xs text-wf-muted ml-1">{s.name ? s.email : ''}</span></span>
              <span className="flex items-center gap-2 shrink-0">
                <select value={s.role} disabled={s.role === 'admin' && myRole !== 'owner'} onChange={(e) => changeRole(s.user_id, e.target.value)} className="bg-wf-navy-mid border border-white/10 rounded-md text-xs text-white px-1.5 py-1">
                  {['viewer', 'editor', ...(myRole === 'owner' || s.role === 'admin' ? ['admin'] : [])].map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
                <button onClick={() => removeShare(s.user_id)} disabled={s.role === 'admin' && myRole !== 'owner'} className="text-red-400 hover:text-red-300 disabled:opacity-30" aria-label="Remove collaborator"><Trash2 className="w-4 h-4" /></button>
              </span>
            </li>
          ))}
        </ul>

        <h3 className="text-xs font-semibold text-wf-cream uppercase tracking-wide mb-2">Pending invitations</h3>
        {pending.length === 0 && <p className="text-xs text-wf-muted">No pending invitations.</p>}
        <ul className="space-y-1.5">
          {pending.map((i) => (
            <li key={i.id} className="flex items-center justify-between gap-2 text-sm text-slate-200 bg-white/5 rounded-lg px-3 py-2">
              <span className="truncate">{i.invited_email} <span className="text-xs text-wf-muted">({i.role})</span></span>
              <button onClick={() => revoke(i.id)} className="text-xs text-red-400 hover:text-red-300 shrink-0">Revoke</button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

