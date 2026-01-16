import React from 'react';
import { useAuth } from '../context/AuthContext';
import Login from './auth/Login';
import Dashboard from './dashboard/Dashboard';
import ClientDashboard from './client/ClientDashboard';
import SuperAdminDashboard from './superadmin/SuperAdminDashboard';
import Loading from './common/Loading';
import authService from '../services/auth.service';
import { isElectron } from '../utils/electron';

const AppContent = () => {
  const { isAuthenticated, loading, user } = useAuth();

  if (loading) {
    return <Loading />;
  }

  if (!isAuthenticated) {
    return <Login />;
  }

  // Check if license is expired (only for clients, not superadmin)
  // Note: This check is already done in AuthContext, so we trust isAuthenticated state
  const role = user?.role || authService.getUserRole();

  // Route based on role
  if (role === 'superadmin') {
    return <SuperAdminDashboard />;
  }

  // Client dashboard - use enhanced dashboard if in Electron (PC app)
  if (isElectron()) {
    return <ClientDashboard />;
  }

  return <Dashboard />;
};

export default AppContent;

