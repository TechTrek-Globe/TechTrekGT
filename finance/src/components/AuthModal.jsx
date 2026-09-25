import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { X, Lock, Mail, User, ShieldCheck, ArrowRight, Loader2, KeyRound, CheckCircle2, HelpCircle } from 'lucide-react';

export const PRESET_SECURITY_QUESTIONS = [
  "What was the name of your first pet?",
  "What is your mother's maiden name?",
  "What was the name of your elementary school?",
  "What city were you born in?",
  "What was the make of your first car?",
  "What is your favorite book or movie?"
];

export default function AuthModal() {
  const { 
    user, 
    isAuthenticated,
    isAuthModalOpen, 
    setIsAuthModalOpen, 
    login, 
    register, 
    getSecurityQuestion, 
    forgotPassword, 
    resetPassword 
  } = useAuth();
  
  // mode: 'signin' | 'register' | 'forgot' | 'reset'
  const [mode, setMode] = useState('signin');
  
  // Form fields
  const [name, setName] = useState('');
  const [rememberMe, setRememberMe] = useState(() => {
    try {
      return Boolean(localStorage.getItem('techtrek_saved_email'));
    } catch (e) {
      return false;
    }
  });
  const [email, setEmail] = useState(() => {
    try {
      return localStorage.getItem('techtrek_saved_email') || '';
    } catch (e) {
      return '';
    }
  });
  const [password, setPassword] = useState('');
  const [securityQuestion, setSecurityQuestion] = useState(PRESET_SECURITY_QUESTIONS[0]);
  const [securityAnswer, setSecurityAnswer] = useState('');
  
  // Reset password state
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  
  const [error, setError] = useState('');
  const [infoMessage, setInfoMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const interval = setInterval(() => {
      setResendCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [resendCooldown]);

  if (!isAuthModalOpen) return null;

  const switchMode = (newMode) => {
    setMode(newMode);
    setError('');
    setInfoMessage('');
    setResetToken('');
    setSecurityAnswer('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setInfoMessage('');
    setIsSubmitting(true);

    try {
      if (mode === 'register') {
        if (!securityQuestion || !securityAnswer.trim()) {
          setError('Please select a security question and provide an answer.');
          setIsSubmitting(false);
          return;
        }
        await register(name, email, password, securityQuestion, securityAnswer, rememberMe);
        if (rememberMe && email) {
          try { localStorage.setItem('techtrek_saved_email', email); } catch (e) {}
        } else {
          try { localStorage.removeItem('techtrek_saved_email'); } catch (e) {}
        }
      } else if (mode === 'signin') {
        await login(email, password, rememberMe);
        if (rememberMe && email) {
          try { localStorage.setItem('techtrek_saved_email', email); } catch (e) {}
        } else {
          try { localStorage.removeItem('techtrek_saved_email'); } catch (e) {}
        }
      } else if (mode === 'forgot') {
        const res = await forgotPassword(email);
        setInfoMessage(res.message || 'If an account exists for that address, a reset code has been sent to it.');
        setResetToken('');
        setResendCooldown(60);
        setMode('reset');
      } else if (mode === 'reset') {
        const res = await resetPassword(email, resetToken, newPassword, securityAnswer);
        setInfoMessage(res.message || 'Password updated successfully! Sign in with your new password.');
        setPassword('');
        setNewPassword('');
        setResetToken('');
        setSecurityAnswer('');
        setMode('signin');
      }
    } catch (err) {
      setError(err.message || 'An error occurred. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fadeIn overflow-y-auto">
      <div className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden text-slate-100 max-h-[90vh] overflow-y-auto my-auto">
        
        {/* Header decoration */}
        <div className="absolute -top-24 -left-24 w-48 h-48 bg-emerald-500/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-blue-500/20 rounded-full blur-3xl pointer-events-none" />

        {/* Modal Header */}
        <div className="relative flex items-center justify-between p-6 border-b border-slate-800/80">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-slate-800/90 border border-slate-700/60 rounded-xl text-emerald-400 shadow-inner">
              {mode === 'forgot' || mode === 'reset' ? (
                <KeyRound className="w-5 h-5" />
              ) : (
                <ShieldCheck className="w-5 h-5" />
              )}
            </div>
            <div>
              <h3 className="text-lg font-semibold text-slate-100">
                {mode === 'register' && 'Create Your Account'}
                {mode === 'signin' && 'Welcome Back'}
                {mode === 'forgot' && 'Reset Password'}
                {mode === 'reset' && 'Set New Password'}
              </h3>
              <p className="text-xs text-slate-400">
                {mode === 'register' && 'Required: Email, Name & Security Question'}
                {mode === 'signin' && 'Sign in to access your personal dashboard'}
                {mode === 'forgot' && 'Enter your registered email address to receive a reset code'}
                {mode === 'reset' && 'Enter your reset code and new password'}
              </p>
            </div>
          </div>
          {isAuthenticated && user && (
            <button
              type="button"
              onClick={() => setIsAuthModalOpen(false)}
              className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 relative">
          {error && (
            <div className="p-3 bg-red-950/60 border border-red-800/80 rounded-xl text-red-300 text-xs flex items-center space-x-2">
              <span className="font-semibold">Error:</span>
              <span>{error}</span>
            </div>
          )}

          {infoMessage && (
            <div className="p-3 bg-emerald-950/60 border border-emerald-800/80 rounded-xl text-emerald-300 text-xs flex items-center space-x-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
              <span>{infoMessage}</span>
            </div>
          )}

          {mode === 'register' && (
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">Full Name</label>
              <div className="relative">
                <User className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Alex Morgan"
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-950/80 border border-slate-800 rounded-xl text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500/80 focus:ring-1 focus:ring-emerald-500/80 transition-all"
                />
              </div>
            </div>
          )}

          {(mode === 'signin' || mode === 'register' || mode === 'forgot' || mode === 'reset') && (
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">Email Address</label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
                <input
                  type="email"
                  required
                  disabled={mode === 'reset'}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-950/80 border border-slate-800 rounded-xl text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500/80 focus:ring-1 focus:ring-emerald-500/80 transition-all disabled:opacity-60"
                />
              </div>
            </div>
          )}

          {(mode === 'signin' || mode === 'register') && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-medium text-slate-300">Password</label>
                {mode === 'signin' && (
                  <button
                    type="button"
                    onClick={() => switchMode('forgot')}
                    className="text-xs text-emerald-400 hover:text-emerald-300 hover:underline transition-colors"
                  >
                    Forgot Password?
                  </button>
                )}
              </div>
              <div className="relative">
                <Lock className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
                <input
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-950/80 border border-slate-800 rounded-xl text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500/80 focus:ring-1 focus:ring-emerald-500/80 transition-all"
                />
              </div>
            </div>
          )}

          {/* Security Question Section on Sign Up */}
          {mode === 'register' && (
            <>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">Security Question (Required for Recovery)</label>
                <div className="relative">
                  <HelpCircle className="absolute left-3.5 top-3 w-4 h-4 text-slate-400 pointer-events-none" />
                  <select
                    value={securityQuestion}
                    onChange={(e) => setSecurityQuestion(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-emerald-500/80 focus:ring-1 focus:ring-emerald-500/80 transition-all"
                  >
                    {PRESET_SECURITY_QUESTIONS.map((q, idx) => (
                      <option key={idx} value={q}>{q}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">Security Answer</label>
                <div className="relative">
                  <KeyRound className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    required
                    value={securityAnswer}
                    onChange={(e) => setSecurityAnswer(e.target.value)}
                    placeholder="Your secret answer"
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-950/80 border border-slate-800 rounded-xl text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500/80 focus:ring-1 focus:ring-emerald-500/80 transition-all"
                  />
                </div>
              </div>
            </>
          )}

          {mode === 'reset' && (
            <>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-medium text-slate-300">8-Digit Reset Code (From Email)</label>
                  <button
                    type="button"
                    disabled={resendCooldown > 0 || isSubmitting}
                    onClick={async () => {
                      try {
                        setIsSubmitting(true);
                        setError('');
                        await forgotPassword(email);
                        setResendCooldown(60);
                        setInfoMessage('If an account exists, a new reset code has been sent to your email.');
                      } catch (err) {
                        setError(err.message || 'Failed to resend reset code.');
                      } finally {
                        setIsSubmitting(false);
                      }
                    }}
                    className="text-xs text-emerald-400 hover:text-emerald-300 disabled:text-slate-500 disabled:cursor-not-allowed transition-colors"
                  >
                    {resendCooldown > 0 ? `Resend Code (${resendCooldown}s)` : 'Resend Code'}
                  </button>
                </div>
                <div className="relative">
                  <KeyRound className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    required
                    maxLength={8}
                    value={resetToken}
                    onChange={(e) => setResetToken(e.target.value.replace(/\D/g, ''))}
                    placeholder="e.g. 12345678"
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-950/80 border border-slate-800 rounded-xl text-sm text-slate-100 font-mono tracking-wider placeholder-slate-500 focus:outline-none focus:border-emerald-500/80 focus:ring-1 focus:ring-emerald-500/80 transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">Security Answer (if set on your account)</label>
                <div className="relative">
                  <HelpCircle className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    value={securityAnswer}
                    onChange={(e) => setSecurityAnswer(e.target.value)}
                    placeholder="Enter your security answer"
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-950/80 border border-slate-800 rounded-xl text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500/80 focus:ring-1 focus:ring-emerald-500/80 transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">New Password</label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
                  <input
                    type="password"
                    required
                    minLength={8}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Min 8 chars, 1 upper, 1 number"
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-950/80 border border-slate-800 rounded-xl text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500/80 focus:ring-1 focus:ring-emerald-500/80 transition-all"
                  />
                </div>
                <p className="text-[11px] text-slate-500 mt-1">Must contain at least 8 characters, 1 uppercase letter, and 1 number.</p>
              </div>
            </>
          )}

          {(mode === 'signin' || mode === 'register') && (
            <div className="flex items-center pt-1">
              <input
                id="remember_me"
                name="remember_me"
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="h-4 w-4 rounded border-slate-800 bg-slate-950/80 text-emerald-600 focus:ring-emerald-500 focus:ring-opacity-25 accent-emerald-600 cursor-pointer"
              />
              <label htmlFor="remember_me" className="ml-2 block text-xs text-slate-300 select-none cursor-pointer">
                Remember me
              </label>
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full mt-2 py-3 px-4 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-medium text-sm rounded-xl shadow-lg shadow-emerald-950/50 flex items-center justify-center space-x-2 transition-all cursor-pointer"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Processing...</span>
              </>
            ) : (
              <>
                <span>
                  {mode === 'register' && 'Create Account'}
                  {mode === 'signin' && 'Sign In'}
                  {mode === 'forgot' && 'Send Reset Code'}
                  {mode === 'reset' && 'Reset Password'}
                </span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        {/* Footer Toggle */}
        <div className="p-4 bg-slate-950/40 border-t border-slate-800/80 text-center text-xs text-slate-400 flex items-center justify-center space-x-4">
          {mode === 'register' && (
            <p>
              Already have an account?{' '}
              <button
                type="button"
                onClick={() => switchMode('signin')}
                className="text-emerald-400 font-medium hover:underline ml-1"
              >
                Sign In
              </button>
            </p>
          )}

          {mode === 'signin' && (
            <p>
              Don't have an account yet?{' '}
              <button
                type="button"
                onClick={() => switchMode('register')}
                className="text-emerald-400 font-medium hover:underline ml-1"
              >
                Create Account
              </button>
            </p>
          )}

          {(mode === 'forgot' || mode === 'reset') && (
            <div className="flex items-center space-x-4">
              <button
                type="button"
                onClick={() => switchMode('signin')}
                className="text-emerald-400 font-medium hover:underline"
              >
                Back to Sign In
              </button>
              {mode === 'reset' && (
                <button
                  type="button"
                  onClick={() => { switchMode('forgot'); setError(''); }}
                  className="text-slate-400 hover:text-slate-200 hover:underline"
                >
                  Change Email
                </button>
              )}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
