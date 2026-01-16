import React from 'react';
import { AuthProvider } from './context/AuthContext';
import { ModuleProvider } from './context/ModuleContext';
import AppContent from './components/AppContent';

function App() {
  return (
    <AuthProvider>
      <ModuleProvider>
        <AppContent />
      </ModuleProvider>
    </AuthProvider>
  );
}

export default App;

