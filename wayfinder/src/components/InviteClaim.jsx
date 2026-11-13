import React, { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Loader2, Lock, Mail, User, UserPlus, AlertTriangle, ShieldCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useWayfinder } from '../context/WayfinderContext';
import { getApiUrl } from '../utils/api';
import { PRESET_SECURITY_QUESTIONS } from './AuthModal';

const PENDING_KEY = 'wf_pending_invite';
const SHARED_AGENDA_PATH = '/wayfinder/poland-christmas-2026/private';

const ROLE_LABELS = {
  viewer: 'Viewer (read-only)',
  editor: 'Editor (can edit itinerary, stays and packing)',
  admin: 'Admin (can edit and manage collaborators)',
};

const REASON_TEXT = {
  invalid: 'This invitation link is not valid.',
  expired: 'This invitation has expired. Ask the agenda owner to send a new one.',
  revoked: 'This invitation was revoked by the agenda owner.',
  used: 'This invitation has already been used.',
};

function navigate(path) {
  window.history.pushState({}, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

function readToken() {
  try {
    const fromUrl = new URLSearchParams(window.location.search).get('token');
    if (fromUrl) {
      sessionStorage.setItem(PENDING_KEY, fromUrl);
      return fromUrl;
    }
    return sessionStorage.getItem(PENDING_KEY) || '';
  } catch (e) {
    return '';
  }
}

export function InviteClaim() {
  const { user, isAuthenticated, isLoading, login, register, logout } = useAuth();
  const { refreshAgendaAccess } = useWayfinder();
  const [token] = useState(readToken);
  const [info, setInfo] = useState(null);
  const [failure, setFailure] = useState('');
  const [loadingInfo, setLoadingInfo] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [claimError, setClaimError] = useState('');
  const [claimed, setClaimed] = useState(false);
  const [authMode, setAuthMode] = useState('signin');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [securityQuestion, setSecurityQuestion] = useState(PRESET_SECURITY_QUESTIONS[0]);
  const [securityAnswer, setSecurityAnswer] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const autoClaim = useRef(false);

  useEffect(() => {
    let cancelled = false;
    if (!token) {
      setFailure(REASON_TEXT.invalid);
      setLoadingInfo(false);
      return undefined;
    }
    (async () => {
      try {
        const res = await fetch(getApiUrl(`/api/wayfinder/invites/verify?token=${encodeURIComponent(token)}`), {
          credentials: 'include',
        });
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok || !data.valid) {
          setFailure(REASON_TEXT[data.reason] || 'Unable to verify this invitation.');
        } else {
          setInfo(data);
          setAuthMode(data.accountExists ? 'signin' : 'register');
        }
      } catch (e) {
        if (!cancelled) setFailure('Unable to verify this invitation. Check your connection and retry.');
      } finally {
        if (!cancelled) setLoadingInfo(false);
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  const emailMatches = Boolean(
    info && user?.email && user.email.toLowerCase() === info.invitedEmail.toLowerCase()
  );

  const claim = async () => {
    setClaiming(true);
    setClaimError('');
    try {
      const res = await fetch(getApiUrl('/api/wayfinder/invites/claim'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ token }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Could not accept invitation (HTTP ${res.status})`);
      try { sessionStorage.removeItem(PENDING_KEY); } catch (e) { /* ignore */ }
      await refreshAgendaAccess();
      setClaimed(true);
      setTimeout(() => navigate(SHARED_AGENDA_PATH), 900);
    } catch (err) {
      setClaimError(err.message);
    } finally {
      setClaiming(false);
    }
  };

  // Finish the claim automatically right after sign-in or registration from this page
  useEffect(() => {
    if (autoClaim.current && isAuthenticated && emailMatches && !claiming && !claimed) {
      autoClaim.current = false;
      claim();
    }
  }, [isAuthenticated, emailMatches]);

  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    setFormError('');
    setSubmitting(true);
    try {
      autoClaim.current = true;
      if (authMode === 'register') {
        if (!name.trim() || !securityAnswer.trim()) throw new Error('Name and security answer are required.');
        await register(name.trim(), info.invitedEmail, password, securityQuestion, securityAnswer, false, token);
      } else {
        await login(info.invitedEmail, password, false);
      }
    } catch (err) {
      autoClaim.current = false;
      if (err.message && err.message.toLowerCase().includes('already exists')) {
        setAuthMode('signin');
        setFormError('An account with this email already exists. Enter your password to sign in and accept this invitation.');
      } else {
        setFormError(err.message);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const switchAccount = async () => {
    await logout();
    navigate(`/wayfinder/invite?token=${encodeURIComponent(token)}`);
  };

  const inputClass = 'w-full pl-10 pr-4 py-2.5 bg-wf-navy-mid border border-white/10 rounded-xl text-sm text-white placeholder-wf-subtle focus:outline-none focus:border-wf-blue focus:ring-1 focus:ring-wf-blue transition-all';
  const btnClass = 'w-full px-6 py-2.5 rounded-xl bg-gradient-to-r from-wf-blue to-wf-blue-lt hover:opacity-90 text-white font-medium shadow-lg disabled:opacity-50 flex items-center justify-center gap-2';

  let body;
  if (loadingInfo || isLoading) {
    body = (
      <div className="flex items-center justify-center gap-2 text-wf-muted py-8">
        <Loader2 className="w-5 h-5 animate-spin" /> Checking invitation...
      </div>
    );
  } else if (failure) {
    body = (
      <div className="text-center py-4">
        <AlertTriangle className="w-10 h-10 text-amber-400 mx-auto mb-3" />
        <p className="text-slate-200 mb-4">{failure}</p>
        <button onClick={() => navigate('/wayfinder')} className="text-sky-300 hover:text-white text-sm">Back to Wayfinder</button>
      </div>
    );
  } else if (claimed) {
    body = (
      <div className="text-center py-4">
        <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto mb-3" />
        <p className="text-white font-semibold">Invitation accepted</p>
        <p className="text-wf-muted text-sm">Opening the shared agenda...</p>
      </div>
    );
  } else {
    body = (
      <>
        <div className="text-center mb-5">
          <div className="w-14 h-14 rounded-full bg-wf-navy-mid border border-white/10 flex items-center justify-center mx-auto mb-3 text-wf-blue-lt">
            <UserPlus className="w-7 h-7" />
          </div>
          <h2 className="text-xl font-bold text-white">{info.inviterName} invited you</h2>
          <p className="text-wf-muted text-sm mt-1">to collaborate on <span className="text-white font-semibold">{info.agendaTitle}</span></p>
          <p className="text-xs text-sky-300 mt-2">{ROLE_LABELS[info.role] || info.role}</p>
        </div>

        {isAuthenticated && emailMatches && (
          <>
            {claimError && <p className="text-red-400 text-sm mb-3">{claimError}</p>}
            <button onClick={claim} disabled={claiming} className={btnClass}>
              {claiming ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
              Accept invitation
            </button>
          </>
        )}

        {isAuthenticated && !emailMatches && (
          <div className="text-center">
            <p className="text-amber-300 text-sm mb-3">
              This invitation was sent to <b>{info.invitedEmail}</b>, but you are signed in as <b>{user?.email}</b>.
            </p>
            <button onClick={switchAccount} className={btnClass}>Sign in with a different account</button>
          </div>
        )}

        {!isAuthenticated && (
          <form onSubmit={handleAuthSubmit} className="space-y-3">
            <p className="text-xs text-wf-muted text-center">
              {authMode === 'register' ? 'Create an account to accept this invitation.' : 'Sign in to accept this invitation.'}
            </p>
            {formError && <p className="text-red-400 text-sm">{formError}</p>}
            <div className="relative">
              <Mail className="absolute left-3 top-3 w-4 h-4 text-wf-subtle" />
              <input type="email" value={info.invitedEmail} readOnly className={`${inputClass} opacity-70`} aria-label="Invited email" />
            </div>
            {authMode === 'register' && (
              <div className="relative">
                <User className="absolute left-3 top-3 w-4 h-4 text-wf-subtle" />
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" className={inputClass} required />
              </div>
            )}
            <div className="relative">
              <Lock className="absolute left-3 top-3 w-4 h-4 text-wf-subtle" />
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" className={inputClass} required />
            </div>
            {authMode === 'register' && (
              <>
                <select value={securityQuestion} onChange={(e) => setSecurityQuestion(e.target.value)} className={`${inputClass} pl-4`}>
                  {PRESET_SECURITY_QUESTIONS.map((q) => <option key={q} value={q}>{q}</option>)}
                </select>
                <input type="text" value={securityAnswer} onChange={(e) => setSecurityAnswer(e.target.value)} placeholder="Security answer" className={`${inputClass} pl-4`} required />
              </>
            )}
            <button type="submit" disabled={submitting} className={btnClass}>
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
              {authMode === 'register' ? 'Create account and accept' : 'Sign in and accept'}
            </button>
            <button
              type="button"
              onClick={() => { setAuthMode(authMode === 'register' ? 'signin' : 'register'); setFormError(''); }}
              className="w-full text-xs text-sky-300 hover:text-white"
            >
              {authMode === 'register' ? 'I already have an account' : 'I need to create an account'}
            </button>
          </form>
        )}
      </>
    );
  }

  return (
    <div className="flex-1 flex items-center justify-center p-6">
      <div className="w-full max-w-md glass-panel border border-white/10 rounded-2xl p-6 sm:p-8 animate-fade-in">
        {body}
      </div>
    </div>
  );
}

