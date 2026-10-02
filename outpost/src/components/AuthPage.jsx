import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import outpostHeaderBanner from '../assets/outpost-ai-cropped.webp';
import {
  Lock,
  Mail,
  User,
  ArrowRight,
  Loader2,
  CheckCircle2,
  HelpCircle,
  ChevronLeft,
  Trophy,
  TrendingUp,
  Package,
  ShieldCheck,
  Zap,
  BarChart3,
  Sparkles,
  Globe
} from 'lucide-react';

export const PRESET_SECURITY_QUESTIONS = [
  "What was the name of your first pet?",
  "What is your mother's maiden name?",
  "What was the name of your elementary school?",
  "What city were you born in?",
  "What was the make of your first car?",
  "What is your favorite book or movie?"
];

export function AuthPage({ onAuthSuccess, initialMode = 'signin', verifyNotification = null }) {
  const {
    login,
    register,
    getSecurityQuestion,
    requestPasswordReset,
    forgotPassword,
    resetPassword
  } = useAuth();

  // mode: 'signin' | 'register' | 'forgot' | 'reset'
  const [mode, setMode] = useState(() => {
    if (typeof window !== 'undefined') {
      const path = window.location.pathname.toLowerCase();
      if (path.includes('reset-password')) return 'forgot';
      const params = new URLSearchParams(window.location.search);
      const isPasswordResetReason = params.get('reason') === 'legacy_hash';
      if (params.get('mode') === 'forgot' || isPasswordResetReason) return 'forgot';
      if (params.get('mode') === 'register') return 'register';
    }
    return initialMode;
  });

  const [name, setName] = useState('');
  const [rememberMe, setRememberMe] = useState(() => {
    try {
      const saved = sessionStorage.getItem('outpost_remember_me');
      if (saved !== null) return saved === 'true';
      return true;
    } catch (e) { return true; }
  });
  const [email, setEmail] = useState(() => {
    try {
      if (typeof window !== 'undefined') {
        const params = new URLSearchParams(window.location.search);
        const qEmail = params.get('email');
        if (qEmail) return qEmail;
      }
      return sessionStorage.getItem('outpost_saved_email') || '';
    } catch (e) { return ''; }
  });
  const [password, setPassword] = useState('');
  const [securityQuestion, setSecurityQuestion] = useState(PRESET_SECURITY_QUESTIONS[0]);
  const [securityAnswer, setSecurityAnswer] = useState('');

  const [resetReason, setResetReason] = useState(() => {
    if (typeof window !== 'undefined') {
      const path = window.location.pathname.toLowerCase();
      const params = new URLSearchParams(window.location.search);
      if (path.includes('reset-password') || params.get('mode') === 'forgot' || params.get('reason') === 'legacy_hash') {
        return params.get('reason') || '';
      }
    }
    return '';
  });

  const [resetToken, setResetToken] = useState(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      return params.get('token') || '';
    }
    return '';
  });

  const [forgotStep, setForgotStep] = useState(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('token')) return 2;
    }
    return 1;
  });
  const [loadedQuestion, setLoadedQuestion] = useState('');
  const [newPassword, setNewPassword] = useState('');

  const [error, setError] = useState('');
  const [infoMessage, setInfoMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Auto-fetch security question if arriving with email + token
  useEffect(() => {
    if (email && forgotStep === 2 && !loadedQuestion) {
      getSecurityQuestion(email)
        .then(data => {
          setLoadedQuestion(data.securityQuestion || 'Security question');
        })
        .catch(() => {});
    }
  }, [email, forgotStep, loadedQuestion, getSecurityQuestion]);

  const switchMode = (newMode) => {
    setMode(newMode);
    setError('');
    setInfoMessage('');
    setForgotStep(1);
    setLoadedQuestion('');
    setResetReason('');
  };

  const handleSignIn = async (e) => {
    e.preventDefault();
    if (!email || !password) { setError('Please enter your email and password.'); return; }
    setIsSubmitting(true);
    setError('');
    try {
      sessionStorage.setItem('outpost_remember_me', String(rememberMe));
      if (rememberMe) {
        sessionStorage.setItem('outpost_saved_email', email.trim().toLowerCase());
      } else {
        sessionStorage.removeItem('outpost_saved_email');
      }
      await login(email, password, rememberMe);
      onAuthSuccess?.();
    } catch (err) {
      if (err.requiresReset || err.message?.includes('legacy') || err.message?.includes('reset')) {
        setMode('forgot');
        setResetReason(err.message?.includes('legacy') ? 'legacy_hash' : 'force_reset');
        setError('');
        return;
      }
      setError(err.message || 'Sign in failed. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    if (!name || !email || !password || !securityAnswer) {
      setError('Please fill in all fields.'); return;
    }
    if (password.length < 8 || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
      setError('Password must be 8+ characters with at least one uppercase letter and one number.'); return;
    }
    setIsSubmitting(true);
    setError('');
    try {
      const data = await register(name, email, password, securityQuestion, securityAnswer, rememberMe);
      if (data?.emailDispatched === false) {
        setInfoMessage('Account created! Verification email could not be automatically dispatched, but you may sign in.');
      } else {
        setInfoMessage('Account created! A confirmation link has been sent to your email. You can sign in below.');
      }
      setTimeout(() => switchMode('signin'), 3000);
    } catch (err) {
      setError(err.message || 'Registration failed. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleForgotStep1 = async (e) => {
    e.preventDefault();
    if (!email) { setError('Please enter your email address.'); return; }
    setIsSubmitting(true);
    setError('');
    try {
      await requestPasswordReset(email);
      const data = await getSecurityQuestion(email);
      setLoadedQuestion(data.securityQuestion || 'Security question');
      setForgotStep(2);
      setInfoMessage('A single-use reset code has been sent to your email. Enter the code and your security answer below.');
    } catch (err) {
      setError(err.message || 'Could not find that email address.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleForgotStep2 = async (e) => {
    e.preventDefault();
    if (!resetToken) { setError('Please enter the reset code sent to your email.'); return; }
    if (!securityAnswer) { setError('Please enter your security answer.'); return; }
    setIsSubmitting(true);
    setError('');
    try {
      await forgotPassword(email, securityAnswer, resetToken);
      setForgotStep(3);
      setInfoMessage('Identity verified. Enter your new password below.');
    } catch (err) {
      setError(err.message || 'Verification failed. The security answer or reset code is incorrect or expired.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    if (!newPassword) { setError('Please enter a new password.'); return; }
    if (newPassword.length < 8 || !/[A-Z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      setError('Password must be 8+ characters with at least one uppercase letter and one number.'); return;
    }
    setIsSubmitting(true);
    setError('');
    try {
      await resetPassword(email, newPassword);
      setInfoMessage('Password reset successfully! You can now sign in with your new password.');
      setTimeout(() => {
        switchMode('signin');
        setForgotStep(1);
        setSecurityAnswer('');
        setResetToken('');
        setNewPassword('');
        setResetReason('');
      }, 2500);
    } catch (err) {
      setError(err.message || 'Password reset failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // --- Feature highlights shown on the left panel ---
  const features = [
    { icon: Package, label: 'Inventory Tracking', desc: 'Proration-accurate true cost per item' },
    { icon: TrendingUp, label: 'Profit & ROI', desc: 'Real-time net profit across all platforms' },
    { icon: Trophy, label: 'Pricing Intelligence', desc: 'eBay comps and suggested list prices' },
  ];

  const stats = [
    { value: '12+', label: 'Platforms Tracked' },
    { value: '100%', label: 'Fee Accuracy' },
    { value: '24/7', label: 'Live Dashboard' },
  ];

  return (
    <div className="min-h-screen bg-slate-950 bg-grid-pattern flex flex-col items-center justify-between font-sans relative overflow-hidden">

      {/* --- Full-width Top Bar Header --- */}
      <header className="w-full bg-black shadow-2xl relative z-20 flex justify-center items-center overflow-hidden" style={{ height: '280px', borderBottom: '1px solid rgba(180,130,20,0.3)' }}>
        <a
          href="https://techtrekgt.com"
          className="absolute top-4 left-4 z-30 flex items-center space-x-2 px-3.5 py-1.5 rounded-xl bg-slate-900/90 hover:bg-slate-800 text-slate-200 hover:text-white text-xs font-semibold border border-slate-700/80 hover:border-amber-500/50 shadow-lg backdrop-blur-md transition-all"
          title="Return to TechTrekGT Main Launch Pad"
        >
          <Globe className="w-4 h-4 text-amber-400" />
          <span>TechTrekGT Launch Pad</span>
        </a>
        <img 
          src={outpostHeaderBanner} 
          alt="TechTrek Outpost Top Bar" 
          style={{ height: '100%', width: 'auto', maxWidth: '100%', objectFit: 'contain', display: 'block' }} 
        />
      </header>

      {/* Background ambient glow spheres */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-40 -left-40 w-[600px] h-[600px] bg-amber-500/10 rounded-full blur-[140px]" />
        <div className="absolute -bottom-40 -right-40 w-[600px] h-[600px] bg-amber-600/10 rounded-full blur-[140px]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] bg-amber-400/5 rounded-full blur-[100px]" />
      </div>

      <div className="w-full max-w-7xl relative z-10 flex-1 flex flex-col lg:flex-row items-center justify-center gap-10 lg:gap-16 p-4 sm:p-6 lg:p-12">

        {/* --- Left: Hero Branding Showcase (Desktop) --- */}
        <div className="hidden lg:flex flex-col items-center text-center lg:items-start lg:text-left w-full lg:w-[52%] max-w-xl">

          {/* Badge pill */}
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/25 text-amber-300 text-xs font-semibold tracking-wide mb-6">
            <Sparkles className="w-3.5 h-3.5" />
            TechTrek Suite · Auction Intelligence
          </div>

          <div>
            <h1 className="text-4xl xl:text-5xl font-black text-white tracking-tight leading-[1.1]">
              Auction Inventory &{' '}
              <span className="text-gradient-amber">Profit Intelligence</span>
            </h1>
            <p className="text-slate-400 text-base leading-relaxed mt-4 max-w-md">
              Track memorabilia from invoice to sale with automated proration, fee calculations, and real-time ROI tracking.
            </p>
          </div>

          {/* Feature Highlights Grid */}
          <div className="grid grid-cols-3 gap-3 w-full mt-8">
            {features.map(({ icon: Icon, label, desc }) => (
              <div key={label} className="glass-card rounded-2xl p-4 border border-slate-800/80 flex flex-col items-center text-center group hover:border-amber-500/30 hover:bg-slate-900/60 hover:-translate-y-0.5 transition-all duration-200">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500/20 to-amber-700/10 border border-amber-500/25 flex items-center justify-center mb-2.5 group-hover:scale-110 group-hover:from-amber-500/30 transition-all duration-200">
                  <Icon className="w-5 h-5 text-amber-400" />
                </div>
                <p className="text-xs font-bold text-slate-200 line-clamp-1">{label}</p>
                <p className="text-[10px] text-slate-500 mt-1 line-clamp-2 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>

          {/* Stats Strip */}
          <div className="grid grid-cols-3 gap-3 w-full mt-6">
            {stats.map(({ value, label }) => (
              <div key={label} className="flex flex-col items-center py-3 rounded-2xl bg-slate-900/40 border border-slate-800/60">
                <span className="text-lg font-black text-gradient-amber">{value}</span>
                <span className="text-[10px] text-slate-500 mt-0.5 font-medium">{label}</span>
              </div>
            ))}
          </div>

          {/* Trust indicators */}
          <div className="flex items-center gap-4 w-full mt-6 px-4 py-3 rounded-2xl bg-slate-900/40 border border-slate-800/60 text-xs text-slate-400">
            <span className="flex items-center gap-1.5"><ShieldCheck className="w-3.5 h-3.5 text-emerald-400" /> Encrypted</span>
            <span className="text-slate-700">•</span>
            <span className="flex items-center gap-1.5"><Zap className="w-3.5 h-3.5 text-amber-400" /> Real-time Sync</span>
            <span className="text-slate-700">•</span>
            <span className="flex items-center gap-1.5"><BarChart3 className="w-3.5 h-3.5 text-blue-400" /> ROI Analytics</span>
          </div>
        </div>

        {/* --- Right: Form Container --- */}
        <div className="w-full lg:w-[480px] max-w-md">

          {/* Main Auth Glass Card */}
          <div className="glass-card rounded-3xl p-7 sm:p-8 glow-amber-sm shadow-2xl border border-slate-800/80 relative overflow-hidden">
            {/* Inner top highlight */}
            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-amber-500/30 to-transparent" />

            {/* Verification Alert Banner */}
            {verifyNotification && (
              <div className={`mb-5 p-3.5 rounded-xl border text-xs font-medium leading-relaxed ${
                verifyNotification.type === 'success'
                  ? 'bg-emerald-950/50 border-emerald-800/50 text-emerald-300'
                  : 'bg-red-950/50 border-red-800/50 text-red-400'
              }`}>
                {verifyNotification.message}
              </div>
            )}

            {/* Mode Switcher Tabs (Sign In / Register) */}
            {(mode === 'signin' || mode === 'register') && (
              <div className="flex bg-slate-900/90 p-1 rounded-xl border border-slate-800 mb-6">
                <button
                  type="button"
                  onClick={() => switchMode('signin')}
                  className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all duration-200 ${
                    mode === 'signin'
                      ? 'bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 shadow-md shadow-amber-500/20'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Sign In
                </button>
                <button
                  type="button"
                  onClick={() => switchMode('register')}
                  className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all duration-200 ${
                    mode === 'register'
                      ? 'bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 shadow-md shadow-amber-500/20'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Create Account
                </button>
              </div>
            )}

            {/* --- Sign In Mode --- */}
            {mode === 'signin' && (
              <>
                <div className="mb-6">
                  <h2 className="text-2xl font-black text-white tracking-tight">Welcome back</h2>
                  <p className="text-slate-400 text-sm mt-1.5">Sign in to access your Outpost dashboard</p>
                </div>
                {error && (
                  <div className="mb-5 p-3.5 rounded-xl bg-red-950/50 border border-red-800/50 text-red-400 text-xs font-medium leading-relaxed">
                    {error}
                  </div>
                )}
                <form onSubmit={handleSignIn} className="space-y-4" id="signin-form">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">Email address</label>
                    <div className="relative">
                      <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                      <input
                        id="signin-email"
                        type="email"
                        autoComplete="email"
                        className="input-field pl-10"
                        placeholder="you@example.com"
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">Password</label>
                    <div className="relative">
                      <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                      <input
                        id="signin-password"
                        type="password"
                        autoComplete="current-password"
                        className="input-field pl-10"
                        placeholder="••••••••"
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="flex items-center justify-between pt-1">
                    <label className="flex items-center gap-2 cursor-pointer group">
                      <div
                        className={`w-4 h-4 rounded border transition-all duration-200 flex items-center justify-center ${rememberMe ? 'bg-amber-500 border-amber-500' : 'border-slate-600 group-hover:border-amber-500/60'}`}
                        onClick={() => setRememberMe(v => !v)}
                      >
                        {rememberMe && <CheckCircle2 className="w-3 h-3 text-slate-950" strokeWidth={3} />}
                      </div>
                      <span className="text-xs text-slate-400">Remember me</span>
                    </label>
                    <button type="button" className="btn-ghost" onClick={() => switchMode('forgot')}>
                      Forgot password?
                    </button>
                  </div>
                  <button id="signin-submit" type="submit" className="btn-primary mt-2" disabled={isSubmitting}>
                    {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <><span>Sign In to Outpost</span><ArrowRight className="w-4 h-4" /></>}
                  </button>
                </form>
              </>
            )}

            {/* --- Register Mode --- */}
            {mode === 'register' && (
              <>
                <div className="mb-6">
                  <h2 className="text-2xl font-black text-white tracking-tight">Create account</h2>
                  <p className="text-slate-400 text-sm mt-1.5">Set up your TechTrek Outpost account</p>
                </div>
                {error && (
                  <div className="mb-5 p-3.5 rounded-xl bg-red-950/50 border border-red-800/50 text-red-400 text-xs font-medium leading-relaxed">
                    {error}
                  </div>
                )}
                <form onSubmit={handleRegister} className="space-y-4" id="register-form">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">Full name</label>
                    <div className="relative">
                      <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                      <input id="reg-name" type="text" autoComplete="name" className="input-field pl-10" placeholder="Prestine Owner" value={name} onChange={e => setName(e.target.value)} />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">Email address</label>
                    <div className="relative">
                      <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                      <input id="reg-email" type="email" autoComplete="email" className="input-field pl-10" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">Password</label>
                    <div className="relative">
                      <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                      <input id="reg-password" type="password" autoComplete="new-password" className="input-field pl-10" placeholder="Min 8 chars, 1 uppercase, 1 number" value={password} onChange={e => setPassword(e.target.value)} />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">Security question</label>
                    <div className="relative">
                      <HelpCircle className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                      <select id="reg-security-question" className="input-field pl-10 appearance-none" value={securityQuestion} onChange={e => setSecurityQuestion(e.target.value)}>
                        {PRESET_SECURITY_QUESTIONS.map(q => <option key={q} value={q}>{q}</option>)}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">Security answer</label>
                    <input id="reg-security-answer" type="text" autoComplete="off" className="input-field" placeholder="Your answer (case-insensitive)" value={securityAnswer} onChange={e => setSecurityAnswer(e.target.value)} />
                  </div>
                  <button id="reg-submit" type="submit" className="btn-primary mt-2" disabled={isSubmitting}>
                    {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <><span>Create Outpost Account</span><ArrowRight className="w-4 h-4" /></>}
                  </button>
                </form>
              </>
            )}

            {/* --- Forgot Password --- */}
            {mode === 'forgot' && (
              <>
                <div className="mb-6">
                  <button className="btn-ghost mb-3" onClick={() => switchMode('signin')}>
                    <ChevronLeft className="w-3.5 h-3.5" /> Back to Sign In
                  </button>
                  <h2 className="text-2xl font-black text-white tracking-tight">Reset password</h2>
                  <p className="text-slate-400 text-sm mt-1.5">
                    {forgotStep === 1 && "Enter your email to request a single-use reset code."}
                    {forgotStep === 2 && "Enter your emailed reset code and answer your security question."}
                    {forgotStep === 3 && "Set your new account password below."}
                  </p>
                </div>

                {resetReason && (
                  <div className="mb-4 p-3.5 rounded-xl bg-amber-950/60 border border-amber-500/40 text-amber-300 text-xs font-medium leading-relaxed">
                    {resetReason === 'legacy_hash'
                      ? 'Security Update Required: Your account uses a legacy password format. Please verify your identity to set a new secure password.'
                      : 'Account Update Required: A password reset is required for your account before signing in. Please verify your identity below.'}
                  </div>
                )}

                {error && <div className="mb-4 p-3.5 rounded-xl bg-red-950/50 border border-red-800/50 text-red-400 text-xs font-medium">{error}</div>}
                {infoMessage && <div className="mb-4 p-3.5 rounded-xl bg-emerald-950/50 border border-emerald-800/50 text-emerald-300 text-xs font-medium">{infoMessage}</div>}

                {forgotStep === 1 && (
                  <form onSubmit={handleForgotStep1} className="space-y-4" id="forgot-step1-form">
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1.5">Email address</label>
                      <div className="relative">
                        <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                        <input id="forgot-email" type="email" className="input-field pl-10" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} />
                      </div>
                    </div>
                    <button id="forgot-lookup-submit" type="submit" className="btn-primary" disabled={isSubmitting}>
                      {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <><span>Send Reset Code</span><ArrowRight className="w-4 h-4" /></>}
                    </button>
                  </form>
                )}

                {forgotStep === 2 && (
                  <form onSubmit={handleForgotStep2} className="space-y-4" id="forgot-step2-form">
                    <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs font-medium">
                      <HelpCircle className="w-3.5 h-3.5 inline mr-1.5 mb-0.5" />{loadedQuestion || 'Security Question'}
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1.5">Your answer</label>
                      <input id="forgot-security-answer" type="text" autoComplete="off" className="input-field" placeholder="Case-insensitive answer" value={securityAnswer} onChange={e => setSecurityAnswer(e.target.value)} />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1.5">Reset Code from Email</label>
                      <div className="relative">
                        <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                        <input
                          id="forgot-reset-token"
                          type="text"
                          autoComplete="off"
                          className="input-field pl-10 font-mono text-xs"
                          placeholder="Paste single-use code from email"
                          value={resetToken}
                          onChange={e => setResetToken(e.target.value)}
                        />
                      </div>
                      <p className="text-[10px] text-slate-500 mt-1">Check your inbox for the recovery token sent to {email}.</p>
                    </div>
                    <button id="forgot-verify-submit" type="submit" className="btn-primary" disabled={isSubmitting}>
                      {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <><span>Verify Code & Answer</span><ArrowRight className="w-4 h-4" /></>}
                    </button>
                  </form>
                )}

                {forgotStep === 3 && (
                  <form onSubmit={handleResetPassword} className="space-y-4" id="reset-password-form">
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1.5">New password</label>
                      <div className="relative">
                        <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                        <input id="reset-new-password" type="password" autoComplete="new-password" className="input-field pl-10" placeholder="Min 8 chars, 1 uppercase, 1 number" value={newPassword} onChange={e => setNewPassword(e.target.value)} />
                      </div>
                    </div>
                    <button id="reset-submit" type="submit" className="btn-primary" disabled={isSubmitting}>
                      {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <><span>Reset password</span><CheckCircle2 className="w-4 h-4" /></>}
                    </button>
                  </form>
                )}
              </>
            )}

          </div>

          {/* Secure Footer */}
          <p className="text-center text-xs text-slate-500 mt-6 font-medium">
            &copy; {new Date().getFullYear()} TechTrek Outpost · Encrypted & Secure
          </p>
        </div>

      </div>
    </div>
  );
}
