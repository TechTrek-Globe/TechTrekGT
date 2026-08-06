import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { 
  ShieldCheck, 
  Lock, 
  Mail, 
  User, 
  ArrowRight, 
  Loader2, 
  KeyRound, 
  CheckCircle2, 
  HelpCircle,
  Globe,
  TrendingUp,
  ReceiptText,
  Calculator,
  ChevronLeft
} from 'lucide-react';
import headerLogoDark from '../assets/header-logo-dark.png';

export const PRESET_SECURITY_QUESTIONS = [
  "What was the name of your first pet?",
  "What is your mother's maiden name?",
  "What was the name of your elementary school?",
  "What city were you born in?",
  "What was the make of your first car?",
  "What is your favorite book or movie?"
];

export function AuthPage({ onNavigateHome, onAuthSuccess }) {
  const { 
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
  
  // Forgot password step state
  const [forgotStep, setForgotStep] = useState(1);
  const [loadedQuestion, setLoadedQuestion] = useState('');
  
  // Reset password state
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

  const handleFetchQuestion = async (e) => {
    if (e) e.preventDefault();
    if (!email) {
      setError('Please enter your email address.');
      return;
    }

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
          setIsSubmitting(false);
          return;
        }
        await register(name, email, password, securityQuestion, securityAnswer, rememberMe);
        if (rememberMe && email) {
          try { localStorage.setItem('techtrek_saved_email', email); } catch (e) {}
        } else {
          try { localStorage.removeItem('techtrek_saved_email'); } catch (e) {}
        }
        if (onAuthSuccess) onAuthSuccess();
      } else if (mode === 'signin') {
        await login(email, password, rememberMe);
        if (rememberMe && email) {
          try { localStorage.setItem('techtrek_saved_email', email); } catch (e) {}
        } else {
          try { localStorage.removeItem('techtrek_saved_email'); } catch (e) {}
        }
        if (onAuthSuccess) onAuthSuccess();
      } else if (mode === 'forgot') {
        if (forgotStep === 1) {
          await handleFetchQuestion();
          return;
        }
        const res = await forgotPassword(email, securityAnswer);
        setInfoMessage(res.message || 'Security answer verified! Reset code generated.');
        if (res.resetToken) {
          setResetToken(res.resetToken);
        }
        setMode('reset');
      } else if (mode === 'reset') {
        const res = await resetPassword(email, resetToken, newPassword);
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
    <div className="min-h-screen bg-slate-950 text-slate-100 selection:bg-blue-500 selection:text-white flex flex-col font-sans relative overflow-x-hidden">
      {/* Background glow effects */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-blue-600/15 rounded-full blur-3xl" />
        <div className="absolute top-1/3 -right-40 w-96 h-96 bg-indigo-600/15 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 left-1/3 w-96 h-96 bg-emerald-600/15 rounded-full blur-3xl" />
      </div>

      {/* Navigation Header */}
      <header className="sticky top-0 z-40 glass-panel border-b border-slate-800/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <img src={headerLogoDark} alt="TechTrek Finance" className="h-10 w-auto object-contain" />
            <span className="hidden sm:inline-block px-2.5 py-0.5 text-[10px] font-semibold bg-blue-500/10 text-blue-400 rounded-full border border-blue-500/20">
              Account Authentication Gateway
            </span>
          </div>

          <button
            type="button"
            onClick={onNavigateHome}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 text-xs font-semibold border border-slate-800 transition-colors cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>Platform Portal</span>
          </button>
        </div>
      </header>

      {/* Main Authentication Section */}
      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 lg:py-16 relative z-10 w-full flex items-center justify-center">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center w-full max-w-5xl">
          
          {/* Left Column: Branding & Feature Overview */}
          <div className="lg:col-span-6 space-y-6">
            <div className="inline-flex items-center space-x-2 px-3.5 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium">
              <ShieldCheck className="w-4 h-4" />
              <span>TechTrek Security Protocol</span>
            </div>

            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight text-white leading-tight">
              Access Your <span className="gradient-text">Finance Dashboard</span>
            </h1>

            <p className="text-sm sm:text-base text-slate-300 leading-relaxed">
              Sign in to unlock your personal bi-weekly cash flow matrix, automated bill splits, and interactive loan amortization projections.
            </p>

            <div className="space-y-4 pt-2">
              <div className="flex items-start space-x-3.5">
                <div className="p-2 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400 shrink-0 mt-0.5">
                  <TrendingUp className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-100">Bi-Weekly Payday Matrix</h4>
                  <p className="text-xs text-slate-400">Synchronize multi-earner cash inflows with precision calendar math.</p>
                </div>
              </div>

              <div className="flex items-start space-x-3.5">
                <div className="p-2 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 shrink-0 mt-0.5">
                  <ReceiptText className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-100">Dynamic Bill Splits</h4>
                  <p className="text-xs text-slate-400">Weighted expense sharing with account-level tracking.</p>
                </div>
              </div>

              <div className="flex items-start space-x-3.5">
                <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 shrink-0 mt-0.5">
                  <Calculator className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-100">Loan Amortization Engine</h4>
                  <p className="text-xs text-slate-400">Model principal paydowns and interest savings over time.</p>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Authentication Card */}
          <div className="lg:col-span-6 w-full">
            <div className="relative group">
              <div className="absolute -inset-0.5 bg-gradient-to-r from-blue-600 via-indigo-500 to-emerald-500 rounded-3xl opacity-60 blur-xl" />

              <div className="relative rounded-3xl bg-slate-900/90 border border-slate-800 p-8 shadow-2xl backdrop-blur-xl text-slate-100">
                
                {/* Form Tab Controls */}
                <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-6">
                  <div className="flex space-x-2">
                    <button
                      type="button"
                      onClick={() => switchMode('signin')}
                      className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                        mode === 'signin'
                          ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30 shadow-inner'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Sign In
                    </button>
                    <button
                      type="button"
                      onClick={() => switchMode('register')}
                      className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                        mode === 'register'
                          ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 shadow-inner'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Create Account
                    </button>
                  </div>

                  <span className="text-[10px] font-mono px-2 py-1 rounded bg-slate-800 text-slate-400 border border-slate-700">
                    {mode === 'signin' && 'Sign In'}
                    {mode === 'register' && 'New User'}
                    {mode === 'forgot' && 'Recovery'}
                    {mode === 'reset' && 'Reset Password'}
                  </span>
                </div>

                {/* Authentication Form */}
                <form onSubmit={handleSubmit} className="space-y-4">
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
                          disabled={mode === 'forgot' && forgotStep === 2}
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="you@example.com"
                          className="w-full pl-10 pr-4 py-2.5 bg-slate-950/80 border border-slate-800 rounded-xl text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500/80 focus:ring-1 focus:ring-blue-500/80 transition-all disabled:opacity-60"
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
                            className="text-xs text-blue-400 hover:text-blue-300 hover:underline transition-colors"
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
                          className="w-full pl-10 pr-4 py-2.5 bg-slate-950/80 border border-slate-800 rounded-xl text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500/80 focus:ring-1 focus:ring-blue-500/80 transition-all"
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

                  {/* Security Question Prompt on Forgot Password Step 2 */}
                  {mode === 'forgot' && forgotStep === 2 && (
                    <div>
                      <label className="block text-xs font-medium text-emerald-400 mb-1">
                        Security Question:
                      </label>
                      <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 mb-3 font-medium">
                        {loadedQuestion}
                      </div>

                      <label className="block text-xs font-medium text-slate-300 mb-1.5">Security Answer</label>
                      <div className="relative">
                        <KeyRound className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
                        <input
                          type="text"
                          required
                          value={securityAnswer}
                          onChange={(e) => setSecurityAnswer(e.target.value)}
                          placeholder="Enter your security answer"
                          className="w-full pl-10 pr-4 py-2.5 bg-slate-950/80 border border-slate-800 rounded-xl text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500/80 focus:ring-1 focus:ring-blue-500/80 transition-all"
                        />
                      </div>
                    </div>
                  )}

                  {mode === 'reset' && (
                    <>
                      <div>
                        <label className="block text-xs font-medium text-slate-300 mb-1.5">Verification Reset Code</label>
                        <div className="relative">
                          <KeyRound className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
                          <input
                            type="text"
                            required
                            value={resetToken}
                            onChange={(e) => setResetToken(e.target.value)}
                            placeholder="e.g. 649201"
                            className="w-full pl-10 pr-4 py-2.5 bg-slate-950/80 border border-slate-800 rounded-xl text-sm text-slate-100 font-mono tracking-wider placeholder-slate-500 focus:outline-none focus:border-blue-500/80 focus:ring-1 focus:ring-blue-500/80 transition-all"
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
                            className="w-full pl-10 pr-4 py-2.5 bg-slate-950/80 border border-slate-800 rounded-xl text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500/80 focus:ring-1 focus:ring-blue-500/80 transition-all"
                          />
                        </div>
                      </div>
                    </>
                  )}

                  {(mode === 'signin' || mode === 'register') && (
                    <div className="flex items-center pt-1">
                      <input
                        id="auth_page_remember_me"
                        name="remember_me"
                        type="checkbox"
                        checked={rememberMe}
                        onChange={(e) => setRememberMe(e.target.checked)}
                        className="h-4 w-4 rounded border-slate-800 bg-slate-950/80 text-blue-600 focus:ring-blue-500 focus:ring-opacity-25 accent-blue-600 cursor-pointer"
                      />
                      <label htmlFor="auth_page_remember_me" className="ml-2 block text-xs text-slate-300 select-none cursor-pointer">
                        Remember me on this browser
                      </label>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full mt-2 py-3.5 px-4 bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 disabled:opacity-50 text-white font-bold text-sm rounded-xl shadow-lg shadow-blue-950/50 flex items-center justify-center space-x-2 transition-all cursor-pointer"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Processing...</span>
                      </>
                    ) : (
                      <>
                        <span>
                          {mode === 'register' && 'Create Account & Access Dashboard'}
                          {mode === 'signin' && 'Sign In to Dashboard'}
                          {mode === 'forgot' && (forgotStep === 1 ? 'Verify Email' : 'Verify Answer & Reset')}
                          {mode === 'reset' && 'Reset Password'}
                        </span>
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </form>

                {/* Footer Mode Switcher */}
                <div className="mt-6 pt-4 border-t border-slate-800/80 text-center text-xs text-slate-400">
                  {mode === 'register' && (
                    <p>
                      Already registered?{' '}
                      <button
                        type="button"
                        onClick={() => switchMode('signin')}
                        className="text-blue-400 font-medium hover:underline ml-1"
                      >
                        Sign In Here
                      </button>
                    </p>
                  )}

                  {mode === 'signin' && (
                    <p>
                      Need a TechTrek Finance account?{' '}
                      <button
                        type="button"
                        onClick={() => switchMode('register')}
                        className="text-blue-400 font-medium hover:underline ml-1"
                      >
                        Create Account
                      </button>
                    </p>
                  )}

                  {(mode === 'forgot' || mode === 'reset') && (
                    <div className="flex items-center justify-center space-x-4">
                      <button
                        type="button"
                        onClick={() => switchMode('signin')}
                        className="text-blue-400 font-medium hover:underline"
                      >
                        Back to Sign In
                      </button>
                      {mode === 'forgot' && forgotStep === 2 && (
                        <button
                          type="button"
                          onClick={() => { setForgotStep(1); setError(''); }}
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
          </div>

        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800/80 py-6 bg-slate-950/80 relative z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
          <div className="flex items-center space-x-2">
            <div className="w-2 h-2 rounded-full bg-emerald-400" />
            <span>TechTrekGT Cloud Platform</span>
          </div>
          <div>
            <span>&copy; {new Date().getFullYear()} TechTrekGT. All rights reserved.</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
