import React, { createContext, useContext, useState, useEffect } from 'react';
import { getApiUrl, apiFetch, setCsrfToken, getCsrfToken } from '../utils/api';

import { isNetworkError } from '../utils/networkError';
import { getCurrentUserId } from '../utils/indexedDB';

/** @type {React.Context<any>} */
const AuthContext = createContext(null);

/**
 * @param {{ children: React.ReactNode }} props
 */
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [csrfToken, setCsrfTokenState] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [currentUserId, setCurrentUserId] = useState(null);

  // CRIT-002: Track the signed-in user id so budget/sync state can be scoped.
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try { window.sessionStorage.setItem('tt_signed_in_user_id', user?.id || ''); } catch {}
    }
  }, [user]);

  // Handle global session expiry (token_version bump on other device or timeout)
  useEffect(() => {
    const handleSessionExpired = (e) => {
      console.warn('[auth] Session expired event received:', e.detail);
      sessionStorage.removeItem('personal_budget_last_activity');
      try { window.sessionStorage.removeItem('tt_signed_in_user_id'); } catch {}
      setIsAuthenticated(false);
      setUser(null);
      setCsrfTokenState(null);
      setCsrfToken(null);
      setCurrentUserId(null);
      // Dispatch user-logout event so LedgerDataContext can clean up user-scoped data
      window.dispatchEvent(new CustomEvent('techtrek:user-logout', { detail: { userId: e?.detail?.userId || null, reason: 'session-expired' } }));
      setIsAuthModalOpen(true);
      if (typeof window !== 'undefined') {
        window.history.pushState({}, '', '/finance');
      }
    };
    window.addEventListener('techtrek:session-expired', handleSessionExpired);
    return () => window.removeEventListener('techtrek:session-expired', handleSessionExpired);
  }, []);

  // Restore session on mount via /api/auth/me
  useEffect(() => {
    (async () => {
      try {
        const res = await apiFetch('/api/auth/me');
        if (res.ok) {
          const data = await res.json().catch(() => ({}));
          if (data.user) {
            setUser(data.user);
            setCurrentUserId(data.user.id || null);
            if (typeof window !== 'undefined') {
              try { window.sessionStorage.setItem('tt_signed_in_user_id', data.user.id || ''); } catch {}
            }
            if (data.csrfToken) {
              setCsrfTokenState(data.csrfToken);
              setCsrfToken(data.csrfToken);
            }
            setIsAuthenticated(true);
            setIsAuthModalOpen(false);
          }
        }
      } catch (e) {
        // No active session or network offline
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  // Inactivity timeout handler (event-driven timer reset)
  useEffect(() => {
    if (!isAuthenticated) return;

    const INACTIVITY_TIMEOUT = 15 * 60 * 1000; // 15 minutes
    const STORAGE_THROTTLE_MS = 10 * 1000; // Throttle sessionStorage writes to at most once per 10s
    let lastStorageWrite = 0;
    let timer;

    const resetTimer = () => {
      clearTimeout(timer);
      const now = Date.now();
      if (now - lastStorageWrite > STORAGE_THROTTLE_MS) {
        sessionStorage.setItem('personal_budget_last_activity', now.toString());
        lastStorageWrite = now;
      }
      timer = setTimeout(() => {
        logout();
        setIsAuthModalOpen(true);
      }, INACTIVITY_TIMEOUT);
    };

    const activityEvents = ['mousedown', 'keydown', 'scroll', 'touchstart', 'click'];
    activityEvents.forEach(event => {
      window.addEventListener(event, resetTimer, { passive: true });
    });

    resetTimer();

    return () => {
      clearTimeout(timer);
      activityEvents.forEach(event => {
        window.removeEventListener(event, resetTimer);
      });
    };
  }, [isAuthenticated]);

  // P15: Proactive token refresh every 90 minutes and on tab re-focus.
  // The /api/auth/me endpoint already re-issues a token when < 30 min remain;
  // calling it periodically prevents silent expiry during long single-page sessions.
  useEffect(() => {
    if (!isAuthenticated) return;

    const REFRESH_INTERVAL_MS = 90 * 60 * 1000; // 90 minutes

    const refreshSession = async () => {
      try {
        const res = await apiFetch('/api/auth/me');
        if (res.ok) {
          const data = await res.json().catch(() => ({}));
          if (data.csrfToken) {
            setCsrfTokenState(data.csrfToken);
            setCsrfToken(data.csrfToken);
          }
        }
      } catch {
        // Network error - do nothing; inactivity timer will handle timeout
      }
    };

    const intervalId = setInterval(refreshSession, REFRESH_INTERVAL_MS);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refreshSession();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isAuthenticated]);

  /**
   * @param {string} email
   * @param {string} password
   * @param {boolean} rememberMe
   */
  /**
   * @param {string} email
   * @param {string} password
   * @param {boolean} rememberMe
   */
  const login = async (email, password, rememberMe = false) => {
    try {
      const res = await apiFetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, rememberMe })
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || `Login failed (HTTP ${res.status})`);
      }

      setIsAuthenticated(true);
      setUser(data.user);
      setCurrentUserId(data.user?.id || null);
      if (data.csrfToken) {
        setCsrfTokenState(data.csrfToken);
        setCsrfToken(data.csrfToken);
      }
      setIsAuthModalOpen(false);
      return data;
    } catch (err) {
      if (isNetworkError(err)) {
        throw new Error('We could not reach the server. Check your connection and try again.', { cause: err });
      }
      throw err;
    }
  };

  /**
   * @param {string} name
   * @param {string} email
   * @param {string} password
   * @param {string} securityQuestion
   * @param {string} securityAnswer
   * @param {boolean} rememberMe
   */
  const register = async (name, email, password, securityQuestion, securityAnswer, rememberMe = false) => {
    try {
      const res = await apiFetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password, securityQuestion, securityAnswer, rememberMe })
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || `Registration failed (HTTP ${res.status})`);
      }

      setIsAuthenticated(true);
      setUser(data.user);
      setCurrentUserId(data.user?.id || null);
      if (data.csrfToken) {
        setCsrfTokenState(data.csrfToken);
        setCsrfToken(data.csrfToken);
      }
      setIsAuthModalOpen(false);
      return data;
    } catch (err) {
      if (isNetworkError(err)) {
        throw new Error('We could not reach the server. Check your connection and try again.', { cause: err });
      }
      throw err;
    }
  };

  const getSecurityQuestion = async () => {
    const res = await apiFetch('/api/auth/security-question', {
      method: 'GET'
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || `Failed to fetch security question (HTTP ${res.status})`);
    }
    return data;
  };

  const forgotPassword = async (email, securityAnswer) => {
    const res = await apiFetch('/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, securityAnswer })
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || `Failed to process reset request (HTTP ${res.status})`);
    }
    return data;
  };

  const resetPassword = async (email, token, newPassword, securityAnswer = '') => {
    const res = await apiFetch('/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, token, newPassword, securityAnswer })
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || `Failed to reset password (HTTP ${res.status})`);
    }
    return data;
  };

  const updateProfile = async (profileData) => {
    const res = await apiFetch('/api/auth/update-profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(profileData)
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || `Failed to update profile (HTTP ${res.status})`);
    }
    if (data.user) {
      setUser(data.user);
    }
    if (data.csrfToken) {
      setCsrfTokenState(data.csrfToken);
      setCsrfToken(data.csrfToken);
    }
    return data;
  };

  const verifyEmail = async (code) => {
    const res = await apiFetch('/api/auth/verify-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || `Failed to verify email (HTTP ${res.status})`);
    }
    setUser(prev => prev ? { ...prev, emailVerified: true } : prev);
    return data;
  };

  const resendVerification = async () => {
    const res = await apiFetch('/api/auth/resend-verification', {
      method: 'POST'
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || `Failed to resend verification (HTTP ${res.status})`);
    }
    return data;
  };

  const confirmEmailChange = async (code) => {
    const res = await apiFetch('/api/auth/confirm-email-change', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || `Failed to confirm email change (HTTP ${res.status})`);
    }
    if (data.user) {
      setUser(data.user);
    }
    if (data.csrfToken) {
      setCsrfTokenState(data.csrfToken);
      setCsrfToken(data.csrfToken);
    }
    return data;
  };

  const logout = async () => {
    const signedInUserId = currentUserId || getCurrentUserId();
    window.dispatchEvent(new CustomEvent('techtrek:user-logout', { detail: { userId: signedInUserId, reason: 'logout' } }));
    sessionStorage.removeItem('personal_budget_last_activity');
    setIsAuthenticated(false);
    setUser(null);
    setCsrfTokenState(null);
    setCsrfToken(null);
    setCurrentUserId(null);
    if (typeof window !== 'undefined') {
      window.history.pushState({}, '', '/finance');
    }
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
    } catch (e) {
      // ignore
    }
  };

  return (
    <AuthContext.Provider value={{
      user,
      isAuthenticated,
      currentUserId,
      token: isAuthenticated ? 'cookie-active' : null, // alias for backwards compatibility with BudgetContext
      csrfToken,
      isLoading,
      isAuthModalOpen,
      setIsAuthModalOpen,
      login,
      register,
      getSecurityQuestion,
      forgotPassword,
      resetPassword,
      updateProfile,
      verifyEmail,
      resendVerification,
      confirmEmailChange,
      logout
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
