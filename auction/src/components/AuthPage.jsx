import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  Gavel,
  Lock,
  Mail,
  User,
  ArrowRight,
  Loader2,
  KeyRound,
  CheckCircle2,
  HelpCircle,
  ChevronLeft,
  Trophy,
  TrendingUp,
  Package
} from 'lucide-react';

export const PRESET_SECURITY_QUESTIONS = [
  "What was the name of your first pet?",
  "What is your mother's maiden name?",
  "What was the name of your elementary school?",
  "What city were you born in?",
  "What was the make of your first car?",
  "What is your favorite book or movie?"
];

export function AuthPage({ onAuthSuccess }) {
  const {
    login,
    register,
    getSecurityQuestion,
    forgotPassword,
    resetPassword
  } = useAuth();

  // mode: 'signin' | 'register' | 'forgot' | 'reset'
  const [mode, setMode] = useState('signin');

  const [name, setName] = useState('');
  const [rememberMe, setRememberMe] = useState(() => {
    try { return Boolean(localStorage.getItem('auction_saved_email')); } catch (e) { return false; }
  });
  const [email, setEmail] = useState(() => {
    try { return localStorage.getItem('auction_saved_email') || ''; } catch (e) { return ''; }
  });
  const [password, setPassword] = useState('');
  const [securityQuestion, setSecurityQuestion] = useState(PRESET_SECURITY_QUESTIONS[0]);
  const [securityAnswer, setSecurityAnswer] = useState('');

  const [forgotStep, setForgotStep] = useState(1);
  const [loadedQuestion, setLoadedQuestion] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');

  const [error, setError] = useState('');
  const [infoMessage, setInfoMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const switchMode = (newMode) => {
    setMode(newMode);
    setError('');
    setInfoMessage('');
    setForgotStep(1);
    setLoadedQuestion('');
  };

  const handleSignIn = async (e) => {
    e.preventDefault();
    if (!email || !password) { setError('Please enter your email and password.'); return; }
    setIsSubmitting(true);
    setError('');
    try {
      if (rememberMe) {
        localStorage.setItem('auction_saved_email', email.trim().toLowerCase());
      } else {
        localStorage.removeItem('auction_saved_email');
      }
      await login(email, password, rememberMe);
      onAuthSuccess?.();
    } catch (err) {
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
      await register(name, email, password, securityQuestion, securityAnswer, rememberMe);
      onAuthSuccess?.();
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
      const data = await getSecurityQuestion(email);
      setLoadedQuestion(data.securityQuestion || 'No security question set for this account.');
      setForgotStep(2);
    } catch (err) {
      setError(err.message || 'Could not find that email address.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleForgotStep2 = async (e) => {
    e.preventDefault();
    if (!securityAnswer) { setError('Please enter your security answer.'); return; }
    setIsSubmitting(true);
    setError('');
    try {
      const data = await forgotPassword(email, securityAnswer);
      setResetToken(data.resetToken || '');
      setForgotStep(3);
      setInfoMessage('Your reset code has been generated. Enter it below to create a new password.');
    } catch (err) {
      setError(err.message || 'Security answer verification failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    if (!resetToken || !newPassword) { setError('Please enter the reset code and new password.'); return; }
    if (newPassword.length < 8 || !/[A-Z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      setError('Password must be 8+ characters with at least one uppercase letter and one number.'); return;
    }
    setIsSubmitting(true);
    setError('');
    try {
      await resetPassword(email, resetToken, newPassword);
      setInfoMessage('Password reset successfully! You can now sign in with your new password.');
      setTimeout(() => switchMode('signin'), 2500);
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

  return (
    <div className="min-h-screen bg-slate-950 bg-grid-pattern flex font-sans">

      {/* --- Left: Branding Panel --- */}
      <div className="hidden lg:flex flex-col justify-between w-[42%] p-12 relative overflow-hidden">
        {/* Ambient glow */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -top-32 -left-32 w-96 h-96 bg-amber-500/8 rounded-full blur-3xl" />
          <div className="absolute bottom-0 right-0 w-64 h-64 bg-amber-600/6 rounded-full blur-2xl" />
        </div>

        <div className="relative z-10">
          {/* Logo */}
          <div className="flex items-center gap-3 mb-16">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center shadow-lg shadow-amber-500/30">
              <Gavel className="w-5 h-5 text-slate-950" />
            </div>
            <div>
              <p className="text-xs font-semibold text-amber-500/80 tracking-widest uppercase">TechTrek</p>
              <p className="text-sm font-bold text-slate-100 -mt-0.5">Outpost</p>
            </div>
          </div>

          <h1 className="text-4xl font-black text-white leading-tight mb-4">
            Your Auction Inventory,{' '}
            <span className="text-gradient-amber">Perfected.</span>
          </h1>
          <p className="text-slate-400 text-sm leading-relaxed mb-12">
            Replace your spreadsheet with a live dashboard. Track signed memorabilia from invoice to sale with automated proration, platform fee lookup, and ROI intelligence.
          </p>

          {/* Features */}
          <div className="space-y-5">
            {features.map(({ icon: Icon, label, desc }) => (
              <div key={label} className="flex items-start gap-4">
                <div className="w-9 h-9 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Icon className="w-4 h-4 text-amber-400" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-200">{label}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom stat strip */}
        <div className="relative z-10 grid grid-cols-3 gap-3">
          {[
            { val: '12', label: 'Platforms Tracked' },
            { val: '100%', label: 'Fee Accuracy' },
            { val: 'Live', label: 'ROI Dashboard' },
          ].map(({ val, label }) => (
            <div key={label} className="glass-card rounded-xl p-3 text-center">
              <p className="text-lg font-black text-amber-400">{val}</p>
              <p className="text-[10px] text-slate-500 mt-0.5">{label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* --- Right: Auth Form Panel --- */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-md">

          {/* Mobile logo */}
          <div className="flex lg:hidden items-center gap-2.5 mb-8 justify-center">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center">
              <Gavel className="w-4 h-4 text-slate-950" />
            </div>
            <p className="font-black text-white text-lg">TechTrek Outpost</p>
          </div>

          <div className="glass-card rounded-2xl p-8 glow-amber-sm">

            {/* --- Sign In --- */}
            {mode === 'signin' && (
              <>
                <div className="mb-7">
                  <h2 className="text-xl font-black text-white">Welcome back</h2>
                  <p className="text-slate-400 text-sm mt-1">Sign in to TechTrek Outpost</p>
                </div>
                {error && (
                  <div className="mb-4 p-3 rounded-xl bg-red-950/40 border border-red-800/40 text-red-400 text-xs">
                    {error}
                  </div>
                )}
                <form onSubmit={handleSignIn} className="space-y-4" id="signin-form">
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1.5">Email address</label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
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
                    <label className="block text-xs font-semibold text-slate-400 mb-1.5">Password</label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
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
                    {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <><span>Sign in</span><ArrowRight className="w-4 h-4" /></>}
                  </button>
                </form>
                <p className="text-center text-xs text-slate-500 mt-6">
                  No account?{' '}
                  <button className="text-amber-400 hover:text-amber-300 font-semibold transition-colors" onClick={() => switchMode('register')}>
                    Create one
                  </button>
                </p>
              </>
            )}

            {/* --- Register --- */}
            {mode === 'register' && (
              <>
                <div className="mb-7">
                  <button className="btn-ghost mb-4" onClick={() => switchMode('signin')}>
                    <ChevronLeft className="w-3.5 h-3.5" /> Back to sign in
                  </button>
                  <h2 className="text-xl font-black text-white">Create account</h2>
                  <p className="text-slate-400 text-sm mt-1">Set up your Prestine Auction Tracker</p>
                </div>
                {error && (
                  <div className="mb-4 p-3 rounded-xl bg-red-950/40 border border-red-800/40 text-red-400 text-xs">
                    {error}
                  </div>
                )}
                <form onSubmit={handleRegister} className="space-y-4" id="register-form">
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1.5">Full name</label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                      <input id="reg-name" type="text" autoComplete="name" className="input-field pl-10" placeholder="Prestine Owner" value={name} onChange={e => setName(e.target.value)} />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1.5">Email address</label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                      <input id="reg-email" type="email" autoComplete="email" className="input-field pl-10" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1.5">Password</label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                      <input id="reg-password" type="password" autoComplete="new-password" className="input-field pl-10" placeholder="Min 8 chars, 1 uppercase, 1 number" value={password} onChange={e => setPassword(e.target.value)} />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1.5">Security question</label>
                    <div className="relative">
                      <HelpCircle className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                      <select id="reg-security-question" className="input-field pl-10 appearance-none" value={securityQuestion} onChange={e => setSecurityQuestion(e.target.value)}>
                        {PRESET_SECURITY_QUESTIONS.map(q => <option key={q} value={q}>{q}</option>)}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1.5">Security answer</label>
                    <input id="reg-security-answer" type="text" autoComplete="off" className="input-field" placeholder="Your answer (case-insensitive)" value={securityAnswer} onChange={e => setSecurityAnswer(e.target.value)} />
                  </div>
                  <button id="reg-submit" type="submit" className="btn-primary mt-2" disabled={isSubmitting}>
                    {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <><span>Create account</span><ArrowRight className="w-4 h-4" /></>}
                  </button>
                </form>
              </>
            )}

            {/* --- Forgot Password --- */}
            {mode === 'forgot' && (
              <>
                <div className="mb-7">
                  <button className="btn-ghost mb-4" onClick={() => switchMode('signin')}>
                    <ChevronLeft className="w-3.5 h-3.5" /> Back to sign in
                  </button>
                  <h2 className="text-xl font-black text-white">Reset password</h2>
                  <p className="text-slate-400 text-sm mt-1">
                    {forgotStep === 1 && "Enter your email to look up your security question."}
                    {forgotStep === 2 && "Answer your security question to verify your identity."}
                    {forgotStep === 3 && "Enter your reset code and new password."}
                  </p>
                </div>
                {error && <div className="mb-4 p-3 rounded-xl bg-red-950/40 border border-red-800/40 text-red-400 text-xs">{error}</div>}
                {infoMessage && <div className="mb-4 p-3 rounded-xl bg-emerald-950/40 border border-emerald-800/40 text-emerald-400 text-xs">{infoMessage}</div>}

                {forgotStep === 1 && (
                  <form onSubmit={handleForgotStep1} className="space-y-4" id="forgot-step1-form">
                    <div>
                      <label className="block text-xs font-semibold text-slate-400 mb-1.5">Email address</label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                        <input id="forgot-email" type="email" className="input-field pl-10" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} />
                      </div>
                    </div>
                    <button id="forgot-lookup-submit" type="submit" className="btn-primary" disabled={isSubmitting}>
                      {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <><span>Look up account</span><ArrowRight className="w-4 h-4" /></>}
                    </button>
                  </form>
                )}

                {forgotStep === 2 && (
                  <form onSubmit={handleForgotStep2} className="space-y-4" id="forgot-step2-form">
                    <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs font-medium">
                      <HelpCircle className="w-3.5 h-3.5 inline mr-1.5 mb-0.5" />{loadedQuestion}
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-400 mb-1.5">Your answer</label>
                      <input id="forgot-security-answer" type="text" autoComplete="off" className="input-field" placeholder="Case-insensitive" value={securityAnswer} onChange={e => setSecurityAnswer(e.target.value)} />
                    </div>
                    <button id="forgot-verify-submit" type="submit" className="btn-primary" disabled={isSubmitting}>
                      {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <><span>Verify answer</span><ArrowRight className="w-4 h-4" /></>}
                    </button>
                  </form>
                )}

                {forgotStep === 3 && (
                  <form onSubmit={handleResetPassword} className="space-y-4" id="reset-password-form">
                    <div>
                      <label className="block text-xs font-semibold text-slate-400 mb-1.5">Reset code</label>
                      <div className="relative">
                        <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                        <input id="reset-token" type="text" className="input-field pl-10" placeholder="6-digit code" value={resetToken} onChange={e => setResetToken(e.target.value)} />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-400 mb-1.5">New password</label>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
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

          {/* Footer */}
          <p className="text-center text-xs text-slate-600 mt-6">
            &copy; {new Date().getFullYear()} TechTrek · Secure · All data encrypted at rest
          </p>
        </div>
      </div>
    </div>
  );
}
