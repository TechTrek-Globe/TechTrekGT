import React, { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Loader2, Lock, Mail, User, UserPlus, AlertTriangle, ShieldCheck, Wallet } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { getApiUrl, apiFetch } from '../utils/api';

const PENDING_KEY = 'finance_pending_invite';
const DASHBOARD_PATH = '/finance/dashboard';

const PRESET_SECURITY_QUESTIONS = [
  "What was the make and model of your first car?",
  "What is your mother's maiden name?",
  "What was the name of your first elementary school?",
  "In what city were you born?",
  "What was the name of your first childhood pet?"
];

const ROLE_LABELS = {
  viewer: 'Viewer (Read-Only)',
  editor: 'Editor (Can record transactions and update budget)',
  admin: 'Admin (Full access plus collaborator management)'
};

const REASON_TEXT = {
  invalid: 'This invitation link is not valid or has been removed.',
  expired: 'This invitation has expired. Ask the ledger owner to send a new invitation.',
  revoked: 'This invitation was revoked by the ledger owner.',
  used: 'This invitation has already been accepted.'
};

function navigate(path) {
  if (typeof window !== 'undefined') {
    window.history.pushState({}, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }
}

function readToken() {
  if (typeof window === 'undefined') return '';
  try {
    const fromUrl = new URLSearchParams(window.location.search).get('token');
    if (fromUrl) {
      sessionStorage.setItem(PENDING_KEY, fromUrl);
      return fromUrl;
    }
    return sessionStorage.getItem(PENDING_KEY) || '';
  } catch {
    return '';
  }
}

export function InviteClaim() {
  const { user, isAuthenticated, isLoading, login, register, logout } = useAuth();
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
        const res = await apiFetch(`/api/finance/invites/verify?token=${encodeURIComponent(token)}`);
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok || !data.valid) {
          try { sessionStorage.removeItem(PENDING_KEY); } catch {}
          setFailure(REASON_TEXT[data.reason] || 'Unable to verify this invitation.');
        } else {
          setInfo(data);
          setAuthMode(data.accountExists ? 'signin' : 'register');
        }
      } catch (err) {
        if (!cancelled) {
          setFailure('Unable to verify this invitation. Check your network connection and retry.');
        }
      } finally {
        if (!cancelled) setLoadingInfo(false);
      }
    })();

    return () => { cancelled = true; };
  }, [token]);

  const emailMatches = Boolean(
    info && user?.email && String(user.email).toLowerCase() === String(info.invitedEmail).toLowerCase()
  );

  const claim = async () => {
    setClaiming(true);
    setClaimError('');
    try {
      const res = await apiFetch('/api/finance/invites/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || `Could not accept invitation (HTTP ${res.status})`);
      }
      try { sessionStorage.removeItem(PENDING_KEY); } catch {}
      if (data?.ledgerId) {
        try { sessionStorage.setItem('finance_active_ledger_id', data.ledgerId); } catch {}
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('techtrek:switch-ledger', { detail: { ledgerId: data.ledgerId } }));
        }
      }
      setClaimed(true);
      setTimeout(() => navigate(DASHBOARD_PATH), 900);
    } catch (err) {
      setClaimError(err.message);
    } finally {
      setClaiming(false);
    }
  };

  // Complete claim automatically right after sign-in or registration from this screen
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
        if (!name.trim() || !securityAnswer.trim()) {
          throw new Error('Name and security answer are required.');
        }
        await register(name.trim(), info.invitedEmail, password, securityQuestion, securityAnswer, false, null, token);
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
    navigate(`/finance/invite?token=${encodeURIComponent(token)}`);
  };

  if (loadingInfo || isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
          <p className="text-sm font-medium text-slate-400">Verifying budget invitation...</p>
        </div>
      </div>
    );
  }

  if (failure) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="max-w-md w-full p-8 rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl space-y-5 text-center">
          <div className="w-12 h-12 mx-auto rounded-full bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-black text-white">Invitation Unavailable</h2>
            <p className="text-sm text-slate-400 mt-2">{failure}</p>
          </div>
          <button
            type="button"
            onClick={() => navigate('/finance')}
            className="w-full py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium text-sm rounded-xl transition-all cursor-pointer"
          >
            Return to Finance OS
          </button>
        </div>
      </div>
    );
  }

  const roleLabel = ROLE_LABELS[info.role] || info.role;

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="max-w-md w-full p-8 rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl space-y-6">
        <div className="flex items-center gap-3 pb-3 border-b border-slate-800">
          <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
            <Wallet className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white">Budget Collaboration</h2>
            <p className="text-xs text-slate-400">Finance OS Shared Ledger</p>
          </div>
        </div>

        <div className="bg-slate-950/60 rounded-xl p-4 border border-slate-800/80 space-y-2">
          <p className="text-xs text-slate-400">You have been invited by <span className="font-semibold text-slate-200">{info.inviterName}</span> to collaborate on:</p>
          <p className="text-lg font-black text-blue-400">{info.ledgerTitle}</p>
          <div className="pt-2 flex items-center gap-2 text-xs text-slate-300">
            <span className="px-2 py-0.5 rounded-md bg-blue-500/20 border border-blue-500/30 text-blue-300 font-medium capitalize">
              {info.role}
            </span>
            <span className="text-slate-500">•</span>
            <span className="text-slate-400">{roleLabel}</span>
          </div>
          <p className="text-[11px] text-slate-500 pt-1">Invited email: <span className="text-slate-300 font-mono">{info.invitedEmail}</span></p>
        </div>

        {claimed ? (
          <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center gap-3 text-emerald-400 text-sm">
            <CheckCircle2 className="w-5 h-5 shrink-0" />
            <span>Invitation accepted! Opening your shared ledger...</span>
          </div>
        ) : isAuthenticated ? (
          emailMatches ? (
            <div className="space-y-4">
              {claimError && (
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{claimError}</span>
                </div>
              )}
              <p className="text-xs text-slate-400">
                You are currently signed in as <span className="text-slate-200 font-semibold">{user.email}</span>. Click below to accept and link this budget to your account.
              </p>
              <button
                type="button"
                onClick={claim}
                disabled={claiming}
                className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold text-sm rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-blue-900/30"
              >
                {claiming ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                {claiming ? 'Accepting Invitation...' : 'Accept & Open Ledger'}
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs space-y-2">
                <div className="flex items-center gap-2 font-semibold">
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>Email Address Mismatch</span>
                </div>
                <p className="text-slate-300 leading-relaxed">
                  This invitation was sent specifically to <span className="font-mono text-white">{info.invitedEmail}</span>, but your active session is signed in as <span className="font-mono text-white">{user.email}</span>.
                </p>
              </div>
              <button
                type="button"
                onClick={switchAccount}
                className="w-full py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium text-sm rounded-xl transition-all cursor-pointer"
              >
                Switch to {info.invitedEmail}
              </button>
            </div>
          )
        ) : (
          <form onSubmit={handleAuthSubmit} className="space-y-4">
            <div className="text-xs text-slate-400">
              {authMode === 'signin'
                ? 'Sign in with your password to accept this invitation:'
                : 'Create your TechTrek account to collaborate on this ledger:'}
            </div>

            {formError && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Email Address</label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    readOnly
                    value={info.invitedEmail}
                    className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-300 focus:outline-none cursor-not-allowed opacity-80"
                  />
                </div>
              </div>

              {authMode === 'register' && (
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Your Full Name</label>
                  <div className="relative">
                    <User className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      required
                      placeholder="Jane Doe"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Password</label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="password"
                    required
                    placeholder="••••••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              {authMode === 'register' && (
                <>
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Security Question</label>
                    <select
                      value={securityQuestion}
                      onChange={(e) => setSecurityQuestion(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-blue-500"
                    >
                      {PRESET_SECURITY_QUESTIONS.map(q => (
                        <option key={q} value={q}>{q}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Security Answer</label>
                    <input
                      type="text"
                      required
                      placeholder="Your answer"
                      value={securityAnswer}
                      onChange={(e) => setSecurityAnswer(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </>
              )}
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold text-sm rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-blue-900/30"
            >
              {submitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : authMode === 'signin' ? (
                <ShieldCheck className="w-4 h-4" />
              ) : (
                <UserPlus className="w-4 h-4" />
              )}
              {submitting
                ? 'Processing...'
                : authMode === 'signin'
                ? 'Sign In & Accept Invite'
                : 'Create Account & Accept'}
            </button>

            <div className="pt-2 text-center">
              <button
                type="button"
                onClick={() => setAuthMode(m => m === 'signin' ? 'register' : 'signin')}
                className="text-xs text-blue-400 hover:underline cursor-pointer"
              >
                {authMode === 'signin'
                  ? "Don't have an account yet? Register here"
                  : 'Already have an account? Sign in here'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

