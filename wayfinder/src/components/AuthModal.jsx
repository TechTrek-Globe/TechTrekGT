import React, { useState } from 'react';
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

export function AuthModal() {
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
  
  const [mode, setMode] = useState('signin');
  
  const [name, setName] = useState('');
  const [rememberMe, setRememberMe] = useState(() => {
    try { return Boolean(localStorage.getItem('wayfinder_saved_email')); } catch (e) { return false; }
  });
  const [email, setEmail] = useState(() => {
    try { return localStorage.getItem('wayfinder_saved_email') || ''; } catch (e) { return ''; }
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

  if (!isAuthModalOpen) return null;

  const switchMode = (newMode) => {
    setMode(newMode);
    setError('');
    setInfoMessage('');
    setForgotStep(1);
    setLoadedQuestion('');
  };

  const handleFetchQuestion = async (e) => {
    if (e) e.preventDefault();
    if (!email) { setError('Please enter your email address.'); return; }

    setError('');
    setIsSubmitting(true);
    try {
      const res = await getSecurityQuestion(email);
      if (res.securityQuestion) {
        setLoadedQuestion(res.securityQuestion);
        setForgotStep(2);
      } else {
        setLoadedQuestion('Security Question Not Set (Legacy Account)');
        setForgotStep(2);
      }
    } catch (err) {
      setError(err.message || 'No account found with this email address.');
    } finally {
      setIsSubmitting(false);
    }
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
          setIsSubmitting(false); return;
        }
        await register(name, email, password, securityQuestion, securityAnswer, rememberMe);
        if (rememberMe && email) {
          try { localStorage.setItem('wayfinder_saved_email', email); } catch (e) {}
        } else {
          try { localStorage.removeItem('wayfinder_saved_email'); } catch (e) {}
        }
      } else if (mode === 'signin') {
        await login(email, password, rememberMe);
        if (rememberMe && email) {
          try { localStorage.setItem('wayfinder_saved_email', email); } catch (e) {}
        } else {
          try { localStorage.removeItem('wayfinder_saved_email'); } catch (e) {}
        }
      } else if (mode === 'forgot') {
        if (forgotStep === 1) { await handleFetchQuestion(); return; }
        const res = await forgotPassword(email, securityAnswer);
        setInfoMessage(res.message || 'Security answer verified! Reset code generated.');
        if (res.resetToken) setResetToken(res.resetToken);
        setMode('reset');
      } else if (mode === 'reset') {
        const res = await resetPassword(email, resetToken, newPassword);
        setInfoMessage(res.message || 'Password updated successfully! Sign in with your new password.');
        setPassword(''); setNewPassword(''); setResetToken(''); setSecurityAnswer('');
        setMode('signin');
      }
    } catch (err) {
      setError(err.message || 'An error occurred. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-wf-navy/90 backdrop-blur-md animate-fade-in overflow-y-auto">
      <div className="relative w-full max-w-md bg-wf-navy border border-wf-navy-lt rounded-2xl shadow-2xl overflow-hidden text-wf-text max-h-[90vh] overflow-y-auto my-auto glass-card">
        
        {/* Header decoration */}
        <div className="absolute -top-24 -left-24 w-48 h-48 bg-wf-blue/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-wf-amber/20 rounded-full blur-3xl pointer-events-none" />

        {/* Modal Header */}
        <div className="relative flex items-center justify-between p-6 border-b border-white/10">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-wf-navy-mid border border-wf-navy-lt rounded-xl text-wf-blue-lt shadow-inner">
              {mode === 'forgot' || mode === 'reset' ? <KeyRound className="w-5 h-5" /> : <ShieldCheck className="w-5 h-5" />}
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">
                {mode === 'register' && 'Create Your Account'}
                {mode === 'signin' && 'Welcome Back'}
                {mode === 'forgot' && 'Reset Password'}
                {mode === 'reset' && 'Set New Password'}
              </h3>
              <p className="text-xs text-wf-muted">
                {mode === 'register' && 'Required: Email, Name & Security Question'}
                {mode === 'signin' && 'Sign in to access your private itinerary hub'}
                {mode === 'forgot' && (forgotStep === 1 ? 'Enter your registered email address' : 'Answer your security question')}
                {mode === 'reset' && 'Enter your reset code and new password'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setIsAuthModalOpen(false)}
            className="p-1.5 text-wf-muted hover:text-white hover:bg-white/10 rounded-lg transition-colors"
            title="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
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
            <div className="p-3 bg-wf-evergreen/20 border border-wf-evergreen/50 rounded-xl text-emerald-300 text-xs flex items-center space-x-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
              <span>{infoMessage}</span>
            </div>
          )}

          {mode === 'register' && (
            <div>
              <label className="block text-xs font-medium text-wf-cream mb-1.5">Full Name</label>
              <div className="relative">
                <User className="absolute left-3.5 top-3 w-4 h-4 text-wf-subtle" />
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Alex Morgan"
                  className="w-full pl-10 pr-4 py-2.5 bg-wf-navy-mid border border-white/10 rounded-xl text-sm text-white placeholder-wf-subtle focus:outline-none focus:border-wf-blue focus:ring-1 focus:ring-wf-blue transition-all"
                />
              </div>
            </div>
          )}

          {(mode === 'signin' || mode === 'register' || mode === 'forgot' || mode === 'reset') && (
            <div>
              <label className="block text-xs font-medium text-wf-cream mb-1.5">Email Address</label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-3 w-4 h-4 text-wf-subtle" />
                <input
                  type="email"
                  required
                  disabled={mode === 'forgot' && forgotStep === 2}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full pl-10 pr-4 py-2.5 bg-wf-navy-mid border border-white/10 rounded-xl text-sm text-white placeholder-wf-subtle focus:outline-none focus:border-wf-blue focus:ring-1 focus:ring-wf-blue transition-all disabled:opacity-60"
                />
              </div>
            </div>
          )}

          {(mode === 'signin' || mode === 'register') && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-medium text-wf-cream">Password</label>
                {mode === 'signin' && (
                  <button
                    type="button"
                    onClick={() => switchMode('forgot')}
                    className="text-xs text-wf-blue-lt hover:text-white hover:underline transition-colors"
                  >
                    Forgot Password?
                  </button>
                )}
              </div>
              <div className="relative">
                <Lock className="absolute left-3.5 top-3 w-4 h-4 text-wf-subtle" />
                <input
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-10 pr-4 py-2.5 bg-wf-navy-mid border border-white/10 rounded-xl text-sm text-white placeholder-wf-subtle focus:outline-none focus:border-wf-blue focus:ring-1 focus:ring-wf-blue transition-all"
                />
              </div>
            </div>
          )}

          {/* Security Question Section on Sign Up */}
          {mode === 'register' && (
            <>
              <div>
                <label className="block text-xs font-medium text-wf-cream mb-1.5">Security Question (Required for Recovery)</label>
                <div className="relative">
                  <HelpCircle className="absolute left-3.5 top-3 w-4 h-4 text-wf-subtle pointer-events-none" />
                  <select
                    value={securityQuestion}
                    onChange={(e) => setSecurityQuestion(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 bg-wf-navy-mid border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:border-wf-blue transition-all"
                  >
                    {PRESET_SECURITY_QUESTIONS.map((q, idx) => (
                      <option key={idx} value={q}>{q}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-wf-cream mb-1.5">Security Answer</label>
                <div className="relative">
                  <KeyRound className="absolute left-3.5 top-3 w-4 h-4 text-wf-subtle" />
                  <input
                    type="text"
                    required
                    value={securityAnswer}
                    onChange={(e) => setSecurityAnswer(e.target.value)}
                    placeholder="Your secret answer"
                    className="w-full pl-10 pr-4 py-2.5 bg-wf-navy-mid border border-white/10 rounded-xl text-sm text-white placeholder-wf-subtle focus:outline-none focus:border-wf-blue transition-all"
                  />
                </div>
              </div>
            </>
          )}

          {/* Security Question Prompt on Forgot Password Step 2 */}
          {mode === 'forgot' && forgotStep === 2 && (
            <div>
              <label className="block text-xs font-medium text-wf-blue-lt mb-1">Security Question:</label>
              <div className="p-3 bg-wf-navy border border-white/10 rounded-xl text-xs text-white mb-3 font-medium">
                {loadedQuestion}
              </div>
              <label className="block text-xs font-medium text-wf-cream mb-1.5">Security Answer</label>
              <div className="relative">
                <KeyRound className="absolute left-3.5 top-3 w-4 h-4 text-wf-subtle" />
                <input
                  type="text"
                  required
                  value={securityAnswer}
                  onChange={(e) => setSecurityAnswer(e.target.value)}
                  placeholder="Enter your security answer"
                  className="w-full pl-10 pr-4 py-2.5 bg-wf-navy-mid border border-white/10 rounded-xl text-sm text-white placeholder-wf-subtle focus:outline-none focus:border-wf-blue transition-all"
                />
              </div>
            </div>
          )}

          {mode === 'reset' && (
            <>
              <div>
                <label className="block text-xs font-medium text-wf-cream mb-1.5">Verification Reset Code</label>
                <div className="relative">
                  <KeyRound className="absolute left-3.5 top-3 w-4 h-4 text-wf-subtle" />
                  <input
                    type="text"
                    required
                    value={resetToken}
                    onChange={(e) => setResetToken(e.target.value)}
                    placeholder="Paste your reset code here"
                    className="w-full pl-10 pr-4 py-2.5 bg-wf-navy-mid border border-white/10 rounded-xl text-sm text-white font-mono tracking-wider placeholder-wf-subtle focus:outline-none focus:border-wf-blue transition-all"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-wf-cream mb-1.5">New Password</label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-3 w-4 h-4 text-wf-subtle" />
                  <input
                    type="password"
                    required
                    minLength={8}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Min 8 chars, 1 upper, 1 number"
                    className="w-full pl-10 pr-4 py-2.5 bg-wf-navy-mid border border-white/10 rounded-xl text-sm text-white placeholder-wf-subtle focus:outline-none focus:border-wf-blue transition-all"
                  />
                </div>
              </div>
            </>
          )}

          {(mode === 'signin' || mode === 'register') && (
            <div className="flex items-center pt-1">
              <input
                id="remember_me"
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="h-4 w-4 rounded border-white/10 bg-wf-navy-mid text-wf-blue focus:ring-wf-blue accent-wf-blue cursor-pointer"
              />
              <label htmlFor="remember_me" className="ml-2 block text-xs text-wf-muted select-none cursor-pointer">
                Remember me
              </label>
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full mt-2 py-3 px-4 bg-gradient-to-r from-wf-blue to-wf-blue-lt hover:opacity-90 disabled:opacity-50 text-white font-medium text-sm rounded-xl shadow-lg flex items-center justify-center space-x-2 transition-all cursor-pointer"
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
                  {mode === 'forgot' && (forgotStep === 1 ? 'Verify Email' : 'Verify Answer & Reset')}
                  {mode === 'reset' && 'Reset Password'}
                </span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        <div className="p-4 bg-wf-navy-mid/30 border-t border-white/5 text-center text-xs text-wf-muted flex items-center justify-center space-x-4">
          {mode === 'register' && (
            <p>Already have an account? <button type="button" onClick={() => switchMode('signin')} className="text-wf-blue-lt font-medium hover:underline ml-1">Sign In</button></p>
          )}
          {mode === 'signin' && (
            <p>Don't have an account yet? <button type="button" onClick={() => switchMode('register')} className="text-wf-blue-lt font-medium hover:underline ml-1">Create Account</button></p>
          )}
          {(mode === 'forgot' || mode === 'reset') && (
            <div className="flex items-center space-x-4">
              <button type="button" onClick={() => switchMode('signin')} className="text-wf-blue-lt font-medium hover:underline">Back to Sign In</button>
              {mode === 'forgot' && forgotStep === 2 && (
                <button type="button" onClick={() => { setForgotStep(1); setError(''); }} className="text-wf-muted hover:text-white hover:underline">Change Email</button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
