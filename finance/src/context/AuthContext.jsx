import React, { createContext, useContext, useState, useEffect } from 'react';
import { getApiUrl, apiFetch, setCsrfToken, getCsrfToken } from '../utils/api';

/** @type {React.Context<any>} */
const AuthContext = createContext(null);

/**
 * @param {{ children: React.ReactNode }} props
 */
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [householdId, setHouseholdId] = useState(null);
  const [csrfToken, setCsrfTokenState] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

  // Handle global session expiry (token_version bump on other device or timeout)
  useEffect(() => {
    const handleSessionExpired = (e) => {
      console.warn('[auth] Session expired event received:', e.detail);
      sessionStorage.removeItem('personal_budget_last_activity');
      setIsAuthenticated(false);
      setUser(null);
      setHouseholdId(null);
      setCsrfTokenState(null);
      setCsrfToken(null);
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
            setHouseholdId(data.householdId || null);
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
      setHouseholdId(data.householdId);
      if (data.csrfToken) {
        setCsrfTokenState(data.csrfToken);
        setCsrfToken(data.csrfToken);
      }
      setIsAuthModalOpen(false);
      return data;
    } catch (err) {
      if (err.message && err.message !== 'Failed to fetch' && !err.message.includes('NetworkError') && !err.message.includes('fetch')) {
        throw err;
      }
      if (email && password) {
        const localUser = { id: 'local-user', name: email.split('@')[0] || 'Local User', email };
        setIsAuthenticated(true);
        setUser(localUser);
        setHouseholdId('local-household');
        setIsAuthModalOpen(false);
        return { success: true, user: localUser, householdId: 'local-household' };
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
      setHouseholdId(data.householdId);
      if (data.csrfToken) {
        setCsrfTokenState(data.csrfToken);
        setCsrfToken(data.csrfToken);
      }
      setIsAuthModalOpen(false);
      return data;
    } catch (err) {
      if (err.message && err.message !== 'Failed to fetch' && !err.message.includes('NetworkError') && !err.message.includes('fetch')) {
        throw err;
      }
      if (email && password) {
        const localUser = { id: 'local-user', name: name || email.split('@')[0] || 'Local User', email };
        setIsAuthenticated(true);
        setUser(localUser);
        setHouseholdId('local-household');
        setIsAuthModalOpen(false);
        return { success: true, user: localUser, householdId: 'local-household' };
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

  const logout = async () => {
    sessionStorage.removeItem('personal_budget_last_activity');
    setIsAuthenticated(false);
    setUser(null);
    setHouseholdId(null);
    setCsrfTokenState(null);
    setCsrfToken(null);
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
      token: isAuthenticated ? 'cookie-active' : null, // alias for backwards compatibility with BudgetContext
      householdId,
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
