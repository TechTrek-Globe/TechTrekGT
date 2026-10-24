import React, { useEffect, useState } from 'react';
import { getApiUrl } from '../utils/api';
import { Loader2, CheckCircle2, AlertCircle, ArrowLeft } from 'lucide-react';

export function GmailCallback() {
  const [status, setStatus] = useState('processing'); // 'processing' | 'success' | 'error'
  const [message, setMessage] = useState('Exchanging authorization code with Google...');

  useEffect(() => {
    let isMounted = true;

    async function handleExchange() {
      const params = new URLSearchParams(window.location.search);
      const code = params.get('code');
      const state = params.get('state');
      const errorParam = params.get('error');

      if (errorParam) {
        if (isMounted) {
          setStatus('error');
          setMessage(`Google authorization denied: ${errorParam}`);
        }
        return;
      }

      if (!code || !state) {
        if (isMounted) {
          setStatus('error');
          setMessage('Missing OAuth authorization code or state parameter.');
        }
        return;
      }

      try {
        const res = await fetch(getApiUrl('/api/wayfinder/gmail/callback'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ code, state })
        });

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Failed to exchange Google OAuth code');
        }

        if (isMounted) {
          setStatus('success');
          setMessage(`Successfully connected ${data.email || 'Gmail'}! Redirecting to Document Center...`);
          setTimeout(() => {
            window.history.pushState({}, '', '/wayfinder/poland-christmas-2026/private/documents?gmail=connected');
            window.dispatchEvent(new PopStateEvent('popstate'));
          }, 1800);
        }
      } catch (err) {
        if (isMounted) {
          setStatus('error');
          setMessage(err.message || 'An unexpected error occurred during Google authentication.');
        }
      }
    }

    handleExchange();

    return () => {
      isMounted = false;
    };
  }, []);

  const returnToDocs = () => {
    window.history.pushState({}, '', '/wayfinder/poland-christmas-2026/private/documents');
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-wf-navy-mid border border-white/10 rounded-3xl p-8 glass-card shadow-2xl text-center space-y-6 animate-fade-in">
        {status === 'processing' && (
          <>
            <div className="w-16 h-16 rounded-2xl bg-wf-blue/20 border border-wf-blue/30 text-wf-blue-lt mx-auto flex items-center justify-center">
              <Loader2 className="w-8 h-8 animate-spin" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white mb-2">Connecting Gmail</h2>
              <p className="text-sm text-wf-muted">{message}</p>
            </div>
          </>
        )}

        {status === 'success' && (
          <>
            <div className="w-16 h-16 rounded-2xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 mx-auto flex items-center justify-center">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white mb-2">Connected Successfully!</h2>
              <p className="text-sm text-emerald-300">{message}</p>
            </div>
          </>
        )}

        {status === 'error' && (
          <>
            <div className="w-16 h-16 rounded-2xl bg-rose-500/20 border border-rose-500/30 text-rose-400 mx-auto flex items-center justify-center">
              <AlertCircle className="w-8 h-8" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white mb-2">Connection Failed</h2>
              <p className="text-sm text-rose-300 mb-6">{message}</p>
              <button
                onClick={returnToDocs}
                className="px-5 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-semibold flex items-center space-x-2 mx-auto transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Return to Documents</span>
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
