import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { getApiUrl } from '../utils/api';

/** @type {React.Context<any>} */
const AuthContext = createContext(null);

/**
 * @param {{ children: React.ReactNode }} props
 */
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isRememberMe, setIsRememberMe] = useState(() => {
    try {
      return sessionStorage.getItem('outpost_remember_me') === 'true';
    } catch (_) {
      return false;
    }
  });

  // Restore session on mount
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(getApiUrl('/api/auth/me'), {
          credentials: 'include'
        });
        if (res.ok) {
          const data = await res.json().catch(() => ({}));
          if (data.user) {
            setUser(data.user);
            setIsAuthenticated(true);
          }
        }
      } catch (e) {
        // No session
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  // Session Policy Decision (T-14 / SEC-020):
  // Option (a) - Honour rememberMe. When rememberMe is checked, the 15-minute client inactivity
  // timeout is bypassed to align with the 30-day session cookie and allow 30-60 minute background
  // auto-sync timers (eBay/VineScout) to execute without premature session termination.
  const logoutRef = useRef(null);

  useEffect(() => {
    if (!isAuthenticated) return;
    if (isRememberMe) return; // Honour rememberMe: no 15-minute idle logout

    const INACTIVITY_TIMEOUT = 15 * 60 * 1000;
    let timer;

    const resetTimer = () => {
      clearTimeout(timer);
      try {
        sessionStorage.setItem('outpost_last_activity', Date.now().toString());
      } catch (_) {}
      timer = setTimeout(() => {
        logoutRef.current?.();
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
  }, [isAuthenticated, isRememberMe]);

  /**
   * @param {string} email
   * @param {string} password
   * @param {boolean} rememberMe
   */
  const login = async (email, password, rememberMe = false) => {
    const res = await fetch(getApiUrl('/api/auth/login'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email, password, rememberMe })
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (data.requiresReset || data.forcePasswordReset) {
        window.location.href = `${getApiUrl('/reset-password')}?email=${encodeURIComponent(email)}&reason=legacy_hash`;
        return { requiresReset: true };
      }
      throw new Error(data.error || `Login failed (HTTP ${res.status})`);
    }

    try {
      sessionStorage.setItem('outpost_remember_me', String(rememberMe));
    } catch (_) {}
    setIsRememberMe(Boolean(rememberMe));
    setIsAuthenticated(true);
    setUser(data.user);
    return data;
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
    const res = await fetch(getApiUrl('/api/auth/register'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ name, email, password, securityQuestion, securityAnswer, rememberMe })
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || `Registration failed (HTTP ${res.status})`);
    }

    setIsAuthenticated(true);
    setUser(data.user);
    return data;
  };

  const getSecurityQuestion = async (email) => {
    const res = await fetch(getApiUrl('/api/auth/security-question'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email })
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || `Failed to fetch security question (HTTP ${res.status})`);
    }
    return data;
  };

  /**
   * Primary step: request a single-use reset token sent via email (T-12)
   */
  const requestPasswordReset = async (email) => {
    const res = await fetch(getApiUrl('/api/auth/forgot-password'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email })
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || `Failed to request password reset (HTTP ${res.status})`);
    }
    return data;
  };

  /**
   * Secondary verification step: verifies security answer AND active emailed token (T-12 / Item 4)
   * Server validates both and sets HttpOnly reset_session cookie with Path=/
   */
  const forgotPassword = async (email, securityAnswer, token = '') => {
    const res = await fetch(getApiUrl('/api/auth/forgot-password'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email, securityAnswer, token: token || undefined })
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || `Failed to verify security answer (HTTP ${res.status})`);
    }
    return data;
  };

  const resetPassword = async (email, newPassword) => {
    const res = await fetch(getApiUrl('/api/auth/reset-password'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      // token is NOT sent in the body - the server reads the HttpOnly reset_session cookie (T-12 / Item 5)
      body: JSON.stringify({ email, newPassword })
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || `Failed to reset password (HTTP ${res.status})`);
    }
    return data;
  };

  const updateProfile = async (profileData) => {
    const res = await fetch(getApiUrl('/api/auth/update-profile'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(profileData)
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || `Failed to update profile (HTTP ${res.status})`);
    }
    if (data.user) {
      setUser(data.user);
    }
    return data;
  };

  const logout = async (all = false) => {
    try {
      sessionStorage.removeItem('outpost_last_activity');
      sessionStorage.removeItem('outpost_remember_me');
    } catch (_) {}
    setIsRememberMe(false);
    setIsAuthenticated(false);
    setUser(null);
    if (typeof window !== 'undefined') {
      window.history.pushState({}, '', '/outpost');
    }
    try {
      await fetch(getApiUrl('/api/auth/logout'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ all: Boolean(all) })
      });
    } catch (e) {
      // ignore
    }
  };

  logoutRef.current = logout;

  return (
    <AuthContext.Provider value={{
      user,
      isAuthenticated,
      isLoading,
      isRememberMe,
      login,
      register,
      getSecurityQuestion,
      requestPasswordReset,
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
