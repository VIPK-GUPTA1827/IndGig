import React, { createContext, useContext, useState, useEffect } from 'react';
import api from '../utils/api';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Check current session on mount via HTTP-only cookie with automatic 401 refresh
  useEffect(() => {
    let isMounted = true;

    const checkAuth = async (retries = 1) => {
      try {
        const data = await api.get('/api/auth/me');

        if (!isMounted) return;

        if (data.success && data.user) {
          setUser(data.user);
        } else {
          setUser(null);
        }
      } catch (err) {
        // Retry once on pure network failure (status === 0 from api wrapper or undefined)
        const isNetworkError = err.status === 0 || err.status === undefined;
        if (isNetworkError && retries > 0) {
          await new Promise((r) => setTimeout(r, 350));
          if (isMounted) return await checkAuth(retries - 1);
        }
        console.error('Session check error:', err);
        if (isMounted) setUser(null);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    checkAuth();
    return () => {
      isMounted = false;
    };
  }, []);

  // Register function
  const register = async ({ name, username, email, password, role }) => {
    const data = await api.post('/api/auth/register', { name, username, email, password, role });
    if (data.requiresVerification) {
      setUser(null);
      localStorage.setItem('pendingEmail', email);
    } else if (data.user) {
      setUser(data.user);
    }
    return data;
  };

  // Login function
  const login = async ({ email, password }) => {
    const data = await api.post('/api/auth/login', { email, password });
    setUser(data.user);
    return data.user;
  };

  // Google Login function
  const loginWithGoogle = async (credential, role = 'client', isSignup = false) => {
    const data = await api.post('/api/auth/google', { credential, role, isSignup });
    setUser(data.user);
    return data.user;
  };

  // GitHub Login function
  const loginWithGitHub = async (code, role = 'freelancer') => {
    const data = await api.post('/api/auth/github', { code, role });
    if (data.user) {
      setUser(data.user);
    }
    return data;
  };

  // Switch role between Client and Freelancer
  const switchRole = async () => {
    const data = await api.post('/api/auth/switch-role');
    if (data.user) setUser(data.user);
    return data.user;
  };

  // Logout function
  const logout = async () => {
    try {
      await api.post('/api/auth/logout');
    } catch (err) {
      console.error('Logout error:', err);
    } finally {
      setUser(null);
    }
  };

  // Update in-memory user directly (safely merges with existing user state)
  const updateUser = (updated) => {
    setUser((prev) => {
      if (!prev) return updated;
      if (typeof updated === 'function') return updated(prev);
      return { ...prev, ...updated };
    });
  };

  return (
    <AuthContext.Provider value={{ user, loading, register, login, loginWithGoogle, loginWithGitHub, switchRole, logout, updateUser, setUser }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export default AuthContext;
