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
    const checkAuth = async () => {
      const token = authService.getStoredToken();
      if (!token) {
        setIsAuthenticated(false);
        setUser(null);
        setLoading(false);
        return;
      }

      const role = authService.getUserRole();
      // Superadmin doesn't need expiry check
      if (role === 'superadmin') {
        setIsAuthenticated(true);
        setUser(authService.getUserData());
        setLoading(false);
        return;
      }
      
      const valid = authService.isTokenValid();
      if (!valid) {
        setIsAuthenticated(false);
        setUser(null);
        setLoading(false);
        return;
      }

      // Token format is valid, now validate with server to get fresh data
      // This ensures we catch expired subscriptions and update model list immediately
      try {
        const isValidServer = await authService.validateSession();
        setIsAuthenticated(isValidServer);
        if (isValidServer) {
          setUser(authService.getUserData());
        } else {
          // Server rejected it (revoked/expired)
          authService.logout();
          setUser(null);
        }
      } catch (e) {
        // Offline or server error - fallback to local validity if allowed
        // specific offline handling could go here, for now we trust local if it was valid
        console.warn('Server validation failed (offline?), falling back to local token');
        setIsAuthenticated(true);
        setUser(authService.getUserData());
      }
      
      setLoading(false);
    };

    checkAuth();
    
    // Check expiry/validity every minute (only for clients, not superadmin)
    const interval = setInterval(async () => {
      const role = authService.getUserRole();
      if (role !== 'superadmin') {
        // First check local validity (expiry)
        if (!authService.isTokenValid()) {
          setIsAuthenticated(false);
          authService.logout();
          setUser(null);
          return;
        }

        // Then check with server (for deleted users/revoked access)
        // This also refreshes the data in localStorage
        const isValidServer = await authService.validateSession();
        if (!isValidServer) {
          setIsAuthenticated(false);
          authService.logout();
          setUser(null);
        } else {
          // Update user state with potentially fresh data from localStorage
          setUser(authService.getUserData());
        }
      }
    }, 60000);

      return () => clearInterval(interval);
  }, []);

  const login = async (email, password, hardwareId) => {
    try {
      const result = await authService.login(email, password, hardwareId);
      setIsAuthenticated(true);
      setUser(result.user || authService.getUserData());
      return { success: true, data: result };
    } catch (error) {
      return { 
        success: false, 
        error: error.response?.data?.error || error.message 
      };
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

