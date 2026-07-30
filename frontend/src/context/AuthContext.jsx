import React, { createContext, useContext, useState, useEffect } from 'react';
import authService from '../services/auth.service';

const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);

  useEffect(() => {
    const isDesktop = !!window.electronAPI?.authGetSession;

    const clearAuth = () => {
      authService.logout();
      setIsAuthenticated(false);
      setUser(null);
    };

    const checkAuth = async () => {
      // Desktop: the main process is the authority. A session exists only if it
      // carries an HMAC main issued for THIS machine, so rewriting localStorage
      // in DevTools gets you nothing.
      if (isDesktop) {
        const session = await authService.restoreSession();
        if (!session) {
          clearAuth();
          setLoading(false);
          return;
        }

        setIsAuthenticated(true);
        setUser(authService.getUserData());
        setLoading(false);

        // Best-effort refresh: catches revoked accounts while online, and is a
        // no-op offline because validateSession falls back to the signed session.
        authService.validateSession()
          .then((stillValid) => {
            if (stillValid) setUser(authService.getUserData());
            else clearAuth();
          })
          .catch(() => { /* offline — the signed session stands */ });
        return;
      }

      // Web: the server is the authority.
      if (!authService.getStoredToken() || !authService.isTokenValid()) {
        setIsAuthenticated(false);
        setUser(null);
        setLoading(false);
        return;
      }

      const isValidServer = await authService.validateSession();
      setIsAuthenticated(isValidServer);
      if (isValidServer) setUser(authService.getUserData());
      else clearAuth();

      setLoading(false);
    };

    checkAuth();

    // Re-check periodically — catches expiry, revoked accounts, and a session
    // file that has been deleted or tampered with since launch.
    const interval = setInterval(async () => {
      if (isDesktop) {
        if (!(await authService.restoreSession())) {
          clearAuth();
          return;
        }
      } else if (!authService.isTokenValid()) {
        clearAuth();
        return;
      }

      if (authService.getUserRole() === 'superadmin') return;

      const isValidServer = await authService.validateSession();
      if (isValidServer) setUser(authService.getUserData());
      else clearAuth();
    }, 60000);

    return () => clearInterval(interval);
  }, []);

  // One path only. The old version fell back to a local "special" login whenever
  // the server call failed for ANY reason, which is how a rejected password could
  // still end up authenticated.
  const login = async (email, password, hardwareId) => {
    try {
      const result = await authService.login(email, password, hardwareId);
      setIsAuthenticated(true);
      setUser(result.user || authService.getUserData());
      return { success: true, data: result };
    } catch (error) {
      const message = error.response?.data?.error || error.message || 'Login failed';
      return { success: false, error: message };
    }
  };

  const logout = () => {
    authService.logout();
    setIsAuthenticated(false);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ 
      isAuthenticated, 
      login, 
      logout, 
      loading,
      user 
    }}>
      {children}
    </AuthContext.Provider>
  );
};

