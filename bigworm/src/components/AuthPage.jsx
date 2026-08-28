import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  Lock,
  Mail,
  ArrowRight,
  Loader2,
  ShieldCheck,
  Wifi,
  Terminal,
  Monitor,
  Globe,
  KeyRound,
  Eye,
  EyeOff
} from 'lucide-react';

export function AuthPage() {
  const { login } = useAuth();

  const [email, setEmail] = useState(() => {
    try { return localStorage.getItem('bigworm_saved_email') || ''; } catch (e) { return ''; }
  });
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(() => {
    try { return Boolean(localStorage.getItem('bigworm_saved_email')); } catch (e) { return false; }
  });
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSignIn = async (e) => {
    e.preventDefault();
    if (!email || !password) { setError('Email and password are required.'); return; }
    setIsSubmitting(true);
    setError('');
    try {
      if (rememberMe) {
        localStorage.setItem('bigworm_saved_email', email.trim().toLowerCase());
      } else {
        localStorage.removeItem('bigworm_saved_email');
      }
      await login(email, password, rememberMe);
    } catch (err) {
      setError(err.message || 'Authentication failed. Check credentials and try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Animated "terminal" status lines shown on the left panel
  const statusLines = [
    { icon: Globe,     text: 'Cloudflare Tunnel',    status: 'ACTIVE' },
    { icon: ShieldCheck, text: 'End-to-End Encrypted', status: 'VERIFIED' },
    { icon: Monitor,   text: 'Home Endpoint',         status: 'ONLINE' },
    { icon: Wifi,      text: 'Guacamole Service',     status: 'READY' },
  ];

  return (
    <div className="min-h-screen bg-slate-950 bg-grid-cyber flex items-center justify-center p-4 relative overflow-hidden font-sans">

      {/* Launch Pad return link */}
      <a
        href="https://techtrekgt.com"
        className="absolute top-4 left-4 z-30 flex items-center space-x-2 px-3.5 py-1.5 rounded-xl bg-slate-900/90 hover:bg-slate-800 text-slate-200 hover:text-white text-xs font-semibold border border-slate-700/80 hover:border-cyan-500/50 shadow-lg backdrop-blur-md transition-all"
        title="Return to TechTrekGT Main Launch Pad"
      >
        <Globe className="w-4 h-4 text-cyan-400" />
        <span>TechTrekGT Launch Pad</span>
      </a>

      {/* Ambient glow blobs */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-60 -left-60 w-[700px] h-[700px] bg-cyan-500/6 rounded-full blur-[160px]" />
        <div className="absolute -bottom-60 -right-60 w-[700px] h-[700px] bg-blue-600/6 rounded-full blur-[160px]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-cyan-400/4 rounded-full blur-[120px]" />
      </div>

      <div className="relative z-10 w-full max-w-5xl flex flex-col lg:flex-row items-center gap-10 lg:gap-16">

        {/* --- Left: Branding + Status Panel --- */}
        <div className="hidden lg:flex flex-col w-full lg:w-[52%] max-w-lg animate-fade-in">

          {/* Logo/Brand */}
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-600/10 border border-cyan-500/30 flex items-center justify-center">
                <Terminal className="w-5 h-5 text-cyan-400" />
              </div>
              <div>
                <p className="text-[10px] font-mono font-bold tracking-[0.2em] uppercase text-cyan-500/70">TechTrek Suite</p>
                <h1 className="text-2xl font-black text-white leading-none tracking-tight">
                  Big<span className="text-gradient-cyber">Worm</span>
                </h1>
              </div>
            </div>
            <p className="text-slate-400 text-sm leading-relaxed mt-4 max-w-sm">
              Secure remote access portal. Connect to your home browser from anywhere in the world via an encrypted Cloudflare Tunnel.
            </p>
          </div>

          {/* System status terminal card */}
          <div className="glass-card rounded-2xl border border-slate-800/80 overflow-hidden">
            {/* Terminal header bar */}
            <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-900/90 border-b border-slate-800/60">
              <div className="w-2.5 h-2.5 rounded-full bg-red-500/60" />
              <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/60" />
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/60" />
              <span className="ml-2 text-[10px] font-mono text-slate-500 tracking-wider">system_status.sh</span>
            </div>
            {/* Status lines */}
            <div className="p-4 space-y-3">
              {statusLines.map(({ icon: Icon, text, status }) => (
                <div key={text} className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <Icon className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
                    <span className="text-xs font-mono text-slate-400">{text}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="status-dot-live" />
                    <span className="text-[10px] font-mono font-bold text-emerald-400 tracking-wider">{status}</span>
                  </div>
                </div>
              ))}
              <div className="pt-3 mt-3 border-t border-slate-800/60">
                <p className="text-[10px] font-mono text-slate-600">
                  <span className="text-cyan-500/60">$</span> auth --mode=jwt --cipher=HS256 --kdf=pbkdf2-sha256-310k
                </p>
              </div>
            </div>
          </div>

          {/* Security trust strip */}
          <div className="flex items-center gap-4 mt-5 px-4 py-3 rounded-xl bg-slate-900/40 border border-slate-800/50 text-xs text-slate-500">
            <span className="flex items-center gap-1.5"><ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />HttpOnly Cookie</span>
            <span className="text-slate-700">|</span>
            <span className="flex items-center gap-1.5"><KeyRound className="w-3.5 h-3.5 text-cyan-400" />PBKDF2 SHA-256</span>
            <span className="text-slate-700">|</span>
            <span className="flex items-center gap-1.5"><Globe className="w-3.5 h-3.5 text-blue-400" />Zero open ports</span>
          </div>
        </div>

        {/* --- Right: Login Form --- */}
        <div className="w-full lg:w-[420px] max-w-md animate-fade-in">
          <div className="glass-card glow-cyan-sm rounded-2xl p-7 border border-slate-800/80 relative overflow-hidden">
            {/* Top edge highlight */}
            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-cyan-500/40 to-transparent" />

            {/* Header */}
            <div className="mb-6">
              {/* Mobile-only brand */}
              <div className="flex lg:hidden items-center gap-2 mb-4">
                <Terminal className="w-5 h-5 text-cyan-400" />
                <span className="text-lg font-black text-white">Big<span className="text-gradient-cyber">Worm</span></span>
              </div>
              <h2 className="text-xl font-black text-white tracking-tight">Secure Access</h2>
              <p className="text-slate-500 text-xs mt-1.5 font-mono">Authorized personnel only</p>
            </div>

            {/* Error */}
            {error && (
              <div className="mb-5 p-3 rounded-xl bg-red-950/50 border border-red-800/40 text-red-400 text-xs font-medium leading-relaxed flex items-start gap-2">
                <span className="text-red-500 mt-0.5 flex-shrink-0">!</span>
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSignIn} className="space-y-4" id="bigworm-signin-form">
              {/* Email */}
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5 font-mono uppercase tracking-wider">
                  Identity
                </label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600" />
                  <input
                    id="bw-email"
                    type="email"
                    autoComplete="email"
                    className="input-field pl-10"
                    placeholder="you@example.com"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                  />
                </div>
              </div>

              {/* Password */}
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5 font-mono uppercase tracking-wider">
                  Passphrase
                </label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600" />
                  <input
                    id="bw-password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    className="input-field pl-10 pr-10"
                    placeholder="••••••••••••"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(v => !v)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-600 hover:text-slate-400 transition-colors"
                    tabIndex={-1}
                    aria-label="Toggle password visibility"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Remember me */}
              <div className="flex items-center gap-2 pt-0.5">
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={rememberMe}
                  onClick={() => setRememberMe(v => !v)}
                  className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-all duration-200 ${
                    rememberMe
                      ? 'bg-cyan-500 border-cyan-500'
                      : 'border-slate-600 hover:border-cyan-500/50'
                  }`}
                >
                  {rememberMe && (
                    <svg className="w-2.5 h-2.5 text-slate-950" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </button>
                <span className="text-xs text-slate-500 font-mono">Keep session active (30 days)</span>
              </div>

              {/* Submit */}
              <button
                id="bw-signin-submit"
                type="submit"
                className="btn-primary mt-2"
                disabled={isSubmitting}
              >
                {isSubmitting
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <><span>Authenticate & Connect</span><ArrowRight className="w-4 h-4" /></>
                }
              </button>
            </form>

            {/* Footer note */}
            <p className="text-center text-[10px] text-slate-600 mt-5 font-mono">
              Session encrypted · Auto-logout after 15 min inactivity
            </p>
          </div>
        </div>

      </div>
    </div>
  );
}
