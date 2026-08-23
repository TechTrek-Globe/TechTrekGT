import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
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

  // 15-min inactivity auto-logout
  useEffect(() => {
    if (!isAuthenticated) return;

    const INACTIVITY_TIMEOUT = 15 * 60 * 1000;
    let timer;

    const resetTimer = () => {
      clearTimeout(timer);
      sessionStorage.setItem('bigworm_last_activity', Date.now().toString());
      timer = setTimeout(() => {
        logout();
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

  const login = async (email, password, rememberMe = false) => {
    const res = await fetch(getApiUrl('/api/auth/login'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email, password, rememberMe })
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || `Login failed (HTTP ${res.status})`);
    }

    setIsAuthenticated(true);
    setUser(data.user);
    return data;
  };

  const logout = useCallback(async () => {
    sessionStorage.removeItem('bigworm_last_activity');
    setIsAuthenticated(false);
    setUser(null);
    try {
      await fetch(getApiUrl('/api/auth/logout'), { method: 'POST', credentials: 'include' });
    } catch (e) {
      // ignore
    }
  }, []);

  return (
    <AuthContext.Provider value={{
      user,
      isAuthenticated,
      isLoading,
      login,
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
