import React, { createContext, useContext, useState, useEffect } from 'react';

/** @type {React.Context<any>} */
const AuthContext = createContext(null);

/**
 * @param {{ children: React.ReactNode }} props
 */
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [householdId, setHouseholdId] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

  // Validate session on mount via HttpOnly cookie
  useEffect(() => {
    async function verifyCurrentSession() {
      try {
        const res = await fetch('/api/auth/me');
        if (res.ok) {
          const data = await res.json();
          setUser(data.user);
          setHouseholdId(data.householdId);
          setIsAuthenticated(true);
        } else {
          setUser(null);
          setHouseholdId(null);
          setIsAuthenticated(false);
          setIsAuthModalOpen(true);
        }
      } catch (err) {
        console.error('Failed to verify authentication session:', err);
        setUser(null);
        setHouseholdId(null);
        setIsAuthenticated(false);
        setIsAuthModalOpen(true);
      } finally {
        setIsLoading(false);
      }
    }

    verifyCurrentSession();
  }, []);

  // Inactivity timeout handler
  useEffect(() => {
    if (!isAuthenticated) return;

    const INACTIVITY_TIMEOUT = 15 * 60 * 1000; // 15 minutes
    
    const interval = setInterval(() => {
      const lastActivity = sessionStorage.getItem('personal_budget_last_activity');
      if (lastActivity) {
        const timeElapsed = Date.now() - parseInt(lastActivity, 10);
        if (timeElapsed > INACTIVITY_TIMEOUT) {
          logout();
          setIsAuthModalOpen(true);
        }
      } else {
        sessionStorage.setItem('personal_budget_last_activity', Date.now().toString());
      }
    }, 10000);

    const updateActivity = () => {
      sessionStorage.setItem('personal_budget_last_activity', Date.now().toString());
    };

    const activityEvents = ['mousedown', 'keydown', 'scroll', 'touchstart', 'click'];
    activityEvents.forEach(event => {
      window.addEventListener(event, updateActivity);
    });

    updateActivity();

    return () => {
      clearInterval(interval);
      activityEvents.forEach(event => {
        window.removeEventListener(event, updateActivity);
      });
    };
  }, [isAuthenticated]);

  /**
   * @param {string} email
   * @param {string} password
   * @param {boolean} rememberMe
   */
  const login = async (email, password, rememberMe = false) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, rememberMe })
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Login failed');
    }

    setIsAuthenticated(true);
    setUser(data.user);
    setHouseholdId(data.householdId);
    setIsAuthModalOpen(false);
    return data;
  };

  /**
   * @param {string} name
   * @param {string} email
   * @param {string} password
   * @param {boolean} rememberMe
   */
  const register = async (name, email, password, rememberMe = false) => {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password, rememberMe })
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Registration failed');
    }

    setIsAuthenticated(true);
    setUser(data.user);
    setHouseholdId(data.householdId);
    setIsAuthModalOpen(false);
    return data;
  };

  const logout = async () => {
    sessionStorage.removeItem('personal_budget_last_activity');
    setIsAuthenticated(false);
    setUser(null);
    setHouseholdId(null);
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch (e) {
      // ignore
    }
  };

  return (
    <AuthContext.Provider value={{
      user,
      token: isAuthenticated ? 'cookie-active' : null, // alias for backwards compatibility with BudgetContext
      householdId,
      isLoading,
      isAuthModalOpen,
      setIsAuthModalOpen,
      login,
      register,
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
