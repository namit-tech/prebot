import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ModuleProvider } from './context/ModuleContext';
import AppContent from './components/AppContent';
import PrivacyPolicy from './components/common/PrivacyPolicy';

function App() {
  return (
    <Router>
      <AuthProvider>
        <ModuleProvider>
          <Routes>
            <Route path="/privacy-policy" element={
              <div className="min-h-screen bg-gray-50 py-12 px-4">
                <PrivacyPolicy />
              </div>
            } />
            <Route path="*" element={<AppContent />} />
          </Routes>
        </ModuleProvider>
      </AuthProvider>
    </Router>
  );
}

export default App;

