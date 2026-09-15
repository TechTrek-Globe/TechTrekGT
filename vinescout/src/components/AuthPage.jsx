import { useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { Leaf, Lock, Mail, Loader2, ArrowRight } from 'lucide-react';

export default function AuthPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email || !password) { setError('Email and password required.'); return; }
    setLoading(true); setError('');
    try {
      await login(email, password, true);
    } catch (err) {
      setError(err.message || 'Login failed.');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface flex flex-col justify-center py-12 sm:px-6 lg:px-8 relative overflow-hidden animate-fade-in-up">
      {/* Background decoration */}
      <div className="absolute top-[-10%] left-[-10%] w-96 h-96 bg-vs-500/10 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[30rem] h-[30rem] bg-indigo-500/10 rounded-full blur-[120px] pointer-events-none" />

      <div className="sm:mx-auto sm:w-full sm:max-w-md relative z-10">
        <div className="flex justify-center mb-6">
          <div className="w-16 h-16 bg-surface-card border border-surface-border rounded-2xl flex items-center justify-center shadow-xl shadow-vs-900/20">
            <Leaf className="w-8 h-8 text-vs-500" />
          </div>
        </div>
        <h2 className="text-center text-3xl font-bold tracking-tight text-white mb-2">
          Welcome to VScout
        </h2>
        <p className="text-center text-sm text-slate-400">
          Sign in with your TechTrekGT account
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md relative z-10">
        <div className="vs-card mx-4 sm:mx-0 shadow-2xl">
          <form className="space-y-6" onSubmit={handleSubmit}>
            {error && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-sm text-red-400 text-center">
                {error}
              </div>
            )}
            
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Email Address</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Mail className="h-5 w-5 text-slate-500" />
                </div>
                <input
                  type="email" required
                  className="vs-input pl-10"
                  placeholder="you@example.com"
                  value={email} onChange={e => setEmail(e.target.value)}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Password</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-slate-500" />
                </div>
                <input
                  type="password" required
                  className="vs-input pl-10"
                  placeholder="••••••••"
                  value={password} onChange={e => setPassword(e.target.value)}
                />
              </div>
            </div>

            <button
              type="submit" disabled={loading}
              className="w-full vs-btn-primary flex justify-center py-2.5"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : (
                <>Sign In <ArrowRight className="w-4 h-4 ml-1" /></>
              )}
            </button>
          </form>

          <div className="mt-6 pt-6 border-t border-surface-border text-center">
            <p className="text-xs text-slate-500">
              VScout uses shared TechTrekGT SSO. To register a new account, visit the <a href="https://techtrekgt.com" className="text-vs-400 hover:text-vs-300">TechTrekGT Landing Hub</a>.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
