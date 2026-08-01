import React, { createContext, useContext, useState, useEffect } from 'react';

/** @type {React.Context<any>} */
const AuthContext = createContext(null);

const AUTH_TOKEN_KEY = 'personal_budget_auth_token_v1';

/**
 * @param {{ children: React.ReactNode }} props
 */
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(() => {
    return localStorage.getItem(AUTH_TOKEN_KEY) || sessionStorage.getItem(AUTH_TOKEN_KEY) || null;
  });
  const [householdId, setHouseholdId] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

  // Validate token on mount
  useEffect(() => {
    async function verifyCurrentSession() {
      if (!token) {
        setIsLoading(false);
        setIsAuthModalOpen(true);
        return;
      }

      try {
        const res = await fetch('/api/auth/me', {
          headers: { Authorization: `Bearer ${token}` }
        });

        if (res.ok) {
          const data = await res.json();
          setUser(data.user);
          setHouseholdId(data.householdId);
        } else {
          // Token expired or invalid
          localStorage.removeItem(AUTH_TOKEN_KEY);
          sessionStorage.removeItem(AUTH_TOKEN_KEY);
          setToken(null);
          setUser(null);
          setHouseholdId(null);
          setIsAuthModalOpen(true);
        }
      } catch (err) {
        console.error('Failed to verify authentication session:', err);
        localStorage.removeItem(AUTH_TOKEN_KEY);
        sessionStorage.removeItem(AUTH_TOKEN_KEY);
        setToken(null);
        setUser(null);
        setHouseholdId(null);
        setIsAuthModalOpen(true);
      } finally {
        setIsLoading(false);
      }
    }

    verifyCurrentSession();
  }, [token]);

  // Inactivity timeout handler
  useEffect(() => {
    if (!token) return;

    const INACTIVITY_TIMEOUT = 15 * 60 * 1000; // 15 minutes
    
    const interval = setInterval(() => {
      const lastActivity = localStorage.getItem('personal_budget_last_activity');
      if (lastActivity) {
        const timeElapsed = Date.now() - parseInt(lastActivity, 10);
        if (timeElapsed > INACTIVITY_TIMEOUT) {
          logout();
          alert('You have been logged out due to inactivity.');
        }
      } else {
        localStorage.setItem('personal_budget_last_activity', Date.now().toString());
      }
    }, 10000);

    const updateActivity = () => {
      localStorage.setItem('personal_budget_last_activity', Date.now().toString());
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
  }, [token]);

  /**
   * @param {string} email
   * @param {string} password
   * @param {boolean} rememberMe
   */
  const login = async (email, password, rememberMe = false) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Login failed');
    }

    if (rememberMe) {
      localStorage.setItem(AUTH_TOKEN_KEY, data.token);
    } else {
      sessionStorage.setItem(AUTH_TOKEN_KEY, data.token);
    }
    localStorage.setItem('personal_budget_saved_email', email);
    setToken(data.token);
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
      body: JSON.stringify({ name, email, password })
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Registration failed');
    }

    if (rememberMe) {
      localStorage.setItem(AUTH_TOKEN_KEY, data.token);
    } else {
      sessionStorage.setItem(AUTH_TOKEN_KEY, data.token);
    }
    localStorage.setItem('personal_budget_saved_email', email);
    setToken(data.token);
    setUser(data.user);
    setHouseholdId(data.householdId);
    setIsAuthModalOpen(false);
    return data;
  };

  const logout = () => {
    localStorage.removeItem(AUTH_TOKEN_KEY);
    sessionStorage.removeItem(AUTH_TOKEN_KEY);
    localStorage.removeItem('personal_budget_last_activity');
    setToken(null);
    setUser(null);
    setHouseholdId(null);
  };

  return (
    <AuthContext.Provider value={{
      user,
      token,
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
