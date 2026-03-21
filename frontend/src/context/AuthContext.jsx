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
      
      // Try local license first for Standalone/Special builds
      if (!token) {
        const hasLocalLicense = await authService.checkLocalLicense();
        if (hasLocalLicense) {
           setIsAuthenticated(true);
           setUser(authService.getUserData());
           setLoading(false);
           return;
        }
        
        setIsAuthenticated(false);
        setUser(null);
        setLoading(false);
        return;
      }

      const role = authService.getUserRole();
      
      // Superadmin or Special Edition doesn't need external validation
      if (role === 'superadmin' || role === 'special-edition') {
        console.log('🛡️ [AuthContext] Special Edition Detected: Skipping online validation');
        const valid = authService.isTokenValid();
        setIsAuthenticated(valid);
        setUser(valid ? authService.getUserData() : null);
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
      if (role !== 'superadmin' && role !== 'special-edition') {
        // First check local validity (expiry)
        if (!authService.isTokenValid()) {
          setIsAuthenticated(false);
          authService.logout();
          setUser(null);
          return;
        }

        // Then check with server (for deleted users/revoked access)
        const isValidServer = await authService.validateSession();
        if (!isValidServer) {
          setIsAuthenticated(false);
          authService.logout();
          setUser(null);
        } else {
          setUser(authService.getUserData());
        }
      }
    }, 60000);

      return () => clearInterval(interval);
  }, []);

  const login = async (email, password, hardwareId) => {
    try {
      // 1. Try Normal Server Login
      try {
        const result = await authService.login(email, password, hardwareId);
        setIsAuthenticated(true);
        setUser(result.user || authService.getUserData());
        return { success: true, data: result };
      } catch (serverError) {
        // 2. If server failed (offline or invalid), try Special Edition Activation
        console.log('[AuthContext] Server login failed, trying Special Activation...', serverError.message);
        const specialResult = await authService.specialLogin(email, password);
        setIsAuthenticated(true);
        setUser(specialResult.user);
        return { success: true, data: specialResult };
      }
    } catch (error) {
      return { 
        success: false, 
        error: error.message || 'Login failed'
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

